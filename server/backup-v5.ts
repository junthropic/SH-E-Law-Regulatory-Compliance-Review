import { backup as snapshot } from "node:sqlite";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, lstatSync, readdirSync, openSync, closeSync, unlinkSync, renameSync, rmSync,fsyncSync } from "node:fs";
import { join, resolve, dirname, parse } from "node:path";
import { Store, sha } from "./store.js";
import { encryptedBackup, decodeBackup, restoreEncrypted } from "./backup-v3.js";
import { backupV4Layer, restoreV4Layer } from "./backup-v4.js";
import { ProtectedPayloads, type PayloadKey } from "./protected-payload-v4.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
const extras = ["v4_trace_history","v4_merge_conflicts","v5_send_intents","v5_waste_proposals","v5_migrations","v6_records","v6_review_bindings","v6_training_cases","v6_training_current","v6_attachment_records","v6_migration_routes","v7_safety_manager_cases","v7_safety_manager_current","v7_trace_routes"];
const definitions:Record<string,string>={
  v4_trace_history:"seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,review TEXT,body TEXT",
  v4_merge_conflicts:"seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,synthetic INTEGER,target TEXT,body TEXT",
  v5_send_intents:"id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT",
  v5_waste_proposals:"id TEXT,tenant TEXT,synthetic INTEGER,version INTEGER,payload TEXT,PRIMARY KEY(id,tenant,synthetic,version)",
  v5_migrations:"id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT",
  v6_records:"id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,source TEXT,source_hash TEXT,body TEXT",
  v6_review_bindings:"review TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT",
  v6_training_cases:"id TEXT,tenant TEXT,synthetic INTEGER,version INTEGER,payload TEXT,body TEXT,PRIMARY KEY(id,tenant,synthetic,version)",
  v6_training_current:"id TEXT,tenant TEXT,synthetic INTEGER,body TEXT,PRIMARY KEY(id,tenant,synthetic)",
  v6_attachment_records:"id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT",
  v6_migration_routes:"id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT",
  v7_safety_manager_cases:"id TEXT,tenant TEXT,synthetic INTEGER,version INTEGER,payload TEXT,body TEXT,PRIMARY KEY(id,tenant,synthetic,version)",
  v7_safety_manager_current:"id TEXT,tenant TEXT,synthetic INTEGER,body TEXT,PRIMARY KEY(id,tenant,synthetic)",
  v7_trace_routes:"review TEXT,tenant TEXT,synthetic INTEGER,body TEXT,PRIMARY KEY(review,tenant,synthetic)",
};
// Managed fact cases are restored as a new version that needs a fresh independent review (no restored approval).
const caseTables=[["v6_training_cases","v6_training_current"],["v7_safety_manager_cases","v7_safety_manager_current"]] as const;
// Public search cache (collection-journal-v2): classified, not exported; it can be collected again from the public source.
const excludedPublicCache=["v2_collection_jobs","v2_collection_pages"];
// v8 local logs (AI send log, deletion log): like the general audit log, kept on this PC only and not exported.
const excludedLocalLogs=["v8_ai_send_log","v8_deletion_log"];
const allowed = new Set(["reviews","documents","evidence","sources","rules","audit","settings","sqlite_sequence","v2_migrations","v2_entities","v2_dependencies","v2_approvals","v2_invalidations","v3_review_events","v3_legacy_links","v3_shadow","v3_jobs","v3_job_units","v3_job_events","v3_quota","v3_egress","v3_derivations","v3_source_events","v3_restore_runs","v4_payloads","v4_captures","v4_provenance","v4_grants","v4_call_permits",...extras]);
export function backupClassification(table:string):"backed_up"|"excluded_public_cache"|"excluded_local_log"|"rebuilt_index"|"unclassified" {
  return allowed.has(table)?"backed_up":excludedPublicCache.includes(table)?"excluded_public_cache":excludedLocalLogs.includes(table)?"excluded_local_log":table.startsWith("evidence_fts")?"rebuilt_index":"unclassified";
}
function access(p:Principal,key:PayloadKey) { assertPrincipal(p);if(!p.roles.includes("backup_operator")||key.bytes.length!==32)throw Error("백업 권한·키 필요"); }
function safeDirectory(path:string) {
  const abs=resolve(path),root=parse(abs).root;let cur=abs;
  while(cur!==root){if(existsSync(cur)&&lstatSync(cur).isSymbolicLink())throw Error("연결 경로 복원 금지");cur=dirname(cur);}
  if(abs.slice(root.length).split(/[\\/]/).some(s=>!s||/[.: ]$|:/.test(s)))throw Error("복원 경로 확인 필요");
  return abs;
}
function seal(value:unknown,p:Principal,key:PayloadKey) {
  const raw=Buffer.from(JSON.stringify(value));if(raw.length>128_000_000)throw Error("통합 백업 크기 초과");
  const head={format:"she-generation-v5",tenant:p.tenant,synthetic:p.synthetic,keyId:key.id},iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key.bytes,iv);c.setAAD(Buffer.from(JSON.stringify(head)));
  const bytes=Buffer.concat([c.update(raw),c.final()]);return {...head,iv:iv.toString("base64"),tag:c.getAuthTag().toString("base64"),data:bytes.toString("base64")};
}
type Archive=ReturnType<typeof seal>;
function open(input:Archive,p:Principal,key:PayloadKey) {
  access(p,key);
  if(input.format!=="she-generation-v5"||input.tenant!==p.tenant||input.synthetic!==p.synthetic||input.keyId!==key.id||input.data.length>180_000_000)throw Error("통합 백업 영역·키·용량 확인 필요");
  try { const d=createDecipheriv("aes-256-gcm",key.bytes,Buffer.from(input.iv,"base64"));d.setAAD(Buffer.from(JSON.stringify({format:input.format,tenant:p.tenant,synthetic:p.synthetic,keyId:key.id})));d.setAuthTag(Buffer.from(input.tag,"base64"));return JSON.parse(Buffer.concat([d.update(Buffer.from(input.data,"base64")),d.final()]).toString()); }catch{throw Error("통합 백업 복호화·무결성 확인 필요");}
}
export async function backupGeneration(store:Store,p:Principal,key:PayloadKey,sourceDigest:string,fault?:(phase:string)=>void) {
  access(p,key);if(!/^[a-f0-9]{64}$/.test(sourceDigest))throw Error("소스 버전 확인 필요");
  // One immutable DB snapshot is shared by both existing exporters. Original bytes are read by exact hash; deletion/change aborts export.
  const base=join(store.dir,"v5-snapshots");mkdirSync(base,{recursive:true});const dir=mkdtempSync(join(base,"snapshot-"));
  let snap:Store|undefined;
  try {
    fault?.("snapshot_begin");await snapshot(store.db,join(dir,"private.sqlite"));fault?.("snapshot_captured");snap=new Store(dir);snap.dir=store.dir;
    new LegacyBridge(snap,"v4");new ProtectedPayloads(snap,key);new PayloadProvenance(snap);
    snap.db.exec("CREATE TABLE IF NOT EXISTS v4_captures(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,job TEXT,body TEXT)");
    const legacy=await encryptedBackup(snap,p,key.bytes,key.id),decoded=decodeBackup(legacy,p,key.bytes),layer=backupV4Layer(snap,p,key);
    const tables=snap.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all() as {name:string,sql:string}[];
    const reviewIds=new Set(decoded.legacy.reviews.map((r:any)=>r.id));
    const other:Record<string,{sql:string,rows:any[]}>= {};
    for(const table of tables.filter(t=>extras.includes(t.name))) {
      const cols=(snap.db.prepare(`PRAGMA table_info(${table.name})`).all() as any[]).map(r=>r.name);
      const rows=(snap.db.prepare(`SELECT * FROM ${table.name} WHERE tenant=?`).all(p.tenant) as any[]).filter(r=>cols.includes("synthetic")?r.synthetic===+p.synthetic:reviewIds.has(r.review));
      other[table.name]={sql:table.sql,rows};
    }
    const omissions=[...decoded.missingOriginals.map((s:string)=>"원본 누락:"+s),...tables.filter(t=>!allowed.has(t.name)&&!excludedPublicCache.includes(t.name)&&!excludedLocalLogs.includes(t.name)&&!t.name.startsWith("evidence_fts")).map(t=>"미분류 테이블:"+t.name)];
    for(const t of ["reviews","documents"])if(snap.all(t).length!==decoded.legacy[t].length)omissions.push("영역 소유권 미연결:"+t);
    for(const t of ["sources","rules"])if(snap.all(t).length)omissions.push("공개 자료 별도 복구 경로:"+t);
    const manifest={version:"v5.1",sourceDigest,runtime:process.version,createdAt:new Date().toISOString(),tableInventory:tables.map(t=>t.name),
      includes:["영역에 연결된 legacy 검토·문서·증빙·원본","v2 자료·정책 버전·승인 이력","v3 작업·단위·이력","v4 암호 원문·파생·전송 승인 이력","v4/v5 검토 trace·후보·전송 intent·이관 이력"],
      excludes:["API·OAuth·암호키","다른 tenant·가상 구분 영역","설정 인증정보·실행 lease·계정 공통 호출 permit","로컬 일반 감사 로그"],
      excludedTables:[...tables.filter(t=>excludedPublicCache.includes(t.name)).map(t=>({table:t.name,classification:"공개 캐시 — 제외(재수집 가능)"})),...tables.filter(t=>excludedLocalLogs.includes(t.name)).map(t=>({table:t.name,classification:"로컬 기록 — 제외(이 PC에만 보관)"}))],omissions,
      files:[...Object.entries(decoded.compliance.originals).map(([hash,value])=>({hash,bytes:Buffer.from(value as string,"base64").length,representation:"v2-original"})),...decoded.legacy.documents.map((d:any)=>({hash:d.hash,bytes:Buffer.from(d.original,"base64").length,representation:d.type})),...Object.entries(decoded.annexes).map(([ref,value])=>({ref,hash:sha(Buffer.from(value as string,"base64")),bytes:Buffer.from(value as string,"base64").length,representation:"legal-attachment"}))],
      hashes:{legacy:sha(JSON.stringify(legacy)),layer:sha(JSON.stringify(layer)),other:sha(JSON.stringify(other))},completeApplicationBackup:omissions.length===0};
    fault?.("manifest_build");return {archive:seal({manifest,legacy,layer,other},p,key),manifest};
  }finally{snap?.close();if(dirname(resolve(dir))!==resolve(base))throw Error("임시 백업 정리 경로 확인 필요");rmSync(dir,{recursive:true,force:true});}
}
export function restoreGeneration(target:string,p:Principal,key:PayloadKey,archive:Archive,fault?:(phase:string)=>void) {
  const b=open(archive,p,key),root=safeDirectory(target);mkdirSync(root,{recursive:true});
  if(readdirSync(root).some(n=>!["generations","current.json","restore.lock"].includes(n)))throw Error("빈 격리 복원 폴더 필요");
  for(const n of readdirSync(root))if(lstatSync(join(root,n)).isSymbolicLink())throw Error("연결 경로 복원 금지");
  for(const name of ["legacy","layer","other"])if(sha(JSON.stringify(b[name]))!==b.manifest.hashes[name])throw Error("통합 항목 해시 불일치");
  const legacyFiles=decodeBackup(b.legacy,p,key.bytes),expectedFiles=[...Object.entries(legacyFiles.compliance.originals).map(([hash,value])=>({hash,bytes:Buffer.from(value as string,"base64").length,representation:"v2-original"})),...legacyFiles.legacy.documents.map((d:any)=>({hash:d.hash,bytes:Buffer.from(d.original,"base64").length,representation:d.type})),...Object.entries(legacyFiles.annexes).map(([ref,value])=>({ref,hash:sha(Buffer.from(value as string,"base64")),bytes:Buffer.from(value as string,"base64").length,representation:"legal-attachment"}))];
  if(sha(JSON.stringify(expectedFiles))!==sha(JSON.stringify(b.manifest.files)))throw Error("원본 manifest 길이·해시·참조 불일치");
  const digest=sha(JSON.stringify(archive)),pointer=join(root,"current.json");
  if(existsSync(pointer)){const old=JSON.parse(readFileSync(pointer,"utf8"));if(old.archiveHash!==digest)throw Error("이미 복원된 다른 자료를 덮어쓸 수 없습니다.");return old;}
  const lock=join(root,"restore.lock");let fd:number;
  try{fd=openSync(lock,"wx");writeFileSync(fd,JSON.stringify({pid:process.pid,digest,target:root,nonce:randomUUID(),createdAt:new Date().toISOString()}));fsyncSync(fd);}catch{throw Error("동시 복원 또는 중단된 복원 잠금 확인 필요");}
  let store:Store|undefined,pointerTemporaryOwned=false;
  try {
    const generation=randomUUID(),dir=join(root,"generations",generation);safeDirectory(dir);fault?.("stage_write");mkdirSync(dir,{recursive:true});store=new Store(dir);
    restoreEncrypted(store,p,b.legacy,key.bytes);fault?.("legacy_restored");
    new ProtectedPayloads(store,key);new PayloadProvenance(store);store.db.exec("CREATE TABLE IF NOT EXISTS v4_captures(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,job TEXT,body TEXT)");
    restoreV4Layer(store,p,key,b.layer);fault?.("protected_restored");
    for(const [name,x] of Object.entries(b.other) as [string,any][]) {
      if(!extras.includes(name))throw Error("통합 복원 테이블 확인 필요");
      store.db.exec(`CREATE TABLE IF NOT EXISTS ${name}(${definitions[name]})`);
      const cols=(store.db.prepare(`PRAGMA table_info(${name})`).all() as any[]).map(c=>c.name);
      for(const r of x.rows) {
        if(r.tenant!==p.tenant||("synthetic"in r&&r.synthetic!==+p.synthetic))throw Error("통합 자료 영역 불일치");
        if(name==="v5_send_intents")r.body=JSON.stringify({...JSON.parse(r.body),state:"unknown",leaseUntil:0,restored:true});
        store.db.prepare(`INSERT INTO ${name}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).run(...cols.map(c=>r[c]));
      }
    }
    fault?.("manifest_validate");
    const vault=new ProtectedPayloads(store,key,()=>0);
    for(const r of store.db.prepare("SELECT id,purpose FROM v4_payloads WHERE tenant=? AND synthetic=?").all(p.tenant,+p.synthetic) as any[])vault.get(p,r.id,r.purpose);
    for(const r of store.db.prepare("SELECT body FROM v4_captures").all() as any[]){const c=JSON.parse(r.body);if(sha(vault.get(p,c.rawRef,"raw"))!==c.hash)throw Error("원문 참조 무결성 확인 필요");}
    for(const r of store.db.prepare("SELECT body FROM v4_provenance").all() as any[]){const node=JSON.parse(r.body);for(const parent of node.parents||[])if(!store.db.prepare("SELECT 1 FROM v4_provenance WHERE id=? AND tenant=? AND synthetic=?").get(parent,p.tenant,+p.synthetic))throw Error("파생 자료 부모 참조 누락");}
    if(b.other.v5_waste_proposals){
      const current=store.db.prepare("SELECT * FROM v5_waste_proposals WHERE tenant=? AND synthetic=? ORDER BY version DESC").all(p.tenant,+p.synthetic) as any[],seen=new Set<string>();
      for(const r of current){if(seen.has(r.id))continue;seen.add(r.id);const proposal=JSON.parse(vault.get(p,r.payload,"unit").toString());
        if(!store.db.prepare("SELECT 1 FROM v4_captures WHERE id=? AND tenant=? AND synthetic=?").get(proposal.captureId,p.tenant,+p.synthetic))throw Error("후보 응답 참조 누락");
        const next={...proposal,version:r.version+1,review:null,historicalReview:proposal.review,restored:true,legalApproval:false};
        const payload=new ProtectedPayloads(store,key).put(p,"unit",Buffer.from(JSON.stringify(next)),7*86400000);
        store.db.prepare("INSERT INTO v5_waste_proposals VALUES(?,?,?,?,?)").run(r.id,p.tenant,+p.synthetic,next.version,payload);
      }
    }
    if((store.db.prepare("PRAGMA integrity_check").get() as any).integrity_check!=="ok")throw Error("복원 DB 무결성 실패");
    for(const [cases,current] of caseTables)if(b.other[cases]){const rows=store.db.prepare(`SELECT * FROM ${cases} WHERE tenant=? AND synthetic=? ORDER BY version DESC`).all(p.tenant,+p.synthetic) as any[],seen=new Set<string>();
      for(const r of rows){if(seen.has(r.id))continue;seen.add(r.id);const data=JSON.parse(vault.get(p,r.payload,"unit").toString()),next={...data,version:r.version+1,input:{...data.input,independentFactsReviewed:null},review:null,historicalReview:data.review,restored:true,legalApproval:false};
        const payload=new ProtectedPayloads(store,key).put(p,"unit",Buffer.from(JSON.stringify(next)),7*86400000);store.db.prepare(`INSERT INTO ${cases} VALUES(?,?,?,?,?,?)`).run(r.id,p.tenant,+p.synthetic,next.version,payload,r.body);
        store.db.prepare(`UPDATE ${current} SET body=? WHERE id=? AND tenant=? AND synthetic=?`).run(JSON.stringify({id:r.id,version:next.version,hash:sha(JSON.stringify(next))}),r.id,p.tenant,+p.synthetic);}}
    fault?.("db_flush");store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");store.close();store=undefined;fault?.("before_publish");
    const result={generation,archiveHash:digest,manifest:b.manifest,completeApplicationRestore:b.manifest.completeApplicationBackup,paused:true,egress:"denied",currentApprovals:false,production:false};
    const temporary=join(root,"current.json.tmp");fault?.("pointer_write");const pointerFD=openSync(temporary,"wx");pointerTemporaryOwned=true;try{writeFileSync(pointerFD,JSON.stringify(result));fault?.("pointer_flush");fsyncSync(pointerFD);}finally{closeSync(pointerFD);}
    fault?.("pointer_rename");renameSync(temporary,pointer);pointerTemporaryOwned=false;return result;
  }finally{store?.close();if(pointerTemporaryOwned&&existsSync(join(root,"current.json.tmp")))unlinkSync(join(root,"current.json.tmp"));closeSync(fd!);unlinkSync(lock);}
}
export function openGeneration(target:string) {
  const root=safeDirectory(target),b=JSON.parse(readFileSync(join(root,"current.json"),"utf8"));
  if(!/^[0-9a-f-]{36}$/.test(b.generation))throw Error("복원 세대 참조 확인 필요");
  return new Store(safeDirectory(join(root,"generations",b.generation)));
}
// Explicit recovery for an isolated target only. Never removes published data or another live process's lock.
export function recoverGenerationLock(target:string,archiveHash:string) {
  const root=safeDirectory(target),lock=join(root,"restore.lock");
  if(!/^[a-f0-9]{64}$/.test(archiveHash)||!existsSync(lock))throw Error("복원 잠금·자료 식별 확인 필요");
  if(lstatSync(lock).isSymbolicLink()||lstatSync(lock).size>2000)throw Error("복원 잠금 경로 확인 필요");
  const owner=JSON.parse(readFileSync(lock,"utf8"));if(owner.digest!==archiveHash||owner.target!==root||!Number.isSafeInteger(owner.pid)||owner.pid<=0)throw Error("다른 복원 잠금을 해제할 수 없습니다.");
  let dead=false;try{process.kill(owner.pid,0);}catch(e){dead=(e as NodeJS.ErrnoException).code==="ESRCH";}
  if(!dead)throw Error("복원 프로세스가 실행 중이거나 종료 여부 미확인");
  unlinkSync(lock);return {lockRecovered:true,generationsDeleted:0,publishedDataChanged:false};
}

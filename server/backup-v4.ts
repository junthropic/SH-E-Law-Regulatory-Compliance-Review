import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {Store} from "./store.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import type {PayloadKey} from "./protected-payload-v4.js";

// Explicit v4 data-layer archive, not a substitute for the v3 application backup.
// SQLite stores encrypted raw bytes atomically; this archive has no filesystem publication paths.
const tables=["v4_payloads","v4_captures","v4_provenance","v4_grants"] as const;
function authority(p:Principal,key:PayloadKey) {
  assertPrincipal(p);if(!p.roles.includes("backup_operator")||key.bytes.length!==32)throw Error("백업 권한·키 확인 필요");
}
export function backupV4Layer(store:Store,p:Principal,key:PayloadKey) {
  authority(p,key);
  store.db.exec("SAVEPOINT v4_backup");
  try {
    const rows=Object.fromEntries(tables.map(t=>[t,store.db.prepare(`SELECT * FROM ${t} WHERE tenant=? AND synthetic=?`).all(p.tenant,+p.synthetic)]));
    const body=Buffer.from(JSON.stringify({scope:{tenant:p.tenant,synthetic:p.synthetic},rows,completeApplicationBackup:false,
      excludes:["암호키","기존 v2·v3 업무 자료","실행 중 작업 자동 재개","외부 전송 허용 자동 복원"]}));
    if(body.length>64_000_000)throw Error("백업 용량 초과");
    const iv=randomBytes(12),aad=JSON.stringify(["v4-layer",p.tenant,p.synthetic,key.id]);
    const cipher=createCipheriv("aes-256-gcm",key.bytes,iv);cipher.setAAD(Buffer.from(aad));
    const data=Buffer.concat([cipher.update(body),cipher.final()]);
    store.db.exec("RELEASE v4_backup");
    return {version:"v4-layer",tenant:p.tenant,synthetic:p.synthetic,keyId:key.id,encrypted:true,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64"),completeApplicationBackup:false};
  }catch(e){store.db.exec("ROLLBACK TO v4_backup; RELEASE v4_backup");throw e;}
}
export function restoreV4Layer(store:Store,p:Principal,key:PayloadKey,input:ReturnType<typeof backupV4Layer>,fault?:()=>void) {
  authority(p,key);
  if(input.version!=="v4-layer"||input.tenant!==p.tenant||input.synthetic!==p.synthetic||input.keyId!==key.id||input.data.length>90_000_000)throw Error("백업 영역·키·용량 확인 필요");
  let content:any;
  try {
    const decipher=createDecipheriv("aes-256-gcm",key.bytes,Buffer.from(input.iv,"base64"));
    decipher.setAAD(Buffer.from(JSON.stringify([input.version,p.tenant,p.synthetic,key.id])));decipher.setAuthTag(Buffer.from(input.tag,"base64"));
    content=JSON.parse(Buffer.concat([decipher.update(Buffer.from(input.data,"base64")),decipher.final()]).toString());
  }catch{throw Error("백업 무결성·복호화 확인 필요");}
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for(const table of tables) {
      if((store.db.prepare(`SELECT count(*) n FROM ${table} WHERE tenant=? AND synthetic=?`).get(p.tenant,+p.synthetic) as any).n)throw Error("복원 대상 영역이 비어 있지 않습니다.");
      const rows=content.rows[table];if(!Array.isArray(rows))throw Error("백업 항목 확인 필요");
      const cols=(store.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c=>c.name).filter(c=>c!=="seq");
      const remapped=new Map<number,number>();
      for(const row of rows){
        if(row.tenant!==p.tenant||row.synthetic!==+p.synthetic||cols.some(c=>!(c in row)))throw Error("백업 행 영역 확인 필요");
        if(table==="v4_payloads"&&JSON.parse(row.body).keyId!==key.id)throw Error("자료 복호화 키 별도 확보 필요");
        const value={...row};
        if(table==="v4_grants") {
          const b=JSON.parse(row.body);
          value.body=JSON.stringify({...b,archiveSequence:row.seq,archiveSupersedes:b.supersedes,supersedes:b.supersedes?remapped.get(b.supersedes)??null:null});
        }
        const inserted=store.db.prepare(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).run(...cols.map(c=>value[c]));
        if(table==="v4_grants")remapped.set(row.seq,Number(inserted.lastInsertRowid));
      }
    }
    // Preserve historical events and append denials. Never reactivate restored grants.
    const grants=store.db.prepare("SELECT node,purpose,provider,MAX(seq) seq FROM v4_grants WHERE tenant=? AND synthetic=? GROUP BY node,purpose,provider").all(p.tenant,+p.synthetic) as any[];
    for(const r of grants)store.db.prepare("INSERT INTO v4_grants(tenant,synthetic,node,purpose,provider,body) VALUES(?,?,?,?,?,?)").run(p.tenant,+p.synthetic,r.node,r.purpose,r.provider,JSON.stringify({action:"deny",supersedes:r.seq,actor:p.id,basis:"복원 후 현재 외부 전송 권한 재검토 필요",expiresAt:"2099-01-01T00:00:00Z",at:new Date().toISOString(),legalBasisApproved:false}));
    // Queue payloads are retained only as encrypted historical data; no job is restored/started.
    fault?.();store.db.exec("COMMIT");return {restored:true,completeApplicationRestore:false,jobsStarted:0,egress:"denied",legalApproval:false};
  }catch(e){store.db.exec("ROLLBACK");throw e;}
}

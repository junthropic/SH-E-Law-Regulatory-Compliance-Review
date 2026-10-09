import {it,expect,beforeAll} from "vitest";
import {randomBytes,createCipheriv,createDecipheriv} from "node:crypto";
import {existsSync,writeFileSync,readFileSync,mkdirSync,unlinkSync,symlinkSync} from "node:fs";
import {join} from "node:path";
import {testStore,request} from "./helpers.js";
import {writer} from "./v2-fixture.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {PayloadProvenance} from "../server/provenance-v4.js";
import {backupGeneration,restoreGeneration,openGeneration,recoverGenerationLock} from "../server/backup-v5.js";
import {newReview} from "../server/reviews.js";
import {LegacyBridge} from "../server/legacy-bridge-v3.js";
import {ingestDocument} from "../server/documents.js";
import {sha} from "../server/store.js";
const p={...writer,roles:["writer","backup_operator"] as typeof writer.roles},key={id:"synthetic-v6-backup",bytes:randomBytes(32)};
let emptyArchive:Awaited<ReturnType<typeof backupGeneration>>;
beforeAll(async()=>{const f=testStore();try{emptyArchive=await backupGeneration(f.store,p,key,sha("synthetic-v6"));}finally{f.clean();}},30000);
const phases=["stage_write","legacy_restored","protected_restored","manifest_validate","db_flush","pointer_write","pointer_flush","pointer_rename"];
it.each(phases.flatMap(phase=>["ENOSPC","EACCES","EPERM","EIO"].map(code=>[phase,code])))("V6-B01: %s 단계 %s 주입 시 공개 포인터 없음·잠금 정리·재복원",async(phase,code)=>{
  const f=testStore(),target=join(f.store.dir,"isolated-restore");try{const b=emptyArchive;expect(()=>restoreGeneration(target,p,key,b.archive,at=>{if(at===phase)throw Object.assign(Error(code),{code});})).toThrow(code);
    expect(existsSync(join(target,"current.json"))).toBe(false);expect(existsSync(join(target,"current.json.tmp"))).toBe(false);expect(existsSync(join(target,"restore.lock"))).toBe(false);expect(()=>openGeneration(target)).toThrow();
    const r=restoreGeneration(target,p,key,b.archive);expect(r.paused).toBe(true);expect(r.currentApprovals).toBe(false);expect(r.egress).toBe("denied");const fresh=openGeneration(target);fresh.close();
  }finally{f.clean();}
},30000);
it("V6-B02: 이미 공개된 유효 세대는 다른 archive 실패로 교체되지 않음",async()=>{const f=testStore(),target=join(f.store.dir,"restored");try{const a=emptyArchive,r=restoreGeneration(target,p,key,a.archive),old=readFileSync(join(target,"current.json"));const b={archive:mutate(a.archive,body=>body.manifest.sourceDigest=sha("after"))};expect(()=>restoreGeneration(target,p,key,b.archive)).toThrow("다른 자료");expect(readFileSync(join(target,"current.json"))).toEqual(old);expect(restoreGeneration(target,p,key,a.archive).generation).toBe(r.generation);}finally{f.clean();}},30000);
it.each(["snapshot_begin","snapshot_captured","manifest_build"])("V6-B03: 백업 %s 실패에도 운영 대상 아닌 원본·DB를 그대로 보존",async phase=>{const f=testStore();try{const v=new ProtectedPayloads(f.store,key),ref=v.put(p,"raw",Buffer.from("synthetic private snapshot"),60000);await expect(backupGeneration(f.store,p,key,sha("synthetic"),at=>{if(at===phase)throw Error("EIO");})).rejects.toThrow("EIO");expect(v.get(p,ref,"raw").toString()).toBe("synthetic private snapshot");}finally{f.clean();}},30000);
it.each(["replace","delete"])("V6-B04: snapshot 이후 원본 %s는 hash 대조 실패로 보류",async mode=>{const f=testStore();try{const d=await ingestDocument(f.store,"synthetic.txt",Buffer.from("가상 자료의 원본입니다.")),r=newReview({...request(),documentIds:[d.id]});f.store.saveReview(r);new LegacyBridge(f.store,"v4").attach(p,r);
  await expect(backupGeneration(f.store,p,key,sha("synthetic"),phase=>{if(phase==="snapshot_captured"){const path=join(f.store.dir,"originals",d.id+d.type);if(mode==="replace")writeFileSync(path,"changed");else unlinkSync(path);}})).rejects.toThrow();
}finally{f.clean();}},30000);
it("V6-B05: archive 잘림·키버전·다른 영역·살아있는 잠금과 ADS 경로 거부",async()=>{const f=testStore();try{const b=emptyArchive,target=join(f.store.dir,"lock-test");mkdirSync(target);writeFileSync(join(target,"restore.lock"),JSON.stringify({pid:process.pid,digest:sha(JSON.stringify(b.archive)),target}));expect(()=>restoreGeneration(target,p,key,b.archive)).toThrow("잠금");expect(()=>recoverGenerationLock(target,sha(JSON.stringify(b.archive)))).toThrow("실행 중");expect(()=>recoverGenerationLock(target,sha("wrong archive"))).toThrow("다른 복원");
  for(const k of [{...key,id:"wrong"},{...key,bytes:randomBytes(32)},{...key,bytes:Buffer.alloc(0)}])expect(()=>restoreGeneration(join(f.store.dir,"bad-key"),p,k,b.archive)).toThrow();expect(()=>restoreGeneration(join(f.store.dir,"bad-tenant"),{...p,tenant:"other"},key,b.archive)).toThrow();expect(()=>restoreGeneration(join(f.store.dir,"bad-archive"),p,key,{...b.archive,data:b.archive.data.slice(0,-8)})).toThrow();expect(()=>restoreGeneration(join(f.store.dir,"dir:stream"),p,key,b.archive)).toThrow("경로");
}finally{f.clean();}},30000);
function mutate(archive:any,change:(body:any)=>void){const head={format:archive.format,tenant:p.tenant,synthetic:p.synthetic,keyId:key.id},d=createDecipheriv("aes-256-gcm",key.bytes,Buffer.from(archive.iv,"base64"));d.setAAD(Buffer.from(JSON.stringify(head)));d.setAuthTag(Buffer.from(archive.tag,"base64"));const body=JSON.parse(Buffer.concat([d.update(Buffer.from(archive.data,"base64")),d.final()]).toString());change(body);const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key.bytes,iv);c.setAAD(Buffer.from(JSON.stringify(head)));const data=Buffer.concat([c.update(Buffer.from(JSON.stringify(body))),c.final()]);return {...head,iv:iv.toString("base64"),tag:c.getAuthTag().toString("base64"),data:data.toString("base64")};}
it("V6-B06: 암호 봉투가 정상이어도 manifest의 참조·길이 변경은 거부",async()=>{const f=testStore();try{const b=emptyArchive,bad=mutate(b.archive,x=>x.manifest.files.push({hash:sha("fake"),bytes:99,representation:".txt"}));expect(()=>restoreGeneration(join(f.store.dir,"bad-manifest"),p,key,bad)).toThrow("manifest");}finally{f.clean();}},30000);
it("V6-B07: 부모 누락은 복원 공개 이전에 실패",async()=>{const f=testStore();try{const g=new PayloadProvenance(f.store);g.input(p,"synthetic-source");f.store.db.prepare("UPDATE v4_provenance SET body=?").run(JSON.stringify({digest:sha("synthetic"),parents:["missing-parent"],transformer:"synthetic",requiresRelease:false}));const b=await backupGeneration(f.store,p,key,sha("synthetic")),target=join(f.store.dir,"missing-parent");expect(()=>restoreGeneration(target,p,key,b.archive)).toThrow("부모");expect(existsSync(join(target,"current.json"))).toBe(false);}finally{f.clean();}},30000);
it("V6-B08: 실제 Windows junction과 상위 연결 경로는 복원 대상으로 거부",()=>{const f=testStore();try{const actual=join(f.store.dir,"owned-target"),link=join(f.store.dir,"owned-link");mkdirSync(actual);symlinkSync(actual,link,"junction");expect(()=>restoreGeneration(link,p,key,emptyArchive.archive)).toThrow("연결 경로");expect(()=>restoreGeneration(join(link,"nested"),p,key,emptyArchive.archive)).toThrow("연결 경로");expect(existsSync(join(actual,"current.json"))).toBe(false);}finally{f.clean();}});

import {ProtectedMigration} from "./migration-v5.js";
import {ProtectedCollection} from "./collection-v4.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import {sha} from "./store.js";
import type {LookupServiceId,PublicQuery} from "../shared/public-apis.js";
import {validatePublicQuery} from "./public-apis.js";

// No deletion/cutover. Host must separately release the protected query before resume.
export class MigrationResume {
  readonly migration:ProtectedMigration;
  constructor(readonly collection:ProtectedCollection){this.migration=new ProtectedMigration(collection.payloads);collection.store.db.exec("CREATE TABLE IF NOT EXISTS v6_migration_routes(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT)");}
  async prepare(p:Principal,id:string,fault?:(phase:string)=>void){assertPrincipal(p);const jobs=this.collection.jobs,old=jobs.get(p,id);if(old.requester!==p.id||old.state==="running")throw Error("이관 대상 주체·실행 상태 확인 필요");
    const previous=this.collection.store.db.prepare("SELECT body FROM v6_migration_routes WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as any;
    if(previous)return JSON.parse(previous.body);
    if(!["paused","failed","cancelled","succeeded"].includes(old.state))jobs.control(p,id,"pause");
    const copy=this.migration.copyJob(p,id);fault?.("copy_verified");const preserved=JSON.parse(this.collection.payloads.get(p,copy.ref,"unit").toString());
    if(sha(JSON.stringify(preserved))!==copy.hash)throw Error("보호 복사본 해시 불일치");
    const input=preserved.job&&JSON.parse(preserved.job.body).input,service=input.provider as LookupServiceId;let query:PublicQuery;
    if(input.query.code){const data=JSON.parse(this.collection.payloads.get(p,input.query.code,"queue").toString());if(data.service!==service)throw Error("보호 작업 provider 불일치");query=data.query;}
    else query=validatePublicQuery(service,input.query);
    const prep=this.collection.prepare(p,service,{...query,page:old.cursor}),key=await this.collection.credential(service);if(!key)throw Error("격리 자격 공급 필요");
    // Atomic routing/checkpoint switch; a crash leaves a verified copy, never a plaintext fallback worker.
    const db=this.collection.store.db;db.exec("BEGIN IMMEDIATE");
    try{const newId="migrated-"+sha(JSON.stringify([p.tenant,p.synthetic,id])).slice(0,40),idem=this.collection.payloads.reference(p,newId);
      const j={...old,id:newId,input:{...old.input,query:{code:prep.ref},credentialRef:this.collection.payloads.reference(p,key)},state:"paused",owner:null,leaseUntil:0,eligible:null,fence:0,attempts:0,startedAt:null,finishedAt:null,reason:"migration_review"};
      db.prepare("INSERT INTO v3_jobs VALUES(?,?,?,?,?,?,?,?,?,?)").run(j.id,p.tenant,+p.synthetic,idem,sha(JSON.stringify(j.input)),j.state,null,0,0,JSON.stringify(j));
      for(const u of preserved.units){const unit=JSON.parse(u.body);if(unit.data!==undefined){let data=unit.data;if(data?.protectedRef)data=JSON.parse(this.collection.payloads.get(p,data.protectedRef,"unit").toString());unit.data={protectedRef:this.collection.payloads.put(p,"unit",Buffer.from(JSON.stringify(data)),7*86400000)};}
        db.prepare("INSERT INTO v3_job_units VALUES(?,?,?,?)").run(j.id,unit.id,sha(JSON.stringify(unit)),JSON.stringify(unit));}
      const route={id,jobId:j.id,copyId:copy.id,copyHash:copy.hash,queryRef:prep.ref,queryNode:prep.node,protectedCopyVerified:true,readPathMigrated:true,queueResumeVerified:false,allTraceCovered:false,plaintextRemovalComplete:false,deletionAuthorized:false,sourcePlaintextRetained:true};
      fault?.("before_switch");db.prepare("INSERT INTO v6_migration_routes VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(route));db.exec("COMMIT");fault?.("after_switch");return route;
    }catch(e){if(db.isTransaction)db.exec("ROLLBACK");throw e;}}
  resume(p:Principal,id:string){const db=this.collection.store.db,row=db.prepare("SELECT body FROM v6_migration_routes WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as any;if(!row)throw Error("보호 읽기 경로 없음");const b=JSON.parse(row.body),data=JSON.parse(this.collection.payloads.get(p,b.queryRef,"queue").toString());
    this.collection.provenance.check(p,b.queryNode,JSON.stringify({service:data.service,query:data.query}),"query",data.service);return this.collection.jobs.control(p,b.jobId,"resume");}
  observe(p:Principal,id:string){const db=this.collection.store.db,row=db.prepare("SELECT body FROM v6_migration_routes WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as any;if(!row)throw Error("이관 경로 없음");const b=JSON.parse(row.body),job=this.collection.jobs.get(p,b.jobId);b.queueResumeVerified=job.state==="succeeded";db.prepare("UPDATE v6_migration_routes SET body=? WHERE id=?").run(JSON.stringify(b),id);return {...b,state:job.state};}
}

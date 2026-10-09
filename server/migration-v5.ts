import { sha } from "./store.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { ComplianceRepository, assertPrincipal, type Principal, type Ref } from "./compliance-v2.js";
const inventory=["v3_jobs","v3_job_units","v3_job_events","v3_shadow","v3_legacy_links","v3_review_events","v3_source_events","v2_entities","audit","settings"];
export class ProtectedMigration {
  constructor(readonly vault:ProtectedPayloads){vault.store.db.exec("CREATE TABLE IF NOT EXISTS v5_migrations(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT)");}
  dryRun(p:Principal) {
    assertPrincipal(p);if(!p.roles.includes("collection_operator"))throw Error("이관 검토 권한 필요");
    return inventory.map(table=>({table,exists:!!this.vault.store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),deletionAuthorized:false,plaintextRemovalComplete:false}));
  }
  copyJob(p:Principal,jobId:string) {
    this.dryRun(p);if(!p.roles.includes("writer"))throw Error("이관 저장 권한 필요");
    const db=this.vault.store.db;db.exec("BEGIN IMMEDIATE");
    try {
      const row=db.prepare("SELECT * FROM v3_jobs WHERE id=? AND tenant=? AND synthetic=?").get(jobId,p.tenant,+p.synthetic) as any;
      if(!row)throw Error("이관 작업 영역 확인 필요");
      if(row.state==="running")throw Error("실행 중 작업은 이관할 수 없습니다.");
      const original=JSON.stringify({job:row,units:db.prepare("SELECT * FROM v3_job_units WHERE job=?").all(jobId),events:db.prepare("SELECT * FROM v3_job_events WHERE job=?").all(jobId)});
      const hash=sha(original),id=sha(JSON.stringify([p.tenant,p.synthetic,jobId,hash]));
      const prior=db.prepare("SELECT body FROM v5_migrations WHERE id=?").get(id) as {body:string}|undefined;
      if(prior){const b=JSON.parse(prior.body);if(sha(this.vault.get(p,b.ref,"unit"))!==hash)throw Error("이관 복사본 해시 불일치");db.exec("COMMIT");return b;}
      const parent=new PayloadProvenance(this.vault.store).input(p,original),ref=this.vault.put(p,"unit",Buffer.from(original),7*86400000);
      if(sha(this.vault.get(p,ref,"unit"))!==hash)throw Error("이관 원문 대조 실패");
      const b={id,jobId,hash,ref,parent,state:"protected_copy_verified",resumeVerified:false,plaintextRemovalComplete:false,deletionAuthorized:false,legalHoldReviewed:false,ttlLegalBasis:null,at:new Date().toISOString()};
      db.prepare("INSERT INTO v5_migrations VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(b));db.exec("COMMIT");return b;
    }catch(e){db.exec("ROLLBACK");throw e;}
  }
  copyReviewTrace(p:Principal,reviewId:string) {
    this.dryRun(p);if(!p.roles.includes("writer"))throw Error("이관 저장 권한 필요");
    const db=this.vault.store.db;db.exec("BEGIN IMMEDIATE");
    try {
      const row=db.prepare("SELECT body FROM v3_shadow WHERE tenant=? AND review=?").get(p.tenant,reviewId) as {body:string}|undefined;
      if(!row||JSON.parse(row.body).synthetic!==p.synthetic)throw Error("검토 이관 영역 확인 필요");
      const hash=sha(row.body),id=sha(JSON.stringify([p.tenant,p.synthetic,"review",reviewId,hash]));
      const old=db.prepare("SELECT body FROM v5_migrations WHERE id=?").get(id) as {body:string}|undefined;
      if(old){const b=JSON.parse(old.body);if(sha(this.vault.get(p,b.ref,"unit"))!==hash)throw Error("이관 대조 실패");db.exec("COMMIT");return b;}
      const ref=this.vault.put(p,"unit",Buffer.from(row.body),7*86400000),parent=new PayloadProvenance(this.vault.store).input(p,row.body);
      if(sha(this.vault.get(p,ref,"unit"))!==hash)throw Error("검토 이관 해시 불일치");
      const b={id,reviewId,hash,ref,parent,state:"protected_copy_verified",plaintextRemovalComplete:false,deletionAuthorized:false,resumeVerified:false,ttlLegalBasis:null};
      db.prepare("INSERT INTO v5_migrations VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(b));db.exec("COMMIT");return b;
    }catch(e){db.exec("ROLLBACK");throw e;}
  }
}
export function resolveLegacyDigest(vault:ProtectedPayloads,p:Principal,digest:string,ref?:Ref) {
  assertPrincipal(p);if(!p.roles.includes("egress_reviewer")||!ref)return {state:"denied",reason:"정확한 자료·버전·해시를 복구하지 못했습니다.",grantMigrated:false};
  const entity=new ComplianceRepository(vault.store).resolve(p,ref);
  if(entity.body.kind!=="evidence"||entity.body.originalHash!==digest)throw Error("구형 해시와 정확한 증빙 참조 불일치");
  const node=new PayloadProvenance(vault.store).source(p,ref);
  return {state:"requires_new_review",node,grantMigrated:false};
}

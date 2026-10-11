import {sha} from "./store.js";
import {ProtectedPayloads} from "./protected-payload-v4.js";
import {ProtectedMigration} from "./migration-v5.js";
import {LegacyBridge} from "./legacy-bridge-v3.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";

// v3_shadow review traces: protected copy → hash/area check → read switch. After the switch the reader never
// falls back to the plaintext row; the plaintext v3_shadow row is kept (no deletion) and only its hash is compared
// so a later change to it is detected as stale instead of being served.
export class ProtectedTraceReader {
  readonly migration:ProtectedMigration;
  constructor(readonly vault:ProtectedPayloads){this.migration=new ProtectedMigration(vault);
    vault.store.db.exec("CREATE TABLE IF NOT EXISTS v7_trace_routes(review TEXT,tenant TEXT,synthetic INTEGER,body TEXT,PRIMARY KEY(review,tenant,synthetic))");}
  migrate(p:Principal,reviewId:string) {
    assertPrincipal(p);if(!p.synthetic)throw Error("이번 이관은 확정된 합성 자료만 대상입니다.");
    const copy=this.migration.copyReviewTrace(p,reviewId),back=this.vault.get(p,copy.ref,"unit").toString();
    if(sha(back)!==copy.hash)throw Error("보호 trace 해시 불일치");
    const t=JSON.parse(back);if(t.synthetic!==p.synthetic||t.reviewId!==reviewId)throw Error("보호 trace 영역·검토 불일치");
    const route={review:reviewId,migrationId:copy.id,hash:copy.hash,ref:copy.ref,parent:copy.parent,readSwitched:true,plaintextRetained:true,plaintextRemovalComplete:false,deletionAuthorized:false,at:new Date().toISOString()};
    this.vault.store.db.prepare("INSERT INTO v7_trace_routes VALUES(?,?,?,?) ON CONFLICT(review,tenant,synthetic) DO UPDATE SET body=excluded.body").run(reviewId,p.tenant,+p.synthetic,JSON.stringify(route));
    return route;
  }
  trace(p:Principal,reviewId:string):{trace:any;source:"protected"|"legacy"} {
    assertPrincipal(p);const db=this.vault.store.db;
    const row=db.prepare("SELECT body FROM v7_trace_routes WHERE review=? AND tenant=? AND synthetic=?").get(reviewId,p.tenant,+p.synthetic) as {body:string}|undefined;
    if(!row)return {trace:new LegacyBridge(this.vault.store,"v4").trace(p,reviewId),source:"legacy"}; // not migrated yet
    const b=JSON.parse(row.body),copy=this.vault.get(p,b.ref,"unit").toString();
    if(sha(copy)!==b.hash)throw Error("보호 trace 해시 불일치");
    const current=db.prepare("SELECT body FROM v3_shadow WHERE tenant=? AND review=?").get(p.tenant,reviewId) as {body:string}|undefined;
    if(!current||sha(current.body)!==b.hash)throw Error("이관 후 원본 trace 변경: 재이관 필요");
    const t=JSON.parse(copy);if(t.synthetic!==p.synthetic)throw Error("자료 영역 불일치");
    return {trace:t,source:"protected"};
  }
}

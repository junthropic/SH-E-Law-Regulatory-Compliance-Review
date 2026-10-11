import { randomUUID } from "node:crypto";
import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal, type Ref, ComplianceRepository } from "./compliance-v2.js";
import { EgressDenied } from "./egress-v3.js";
// Per-tenant "current version" pointers of managed fact cases (v6 training, v7 safety manager).
const caseCurrentTables = ["v6_training_current", "v7_safety_manager_current"] as const;
type CaseCurrentTable = typeof caseCurrentTables[number];
export class PayloadProvenance {
  constructor(readonly store: Store) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS v4_provenance(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT);
      CREATE TABLE IF NOT EXISTS v4_grants(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,synthetic INTEGER,node TEXT,purpose TEXT,provider TEXT,body TEXT);`);
  }
  private read(p: Principal, id: string) {
    assertPrincipal(p);
    const row=this.store.db.prepare("SELECT body FROM v4_provenance WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as {body:string}|undefined;
    if(!row) throw new EgressDenied();const b=JSON.parse(row.body);
    if(b.sourceIdentity){const s=b.sourceIdentity;if(!["documents","reviews","evidence",...caseCurrentTables].includes(s.table))throw new EgressDenied();
      const value=this.storedValue(p,s.table,s.id);
      if(!value||sha(JSON.stringify(value))!==s.objectHash)throw new EgressDenied();}
    return b;
  }
  source(p: Principal, ref: Ref) {
    const e=new ComplianceRepository(this.store).resolve(p,ref);
    if(e.body.kind!=="evidence") throw new EgressDenied();
    return this.insert(p,{digest:e.body.originalHash,ref,parents:[],transformer:"evidence-v4",requiresRelease:!e.body.externalAllowed});
  }
  // Server entrypoints record the actual submitted input; this is not approval.
  input(p: Principal, serialized: string) { return this.insert(p,{digest:sha(serialized),parents:[],transformer:"user-input-v4",requiresRelease:true}); }
  // Used only by trusted host bindings. Source content/version is read again on every grant check.
  private storedValue(p:Principal,table:string,id:string):unknown {
    if(!(caseCurrentTables as readonly string[]).includes(table))return this.store.get(table as "documents"|"reviews"|"evidence",id);
    const row=this.store.db.prepare(`SELECT body FROM ${table} WHERE id=? AND tenant=? AND synthetic=?`).get(id,p.tenant,+p.synthetic) as {body:string}|undefined;
    return row?JSON.parse(row.body):null;
  }
  bindStored(p:Principal,table:"documents"|"reviews"|"evidence"|CaseCurrentTable,id:string,serialized:string) {
    const value=this.storedValue(p,table,id);
    if(!value)throw new EgressDenied();
    return this.insert(p,{digest:sha(serialized),parents:[],transformer:"stored-source-v6",requiresRelease:true,sourceIdentity:{table,id,objectHash:sha(JSON.stringify(value)),originalHash:(value as any).hash??null,version:(value as any).version??(value as any).updatedAt??null}});
  }
  private insert(p: Principal, b: object) {
    assertPrincipal(p);if(!p.roles.includes("writer")) throw new EgressDenied();
    const id=randomUUID();this.store.db.prepare("INSERT INTO v4_provenance VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(b));return id;
  }
  derive(p: Principal, serialized: string, parents: string[], transformer: string) {
    if(!parents.length||parents.length>100||!/^[\w.-]{1,100}$/.test(transformer)) throw new EgressDenied();
    parents.forEach(id=>this.read(p,id));
    return this.insert(p,{digest:sha(serialized),parents:[...new Set(parents)],transformer,requiresRelease:false});
  }
  event(p: Principal, node: string, purpose: string, provider: string, action: "grant"|"deny"|"revoke"|"release", basis: string, expiresAt: string, supersedes?: number) {
    const root=this.read(p,node);
    if(!p.roles.includes("egress_reviewer")||basis.trim().length<15||!(Date.parse(expiresAt)>Date.now())||!purpose||!provider) throw new EgressDenied();
    const old=this.latest(p,node,purpose,provider);
    if(old && supersedes!==old.seq) throw Error("전송 승인 버전 충돌");
    if(action==="grant"&&(root.requiresRelease||old&&["deny","revoke"].includes(old.body.action))) throw Error("정확한 자료에 대한 해제 사건 필요");
    const result=this.store.db.prepare("INSERT INTO v4_grants(tenant,synthetic,node,purpose,provider,body) VALUES(?,?,?,?,?,?)").run(p.tenant,+p.synthetic,node,purpose,provider,JSON.stringify({action,basis,expiresAt,supersedes:old?.seq??null,actor:p.id,at:new Date().toISOString(),legalBasisApproved:false}));
    return Number(result.lastInsertRowid);
  }
  private latest(p:Principal,node:string,purpose:string,provider:string) {
    const r=this.store.db.prepare("SELECT seq,body FROM v4_grants WHERE tenant=? AND synthetic=? AND node=? AND purpose=? AND provider=? ORDER BY seq DESC LIMIT 1").get(p.tenant,+p.synthetic,node,purpose,provider) as {seq:number,body:string}|undefined;
    return r?{seq:r.seq,body:JSON.parse(r.body)}:undefined;
  }
  check(p:Principal,node:string,serialized:string,purpose:string,provider:string) {
    if(this.read(p,node).digest!==sha(serialized)) throw new EgressDenied();
    return this.checkReference(p,node,purpose,provider);
  }
  checkReference(p:Principal,node:string,purpose:string,provider:string) {
    const stack=[node], seen=new Set<string>(), versions:number[]=[];
    while(stack.length) {
      const id=stack.pop()!;if(seen.has(id))continue;if(seen.size>=1000)throw new EgressDenied();seen.add(id);
      const n=this.read(p,id), grant=this.latest(p,id,purpose,provider);
      if(grant) { if(!["grant","release"].includes(grant.body.action)||Date.parse(grant.body.expiresAt)<=Date.now())throw new EgressDenied();versions.push(grant.seq); }
      // Every source is independently authorized. A grant on a summary cannot release its parents.
      if(!n.parents.length&&!grant) throw new EgressDenied();
      stack.push(...n.parents);
    }
    return {versions,checkedAt:Date.now(),recallAlreadySent:false};
  }
  needsManagedRead(p:Principal,node:string){const stack=[node],seen=new Set<string>(),registered=!!this.store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='v6_records'").get();
    while(stack.length){const id=stack.pop()!;if(seen.has(id))continue;if(seen.size>=1000)throw new EgressDenied();seen.add(id);const n=this.read(p,id);
      if(n.sourceIdentity||n.ref&&n.requiresRelease||registered&&this.store.db.prepare("SELECT 1 FROM v6_records WHERE tenant=? AND synthetic=? AND json_extract(body,'$.node')=?").get(p.tenant,+p.synthetic,id))return true;stack.push(...n.parents);}
    return false;}
  async send<T>(p:Principal,node:string,serialized:string,purpose:string,provider:string,send:()=>Promise<T>) {
    this.check(p,node,serialized,purpose,provider);
    // No await between final permission check and starting the I/O. Cross-process revocation remains a documented race.
    return send();
  }
}

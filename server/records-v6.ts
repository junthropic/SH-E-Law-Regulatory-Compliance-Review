import { randomUUID } from "node:crypto";
import { Store,sha } from "./store.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { assertPrincipal,type Principal } from "./compliance-v2.js";
import { EgressDenied } from "./egress-v3.js";
import { hasPayloadExecution,currentPayloadExecution,type Execution } from "./egress-execution-v4.js";

export class ManagedRecords {
  readonly graph:PayloadProvenance;
  constructor(readonly vault:ProtectedPayloads){this.graph=new PayloadProvenance(vault.store);vault.store.db.exec(`CREATE TABLE IF NOT EXISTS v6_records(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,source TEXT,source_hash TEXT,body TEXT);
    CREATE TABLE IF NOT EXISTS v6_review_bindings(review TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT);`);}
  bindInput(p:Principal,value:unknown,digest:string) {
    if(!/^[a-f0-9]{64}$/.test(digest))throw new EgressDenied();const serialized=JSON.stringify(value),node=this.graph.input(p,serialized),ref=this.vault.put(p,"unit",Buffer.from(serialized),7*86400000),id=randomUUID();
    this.vault.store.db.prepare("INSERT INTO v6_records VALUES(?,?,?,?,?,?)").run(id,p.tenant,+p.synthetic,"input-"+id,digest,JSON.stringify({id,node,ref,sourceHash:sha(serialized)}));return {id,node,ref};
  }
  // Host-only binding: HTTP callers cannot supply a URL, parent set, tenant or public/private declaration.
  bindDocument(p:Principal,id:string) {
    assertPrincipal(p);const d=this.vault.store.document(id);if(!d)throw new EgressDenied();
    const value=JSON.stringify(d),node=this.graph.bindStored(p,"documents",id,value),ref=this.vault.put(p,"unit",Buffer.from(value),7*86400000),record=randomUUID();
    const b={id:record,source:{id,version:d.createdAt,originalHash:d.hash,objectHash:sha(value)},node,ref};
    this.vault.store.db.prepare("INSERT INTO v6_records VALUES(?,?,?,?,?,?)").run(record,p.tenant,+p.synthetic,id,d.hash,JSON.stringify(b));return b;
  }
  document(p:Principal,record:string) {
    const row=this.vault.store.db.prepare("SELECT body FROM v6_records WHERE id=? AND tenant=? AND synthetic=?").get(record,p.tenant,+p.synthetic) as {body:string}|undefined;if(!row)throw new EgressDenied();
    const b=JSON.parse(row.body),bytes=this.vault.get(p,b.ref,"unit");this.graph.check(p,b.node,bytes.toString(),"read","local");return {binding:b,document:JSON.parse(bytes.toString())};
  }
  bindReview(p:Principal,id:string,parents:string[]) {
    assertPrincipal(p);if(!p.roles.includes("writer")||!parents.length)throw new EgressDenied();
    const r=this.vault.store.review(id);if(!r)throw new EgressDenied();
    const old=this.vault.store.db.prepare("SELECT tenant,synthetic FROM v6_review_bindings WHERE review=?").get(id) as any;if(old&&(old.tenant!==p.tenant||old.synthetic!==+p.synthetic))throw new EgressDenied();
    const serialized=JSON.stringify(r);for(const node of parents){const row=this.vault.store.db.prepare("SELECT body FROM v4_provenance WHERE id=? AND tenant=? AND synthetic=?").get(node,p.tenant,+p.synthetic) as {body:string}|undefined;if(!row)throw new EgressDenied();}
    const own=this.graph.bindStored(p,"reviews",id,serialized),node=this.graph.derive(p,serialized,[own,...parents],"review-build-v6"),body={node,own,serializedHash:sha(serialized),parents};
    this.vault.store.db.prepare("INSERT INTO v6_review_bindings VALUES(?,?,?,?) ON CONFLICT(review) DO UPDATE SET tenant=excluded.tenant,synthetic=excluded.synthetic,body=excluded.body").run(id,p.tenant,+p.synthetic,JSON.stringify(body));return body;
  }
}
export function knownManagedContextRequired(store:Store,hashes:string[]) {
  if(!store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='v6_records'").get())return;
  const context=currentPayloadExecution();
  for(const hash of hashes){const rows=store.db.prepare("SELECT tenant,synthetic,body FROM v6_records WHERE source_hash=?").all(hash) as any[];if(!rows.length)continue;
    if(!context||context.gate.store!==store)throw new EgressDenied();const owned=rows.filter(r=>r.tenant===context.principal.tenant&&r.synthetic===+context.principal.synthetic);if(!owned.length)throw new EgressDenied();
    context.parents=[...new Set([...context.parents,...owned.map(r=>JSON.parse(r.body).node)])];}
}
export function guardManagedExport(store:Store,id:string,context?:Execution) {
  if(!store.db.prepare("SELECT 1 FROM sqlite_master WHERE name='v6_review_bindings'").get())return;
  const row=store.db.prepare("SELECT tenant,synthetic,body FROM v6_review_bindings WHERE review=?").get(id) as any;if(!row)return;
  if(!context||context.gate.store!==store||row.tenant!==context.principal.tenant||row.synthetic!==+context.principal.synthetic)throw new EgressDenied();
  const r=store.review(id),b=JSON.parse(row.body),serialized=JSON.stringify(r);
  if(sha(serialized)!==b.serializedHash)throw new EgressDenied();
  context.gate.check(context.principal,b.node,serialized,"read","local");context.gate.check(context.principal,b.node,serialized,"document","local");
  return context.gate.derive(context.principal,serialized,[b.node],"local-export-v6");
}

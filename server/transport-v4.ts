import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Store, sha } from "./store.js";
import { type Principal, assertPrincipal } from "./compliance-v2.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { SendAdmissions } from "./admission-v5.js";

export type CallContext = {
  store: Store; payloads: ProtectedPayloads; principal: Principal;
  job: string; service: string; queryRef: string; deadline: number;
  // Host-owned mapping: operation/credential can differ from the parent job.
  account: (url: URL) => { group: string; intervalMs: number };
  authorize: (url: URL) => void;
};
const contexts = new AsyncLocalStorage<CallContext>();
export const withCallContext = <T>(c: CallContext, fn: () => Promise<T>) => contexts.run(c, fn);
export class CallPermits {
  constructor(readonly store: Store) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS v4_call_permits(id TEXT PRIMARY KEY,owner TEXT,fence INTEGER,until_ms INTEGER,next_ms INTEGER);`);
  }
  acquire(id: string, owner: string, now: number, leaseMs: number, intervalMs: number) {
    if (!/^[a-f0-9]{64}$/.test(id) || !Number.isFinite(intervalMs) || intervalMs < 0) throw Error("호출 그룹 확인 필요");
    this.store.db.prepare("INSERT OR IGNORE INTO v4_call_permits VALUES(?,?,0,0,0)").run(id,"");
    const r = this.store.db.prepare("UPDATE v4_call_permits SET owner=?,fence=fence+1,until_ms=?,next_ms=? WHERE id=? AND until_ms<=? AND next_ms<=? RETURNING fence").get(owner,now+leaseMs,now+intervalMs,id,now,now) as {fence:number}|undefined;
    return r?.fence;
  }
  release(id: string, owner: string, fence: number) {
    this.store.db.prepare("UPDATE v4_call_permits SET until_ms=0 WHERE id=? AND owner=? AND fence=?").run(id,owner,fence);
  }
}
export async function beginCall(url: URL, timeoutMs: number, signal?: AbortSignal) {
  const c = contexts.getStore();
  if (!c) return undefined; // Compatibility transport has no private-source authority; v4 services require a context.
  assertPrincipal(c.principal);
  c.authorize(url);
  const a = c.account(url), owner = randomUUID(), id = c.payloads.reference(c.principal,a.group), permits = new CallPermits(c.store);
  let fence: number | undefined;
  while (fence === undefined) {
    signal?.throwIfAborted();
    if (Date.now() + timeoutMs > c.deadline) throw Error("호출 시간 예산 부족");
    fence = permits.acquire(id,owner,Date.now(),timeoutMs+5000,a.intervalMs);
    if (fence === undefined) await new Promise(r=>setTimeout(r,20));
  }
  try { assertPrincipal(c.principal); c.authorize(url); signal?.throwIfAborted(); }
  catch(e) { permits.release(id,owner,fence); throw e; }
  c.store.db.exec(`CREATE TABLE IF NOT EXISTS v4_captures(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,job TEXT,body TEXT);`);
  const began = Date.now();
  let admission: ReturnType<SendAdmissions["admit"]>;
  try { admission = new SendAdmissions(c.store).admit(c.principal,url.href,()=>c.authorize(url),timeoutMs+1000); }
  catch(e) { permits.release(id,owner,fence); throw e; }
  let completeResponse=false;
  let captureId: string | undefined;
  return {
    signal: admission.signal,
    start: admission.start,
    capture(bytes: Buffer, response: Response | undefined, complete: boolean, reason: string) {
      completeResponse=complete; admission.observed(bytes.length);
      const rawRef = c.payloads.put(c.principal,"raw",bytes,7*86400000);
      captureId = randomUUID();
      // Encrypt all raw bodies, including any echoed secret; never put full URLs/headers in metadata.
      const headers = Object.fromEntries(["content-type","content-encoding","etag","last-modified"].flatMap(k=>{
        const value=response?.headers.get(k);
        // Even validator/header values may echo credentials; keep them in the encrypted body instead.
        return value ? [[k, c.payloads.reference(c.principal,value)]] : [];
      }));
      const body = { id:captureId,service:c.service,operation:url.pathname.split("/").at(-1),queryRef:c.queryRef,attempt:owner,
        stage:"client-decoded-entity-bytes",wireCapture:false,status:response?.status??null,headers,rawRef,
        bytes:bytes.length,hash:sha(bytes),complete,reason,collectedAt:new Date().toISOString(),elapsedMs:Date.now()-began,
        parser:"public-api-json-xml-v4",decoder:"node-fetch/utf8-bom-trim-v1",parse:"pending",legalVerified:false };
      c.store.db.prepare("INSERT INTO v4_captures VALUES(?,?,?,?,?)").run(captureId,c.principal.tenant,+c.principal.synthetic,c.job,JSON.stringify(body));
    },
    parsed(text: string, ok: boolean) {
      if (!captureId) return;
      const row = c.store.db.prepare("SELECT body FROM v4_captures WHERE id=?").get(captureId) as {body:string};
      const b=JSON.parse(row.body); b.parse=ok?"parsed":"invalid"; b.transformedHash=sha(text);
      c.store.db.prepare("UPDATE v4_captures SET body=? WHERE id=?").run(JSON.stringify(b),captureId);
    },
    release() { try { admission.finish(completeResponse); } finally { permits.release(id,owner,fence!); } },
  };
}

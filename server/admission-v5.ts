import { randomUUID } from "node:crypto";
import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";

// BEGIN IMMEDIATE serializes permission reads + intent commit against v4 grant inserts.
// A remote peer cannot retract bytes already sent; response bytes are a separate observation.
export class SendAdmissions {
  constructor(readonly store: Store) {
    store.db.exec("CREATE TABLE IF NOT EXISTS v5_send_intents(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT)");
  }
  admit(p: Principal, serialized: string, authorize: () => void, leaseMs: number) {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0 || leaseMs > 180000) throw Error("전송 시간 범위 확인 필요");
    this.store.db.exec("BEGIN IMMEDIATE");
    const id = randomUUID();
    try {
      assertPrincipal(p); authorize();
      const body = { state: "admitted", digest: sha(serialized), admittedAt: Date.now(), leaseUntil: Date.now() + leaseMs, outboundFirstByte: "unobserved", responseBytes: 0, recallAlreadySent: false };
      this.store.db.prepare("INSERT INTO v5_send_intents VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(body));
      this.store.db.exec("COMMIT");
    } catch(e) { this.store.db.exec("ROLLBACK"); throw e; }
    const controller = new AbortController();
    const update = (patch: object) => {
      const row = this.store.db.prepare("SELECT body FROM v5_send_intents WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as {body:string};
      this.store.db.prepare("UPDATE v5_send_intents SET body=? WHERE id=?").run(JSON.stringify({...JSON.parse(row.body),...patch}),id);
    };
    const check = () => {
      try { assertPrincipal(p); authorize(); if (Date.now() >= expires) throw Error(); }
      catch { controller.abort(); try { update({state:"cancelled",cancelledAt:Date.now()}); } catch { /* Closed/busy DB: network is still cancelled; recovery records unknown. */ } }
    };
    const expires = Date.now() + leaseMs, timer = setInterval(check, 25);
    timer.unref();
    return { id, signal: controller.signal,
      start: () => { check(); controller.signal.throwIfAborted(); update({state:"started",startedAt:Date.now()}); },
      observed: (bytes:number) => { update({responseBytes:bytes,responseFirstByteObserved:bytes>0}); },
      finish: (complete:boolean) => { clearInterval(timer); check(); update({state:controller.signal.aborted?"cancelled":complete?"completed":"unknown",finishedAt:Date.now()}); },
    };
  }
  recoverExpired(now=Date.now()) {
    const rows=this.store.db.prepare("SELECT id,body FROM v5_send_intents").all() as {id:string,body:string}[];
    for(const r of rows){const b=JSON.parse(r.body);if(["started","admitted"].includes(b.state)&&b.leaseUntil<=now)this.store.db.prepare("UPDATE v5_send_intents SET body=? WHERE id=?").run(JSON.stringify({...b,state:"unknown",reason:"worker_lost_or_lease_expired"}),r.id);}
  }
}

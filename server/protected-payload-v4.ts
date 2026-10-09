import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Store } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";

// The host supplies this key. It is never stored with the database or exported.
export type PayloadKey = { id: string; bytes: Buffer };
export class ProtectedPayloads {
  constructor(readonly store: Store, readonly key: PayloadKey, readonly now = () => Date.now()) {
    if (key.bytes.length !== 32 || !/^[\w.-]{1,100}$/.test(key.id)) throw Error("보호 저장 키 확인 필요");
    store.db.exec(`CREATE TABLE IF NOT EXISTS v4_payloads(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,purpose TEXT,expires INTEGER,hold INTEGER,body TEXT);`);
  }
  reference(p: Principal, value: string) {
    assertPrincipal(p);
    return createHmac("sha256", this.key.bytes).update(JSON.stringify([p.tenant,p.synthetic,value])).digest("hex");
  }
  put(p: Principal, purpose: "queue" | "raw" | "unit" | "attachment", bytes: Buffer, ttlMs: number, hold = false) {
    assertPrincipal(p);
    if (!p.roles.includes("writer") || bytes.length > 20_000_000 || !Number.isSafeInteger(ttlMs) || ttlMs <= 0 || (purpose === "queue" && hold)) throw Error("보호 저장 권한·용량·기간 확인 필요");
    const id = randomUUID(), expires = this.now() + ttlMs;
    const aad = JSON.stringify([id,p.tenant,p.synthetic,purpose,expires,hold,this.key.id]);
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm",this.key.bytes,iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(bytes),cipher.final()]);
    const body = JSON.stringify({ keyId:this.key.id, iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),data:data.toString("base64") });
    // A single SQLite insertion publishes both bytes and identity atomically.
    this.store.db.prepare("INSERT INTO v4_payloads VALUES(?,?,?,?,?,?,?)").run(id,p.tenant,+p.synthetic,purpose,expires,+hold,body);
    return id;
  }
  get(p: Principal, id: string, purpose: string) {
    assertPrincipal(p);
    const r = this.store.db.prepare("SELECT * FROM v4_payloads WHERE id=? AND tenant=? AND synthetic=? AND purpose=?").get(id,p.tenant,+p.synthetic,purpose) as any;
    if (!r || (!r.hold && r.expires <= this.now())) throw Error("보호 자료 없음·만료 또는 접근 권한 없음");
    try {
      const b = JSON.parse(r.body);
      if (b.keyId !== this.key.id) throw Error();
      const decipher = createDecipheriv("aes-256-gcm",this.key.bytes,Buffer.from(b.iv,"base64"));
      decipher.setAAD(Buffer.from(JSON.stringify([id,p.tenant,p.synthetic,purpose,r.expires,!!r.hold,b.keyId])));
      decipher.setAuthTag(Buffer.from(b.tag,"base64"));
      return Buffer.concat([decipher.update(Buffer.from(b.data,"base64")),decipher.final()]);
    } catch { throw Error("보호 자료 복호화·키 버전 확인 필요"); }
  }
  expire() {
    return this.store.db.prepare("DELETE FROM v4_payloads WHERE expires<=? AND hold=0").run(this.now()).changes;
  }
}

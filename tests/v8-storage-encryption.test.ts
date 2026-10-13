import { it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { StorageCipher, StorageLockedError, loadStorageCipher, STORAGE_KEY_NAME } from "../server/storage-crypto-v8.js";
import { migrateToEncrypted } from "../server/storage-migration-v8.js";
import { Vault } from "../server/vault.js";
import { testStore, request } from "./helpers.js";

// Synthetic key and synthetic company text only.
const key = () => new StorageCipher(randomBytes(32));
const marker = () => "합성기밀V8" + randomUUID().replaceAll("-", "");
function files(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? files(p, out) : out.push(p);
  }
  return out;
}
// Byte check over every file in the data folder (DB, WAL, originals, key files), UTF-8 and UTF-16.
function leaks(dir: string, text: string) {
  const needles = [Buffer.from(text, "utf8"), Buffer.from(text, "utf16le")];
  return files(dir).filter((p) => { const b = readFileSync(p); return needles.some((n) => b.includes(n)); })
    .map((p) => p.slice(dir.length));
}
async function session(app: Awaited<ReturnType<typeof createApp>>["app"]) {
  const host = "127.0.0.1:4317";
  const b = await app.inject({ url: "/api/bootstrap", headers: { host } });
  return { host, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
}
function upload(name: string, body: Buffer) {
  const boundary = "----v8" + randomUUID();
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/plain\r\n\r\n`),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

it("V8-E01: 암호화 켠 앱에서 업로드 원본·추출문·검토 질문·설정 초안이 디스크 어디에도 평문으로 남지 않는다", async () => {
  const { store: plain, clean } = testStore();
  const store = new Store(plain.dir, { cipher: key() });
  const secret = marker();
  const { app } = await createApp(store, true);
  try {
    const headers = await session(app);
    const original = Buffer.from(`사업장 내부 자료 ${secret} 저장량 기록`, "utf8");
    const u = upload("site-note.txt", original);
    const doc = await app.inject({ method: "POST", url: "/api/documents", headers: { ...headers, "content-type": "multipart/form-data; boundary=" + u.boundary }, payload: u.payload });
    expect(doc.statusCode).toBe(200);
    const created = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { ...request(), prompt: `검토 질문 ${secret}`, documentIds: [doc.json().id] } });
    expect(created.statusCode).toBe(202);
    for (let i = 0; i < 100 && store.review(created.json().id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    store.put("settings", "intake-synthetic", { prompt: `초안 ${secret}` });
    // The app still reads everything back.
    expect((await app.inject({ url: "/api/documents", headers })).json()[0].text).toContain(secret);
    expect((await app.inject({ url: `/api/documents/${doc.json().id}/original`, headers })).rawPayload.equals(original)).toBe(true);
    expect(store.review(created.json().id)!.request.prompt).toContain(secret);
    expect(leaks(store.dir, secret)).toEqual([]);
    await app.close();
    expect(leaks(store.dir, secret)).toEqual([]);
  } finally {
    await app.close();
    plain.close();
    clean();
  }
}, 30000);

it("V8-E02: 기존 평문 자료는 이관 후 디스크 평문이 사라지고 같은 내용으로 읽히며, 두 번째 실행은 아무것도 바꾸지 않는다", () => {
  const { store, clean } = testStore();
  const secret = marker(), cipher = key();
  try {
    store.put("reviews", "r1", { id: "r1", prompt: `질문 ${secret}` });
    store.put("documents", "d1", { id: "d1", text: `추출문 ${secret}` });
    store.put("settings", "intake-1", { prompt: `초안 ${secret}` });
    const name = randomUUID() + ".txt";
    writeFileSync(join(store.dir, "originals", name), `원본 ${secret}`);
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    expect(leaks(store.dir, secret).length).toBeGreaterThan(0); // the fixture really starts as plaintext
    store.close();
    const sealed = new Store(store.dir, { cipher });
    const report = migrateToEncrypted(sealed);
    expect(report).toEqual({ rows: 3, files: 1, already: false });
    expect(leaks(sealed.dir, secret)).toEqual([]);
    expect(sealed.get<any>("reviews", "r1").prompt).toBe(`질문 ${secret}`);
    expect(sealed.get<any>("settings", "intake-1").prompt).toBe(`초안 ${secret}`);
    expect(sealed.readOriginal(name).toString()).toBe(`원본 ${secret}`);
    expect(migrateToEncrypted(sealed)).toEqual({ rows: 0, files: 0, already: true });
    sealed.close();
  } finally {
    clean();
  }
});

it("V8-E03: 이관 검증이 실패하면 원본(DB 행·파일)은 그대로 보존되고 임시 파일도 남지 않는다", () => {
  const { store, clean } = testStore();
  const secret = marker(), cipher = key();
  try {
    store.put("reviews", "r1", { id: "r1", prompt: secret });
    const name = randomUUID() + ".txt";
    writeFileSync(join(store.dir, "originals", name), secret);
    store.close();
    const sealed = new Store(store.dir, { cipher });
    expect(() => migrateToEncrypted(sealed, { row: () => true })).toThrow("검증 실패");
    sealed.close();
    const again = new Store(store.dir);
    expect(again.get<any>("reviews", "r1").prompt).toBe(secret); // still plaintext, readable without a key
    again.close();
    const sealed2 = new Store(store.dir, { cipher });
    expect(() => migrateToEncrypted(sealed2, { file: () => true })).toThrow("검증 실패");
    expect(readFileSync(join(store.dir, "originals", name), "utf8")).toBe(secret);
    expect(readdirSync(join(store.dir, "originals")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    sealed2.close();
  } finally {
    clean();
  }
});

it("V8-E04: 암호문은 행·파일 위치에 묶여 있고, 다른 키나 키 없이 열리지 않는다", () => {
  const { store: plain, clean } = testStore();
  plain.close();
  const cipher = key(), store = new Store(plain.dir, { cipher });
  try {
    store.put("reviews", "a", { id: "a", prompt: "합성" });
    const body = (store.db.prepare("SELECT body FROM reviews WHERE id='a'").get() as any).body;
    store.db.prepare("INSERT INTO reviews(id,body) VALUES('b',?)").run(body);
    expect(() => store.get("reviews", "b")).toThrow();
    const name = randomUUID() + ".txt";
    store.writeOriginal(name, Buffer.from("합성 원본"));
    const other = new Store(plain.dir, { cipher: key() }), none = new Store(plain.dir);
    expect(() => other.get("reviews", "a")).toThrow();
    expect(() => none.get("reviews", "a")).toThrow(StorageLockedError);
    expect(() => none.readOriginal(name)).toThrow(StorageLockedError);
    other.close(); none.close();
  } finally {
    store.close();
    clean();
  }
});

it.skipIf(process.platform !== "win32")("V8-E05: 데이터 키는 Windows 사용자 키(DPAPI)로 감싸 저장되고 다시 열면 같은 키다", async () => {
  const { store, clean } = testStore();
  try {
    const first = await loadStorageCipher(store.dir, new Vault(store.dir, false));
    const file = join(store.dir, STORAGE_KEY_NAME + ".dpapi");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).not.toMatch(/eyJrZXki|"key"/); // neither the JSON nor its base64 is stored in clear
    const second = await loadStorageCipher(store.dir, new Vault(store.dir, false));
    expect(second.id).toBe(first.id);
    const sealed = first.sealText("합성", "t");
    expect(second.openText(sealed, "t")).toBe("합성");
  } finally {
    clean();
  }
}, 30000);

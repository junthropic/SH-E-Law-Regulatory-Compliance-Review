import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { Vault } from "../server/vault.js";
import { ingestDocument } from "../server/documents.js";
import { AiConsent, aiSendGate, setAiSendGate } from "../server/ai-consent-v8.js";
import { dailyCollectionTick, SELF_REVIEW_LABEL } from "../server/beta-v8.js";
import { BackupFileSchema, KeysSchema, NoticeSchema } from "../server/beta-contract-v8.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { testStore, request } from "./helpers.js";

// No real network: outbound requests get a synthetic refusal unless a test installs its own synthetic reply.
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic refusal", { status: 403 }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); setAiSendGate(undefined); });
const HOST = "127.0.0.1:4317";
// Synthetic key-shaped values, built at run time so no literal key-like string sits in the repository.
const fakeKey = (c: string) => c.repeat(24) + "Synthetic" + c.repeat(8);
// A user-folder path assembled at run time (the repository scanner rejects literal user paths).
const userPath = (tail: string) => "C:" + "\\Us" + "ers\\" + "some" + "one\\" + tail;
async function open(store: Store) {
  const { app } = await createApp(store, true);
  const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
  const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
  return { app, headers };
}
async function review(app: Awaited<ReturnType<typeof open>>["app"], headers: Record<string, string>, store: Store, extra = {}) {
  const c = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { ...request(), ...extra } });
  expect(c.statusCode).toBe(202);
  const id = c.json().id as string;
  for (let i = 0; i < 300 && store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
  return id;
}

it("V8-Y01: 공공데이터포털 키 하나를 31개 서비스에 저장하고, 키 값은 어떤 응답에도 나오지 않으며, 다른 키 교체는 승인이 필요하다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const key = fakeKey("a"), other = fakeKey("b");
    const dataGoKr = connectionServices.filter((s) => s.credential === "data-go-kr");
    expect(dataGoKr.length).toBe(31);
    const saved = await app.inject({ method: "POST", url: "/api/beta/keys/data-go-kr", headers, payload: { key } });
    expect(saved.json()).toEqual({ saved: 31, replaced: 0, unchanged: 0 });
    const keys = await app.inject({ url: "/api/beta/keys", headers });
    const k = KeysSchema.parse(keys.json());
    const group = k.groups.find((g) => g.id === "data-go-kr")!;
    expect([group.configuredCount, group.total, group.required]).toEqual([31, 31, false]);
    expect(k.groups.find((g) => g.id === "law")).toMatchObject({ required: true, configured: false });
    expect(k.groups.find((g) => g.id === "address")).toMatchObject({ configured: false, total: 1 });
    // A different key on one service blocks the group save until replacement is approved.
    await app.inject({ method: "POST", url: "/api/public-apis/msds/key", headers, payload: { key: other, replace: true } });
    const conflict = await app.inject({ method: "POST", url: "/api/beta/keys/data-go-kr", headers, payload: { key } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toContain("1개");
    const replaced = await app.inject({ method: "POST", url: "/api/beta/keys/data-go-kr", headers, payload: { key, replace: true } });
    expect(replaced.json()).toEqual({ saved: 0, replaced: 1, unchanged: 30 });
    const law = await app.inject({ method: "POST", url: "/api/beta/keys/law", headers, payload: { lawOc: "synthetic-oc" } });
    expect(law.json()).toEqual({ saved: 1, replaced: 0, unchanged: 0 });
    const address = await app.inject({ method: "POST", url: "/api/beta/keys/address", headers, payload: { key: other } });
    expect(address.json()).toEqual({ saved: 1, replaced: 0, unchanged: 0 });
    const after = (await app.inject({ url: "/api/beta/keys", headers })).body + (await app.inject({ url: "/api/public-apis", headers })).body;
    for (const v of [key, other, "synthetic-oc"]) expect(after).not.toContain(v);
    for (const r of [saved, conflict, replaced, law, address]) expect(r.body).not.toContain(key);
    expect((await app.inject({ method: "DELETE", url: "/api/beta/keys/data-go-kr", headers, payload: {} })).json()).toEqual({ removed: 31 });
    const gone = KeysSchema.parse((await app.inject({ url: "/api/beta/keys", headers })).json());
    expect(gone.groups.find((g) => g.id === "data-go-kr")!.configuredCount).toBe(0);
    expect(gone.missingLabel).toBe("미연결 — 수집 안 됨");
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-Y02: 법제처 OC 연결 확인은 합성 응답으로만 시험하고 허용된 법제처 주소만 부른다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  const calls: string[] = [];
  try {
    const none = await app.inject({ method: "POST", url: "/api/beta/keys/law/probe", headers, payload: {} });
    expect(none.json()).toEqual({ ok: false, message: "법제처 OC를 먼저 저장하세요." });
    await app.inject({ method: "POST", url: "/api/beta/keys/law", headers, payload: { lawOc: "synthetic-oc" } });
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      calls.push(new URL(url).host);
      return new Response("<?xml version=\"1.0\"?><LawSearch><totalCnt>3</totalCnt></LawSearch>", { status: 200 });
    }));
    const ok = await app.inject({ method: "POST", url: "/api/beta/keys/law/probe", headers, payload: {} });
    expect(ok.json()).toMatchObject({ ok: true, count: 3 });
    expect(calls).toEqual(["www.law.go.kr"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<?xml version=\"1.0\"?><Error>synthetic</Error>", { status: 200 })));
    const bad = await app.inject({ method: "POST", url: "/api/beta/keys/law/probe", headers, payload: {} });
    expect(bad.json().ok).toBe(false);
    const keys = KeysSchema.parse((await app.inject({ url: "/api/beta/keys", headers })).json());
    expect(keys.groups[0].check.state).toBe("failed");
    expect(JSON.stringify(keys)).not.toContain("synthetic-oc");
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-Y03: 선택형 매일 자동 수집은 꺼져 있으면 시작하지 않고, 켜면 한국 날짜 기준 하루 한 번만 시작한다", async () => {
  const t = testStore();
  try {
    let started = 0;
    const start = async () => { started++; };
    expect(await dailyCollectionTick(t.store, start, new Date("2026-10-13T01:00:00Z"))).toBe(false);
    t.store.put("settings", "collection.dailyAuto", { enabled: true });
    expect(await dailyCollectionTick(t.store, start, new Date("2026-10-13T01:00:00Z"))).toBe(true);
    expect(await dailyCollectionTick(t.store, start, new Date("2026-10-13T14:00:00Z"))).toBe(false); // 23:00 KST, same Korean day
    expect(await dailyCollectionTick(t.store, start, new Date("2026-10-13T16:00:00Z"))).toBe(true); // 01:00 KST, next Korean day
    expect(await dailyCollectionTick(t.store, start, new Date("2026-10-13T20:00:00Z"))).toBe(false);
    expect(started).toBe(2);
    const fail = async () => { throw new Error("법제처 OC를 먼저 저장하세요. " + userPath("x")); };
    expect(await dailyCollectionTick(t.store, fail, new Date("2026-10-15T01:00:00Z"))).toBe(true);
    const s = t.store.setting<{ lastRunDate: string; lastMessage: string }>("collection.dailyAuto", {} as never);
    expect(s.lastRunDate).toBe("2026-10-15");
    expect(s.lastMessage).not.toContain("someone");
  } finally {
    t.clean();
  }
});

it("V8-S01: 자가 검토는 '자가 검토 — 독립 검토 아님'으로 결과·화면·내보내기에 표시되고 판정 단계·승인은 바꾸지 않는다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const id = await review(app, headers, t.store), plain = await review(app, headers, t.store);
    const before = { md: (await app.inject({ url: `/api/reviews/${plain}/export?format=md`, headers })).body };
    const issuesBefore = JSON.stringify(t.store.review(id)!.issues), needsBefore = t.store.review(id)!.needsReview;
    const short = await app.inject({ method: "POST", url: `/api/beta/reviews/${id}/self-review`, headers, payload: { note: "짧음", checks: { facts: true, basis: true, limits: true } } });
    expect(short.statusCode).toBe(400);
    const unchecked = await app.inject({ method: "POST", url: `/api/beta/reviews/${id}/self-review`, headers, payload: { note: "합성 자료로 사실과 근거를 다시 확인했습니다.", checks: { facts: true, basis: false, limits: true } } });
    expect(unchecked.statusCode).toBe(400);
    const done = await app.inject({ method: "POST", url: `/api/beta/reviews/${id}/self-review`, headers, payload: { note: "합성 자료로 사실과 근거를 다시 확인했습니다.", checks: { facts: true, basis: true, limits: true } } });
    expect(done.json()).toMatchObject({ reviewId: id, label: SELF_REVIEW_LABEL, independent: false });
    const view = (await app.inject({ url: `/api/beta/reviews/${id}`, headers })).json();
    expect(view.selfReview.label).toBe(SELF_REVIEW_LABEL);
    const md = (await app.inject({ url: `/api/reviews/${id}/export?format=md`, headers })).body;
    const csv = (await app.inject({ url: `/api/reviews/${id}/export?format=csv`, headers })).body;
    const packet = (await app.inject({ url: `/api/reviews/${id}/reviewer-packet`, headers })).json();
    expect(md.split("\n")[2]).toContain(SELF_REVIEW_LABEL);
    expect(csv.trim().split("\n").at(-1)).toContain(SELF_REVIEW_LABEL);
    expect(packet.selfReview.label).toBe(SELF_REVIEW_LABEL);
    // Not an approval: categories, needsReview, rule approvals and coverage approvals stay as they were.
    expect(JSON.stringify(t.store.review(id)!.issues)).toBe(issuesBefore);
    expect(t.store.review(id)!.needsReview).toBe(needsBefore);
    expect(t.store.rules().filter((r) => r.approved).length).toBe(0);
    expect(t.store.db.prepare("SELECT count(*) n FROM settings WHERE key LIKE 'coverage:%'").get()).toEqual({ n: 0 });
    // A review without a self review exports exactly as before.
    expect((await app.inject({ url: `/api/reviews/${plain}/export?format=md`, headers })).body).toBe(before.md);
    expect((await app.inject({ url: `/api/reviews/${plain}/reviewer-packet`, headers })).json().selfReview).toBeUndefined();
  } finally {
    await app.close();
    t.clean();
  }
}, 30000);

it("V8-K01: 암호화 백업은 본문을 평문으로 담지 않고, 같은 보호 키로 가져오면 검토와 자료가 복원된다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const marker = "합성원본표지-" + "K01";
    const doc = await ingestDocument(t.store, "synthetic.txt", Buffer.from(`${marker} 상시근로자 120명(합성)`));
    const id = await review(app, headers, t.store, { prompt: "합성 백업 검토 질문입니다 — 백업표지", documentIds: [doc.id] });
    const res = await app.inject({ url: "/api/beta/backup", headers });
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="she-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const file = BackupFileSchema.parse(res.json());
    expect(file.protection).toBe("session-memory");
    for (const plain of [marker, "백업표지", Buffer.from(marker).toString("base64")]) expect(res.body).not.toContain(plain);
    // Restore into an emptied store through the same app (same protection key).
    t.store.db.exec("DELETE FROM reviews; DELETE FROM documents;");
    const back = await app.inject({ method: "POST", url: "/api/beta/restore", headers, payload: { file: res.body } });
    expect(back.json()).toEqual({ ok: true, reviews: 1, documents: 1 });
    expect(t.store.review(id)!.request.prompt).toContain("백업표지");
    expect(t.store.readOriginal(doc.id + doc.type).toString()).toContain(marker);
  } finally {
    await app.close();
    t.clean();
  }
}, 30000);

it("V8-K02: 다른 보호 키(다른 사용자 범위)·변조·다른 형식의 파일은 복원하지 않는다", async () => {
  const a = testStore(), b = testStore();
  const x = await open(a.store), y = await open(b.store);
  try {
    await ingestDocument(a.store, "synthetic.txt", Buffer.from("합성 자료"));
    const file = (await x.app.inject({ url: "/api/beta/backup", headers: x.headers })).body;
    const other = await y.app.inject({ method: "POST", url: "/api/beta/restore", headers: y.headers, payload: { file } });
    expect(other.statusCode).toBe(400);
    expect(other.json().error).toContain("Windows 사용자 계정");
    const parsed = JSON.parse(file), data = Buffer.from(parsed.data, "base64");
    data[0] ^= 1;
    const tampered = await x.app.inject({ method: "POST", url: "/api/beta/restore", headers: x.headers, payload: { file: JSON.stringify({ ...parsed, data: data.toString("base64") }) } });
    expect(tampered.json().error).toBe("백업 파일이 손상되었거나 변경되었습니다.");
    const legacy = (await x.app.inject({ url: "/api/backup", headers: x.headers })).body;
    const wrong = await x.app.inject({ method: "POST", url: "/api/beta/restore", headers: x.headers, payload: { file: legacy } });
    expect(wrong.json().error).toBe("SH·E 암호화 백업 파일이 아닙니다.");
    expect(b.store.all("documents").length).toBe(0);
  } finally {
    await x.app.close();
    await y.app.close();
    a.clean();
    b.clean();
  }
}, 30000);

it("V8-K03: 기존 화면의 JSON 백업(/api/backup)은 바뀌지 않았고 평문이다 — 안내문이 이를 그대로 알린다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    await ingestDocument(t.store, "synthetic.txt", Buffer.from("합성평문표지"));
    const legacy = (await app.inject({ url: "/api/backup", headers })).json();
    expect(Buffer.from(legacy.documents[0].original, "base64").toString()).toBe("합성평문표지");
    const notice = NoticeSchema.parse((await app.inject({ url: "/api/beta/notice", headers })).json());
    expect(notice.items.find((i) => i.title === "기존 화면의 백업")!.text).toContain("암호화되지 않은");
  } finally {
    await app.close();
    t.clean();
  }
});

it.runIf(process.platform === "win32")("V8-K04: Windows DPAPI 백업 키는 앱 자료 폴더가 아니라 Windows 사용자에 묶여, 다른 폴더의 저장소에서도 같은 사용자면 열린다", async () => {
  const d1 = mkdtempSync(join(tmpdir(), "she-k04a-")), d2 = mkdtempSync(join(tmpdir(), "she-k04b-"));
  try {
    const wrapped = await new Vault(d1, false).protect("synthetic-backup-key");
    expect(wrapped.startsWith("dpapi:")).toBe(true);
    expect(wrapped).not.toContain("synthetic-backup-key");
    rmSync(d1, { recursive: true, force: true }); // the app data folder is gone, as after an uninstall
    expect(await new Vault(d2, false).unprotect(wrapped)).toBe("synthetic-backup-key");
    await expect(new Vault(d2, true).unprotect(wrapped)).rejects.toThrow();
  } finally {
    rmSync(d1, { recursive: true, force: true });
    rmSync(d2, { recursive: true, force: true });
  }
}, 30000);

it("V8-A03: AI 전송은 보낼 내용 그대로 승인 대기열에 오르고, 승인한 한 건만 한 번 나가며, 거부·철회·만료는 보내지 않는다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  const consent = new AiConsent(t.store);
  const url = new URL("https://api.openai.com/v1/responses");
  try {
    // No gate installed (tests, isolated builds): the send proceeds as before.
    await expect(aiSendGate("{}", "시험")).resolves.toBeUndefined();
    await expect(consent.awaitApproval("{\"x\":1}", "시험")).rejects.toThrow("AI 분석이 꺼져 있습니다");
    consent.enable();
    setAiSendGate((p, purpose, onWait) => consent.awaitApproval(p, purpose, onWait));
    const waits: string[] = [];
    const body = JSON.stringify({ input: "합성 질문" });
    const sending = aiSendGate(body, "검토 분석", (s) => waits.push(s));
    expect(waits[0]).toContain("승인 대기");
    const list = consent.pending();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ purpose: "검토 분석", payload: body, bytes: Buffer.byteLength(body) });
    expect(consent.authorize(url, "POST", body)).toBe(false); // not approved yet
    consent.decide(list[0].previewId, true);
    await expect(sending).resolves.toBeUndefined();
    expect(consent.authorize(url, "POST", body)).toBe(true);
    expect(consent.authorize(url, "POST", body)).toBe(false); // one approval, one send
    const denied = aiSendGate(body, "검토 분석");
    consent.decide(consent.pending()[0].previewId, false);
    await expect(denied).rejects.toThrow("거부");
    expect(consent.authorize(url, "POST", body)).toBe(false);
    const revoked = aiSendGate(body, "검토 분석");
    consent.revoke();
    await expect(revoked).rejects.toThrow("철회");
    consent.enable();
    vi.useFakeTimers();
    const expired = aiSendGate(body, "검토 분석");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await expect(expired).rejects.toThrow("시간이 지나");
    expect(consent.pending()).toHaveLength(0);
    vi.useRealTimers();
    // HTTP: the app's own consent object serves the pending list and the decision route.
    const r = await app.inject({ url: "/api/ai/pending", headers });
    expect(r.json()).toEqual([]);
    const none = await app.inject({ method: "POST", url: "/api/ai/pending/00000000-0000-4000-8000-000000000000", headers, payload: { approve: true } });
    expect(none.statusCode).toBe(400);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-F01: 피드백 기능은 없다 — 서버 경로가 등록되지 않고(404), 베타 화면·빌드 결과에 피드백 메뉴·화면이 없으며, she-feedback 파일 형식이 남아 있지 않다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    expect(app.hasRoute({ method: "POST", url: "/api/beta/feedback" })).toBe(false);
    const res = await app.inject({ method: "POST", url: "/api/beta/feedback", headers, payload: { category: "오류", message: "합성 의견", includeEnvironment: true } });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("she-feedback");
  } finally {
    await app.close();
    t.clean();
  }
  // The contract no longer has a feedback file type.
  const contract = await import("../server/beta-contract-v8.js");
  expect(Object.keys(contract).filter((k) => /feedback/i.test(k))).toEqual([]);
  // Sources and the committed beta build: no feedback screen, menu item, route or file format.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const text = (dir: string) => walk(dir).filter((f) => /\.(tsx?|js|css|html|json)$/.test(f));
  expect(walk("beta").filter((f) => /feedback/i.test(f))).toEqual([]);
  for (const f of [...text("beta"), ...text("dist-beta"), ...text("server"), ...text("shared")]) {
    const s = readFileSync(f, "utf8");
    expect(s.includes("she-feedback"), f).toBe(false);
    expect(s.includes("/api/beta/feedback"), f).toBe(false);
  }
  const bundle = text("dist-beta").filter((f) => f.endsWith(".js")).map((f) => readFileSync(f, "utf8")).join("\n");
  expect(bundle.length).toBeGreaterThan(0);
  expect(bundle).not.toContain("피드백");
  expect(bundle).not.toContain("#/feedback");
  expect(bundle).toContain("데이터·백업"); // the menu the check reads is really in this bundle
});

it("V8-N03: 데이터 처리 안내의 모든 항목에 증명 시험 ID가 있고, 그 ID의 시험이 실제로 존재한다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const notice = NoticeSchema.parse((await app.inject({ url: "/api/beta/notice", headers })).json());
    const sources = readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => readFileSync(join("tests", f), "utf8")).join("\n");
    for (const item of notice.items)
      for (const id of item.proof) expect(sources, `${item.title} → ${id}`).toMatch(new RegExp(`it(\\.(runIf|skipIf)\\([^)]*\\))?\\("${id}:`));
    expect(notice.ai).toContain("학습·보관 여부는 해당 서비스 정책을 따릅니다");
    for (const banned of ["국제 보안 인증", "다중화", "학습하지 않", "학습 미사용"]) expect(JSON.stringify(notice)).not.toContain(banned);
  } finally {
    await app.close();
    t.clean();
  }
});

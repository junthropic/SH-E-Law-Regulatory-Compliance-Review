import { it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import https from "node:https";
import { readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { createLegacyRedirect } from "../server/legacy-address.js";
import { EgressGuard, EgressBlocked, classifyHost } from "../server/egress-guard-v8.js";
import { AiConsent, AI_NOTICE } from "../server/ai-consent-v8.js";
import { ingestDocument } from "../server/documents.js";
import { newReview } from "../server/reviews.js";
import { makeBackup } from "../server/backup.js";
import { purgeExpired, setRetentionDays, deletionLog, ORIGINAL_DELETED } from "../server/retention-v8.js";
import { PREVIEW_SWITCH } from "../server/export-check-v8.js";
import { PROTECTED_REFERENCE_NOTE } from "../server/protected-reference-v8.js";
import { safeMessage } from "../server/redact-v8.js";
import { ProtectedPayloads } from "../server/protected-payload-v4.js";
import { PayloadProvenance } from "../server/provenance-v4.js";
import { SafetyManagerCases } from "../server/safety-manager-cases-v7.js";
import { LegacyBridge } from "../server/legacy-bridge-v3.js";
import { safetyManagerFixture } from "./v7-fixture.js";
import { safetyManagerPolicies } from "../server/safety-manager-v7.js";
import { writer, reviewer } from "./v2-fixture.js";
import { testStore, request, basis } from "./helpers.js";

// Synthetic data, synthetic keys and stubbed network only.
const marker = () => "합성기밀V8" + randomUUID().replaceAll("-", "");
const HOST = "127.0.0.1:4317";
async function session(app: Awaited<ReturnType<typeof createApp>>["app"]) {
  const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
  return { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
}
function leaks(dir: string, text: string) {
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
    return out;
  };
  const needles = [Buffer.from(text, "utf8"), Buffer.from(text, "utf16le")];
  return walk(dir).filter((p) => { const b = readFileSync(p); return needles.some((n) => b.includes(n)); });
}

// ── 접속 범위 ──────────────────────────────────────────────
it("V8-N01: 서버는 127.0.0.1 말고 다른 주소(0.0.0.0·외부 IP·기본값)로는 열리지 않는다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true), legacy = createLegacyRedirect();
  try {
    await expect(app.listen({ port: 0, host: "0.0.0.0" })).rejects.toThrow("127.0.0.1");
    await expect(app.listen({ port: 0, host: "192.168.0.10" })).rejects.toThrow("127.0.0.1");
    await expect(app.listen({ port: 0 })).rejects.toThrow("127.0.0.1");
    await expect(legacy.listen({ port: 0, host: "::" })).rejects.toThrow("127.0.0.1");
    await app.listen({ port: 0, host: "127.0.0.1" });
    expect((app.server.address() as { address: string }).address).toBe("127.0.0.1");
  } finally { await app.close(); await legacy.close(); f.clean(); }
}, 30000);

it("V8-N02: Host 헤더 위조·다른 Origin·외부 주소에서 온 요청은 거부한다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    for (const host of ["evil.example", "127.0.0.1.evil.example", "localhost:4317", "[::1]:4317", "127.0.0.2:4317", "192.168.0.10:4317", ""])
      expect((await app.inject({ url: "/api/bootstrap", headers: { host } })).statusCode, host).toBe(403);
    expect((await app.inject({ url: "/api/bootstrap", headers: { host: HOST, origin: "http://evil.example" } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/bootstrap", headers: { host: HOST }, remoteAddress: "192.168.0.10" })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/bootstrap", headers: { host: HOST } })).statusCode).toBe(200);
    // Real socket: DNS-rebinding style Host on a genuine loopback connection.
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const status = (host: string) => new Promise<number>((res, rej) => {
      const r = httpRequest({ host: "127.0.0.1", port, path: "/api/bootstrap", headers: { host } }, (x) => { x.resume(); res(x.statusCode!); });
      r.on("error", rej); r.end();
    });
    expect(await status("attacker.example:" + port)).toBe(403);
    expect(await status("127.0.0.1:" + port)).toBe(200);
  } finally { await app.close(); f.clean(); }
}, 30000);

// ── 외부 전송 허용 목록 ─────────────────────────────────────
it("V8-O01: 허용 목록(법령·공공 API)만 나가고 제작자 저장소·기타 주소·평문 http는 연결 전에 막는다", async () => {
  const sent: string[] = [];
  const guard = new EgressGuard();
  const guarded = guard.wrapFetch((async (u: string | URL | Request) => { sent.push(new URL(String((u as Request).url ?? u)).hostname); return new Response("ok"); }) as typeof fetch);
  for (const url of ["https://www.law.go.kr/DRF/x", "https://open.law.go.kr/x", "https://apis.data.go.kr/x", "https://business.juso.go.kr/x", "http://127.0.0.1:4317/x"])
    expect((await guarded(url)).status).toBe(200);
  for (const url of ["https://raw.githubusercontent.com/junthropic/SH-E-Law-Check/main/data/public/bundle.json", "https://example.com/", "http://www.law.go.kr/x", "https://law.go.kr.evil.example/x", "https://api.openai.com/v1/responses"])
    await expect(guarded(url, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(EgressBlocked);
  expect(sent).toEqual(["www.law.go.kr", "open.law.go.kr", "apis.data.go.kr", "business.juso.go.kr", "127.0.0.1"]);
  expect(classifyHost("raw.githubusercontent.com")).toBe("blocked");
  // Raw node:https is guarded too once installed.
  guard.install();
  try { expect(() => https.request("https://example.com/")).toThrow(EgressBlocked); } finally { guard.uninstall(); }
});

it("V8-O02: 시험 중 앱이 시도한 모든 외부 요청을 기록하면 허용 목록 밖으로 나간 요청은 0건이다", async () => {
  const outbound: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (u: unknown) => { outbound.push(new URL(String((u as { url?: string })?.url ?? u)).hostname); return new Response("synthetic refusal", { status: 403 }); }));
  const guard = new EgressGuard().install();
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    const headers = await session(app);
    // Default review path (looks up public law) and the old public-bundle update (maker's GitHub) are exercised.
    const r = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { ...request(), prompt: "가상 사업장 산업안전보건법 안전관리자 선임 검토" } });
    expect(r.statusCode).toBe(202);
    for (let i = 0; i < 200 && f.store.review(r.json().id)?.status === "running"; i++) await new Promise((x) => setTimeout(x, 50));
    await app.inject({ method: "POST", url: "/api/public/update", headers });
    expect(guard.records.length).toBeGreaterThan(0);
    expect(outbound.filter((h) => !["public", "loopback"].includes(classifyHost(h)))).toEqual([]);
    expect(guard.records.filter((x) => x.allowed).every((x) => ["public", "loopback"].includes(x.category))).toBe(true);
    expect(guard.records.some((x) => x.host === "raw.githubusercontent.com" && !x.allowed)).toBe(true);
  } finally { await app.close(); guard.uninstall(); vi.unstubAllGlobals(); f.clean(); }
}, 30000);

// ── AI 전송 동의 ───────────────────────────────────────────
it("V8-A01: AI는 기본 꺼짐이고, 동의·미리보기 승인 없이는 0건, 승인 1회당 1건, 철회 후 재사용 0건이며 기록에 본문이 없다", async () => {
  const f = testStore();
  let now = Date.parse("2026-10-13T00:00:00Z");
  const consent = new AiConsent(f.store, () => now), sent: string[] = [];
  const guard = new EgressGuard((u, m, b) => consent.authorize(u, m, b));
  const ai = guard.wrapFetch((async (_u: unknown, init?: RequestInit) => { sent.push(String(init?.body)); return new Response("{}"); }) as typeof fetch);
  const secret = marker(), body = JSON.stringify({ input: "검토 " + secret });
  const post = (b = body) => ai("https://api.openai.com/v1/responses", { method: "POST", body: b });
  try {
    expect(consent.status()).toMatchObject({ enabled: false, notice: AI_NOTICE });
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // off
    expect(() => consent.preview(body)).toThrow("꺼져");
    consent.enable();
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // on, but nothing previewed
    const shown = consent.preview(body);
    expect(shown.payload).toBe(body); // exactly what would be sent
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // previewed, not approved
    consent.approve(shown.previewId);
    await expect(post(body + " ")).rejects.toBeInstanceOf(EgressBlocked); // different bytes than previewed
    expect((await post()).status).toBe(200);
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // one approval, one send
    const again = consent.preview(body); consent.approve(again.previewId);
    consent.revoke();
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // revoked: earlier approval is void
    consent.enable();
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // re-enabling does not revive it
    const late = consent.preview(body); consent.approve(late.previewId); now += 11 * 60 * 1000;
    await expect(post()).rejects.toBeInstanceOf(EgressBlocked); // approval expired
    expect(sent).toEqual([body]);
    const log = consent.log() as { outcome: string }[];
    expect(log.filter((x) => x.outcome === "sent")).toHaveLength(1);
    expect(log.filter((x) => x.outcome === "blocked").length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(log)).not.toContain(secret);
  } finally { f.clean(); }
});

it("V8-A02: 동의 상태와 전송 기록은 API로 확인·변경하며 기본값은 꺼짐이다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    const headers = await session(app);
    expect((await app.inject({ url: "/api/ai/consent", headers })).json()).toMatchObject({ enabled: false, notice: AI_NOTICE });
    expect((await app.inject({ method: "POST", url: "/api/ai/consent", headers, payload: { enabled: true } })).json().enabled).toBe(true);
    expect((await app.inject({ method: "POST", url: "/api/ai/consent", headers, payload: { enabled: false } })).json().enabled).toBe(false);
    expect((await app.inject({ url: "/api/ai/send-log", headers })).json()).toEqual([]);
  } finally { await app.close(); f.clean(); }
});

// ── 보존·삭제 ──────────────────────────────────────────────
it("V8-R01: 기본은 계속 보관, 기간을 고르면 지난 원본만 삭제되고 삭제 뒤 DB·파일·백업 목록에서 읽을 수 없다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    const headers = await session(app), secret = marker();
    const old = await ingestDocument(f.store, "old.txt", Buffer.from("오래된 자료 " + secret));
    const recent = await ingestDocument(f.store, "recent.txt", Buffer.from("최근 자료 합성"));
    const now = new Date("2026-10-13T00:00:00Z");
    f.store.put("documents", old.id, { ...old, createdAt: "2026-08-01T00:00:00Z" });
    f.store.put("documents", recent.id, { ...recent, createdAt: "2026-10-03T00:00:00Z" });
    const review = newReview({ ...request(), documentIds: [old.id] }); review.status = "completed"; f.store.saveReview(review);
    expect((await app.inject({ url: "/api/retention", headers })).json().autoDeleteDays).toBe(null);
    expect(purgeExpired(f.store, now)).toBe(0); // default: keep
    expect((await app.inject({ method: "POST", url: "/api/retention", headers, payload: { autoDeleteDays: 45 } })).statusCode).toBe(400);
    setRetentionDays(f.store, 30);
    expect(purgeExpired(f.store, now)).toBe(1);
    expect((await app.inject({ url: "/api/documents", headers })).json().map((d: { id: string }) => d.id)).toEqual([recent.id]);
    expect((await app.inject({ url: `/api/documents/${old.id}/original`, headers })).statusCode).toBe(404);
    expect(makeBackup(f.store).documents.map((d) => d.id)).toEqual([recent.id]);
    expect(f.store.review(review.id)!.gaps).toContain(ORIGINAL_DELETED);
    expect(leaks(f.store.dir, secret)).toEqual([]); // DB pages, WAL and originals
    const log = deletionLog(f.store) as { kind: string; ref: string; reason: string }[];
    expect(log).toEqual([expect.objectContaining({ kind: "document", ref: old.id, reason: "auto-30d" })]);
    expect(JSON.stringify(log)).not.toContain("old.txt");
    // Manual permanent deletion of a review and of all originals.
    expect((await app.inject({ method: "DELETE", url: `/api/reviews/${review.id}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/reviews/${review.id}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/documents/delete-all", headers, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/documents/delete-all", headers, payload: { confirm: "전체 삭제" } })).json()).toEqual({ deleted: 1 });
    expect(readdirSync(join(f.store.dir, "originals"))).toEqual([]);
    expect((deletionLog(f.store) as { kind: string }[]).map((x) => x.kind)).toEqual(["document", "review", "document"]);
  } finally { await app.close(); f.clean(); }
}, 30000);

// ── B-2 ───────────────────────────────────────────────────
it("V8-B2: 보호 사례 발행 뒤 평문 reviews 행에는 참조만 있고 판정·인원·해시·사실 본문이 없다", async () => {
  const f = testStore(), key = { id: "synthetic-v8", bytes: randomBytes(32) }, expiry = "2099-01-01T00:00:00Z";
  const p = { ...writer, validFrom: "2020-01-01T00:00:00Z", expiresAt: expiry, roles: ["writer", "egress_reviewer", "collection_operator", "backup_operator"] as typeof writer.roles };
  const local = (g: PayloadProvenance, node: string) => { for (const purpose of ["read", "document"]) g.event(p, node, purpose, "local", "release", "명시적 host 합성 권한이며 실제 사업장 승인이 아닙니다.", expiry); };
  const svc = new SafetyManagerCases(new ProtectedPayloads(f.store, key)), policy = safetyManagerPolicies.find((x) => x.id === "safety_manager.appointment") ?? safetyManagerPolicies[0];
  try {
    const fixed = safetyManagerFixture();
    const d = await ingestDocument(f.store, "v8-synthetic.txt", Buffer.from(JSON.stringify(fixed))), bound = svc.records.bindDocument(p, d.id); local(svc.records.graph, bound.node);
    const first = svc.fromDocument(p, bound.id); local(svc.records.graph, first.own);
    const manual = svc.supplement(p, first.id, first.version, fixed); local(svc.records.graph, manual.own);
    const checked = svc.review({ ...reviewer, roles: [...reviewer.roles, "writer"] }, first.id, manual.version, "가상 사업장 업종 행·인원·선임 자료를 독립 합성 actor로 확인했습니다."); local(svc.records.graph, checked.own);
    const review = newReview({ ...request(), asOf: fixed.asOf, prompt: "가상 사업장 산업안전보건법 " + policy.label + " 검토를 요청합니다.", documentIds: [d.id] }); f.store.saveReview(review);
    new LegacyBridge(f.store, "v7").attach(p, review, "project"); f.store.saveReview(review);
    const published = svc.publish(p, first.id, review.id);
    expect(published.issues).toBeGreaterThan(0);
    const raw = (f.store.db.prepare("SELECT body FROM reviews WHERE id=?").get(review.id) as { body: string }).body;
    expect(raw).toContain(PROTECTED_REFERENCE_NOTE);
    for (const text of ["합성 후보", "확인 인원", "필요 인원", "원본 해시", d.hash, "사실 후보 버전"]) expect(raw, text).not.toContain(text);
    // The protected store still has the result.
    expect(svc.evaluate(p, first.id).results.length).toBeGreaterThan(0);
  } finally { f.clean(); }
}, 30000);

// ── B-3 ───────────────────────────────────────────────────
it("V8-B3: 미리보기 스위치를 켜면 binding 없는 검토 export와 검토자 인계 자료도 모두 검사하고, 끄면 기존과 같다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  const checks = () => (f.store.db.prepare("SELECT count(*) n FROM audit WHERE action='export_checked'").get() as { n: number }).n;
  try {
    const headers = await session(app);
    const review = newReview(request()); review.evidence = basis(); review.status = "completed"; f.store.saveReview(review);
    const get = (path: string) => app.inject({ url: `/api/reviews/${review.id}/${path}`, headers });
    const offExport = await get("export?format=markdown"), offPacket = await get("reviewer-packet");
    expect([offExport.statusCode, offPacket.statusCode, checks()]).toEqual([200, 200, 0]); // switch off: unchanged, unchecked
    f.store.put("settings", PREVIEW_SWITCH, true);
    const onExport = await get("export?format=markdown");
    expect(onExport.statusCode).toBe(200);
    expect(onExport.body).toBe(offExport.body);
    expect((await get("reviewer-packet")).statusCode).toBe(200);
    expect(checks()).toBe(2); // every export was checked
    // Tampered evidence or a stray protected reference without a binding is refused.
    const tampered = { ...review, evidence: [{ ...review.evidence[0], text: review.evidence[0].text + " 변경" }, ...review.evidence.slice(1)] };
    f.store.put("reviews", review.id, tampered);
    expect((await get("export?format=markdown")).statusCode).not.toBe(200);
    expect((await get("reviewer-packet")).statusCode).not.toBe(200);
    f.store.put("reviews", review.id, { ...review, issues: [{ id: "x", ruleId: "safety_manager.appointment", title: "t", category: "human_review", conclusion: "", conditions: [], citations: [], exceptions: [], missing: [], nextActions: [], severity: "unspecified" }] });
    expect((await get("export?format=markdown")).statusCode).not.toBe(200);
    expect((await get("reviewer-packet")).statusCode).not.toBe(200);
  } finally { await app.close(); f.clean(); }
}, 30000);

// ── 로그 ──────────────────────────────────────────────────
it("V8-L01: 오류 응답·콘솔·감사·삭제·전송 기록 바이트에 본문·키·경로가 없다", async () => {
  const f = testStore();
  const out: string[] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(" ")); }));
  const { app } = await createApp(f.store, true);
  try {
    const headers = await session(app), secret = marker(), fakeKey = "sk-" + "Zq9".repeat(10);
    const doc = await ingestDocument(f.store, "note.txt", Buffer.from("본문 " + secret));
    unlinkSync(join(f.store.dir, "originals", doc.id + doc.type)); // provoke a file-system error that names the path
    const responses = [
      await app.inject({ url: `/api/documents/${doc.id}/original`, headers }),
      await app.inject({ url: "/api/backup", headers }),
      await app.inject({ method: "POST", url: "/api/restore", headers, payload: { schemaVersion: 1, reviews: [{ prompt: secret }] } }),
      await app.inject({ method: "POST", url: "/api/settings/law", headers, payload: { lawOc: fakeKey } }),
      await app.inject({ method: "DELETE", url: `/api/documents/${doc.id}`, headers }),
    ];
    expect(responses[0].statusCode).toBeGreaterThanOrEqual(400);
    const audit = JSON.stringify(f.store.db.prepare("SELECT * FROM audit").all()) + JSON.stringify(deletionLog(f.store)) + JSON.stringify(new AiConsent(f.store).log());
    const bytes = [...responses.map((r) => r.body), ...out, audit].join("\n");
    for (const needle of [secret, fakeKey, f.store.dir, f.store.dir.replaceAll("\\", "/"), "note.txt"]) expect(bytes, needle).not.toContain(needle);
    expect(bytes).not.toMatch(/[A-Za-z]:\\Users\\|\/home\/|\/tmp\//);
  } finally { spies.forEach((s) => s.mockRestore()); await app.close(); f.clean(); }
}, 30000);

it("V8-L02: 오류 문구 정리는 경로·키 형태 값·긴 부호화 문자열을 지운다", () => {
  // Paths are assembled at runtime so the repository itself holds no user path.
  const user = "ho" + "ng", dir = "C:" + "\\Users\\" + user + "\\AppData\\Local\\she", home = "/ho" + "me/" + user + "/a";
  expect(safeMessage("ENOENT: no such file or directory, open '" + dir + "\\originals\\a.txt'")).toBe("파일을 처리하지 못했습니다 (ENOENT).");
  const m = safeMessage(`실패 ${dir}\\x ${home} /tmp/x sk-${"a".repeat(24)} ${"ab12".repeat(16)} ${"QUJD".repeat(12)}`, dir);
  for (const bad of ["hong", "sk-", "ab12ab12", "QUJDQUJD"]) expect(m).not.toContain(bad);
  expect(m.startsWith("실패")).toBe(true);
});

import { it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApp } from "../server/app.js";
import { ChatGPTAuth, type Account } from "../server/auth.js";
import { Vault } from "../server/vault.js";
import { AiConsent } from "../server/ai-consent-v8.js";
import { EgressGuard, EgressBlocked, bodyText, effectiveRequestTarget } from "../server/egress-guard-v8.js";
import { makeBackup } from "../server/backup.js";
import { betaBackup } from "../server/beta-v8.js";
import { newReview } from "../server/reviews.js";
import { testStore, request, basis } from "./helpers.js";

// Security review F-06 (OAuth through the installed egress guard) and F-05 (guard gaps). No real network: OpenAI is a
// local stub behind a stubbed global fetch, and "outside" hosts are 127.0.0.2 servers (classified "blocked") or
// names the guard refuses before any DNS lookup. Every token is synthetic and made fresh per run.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const HOST = "127.0.0.1:4317";
const ISS = "https://auth.openai.com";
const synthetic = (label: string) => `FAKE-${label}-${randomBytes(18).toString("base64url")}`;

// A local stand-in for auth.openai.com / api.openai.com: discovery, JWKS, token (code and refresh), revoke, models.
async function fakeOpenAI() {
  const key = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const tokens = { access: synthetic("ACCESS"), refresh: synthetic("REFRESH"), access2: synthetic("ACCESS2"), refresh2: synthetic("REFRESH2"), code: synthetic("CODE") };
  const seen = { token: [] as Record<string, string>[], revoke: [] as Record<string, string>[], urls: [] as string[], bodies: [] as string[] };
  let nonce = "";
  const idToken = () => new SignJWT({ nonce, email: "synthetic.user@example.invalid" }).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(ISS).setAudience("client-SYNTH").setSubject("user-SYNTH").setIssuedAt().setExpirationTime("1h").sign(key.privateKey);
  const fetch = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const url = new URL(String((input as Request)?.url ?? input));
    const raw = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body ?? "");
    seen.urls.push(url.origin + url.pathname);
    seen.bodies.push(raw);
    const form = Object.fromEntries(new URLSearchParams(raw));
    if (url.origin === ISS && url.pathname === "/.well-known/openid-configuration")
      return Response.json({ issuer: ISS, jwks_uri: ISS + "/jwks", revocation_endpoint: ISS + "/oauth/revoke" });
    if (url.origin === ISS && url.pathname === "/jwks") return Response.json({ keys: [jwk] });
    if (url.origin === ISS && url.pathname === "/api/accounts/oauth/token") {
      seen.token.push(form);
      const refresh = form.grant_type === "refresh_token";
      return Response.json({ access_token: refresh ? tokens.access2 : tokens.access, refresh_token: refresh ? tokens.refresh2 : tokens.refresh,
        id_token: await idToken(), token_type: "Bearer", expires_in: 3600, scope: "openid email chatgpt.tokens.use.direct" });
    }
    if (url.origin === ISS && url.pathname === "/oauth/revoke") { seen.revoke.push(form); return new Response("", { status: 200 }); }
    if (url.href === "https://api.openai.com/v1/models") return Response.json({ models: [{ slug: "synthetic-model", display_name: "Synthetic", visibility: "list" }] });
    return new Response("not found", { status: 404 });
  });
  return { fetch, tokens, seen, setNonce: (n: string) => { nonce = n; } };
}

// The installed wiring of server/index.ts: the guard is installed over the (stubbed) network before the app is made,
// and AI hosts are decided by the app's own AiConsent.
async function installedApp() {
  const openai = await fakeOpenAI();
  vi.stubGlobal("fetch", openai.fetch);
  let consent: AiConsent | undefined;
  const guard = new EgressGuard((u, m, b) => consent?.authorize(u, m, b) ?? false).install();
  const t = testStore();
  const made = await createApp(t.store, true);
  consent = made.aiConsent;
  const b = await made.app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
  const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
  const seen: string[] = [];
  const call = async (method: "GET" | "POST", url: string, payload?: object) => {
    const r = await made.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
    seen.push(r.statusCode + JSON.stringify(r.headers) + r.body);
    return r;
  };
  const close = async () => { guard.uninstall(); await made.app.close(); t.clean(); };
  return { ...made, t, guard, openai, call, seen, close };
}
async function signIn(s: Awaited<ReturnType<typeof installedApp>>) {
  const start = await s.call("POST", "/api/auth/chatgpt/start", {});
  const authorize = new URL(start.json().url);
  s.openai.setNonce(authorize.searchParams.get("nonce")!);
  const q = new URLSearchParams({ state: authorize.searchParams.get("state")!, code: s.openai.tokens.code, client_id: "client-SYNTH" });
  return s.call("GET", "/auth/callback?" + q);
}
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); }
  return out;
};

// ── F-06: ChatGPT sign-in, refresh and remote revoke through the installed guard ─────────────
it("V8-G01: (F-06) 설치판 배선(EgressGuard+AI 동의)에서 ChatGPT 로그인 코드 교환이 되고 토큰은 금고에 저장된다. 교환 본문은 URLSearchParams 그대로 나간다", async () => {
  const s = await installedApp();
  try {
    expect((await s.call("POST", "/api/ai/consent", { enabled: true })).statusCode).toBe(200);
    const cb = await signIn(s);
    expect([cb.statusCode, cb.headers.location]).toEqual([302, "/?connected=1"]);
    const saved = await s.vault.read<Account>("chatgpt");
    expect(saved).toMatchObject({ clientId: "client-SYNTH", subject: "user-SYNTH", accessToken: s.openai.tokens.access, refreshToken: s.openai.tokens.refresh });
    expect(s.openai.seen.token).toEqual([expect.objectContaining({ grant_type: "authorization_code", code: s.openai.tokens.code, client_id: "client-SYNTH" })]);
    // The body reached the network layer as URLSearchParams (auth.ts unchanged); the guard read it as its text.
    expect(s.openai.fetch.mock.calls.some(([, init]) => (init as RequestInit)?.body instanceof URLSearchParams)).toBe(true);
    expect((await s.call("GET", "/api/status")).json().auth).toMatchObject({ connected: true, planAuthorized: true });
    expect(s.guard.records.filter((r) => !r.allowed)).toEqual([]);
    expect(s.guard.records.filter((r) => r.host === "auth.openai.com").map((r) => r.method)).toContain("POST");
  } finally { await s.close(); }
});

it("V8-G02: (F-06) 설치판 배선에서 만료된 토큰의 갱신(refresh_token 교환)이 되고, 새 토큰으로 바뀌며 모델 목록 조회가 된다", async () => {
  const s = await installedApp();
  try {
    await s.call("POST", "/api/ai/consent", { enabled: true });
    expect((await signIn(s)).statusCode).toBe(302);
    const old = (await s.vault.read<Account>("chatgpt"))!;
    await s.vault.write("chatgpt", { ...old, expiresAt: 0 });
    const models = await s.call("GET", "/api/auth/chatgpt/models");
    expect([models.statusCode, models.json()]).toEqual([200, [{ id: "synthetic-model", name: "Synthetic" }]]);
    expect(s.openai.seen.token.map((x) => x.grant_type)).toEqual(["authorization_code", "refresh_token"]);
    expect(s.openai.seen.token[1].refresh_token).toBe(s.openai.tokens.refresh);
    expect(await s.vault.read<Account>("chatgpt")).toMatchObject({ accessToken: s.openai.tokens.access2, refreshToken: s.openai.tokens.refresh2 });
  } finally { await s.close(); }
});

it("V8-G03: (F-06) 설치판 배선에서 연결 해제가 원격 폐기(revoke)를 호출하고, 받아들여지면 remoteRevoked가 true다", async () => {
  const s = await installedApp();
  try {
    await s.call("POST", "/api/ai/consent", { enabled: true });
    expect((await signIn(s)).statusCode).toBe(302);
    const out = await s.call("POST", "/api/auth/chatgpt/logout", {});
    expect(out.json()).toMatchObject({ ok: true, remoteRevoked: true });
    expect(s.openai.seen.revoke).toEqual([{ token: s.openai.tokens.refresh, token_type_hint: "refresh_token", client_id: "client-SYNTH" }]);
    expect(await s.vault.read("chatgpt")).toBeUndefined();
    expect((s.t.store.db.prepare("SELECT detail FROM audit WHERE action='oauth_disconnected'").all() as { detail: string }[]).map((r) => r.detail)).toEqual(["원격 세션 및 로컬 연결 해제"]);
  } finally { await s.close(); }
});

it("V8-G04: (F-06) 토큰(접근·갱신·ID·인증 코드)은 API 응답, 콘솔·표준 출력, 감사 기록, AI 전송 기록, 백업, 내보내기, 데이터 폴더 파일에 나오지 않는다", async () => {
  const printed: string[] = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { printed.push(a.map(String).join(" ")); });
  const out = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const s = await installedApp();
  try {
    await s.call("POST", "/api/ai/consent", { enabled: true });
    expect((await signIn(s)).statusCode).toBe(302);
    const saved = (await s.vault.read<Account>("chatgpt"))!;
    await s.vault.write("chatgpt", { ...saved, expiresAt: 0 });
    expect((await s.call("GET", "/api/auth/chatgpt/models")).statusCode).toBe(200);
    const review = newReview(request()); review.evidence = basis(); review.status = "completed"; s.t.store.saveReview(review);
    for (const path of ["/api/status", "/api/ai/send-log", "/api/ai/consent", `/api/reviews/${review.id}/export?format=markdown`, `/api/reviews/${review.id}/export?format=csv`, "/api/beta/backup"])
      expect((await s.call("GET", path)).statusCode, path).toBe(200);
    const idToken = (await s.vault.read<Account>("chatgpt"))!.idToken;
    expect((await s.call("POST", "/api/auth/chatgpt/logout", {})).json().remoteRevoked).toBe(true);
    out.mockRestore();
    err.mockRestore();
    const secrets = [s.openai.tokens.access, s.openai.tokens.refresh, s.openai.tokens.access2, s.openai.tokens.refresh2, s.openai.tokens.code, idToken];
    const places: Record<string, string> = {
      responses: s.seen.join("\n"),
      printed: printed.join("\n"),
      audit: JSON.stringify(s.t.store.db.prepare("SELECT * FROM audit").all()),
      sendLog: JSON.stringify(s.aiConsent.log()),
      guardRecords: JSON.stringify(s.guard.records),
      backup: JSON.stringify(makeBackup(s.t.store)),
      betaBackup: JSON.stringify(betaBackup(s.t.store)),
      files: walk(s.t.store.dir).map((f) => readFileSync(f).toString("latin1")).join("\n"),
    };
    for (const [where, text] of Object.entries(places))
      for (const secret of secrets) expect(text.includes(secret), where).toBe(false);
    // The send log keeps only host, method, size and a hash for the sign-in calls.
    expect((s.aiConsent.log() as { host: string; outcome: string }[]).filter((x) => x.host === "auth.openai.com").every((x) => x.outcome === "sent")).toBe(true);
  } finally { await s.close(); }
}, 30000);

it("V8-G05: (F-06) AI 전송 동의가 꺼져 있으면 코드 교환·갱신·원격 폐기는 여전히 연결 전에 막히고(스텁 0건), 로컬 연결 해제는 된다", async () => {
  const s = await installedApp();
  try {
    expect((await s.call("GET", "/api/ai/consent")).json().enabled).toBe(false);
    const cb = await signIn(s);
    expect(cb.statusCode).toBe(400);
    expect(cb.body).toContain("허용 목록에 없는 외부 주소로는 연결하지 않습니다: auth.openai.com");
    expect(await s.vault.read("chatgpt")).toBeUndefined();
    // A stored account cannot refresh or revoke remotely without consent either.
    const account: Account = { clientId: "client-SYNTH", subject: "user-SYNTH", email: "", accessToken: synthetic("A"), refreshToken: synthetic("R"), idToken: synthetic("I"), scopes: ["chatgpt.tokens.use.direct"], expiresAt: 0 };
    await s.vault.write("chatgpt", account);
    expect((await s.call("GET", "/api/auth/chatgpt/models")).statusCode).not.toBe(200);
    expect((await s.call("POST", "/api/auth/chatgpt/logout", {})).json()).toMatchObject({ ok: true, remoteRevoked: false });
    expect(await s.vault.read("chatgpt")).toBeUndefined();
    expect(s.openai.fetch).not.toHaveBeenCalled();
    expect(s.guard.records.filter((r) => r.category === "ai").every((r) => !r.allowed)).toBe(true);
  } finally { await s.close(); }
});

it("V8-G06: (F-06) 고친 것은 URLSearchParams 본문을 그 글자로 읽는 것뿐이다 — api.openai.com에는 승인한 미리보기와 같은 글자일 때 1회만 나가고, 스트림·바이트 본문은 계속 막힌다", async () => {
  const t = testStore();
  try {
    const consent = new AiConsent(t.store), sent: string[] = [];
    const ai = new EgressGuard((u, m, b) => consent.authorize(u, m, b)).wrapFetch((async (_u: unknown, init?: RequestInit) => { sent.push(String(init?.body)); return new Response("{}"); }) as typeof fetch);
    const form = () => new URLSearchParams({ input: "회사 자료 " + synthetic("DATA") });
    expect(bodyText(new URLSearchParams({ a: "1 2", b: "가" }))).toBe("a=1+2&b=%EA%B0%80");
    expect(bodyText(new Uint8Array([1]))).toBe("\u0000binary");
    expect(bodyText(undefined)).toBeUndefined();
    consent.enable();
    const body = form();
    await expect(ai("https://api.openai.com/v1/responses", { method: "POST", body })).rejects.toBeInstanceOf(EgressBlocked); // not previewed
    consent.approve(consent.preview(body.toString()).previewId);
    expect((await ai("https://api.openai.com/v1/responses", { method: "POST", body })).status).toBe(200);
    await expect(ai("https://api.openai.com/v1/responses", { method: "POST", body })).rejects.toBeInstanceOf(EgressBlocked); // one approval, one send
    for (const bytes of [new Uint8Array([123, 125]), new Blob(["{}"]), new ReadableStream()])
      await expect(ai("https://api.openai.com/v1/responses", { method: "POST", body: bytes, duplex: "half" } as RequestInit)).rejects.toBeInstanceOf(EgressBlocked);
    await expect(ai("https://auth.openai.com/oauth/revoke", { method: "POST", body: new Uint8Array([1]) })).rejects.toBeInstanceOf(EgressBlocked);
    expect(sent).toEqual([body.toString()]);
  } finally { t.clean(); }
});

it.runIf(process.platform === "win32")("V8-G07: (F-06) Windows에서는 설치판 배선의 코드 교환 결과가 DPAPI 금고 파일에 저장되고, 파일에 토큰 글자가 없다", async () => {
  const t = testStore();
  try {
    const openai = await fakeOpenAI();
    const consent = new AiConsent(t.store);
    consent.enable();
    const guarded = new EgressGuard((u, m, b) => consent.authorize(u, m, b)).wrapFetch(openai.fetch as unknown as typeof fetch);
    const vault = new Vault(t.store.dir, false);
    const auth = new ChatGPTAuth(t.store, vault, guarded);
    const authorize = new URL((await auth.start("http://127.0.0.1:4317")).url);
    openai.setNonce(authorize.searchParams.get("nonce")!);
    await auth.callback({ state: authorize.searchParams.get("state")!, code: openai.tokens.code, client_id: "client-SYNTH" });
    const file = readFileSync(join(t.store.dir, "chatgpt.dpapi"), "utf8");
    expect(file.trim()).toMatch(/^[0-9a-f]+$/); // DPAPI blob in lowercase hex (V8-H11 format)
    for (const secret of [openai.tokens.access, openai.tokens.refresh]) {
      expect(file.includes(secret)).toBe(false);
      expect(Buffer.from(file.trim(), "hex").toString("latin1").includes(secret)).toBe(false);
    }
    expect((await vault.read<Account>("chatgpt"))?.accessToken).toBe(openai.tokens.access);
    expect((await auth.logout()).remoteRevoked).toBe(true);
  } finally { t.clean(); }
}, 60000);

// ── F-05: guard gaps (real sockets on 127.0.0.x; 127.0.0.2 stands in for an outside host) ─────────
async function listen(host: string, handler: http.RequestListener = (q, s) => s.end("reached " + q.url)) {
  const hits: string[] = [];
  const server = http.createServer((q, s) => { hits.push(String(q.url)); handler(q, s); });
  // This PC sometimes answers a loopback listen with EFAULT (known local flake, unrelated to the guard); try again.
  for (let attempt = 1; ; attempt++) {
    const failed = await new Promise<Error | undefined>((r) => {
      server.once("error", r);
      server.listen(0, host, () => { server.off("error", r); r(undefined); });
    });
    if (!failed) break;
    if ((failed as NodeJS.ErrnoException).code !== "EFAULT" || attempt >= 5) throw failed;
    await new Promise((r) => setTimeout(r, 100));
  }
  const port = (server.address() as net.AddressInfo).port;
  return { server, hits, port, close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }) };
}
const reply = (r: http.ClientRequest) => new Promise<string>((ok, fail) => {
  r.on("response", (res) => { let s = ""; res.on("data", (d) => (s += d)); res.on("end", () => ok(s)); });
  r.on("error", fail);
  r.end();
});

it("V8-O03: (F-05) http(s).request·get은 url 인자와 options를 합친 실제 접속 대상(hostname/host)을 검사한다", async () => {
  const outside = await listen("127.0.0.2"), inside = await listen("127.0.0.1");
  const guard = new EgressGuard().install();
  try {
    const p = outside.port;
    // Before the fix the guard checked only the url argument and Node connected to options.hostname (PoC "connected to 127.0.0.2").
    expect(() => http.request(`http://127.0.0.1:${p}/`, { hostname: "127.0.0.2", port: p })).toThrow(EgressBlocked);
    expect(() => http.get(new URL(`http://127.0.0.1:${p}/`), { hostname: "127.0.0.2", port: p })).toThrow(EgressBlocked);
    expect(() => http.request({ host: "127.0.0.2", port: p })).toThrow(EgressBlocked);
    expect(() => http.request({ host: "127.0.0.2", port: p, setHost: false, headers: { host: "127.0.0.1" } })).toThrow(EgressBlocked);
    expect(() => https.request("https://www.law.go.kr/x", { hostname: "evil.example" })).toThrow(EgressBlocked);
    expect(() => https.get({ hostname: "www.law.go.kr", protocol: "http:" } as https.RequestOptions)).toThrow(EgressBlocked); // public, but not https
    expect(outside.hits).toEqual([]);
    // Node prefers hostname over host and options over the url; loopback is still reached the same way.
    expect(await reply(http.request(`http://127.0.0.2:${inside.port}/a`, { hostname: "127.0.0.1" }))).toBe("reached /a");
    expect(await reply(http.request({ host: "127.0.0.1", port: inside.port, path: "/b" }))).toBe("reached /b");
    expect(await reply(http.request(`http://127.0.0.1:${inside.port}/c`, { host: "127.0.0.2" }))).toBe("reached /c");
    expect(effectiveRequestTarget([`http://127.0.0.1:1/`, { hostname: "127.0.0.2" }], "http:").host).toBe("127.0.0.2");
    expect(effectiveRequestTarget([{ host: "www.law.go.kr:443" }], "https:").host).toBe("www.law.go.kr");
    expect(effectiveRequestTarget([{ hostname: "::1" }], "http:").host).toBe("::1");
    expect(effectiveRequestTarget([{ socketPath: "\\\\.\\pipe\\x", hostname: "evil.example" }], "http:").host).toBe("localhost");
    expect(guard.records.filter((r) => r.host === "127.0.0.2" && r.allowed)).toEqual([]);
  } finally { guard.uninstall(); await outside.close(); await inside.close(); }
});

it("V8-O04: (F-05) 리다이렉트를 따라가는 fetch는 매 Location을 다시 검사하고(20번 한도), 다른 출처로는 인증 머리글을 넘기지 않는다", async () => {
  const outside = await listen("127.0.0.2");
  let base = "";
  const auths: (string | undefined)[] = [], bodies: string[] = [];
  const inside = await listen("127.0.0.1", (q, s) => {
    auths.push(q.headers.authorization);
    let b = ""; q.on("data", (d) => (b += d));
    q.on("end", () => {
      bodies.push(q.method + " " + q.url + " " + b);
      const to: Record<string, string> = { "/out": `http://127.0.0.2:${outside.port}/collect`, "/name": "http://evil.example/collect", "/hop1": "/hop2",
        "/hop2": `http://127.0.0.2:${outside.port}/late`, "/loop": "/loop", "/keep": "/done", "/cross": `http://localhost:${new URL(base).port}/done` };
      if (q.url === "/307") { s.writeHead(307, { location: "/done" }); return s.end(); }
      if (to[q.url!]) { s.writeHead(302, { location: to[q.url!] }); return s.end(); }
      s.end("done " + b);
    });
  });
  base = `http://127.0.0.1:${inside.port}`;
  const guard = new EgressGuard().install();
  try {
    for (const path of ["/out", "/name", "/hop1"]) await expect(fetch(base + path)).rejects.toBeInstanceOf(EgressBlocked);
    expect(outside.hits).toEqual([]);
    await expect(fetch(base + "/loop")).rejects.toThrow("redirect count exceeded");
    // Loopback redirects still work, including a 307 that sends the same body again.
    expect(await (await fetch(base + "/keep")).text()).toBe("done ");
    const r307 = await fetch(base + "/307", { method: "POST", body: "same-body", headers: { "content-type": "text/plain" } });
    expect(await r307.text()).toBe("done same-body");
    auths.length = 0;
    expect(await (await fetch(base + "/cross", { headers: { authorization: "Bearer " + synthetic("T") } })).text()).toBe("done ");
    expect(auths.length).toBe(2);
    expect(auths[1]).toBeUndefined(); // dropped on the cross-origin hop (port differs)
    // redirect:"error" (public APIs, OAuth) and "manual" behave as before.
    await expect(fetch(base + "/out", { redirect: "error" })).rejects.toThrow(TypeError);
    const manual = await fetch(base + "/out", { redirect: "manual" });
    expect([manual.status, manual.headers.get("location")]).toEqual([302, `http://127.0.0.2:${outside.port}/collect`]);
    expect(outside.hits).toEqual([]);
    expect(guard.records.filter((r) => r.host === "127.0.0.2" && r.allowed)).toEqual([]);
  } finally { guard.uninstall(); await outside.close(); await inside.close(); }
});

it("V8-O05: (F-05) 리다이렉트로 AI 주소에 닿아도 동의·승인 검사를 다시 하고, 공공 API의 redirect:error와 AI 승인 전송은 그대로다 (스텁 네트워크)", async () => {
  const t = testStore();
  try {
    const consent = new AiConsent(t.store), calls: { url: string; redirect?: string; body?: string }[] = [];
    const routes: Record<string, Response | (() => Response)> = {};
    const network = (async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      calls.push({ url, redirect: init?.redirect, body: init?.body === undefined ? undefined : String(init.body) });
      const r = routes[url];
      return typeof r === "function" ? r() : r ?? new Response("ok");
    }) as typeof fetch;
    const f = new EgressGuard((u, m, b) => consent.authorize(u, m, b)).wrapFetch(network);
    consent.enable();
    const body = JSON.stringify({ input: "검토 " + synthetic("DATA") });
    // A public host answering 307 to the AI host: the hop is checked as an AI send of that body (not approved -> refused).
    routes["https://www.law.go.kr/x"] = () => new Response(null, { status: 307, headers: { location: "https://api.openai.com/v1/responses" } });
    await expect(f("https://www.law.go.kr/x", { method: "POST", body })).rejects.toBeInstanceOf(EgressBlocked);
    expect(calls.map((c) => c.url)).toEqual(["https://www.law.go.kr/x"]);
    // An approved AI send goes once; a 307 from the AI host would send it again, which needs a second approval.
    consent.approve(consent.preview(body).previewId);
    routes["https://api.openai.com/v1/responses"] = () => new Response(null, { status: 307, headers: { location: "https://api.openai.com/v1/other" } });
    await expect(f("https://api.openai.com/v1/responses", { method: "POST", body })).rejects.toBeInstanceOf(EgressBlocked);
    expect(calls.filter((c) => c.url.startsWith("https://api.openai.com")).length).toBe(1);
    // Unchanged paths: public API with redirect:"error" is passed through as is; an approved AI send without redirect works.
    calls.length = 0;
    expect((await f("https://apis.data.go.kr/x", { redirect: "error" })).status).toBe(200);
    delete routes["https://api.openai.com/v1/responses"];
    consent.approve(consent.preview(body).previewId);
    expect((await f("https://api.openai.com/v1/responses", { method: "POST", body })).status).toBe(200);
    expect(calls).toEqual([{ url: "https://apis.data.go.kr/x", redirect: "error", body: undefined }, { url: "https://api.openai.com/v1/responses", redirect: "manual", body }]);
    // A redirect to plain http of an allow-listed public host is refused like a first request would be.
    routes["https://www.law.go.kr/y"] = () => new Response(null, { status: 302, headers: { location: "http://www.law.go.kr/y" } });
    await expect(f("https://www.law.go.kr/y")).rejects.toBeInstanceOf(EgressBlocked);
  } finally { t.clean(); }
});

it("V8-O06: (F-05) 원시 소켓(net·tls·http2·가드 밖에서 잡아 둔 fetch)도 허용 목록 밖 주소로는 연결되지 않고, 루프백·로컬 파이프는 그대로다", async () => {
  const outside = await listen("127.0.0.2"), inside = await listen("127.0.0.1");
  const accepted: string[] = [];
  outside.server.on("connection", () => accepted.push("tcp"));
  const unguardedFetch = globalThis.fetch; // captured before install, as a module that saved fetch early would
  const guard = new EgressGuard().install();
  const refused = (s: net.Socket) => new Promise<Error>((ok) => { s.on("error", ok); s.on("connect", () => ok(new Error("connected"))); });
  const pipe = process.platform === "win32" ? `\\\\.\\pipe\\she-egress-${randomBytes(6).toString("hex")}` : join(tmpdir(), `she-egress-${randomBytes(6).toString("hex")}.sock`);
  const local = net.createServer((c) => c.end("pipe-ok"));
  await new Promise<void>((r) => local.listen(pipe, r));
  try {
    const p = outside.port;
    for (const open of [() => net.connect(p, "127.0.0.2"), () => net.connect({ host: "127.0.0.2", port: p }), () => new net.Socket().connect(p, "127.0.0.2"),
      () => tls.connect({ host: "127.0.0.2", port: p }), () => net.connect({ host: "evil.example", port: 443 })])
      expect(await refused(open())).toBeInstanceOf(EgressBlocked);
    const h2 = http2.connect(`http://127.0.0.2:${p}`);
    expect(await new Promise((ok) => h2.on("error", ok))).toBeInstanceOf(EgressBlocked);
    h2.destroy();
    const viaUndici = await unguardedFetch(`http://127.0.0.2:${p}/`).catch((e: Error) => e);
    expect((viaUndici as Error & { cause?: unknown }).cause).toBeInstanceOf(EgressBlocked);
    expect([accepted, outside.hits]).toEqual([[], []]);
    // Loopback TCP and a local pipe still connect (the app's own server, IPC).
    const ok = net.connect(inside.port, "127.0.0.1");
    expect(await new Promise((r) => { ok.on("connect", () => r("connected")); ok.on("error", r); })).toBe("connected");
    ok.destroy();
    const viaPipe = net.connect(pipe);
    expect(await new Promise((r) => { let s = ""; viaPipe.on("data", (d) => (s += d)); viaPipe.on("end", () => r(s)); viaPipe.on("error", r); })).toBe("pipe-ok");
    expect(guard.records.filter((r) => r.method === "CONNECT").every((r) => !r.allowed)).toBe(true);
  } finally {
    guard.uninstall();
    await new Promise((r) => local.close(r));
    await outside.close(); await inside.close();
  }
  // Uninstall restores the original connect.
  const after = net.connect(outside.port, "127.0.0.2");
  expect(await refused(after)).not.toBeInstanceOf(EgressBlocked);
  after.destroy();
});

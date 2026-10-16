import { it, expect, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer, connect, type AddressInfo } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createApp } from "../server/app.js";
import { LAUNCH_HEADER, LAUNCH_MISSING, LAUNCH_REFUSED, launchTokenMatches, takeLaunchToken } from "../server/launch-token-v8.js";
import { testStore } from "./helpers.js";

// H1 (docs/implementation-v8/security-review-plan.md): in the installed build only the browser the launcher opened gets a
// session. Every value here is synthetic and made fresh per test; none is printed.
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
const HOST = "127.0.0.1:4317";
const synthetic = () => randomBytes(32).toString("base64url");
async function launched() {
  const t = testStore(), token = synthetic();
  const { app } = await createApp(t.store, true, undefined, undefined, undefined, token);
  const boot = (headers: Record<string, string> = {}) => app.inject({ url: "/api/bootstrap", headers: { host: HOST, ...headers } });
  return { t, app, token, boot };
}
const cookieOf = (r: { cookies: { name: string; value: string }[] }) => `${r.cookies[0].name}=${r.cookies[0].value}`;

it("V8-X01: 실행 토큰이 있으면 토큰 없음·틀린 토큰·길이가 다른 토큰의 bootstrap은 403이고 세션 쿠키를 주지 않는다", async () => {
  const { t, app, token, boot } = await launched();
  try {
    const wrong = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    for (const r of [await boot(), await boot({ [LAUNCH_HEADER]: wrong }), await boot({ [LAUNCH_HEADER]: token + "x" }),
      await boot({ [LAUNCH_HEADER]: token.slice(0, 20) }), await boot({ [LAUNCH_HEADER]: "" })]) {
      expect(r.statusCode).toBe(403);
      expect(r.json()).toEqual({ error: LAUNCH_REFUSED });
      expect(r.cookies).toEqual([]);
    }
    // A made-up session cookie is not a session either.
    expect((await boot({ cookie: "she_session=" + synthetic() })).statusCode).toBe(403);
    // Without a session every other API stays closed as before.
    expect((await app.inject({ url: "/api/reviews", headers: { host: HOST } })).statusCode).toBe(401);
    expect(launchTokenMatches(token, [token, token])).toBe(false);
    expect(launchTokenMatches(token, undefined)).toBe(false);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X02: 맞는 토큰이면 200과 세션 쿠키를 주고, 그 쿠키만 있는 뒤의 bootstrap(기존 화면 /, ChatGPT 연결 복귀 /?connected=1)도 200이다", async () => {
  const { t, app, token, boot } = await launched();
  try {
    const first = await boot({ [LAUNCH_HEADER]: token });
    expect(first.statusCode).toBe(200);
    expect(first.cookies[0]).toMatchObject({ name: "she_session", httpOnly: true, sameSite: "Strict", path: "/" });
    const again = await boot({ cookie: cookieOf(first), referer: `http://${HOST}/?connected=1` });
    expect(again.statusCode).toBe(200);
    expect(again.json().csrf).toBe(first.json().csrf);
    expect(again.cookies).toEqual([]);
    expect((await app.inject({ url: "/api/reviews", headers: { host: HOST, cookie: cookieOf(first) } })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X03: 다른 사람이 토큰으로 세션을 받은 뒤에도 쿠키·토큰 없는 요청(다른 프로세스·다른 Windows 사용자)은 403이다", async () => {
  const { t, app, token, boot } = await launched();
  try {
    expect((await boot({ [LAUNCH_HEADER]: token })).statusCode).toBe(200);
    const other = await boot();
    expect(other.statusCode).toBe(403);
    expect(other.cookies).toEqual([]);
    expect((await app.inject({ method: "POST", url: "/api/shutdown", headers: { host: HOST, "content-type": "application/json" }, payload: "{}" })).statusCode).toBe(401);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X04: 실행 토큰은 응답 본문·머리글, 감사 기록, 콘솔·표준 출력, 데이터 폴더 파일 어디에도 나오지 않는다", async () => {
  const printed: string[] = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { printed.push(a.map(String).join(" ")); });
  const out = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const { t, app, token, boot } = await launched();
  try {
    const seen: string[] = [];
    const keep = (r: { statusCode: number; headers: unknown; body: string }) => { seen.push(r.statusCode + JSON.stringify(r.headers) + r.body); return r; };
    keep(await boot());
    keep(await boot({ [LAUNCH_HEADER]: token + "x" }));
    keep(await boot({ [LAUNCH_HEADER]: token.slice(1) + "_" }));
    const ok = keep(await boot({ [LAUNCH_HEADER]: token })) as Awaited<ReturnType<typeof boot>>;
    keep(await boot({ cookie: cookieOf(ok), [LAUNCH_HEADER]: token }));
    keep(await app.inject({ url: "/api/status", headers: { host: HOST, cookie: cookieOf(ok) } }));
    keep(await app.inject({ url: "/api/beta/notice", headers: { host: HOST, cookie: cookieOf(ok) } }));
    expect(seen.length).toBe(7);
    expect(seen.filter((s) => s.includes(token))).toEqual([]);
    expect(JSON.stringify(t.store.db.prepare("SELECT * FROM audit").all()).includes(token)).toBe(false);
    out.mockRestore();
    err.mockRestore();
    expect(printed.filter((s) => s.includes(token))).toEqual([]);
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(join(d, n)); };
    walk(t.store.dir);
    expect(files.filter((f) => readFileSync(f).includes(token))).toEqual([]);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X05: 실행 토큰이 없으면(개발·시험) bootstrap은 지금과 같다 — 머리글 없이 200과 세션 쿠키, 머리글은 무시", async () => {
  vi.stubEnv("SHE_LAUNCH_TOKEN", "");
  const t = testStore();
  const { app } = await createApp(t.store, true);
  try {
    const plain = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    expect(plain.statusCode).toBe(200);
    expect(plain.cookies[0].name).toBe("she_session");
    expect(Object.keys(plain.json()).sort()).toEqual(["csrf", "regions", "version"]);
    expect((await app.inject({ url: "/api/bootstrap", headers: { host: HOST, [LAUNCH_HEADER]: synthetic() } })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X06: 서버는 시작하자마자 SHE_LAUNCH_TOKEN을 환경에서 지워 자식 프로세스가 물려받지 않고, 실행기는 토큰을 명령줄이 아닌 환경과 주소 조각으로만 넘긴다", () => {
  const token = synthetic();
  vi.stubEnv("SHE_LAUNCH_TOKEN", token);
  expect(takeLaunchToken()).toBe(token);
  expect(process.env.SHE_LAUNCH_TOKEN).toBeUndefined();
  expect(takeLaunchToken()).toBeUndefined();
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String('SHE_LAUNCH_TOKEN' in process.env))"], { encoding: "utf8", windowsHide: true });
  expect(child.stdout).toBe("false");
  // The entry point takes it before anything that could start a child process (DPAPI helper, parser workers).
  const index = readFileSync("server/index.ts", "utf8");
  const taken = index.indexOf("const launchToken = takeLaunchToken();");
  expect(taken).toBeGreaterThan(0);
  for (const later of ["new EgressGuard(", "openProductionCipher(dataDir)", "createApp(", "purgeExpired(store)"])
    expect(index.indexOf(later)).toBeGreaterThan(taken);
  expect(index).toContain("undefined, launchToken)");
  const launcher = readFileSync("packaging/msix/launcher/Launcher.cs", "utf8");
  for (const s of ["new RNGCryptoServiceProvider()", "new byte[32]", 'EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchToken', '"/beta/#launch=" + token', 'req.Headers["x-she-launch"] = launchToken', "OpenBrowser(p, t.Groups[1].Value)", "OpenBrowser(port, launchToken)", "security.SetAccessRuleProtection(true, false)"])
    expect(launcher).toContain(s);
  expect(launcher).toContain('new ProcessStartInfo(Path.Combine(app, "node", "node.exe"), "server\\\\index.js")');
  expect(launcher).not.toMatch(/OpenBrowser\(port\)|OpenBrowser\(p\)/);
});

it("V8-X07: 베타 화면은 #launch= 값을 읽어 bootstrap 머리글로만 한 번 보내고, 주소에서 바로 지워 해시 경로 #/만 남긴다", async () => {
  const { takeLaunch } = await import("../beta/api.js");
  const token = synthetic();
  expect(takeLaunch("#launch=" + token)).toEqual({ token, hash: "#/" });
  for (const h of ["", "#/", "#/review/abc", "#launch=", "#launch=short", "#launch=" + token + "&x=1", "#/review?launch=" + token])
    expect(takeLaunch(h)).toEqual({ hash: h });
  vi.resetModules();
  const replaceState = vi.fn();
  vi.stubGlobal("location", { hash: "#launch=" + token, pathname: "/beta/", search: "" });
  vi.stubGlobal("history", { state: null, replaceState });
  const sent: Record<string, string>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { headers?: Record<string, string> }) => {
    sent.push({ ...(init.headers ?? {}) });
    return new Response(JSON.stringify({ csrf: "c", regions: { asOf: "", regions: [] }, version: "0.1.0" }), { status: 200 });
  }));
  const api = await import("../beta/api.js");
  expect(replaceState).toHaveBeenCalledWith(null, "", "/beta/#/");
  await api.boot();
  await api.boot();
  expect(sent).toEqual([{ [LAUNCH_HEADER]: token }, {}]);
  // A refused bootstrap shows the server's short message instead of "refresh the screen".
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: LAUNCH_REFUSED }), { status: 403 })));
  await expect(api.boot()).rejects.toMatchObject({ status: 403, message: LAUNCH_REFUSED });
});

// H1 token-less path (security-review-plan 8.5, user decision 2026-10-17): the installed build fails closed.
it("V8-X08: 실행기는 매 시작마다 토큰을 만들어 서버 시작 전에 넣고, 서버는 SHE_INSTALLED=1인데 토큰이 없으면 아무것도 열기 전에 종료한다(개발·시험 모드는 그대로)", async () => {
  const launcher = readFileSync("packaging/msix/launcher/Launcher.cs", "utf8");
  const run = launcher.slice(launcher.indexOf("static int Run()"), launcher.indexOf("static void Quit()"));
  const made = run.indexOf("launchToken = NewToken();"), given = run.indexOf('psi.EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchToken;'), started = run.indexOf("server.Start();");
  expect(made).toBeGreaterThan(0);
  expect(given).toBeGreaterThan(made);
  expect(started).toBeGreaterThan(given);
  // No branch between making the token and handing it to node can skip it, and the token is never empty (32 random bytes).
  expect(run.slice(made, given)).not.toMatch(/\bif\s*\(|\breturn\b/);
  expect(launcher.slice(launcher.indexOf("static string NewToken()"))).toMatch(/new byte\[32\][\s\S]*GetBytes\(bytes\)[\s\S]*ToBase64String\(bytes\)/);
  // server/index.ts: the check runs right after the token is taken, before the guard, storage, app or listen.
  const index = readFileSync("server/index.ts", "utf8");
  const taken = index.indexOf("const launchToken = takeLaunchToken();"), check = index.indexOf("if (isInstalled() && !launchToken) {");
  expect(check).toBeGreaterThan(taken);
  expect(index.slice(check, index.indexOf("}", check))).toMatch(/console\.error\(LAUNCH_MISSING\);\s*process\.exit\(1\);/);
  for (const later of ["new EgressGuard(", "mkdirSync(dataDir", "openProductionCipher(dataDir)", "createApp(", "app.listen("])
    expect(index.indexOf(later), later).toBeGreaterThan(check);
  // Development and test mode (no SHE_INSTALLED) keep the old token-less bootstrap.
  vi.stubEnv("SHE_INSTALLED", "");
  vi.stubEnv("SHE_LAUNCH_TOKEN", "");
  const t = testStore();
  const { app } = await createApp(t.store, true, undefined, undefined, undefined, takeLaunchToken());
  try {
    expect((await app.inject({ url: "/api/bootstrap", headers: { host: HOST } })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

// The real entry point, as the package runs it (node build/server/index.js). Synthetic data folder and token only.
const entry = () => resolve(process.env.SHE_TEST_BUILD || "build", "server", "index.js");
async function freePort() {
  for (let attempt = 1; ; attempt++) {
    const s = createServer();
    const port = await new Promise<number | Error>((r) => { s.once("error", r); s.listen(0, "127.0.0.1", () => r((s.address() as AddressInfo).port)); });
    if (typeof port === "number") { await new Promise((r) => s.close(r)); return port; }
    // listen EFAULT is a known flake on this PC; anything else is a real failure.
    if ((port as NodeJS.ErrnoException).code !== "EFAULT" || attempt >= 20) throw port;
    await new Promise((r) => setTimeout(r, 200));
  }
}
function startServer(env: NodeJS.ProcessEnv, cwd: string) {
  const child = spawn(process.execPath, [entry()], { env, cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (err += b));
  const exited = new Promise<number | null>((r) => child.once("exit", (code) => r(code)));
  const ready = async (ms: number) => {
    for (const end = Date.now() + ms; Date.now() < end && child.exitCode === null; ) {
      if (out.includes("SH·E ready")) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return out.includes("SH·E ready");
  };
  return { child, exited, ready, out: () => out, err: () => err };
}
const refusedAt = (port: number) => new Promise<string>((r) => {
  const s = connect(port, "127.0.0.1");
  s.once("connect", () => { s.destroy(); r("listening"); });
  s.once("error", (e: NodeJS.ErrnoException) => r(String(e.code)));
});
function baseEnv(dataDir: string, port: number) {
  const env: NodeJS.ProcessEnv = { ...process.env, SHE_DATA_DIR: dataDir, PORT: String(port) };
  for (const k of ["SHE_INSTALLED", "SHE_LAUNCH_TOKEN", "SHE_EPHEMERAL_AUTH"]) delete env[k];
  return env;
}

it("V8-X11: 실제 node build/server/index.js — SHE_INSTALLED=1에 토큰이 없거나 비어 있으면 듣지 않고 0이 아닌 코드로 끝나며, 표준 오류에는 짧은 한국어 문구만 나오고 데이터 폴더도 만들지 않는다", async () => {
  const work = mkdtempSync(join(tmpdir(), "she-x11-"));
  try {
    for (const token of [undefined, ""]) {
      const port = await freePort(), data = join(work, "data-" + (token === undefined ? "none" : "empty"));
      const env = { ...baseEnv(data, port), SHE_INSTALLED: "1", ...(token === undefined ? {} : { SHE_LAUNCH_TOKEN: token }) };
      const s = startServer(env, work);
      const code = await Promise.race([s.exited, new Promise<string>((r) => setTimeout(() => r("timeout"), 30000))]);
      if (code === "timeout") s.child.kill();
      expect(code).toBe(1);
      expect(s.err().trim()).toBe(LAUNCH_MISSING);
      expect(LAUNCH_MISSING).not.toMatch(/SHE_|=|[A-Z]:\\|\//);
      expect(s.out()).not.toContain("SH·E ready");
      expect(await refusedAt(port)).not.toBe("listening");
      expect(existsSync(data)).toBe(false); // exits before mkdir, storage key or database
    }
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 90000);

it("V8-X12: 실제 node build/server/index.js — 실행기처럼 토큰을 주면 설치판도 시작하고(토큰 머리글 200, 없으면 403), SHE_INSTALLED 없는 개발 실행은 토큰 없이 지금처럼 시작한다", async () => {
  const work = mkdtempSync(join(tmpdir(), "she-x12-"));
  try {
    for (const mode of ["installed", "development"] as const) {
      const token = synthetic();
      let started = false;
      for (let attempt = 1; attempt <= 3 && !started; attempt++) {
        const port = await freePort(), data = join(work, `${mode}-${attempt}`);
        const env = { ...baseEnv(data, port), ...(mode === "installed" ? { SHE_INSTALLED: "1", SHE_LAUNCH_TOKEN: token } : {}) };
        // cwd without data/public/bundle.json: start-up skips the large public-law import.
        const s = startServer(env, work);
        try {
          if (!(await s.ready(60000))) {
            if (/listen EFAULT/.test(s.err())) continue; // known local flake; start again on a new port
            throw new Error(`${mode} server did not start (exit ${s.child.exitCode})`);
          }
          started = true;
          const boot = (headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}/api/bootstrap`, { headers });
          if (mode === "installed") {
            expect((await boot()).status).toBe(403);
            expect((await boot({ [LAUNCH_HEADER]: token })).status).toBe(200);
          } else expect((await boot()).status).toBe(200);
          expect(s.out() + s.err()).not.toContain(token);
        } finally {
          s.child.kill();
          await Promise.race([s.exited, new Promise((r) => setTimeout(r, 10000))]);
        }
      }
      expect(started, mode).toBe(true);
    }
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}, 240000);

import { it, expect, vi, afterEach } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer, connect, type AddressInfo } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createApp } from "../server/app.js";
import {
  LAUNCH_HEADER, LAUNCH_MISSING, LAUNCH_REFUSED, LAUNCH_VALUE_FUTURE_SKEW_MS, LAUNCH_VALUE_LIFETIME_MS,
  launchValueChecker, mintLaunchValue, takeLaunchToken,
} from "../server/launch-token-v8.js";
import { testStore } from "./helpers.js";

// H1/F-09 (docs/implementation-v8/security-review-plan.md, .dryforge/spec.md): in the installed build only the browser the
// launcher opened gets a session, and every one-time value works once, for 5 minutes. Every key and value here is
// synthetic and made fresh per test; none is printed. Times come from Date.now(), so the date-matrix clock shift applies.
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
const HOST = "127.0.0.1:4317";
const synthetic = () => randomBytes(32).toString("base64url");
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// A value the launcher would make now (+ offset ms).
const mint = (key: string, offsetMs = 0) => mintLaunchValue(key, Date.now() + offsetMs);
// The checker reads Date.now() per call. Move this worker's clock by ms from the real (or date-matrix) clock; it keeps
// advancing, so Fastify inject still runs. No fake timers: inject can hang under them.
const realNow = Date.now.bind(Date);
const shiftClock = (ms: number) => vi.spyOn(Date, "now").mockImplementation(() => realNow() + ms);
// Unit checks on exact boundaries: a frozen clock, never used with inject.
const freezeClock = (ms: number) => vi.spyOn(Date, "now").mockReturnValue(ms);
// One character changed where every bit is used (issued time, nonce, signature parts).
const changedAt = (v: string, i: number) => v.slice(0, i) + B64URL[(B64URL.indexOf(v[i]) + 1) % 64] + v.slice(i + 1);
// 56 bytes in 75 characters leave 2 unused low bits in the last one: three other strings decode to the same bytes.
const sameBytesOtherStrings = (v: string) => [1, 2, 3].map((b) => v.slice(0, -1) + B64URL[B64URL.indexOf(v.at(-1)!) ^ b]);
type BootHeaders = Record<string, string | string[]>;
async function launched() {
  const t = testStore(), key = synthetic();
  const { app } = await createApp(t.store, true, undefined, undefined, undefined, key);
  const boot = (headers: BootHeaders = {}) => app.inject({ url: "/api/bootstrap", headers: { host: HOST, ...headers } });
  return { t, app, key, boot };
}
const cookieOf = (r: { cookies: { name: string; value: string }[] }) => `${r.cookies[0].name}=${r.cookies[0].value}`;
const expectRefused = (r: { statusCode: number; json(): unknown; cookies: unknown[] }) => {
  expect(r.statusCode).toBe(403);
  expect(r.json()).toEqual({ error: LAUNCH_REFUSED });
  expect(r.cookies).toEqual([]);
};

it("V8-X01: 실행 키가 있으면 머리글 없음·다른 키로 만든 값·길이가 다른 값·빈 값의 bootstrap은 403이고 세션 쿠키를 주지 않는다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const value = mint(key);
    for (const h of [undefined, mint(synthetic()), value + "x", value.slice(0, 20), value.slice(1), ""])
      expectRefused(await boot(h === undefined ? {} : { [LAUNCH_HEADER]: h }));
    // A made-up session cookie is not a session either.
    expectRefused(await boot({ cookie: "she_session=" + synthetic() }));
    // Without a session every other API stays closed as before.
    expect((await app.inject({ url: "/api/reviews", headers: { host: HOST } })).statusCode).toBe(401);
    // None of the refusals spent the real value.
    expect((await boot({ [LAUNCH_HEADER]: value })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X02: 맞는 1회용 값이면 200과 세션 쿠키를 주고, 그 쿠키만 있는 뒤의 bootstrap(기존 화면 /, ChatGPT 연결 복귀 /?connected=1)도 200이다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const first = await boot({ [LAUNCH_HEADER]: mint(key) });
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

it("V8-X03: 다른 사람이 1회용 값으로 세션을 받은 뒤에도 쿠키·값 없는 요청(다른 프로세스·다른 Windows 사용자)은 403이다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    expect((await boot({ [LAUNCH_HEADER]: mint(key) })).statusCode).toBe(200);
    expectRefused(await boot());
    expect((await app.inject({ method: "POST", url: "/api/shutdown", headers: { host: HOST, "content-type": "application/json" }, payload: "{}" })).statusCode).toBe(401);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X04: 실행 키와 1회용 값은 응답 본문·머리글, 감사 기록, 콘솔·표준 출력·오류, 데이터 폴더 파일 어디에도 나오지 않는다", async () => {
  const printed: string[] = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { printed.push(a.map(String).join(" ")); });
  const out = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { printed.push(String(c)); return true; });
  const { t, app, key, boot } = await launched();
  try {
    const [v1, v2, v3, expired, future, foreign] = [mint(key), mint(key), mint(key), mint(key, -LAUNCH_VALUE_LIFETIME_MS - 1000),
      mint(key, LAUNCH_VALUE_FUTURE_SKEW_MS + 1000), mint(synthetic())];
    const secrets = [key, v1, v2, v3, expired, future, foreign, changedAt(v1, 40), ...sameBytesOtherStrings(v2)];
    const seen: string[] = [];
    const keep = <R extends { statusCode: number; headers: unknown; body: string }>(r: R) => { seen.push(r.statusCode + JSON.stringify(r.headers) + r.body); return r; };
    keep(await boot());
    keep(await boot({ [LAUNCH_HEADER]: v1 + "x" }));
    keep(await boot({ [LAUNCH_HEADER]: key }));
    keep(await boot({ [LAUNCH_HEADER]: foreign }));
    keep(await boot({ [LAUNCH_HEADER]: expired }));
    keep(await boot({ [LAUNCH_HEADER]: future }));
    keep(await boot({ [LAUNCH_HEADER]: changedAt(v1, 40) }));
    for (const s of sameBytesOtherStrings(v2)) keep(await boot({ [LAUNCH_HEADER]: s }));
    keep(await boot({ [LAUNCH_HEADER]: [v3, v3] }));
    const ok = keep(await boot({ [LAUNCH_HEADER]: v1 }));
    expect(ok.statusCode).toBe(200);
    keep(await boot({ [LAUNCH_HEADER]: v1 }));
    keep(await boot({ cookie: cookieOf(ok), [LAUNCH_HEADER]: v2 }));
    keep(await boot({ cookie: cookieOf(ok), [LAUNCH_HEADER]: key }));
    keep(await app.inject({ url: "/api/status", headers: { host: HOST, cookie: cookieOf(ok) } }));
    keep(await app.inject({ url: "/api/beta/notice", headers: { host: HOST, cookie: cookieOf(ok) } }));
    expect(seen.length).toBe(17);
    const leaks = (s: string) => secrets.some((x) => s.includes(x));
    expect(seen.filter(leaks).length).toBe(0); // a count, so a failure never prints the synthetic values
    expect(leaks(JSON.stringify(t.store.db.prepare("SELECT * FROM audit").all()))).toBe(false);
    out.mockRestore();
    err.mockRestore();
    expect(printed.filter(leaks).length).toBe(0);
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : files.push(join(d, n)); };
    walk(t.store.dir);
    expect(files.filter((f) => { const b = readFileSync(f); return secrets.some((x) => b.includes(x)); }).length).toBe(0);
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
  // F-09: the launch key goes to node in the environment only. The browser and the launcher's own quit request get
  // one-time values made from it (never the key itself); a second start sends only a signal (V8-Q01..Q08 run the C# code).
  const launcher = readFileSync("packaging/msix/launcher/Launcher.cs", "utf8");
  for (const s of ["new RNGCryptoServiceProvider()", "new byte[32]", 'EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchKey', '"/beta/#launch=" + value',
    'req.Headers["x-she-launch"] = NewLaunchValue(launchKey, NowMs())', "OpenBrowser(ScreenUrl(port, NewLaunchValue(launchKey, NowMs())))", "security.SetAccessRuleProtection(true, false)"])
    expect(launcher).toContain(s);
  expect(launcher).toContain('new ProcessStartInfo(Path.Combine(app, "node", "node.exe"), "server\\\\index.js")');
  expect(launcher).not.toMatch(/OpenBrowser\(port\)|OpenBrowser\(p\)|launchToken|\\"token\\"/);
  // Every URL and the one bootstrap header carry a new value, not the key.
  const urls = [...launcher.matchAll(/ScreenUrl\(([^)]*)/g)].map((m) => m[1]).filter((a) => !a.startsWith("int "));
  expect(urls).toEqual(["port, NewLaunchValue(launchKey, NowMs(", "port, NewLaunchValue(key, nowMs("]);
  expect(launcher.match(/x-she-launch/g)?.length).toBe(1);
  expect(launcher).not.toMatch(/OpenBrowser\([^()]*launchKey|#launch="\s*\+\s*(launchKey|key)\b/);
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
  const made = run.indexOf("launchKey = NewLaunchKey();"), given = run.indexOf('psi.EnvironmentVariables["SHE_LAUNCH_TOKEN"] = launchKey;'), started = run.indexOf("server.Start();");
  expect(made).toBeGreaterThan(0);
  expect(given).toBeGreaterThan(made);
  expect(started).toBeGreaterThan(given);
  // No branch between making the token and handing it to node can skip it, and the token is never empty (32 random bytes).
  expect(run.slice(made, given)).not.toMatch(/\bif\s*\(|\breturn\b/);
  const keyMaker = launcher.slice(launcher.indexOf("static string NewLaunchKey()"));
  expect(keyMaker.slice(0, keyMaker.indexOf("\n    }"))).toMatch(/new byte\[32\][\s\S]*GetBytes\(bytes\)[\s\S]*return Base64Url\(bytes\);/);
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

it("V8-X12: 실제 node build/server/index.js — 실행기처럼 실행 키를 주면 설치판도 시작하고(1회용 값 200, 재사용·실행 키 자체·머리글 여러 개·없음은 403), SHE_INSTALLED 없는 개발 실행은 키 없이 지금처럼 시작한다", async () => {
  const work = mkdtempSync(join(tmpdir(), "she-x12-"));
  try {
    for (const mode of ["installed", "development"] as const) {
      const key = synthetic();
      let started = false;
      for (let attempt = 1; attempt <= 3 && !started; attempt++) {
        const port = await freePort(), data = join(work, `${mode}-${attempt}`);
        const env = { ...baseEnv(data, port), ...(mode === "installed" ? { SHE_INSTALLED: "1", SHE_LAUNCH_TOKEN: key } : {}) };
        // cwd without data/public/bundle.json: start-up skips the large public-law import.
        const s = startServer(env, work);
        const values: string[] = [];
        try {
          if (!(await s.ready(60000))) {
            if (/listen EFAULT/.test(s.err())) continue; // known local flake; start again on a new port
            throw new Error(`${mode} server did not start (exit ${s.child.exitCode})`);
          }
          started = true;
          const boot = (headers: Record<string, string> | Headers = {}) => fetch(`http://127.0.0.1:${port}/api/bootstrap`, { headers });
          if (mode === "installed") {
            // The child shares this worker's clock (date-matrix runs pass the same offset to every Node child).
            const [v, w] = [mint(key), mint(key)];
            values.push(v, w);
            expect((await boot()).status).toBe(403);
            expect((await boot({ [LAUNCH_HEADER]: key })).status).toBe(403);
            const twice = new Headers();
            twice.append(LAUNCH_HEADER, w);
            twice.append(LAUNCH_HEADER, w);
            expect((await boot(twice)).status).toBe(403);
            const ok = await boot({ [LAUNCH_HEADER]: v });
            expect(ok.status).toBe(200);
            expect(ok.headers.get("set-cookie")).toMatch(/^she_session=/);
            const reused = await boot({ [LAUNCH_HEADER]: v });
            expect(reused.status).toBe(403);
            expect(reused.headers.get("set-cookie")).toBeNull();
            expect((await boot({ [LAUNCH_HEADER]: w })).status).toBe(200);
          } else expect((await boot()).status).toBe(200);
          for (const x of [key, ...values]) expect((s.out() + s.err()).includes(x)).toBe(false);
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

// F-09: one-time values (spec "1회용 값의 수명", "bootstrap 판정", "1회용 값의 구성").
it("V8-X13: 같은 1회용 값을 쿠키 없이 두 번 쓰면 첫 번째는 200, 두 번째는 403이고 쿠키를 주지 않는다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const v = mint(key);
    const first = await boot({ [LAUNCH_HEADER]: v });
    expect(first.statusCode).toBe(200);
    expect(first.cookies[0].name).toBe("she_session");
    expectRefused(await boot({ [LAUNCH_HEADER]: v }));
    // The browser that used it carries on with its cookie.
    expect((await boot({ cookie: cookieOf(first) })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X14: 4분 59초 뒤의 값은 받고 5분이 넘은 값은 403이다(시계를 앞으로 돌려 확인, 경계 300,000ms는 받음)", async () => {
  const { t, app, key, boot } = await launched();
  try {
    expect(LAUNCH_VALUE_LIFETIME_MS).toBe(300_000);
    const [young, old] = [mint(key), mint(key)];
    shiftClock(4 * 60_000 + 59_000);
    expect((await boot({ [LAUNCH_HEADER]: young })).statusCode).toBe(200);
    shiftClock(5 * 60_000 + 1_000);
    expectRefused(await boot({ [LAUNCH_HEADER]: old }));
    // A value made on the moved clock still works: only the age decides.
    expect((await boot({ [LAUNCH_HEADER]: mint(key) })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
  const k = synthetic(), c = launchValueChecker(k), now = Date.now();
  freezeClock(now);
  expect(c.accept(mintLaunchValue(k, now - 300_000))).toBe(true);
  expect(c.accept(mintLaunchValue(k, now - 300_001))).toBe(false);
});

it("V8-X15: 만든 시각이 1분 넘게 미래인 값은 403이다(경계 -60,000ms는 받음)", async () => {
  const { t, app, key, boot } = await launched();
  try {
    expect(LAUNCH_VALUE_FUTURE_SKEW_MS).toBe(60_000);
    expectRefused(await boot({ [LAUNCH_HEADER]: mint(key, 61_000) }));
    expectRefused(await boot({ [LAUNCH_HEADER]: mint(key, 24 * 3600_000) }));
    expect((await boot({ [LAUNCH_HEADER]: mint(key, 59_000) })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
  const k = synthetic(), c = launchValueChecker(k), now = Date.now();
  freezeClock(now);
  expect(c.accept(mintLaunchValue(k, now + 60_000))).toBe(true);
  expect(c.accept(mintLaunchValue(k, now + 60_001))).toBe(false);
});

it("V8-X16: 실행 키 없이·다른 키로 만든 값, 가운데 글자를 바꾼 값, 마지막 글자의 남는 비트만 바꾼 값, 형식이 틀린 값, 머리글이 여러 개인 요청은 403이다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const v = mint(key);
    const sameBytes = sameBytesOtherStrings(v);
    for (const s of sameBytes) {
      expect(s === v).toBe(false);
      expect(Buffer.from(s, "base64url").equals(Buffer.from(v, "base64url"))).toBe(true);
    }
    const unsigned = Buffer.from(v, "base64url");
    unsigned.fill(0, 24);
    const forged = [
      mintLaunchValue("", Date.now()), // no key
      randomBytes(56).toString("base64url"), // no key, random bytes
      unsigned.toString("base64url"), // right time and nonce, empty signature
      mint(synthetic()), // another launch key (another start of the app)
      changedAt(v, 3), changedAt(v, 15), changedAt(v, 37), changedAt(v, 60), // issued time, nonce, signature
      ...sameBytes,
    ];
    const std = Buffer.from(v, "base64url").toString("base64");
    const malformed = [
      v.slice(0, -1), v + "A", v + "=", std, std.replace(/=+$/, "") === v ? v.slice(0, -1) + "+" : std.replace(/=+$/, ""),
      v.slice(0, 30) + "." + v.slice(31), " " + v, v + " ", v.slice(0, 74) + "/", "launch=" + v, "A".repeat(75),
      v + v, v.slice(0, 43),
    ];
    for (const h of [...forged, ...malformed]) expectRefused(await boot({ [LAUNCH_HEADER]: h }));
    expectRefused(await boot({ [LAUNCH_HEADER]: [v, v] }));
    expectRefused(await boot({ [LAUNCH_HEADER]: [v, mint(synthetic())] }));
    // None of those spent the real value, not even the strings that decode to its bytes.
    expect((await boot({ [LAUNCH_HEADER]: v })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X17: 실행 키 자체를 머리글로 보내면 403이다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    expectRefused(await boot({ [LAUNCH_HEADER]: key }));
    expectRefused(await boot({ [LAUNCH_HEADER]: key + key.slice(0, 32) })); // 75 characters, but no value
    expect((await boot({ [LAUNCH_HEADER]: mint(key) })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X18: 값 두 개를 만들면 각각 한 번씩 받아들인다(새 값이 이전 값을 무효로 만들지 않는다)", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const [a, b] = [mint(key), mint(key)];
    expect(a).not.toBe(b);
    const ra = await boot({ [LAUNCH_HEADER]: a }), rb = await boot({ [LAUNCH_HEADER]: b });
    expect([ra.statusCode, rb.statusCode]).toEqual([200, 200]);
    expect(cookieOf(ra)).not.toBe(cookieOf(rb));
    expectRefused(await boot({ [LAUNCH_HEADER]: a }));
    expectRefused(await boot({ [LAUNCH_HEADER]: b }));
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X19: 유효한 쿠키와 함께 온 유효한 값은 기존 세션으로 200을 주고 그 값은 쓴 것이 된다(이후 쿠키 없이 그 값으로 403)", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const first = await boot({ [LAUNCH_HEADER]: mint(key) });
    const v = mint(key);
    const again = await boot({ cookie: cookieOf(first), [LAUNCH_HEADER]: v });
    expect(again.statusCode).toBe(200);
    expect(again.json().csrf).toBe(first.json().csrf);
    expect(again.cookies).toEqual([]);
    expectRefused(await boot({ [LAUNCH_HEADER]: v }));
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X20: 유효한 쿠키와 함께 온 틀린·쓴·만료된·미래·형식이 틀린 값이나 여러 머리글은 기존 세션으로 200이고 아무 값도 쓴 것으로 남기지 않는다", async () => {
  const { t, app, key, boot } = await launched();
  try {
    const first = await boot({ [LAUNCH_HEADER]: mint(key) });
    const cookie = cookieOf(first), csrf = first.json().csrf;
    const v = mint(key), later = mint(key, 2 * 60_000); // "later" is 2 minutes in the future: refused now, valid after
    const used = mint(key);
    expect((await boot({ [LAUNCH_HEADER]: used })).statusCode).toBe(200);
    for (const h of [changedAt(v, 40), ...sameBytesOtherStrings(v), [v, v], "x", key, used, mint(key, -LAUNCH_VALUE_LIFETIME_MS - 1000), later, mint(synthetic())]) {
      const r = await boot({ cookie, [LAUNCH_HEADER]: h });
      expect(r.statusCode).toBe(200);
      expect(r.json().csrf).toBe(csrf);
      expect(r.cookies).toEqual([]);
    }
    expect((await boot({ [LAUNCH_HEADER]: v })).statusCode).toBe(200);
    shiftClock(2 * 60_000);
    expect((await boot({ [LAUNCH_HEADER]: later })).statusCode).toBe(200);
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X21: 1회용 값은 56바이트(만든 시각 8 + 난수 16 + HMAC-SHA256 32)를 채움 없는 base64url 75자로 적고, 베타 화면의 조각 규칙에 맞는다", async () => {
  const { takeLaunch } = await import("../beta/api.js");
  const key = synthetic(), now = Date.now();
  const values = new Set<string>();
  for (const issued of [0, 1, now, now + 1, now - LAUNCH_VALUE_LIFETIME_MS, 2 ** 40, Number.MAX_SAFE_INTEGER, ...Array.from({ length: 200 }, (_, i) => now + i)]) {
    const v = mintLaunchValue(key, issued);
    values.add(v);
    // Booleans and lengths only, so a failure never prints a value.
    expect(/^[A-Za-z0-9_-]{16,128}$/.test(v)).toBe(true);
    expect(v.length).toBe(75);
    const taken = takeLaunch("#launch=" + v);
    expect(taken?.token === v && taken?.hash === "#/").toBe(true);
    const bytes = Buffer.from(v, "base64url");
    expect(bytes).toHaveLength(56);
    expect(bytes.toString("base64url") === v).toBe(true); // canonical: unused bits are 0
    expect(bytes.readBigUInt64BE(0)).toBe(BigInt(issued));
    // The key is the launch key string's UTF-8 bytes, not decoded; the message is bytes 0..23.
    expect(bytes.subarray(24).equals(createHmac("sha256", Buffer.from(key, "utf8")).update(bytes.subarray(0, 24)).digest())).toBe(true);
  }
  expect(values.size).toBe(207); // a fresh nonce every time
  const nonce = randomBytes(16);
  expect(Buffer.from(mintLaunchValue(key, now, nonce), "base64url").subarray(8, 24).equals(nonce)).toBe(true);
});

it("V8-X22: 거절 응답의 문구가 새 문구와 같다", async () => {
  expect(LAUNCH_REFUSED).toBe("화면 오른쪽 아래 알림 영역의 SH·E 아이콘에서 「화면 열기」를 누르거나, 시작 메뉴에서 앱을 다시 열어 주세요.");
  const { t, app, boot } = await launched();
  try {
    const r = await boot();
    expect(r.statusCode).toBe(403);
    expect(r.body).toBe(JSON.stringify({ error: "화면 오른쪽 아래 알림 영역의 SH·E 아이콘에서 「화면 열기」를 누르거나, 시작 메뉴에서 앱을 다시 열어 주세요." }));
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-X23: 검사기는 서명이 틀린 값을 기억하지 않고, 쓴 값의 기록은 받아들인 시각이 아니라 값 안의 만든 시각 + 5분이 지난 뒤에만 지운다", () => {
  const key = synthetic(), c = launchValueChecker(key), T = Date.now();
  freezeClock(T);
  for (const g of [undefined, null, 7, [mintLaunchValue(key, T)], "", key, mintLaunchValue(synthetic(), T), changedAt(mintLaunchValue(key, T), 50),
    ...sameBytesOtherStrings(mintLaunchValue(key, T))])
    expect(c.accept(g)).toBe(false);
  expect(c.remembered).toBe(0);
  // Expired and future values with a good signature are refused and not remembered either.
  expect(c.accept(mintLaunchValue(key, T - 300_001))).toBe(false);
  expect(c.accept(mintLaunchValue(key, T + 60_001))).toBe(false);
  expect(c.remembered).toBe(0);
  // A value issued 1 minute ahead, accepted now: its record must outlive "accepted + 5 min".
  const ahead = mintLaunchValue(key, T + 60_000);
  expect(c.accept(ahead)).toBe(true);
  expect(c.remembered).toBe(1);
  freezeClock(T + 300_001); // 5 min after acceptance; the value itself is only 4 min old
  expect(c.accept(ahead)).toBe(false);
  expect(c.remembered).toBe(1);
  freezeClock(T + 360_000); // issued + 5 min exactly: still remembered
  expect(c.accept(ahead)).toBe(false);
  expect(c.remembered).toBe(1);
  freezeClock(T + 360_001);
  expect(c.accept("x")).toBe(false);
  expect(c.remembered).toBe(0); // pruned; the value is now refused by its age
  expect(c.accept(ahead)).toBe(false);
  // The nonce marks a value: the same nonce under another issued time is "already used".
  const nonce = randomBytes(16), now = T + 360_001;
  expect(c.accept(mintLaunchValue(key, now, nonce))).toBe(true);
  expect(c.accept(mintLaunchValue(key, now - 1, nonce))).toBe(false);
});

it("V8-X24: 서버를 다시 시작하면(새 실행 키) 이전 실행 때 만든 값은 무효다", async () => {
  const before = await launched(), after = await launched();
  try {
    const v = mint(before.key);
    expectRefused(await after.boot({ [LAUNCH_HEADER]: v }));
    expect((await before.boot({ [LAUNCH_HEADER]: v })).statusCode).toBe(200);
  } finally {
    await before.app.close();
    await after.app.close();
    before.t.clean();
    after.t.clean();
  }
});

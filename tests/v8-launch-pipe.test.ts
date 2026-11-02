import { it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve, win32 } from "node:path";
import { createApp } from "../server/app.js";
import { LAUNCH_HEADER, launchValueChecker, mintLaunchValue } from "../server/launch-token-v8.js";
import { testStore } from "./helpers.js";

// F-09 (.dryforge/spec.md "실행기", "통로의 형식"): the C# launcher makes a new one-time value every time it opens the
// browser, and listens on a local pipe for the "open the screen" signal of a second start. Only the test package
// (build-msix-v8.mjs --test-identity, csc -define:SHE_TEST_PIPE) also answers "mint" with a fresh value for the install
// test; the Store package has no such code. The real Launcher.cs is compiled with the in-box csc together with
// tests/fixtures/launch/launcher-pipe-harness.cs, once per package kind, and checked against the server's checker.
// Keys are synthetic and made per test, passed on standard input (never a command line); keys and values are not printed.
// Values carry the test's Date.now() (moved in date-matrix runs) as their issued time.

const win = process.platform === "win32";
const LAUNCHER = "packaging/msix/launcher/Launcher.cs";
const HARNESS = "tests/fixtures/launch/launcher-pipe-harness.cs";
const BETA_FRAGMENT = /^#launch=([A-Za-z0-9_-]{16,128})$/; // beta/api.ts (locked screen)
const VALUE = /^[A-Za-z0-9_-]{75}$/;
const synthetic = () => randomBytes(32).toString("base64url");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// csc cannot write to an output path with non-ASCII characters on some PCs, so it compiles into the git-ignored .local/
// folder (a test-only subfolder, removed afterwards), as V8-H09 does.
let csc: string | undefined;
let build: string | undefined;
const exe = { test: "", store: "" };
function compile(out: string, testPipe: boolean) {
  const r = spawnSync(csc!, ["-nologo", "-utf8output", "-codepage:65001", "-target:exe", "-main:LauncherPipeHarness", ...(testPipe ? ["-define:SHE_TEST_PIPE"] : []),
    "-r:System.Windows.Forms.dll", "-r:System.Drawing.dll", "-r:System.Core.dll", "-out:" + out, resolve(LAUNCHER), resolve(HARNESS)], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("csc failed: " + (r.stdout + r.stderr).slice(-1500));
}
beforeAll(async () => {
  if (!win) return;
  const { trustedSystemDirectory } = await import("../server/child-env-v8.js");
  const candidate = win32.join(win32.dirname(trustedSystemDirectory()), "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (!existsSync(candidate)) return;
  csc = candidate;
  build = resolve(".local", "test-pipe-" + randomBytes(4).toString("hex"));
  mkdirSync(build, { recursive: true });
  exe.test = join(build, "harness-test.exe");
  exe.store = join(build, "harness-store.exe");
  compile(exe.test, true);
  compile(exe.store, false);
}, 120000);
afterAll(() => { if (build) rmSync(build, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
const noCsc = "Windows가 아니거나 csc.exe 없음 — C# 실행기를 컴파일할 수 없음";

// One harness run: lines on standard input, the output lines back.
function harness(file: string, mode: string, input: string[]): Promise<string[]> {
  return new Promise((done, fail) => {
    const c = spawn(file, [mode], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => { c.kill(); fail(new Error("harness timeout: " + mode)); }, 30000);
    c.stdout.setEncoding("ascii");
    c.stdout.on("data", (b) => (out += b));
    c.once("error", (e) => { clearTimeout(timer); fail(e); });
    c.once("close", (code) => { clearTimeout(timer); if (code === 0) done(out.trim().split(/\r?\n/)); else fail(new Error(`harness ${mode} exit ${code}`)); });
    c.stdin.end(input.join("\n") + "\n");
  });
}
const field = (lines: string[], tag: string) => lines.filter((l) => l.startsWith(tag + " ")).map((l) => l.slice(tag.length + 1));

// The launcher's pipe served by the harness, on a pipe name unique to this test (never the real app's).
async function serve(file: string, key: string, port = 40000 + randomBytes(2).readUInt16BE() % 20000) {
  const name = "SHE-Law-Test-" + randomBytes(6).toString("hex");
  const c = spawn(file, ["serve"], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  const opened: string[] = [];
  let buf = "", ready = "";
  c.stdout.setEncoding("ascii");
  c.stdout.on("data", (chunk: string) => {
    buf += chunk;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("READY ")) ready = line.slice(6);
      else if (line.startsWith("OPEN ")) opened.push(line.slice(5));
    }
  });
  c.stdin.write([key, name, String(port), String(Date.now())].join("\n") + "\n");
  await until(() => ready !== "" || c.exitCode !== null, 15000);
  if (ready !== "True") { c.kill(); throw new Error("harness pipe not ready: " + (ready || "no answer")); }
  const close = () => new Promise<void>((done) => {
    if (c.exitCode !== null) return done();
    const kill = setTimeout(() => c.kill(), 5000);
    c.once("close", () => { clearTimeout(kill); done(); });
    c.stdin.end();
  });
  return { name, port, opened, close };
}
async function until(cond: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(25);
  return cond();
}

// One request line, one answer line, as the install-test script does (scripts/msix-scenario-v8.mjs). The pipe takes one
// connection at a time and can be missing or busy for a moment between instances: retried.
const pipePath = (name: string) => "\\\\.\\pipe\\" + name;
function requestOnce(name: string, request: string): Promise<string> {
  return new Promise((done, fail) => {
    const socket = connect({ path: pipePath(name) });
    let data = "", finished = false;
    const finish = (err: (Error & { code?: string }) | null, line?: string) => {
      if (finished) return;
      finished = true; clearTimeout(timer); socket.destroy();
      if (err) fail(err); else done(line!);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error("pipe did not answer"), { code: "ETIMEDOUT" })), 8000);
    socket.setEncoding("ascii");
    socket.on("connect", () => socket.write(request + "\n"));
    socket.on("data", (chunk: string) => {
      data += chunk;
      const end = data.indexOf("\n");
      if (end >= 0) finish(null, data.slice(0, end).replace(/\r$/, ""));
    });
    socket.on("end", () => finish(null, data.replace(/\r?\n$/, "")));
    socket.on("close", () => finish(null, data.replace(/\r?\n$/, "")));
    socket.on("error", (e: Error & { code?: string }) => finish(Object.assign(new Error("pipe not reached (" + (e.code || "error") + ")"), { code: e.code })));
  });
}
async function request(name: string, req: string) {
  for (let attempt = 1; ; attempt++) {
    try { return await requestOnce(name, req); } catch (e) {
      if (!["ENOENT", "EBUSY"].includes((e as { code?: string }).code ?? "") || attempt >= 60) throw e;
      await sleep(100);
    }
  }
}

it("V8-Q01: 두 언어의 계산이 같다 — C# 실행기가 만든 1회용 값은 서버 함수와 같은 문자열이고, 서버 검사기가 한 번만 받아들인다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const key = synthetic(), issued = Date.now(), nonce = randomBytes(16);
  const lines = await harness(exe.store, "value", [key, String(issued), nonce.toString("hex")]);
  const [fixed] = field(lines, "FIXED"), fresh = field(lines, "FRESH");
  // Same key, time and nonce: byte-for-byte the same 75 characters (canonical base64url, no padding).
  expect(fixed === mintLaunchValue(key, issued, nonce)).toBe(true);
  expect(fresh.length).toBe(2);
  expect(fresh[0] === fresh[1]).toBe(false);
  const checker = launchValueChecker(key), other = launchValueChecker(synthetic());
  for (const v of [fixed, ...fresh]) {
    expect(VALUE.test(v)).toBe(true);
    expect(BETA_FRAGMENT.test("#launch=" + v)).toBe(true);
    expect(other.accept(v)).toBe(false);
    expect(checker.accept(v)).toBe(true);
    expect(checker.accept(v)).toBe(false);
  }
  expect(lines.join("\n")).not.toContain(key);
}, 60000);

it("V8-Q02: 시험용 실행기 통로 — mint를 두 번 요청하면 다른 두 값이 오고, 각 값은 검사기와 실제 bootstrap에서 한 번씩만 받아들여진다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const key = synthetic(), pipe = await serve(exe.test, key);
  const t = testStore();
  const { app } = await createApp(t.store, true, undefined, undefined, undefined, key);
  try {
    const a = await request(pipe.name, "mint"), b = await request(pipe.name, "mint");
    expect(VALUE.test(a) && VALUE.test(b)).toBe(true);
    expect(a === b).toBe(false);
    const checker = launchValueChecker(key);
    expect(checker.accept(a)).toBe(true);
    expect(checker.accept(a)).toBe(false);
    // The real bootstrap (createApp with the same launch key): first use gives a session, the second is refused.
    const boot = (v: string) => app.inject({ url: "/api/bootstrap", headers: { host: "127.0.0.1:4317", [LAUNCH_HEADER]: v } });
    const first = await boot(b);
    expect(first.statusCode).toBe(200);
    expect(first.cookies[0].name).toBe("she_session");
    const again = await boot(b);
    expect(again.statusCode).toBe(403);
    expect(again.cookies).toEqual([]);
    expect(pipe.opened).toEqual([]);
  } finally {
    await app.close();
    t.clean();
    await pipe.close();
  }
}, 60000);

it("V8-Q03: Store용 실행기 통로는 mint에 값을 주지 않고(no), 그 코드는 Store용 실행 파일에 없다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const pipe = await serve(exe.store, synthetic());
  try {
    expect(await request(pipe.name, "mint")).toBe("no");
    expect(await request(pipe.name, "open")).toBe("ok");
    expect(await until(() => pipe.opened.length === 1, 5000)).toBe(true);
  } finally {
    await pipe.close();
  }
  // The request word is a string literal only inside #if SHE_TEST_PIPE (the harness spells none): the test build has it,
  // the Store build does not.
  const literal = Buffer.from("mint", "utf16le");
  expect(readFileSync(exe.test).includes(literal)).toBe(true);
  expect(readFileSync(exe.store).includes(literal)).toBe(false);
}, 60000);

it("V8-Q04: open 신호 — 새 값이 담긴 /beta/#launch= 주소를 열고(베타 화면 규칙에 맞고 서버가 받음), 2초 안의 신호는 ok지만 브라우저를 열지 않는다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const key = synthetic(), pipe = await serve(exe.test, key);
  try {
    expect(await request(pipe.name, "open")).toBe("ok");
    expect(await until(() => pipe.opened.length === 1, 5000)).toBe(true);
    expect(await request(pipe.name, "open")).toBe("ok");
    // A second start (Launcher.SignalOpen, what OpenRunning sends) also gets ok; within 2 s it opens nothing more.
    expect(field(await harness(exe.store, "signal", [pipe.name]), "SIGNAL")).toEqual(["True"]);
    await sleep(500);
    expect(pipe.opened.length).toBe(1);
    // After the interval the next signal opens again, with a new value.
    await sleep(2100);
    expect(await request(pipe.name, "open")).toBe("ok");
    expect(await until(() => pipe.opened.length === 2, 5000)).toBe(true);
    const checker = launchValueChecker(key), values: string[] = [];
    for (const url of pipe.opened) {
      const prefix = `http://127.0.0.1:${pipe.port}/beta/`;
      expect(url.startsWith(prefix)).toBe(true);
      const m = BETA_FRAGMENT.exec(url.slice(prefix.length));
      expect(m).not.toBeNull();
      expect(VALUE.test(m![1])).toBe(true);
      expect(checker.accept(m![1])).toBe(true);
      expect(checker.accept(m![1])).toBe(false);
      values.push(m![1]);
    }
    expect(values[0] === values[1]).toBe(false);
  } finally {
    await pipe.close();
  }
}, 60000);

it("V8-Q05: 아무것도 보내지 않는 연결 하나가 통로를 막지 못한다 — 2초 뒤 끊기고 다른 연결의 open이 처리된다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const pipe = await serve(exe.test, synthetic());
  const silent = connect({ path: pipePath(pipe.name) });
  let silentClosed = false;
  silent.on("error", () => {});
  silent.on("close", () => (silentClosed = true));
  try {
    await new Promise<void>((r, f) => { silent.once("connect", () => r()); silent.once("error", f); });
    const started = Date.now();
    expect(await request(pipe.name, "open")).toBe("ok");
    expect(Date.now() - started).toBeLessThan(6000);
    expect(await until(() => pipe.opened.length === 1, 5000)).toBe(true);
    // The launcher dropped the silent connection.
    expect(await until(() => silentClosed, 5000)).toBe(true);
    expect(await request(pipe.name, "open")).toBe("ok");
  } finally {
    silent.destroy();
    await pipe.close();
  }
}, 60000);

it("V8-Q06: 그 밖의 요청·비정상 요청에는 no로 답하고, 통로는 계속 동작한다(두 빌드 모두)", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  for (const file of [exe.test, exe.store]) {
    const pipe = await serve(file, synthetic());
    try {
      for (const bad of ["", "OPEN", "open please", "mint now", "shutdown", "token", "열기", "x".repeat(300)])
        expect(await request(pipe.name, bad), bad.slice(0, 20)).toBe("no");
      // A connection that closes without a full line does not stop the pipe.
      await new Promise<void>((r) => { const s = connect({ path: pipePath(pipe.name) }); s.on("error", () => r()); s.on("connect", () => { s.end("op"); r(); }); });
      expect(await request(pipe.name, "open")).toBe("ok");
      expect(await until(() => pipe.opened.length === 1, 5000)).toBe(true);
    } finally {
      await pipe.close();
    }
  }
}, 90000);

it("V8-Q07: 통로 이름은 SHE-Law-Beta-<세션 번호>-<데이터 폴더 해시>이고, 접근 목록은 현재 사용자 허용·네트워크 거부 두 줄뿐이다", async (ctx) => {
  if (!csc) return ctx.skip(noCsc);
  const dir = "C:\\Synthetic\\Packages\\SHELaw.Test_" + randomBytes(4).toString("hex") + "\\LocalState";
  const lines = await harness(exe.store, "name", [dir]);
  const [name] = field(lines, "NAME"), [session] = field(lines, "SESSION");
  // Same hash as the single-instance mutex name (Launcher.Hash): SHA-256 of the lower-cased folder, 16 hex characters.
  const hash = createHash("sha256").update(dir.toLowerCase(), "utf8").digest("hex").slice(0, 16).toUpperCase();
  expect(session).toMatch(/^\d+$/);
  expect(name).toBe(`SHE-Law-Beta-${session}-${hash}`);
  expect(name).toMatch(/^[A-Za-z0-9._-]{1,200}$/); // what the install-test script accepts
  const acl = await harness(exe.store, "acl", []);
  const [user] = field(acl, "USER"), [sddl] = field(acl, "SDDL");
  expect(user).toMatch(/^S-1-5-21-[\d-]+$/);
  expect(sddl.startsWith("D:P")).toBe(true); // protected: nothing inherited
  const aces = [...sddl.matchAll(/\(([^;]*);[^;]*;([^;]*);[^;]*;[^;]*;([^)]*)\)/g)].map((m) => ({ type: m[1], rights: m[2], sid: m[3] }));
  expect(aces.map((a) => a.type + " " + a.sid).sort()).toEqual(["A " + user, "D NU"]);
  // .NET writes pipe rights as a number. Deny = PipeAccessRights.FullControl (0x1F019F: everything a pipe has). The
  // user's allow line carries no CreateNewInstance (0x4), change-permissions (0x40000) or take-ownership (0x80000).
  const deny = aces.find((a) => a.type === "D")!.rights, allow = aces.find((a) => a.type === "A")!.rights;
  expect(deny.toLowerCase()).toBe("0x1f019f");
  expect(allow).toMatch(/^0x[0-9a-fA-F]+$/);
  expect(Number.parseInt(allow, 16) & (0x4 | 0x40000 | 0x80000)).toBe(0);
  expect(Number.parseInt(allow, 16) & 0x3).toBe(0x3); // read and write data
}, 60000);

it("V8-Q08: 실행기 소스·빌드 스크립트 — launch.json에 키·값 없음, mint는 SHE_TEST_PIPE 안에만, 그 표시는 --test-identity 빌드에만, 두 번째 실행은 launch.json 없이 신호만", () => {
  const src = readFileSync(LAUNCHER, "utf8");
  // launch.json: port, pid and pipe name only.
  const writes = [...src.matchAll(/WriteLaunchFile\(([^;]*)\);/g)].map((m) => m[1]).filter((a) => !a.startsWith("string "));
  expect(writes.length).toBe(1);
  expect(writes[0]).toBe('"{\\"port\\":" + port + ",\\"pid\\":" + server.Id + ",\\"pipe\\":\\"" + pipeName + "\\"}"');
  const run = src.slice(src.indexOf("static int Run()"), src.indexOf("static void Quit()"));
  expect(run.indexOf("WriteLaunchFile(")).toBeGreaterThan(run.indexOf(".Start()", run.indexOf("new SignalPipe(")));
  // The test-only request exists only between #if SHE_TEST_PIPE and its #endif, with no #else and no #define.
  expect(src).not.toMatch(/^\s*#(define|else|elif|undef)\b/m);
  const lines = src.split(/\r?\n/);
  let inside = false, mintLines = 0;
  for (const line of lines) {
    if (/^\s*#if\b/.test(line)) { expect(line.trim()).toBe("#if SHE_TEST_PIPE"); inside = true; continue; }
    if (/^\s*#endif\b/.test(line)) { inside = false; continue; }
    if (line.includes('"mint"')) { expect(inside, line.trim()).toBe(true); mintLines++; }
    if (!inside) expect(line).not.toContain("SHE_TEST_PIPE");
  }
  expect(mintLines).toBeGreaterThan(0);
  // Build script: the symbol goes to csc for the test package only.
  const script = readFileSync("scripts/build-msix-v8.mjs", "utf8");
  expect(script).toMatch(/if \(store === testIdentity\) fail\(/);
  expect(script.match(/SHE_TEST_PIPE/g)?.length).toBe(1);
  const cscRun = script.slice(script.indexOf("run(csc, ["), script.indexOf("]);", script.indexOf("run(csc, [")));
  expect(cscRun).toContain('...(testIdentity ? ["-define:SHE_TEST_PIPE"] : [])');
  expect(cscRun).toContain('"-r:System.Core.dll"');
  // Pipe name with the Windows session; access list: this user allowed, network denied.
  expect(src).toContain('"SHE-Law-Beta-" + Process.GetCurrentProcess().SessionId + "-" + Hash(dataDir)');
  expect(src).toMatch(/new PipeAccessRule\(WindowsIdentity\.GetCurrent\(\)\.User, [^;]*AccessControlType\.Allow\)/);
  expect(src).toMatch(/new PipeAccessRule\(new SecurityIdentifier\(WellKnownSidType\.NetworkSid, null\), PipeAccessRights\.FullControl, AccessControlType\.Deny\)/);
  // Second start: no launch.json, only the signal; the same retry and message as before.
  const second = src.slice(src.indexOf("static bool OpenRunning()"), src.indexOf("}", src.indexOf("MessageBox.Show(", src.indexOf("static bool OpenRunning()"))));
  expect(second).not.toMatch(/LaunchFile|ReadAll|launchKey/);
  expect(second).toContain("SignalOpen(PipeName(dataDir), OpenAttempts)");
  expect(src).toMatch(/const int OpenAttempts = 240;/);
  expect(second).toContain("이미 실행 중인 프로그램에 연결하지 못했습니다. 잠시 뒤 다시 실행하세요.");
  // Nothing is printed or logged by the launcher; the launch key is only made, given to node, and used to sign.
  expect(src).not.toMatch(/Console\.|Trace\.|Debug\.|EventLog|File\.(Write|Append)/);
  for (const line of lines.filter((l) => /\blaunchKey\b/.test(l) && !/^\s*\/\//.test(l)))
    expect(line.trim(), line.trim()).toMatch(/^(static string launchKey;|launchKey = NewLaunchKey\(\);|psi\.EnvironmentVariables\["SHE_LAUNCH_TOKEN"\] = launchKey;|.*NewLaunchValue\(launchKey, NowMs\(\)\).*|.*new SignalPipe\(pipeName, launchKey, port, NowMs, .*)$/);
});

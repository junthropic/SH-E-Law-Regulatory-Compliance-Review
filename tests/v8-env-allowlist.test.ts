import { it, expect, vi, afterEach, afterAll, beforeAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve, win32 } from "node:path";
import { randomBytes } from "node:crypto";

// H7 (docs/implementation-v8/security-review-plan.md): child processes get an allow-list environment, and the DPAPI
// PowerShell is started by an absolute path in the real system directory. Synthetic values only; none is printed.
// Real processes on Windows: the parser workers, PowerShell (real DPAPI round trip), a compiled fake powershell.exe,
// the C# launcher code (compiled with the same in-box csc the package build uses) and node children on a local TLS
// fixture. On other platforms the Windows-only cases are skipped and the pure env-builder cases still run.

// Records the arguments of every real fork() (the call still goes through), so the parser tests can see the env given.
const forks = vi.hoisted(() => [] as { env?: Record<string, string> }[]);
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, fork: (...a: Parameters<typeof real.fork>) => { forks.push((a[2] ?? {}) as { env?: Record<string, string> }); return real.fork(...a); } };
});

const win = process.platform === "win32";
const SYS = "C:\\Windows\\System32";
const DANGEROUS = ["NODE_OPTIONS", "node_options", "Node_Tls_Reject_Unauthorized", "NODE_EXTRA_CA_CERTS", "node_extra_ca_certs", "NODE_PATH", "Node_Path",
  "SSL_CERT_FILE", "ssl_cert_dir", "OPENSSL_CONF", "Openssl_Modules", "HTTP_PROXY", "Https_Proxy", "no_proxy", "NODE_USE_ENV_PROXY", "node_use_system_ca",
  "NODE_COMPILE_CACHE", "NODE_V8_COVERAGE", "NODE_REDIRECT_WARNINGS", "NODE_DEBUG", "NODE_PRESERVE_SYMLINKS", "NODE_ICU_DATA", "NODE_REPL_EXTERNAL_MODULE",
  "UV_THREADPOOL_SIZE", "TZ", "PSModulePath", "psmodulepath", "ComSpec", "PATHEXT", "She_Launch_Token", "SHE_EPHEMERAL_AUTH", "LAW_OC", "SHE_DATA_DIR", "PORT"];
const upper = (o: object) => Object.keys(o).map((k) => k.toUpperCase());

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); forks.length = 0; });

function poisoned(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { Path: "C:\\evil;C:\\Windows\\System32", SystemRoot: "C:\\evil", windir: "C:\\evil", USERPROFILE: "C:\\Users\\synthetic",
    AppData: "C:\\Users\\synthetic\\AppData\\Roaming", localappdata: "C:\\Users\\synthetic\\AppData\\Local", TEMP: "C:\\Users\\synthetic\\Temp", tmp: "C:\\Users\\synthetic\\Temp", ...extra };
  for (const name of DANGEROUS) env[name] = "synthetic-" + name;
  return env;
}

it("V8-H01: 환경 허용 목록 — 대소문자를 섞은 위험 변수는 빠지고, 필요한 변수만 들어가며, 실행 토큰은 node 워커·PowerShell에 가지 않는다", async () => {
  const { powerShellEnv, nodeWorkerEnv, envValue, LIBUV_FILLED } = await import("../server/child-env-v8.js");
  const ps = powerShellEnv(poisoned(), SYS);
  const worker = nodeWorkerEnv("win32", SYS);
  for (const env of [ps, worker]) {
    for (const name of DANGEROUS.filter((n) => !/^psmodulepath$/i.test(n))) expect(upper(env)).not.toContain(name.toUpperCase());
    // Every variable libuv would otherwise copy from the parent is set here (trusted value or empty).
    for (const name of LIBUV_FILLED) expect(env).toHaveProperty(name);
    expect(env.SYSTEMROOT).toBe("C:\\Windows");
    expect(env.WINDIR).toBe("C:\\Windows");
    expect(JSON.stringify(env)).not.toContain("evil");
    expect(JSON.stringify(env)).not.toContain("synthetic-");
    // One spelling per name: no `Path` next to `PATH`.
    expect(new Set(upper(env)).size).toBe(Object.keys(env).length);
  }
  expect(Object.keys(ps).sort()).toEqual([...LIBUV_FILLED, "APPDATA", "LOCALAPPDATA", "PSModulePath", "TMP"].sort());
  expect(ps.PATH).toBe("C:\\Windows\\System32;C:\\Windows");
  expect(ps.PSModulePath).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules");
  expect([ps.USERPROFILE, ps.APPDATA, ps.LOCALAPPDATA, ps.TEMP, ps.TMP]).toEqual(["C:\\Users\\synthetic", "C:\\Users\\synthetic\\AppData\\Roaming",
    "C:\\Users\\synthetic\\AppData\\Local", "C:\\Users\\synthetic\\Temp", "C:\\Users\\synthetic\\Temp"]);
  expect(Object.keys(worker).sort()).toEqual([...LIBUV_FILLED].sort());
  expect(worker.PATH).toBe("");
  expect(worker.USERPROFILE).toBe("");
  expect(nodeWorkerEnv("linux")).toEqual({ PATH: "" });
  // Case-insensitive lookup; two spellings with different values count as absent.
  expect(envValue({ Temp: "A" }, "TEMP")).toBe("A");
  expect(envValue({ TEMP: "A", temp: "A" }, "TEMP")).toBe("A");
  expect(envValue({ TEMP: "A", temp: "B" }, "TEMP")).toBeUndefined();
  expect(powerShellEnv({ USERPROFILE: "C:\\a", userprofile: "C:\\b" }, SYS).USERPROFILE).toBe("");
});

it("V8-H02: 시스템 폴더·PowerShell 경로 결정 — ntdll.dll이 올라온 System32만 믿고, 이상하면 PATH로 대신 찾지 않고 실패한다", async () => {
  const { systemDirectoryFrom, trustedPowerShell, TrustedPathError, trustedSystemDirectory } = await import("../server/child-env-v8.js");
  expect(systemDirectoryFrom(["C:\\Program Files\\nodejs\\node.exe", "C:\\WINDOWS\\SYSTEM32\\ntdll.dll", "C:\\WINDOWS\\System32\\KERNEL32.DLL"])).toBe("C:\\WINDOWS\\SYSTEM32");
  expect(systemDirectoryFrom(["D:\\Win\\System32\\ntdll.dll"])).toBe("D:\\Win\\System32");
  for (const bad of [[], ["\\\\server\\share\\System32\\ntdll.dll"], ["\\\\?\\C:\\Windows\\System32\\ntdll.dll"], ["System32\\ntdll.dll"],
    ["C:\\evil\\ntdll.dll"], ["C:\\Windows\\System32\\..\\..\\evil\\System32\\ntdll.dll"], ["C:\\Windows\\System32\\ntdll.dll", "C:\\evil\\System32\\ntdll.dll"]])
    expect(systemDirectoryFrom(bad)).toBeUndefined();
  expect(trustedPowerShell(SYS, (p) => p === "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  expect(() => trustedPowerShell(SYS, () => false)).toThrow(TrustedPathError);
  expect(() => trustedPowerShell("System32", () => true)).toThrow(TrustedPathError);
  if (!win) expect(() => trustedSystemDirectory()).toThrow(TrustedPathError);
});

it.skipIf(!win)("V8-H03: 실제 프로세스 — SystemRoot·windir·PATH를 가짜 폴더로 바꿔도 시스템 폴더는 Windows가 올린 실제 System32다", async () => {
  const real = process.env.SystemRoot!;
  vi.resetModules();
  vi.stubEnv("SystemRoot", "C:\\synthetic-fake-root");
  vi.stubEnv("windir", "C:\\synthetic-fake-root");
  vi.stubEnv("PATH", "C:\\synthetic-fake-root\\System32");
  const { trustedSystemDirectory, trustedPowerShell } = await import("../server/child-env-v8.js");
  const dir = trustedSystemDirectory();
  expect(dir.toLowerCase()).toBe(win32.join(real, "System32").toLowerCase());
  expect(existsSync(join(dir, "ntdll.dll"))).toBe(true);
  expect(trustedPowerShell().toLowerCase()).toBe(win32.join(real, "System32", "WindowsPowerShell", "v1.0", "powershell.exe").toLowerCase());
});

// Fake powershell.exe (tests/fixtures/h7/fake-powershell.cs) compiled with the in-box C# compiler. csc cannot write to
// an output path with non-ASCII characters on some PCs, so it compiles into the git-ignored .local/ folder.
let csc: string | undefined;
let fakeExe: string | undefined;
const scratch: string[] = [];
const tempDir = (tag: string) => { const d = mkdtempSync(join(tmpdir(), "she-h7-" + tag + "-")); scratch.push(d); return d; };
function compile(out: string, main: string | undefined, ...sources: string[]) {
  const r = spawnSync(csc!, ["-nologo", "-codepage:65001", "-target:exe", ...(main ? ["-main:" + main] : []), "-r:System.Windows.Forms.dll", "-r:System.Drawing.dll", "-out:" + out, ...sources], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("csc failed: " + (r.stdout + r.stderr).slice(-500));
}
beforeAll(async () => {
  if (!win) return;
  const { trustedSystemDirectory } = await import("../server/child-env-v8.js");
  const candidate = win32.join(win32.dirname(trustedSystemDirectory()), "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  if (!existsSync(candidate)) return;
  csc = candidate;
  const build = resolve(".local", "test-h7-" + randomBytes(4).toString("hex"));
  mkdirSync(build, { recursive: true });
  scratch.push(build);
  fakeExe = join(build, "powershell.exe");
  compile(fakeExe, undefined, resolve("tests/fixtures/h7/fake-powershell.cs"));
}, 60000);
const SENTINEL = "FAKE-POWERSHELL-RAN";
function plantFakes() {
  const front = tempDir("path"), cwd = tempDir("cwd"), root = tempDir("root");
  const rootPs = join(root, "System32", "WindowsPowerShell", "v1.0");
  mkdirSync(rootPs, { recursive: true });
  for (const d of [front, cwd, rootPs]) copyFileSync(fakeExe!, join(d, "powershell.exe"));
  const ran = () => [front, cwd, rootPs].filter((d) => existsSync(join(d, SENTINEL)));
  return { front, cwd, root, rootPs, ran };
}

it.skipIf(!win)("V8-H04: 대조 시험(실제 프로세스) — 가짜 powershell.exe는 실제로 실행되며, 이름만으로 띄우면 작업 폴더·PATH의 가짜가 먼저 잡힌다(고치기 전 방식)", (ctx) => {
  if (!fakeExe) return ctx.skip("csc.exe 없음 — 가짜 PowerShell을 만들 수 없음");
  const f = plantFakes();
  // Windows skips the working folder in an executable search only when this variable is set (some shells set it; a
  // normal desktop session does not). Remove it so the control shows the ordinary behaviour.
  vi.stubEnv("NoDefaultCurrentDirectoryInExePath", undefined);
  // The stand-in works when run directly.
  spawnSync(join(f.front, "powershell.exe"), [], { windowsHide: true });
  expect(f.ran()).toEqual([f.front]);
  rmSync(join(f.front, SENTINEL));
  // Old call shape: spawn("powershell.exe") by bare name. libuv looks in the working folder first, then in PATH.
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], { cwd: f.cwd, windowsHide: true, env: { ...process.env } });
  expect(f.ran()).toEqual([f.cwd]);
  rmSync(join(f.cwd, SENTINEL));
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], { cwd: tempDir("empty"), windowsHide: true, env: { ...process.env, PATH: f.front + ";" + process.env.PATH } });
  expect(f.ran()).toEqual([f.front]);
}, 30000);

it.skipIf(!win)("V8-H05: 실제 DPAPI 왕복 — 가짜 powershell.exe를 PATH 맨 앞·작업 폴더·SystemRoot/windir 폴더에 각각 두어도 가짜는 한 번도 실행되지 않는다", async (ctx) => {
  if (!fakeExe) return ctx.skip("csc.exe 없음 — 가짜 PowerShell을 만들 수 없음");
  const { Vault, VaultUnavailableError } = await import("../server/vault.js");
  const f = plantFakes();
  const home = process.cwd();
  const cases: [string, () => void][] = [
    ["PATH 맨 앞", () => vi.stubEnv("PATH", f.front + ";" + process.env.PATH)],
    ["작업 폴더", () => { vi.stubEnv("NoDefaultCurrentDirectoryInExePath", undefined); process.chdir(f.cwd); }],
    ["SystemRoot·windir", () => { vi.stubEnv("SystemRoot", f.root); vi.stubEnv("windir", f.root); }],
  ];
  for (const [label, plant] of cases) {
    const dir = tempDir("vault");
    try {
      plant();
      const vault = new Vault(dir, false);
      const value = { sample: "SYNTHETIC-" + randomBytes(6).toString("hex") };
      try { await vault.write("h-seven", value); } catch (e) {
        if (e instanceof VaultUnavailableError) return ctx.skip("DPAPI 사용자 프로필 없음 — 실기기 왕복 미실행");
        throw e;
      }
      expect(readFileSync(join(dir, "h-seven.dpapi"), "utf8")).not.toContain(value.sample);
      expect(await new Vault(dir, false).read("h-seven"), label).toEqual(value);
      expect(f.ran(), label).toEqual([]);
    } finally {
      process.chdir(home);
      vi.unstubAllEnvs();
    }
  }
}, 60000);

it.skipIf(!win)("V8-H06: 믿을 수 있는 경로를 못 찾으면 보호 저장소는 바로 실패하고, PATH·작업 폴더의 가짜로 대신 찾지 않는다", async (ctx) => {
  if (!fakeExe) return ctx.skip("csc.exe 없음 — 가짜 PowerShell을 만들 수 없음");
  const { Vault } = await import("../server/vault.js");
  const { TrustedPathError, trustedPowerShell } = await import("../server/child-env-v8.js");
  const f = plantFakes(), home = process.cwd(), dir = tempDir("vault");
  vi.stubEnv("PATH", f.front + ";" + process.env.PATH);
  vi.stubEnv("SystemRoot", f.root);
  vi.stubEnv("NoDefaultCurrentDirectoryInExePath", undefined);
  try {
    process.chdir(f.cwd);
    // A system folder without powershell.exe: resolution fails, and nothing is searched for instead.
    const missing = new Vault(dir, false, () => trustedPowerShell(tempDir("nosys")));
    await expect(missing.write("h-seven", { sample: "SYNTHETIC" })).rejects.toBeInstanceOf(TrustedPathError);
    await expect(missing.protect("SYNTHETIC")).rejects.toBeInstanceOf(TrustedPathError);
    expect(existsSync(join(dir, "h-seven.dpapi"))).toBe(false);
    expect(f.ran()).toEqual([]);
  } finally {
    process.chdir(home);
  }
}, 30000);

it("V8-H07: 실제 격리 파서 실행 — 부모 환경에 NODE_OPTIONS(--require 감시 파일)·TLS·프록시 변수를 넣어도 워커는 받지 않고 문서를 정상 판독한다", async () => {
  const { isolatedParse } = await import("../server/extraction-v5.js");
  const { extractDocument } = await import("../server/extraction.js");
  const { LIBUV_FILLED } = await import("../server/child-env-v8.js");
  const dir = tempDir("require"), sentinel = join(dir, "NODE-OPTIONS-RAN"), hook = join(dir, "hook.cjs");
  writeFileSync(hook, `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "ran");`);
  // NODE_OPTIONS reads backslashes inside quotes as escapes, so the path uses forward slashes.
  const poison: Record<string, string> = { NODE_OPTIONS: `--require "${hook.replace(/\\/g, "/")}"`, NODE_TLS_REJECT_UNAUTHORIZED: "0", NODE_EXTRA_CA_CERTS: hook, NODE_PATH: dir,
    HTTPS_PROXY: "http://127.0.0.1:9", NODE_USE_ENV_PROXY: "1", OPENSSL_CONF: hook, SSL_CERT_FILE: hook, SHE_LAUNCH_TOKEN: "synthetic-token" };
  // Control: a child that inherits NODE_OPTIONS runs the hook. (With the whole set, OPENSSL_CONF pointing at a non-config
  // file already stops node at start-up, so a worker that inherited it would fail instead of parsing.)
  spawnSync(process.execPath, ["-e", "0"], { env: { ...process.env, NODE_OPTIONS: poison.NODE_OPTIONS }, windowsHide: true });
  expect(existsSync(sentinel)).toBe(true);
  rmSync(sentinel);
  expect(spawnSync(process.execPath, ["-e", "0"], { env: { ...process.env, OPENSSL_CONF: hook }, windowsHide: true }).status).not.toBe(0);
  for (const [k, v] of Object.entries(poison)) vi.stubEnv(k, v);
  const hwpx = readFileSync("docs/implementation-v5/official/notice.hwpx");
  expect((await isolatedParse(hwpx)).markdown).toContain("2025년 1월 2일");
  expect((await extractDocument(hwpx)).markdown).toContain("2025년 1월 2일");
  expect(forks.length).toBe(2);
  for (const opts of forks) {
    expect(Object.keys(opts.env!).sort()).toEqual(win ? [...LIBUV_FILLED].sort() : ["PATH"]);
    expect(JSON.stringify(opts.env)).not.toContain(dir);
    expect(JSON.stringify(opts.env)).not.toContain("synthetic-token");
  }
  expect(existsSync(sentinel)).toBe(false);
}, 60000);

// Local TLS fixture: self-signed certificate for fixture.test (tests/fixtures/v5-tls), served on 127.0.0.1 only.
async function tlsFixture() {
  const server = createServer({ key: readFileSync("tests/fixtures/v5-tls/synthetic-key.pem"), cert: readFileSync("tests/fixtures/v5-tls/cert.pem") }, (_q, s) => s.end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const probe = join(tempDir("tls"), "probe.cjs");
  writeFileSync(probe, `require("node:https").get({host:"127.0.0.1",port:${port},servername:"fixture.test",path:"/"},r=>{r.resume();r.on("end",()=>process.stdout.write("accepted"))}).on("error",e=>process.stdout.write("rejected:"+e.code));`);
  return { server, port, probe, close: () => new Promise<void>((r) => server.close(() => r())) };
}
const runNode = (args: string[], env: NodeJS.ProcessEnv, cwd?: string) => new Promise<string>((done) => {
  let out = "";
  const c = spawn(process.execPath, args, { env, cwd, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  c.stdout.on("data", (b) => (out += b));
  c.once("close", () => done(out.trim()));
});

it("V8-H08: 로컬 TLS 시험 — 부모 환경에 NODE_TLS_REJECT_UNAUTHORIZED=0·NODE_EXTRA_CA_CERTS를 넣어도 허용 목록 환경의 node 자식은 믿지 않는 인증서를 거부한다", async () => {
  const { nodeWorkerEnv } = await import("../server/child-env-v8.js");
  const t = await tlsFixture();
  try {
    // Controls: each variable, when inherited, really weakens TLS for this fixture.
    expect(await runNode([t.probe], { ...process.env })).toMatch(/^rejected:/);
    expect(await runNode([t.probe], { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" })).toBe("accepted");
    expect(await runNode([t.probe], { ...process.env, NODE_EXTRA_CA_CERTS: resolve("tests/fixtures/v5-tls/cert.pem") })).toBe("accepted");
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "0");
    vi.stubEnv("NODE_EXTRA_CA_CERTS", resolve("tests/fixtures/v5-tls/cert.pem"));
    vi.stubEnv("NODE_OPTIONS", "--use-openssl-ca");
    vi.stubEnv("SSL_CERT_FILE", resolve("tests/fixtures/v5-tls/cert.pem"));
    expect(await runNode([t.probe], nodeWorkerEnv())).toMatch(/^rejected:(SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/);
  } finally {
    await t.close();
  }
}, 30000);

it.skipIf(!win)("V8-H09: 실행기(C#) 실제 컴파일·실행 — Launcher.SetServerEnvironment로 띄운 node는 허용 목록 변수만 받고, 부모의 TLS 변수가 있어도 믿지 않는 인증서를 거부한다", async (ctx) => {
  if (!csc) return ctx.skip("csc.exe 없음 — 실행기 시험 하네스를 컴파일할 수 없음");
  const build = scratch.find((d) => d.includes("test-h7-"))!;
  const harness = join(build, "harness.exe");
  if (!existsSync(harness)) compile(harness, "LauncherEnvHarness", resolve("packaging/msix/launcher/Launcher.cs"), resolve("tests/fixtures/h7/launcher-env-harness.cs"));
  const t = await tlsFixture();
  const work = tempDir("work"), data = tempDir("data"), hookDir = tempDir("hook"), sentinel = join(hookDir, "NODE-OPTIONS-RAN"), hook = join(hookDir, "hook.cjs");
  writeFileSync(hook, `require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "ran");`);
  mkdirSync(join(work, "server"));
  writeFileSync(join(work, "server", "index.js"), readFileSync(t.probe, "utf8").replace('process.stdout.write("accepted")', 'process.stdout.write(JSON.stringify({tls:"accepted",names:Object.keys(process.env).map(k=>k.toUpperCase()).sort(),token:!!process.env.SHE_LAUNCH_TOKEN}))')
    .replace('process.stdout.write("rejected:"+e.code)', 'process.stdout.write(JSON.stringify({tls:"rejected:"+e.code,names:Object.keys(process.env).map(k=>k.toUpperCase()).sort(),token:!!process.env.SHE_LAUNCH_TOKEN}))'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, node_options: `--require "${hook.replace(/\\/g, "/")}"`, Node_Tls_Reject_Unauthorized: "0", node_extra_ca_certs: resolve("tests/fixtures/v5-tls/cert.pem"),
      Https_Proxy: "http://127.0.0.1:9", NODE_USE_ENV_PROXY: "1", OPENSSL_CONF: hook, NODE_PATH: hookDir, PSModulePath: hookDir, SHE_LAUNCH_TOKEN: "synthetic-parent-token", LAW_OC: "synthetic" };
    // Asynchronous: the TLS fixture runs in this process and must keep answering while the harness runs.
    const r = await new Promise<{ stdout: string }>((done, fail) => {
      let stdout = "";
      const c = spawn(harness, [process.execPath, work, data], { env, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      const timer = setTimeout(() => { c.kill(); fail(new Error("harness timeout")); }, 30000);
      c.stdout.on("data", (b) => (stdout += b));
      c.once("close", () => { clearTimeout(timer); done({ stdout }); });
    });
    const lines = Object.fromEntries(r.stdout.trim().split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(" ")), l.slice(l.indexOf(" ") + 1)]));
    const allowed = ["APPDATA", "LOCALAPPDATA", "NODE_ENV", "PATH", "PORT", "SHE_DATA_DIR", "SHE_INSTALLED", "SHE_LAUNCH_TOKEN", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "WINDIR"];
    expect(lines.NAMES.split(",")).toEqual(allowed);
    expect(lines.ROOT).toBe("True");
    expect(lines.PATH).toBe("True");
    expect(r.stdout.match(/^BAD refused$/gm)?.length).toBe(5);
    expect(r.stdout).not.toContain("BAD accepted");
    const child = JSON.parse(lines.CHILD);
    expect(child.names).toEqual(allowed);
    expect(child.token).toBe(true);
    expect(child.tls).toMatch(/^rejected:(SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE)$/);
    expect(existsSync(sentinel)).toBe(false);
    expect(r.stdout).not.toContain("synthetic-parent-token");
  } finally {
    await t.close();
  }
}, 60000);

it("V8-H10: 실행기 소스 — 사용자 환경을 비우고 허용 목록만 넣으며, 시스템 폴더는 Environment.SystemDirectory(API)에서, 토큰은 node 시작 정보에만 넣는다", () => {
  const src = readFileSync("packaging/msix/launcher/Launcher.cs", "utf8");
  const body = src.slice(src.indexOf("internal static void SetServerEnvironment"), src.indexOf("static void SetFolder"));
  expect(body).toContain("psi.EnvironmentVariables.Clear();");
  expect(body.indexOf("psi.EnvironmentVariables.Clear();")).toBeLessThan(body.indexOf('psi.EnvironmentVariables["SystemRoot"]'));
  expect(body).not.toMatch(/GetEnvironmentVariable|SHE_LAUNCH_TOKEN/);
  expect(src).toContain("SetServerEnvironment(psi, Environment.SystemDirectory, dataDir, port);");
  expect(src.match(/SHE_LAUNCH_TOKEN"\] = /g)?.length).toBe(1);
  expect(src).not.toMatch(/EnvironmentVariables\.Remove\(/);
  // The server code itself starts PowerShell only through the trusted path.
  const vault = readFileSync("server/vault.ts", "utf8");
  expect(vault).not.toMatch(/spawn\(\s*"powershell/);
  expect(vault).toContain("spawn(exe, [\"-NoProfile\", \"-NonInteractive\", \"-Command\", script]");
});

afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

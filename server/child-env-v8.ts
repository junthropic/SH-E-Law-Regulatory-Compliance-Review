import { existsSync } from "node:fs";
import { win32 } from "node:path";

// H7 (docs/implementation-v8/security-review-plan.md): every child process gets an environment built from an allow-list,
// never a copy of the parent's. Variables such as NODE_OPTIONS, NODE_TLS_REJECT_UNAUTHORIZED, NODE_EXTRA_CA_CERTS,
// NODE_USE_ENV_PROXY/HTTPS_PROXY, OPENSSL_CONF, SSL_CERT_FILE or PSModulePath can change what a child loads or which
// certificates it trusts; none of them is on the list, in any letter case. PowerShell (DPAPI) is started by an absolute
// path in the real Windows system directory, found without SystemRoot/windir/PATH. Values are never printed.

export class TrustedPathError extends Error {
  constructor() {
    super("Windows 시스템 폴더를 확인하지 못해 보호 저장소를 열 수 없습니다.");
    this.name = "TrustedPathError";
  }
}

// libuv (Node's process layer) fills these in from the parent when a child environment lacks them. Every child
// environment below sets each one, to a trusted value or to empty, so nothing is filled in from the parent.
export const LIBUV_FILLED = ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"] as const;

// Per-user folders PowerShell needs to start (USERPROFILE) or may write to (temp, app data). Paths only, no code.
export const POWERSHELL_USER_VARS = ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"] as const;

// Windows variable names are case-insensitive: `Path`, `PATH` and `path` are one variable. A name that appears more than
// once with different values (possible in a hand-built object) is treated as absent.
export function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const values = new Set(Object.keys(env).filter((k) => k.toUpperCase() === name.toUpperCase()).map((k) => env[k]).filter((v): v is string => typeof v === "string"));
  return values.size === 1 ? [...values][0] : undefined;
}

// The system directory is where Windows mapped ntdll.dll into this process. The loader always takes ntdll.dll from the
// real System32 (it is never searched for), so this does not depend on SystemRoot, windir, PATH or the working folder.
export function systemDirectoryFrom(loadedModules: readonly string[]): string | undefined {
  const dirs = new Map<string, string>();
  for (const file of loadedModules) {
    if (typeof file !== "string" || win32.basename(file).toLowerCase() !== "ntdll.dll") continue;
    const dir = win32.dirname(file);
    // A local drive path only (no \\server\, no \\?\ forms), ending in System32, already normalised.
    if (/^[A-Za-z]:\\/.test(dir) && win32.normalize(dir) === dir && win32.basename(dir).toLowerCase() === "system32") dirs.set(dir.toLowerCase(), dir);
    else return undefined;
  }
  return dirs.size === 1 ? [...dirs.values()][0] : undefined;
}

type Report = { getReport(): object; excludeEnv?: boolean; excludeNetwork?: boolean };
let cached: string | undefined;
// Reads the list of loaded modules from Node's diagnostic report (environment and network sections excluded; nothing
// is written to disk or printed). Windows only; anything unexpected throws instead of guessing.
export function trustedSystemDirectory(): string {
  if (cached) return cached;
  if (process.platform !== "win32") throw new TrustedPathError();
  const report = process.report as unknown as Report;
  const before = { env: report.excludeEnv, net: report.excludeNetwork };
  let modules: unknown;
  try {
    report.excludeEnv = true;
    report.excludeNetwork = true;
    modules = (report.getReport() as { sharedObjects?: unknown }).sharedObjects;
  } finally {
    report.excludeEnv = before.env;
    report.excludeNetwork = before.net;
  }
  const dir = Array.isArray(modules) ? systemDirectoryFrom(modules) : undefined;
  if (!dir || !existsSync(win32.join(dir, "ntdll.dll"))) throw new TrustedPathError();
  return (cached = dir);
}

// Windows PowerShell 5.1 in the system directory. No PATH search, no fallback: if it is not there, this throws.
export function trustedPowerShell(systemDir: string = trustedSystemDirectory(), exists: (p: string) => boolean = existsSync): string {
  const exe = win32.join(systemDir, "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!/^[A-Za-z]:\\/.test(systemDir) || !exists(exe)) throw new TrustedPathError();
  return exe;
}

function windowsBase(systemDir: string, path: string): Record<string, string> {
  const root = win32.dirname(systemDir);
  return { ...Object.fromEntries(LIBUV_FILLED.map((k) => [k, ""])), SYSTEMROOT: root, WINDIR: root, PATH: path };
}

// Node worker children (document parsers): only what Node needs to start on Windows (SystemRoot). PATH stays empty.
export function nodeWorkerEnv(platform: NodeJS.Platform = process.platform, systemDir?: string): Record<string, string> {
  if (platform !== "win32") return { PATH: "" };
  return windowsBase(systemDir ?? trustedSystemDirectory(), "");
}

// DPAPI PowerShell: system folders, the system module folder only (no user module folders), and this user's own
// profile/app-data/temp paths. Nothing else from the parent.
export function powerShellEnv(parent: NodeJS.ProcessEnv = process.env, systemDir: string = trustedSystemDirectory()): Record<string, string> {
  const root = win32.dirname(systemDir);
  const env = windowsBase(systemDir, [systemDir, root].join(";"));
  env.PSModulePath = win32.join(systemDir, "WindowsPowerShell", "v1.0", "Modules");
  for (const name of POWERSHELL_USER_VARS) {
    const value = envValue(parent, name);
    if (value && !value.includes("\0")) env[name] = value;
  }
  return env;
}

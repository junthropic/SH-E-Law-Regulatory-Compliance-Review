import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../server/vault.js";
import { trustedPowerShell } from "../server/child-env-v8.js";

// V8-H11 (2026-10-16): the vault now calls DPAPI through .NET ProtectedData instead of ConvertTo/From-SecureString, whose
// module autoload took 13-25 s on the GitHub Windows runner. Values written before the change (by the cmdlets) must still
// open, and values written now must open with the cmdlets. Synthetic text only.
const OLD_ENCRYPT = "$t=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString -String $t -AsPlainText -Force; ConvertFrom-SecureString -SecureString $s";
const OLD_DECRYPT = "$t=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString -String $t; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";

// The cmdlets run the way the old vault ran them: the parent environment minus PSModulePath (Windows PowerShell rebuilds it).
function oldCmdlet(script: string, input: string) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PSMODULEPATH"));
  return new Promise<string>((resolve, reject) => {
    const p = spawn(trustedPowerShell(), ["-NoProfile", "-NonInteractive", "-Command", script], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error("cmdlet failed: " + err.slice(0, 200)))));
    p.stdin.end(input);
  });
}

it.skipIf(process.platform !== "win32")("V8-H11: DPAPI 저장 형식 호환 — 예전 방식(ConvertFrom-SecureString)으로 감싼 값은 지금 금고가 열고, 지금 감싼 값은 예전 방식으로 열린다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "she-h11-"));
  try {
    const vault = new Vault(dir, false);
    const text = "synthetic-key-material-" + Date.now();
    const b64 = Buffer.from(text).toString("base64");
    // Now → old.
    const wrapped = await vault.protect(text);
    expect(wrapped.startsWith("dpapi:01000000d08c9ddf")).toBe(true);
    expect(await oldCmdlet(OLD_DECRYPT, wrapped.slice(6))).toBe(b64);
    // Old → now.
    const legacy = await oldCmdlet(OLD_ENCRYPT, b64);
    expect(legacy).toMatch(/^01000000d08c9ddf[0-9a-f]+$/);
    expect(await vault.unprotect("dpapi:" + legacy)).toBe(text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

import { spawn } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, win32 } from "node:path";
import { powerShellEnv, trustedPowerShell } from "./child-env-v8.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export class VaultUnavailableError extends Error {
  constructor() {
    super(
      "현재 실행 환경에 Windows 사용자 보호 프로필이 없습니다. 일반 사용자 세션에서 실행하거나 SHE_EPHEMERAL_AUTH=1로 세션 한정 연결을 사용하세요.",
    );
    this.name = "VaultUnavailableError";
  }
}

export class Vault {
  private memory: Record<string, unknown> = {};
  constructor(
    private dir: string,
    private ephemeral = process.env.NODE_ENV === "test",
    // H7: Windows PowerShell by absolute path in the real system directory; never a PATH or working-folder search.
    private powershell: () => string = trustedPowerShell,
  ) {}
  private async transform(value: string, encrypt: boolean): Promise<string> {
    if (process.platform !== "win32")
      throw new Error(
        "이 버전의 영구 자격증명 저장은 Windows DPAPI가 필요합니다.",
      );
    const operation = encrypt
      ? "$inputText=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $inputText -AsPlainText -Force; ConvertFrom-SecureString -SecureString $secure"
      : "$inputText=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $inputText; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";
    const script =
      "$ErrorActionPreference='Stop'; try { " +
      operation +
      " } catch { [Console]::Error.WriteLine($_.Exception.HResult); [Console]::Error.WriteLine($_.FullyQualifiedErrorId); exit 1 }";
    // Resolved before anything starts: if the trusted path is missing this throws and nothing is run.
    const exe = this.powershell();
    const env = powerShellEnv(process.env, win32.dirname(win32.dirname(win32.dirname(exe))));
    return new Promise((res, rej) => {
      // Executable and arguments stay separate (no shell). The secret goes through standard input, never the command
      // line; the environment is the allow-list from child-env-v8 (no PSModulePath user folders, no SHE_* values).
      const p = spawn(exe, ["-NoProfile", "-NonInteractive", "-Command", script], {
        windowsHide: true,
        shell: false,
        cwd: win32.dirname(win32.dirname(win32.dirname(exe))),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const timer = setTimeout(() => {
        p.kill();
        rej(new Error("보호 저장소 응답 시간이 초과되었습니다."));
      }, 15000);
      p.once("close", () => clearTimeout(timer));
      p.stdin.on("error", () => rej(new Error("보호 저장소 입력 실패")));
      let out = "",
        diagnostic = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => {
        diagnostic = (diagnostic + String(d)).slice(-8000);
      });
      p.on("error", () => rej(new Error("보호 저장소를 열 수 없습니다.")));
      p.on("close", (code) =>
        code === 0
          ? res(out.trim())
          : rej(
              /-2146893813|ProfileMayNotBeLoaded/i.test(diagnostic) ||
                (encrypt && diagnostic.includes("CryptographicException"))
                ? new VaultUnavailableError()
                : new Error(
                    "Windows 보호 저장소 처리 실패 (" +
                      diagnostic
                        .replace(/[^a-zA-Z0-9,._\-]/g, "")
                        .slice(0, 160) +
                      ")",
                  ),
            ),
      );
      p.stdin.end(value);
    });
  }
  async read<T>(name: string): Promise<T | undefined> {
    if (!/^[a-z-]+$/.test(name)) throw new Error("invalid vault key");
    if (this.ephemeral) return this.memory[name] as T | undefined;
    const p = join(this.dir, name + ".dpapi");
    if (!existsSync(p)) return;
    return JSON.parse(
      Buffer.from(
        await this.transform(readFileSync(p, "utf8"), false),
        "base64",
      ).toString("utf8"),
    );
  }
  async write(
    name: string,
    value: unknown,
    isCurrent: () => boolean = () => true,
  ) {
    if (!/^[a-z-]+$/.test(name)) throw new Error("invalid vault key");
    if (this.ephemeral) {
      if (isCurrent()) this.memory[name] = value;
      return;
    }
    const cipher = await this.transform(
      Buffer.from(JSON.stringify(value)).toString("base64"),
      true,
    );
    if (!isCurrent()) return;
    const p = join(this.dir, name + ".dpapi");
    writeFileSync(p + ".tmp", cipher, { mode: 0o600 });
    renameSync(p + ".tmp", p);
  }
  // v8 backup key wrap. Windows: DPAPI current-user scope, so only this Windows user can unwrap.
  // Ephemeral (tests, SHE_EPHEMERAL_AUTH): a per-instance random key stands in for the user scope.
  private sessionKey = randomBytes(32);
  async protect(text: string): Promise<string> {
    if (!this.ephemeral) return "dpapi:" + (await this.transform(Buffer.from(text).toString("base64"), true));
    const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", this.sessionKey, iv);
    const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return "session:" + Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
  }
  async unprotect(wrapped: string): Promise<string> {
    if (wrapped.startsWith("dpapi:") && !this.ephemeral)
      return Buffer.from(await this.transform(wrapped.slice(6), false), "base64").toString("utf8");
    if (wrapped.startsWith("session:") && this.ephemeral) {
      const raw = Buffer.from(wrapped.slice(8), "base64"), d = createDecipheriv("aes-256-gcm", this.sessionKey, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
    }
    throw new Error("wrap scope mismatch");
  }
  remove(name: string) {
    if (!/^[a-z-]+$/.test(name)) throw new Error("invalid vault key");
    delete this.memory[name];
    const p = join(this.dir, name + ".dpapi");
    if (existsSync(p)) unlinkSync(p);
  }
}

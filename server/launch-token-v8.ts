import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// H1 (docs/implementation-v8/security-review-plan.md): loopback does not tell Windows users apart, so in the installed
// build /api/bootstrap gives a new session only to a browser the launcher opened. The launcher (packaging/msix/launcher)
// makes a new random "launch key" on every start and passes it in SHE_LAUNCH_TOKEN (the variable keeps its old name).
// The key itself never reaches the browser. F-09: every time the launcher opens the browser it makes a new one-time
// value from the key; the browser gets it in the URL fragment (#launch=…, never sent in a request line) and sends it once
// in this header. Each value works once, for 5 minutes. Without the variable (development, tests) bootstrap behaves as
// before. The installed build (SHE_INSTALLED=1) does not start without it (server/index.ts).
export const LAUNCH_HEADER = "x-she-launch";
// One message for every refusal (no value, wrong, used, expired); the beta screen shows it as sent.
export const LAUNCH_REFUSED = "화면 오른쪽 아래 알림 영역의 SH·E 아이콘에서 「화면 열기」를 누르거나, 시작 메뉴에서 앱을 다시 열어 주세요.";
// Printed on stderr when the installed server is started without the launcher's key; it then exits without listening.
export const LAUNCH_MISSING = "SH·E 오류: 실행 토큰 없이 시작해 서버를 열지 않습니다. 시작 메뉴에서 앱을 다시 열어 주세요.";

// Tunable defaults. A value is accepted while -SKEW <= (now - issued) <= LIFETIME, both ends included.
export const LAUNCH_VALUE_LIFETIME_MS = 5 * 60_000;
// Allowance for clock differences between the launcher and the server on the same PC.
export const LAUNCH_VALUE_FUTURE_SKEW_MS = 60_000;

// One-time value (the launcher computes the same thing): 56 bytes as unpadded base64url, 75 characters.
//   0..7   issued time, Unix milliseconds, unsigned 64-bit big-endian
//   8..23  16 random bytes (the nonce that marks the value as used)
//   24..55 HMAC-SHA256 over bytes 0..23, keyed with the launch key string's UTF-8 bytes (not base64url-decoded)
// Only base64url characters, 16..128 long: the locked beta screen reads ^#launch=([A-Za-z0-9_-]{16,128})$.
const ISSUED_BYTES = 8, NONCE_BYTES = 16, SIGNED_BYTES = ISSUED_BYTES + NONCE_BYTES, VALUE_BYTES = SIGNED_BYTES + 32;
const VALUE_SHAPE = /^[A-Za-z0-9_-]{75}$/;

const sign = (key: string, signed: Buffer) => createHmac("sha256", Buffer.from(key, "utf8")).update(signed).digest();

// Read once at start-up and remove it from the environment, so no child process (DPAPI helper, parser worker) inherits it.
export function takeLaunchToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.SHE_LAUNCH_TOKEN;
  delete env.SHE_LAUNCH_TOKEN;
  return token || undefined;
}

// Makes a one-time value the way the launcher does. Used by tests and the C# cross-check; the server never mints.
export function mintLaunchValue(key: string, issuedMs: number, nonce: Uint8Array = randomBytes(NONCE_BYTES)): string {
  if (!Number.isSafeInteger(issuedMs) || issuedMs < 0) throw new RangeError("issuedMs must be a non-negative integer");
  if (nonce.length !== NONCE_BYTES) throw new RangeError(`nonce must be ${NONCE_BYTES} bytes`);
  const signed = Buffer.alloc(SIGNED_BYTES);
  signed.writeBigUInt64BE(BigInt(issuedMs), 0);
  signed.set(nonce, ISSUED_BYTES);
  return Buffer.concat([signed, sign(key, signed)]).toString("base64url");
}

export interface LaunchValueChecker {
  // True once for a valid, unused value, which is remembered as used from that moment. Everything else is false.
  accept(given: unknown): boolean;
  // How many used values are remembered (tests).
  readonly remembered: number;
}

// One checker per launch key (per server start): values made with an earlier key are refused. Reads Date.now() per call.
export function launchValueChecker(key: string): LaunchValueChecker {
  // nonce (hex) -> issued + LIFETIME. Pruned by the time written in the value, not the time it was accepted, so a value
  // issued ahead of the server clock stays remembered for as long as its age check could still pass.
  const used = new Map<string, number>();
  const prune = (now: number) => {
    for (const [nonce, until] of used) if (now > until) used.delete(nonce);
  };
  return {
    accept(given) {
      const now = Date.now();
      prune(now);
      // 1. One string of exactly 75 base64url characters that is the canonical encoding of its bytes: the 2 unused bits
      //    of the last character would otherwise let four strings decode to the same value.
      if (typeof given !== "string" || !VALUE_SHAPE.test(given)) return false;
      const bytes = Buffer.from(given, "base64url");
      if (bytes.length !== VALUE_BYTES || bytes.toString("base64url") !== given) return false;
      // 2. Signature, constant-time. A wrong signature is never remembered.
      const signed = bytes.subarray(0, SIGNED_BYTES);
      if (!timingSafeEqual(bytes.subarray(SIGNED_BYTES), sign(key, signed))) return false;
      // 3. Age, both bounds included.
      const issued = Number(bytes.readBigUInt64BE(0)), age = now - issued;
      if (age > LAUNCH_VALUE_LIFETIME_MS || age < -LAUNCH_VALUE_FUTURE_SKEW_MS) return false;
      // 4. Not used before. Spent from this moment, even if the response never reaches the browser.
      const nonce = bytes.subarray(ISSUED_BYTES, SIGNED_BYTES).toString("hex");
      if (used.has(nonce)) return false;
      used.set(nonce, issued + LAUNCH_VALUE_LIFETIME_MS);
      return true;
    },
    get remembered() {
      return used.size;
    },
  };
}

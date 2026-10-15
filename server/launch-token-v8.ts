import { timingSafeEqual } from "node:crypto";

// H1 (docs/implementation-v8/security-review-plan.md): loopback does not tell Windows users apart, so in the installed
// build /api/bootstrap gives a session only to the browser the launcher opened. The launcher (packaging/msix/launcher)
// makes a new random value on every start and passes it in SHE_LAUNCH_TOKEN; the browser gets it in the URL fragment
// (#launch=…, never sent in a request line) and sends it once in this header. Without the variable (development,
// tests) bootstrap behaves as before.
export const LAUNCH_HEADER = "x-she-launch";
export const LAUNCH_REFUSED = "시작 메뉴에서 앱을 다시 열어 주세요.";

// Read once at start-up and remove it from the environment, so no child process (DPAPI helper, parser worker) inherits it.
export function takeLaunchToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.SHE_LAUNCH_TOKEN;
  delete env.SHE_LAUNCH_TOKEN;
  return token || undefined;
}

// Constant-time comparison on equal-length buffers; a missing, repeated or wrong-length header is refused.
export function launchTokenMatches(expected: string, given: unknown): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(given),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

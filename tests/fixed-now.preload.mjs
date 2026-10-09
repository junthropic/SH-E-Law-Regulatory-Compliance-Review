// Date-matrix runs only. vitest.config.ts computes SHE_TEST_CLOCK_OFFSET_MS once from SHE_TEST_NOW
// and puts this file in NODE_OPTIONS, so the test workers and every Node child that inherits the env
// share one wall clock: real time + offset, still advancing. Unset = this file does nothing.
import { appendFileSync } from "node:fs";

const raw = process.env.SHE_TEST_CLOCK_OFFSET_MS;
if (raw && !globalThis.__sheClockOffsetMs) {
  const off = Number(raw);
  if (!Number.isFinite(off)) throw new Error("SHE_TEST_CLOCK_OFFSET_MS must be a number: " + raw);
  const Real = Date;
  function ShiftedDate(...a) {
    if (!new.target) return new Real(Real.now() + off).toString();
    return Reflect.construct(Real, a.length ? a : [Real.now() + off], new.target);
  }
  ShiftedDate.prototype = Real.prototype; // instanceof Date keeps working for every Date
  Object.setPrototypeOf(ShiftedDate, Real); // Date.parse / Date.UTC
  ShiftedDate.now = () => Real.now() + off;
  globalThis.Date = ShiftedDate;
  globalThis.__sheClockOffsetMs = off;
  // Evidence for the matrix runner: one JSON line per process that installed the shifted clock.
  // Written to a file, never stdout, so child-process stdout protocols stay untouched.
  const log = process.env.SHE_TEST_CLOCK_LOG;
  if (log) {
    try {
      appendFileSync(
        log,
        JSON.stringify({
          pid: process.pid,
          ppid: process.ppid,
          offsetMs: off,
          observedUtc: new ShiftedDate().toISOString(),
          tzEnv: process.env.TZ ?? null,
          tzResolved: Intl.DateTimeFormat().resolvedOptions().timeZone,
          argv1: process.argv[1] ?? null,
        }) + "\n",
      );
    } catch {
      // Logging is evidence only; a failed write must not change test behaviour.
    }
  }
}

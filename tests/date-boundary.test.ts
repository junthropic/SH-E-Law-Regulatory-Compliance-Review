import { afterEach, describe, expect, it, vi } from "vitest";
import { koreaDate } from "../shared/dates.js";
import { dayAfter, localDate } from "../server/periods-v3.js";

// Exact-instant checks for the Korea date boundaries. The date-matrix runs use an advancing clock, so a
// run started at KST 08:59:59 crosses 09:00 within a second; the boundary itself is pinned here instead.
// KST 09:00 is where the UTC calendar date changes; KST 00:00 is where the Korean civil date changes.
const matrixDates = ["2026-10-31", "2026-12-31", "2027-01-01", "2028-02-29", "2027-01-09"];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DATE-B01 KST 08:59:59 → 09:00:00 (UTC date flips, Korean date does not)", () => {
  for (const d of matrixDates) {
    it(d, () => {
      const before = new Date(`${d}T08:59:59+09:00`);
      const at = new Date(`${d}T09:00:00+09:00`);
      expect(at.getTime() - before.getTime()).toBe(1000);
      expect(koreaDate(before)).toBe(d);
      expect(koreaDate(at)).toBe(d);
      expect(before.toISOString().slice(0, 10)).toBe(dayAfter(d, -1));
      expect(at.toISOString().slice(0, 10)).toBe(d);
      expect(localDate(before.toISOString(), "Asia/Seoul")).toBe(d);
      expect(localDate(at.toISOString(), "Asia/Seoul")).toBe(d);
      expect(localDate(before.toISOString(), "UTC")).toBe(dayAfter(d, -1));
      expect(localDate(at.toISOString(), "UTC")).toBe(d);
    });
  }
});

describe("DATE-B02 KST 23:59:59 → 00:00:00 (Korean date flips)", () => {
  for (const d of matrixDates) {
    it(d, () => {
      const prev = dayAfter(d, -1);
      const before = new Date(`${prev}T23:59:59+09:00`);
      const at = new Date(`${d}T00:00:00+09:00`);
      expect(koreaDate(before)).toBe(prev);
      expect(koreaDate(at)).toBe(d);
      expect(localDate(before.toISOString(), "Asia/Seoul")).toBe(prev);
      expect(localDate(at.toISOString(), "Asia/Seoul")).toBe(d);
      // Both instants are on the previous UTC date.
      expect(localDate(at.toISOString(), "UTC")).toBe(prev);
    });
  }
});

describe("DATE-B03 calendar steps around the matrix dates", () => {
  it("month end, year end, leap day", () => {
    expect(dayAfter("2026-10-31")).toBe("2026-11-01");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter("2027-01-01", -1)).toBe("2026-12-31");
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
    expect(dayAfter("2028-02-29")).toBe("2028-03-01");
    expect(dayAfter("2027-02-28")).toBe("2027-03-01");
  });
});

describe("DATE-B04 date-matrix clock and explicit mocks do not stack", () => {
  const offset = (globalThis as { __sheClockOffsetMs?: number }).__sheClockOffsetMs;

  it("the shifted clock is installed exactly when SHE_TEST_NOW is set", () => {
    if (process.env.SHE_TEST_NOW) {
      expect(typeof offset).toBe("number");
      const target = Date.parse(process.env.SHE_TEST_NOW);
      // The clock advances from the target; a full suite run stays well under an hour.
      expect(Date.now()).toBeGreaterThanOrEqual(target - 1000);
      expect(Date.now() - target).toBeLessThan(3600000);
      expect(Math.abs(new Date().getTime() - Date.now())).toBeLessThan(1000);
    } else {
      expect(offset).toBeUndefined();
      expect(process.env.SHE_TEST_CLOCK_OFFSET_MS).toBeUndefined();
    }
  });

  it("vi.setSystemTime pins the exact instant, without the matrix offset added", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T08:59:59+09:00"));
    expect(new Date().toISOString()).toBe("2026-10-07T23:59:59.000Z");
    expect(Date.now()).toBe(Date.parse("2026-10-07T23:59:59Z"));
    expect(koreaDate()).toBe("2026-10-08");
    vi.setSystemTime(new Date("2026-10-08T09:00:00+09:00"));
    expect(new Date().toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(koreaDate()).toBe("2026-10-08");
    vi.useRealTimers();
    // Restored to the clock in force before (shifted in a matrix run, real otherwise).
    const expected = offset === undefined ? 0 : offset;
    expect(Math.abs(Date.now() - (performance.timeOrigin + performance.now()) - expected)).toBeLessThan(1000);
  });

  it("vi.spyOn(Date, 'now') replaces the clock value instead of adding to it", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00+09:00"));
    expect(Date.now()).toBe(Date.parse("2026-12-31T15:00:00Z"));
    vi.restoreAllMocks();
    const expected = offset === undefined ? 0 : offset;
    expect(Math.abs(Date.now() - (performance.timeOrigin + performance.now()) - expected)).toBeLessThan(1000);
  });
});

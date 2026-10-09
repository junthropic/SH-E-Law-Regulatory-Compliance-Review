import { z } from "zod";
const date = z.string().date();
export type Period = {
  unit: "date" | "instant";
  timezone: "Asia/Seoul" | "UTC";
  boundary: "closed" | "half_open";
  from: string;
  to: string | null;
  end: "known" | "open" | "unknown";
};
export function dayAfter(value: string, n = 1) {
  date.parse(value);
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function localDate(instant: string, timezone: Period["timezone"]) {
  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(instant) ||
    !Number.isFinite(Date.parse(instant))
  )
    throw new Error("시간대가 명시된 시각 필요");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function convertPeriod(
  input: Period,
  boundary: Period["boundary"],
  assessmentDate?: string,
) {
  if (input.unit === "instant") {
    localDate(input.from, input.timezone);
    if (input.to) localDate(input.to, input.timezone);
    if ((input.end === "known") !== (input.to !== null))
      throw new Error("종료 상태·시각 불일치");
    if (input.end === "unknown")
      return {
        state: "unmapped" as const,
        reason: "종료 시각 미확인",
        original: input,
      };
    if (boundary !== input.boundary)
      return {
        state: "unmapped" as const,
        reason: "시각 자료를 날짜 종료 경계로 변환하지 않음",
        original: input,
      };
    if (
      input.to &&
      (Date.parse(input.from) > Date.parse(input.to) ||
        (input.boundary === "half_open" &&
          Date.parse(input.from) === Date.parse(input.to)))
    )
      throw new Error("시각 기간 오류");
    return {
      state: "mapped" as const,
      period: input,
      assessmentWindow: false,
      original: input,
    };
  }
  date.parse(input.from);
  if (input.to) date.parse(input.to);
  if ((input.end === "known") !== (input.to !== null))
    throw new Error("종료 상태·날짜 불일치");
  if (input.end === "unknown")
    return {
      state: "unmapped" as const,
      reason: "종료일 미확인",
      original: input,
    };
  let end = input.to;
  if (!end) {
    if (!assessmentDate)
      return {
        state: "unmapped" as const,
        reason: "열린 기간의 평가 범위 필요",
        original: input,
      };
    date.parse(assessmentDate);
    end =
      input.boundary === "closed" ? assessmentDate : dayAfter(assessmentDate);
  }
  if (
    input.from > end ||
    (input.from === end && input.boundary === "half_open")
  )
    throw new Error("비어 있거나 역전된 기간");
  if (input.boundary !== boundary)
    end = dayAfter(end, boundary === "closed" ? -1 : 1);
  return {
    state: "mapped" as const,
    period: { ...input, to: end, end: "known" as const, boundary },
    assessmentWindow: input.end === "open",
    original: input,
  };
}

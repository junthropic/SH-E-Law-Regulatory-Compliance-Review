import { z } from "zod";
const date = z.string().date();
export const DeadlinePolicy = z
  .object({
    anchorEvent: z.string().min(1),
    amount: z.number().int().min(0).max(10000),
    unit: z.enum(["days", "months", "years"]),
    includeStart: z.boolean(),
    holidayRule: z.enum(["none", "next_day"]),
    holidays: z.array(date),
    calculationBasis: z.string().min(1),
    verified: z.boolean(),
  })
  .strict();
export function calculateDeadline(
  input: z.infer<typeof DeadlinePolicy>,
  event: { type: string; date: string } | undefined,
  asOf: string,
) {
  const p = DeadlinePolicy.parse(input);
  date.parse(asOf);
  if (
    !p.verified ||
    !event ||
    event.type !== p.anchorEvent ||
    !date.safeParse(event.date).success
  )
    return {
      state: "unknown" as const,
      due: null,
      reason: "기산 사건·날짜 또는 기간 계산 근거 확인 필요",
    };
  const start = new Date(event.date + "T00:00:00Z"),
    end = new Date(start);
  if (p.unit === "days")
    end.setUTCDate(
      end.getUTCDate() + p.amount - (p.includeStart && p.amount > 0 ? 1 : 0),
    );
  else {
    // Calendar periods begin on the counted first day. Missing corresponding dates end at month-end.
    const countedStart=new Date(start);
    if(!p.includeStart&&p.amount>0)countedStart.setUTCDate(countedStart.getUTCDate()+1);
    const months = p.amount * (p.unit === "years" ? 12 : 1);
    const target = new Date(
      Date.UTC(countedStart.getUTCFullYear(), countedStart.getUTCMonth() + months, 1),
    );
    const last = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    end.setTime(
      Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        Math.min(countedStart.getUTCDate(), last),
      ),
    );
    if (p.amount > 0 && countedStart.getUTCDate()<=last) end.setUTCDate(end.getUTCDate() - 1);
  }
  // Calendar/holiday choices are explicit reviewed policy, never a universal legal assumption.
  if (p.holidayRule === "next_day") {
    let n = 0;
    while (
      [0, 6].includes(end.getUTCDay()) ||
      p.holidays.includes(end.toISOString().slice(0, 10))
    ) {
      if (++n > 370) throw new Error("휴일 범위 확인 필요");
      end.setUTCDate(end.getUTCDate() + 1);
    }
  }
  const due = end.toISOString().slice(0, 10);
  return {
    due,
    state:
      asOf < event.date
        ? ("not_triggered" as const)
        : asOf < due
          ? ("running" as const)
          : asOf === due
            ? ("due" as const)
            : ("elapsed" as const),
    reason: p.calculationBasis,
  };
}

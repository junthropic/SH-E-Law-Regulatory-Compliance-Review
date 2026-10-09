import { it, expect } from "vitest";
import { fixture, writer, scope } from "./v2-fixture.js";
import { entityRef } from "../server/compliance-v2.js";
import {
  candidatePolicy,
  selectedPolicies,
  retentionYears,
  submissionTransition,
  evaluatePeriod,
  applyEffect,
  type LegalProfile,
  type ExceptionEffect,
} from "../server/policies-v3.js";
it.each(selectedPolicies)(
  "V3-C01: $id 후보 실행·독립 가상 승인·자료 누락 보류",
  (s) => {
    const f = fixture();
    try {
      const candidate = candidatePolicy(s.id, [entityRef(f.source)], writer.id);
      expect(candidate.unresolved.length).toBeGreaterThan(0);
      const unapproved = f.put("candidate", candidate);
      expect(() => f.approve(unapproved)).toThrow(/미확인/);
      // Test-only explicit synthetic profile and source. This does not approve the actual legal candidate.
      const policy = f.put("synthetic-policy", {
        ...candidate,
        domain: "synthetic",
        unresolved: [],
        deadline: candidate.deadline
          ? {
              ...candidate.deadline,
              verified: true,
              calculationBasis: "모의 날짜 계산만 승인",
            }
          : null,
      });
      f.approve(policy);
      const incomplete = f.put("missing-decision", {
        kind: "decision",
        scope,
        asOf: scope.periodTo,
        policy: entityRef(policy),
        facts: {},
        author: writer.id,
      });
      expect(f.repo.evaluate(writer, incomplete).category).toBe("more_data");
      for (const key of s.target)
        f.add(
          key,
          "true",
          key === s.event
            ? { eventType: s.event, eventDate: "2026-09-01" }
            : {},
        );
      f.add(s.done, "false");
      f.add(s.breach, "true");
      f.add("exception_applies", "false");
      if (s.event && !f.facts[s.event])
        f.add(s.event, "true", { eventType: s.event, eventDate: "2026-09-01" });
      const d = f.put("synthetic-decision", {
        kind: "decision",
        scope,
        asOf: scope.periodTo,
        policy: entityRef(policy),
        facts: f.facts,
        author: writer.id,
      });
      const before = f.repo.evaluate(writer, d);
      expect(before.category).not.toBe("clear_risk");
      expect(before.holds).toEqual([]);
      f.approve(d);
      expect(f.repo.evaluate(writer, d).category).toBe("clear_risk");
    } finally {
      f.clean();
    }
  },
);
it("V3-C02/S3: 보존 3·25·30년과 미확인 종류, 제출 개정 적용례를 분리한다", () => {
  expect(retentionYears("general", "unknown")).toBe(3);
  expect(retentionYears("structural", "false")).toBe(25);
  expect(retentionYears("structural", "true")).toBe(30);
  expect(retentionYears("structural", "unknown")).toBeNull();
  expect(retentionYears("unknown", "false")).toBeNull();
  expect(submissionTransition("2021-10-20")).toBe("false");
  expect(submissionTransition("2021-10-21")).toBe("true");
  expect(submissionTransition()).toBe("unknown");
});
it("V3-C03/S1/S3: 후임 선임·신고·대리·점검·제출의 불이행 사실을 서로 대체하지 않는다", () => {
  const policies = selectedPolicies.map((s) =>
    candidatePolicy(s.id, [], writer.id),
  );
  expect(
    new Set(policies.map((p) => JSON.stringify(p.nonfulfillment))).size,
  ).toBe(6);
  expect(
    policies.find((p) => p.obligationId.endsWith(".deputy"))?.applicability,
  ).not.toEqual(policies[0].applicability);
  expect(
    policies.find((p) => p.obligationId.endsWith(".result_submission"))
      ?.nonfulfillment,
  ).toEqual({ fact: "submission_nonperformance_proven" });
  for (const p of policies)
    expect(JSON.stringify(p.applicability)).not.toContain('"permit"');
});
const profile: LegalProfile = {
  id: "synthetic-profile",
  version: "1",
  nature: "submission",
  timezone: "Asia/Seoul",
  calendarVersion: "synthetic-2026",
  basis: ["가상 계산 근거"],
  review: "synthetic_approved",
  calculation: {
    anchorEvent: "appointed",
    amount: 14,
    unit: "days",
    includeStart: false,
    holidayRule: "none",
    holidays: [],
    calculationBasis: "가상 계산",
    verified: false,
  },
  recurrence: "once",
  endConvention: "date_end",
};
it("V3-C04: 미승인 profile·잘못된 기산 사건·실제 영역의 모의 승인은 unknown이다", () => {
  const e = { type: "appointed", date: "2026-10-01" };
  expect(
    evaluatePeriod({ ...profile, review: "unresolved" }, e, "2026-10-08", true)
      .state,
  ).toBe("unknown");
  expect(evaluatePeriod(profile, e, "2026-10-08", false).state).toBe("unknown");
  expect(
    evaluatePeriod(profile, { ...e, type: "issued" }, "2026-10-08", true).state,
  ).toBe("unknown");
  expect(evaluatePeriod(profile, e, "2026-10-15", true).state).toBe("due");
  expect(evaluatePeriod(profile, e, "2026-10-16", true).state).toBe("elapsed");
});
it("V3-C05: 반기·연간·직전 사건 반복을 명시적으로 계산하고 법정값으로 자동 지정하지 않는다", () => {
  const e = { type: "appointed", date: "2026-01-01" };
  expect(
    evaluatePeriod(
      { ...profile, recurrence: "half_year" },
      e,
      "2026-06-30",
      true,
    ).due,
  ).toBe("2026-06-30");
  expect(
    evaluatePeriod(
      { ...profile, recurrence: "half_year" },
      e,
      "2026-07-01",
      true,
    ).due,
  ).toBe("2026-12-31");
  expect(
    evaluatePeriod(
      { ...profile, recurrence: "calendar_year" },
      e,
      "2026-08-01",
      true,
    ).due,
  ).toBe("2026-12-31");
  expect(
    evaluatePeriod(
      {
        ...profile,
        recurrence: "rolling",
        calculation: { ...profile.calculation, unit: "months", amount: 12 },
      },
      { ...e, date: "2024-02-29" },
      "2025-02-28",
      true,
    ).due,
  ).toBe("2025-02-28");
});
const effect: ExceptionEffect = {
  id: "synthetic",
  from: "special-training",
  to: "initial-training",
  kind: "deemed",
  subject: "worker-a",
  fromDate: "2026-01-01",
  toDate: "2026-12-31",
  reviewed: true,
  condition: "true",
  requiresApproval: false,
  approvalConfirmed: false,
  remaining: ["기록 보존"],
};
it("V3-C07: 월말 초일 제외의 실제 기산일과 해당일 없는 달의 말일을 구분한다", () => {
  const p = {
    ...profile,
    calculation: { ...profile.calculation, unit: "months" as const, amount: 1 },
  };
  expect(
    evaluatePeriod(
      p,
      { type: "appointed", date: "2026-02-28" },
      "2026-03-31",
      true,
    ).due,
  ).toBe("2026-03-31");
  expect(
    evaluatePeriod(
      { ...p, calculation: { ...p.calculation, includeStart: true } },
      { type: "appointed", date: "2026-01-31" },
      "2026-02-28",
      true,
    ).due,
  ).toBe("2026-02-28");
});
it("V3-C08: 감경량·연장일이 미확인이면 효과를 적용하지 않고 잔존 의무를 보존한다", () => {
  const c = {
    obligation: "initial-training",
    subject: "worker-a",
    asOf: "2026-10-08",
    sourceFulfilled: "true" as const,
    originalAmount: 8,
    originalDue: "2026-10-10",
  };
  expect(
    applyEffect({ ...effect, kind: "reduction", amount: 4 }, c),
  ).toMatchObject({
    applied: true,
    changedAmount: 4,
    obligationDischarged: false,
  });
  expect(
    applyEffect({ ...effect, kind: "reduction", amount: 10 }, c).applied,
  ).toBe(false);
  expect(applyEffect({ ...effect, kind: "extension" }, c).applied).toBe(false);
  expect(
    applyEffect({ ...effect, kind: "extension", revisedDue: "2026-11-10" }, c),
  ).toMatchObject({
    applied: true,
    revisedDue: "2026-11-10",
    remaining: ["기록 보존"],
    obligationDischarged: false,
  });
});
it("V3-C06/AC28: 간주 방향·대상·기간과 승인 요구 여부, 잔존 의무를 구분한다", () => {
  const c = {
    obligation: "initial-training",
    subject: "worker-a",
    asOf: "2026-10-08",
    sourceFulfilled: "true" as const,
  };
  expect(applyEffect(effect, c)).toMatchObject({
    applied: true,
    remaining: ["기록 보존"],
  });
  expect(
    applyEffect(effect, { ...c, obligation: "special-training" }).applied,
  ).toBe(false);
  expect(applyEffect(effect, { ...c, subject: "worker-b" }).applied).toBe(
    false,
  );
  expect(applyEffect({ ...effect, requiresApproval: true }, c).applied).toBe(
    false,
  );
  expect(applyEffect({ ...effect, condition: "unknown" }, c).applied).toBe(
    false,
  );
  expect(
    applyEffect(effect, { ...c, sourceFulfilled: "unknown" }).applied,
  ).toBe(false);
});

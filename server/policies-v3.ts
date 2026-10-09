import type { Body, Ref, Truth } from "./compliance-v2.js";
import { calculateDeadline, DeadlinePolicy } from "./deadlines-v2.js";
import { localDate, dayAfter } from "./periods-v3.js";
import { z } from "zod";
export const selectedPolicies = [
  {
    id: "hazmat_manager.replacement",
    label: "안전관리자 재선임",
    article: "법 제15조제2항",
    version: "259933",
    event: "manager_departed",
    days: 30,
    target: ["facility_scope", "previous_appointment", "manager_departed"],
    done: "replacement_appointed",
    breach: "replacement_absence_proven",
  },
  {
    id: "hazmat_manager.appointment_report",
    label: "안전관리자 선임 신고",
    article: "법 제15조제3항",
    version: "259933",
    event: "manager_appointed",
    days: 14,
    target: ["facility_scope", "manager_appointed"],
    done: "appointment_reported",
    breach: "report_nonperformance_proven",
  },
  {
    id: "hazmat_manager.deputy",
    label: "안전관리자 대리 지정·대행",
    article: "법 제15조제5항",
    version: "259933",
    event: null,
    days: null,
    target: ["facility_scope", "deputy_trigger"],
    done: "qualified_deputy_performing",
    breach: "deputy_nonperformance_proven",
  },
  {
    id: "hazmat_manager.deputy_period",
    label: "대리 대행기간 상한",
    article: "법 제15조제5항 후단",
    version: "259933",
    event: "deputy_started",
    days: 30,
    target: ["facility_scope", "deputy_started"],
    done: "deputy_within_limit",
    breach: "deputy_continues_beyond_limit",
  },
  {
    id: "hazmat_check.record_retention",
    label: "정기점검 기록 보존",
    article: "시행규칙 제68조제2항·제65조제1항제3호",
    version: "287841",
    event: "retention_anchor",
    days: null,
    target: [
      "check_scope",
      "record_kind_confirmed",
      "retention_period_reviewed",
    ],
    done: "record_retained",
    breach: "premature_destruction_proven",
  },
  {
    id: "hazmat_check.result_submission",
    label: "정기점검 결과 제출",
    article: "법 제18조제2항·법률 제17518호 부칙 제3조",
    version: "259933",
    event: "check_performed",
    days: 30,
    target: ["check_scope", "submission_transition", "check_performed"],
    done: "result_submitted",
    breach: "submission_nonperformance_proven",
  },
] as const;
export function retentionYears(
  kind: "general" | "structural" | "unknown",
  special30: Truth,
) {
  if (kind === "general") return 3;
  if (kind === "structural" && special30 === "true") return 30;
  if (kind === "structural" && special30 === "false") return 25;
  return null;
}
export function submissionTransition(checkDate?: string) {
  if (!checkDate || !z.string().date().safeParse(checkDate).success)
    return "unknown" as Truth;
  return checkDate >= "2021-10-21" ? "true" : "false";
}
export function candidatePolicy(
  id: string,
  basis: Ref[],
  author: string,
): Extract<Body, { kind: "policy" }> {
  const s = selectedPolicies.find((s) => s.id === id);
  if (!s) throw new Error("정책 후보 없음");
  const keys = [...s.target, s.done, s.breach, "exception_applies"];
  return {
    kind: "policy",
    obligationId: s.id,
    label: s.label,
    basisDate: "2026-10-08",
    effectiveFrom: id.endsWith("result_submission")
      ? "2021-10-21"
      : "2025-08-07",
    effectiveTo: null,
    basis,
    author,
    domain: "hazmat-candidate-v3",
    applicability: { all: s.target.map((fact) => ({ fact })) },
    fulfillment: { fact: s.done },
    nonfulfillment: { fact: s.breach },
    exceptions: { fact: "exception_applies" },
    deadline:
      s.event && s.days !== null
        ? {
            anchorEvent: s.event,
            amount: s.days,
            unit: "days",
            includeStart: false,
            holidayRule: "none",
            holidays: [],
            calculationBasis: "개별 의무의 기간 profile 검토 대기",
            verified: false,
          }
        : null,
    immediate: s.id.endsWith(".deputy") || s.id.endsWith("record_retention"),
    requirements: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          label: factLabels[key] || "해당 사실의 대상·기간·증빙 확인",
          acceptedPaths: [
            "document",
            "agency_register",
            "electronic_record",
            "site_observation",
          ],
          alternatives: [
            "동일 대상·기간의 기관 확인 기록 또는 검토된 전자기록",
            "필요한 범위의 현장 확인",
          ],
          insufficientAlone: [
            "문서 미업로드",
            "공개 API 0건",
            "사용자 확인 표시",
          ],
          role: "case_reviewer",
        },
      ]),
    ),
    unresolved: [
      "대상·하위법·예외·위임·원문 범위의 독립 분야 검토",
      "기산점·초일·휴일·기간 성격의 법적 profile 검토",
    ],
    sanction: "unknown",
  };
}
export const factLabels: Record<string, string> = {
  facility_scope: "제조소등·관계인·적용 제외의 검토",
  previous_appointment: "이전 선임 사실",
  manager_departed: "해임·퇴직 사건과 일자",
  replacement_appointed: "후임 선임 실체·자격·선임일",
  replacement_absence_proven: "해당 기간의 재선임 불이행 입증",
  manager_appointed: "선임 사건과 일자",
  appointment_reported: "선임 신고 대상·접수·일자",
  report_nonperformance_proven: "신고 불이행 입증",
  deputy_trigger: "일시 부재 또는 후임 미선임 공백",
  qualified_deputy_performing: "자격 있는 대리자 지정·실제 대행",
  deputy_nonperformance_proven: "대리 지정·대행 불이행 입증",
  deputy_started: "대행 개시 사건과 일자",
  deputy_within_limit: "대행기간 상한 준수",
  deputy_continues_beyond_limit: "검토된 상한 이후 실제 대행",
  check_scope: "정기점검 대상·시설·기간",
  record_kind_confirmed: "일반·구조안전점검 기록 종류",
  retention_period_reviewed: "보존 기산점·기간·특례 검토",
  record_retained: "대상 기록의 실제 보존",
  premature_destruction_proven: "보존기간 중 폐기 사실 입증",
  submission_transition: "점검일 기준 제출 개정 적용례",
  check_performed: "점검 실시 사건과 일자",
  result_submitted: "점검결과 제출 대상·일자",
  submission_nonperformance_proven: "결과 제출 불이행 입증",
  exception_applies: "해당 의무의 예외 요건",
};
export type LegalProfile = {
  id: string;
  version: string;
  nature: "submission" | "duration" | "retention" | "periodic";
  timezone: "Asia/Seoul" | "UTC";
  calendarVersion: string;
  basis: string[];
  review: "unresolved" | "synthetic_approved" | "approved";
  calculation: z.infer<typeof DeadlinePolicy>;
  recurrence: "once" | "half_year" | "calendar_year" | "rolling";
  endConvention: "date_end";
};
export function evaluatePeriod(
  p: LegalProfile,
  event: { type: string; date: string } | undefined,
  asOf: string,
  synthetic: boolean,
) {
  const today = asOf.includes("T")
    ? localDate(asOf, p.timezone)
    : z.string().date().parse(asOf);
  if (
    p.review === "unresolved" ||
    (p.review === "synthetic_approved" && !synthetic) ||
    !p.basis.length ||
    !p.calendarVersion
  )
    return {
      state: "unknown",
      due: null,
      reason: "기간 해석·달력·권한 검토 필요",
      profile: p.id,
      internalAlert: null,
    };
  if (p.recurrence === "half_year" || p.recurrence === "calendar_year") {
    if (
      !event ||
      event.type !== p.calculation.anchorEvent ||
      !z.string().date().safeParse(event.date).success
    )
      return {
        state: "unknown",
        due: null,
        reason: "주기 발생 사건 확인 필요",
      };
    const year = Number(today.slice(0, 4)),
      half = Number(today.slice(5, 7)) <= 6;
    const from =
      p.recurrence === "calendar_year"
        ? `${year}-01-01`
        : `${year}-${half ? "01" : "07"}-01`;
    const due =
      p.recurrence === "calendar_year" || !half
        ? `${year}-12-31`
        : `${year}-06-30`;
    return {
      state:
        today < event.date
          ? "not_triggered"
          : today === due
            ? "due"
            : "running",
      due,
      from,
      profile: p.id,
      internalAlert: null,
    };
  }
  return {
    ...calculateDeadline({ ...p.calculation, verified: true }, event, today),
    profile: p.id,
    internalAlert: null,
  };
}
export type ExceptionEffect = {
  id: string;
  from: string;
  to: string;
  kind:
    | "out_of_scope"
    | "exemption"
    | "reduction"
    | "deemed"
    | "substitution"
    | "extension"
    | "deferral";
  subject: string;
  fromDate: string;
  toDate: string;
  reviewed: boolean;
  condition: Truth;
  requiresApproval: boolean;
  approvalConfirmed: boolean;
  remaining: string[];
  amount?: number;
  revisedDue?: string;
};
export function applyEffect(
  e: ExceptionEffect,
  ctx: {
    obligation: string;
    subject: string;
    asOf: string;
    sourceFulfilled: Truth;
    originalAmount?: number;
    originalDue?: string;
  },
) {
  for (const d of [e.fromDate, e.toDate, ctx.asOf]) z.string().date().parse(d);
  if (e.fromDate > e.toDate) throw new Error("예외 적용 기간 역전");
  const matches =
    e.to === ctx.obligation &&
    e.subject === ctx.subject &&
    e.fromDate <= ctx.asOf &&
    e.toDate >= ctx.asOf;
  const magnitude =
    e.kind === "reduction"
      ? typeof e.amount === "number" &&
        Number.isFinite(e.amount) &&
        e.amount >= 0 &&
        typeof ctx.originalAmount === "number" &&
        e.amount <= ctx.originalAmount
      : ["extension", "deferral"].includes(e.kind)
        ? z.string().date().safeParse(e.revisedDue).success &&
          !!ctx.originalDue &&
          e.revisedDue! >= ctx.originalDue
        : true;
  const applied =
    matches &&
    magnitude &&
    e.reviewed &&
    e.condition === "true" &&
    (!e.requiresApproval || e.approvalConfirmed) &&
    (!["deemed", "substitution"].includes(e.kind) ||
      ctx.sourceFulfilled === "true");
  return {
    applied,
    effect: applied ? e.kind : null,
    remaining: e.remaining,
    sourceObligation: e.from,
    targetObligation: e.to,
    reviewRequired: matches && !applied,
    changedAmount: applied && e.kind === "reduction" ? e.amount : null,
    revisedDue:
      applied && ["extension", "deferral"].includes(e.kind)
        ? e.revisedDue
        : null,
    obligationDischarged:
      applied &&
      ["out_of_scope", "exemption", "deemed", "substitution"].includes(e.kind),
  };
}

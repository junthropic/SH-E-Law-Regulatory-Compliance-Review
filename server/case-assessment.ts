import { domainFields, reviewDomains } from "../shared/review-domains.js";
import { factConflict, factClarification } from "./fact-checks.js";
import { compareFactAssertions } from "./fact-provenance.js";
import type { ReviewResult } from "../shared/types.js";
import type { CaseAssessment, ConditionDecision } from "../shared/dossier.js";
import { intakeFields } from "../shared/intake.js";
import { confirmedAnswer } from "./legal.js";
import { sha } from "./store.js";

export const factsHash = (r: ReviewResult) =>
  sha(
    JSON.stringify([
      r.request.region,
      r.request.municipality,
      r.request.asOf,
      r.request.prompt,
      Object.entries(r.request.answers).sort(([a], [b]) => a.localeCompare(b)),
      r.facts.map(f => [f.key, f.value, f.unit || "", f.confirmed,
        f.provenance ? [f.provenance.assertionSource, f.provenance.userAttested,
          f.provenance.verificationStatus, [...f.provenance.evidenceIds].sort(),
          [...f.provenance.conflictIds].sort(), f.provenance.subjectId,
          f.provenance.measurementBasis, f.provenance.scope,
          f.provenance.validFrom, f.provenance.validTo] : null,
      ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ]),
  );
export function assessCase(
  r: ReviewResult,
  decisions: ConditionDecision[] = [],
): CaseAssessment {
  const dangerous = /위험물|저장|취급|화학|인화|가연|물질/.test(
    r.request.prompt,
  );
  const defaults = dangerous
    ? [
        "material",
        "concentration",
        "quantity",
        "facility",
        "activity",
        "permit",
        "dates",
      ]
    : ["activity", "facility", "permit", "dates"];
  const profiles = reviewDomains(r.request.prompt);
  const keys: string[] = profiles.length ? [...new Set(profiles.flatMap(p => [...p.facts]))] : defaults;
  const fields = [...intakeFields, ...domainFields];
  const facts = keys.map((key) => {
    const field = fields.find((f) => f[0] === key)!;
    const value = r.request.answers[key] || "";
    let complete = confirmedAnswer(value),
      question: string = field[2];
    if (
      key === "quantity" &&
      complete &&
      !/\d[\d,.]*\s*(?:mL|kL|L|kg|g|t|리터|톤|킬로그램|그램|밀리리터|킬로리터)(?![A-Za-z가-힣])/i.test(
        value,
      )
    ) {
      complete = false;
      question =
        "최대 저장·취급 수량을 숫자와 단위로 적어주세요. 예: 200 L. 물질별 수량과 합산 구역도 확인하세요.";
    }
    if (
      key === "dates" &&
      complete &&
      !/\d{4}\s*(?:[-./]|년)\s*\d{1,2}\s*(?:[-./]|월)/.test(value)
    ) {
      complete = false;
      question =
        "설치·변경·사용 시작 시점을 날짜로 적어주세요. 아직 정하지 않았다면 미확인으로 남겨주세요.";
    }
    const assertions = r.facts.filter(f => f.key === key);
    const structuredConflict = assertions.some((a, i) => assertions.slice(i + 1).some(b => compareFactAssertions(a, b) === "conflict"));
    const conflict = factConflict(key, value, r.request.prompt) || (structuredConflict ? "동일 조건의 입력 불일치" : undefined);
    const clarification = factClarification(key, value, r.request.prompt);
    if (clarification) { complete = false; question = clarification; }
    if (conflict) question = structuredConflict ? "동일 대상·산정 기준·범위·기간의 입력이 서로 다릅니다. 원본을 확인하세요." : conflict;
    return {
      key,
      label: field[1],
      value,
      state: conflict ? ("conflict" as const) : complete
        ? ("confirmed" as const)
        : confirmedAnswer(value)
          ? ("incomplete" as const)
          : ("missing" as const),
      question,
    };
  });
  const all = (r.verification?.basis || []).flatMap((b) =>
    b.passages.map((p) => {
      const selected = new Set<string>();
      if (/물질|품명|종류|위험물|인화/.test(p.quote)) {
        selected.add("material");
        selected.add("concentration");
      }
      if (/수량|배수|이상|미만|초과|이하|용량/.test(p.quote))
        selected.add("quantity");
      if (/장소|시설|저장|취급|실내|실외/.test(p.quote)) {
        selected.add("facility");
        selected.add("activity");
      }
      if (/허가|신고|변경/.test(p.quote)) selected.add("permit");
      if (p.kind === "supplement" || /시행|설치|기존|종전|경과/.test(p.quote))
        selected.add("dates");
      if (!selected.size || p.kind === "exception") {
        selected.add("activity");
        selected.add("facility");
        selected.add("dates");
      }
      const factKeys = [...selected].filter((k) => keys.includes(k));
      return {
        id: sha(
          JSON.stringify([b.evidenceId, p.kind, p.offset, p.quote]),
        ).slice(0, 24),
        evidenceId: b.evidenceId,
        quote: p.quote,
        kind: p.kind,
        factKeys,
        missing: factKeys.filter(
          (k) => facts.find((f) => f.key === k)?.state !== "confirmed",
        ),
      };
    }),
  );
  const conditions = all.slice(0, 100);
  const current = decisions.filter((d) => {
    const c = conditions.find((c) => c.id === d.conditionId),
      e = r.evidence.find((e) => e.id === c?.evidenceId);
    return !!e && d.basisHash === e.hash && d.factsHash === factsHash(r);
  });
  return { facts, conditions, totalConditions: all.length, decisions: current };
}

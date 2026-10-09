import { randomUUID } from "node:crypto";
import { diffLines } from "diff";
import type { CaseFact, Evidence, LegalIssue, Rule } from "../shared/types.js";
import { factConflict, factClarification } from "./fact-checks.js";
import { compareDecimal } from "./fact-provenance.js";
import { koreaDate } from "../shared/dates.js";

export const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
export function confirmedAnswer(value: string) {
  return (
    !!value.trim() &&
    !/모름|모르|미확인|확인\s*중|확인\s*필요|알\s*수\s*없|아직|확인\s*안|미제공|미제출|미업로드|미정|예정|추정|불명|확인되지|제공되지|(?:서류|자료|기록|문서)\s*(?:가|이)?\s*없|조회\s*(?:결과\s*)?0\s*건|조회\s*실패|응답\s*시간\s*초과|unknown/i.test(
      value,
    )
  );
}
export function verifyCitation(e: Evidence | undefined, quote: string) {
  return (
    !!e &&
    normalize(quote).length >= 8 &&
    normalize(e.text).includes(normalize(quote))
  );
}
export function applicable(e: Evidence, region: string, date: string) {
  return (
    (e.region === "전국" || e.region === region) &&
    !e.repealed &&
    !!e.effectiveFrom &&
    e.effectiveFrom <= date &&
    (!e.effectiveTo || date <= e.effectiveTo)
  );
}
export function evidenceGaps(
  e: Evidence[],
  region: string,
  date: string,
): string[] {
  const gaps: string[] = [];
  if (new Set(e.map((x) => x.sourceId)).size !== e.length)
    gaps.push(
      "같은 법규의 시행일·공포일이 같은 서로 다른 원문이 있습니다. 공식 원문 대조가 필요합니다.",
    );
  if (!e.some((x) => x.kind === "law"))
    gaps.push("국가 법령 전문을 확인하지 못했습니다.");
  if (!e.some((x) => x.kind === "ordinance" && x.region === region))
    gaps.push("해당 지역 조례 전문을 확인하지 못했습니다.");
  for (const x of e.filter((x) => ["law", "ordinance"].includes(x.kind))) {
    for (const conflict of x.sourceConflicts || []) gaps.push(x.title + ": 출처 간 정보 불일치 — " + conflict);
    if (!x.complete)
      gaps.push(x.title + ": 전문 또는 연결 조문이 불완전합니다.");
    if (!x.annexesComplete)
      gaps.push(x.title + ": 별표·서식 확인이 필요합니다.");
    if (!x.verified)
      gaps.push(x.title + ": 예외·위임·경과조치 검증이 필요합니다.");
    if (!x.historyComplete && date < koreaDate())
      gaps.push(x.title + ": 해당 기준일 연혁의 완전성을 확인해야 합니다.");
    if (!applicable(x, region, date))
      gaps.push(x.title + ": 적용 지역 또는 시행 기간이 맞지 않습니다.");
    const age = Date.now() - Date.parse(x.fetchedAt);
    if (!Number.isFinite(age) || age < -60000 || age > 24 * 3600 * 1000)
      gaps.push(x.title + ": 최근 24시간 내 원문 갱신을 확인하지 못했습니다.");
  }
  return [...new Set(gaps)];
}
export function enforceIssue(
  issue: LegalIssue,
  evidence: Evidence[],
  gaps: string[],
): LegalIssue {
  const valid = issue.citations.filter((c) =>
    verifyCitation(
      evidence.find((e) => e.id === c.evidenceId),
      c.quote,
    ),
  );
  const broken = valid.length !== issue.citations.length;
  const onlyReference = valid.length > 0 && valid.every(c => ["petition", "interpretation", "document"].includes(evidence.find(e => e.id === c.evidenceId)?.kind || ""));
  // Only deterministic reviewed rules may produce clear_risk; model assertions never do.
  const category =
    broken || !valid.length || onlyReference
      ? "more_data"
      : issue.category === "clear_risk"
        ? "human_review"
        : issue.category;
  return {
    ...issue,
    category,
    conclusion:
      broken || !valid.length
        ? "모델의 판단을 원문으로 검증할 수 없어 보류했습니다. 확인 가능한 근거를 확보한 뒤 재검토하세요."
        : onlyReference ? "개별 회신·참고자료만으로 현재 사업장의 의무 또는 위반을 확정할 수 없습니다. 당시 법령·사실관계와 현재 적용 근거를 대조하세요."
        : issue.category === "clear_risk" ? "모델이 제안한 쟁점입니다. 적용 조건·예외와 확인된 사실을 검토자가 대조하기 전에는 위반 여부를 확정할 수 없습니다."
        : issue.conclusion,
    citations: valid,
    missing: [
      ...issue.missing,
      ...(onlyReference ? ["현재 기준일의 법령·조례 원문 및 사업장 사실과의 일치 확인"] : []),
      ...(broken
        ? ["인용 원문이 일치하지 않아 해당 인용을 제외했습니다."]
        : []),
      ...(category === "more_data" && !valid.length
        ? ["검증 가능한 법규 원문 근거"]
        : []),
    ],
    conditions: [
      ...issue.conditions,
      ...(gaps.length
        ? ["미확인 범위가 있어 확정적인 준법 판단으로 사용할 수 없습니다."]
        : []),
    ],
  };
}
export function evaluateRule(
  rule: Rule,
  facts: CaseFact[],
  evidence: Evidence[],
  region: string,
  date: string,
): LegalIssue | undefined {
  if (
    !rule.approved ||
    !rule.reviewer ||
    (rule.region !== region && rule.region !== "전국") ||
    rule.effectiveFrom > date ||
    (rule.effectiveTo && rule.effectiveTo < date)
  )
    return;
  const supported = evidence.filter((e) =>
    rule.evidenceHashes.includes(e.hash),
  );
  if (
    !rule.evidenceHashes.length ||
    supported.length !== rule.evidenceHashes.length ||
    evidenceGaps(supported, region, date).length
  )
    return;
  if (
    supported.some(
      (e) =>
        !["law", "ordinance"].includes(e.kind) ||
        !verifyCitation(e, rule.quotes?.[e.hash] || ""),
    )
  )
    return;
  for (const key of [...rule.requiredFacts, ...rule.exceptionFacts, rule.predicate.fact])
    if (facts.filter(f => f.key === key).length !== 1 ||
        !facts.some((f) => f.key === key && f.confirmed && confirmedAnswer(f.value) && !factConflict(key, f.value) && !factClarification(key, f.value) && !f.provenance?.conflictIds.length))
      return;
  if (
    rule.exceptionFacts.some(
      (k) => facts.find((f) => f.key === k)?.value !== "해당 없음",
    )
  )
    return;
  const fact = facts.find((f) => f.key === rule.predicate.fact && f.confirmed);
  if (!fact) return;
  const p = rule.predicate;
  const compared = compareDecimal(fact.value, String(p.value));
  const matched =
    p.operator === "eq"
      ? fact.value === String(p.value)
      : compared !== undefined &&
        (p.operator === "gte"
          ? compared >= 0
          : p.operator === "gt"
            ? compared > 0
            : p.operator === "lt"
              ? compared < 0
              : compared <= 0);
  if (!matched) return;
  return {
    id: randomUUID(),
    // Legacy rules describe a threshold, not an independently proven breach of an obligation.
    // Do not promote them until obligation-specific proof, scope and due-date gates exist.
    category: "human_review",
    title: rule.title,
    conclusion: "검토 규칙의 입력 조건이 일치합니다. 실제 적용 대상·이행 기한·예외와 의무 불이행을 입증하는 자료를 대조하기 전에는 위반 여부를 확정할 수 없습니다.",
    conditions: rule.requiredFacts.map(
      (k) => `${facts.find((f) => f.key === k)?.label || "확인 항목"}: ${facts.find((f) => f.key === k)?.value}`,
    ),
    citations: supported.map((e) => ({
      evidenceId: e.id,
      quote: rule.quotes[e.hash],
    })),
    exceptions: rule.exceptionFacts.map(k => facts.find(f => f.key === k)?.label || "예외 확인 항목"),
    missing: ["사업장 사실의 증빙·현장 대조", "해당 의무의 적용·기한·예외 및 불이행 입증 검토"],
    nextActions: ["근거와 입력 사실을 확인하고 필요한 조치를 진행하세요."],
    severity: "unspecified",
    ruleId: rule.id + "@" + rule.version,
  };
}
export function quantityRatio(
  items: {
    quantity: number;
    unit: string;
    designated: number;
    designatedUnit: string;
  }[],
  groupConfirmed: boolean,
) {
  if (!groupConfirmed)
    throw new Error("합산 대상 저장·취급 단위를 먼저 확인하세요.");
  const units: Record<string, { type: string; factor: number }> = {
    L: { type: "volume", factor: 1 },
    mL: { type: "volume", factor: 0.001 },
    kL: { type: "volume", factor: 1000 },
    kg: { type: "mass", factor: 1 },
    g: { type: "mass", factor: 0.001 },
    t: { type: "mass", factor: 1000 },
  };
  if (!items.length) throw new Error("물질을 입력하세요.");
  return items.reduce((sum, x) => {
    const u = units[x.unit],
      d = units[x.designatedUnit];
    if (
      !u ||
      !d ||
      u.type !== d.type ||
      !Number.isFinite(x.quantity) ||
      !Number.isFinite(x.designated) ||
      x.quantity < 0 ||
      x.designated <= 0
    )
      throw new Error(
        "수량·단위·지정수량을 확인하세요. 질량과 부피는 자동 환산하지 않습니다.",
      );
    return sum + (x.quantity * u.factor) / (x.designated * d.factor);
  }, 0);
}
export function versionDiff(a: Evidence, b: Evidence) {
  return {
    label: "시스템 생성 비교 — 공식 신구대비표가 아닙니다.",
    from: a.version,
    to: b.version,
    changes: diffLines(a.text, b.text),
  };
}
export function redact(text: string) {
  return text
    .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, "[주민번호 삭제]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 삭제]")
    .replace(/\b0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}\b/g, "[전화번호 삭제]");
}

import { reviewDomains } from "../shared/review-domains.js";
import { ordinanceScope } from "../shared/jurisdictions.js";
import { randomUUID } from "node:crypto";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { ChatGPTAuth } from "./auth.js";
import { analyze } from "./ai.js";
import { EgressDenied,requireEgress,requestDigest } from "./egress-v3.js";
import {
  evidenceGaps,
  enforceIssue,
  evaluateRule,
  confirmedAnswer,
} from "./legal.js";
import { syncSources } from "./sources.js";
import { hasCoverageApproval } from "./approval.js";
import { buildVerification, verificationGaps } from "./verification.js";
import { attachLinkedBasis, collectReference, saveLinkedBasis } from "./reference-collection.js";
import { assessCase } from "./case-assessment.js";
import { recordAssertion } from "./fact-provenance.js";
import { attachComparisons } from "./dossier.js";
import type {
  ReviewResult,
  ReviewRequest,
  DocumentRecord,
  LegalIssue,
  SourceStatus,
} from "../shared/types.js";
export function recentSourceCheck(
  states: SourceStatus[],
  region: string,
  now = Date.now(),
): string | null {
  const relevant = states.filter(
    (s) => s.region === "전국" || s.region === region,
  );
  if (
    relevant.length !== 2 ||
    !relevant.some((s) => s.region === region) ||
    !relevant.some((s) => s.region === "전국")
  )
    return null;
  const times = relevant.map((s) => s.lastSuccessAt);
  if (
    relevant.some((s) => {
      const age = now - Date.parse(s.lastSuccessAt || "");
      return (
        s.status !== "ok" ||
        s.count < 1 ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= 24 * 3600 * 1000
      );
    })
  )
    return null;
  return times.sort()[0]!;
}
export const questions = [
  {
    key: "material",
    label: "물질명·성상·품명과 분류 근거(SDS 등)는 무엇인가요?",
  },
  { key: "quantity", label: "최대 저장량·취급량과 단위는 무엇인가요?" },
  {
    key: "facility",
    label: "저장·취급 시설 구분, 작업 방식과 합산 대상 구역은 어떻게 되나요?",
  },
  { key: "permit", label: "기존 허가·신고 내용과 이번 변경사항은 무엇인가요?" },
  { key: "dates", label: "설치·허가·변경·사용 시작일은 언제인가요?" },
];
export function newReview(request: ReviewRequest): ReviewResult {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request,
    status: "running",
    progress: "입력 사실과 자료를 확인하고 있습니다.",
    facts: [],
    issues: [],
    evidence: [],
    gaps: [],
    questions: [],
    coverage: {
      region: request.region,
      asOf: request.asOf,
      latestCheckedAt: null,
      complete: false,
      sources: [],
    },
    model: request.useAi ? request.model : "local-check",
    rulesVersion: "0.1.0",
    needsReview: false,
  };
}
export async function runReview(
  store: Store,
  vault: Vault,
  auth: ChatGPTAuth,
  r: ReviewResult,
  refresh = syncSources,
  finalize?: (review: ReviewResult) => void,
) {
  const progress = (s: string) => {
    r.progress = s;
    store.saveReview(r);
  };
  try {
    const docs = r.request.documentIds
      .map((id) => store.document(id))
      .filter(Boolean) as DocumentRecord[];
    if (docs.length !== r.request.documentIds.length)
      throw new Error("선택한 첨부자료 일부를 찾을 수 없습니다.");
    r.facts = [
      {
        key: "region",
        label: "소재지",
        value: r.request.region + " " + r.request.municipality,
        source: "사용자 선택",
        confirmed: true,
      },
      {
        key: "asOf",
        label: "검토 기준일",
        value: r.request.asOf,
        source: "사용자 선택",
        confirmed: true,
      },
      ...Object.entries(r.request.answers).map(([key, value]) => ({
        key,
        label: questions.find((q) => q.key === key)?.label || key,
        value,
        source: "사용자 추가 답변",
        confirmed: confirmedAnswer(value),
      })),
    ].map(f => recordAssertion(f, "user", r.createdAt));
    const oc =
      process.env.LAW_OC || (await vault.read<{ lawOc: string }>("law"))?.lawOc;
    let checkedAt = recentSourceCheck(store.sources(), r.request.region);
    if (checkedAt) {
      progress(
        "최근 24시간 내 수집에 성공한 공식 원문을 사용합니다. 확인 시각은 결과에 표시됩니다.",
      );
    } else if (oc) {
      progress("해당 지역·국가 법규의 최신 버전을 확인하고 있습니다.");
      const states = await refresh(store, oc, r.request.region, progress);
      checkedAt = recentSourceCheck(states, r.request.region);
      if (!checkedAt)
        r.gaps.push(
          "일부 공식 출처의 최신 확인이 실패했습니다. 저장된 근거와 현재 정보를 구분해 검토해야 합니다.",
        );
    } else
      r.gaps.push(
        "법제처 OC 미설정: 현재 시점의 공식 자료를 실시간 확인하지 못했습니다.",
      );
    r.evidence = store.search(
      r.request.prompt +
        " " + reviewDomains(r.request.prompt).flatMap(p => [...p.laws]).join(" ") + " " +
        Object.values(r.request.answers).join(" "),
      r.request.region,
      r.request.asOf,
    );
    r.evidence = attachLinkedBasis(store, r.request, r.evidence).filter(
      (e) =>
        e.kind !== "ordinance" ||
        ordinanceScope(e.title, r.request.region, r.request.municipality) !==
          "other",
    );
    // Extend actual review collection beyond the dangerous-goods pilot. Keep
    // collected versions bound to this request; failures remain explicit gaps.
    const extraLaws = [...new Set(reviewDomains(r.request.prompt).filter(p => p.id !== "dangerous").flatMap(p => [...p.laws]))];
    for (const title of extraLaws) {
      if (r.evidence.some(e => e.title.replace(/\s/g, "") === title.replace(/\s/g, ""))) continue;
      if (!oc || (r.request.linkedEvidenceIds?.length || 0) >= 30) continue;
      progress(title + "의 기준일 원문을 수집하고 있습니다.");
      try {
        const collected = await collectReference(store, oc, r.request, title);
        saveLinkedBasis(store, r.request, collected);
        r.request.linkedEvidenceIds = [...(r.request.linkedEvidenceIds || []), collected.id];
        r.evidence.push(collected);
      } catch {
        r.gaps.push(title + ": 자동 원문 수집 실패. 목록·버전·기관 응답과 원본을 확인하세요.");
      }
    }
    attachComparisons(store, r);
    r.gaps.push(...evidenceGaps(r.evidence, r.request.region, r.request.asOf));
    const approved = hasCoverageApproval(
      store,
      r.request.region,
      r.request.municipality,
      r.request.asOf,
      r.evidence,
    );
    r.verification = buildVerification(r.evidence, r.request, approved);
    r.gaps.push(...verificationGaps(r.verification, r.evidence));
    if (!approved)
      r.gaps.push(
        "지자체 공보와의 대조 및 관련 시·군·구 위임 규정 확인이 필요합니다.",
      );
    r.caseAssessment = assessCase(r);
    if (r.facts.some(f => !["region", "asOf"].includes(f.key)))
      r.gaps.push("입력된 사업장 사실은 사용자 진술입니다. 답변 작성이나 자료의 추출문 확인만으로 증빙 대조·현장 확인이 완료되지는 않습니다.");
    for (const fact of r.facts) {
      const checked = r.caseAssessment.facts.find(f => f.key === fact.key);
      if (checked && checked.state !== "confirmed") fact.confirmed = false;
    }
    for (const fact of r.caseAssessment.facts.filter(f => f.state === "conflict"))
      r.gaps.push(fact.label + ": " + fact.question);
    for (const doc of docs.filter(d => d.responseDate || d.agency))
      r.gaps.push(doc.name + ": 개별 회신의 회신일·당시 법령·사실관계·적용 범위를 현재 질문과 대조해야 합니다.");
    for (const profile of reviewDomains(r.request.prompt))
      for (const title of profile.laws)
        if (!r.evidence.some(e => e.title.replace(/\s/g, "") === title.replace(/\s/g, "")))
          r.gaps.push(title + ": 이번 업무의 연결 원문 미확보. 원문 수집·재검토가 필요합니다.");
    r.questions = r.caseAssessment.facts
      .filter((f) => f.state !== "confirmed")
      .map((f) => ({ key: f.key, label: f.question }));
    if (r.caseAssessment.totalConditions > r.caseAssessment.conditions.length)
      r.gaps.push(
        `적용 조건 후보 ${r.caseAssessment.totalConditions}개 중 ${r.caseAssessment.conditions.length}개를 표시합니다. 나머지 조건은 전문에서 추가 대조해야 합니다.`,
      );
    for (const rule of store
      .rules()
      .filter(
        (rule) =>
          rule.approved &&
          (rule.region === "전국" || rule.region === r.request.region),
      ))
      for (const key of [...rule.requiredFacts, ...rule.exceptionFacts])
        if (
          !confirmedAnswer(r.request.answers[key] || "") &&
          !r.questions.some((q) => q.key === key)
        )
          r.questions.push({
            key,
            label:
              key +
              " — 확인한 사실을 입력하세요. 예외 미적용을 확인했다면 “해당 없음”으로 기록하세요.",
          });
    for (const d of docs)
      if (!d.confirmed) r.gaps.push(d.name + ": 추출문 미확인");
    let canTransmit=r.request.useAi;
    if(canTransmit){try{requireEgress(auth.egress,[requestDigest(r.request),...docs.map(d=>d.hash),...r.evidence.map(e=>e.hash)],"review");}catch(e){if(!(e instanceof EgressDenied))throw e;canTransmit=false;r.gaps.push(e.message);}}
    if (canTransmit) {
      progress("근거를 연결하고 해석 쟁점을 분석하고 있습니다.");
      const result = await analyze(
        auth,
        r.request,
        r.evidence,
        docs,
        progress,
        r.verification,
        r.caseAssessment,
      );
      r.facts.push(
        ...result.data.facts
          .map((f) => recordAssertion({ ...f, confirmed: false }, "model", new Date().toISOString()))
          .filter((f) => !r.facts.some((x) => x.key === f.key)),
      );
      r.questions.push(
        ...result.data.questions.filter(
          (q) =>
            !r.questions.some((x) => x.key === q.key) &&
            !r.request.answers[q.key],
        ),
      );
      if (result.omitted.length)
        r.gaps.push(
          "AI 검토에서 일부 본문이 생략되었습니다: " +
            result.omitted.join(", "),
        );
      r.issues = result.data.issues.map((i) =>
        enforceIssue({ ...i, id: randomUUID() }, r.evidence, r.gaps),
      );
    }
    const missing = r.questions.map((q) => q.label);
    if (r.gaps.length || missing.length) {
      const issue: LegalIssue = {
        id: randomUUID(),
        category: "more_data",
        title: "판단에 필요한 사실·근거 확인",
        conclusion:
          "현재 확보한 자료만으로 법적 의무 또는 위반 여부를 확정할 수 없습니다.",
        conditions: [],
        citations: [],
        exceptions: [],
        missing: [...missing, ...r.gaps],
        nextActions: [
          "아래 추가 질문에 답하고, 자료함에서 회신·허가자료를 연결하세요.",
          "자료 현황에서 미확인 출처를 확인하세요.",
        ],
        severity: "unspecified",
      };
      r.issues.push(issue);
    }
    // Rules are eligible only when the entire review coverage, not just cited excerpts, is complete.
    if (!r.gaps.length && !missing.length)
      for (const rule of store.rules()) {
        const issue = evaluateRule(
          rule,
          r.facts,
          r.evidence,
          r.request.region,
          r.request.asOf,
        );
        if (issue) r.issues.push(issue);
      }
    if (!r.request.useAi)
      r.gaps.push(
        "AI 해석을 실행하지 않았습니다. 현재 결과는 자료·사실 확인 목록입니다.",
      );
    r.coverage = {
      region: r.request.region,
      asOf: r.request.asOf,
      latestCheckedAt: checkedAt,
      complete: !r.gaps.length && !missing.length,
      sources: [...new Set(r.evidence.map((e) => e.url))],
    };
    if(finalize){try{finalize(r);}catch{
      r.issues=r.issues.map(i=>({...i,category:"more_data"}));
      r.gaps.push("연결 평가 처리 실패: 확정 판단을 보류합니다.");r.coverage.complete=false;
    }}
    r.status = "completed";
    progress(
      r.request.useAi
        ? "검토가 완료되었습니다. 근거와 미확인 범위를 함께 확인하세요."
        : "자료 확인이 완료되었습니다. AI 해석은 ChatGPT 연결 후 실행할 수 있습니다.",
    );
  } catch (e) {
    r.status = "failed";
    r.error = e instanceof Error ? e.message : "검토 실패";
    progress("분석이 완료되지 않았습니다. 입력·자료는 저장되어 있습니다.");
  }
}

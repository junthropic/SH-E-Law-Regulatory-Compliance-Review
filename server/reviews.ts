import { randomUUID } from "node:crypto";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { ChatGPTAuth } from "./auth.js";
import { analyze } from "./ai.js";
import {
  evidenceGaps,
  enforceIssue,
  evaluateRule,
  confirmedAnswer,
} from "./legal.js";
import { syncSources } from "./sources.js";
import { hasCoverageApproval } from "./approval.js";
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
    ];
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
        " 위험물 저장 취급 허가 " +
        Object.values(r.request.answers).join(" "),
      r.request.region,
      r.request.asOf,
    );
    r.gaps.push(...evidenceGaps(r.evidence, r.request.region, r.request.asOf));
    if (
      !hasCoverageApproval(
        store,
        r.request.region,
        r.request.municipality,
        r.request.asOf,
        r.evidence,
      )
    )
      r.gaps.push(
        "지자체 공보와의 대조 및 관련 시·군·구 위임 규정 확인이 필요합니다.",
      );
    r.questions = questions.filter(
      (q) => !confirmedAnswer(r.request.answers[q.key] || ""),
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
    if (r.request.useAi) {
      progress("근거를 연결하고 해석 쟁점을 분석하고 있습니다.");
      const result = await analyze(auth, r.request, r.evidence, docs, progress);
      r.facts.push(
        ...result.data.facts
          .map((f) => ({ ...f, confirmed: false }))
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

import { comparisonLabels, decisionLabels } from "../shared/dossier.js";
import { checkLabels, passageLabels } from "../shared/verification.js";
import type { ReviewResult } from "../shared/types.js";
import { presentReview, resultStateLabels } from "../shared/result-language.js";
export const labels = {
  clear_risk: "명확한 법률 리스크",
  human_review: "사람의 판단 필요",
  more_data: "추가 자료 필요",
};
function verificationMarkdown(r: ReviewResult) {
  const report = r.verification;
  if (!report) return "";
  const checks = (items: typeof report.checks) =>
    items
      .map((c) => `- ${c.label}: ${checkLabels[c.state]} — ${c.detail}`)
      .join("\n");
  return `\n\n## 근거별 검증\n문구 탐지는 예외 적용 또는 위반 판정이 아닙니다.\n확인 시각: ${report.checkedAt}\n${checks(report.checks)}\n${report.basis
    .map((b) => {
      const e = r.evidence.find((e) => e.id === b.evidenceId);
      return `\n### ${e?.title || b.evidenceId}\n원문 해시: ${e?.hash || ""}\n${checks(b.checks)}\n\n연결 법규: ${b.references.length}/${b.referencesTotal}개 표시\n${b.references.map((x) => `- ${x.title}: ${x.state === "candidate" ? "원문 후보 연결 · 적용 조항 대조 필요" : x.state === "missing" ? "연결 원문 필요" : "버전 충돌 대조 필요"}`).join("\n")}\n\n확인 위치: ${b.passages.length}/${b.passagesTotal}개 표시\n${b.passages.map((p) => `- ${passageLabels[p.kind]}: ${p.quote}`).join("\n")}`;
    })
    .join("\n")}`;
}
function collectionMarkdown(r: ReviewResult) {
  const c = r.referenceCollection;
  return c
    ? `\n\n## 연결 원문 수집\n법규: ${c.title}\n이전 검토 ID: ${c.parentReviewId}\n상태: ${resultStateLabels[c.state] || "확인 필요"}\n${c.message}\n`
    : "";
}
function dossierMarkdown(r: ReviewResult) {
  const comparisons = (r.comparisons || [])
    .map(
      (c) =>
        `### ${comparisonLabels[c.kind]} — ${c.documentName}\n법령 해시: ${c.evidenceHash}\n자료 해시: ${c.documentHash}\n출처: ${c.sourceUrl || "사용자 제공 자료"}\n${c.checks.map((x) => `- ${x.label}: ${resultStateLabels[x.state] || "확인 필요"} — ${x.detail}`).join("\n")}\n법령 발췌: ${c.lawQuote}\n자료 발췌: ${c.documentQuote}\n검토자: ${c.review ? `${c.review.reviewer} / ${c.review.reviewedAt} / ${c.review.note}` : "확인 기록 없음"}`,
    )
    .join("\n\n");
  const a = r.caseAssessment;
  return `\n\n## 원본 대조 기록\n선택 범위의 비교이며 전체 원문·법률 규칙 승인이 아닙니다.\n${comparisons || "대조 기록 없음"}\n\n## 사업장 적용 검토\n${a ? a.facts.map((f) => `- ${f.label}: ${f.value || "미입력"} (${resultStateLabels[f.state] || "확인 필요"})`).join("\n") : "사실 연결 기록 없음"}\n${a?.decisions.map((d) => `- 조건 ${d.conditionId}: ${decisionLabels[d.decision]} / ${d.reviewer} / ${d.note}`).join("\n") || "검토자 적용 판단 없음"}`;
}
export function markdown(r: ReviewResult) {
  r = presentReview(r);
  return `# SH·E 법규 검토\n\n검토 ID: ${r.id}\n\n소재지: ${r.request.region} ${r.request.municipality}\n기준일: ${r.request.asOf}\n상태: ${resultStateLabels[r.status]}\n모델: ${r.model}\n규칙 버전: ${r.rulesVersion}\n\n## 검토 요청\n${r.request.prompt}\n\n## 사실관계\n${r.facts.map((f) => `- ${f.label}: ${f.value} (${f.confirmed ? "사용자 확인" : "추출·미확인"})`).join("\n")}\n\n${r.issues
    .map(
      (i) =>
        `## ${labels[i.category]} — ${i.title}\n${i.conclusion}\n\n${i.conditions.map((x) => "- 적용 조건: " + x).join("\n")}\n${i.citations
          .map((c) => {
            const e = r.evidence.find((e) => e.id === c.evidenceId);
            return `> ${c.quote}\n\n근거: ${e?.title} / ${e?.article} / 시행 ${e?.effectiveFrom} / 버전 ${e?.version}\n출처: ${e?.url}\n원문 해시: ${e?.hash}`;
          })
          .join(
            "\n\n",
          )}\n\n${i.exceptions.map((x) => "- 예외·단서: " + x).join("\n")}\n${i.missing.map((x) => "- 추가 확인: " + x).join("\n")}\n${i.nextActions.map((x) => "- 다음 조치: " + x).join("\n")}`,
    )
    .join(
      "\n\n",
    )}${collectionMarkdown(r)}${verificationMarkdown(r)}${dossierMarkdown(r)}\n\n## 미확인 범위\n${r.gaps.map((g) => "- " + g).join("\n")}\n\n생성: ${r.createdAt}\n최신 버전 확인: ${r.coverage.latestCheckedAt || "미확인"}\n${r.needsReview ? "근거·원본 대조·적용 판단을 반영한 재검토가 필요합니다." : ""}`;
}
export function csv(r: ReviewResult) {
  r = presentReview(r);
  const escape = (s: string) =>
    '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
  return (
    "\ufeff" +
    [
      ["분류", "쟁점", "결론", "추가자료", "다음조치", "근거URL"],
      ...r.issues.map((i) => [
        labels[i.category],
        i.title,
        i.conclusion,
        i.missing.join(" / "),
        i.nextActions.join(" / "),
        i.citations
          .map((c) => r.evidence.find((e) => e.id === c.evidenceId)?.url || "")
          .join(" / "),
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")
  );
}

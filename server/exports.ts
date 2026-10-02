import type { ReviewResult } from "../shared/types.js";
export const labels = {
  clear_risk: "명확한 법률 리스크",
  human_review: "사람의 판단 필요",
  more_data: "추가 자료 필요",
};
export function markdown(r: ReviewResult) {
  return `# SH·E 법규 검토\n\n검토 ID: ${r.id}\n\n소재지: ${r.request.region} ${r.request.municipality}\n기준일: ${r.request.asOf}\n상태: ${r.status}\n모델: ${r.model}\n규칙 버전: ${r.rulesVersion}\n\n## 검토 요청\n${r.request.prompt}\n\n## 사실관계\n${r.facts.map((f) => `- ${f.label}: ${f.value} (${f.confirmed ? "사용자 확인" : "추출·미확인"})`).join("\n")}\n\n${r.issues
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
    )}\n\n## 미확인 범위\n${r.gaps.map((g) => "- " + g).join("\n")}\n\n생성: ${r.createdAt}\n최신 버전 확인: ${r.coverage.latestCheckedAt || "미확인"}\n${r.needsReview ? "법규 변경으로 재검토가 필요합니다." : ""}`;
}
export function csv(r: ReviewResult) {
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

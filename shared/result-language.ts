import type { ReviewResult } from "./types.js";

export const resultStateLabels: Record<string, string> = {
  running: "검토 중", completed: "검토 완료", failed: "처리 실패",
  collected: "원문 확보", missing: "자료 미확보", confirmed: "사용자 답변 확인",
  incomplete: "확인에 필요한 내용 부족", conflict: "입력 충돌 · 판단 보류",
  match: "일치", difference: "차이 있음", unconfirmed: "미확인",
  low: "낮음", medium: "보통", high: "높음", unspecified: "별도 판단",
};
const flags: Record<string, [string, string]> = {
  verified: ["근거 검토자 확인 필요", "근거 검토자 확인 기록 있음"],
  complete: ["전문 또는 검토 범위에 미확인 부분 있음", "전문 또는 검토 범위 확인 기록 있음"],
  annexesComplete: ["별표·서식 원본과 내용 대조 필요", "별표·서식 대조 기록 있음"],
  historyComplete: ["연혁·부칙·시행일 대조 필요", "연혁·부칙 대조 기록 있음"],
};
/** Presentation only: never rewrite stored originals, quotations, IDs or rule inputs. */
export function resultText(text: string, originals: string[] = []) {
  return text.replace(/\b(verified|complete|annexesComplete|historyComplete)\s*[=:]\s*(true|false)\b/g,
    (raw, field: string, value: string) => originals.some(s => s.includes(raw)) ? raw : flags[field][value === "true" ? 1 : 0]);
}
export function presentReview(r: ReviewResult): ReviewResult {
  const originals = [r.request.prompt, ...Object.values(r.request.answers), ...r.evidence.map(e => e.text)];
  const t = (s: string) => resultText(s, originals);
  return { ...r, progress: t(r.progress), error: r.error ? t(r.error) : r.error,
    gaps: r.gaps.map(t), questions: r.questions.map(q => ({...q, label:t(q.label)})),
    issues: r.issues.map(i => ({...i, title:t(i.title), conclusion:t(i.conclusion),
      conditions:i.conditions.map(t), exceptions:i.exceptions.map(t), missing:i.missing.map(t), nextActions:i.nextActions.map(t)})),
  };
}

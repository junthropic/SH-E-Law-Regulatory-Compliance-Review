import type { LegalIssue } from "../shared/types.js";

// B-2: a published protected case leaves only a reference in the plaintext reviews table.
// The duty label and legal basis date are public; counts, facts, states, notes and hashes stay in the protected store.
export const PROTECTED_REFERENCE_NOTE = "보호 사례 결과 — 본문은 보호 저장소에만 있습니다. 보호 사례 화면에서 확인하세요.";
export function protectedReference(caseId: string, version: number, ruleId: string, label: string, extra: string[] = []): LegalIssue {
  return {
    id: caseId + ":" + ruleId,
    ruleId,
    title: label,
    category: "human_review",
    conclusion: PROTECTED_REFERENCE_NOTE,
    conditions: [`보호 사례 참조 ${caseId} · 버전 ${version}`, ...extra],
    citations: [],
    exceptions: [],
    missing: [],
    nextActions: ["보호 사례 화면에서 결과와 근거를 확인하세요."],
    severity: "unspecified",
  };
}

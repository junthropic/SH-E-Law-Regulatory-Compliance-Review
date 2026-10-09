export type CheckState = "checked" | "missing" | "review";
export type BasisCheck = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
};
export type ReviewPassage = {
  kind: "annex" | "supplement" | "exception" | "delegation";
  quote: string;
  offset: number;
};
export type BasisVerification = {
  evidenceId: string;
  checks: BasisCheck[];
  references: {
    title: string;
    evidenceIds: string[];
    state: "candidate" | "missing" | "ambiguous";
  }[];
  passages: ReviewPassage[];
  passagesTotal: number;
  referencesTotal: number;
};
export type VerificationReport = {
  version: 1;
  checkedAt: string;
  checks: BasisCheck[];
  basis: BasisVerification[];
};
export const checkLabels: Record<CheckState, string> = {
  checked: "확인됨",
  missing: "자료 필요",
  review: "대조 필요",
};
export const passageLabels: Record<ReviewPassage["kind"], string> = {
  annex: "별표·서식",
  supplement: "부칙·경과조치·시행 특례",
  exception: "예외·단서",
  delegation: "위임·준용",
};

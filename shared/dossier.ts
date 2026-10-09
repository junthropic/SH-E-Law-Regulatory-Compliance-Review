import { z } from "zod";

export const comparisonInput = z.object({
  evidenceId: z.string().uuid(),
  documentId: z.string().uuid(),
  kind: z.enum(["gazette", "annex", "supplement"]),
  lawQuote: z.string().trim().min(8).max(20000),
  documentQuote: z.string().trim().min(8).max(20000),
  publicationDate: z.union([z.string().date(), z.literal("")]).default(""),
  effectiveDate: z.union([z.string().date(), z.literal("")]).default(""),
  sourceUrl: z.union([z.string().url().max(2000), z.literal("")]).default(""),
});
export type ComparisonInput = z.infer<typeof comparisonInput>;
export type ComparisonRecord = ComparisonInput & {
  id: string;
  createdAt: string;
  evidenceHash: string;
  evidenceIdentity: string;
  documentHash: string;
  documentTextHash: string;
  documentName: string;
  provenance: "downloaded" | "user_provided";
  changes: { value: string; added?: boolean; removed?: boolean }[];
  checks: {
    label: string;
    state: "match" | "difference" | "unconfirmed";
    detail: string;
  }[];
  numbers: { law: string[]; document: string[] };
  markers: { law: string[]; document: string[] };
  review?: { reviewer: string; note: string; reviewedAt: string };
};
export type ConditionItem = {
  id: string;
  evidenceId: string;
  quote: string;
  kind: string;
  factKeys: string[];
  missing: string[];
};
export type ConditionDecision = {
  conditionId: string;
  reviewer: string;
  note: string;
  decision: "applies" | "excluded" | "uncertain";
  basisHash: string;
  factsHash: string;
  createdAt: string;
};
export type CaseAssessment = {
  facts: {
    key: string;
    label: string;
    value: string;
    state: "confirmed" | "incomplete" | "missing" | "conflict";
    question: string;
  }[];
  conditions: ConditionItem[];
  totalConditions: number;
  decisions: ConditionDecision[];
};
export const decisionInput = z.object({
  conditionId: z.string().min(1).max(100),
  reviewer: z.string().trim().min(2).max(100),
  note: z.string().trim().min(15).max(3000),
  decision: z.enum(["applies", "excluded", "uncertain"]),
});
export const comparisonLabels = {
  gazette: "공보",
  annex: "별표·서식",
  supplement: "부칙·경과조치",
};
export const decisionLabels = {
  applies: "적용 검토",
  excluded: "예외·미적용 검토",
  uncertain: "판단 보류",
};
export const gazetteSites = [
  {
    label: "경기도보",
    url: "https://www.gg.go.kr/bbs/board.do?bsIdx=769&menuId=1786",
  },
  {
    label: "화성시 시보",
    url: "https://www.hscity.go.kr/www/user/bbs/BD_selectBbsList.do?q_bbsCode=1030",
  },
];

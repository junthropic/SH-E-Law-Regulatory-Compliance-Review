import { z } from "zod";

export const regions = [
  ["11", "서울특별시"],
  ["26", "부산광역시"],
  ["27", "대구광역시"],
  ["28", "인천광역시"],
  ["29", "광주광역시"],
  ["30", "대전광역시"],
  ["31", "울산광역시"],
  ["36", "세종특별자치시"],
  ["41", "경기도"],
  ["51", "강원특별자치도"],
  ["43", "충청북도"],
  ["44", "충청남도"],
  ["52", "전북특별자치도"],
  ["46", "전라남도"],
  ["47", "경상북도"],
  ["48", "경상남도"],
  ["50", "제주특별자치도"],
] as const;
export const ReviewRequestSchema = z.object({
  prompt: z.string().min(10).max(30000),
  region: z.string().refine((s) => regions.some((r) => r[1] === s)),
  municipality: z.string().max(100).default(""),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
    ),
  documentIds: z.array(z.string().uuid()).max(20).default([]),
  model: z.string().max(100).default(""),
  useAi: z.boolean().default(false),
  answers: z.record(z.string(), z.string().max(6000)).default({}),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;
export type Evidence = {
  id: string;
  sourceId: string;
  kind:
    | "law"
    | "ordinance"
    | "interpretation"
    | "petition"
    | "document"
    | "gazette";
  title: string;
  region: string;
  article: string;
  text: string;
  url: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  promulgatedAt: string;
  fetchedAt: string;
  hash: string;
  complete: boolean;
  annexesComplete: boolean;
  historyComplete: boolean;
  verified: boolean;
  verificationNote: string;
  rawRef?: string;
  links: string[];
};
export type CaseFact = {
  key: string;
  label: string;
  value: string;
  unit?: string;
  source: string;
  confirmed: boolean;
};
export type Citation = { evidenceId: string; quote: string };
export type LegalIssue = {
  id: string;
  category: "clear_risk" | "human_review" | "more_data";
  title: string;
  conclusion: string;
  conditions: string[];
  citations: Citation[];
  exceptions: string[];
  missing: string[];
  nextActions: string[];
  severity: "unspecified" | "low" | "medium" | "high";
  ruleId?: string;
};
export type ReviewResult = {
  id: string;
  createdAt: string;
  updatedAt: string;
  request: ReviewRequest;
  status: "running" | "completed" | "failed";
  progress: string;
  facts: CaseFact[];
  issues: LegalIssue[];
  evidence: Evidence[];
  gaps: string[];
  questions: { key: string; label: string }[];
  coverage: {
    region: string;
    asOf: string;
    latestCheckedAt: string | null;
    complete: boolean;
    sources: string[];
  };
  model: string;
  rulesVersion: string;
  needsReview: boolean;
  error?: string;
};
export type DocumentRecord = {
  id: string;
  name: string;
  createdAt: string;
  type: string;
  text: string;
  hash: string;
  warnings: string[];
  confirmed: boolean;
  agency: string;
  responseDate: string;
  region: string;
};
export type SourceStatus = {
  id: string;
  name: string;
  region: string;
  status: "pending" | "ok" | "failed" | "blocked";
  checkedAt: string | null;
  lastSuccessAt: string | null;
  count: number;
  message: string;
  verified: boolean;
};
export type Rule = {
  id: string;
  title: string;
  version: string;
  approved: boolean;
  reviewer: string;
  region: string;
  effectiveFrom: string;
  effectiveTo?: string;
  evidenceHashes: string[];
  quotes: Record<string, string>;
  requiredFacts: string[];
  predicate: {
    fact: string;
    operator: "eq" | "gte" | "gt" | "lt" | "lte";
    value: string | number;
  };
  conclusion: string;
  exceptionFacts: string[];
};
export const AiResultSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        value: z.string(),
        source: z.string(),
        confirmed: z.boolean().default(false),
      }),
    )
    .max(40),
  questions: z.array(z.object({ key: z.string(), label: z.string() })).max(12),
  issues: z
    .array(
      z.object({
        category: z.enum(["clear_risk", "human_review", "more_data"]),
        title: z.string(),
        conclusion: z.string(),
        conditions: z.array(z.string()),
        citations: z.array(
          z.object({ evidenceId: z.string(), quote: z.string().min(8) }),
        ),
        exceptions: z.array(z.string()),
        missing: z.array(z.string()),
        nextActions: z.array(z.string()),
        severity: z
          .enum(["unspecified", "low", "medium", "high"])
          .default("unspecified"),
      }),
    )
    .max(40),
});

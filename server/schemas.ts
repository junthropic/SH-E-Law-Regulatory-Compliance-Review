import { z } from "zod";
import { ReviewRequestSchema } from "../shared/types.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
const optionalDate = z.union([date, z.literal("")]);
const text = z.string().max(1_500_000);
export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().min(1).max(500),
  kind: z.enum([
    "law",
    "ordinance",
    "interpretation",
    "petition",
    "document",
    "gazette",
  ]),
  title: z.string().min(1).max(500),
  region: z.string().max(100),
  article: z.string().max(500),
  text,
  url: z
    .string()
    .url()
    .refine((s) => new URL(s).protocol === "https:"),
  version: z.string().max(200),
  effectiveFrom: optionalDate,
  effectiveTo: date.optional(),
  promulgatedAt: optionalDate,
  fetchedAt: z.string().datetime(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  complete: z.boolean(),
  annexesComplete: z.boolean(),
  historyComplete: z.boolean(),
  verified: z.boolean(),
  verificationNote: z.string().max(5000),
  rawRef: z
    .string()
    .regex(/^[a-f0-9]{64}\.json$/)
    .optional(),
  links: z.array(z.string().max(2000)).max(2000),
});
export const DocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500),
  createdAt: z.string().datetime(),
  type: z.enum([".txt", ".pdf", ".hwp", ".hwpx", ".docx"]),
  text,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  warnings: z.array(z.string().max(5000)).max(100),
  confirmed: z.boolean(),
  agency: z.string().max(150),
  responseDate: optionalDate,
  region: z.string().max(100),
});
export const RuleSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  title: z.string().min(1).max(500),
  version: z.string().min(1).max(100),
  approved: z.boolean(),
  reviewer: z.string().max(200),
  region: z.string().max(100),
  effectiveFrom: date,
  effectiveTo: date.optional(),
  evidenceHashes: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(1)
    .max(100),
  quotes: z.record(z.string(), z.string().min(8).max(5000)),
  requiredFacts: z.array(z.string().min(1).max(100)).min(1).max(50),
  predicate: z.object({
    fact: z.string().min(1).max(100),
    operator: z.enum(["eq", "gte", "gt", "lt", "lte"]),
    value: z.union([z.number(), z.string().max(1000)]),
  }),
  conclusion: z.string().max(5000),
  exceptionFacts: z.array(z.string().min(1).max(100)).max(50),
});
export const SourceSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  region: z.string().max(100),
  status: z.enum(["pending", "ok", "failed", "blocked"]),
  checkedAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  count: z.number().int().nonnegative(),
  message: z.string().max(5000),
  verified: z.boolean(),
});
const IssueSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["clear_risk", "human_review", "more_data"]),
  title: z.string().max(500),
  conclusion: text,
  conditions: z.array(text).max(500),
  citations: z
    .array(z.object({ evidenceId: z.string().uuid(), quote: text }))
    .max(500),
  exceptions: z.array(text).max(500),
  missing: z.array(text).max(500),
  nextActions: z.array(text).max(500),
  severity: z.enum(["unspecified", "low", "medium", "high"]),
  ruleId: z.string().optional(),
});
export const ReviewSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  request: ReviewRequestSchema,
  status: z.enum(["running", "completed", "failed"]),
  progress: text,
  facts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        value: text,
        unit: z.string().optional(),
        source: z.string(),
        confirmed: z.boolean(),
      }),
    )
    .max(200),
  issues: z.array(IssueSchema).max(100),
  evidence: z.array(EvidenceSchema).max(2000),
  gaps: z.array(text).max(10000),
  questions: z.array(z.object({ key: z.string(), label: z.string() })).max(100),
  coverage: z.object({
    region: z.string(),
    asOf: date,
    latestCheckedAt: z.string().datetime().nullable(),
    complete: z.boolean(),
    sources: z.array(z.string()).max(2000),
  }),
  model: z.string(),
  rulesVersion: z.string(),
  needsReview: z.boolean(),
  error: text.optional(),
});
export const BundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.string().datetime(),
    evidence: z.array(EvidenceSchema).max(10000),
    sources: z.array(SourceSchema).max(100),
  })
  .strict();
export const BackupSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.string().datetime(),
    reviews: z.array(ReviewSchema).max(10000),
    evidence: z.array(EvidenceSchema).max(10000),
    sources: z.array(SourceSchema).max(100),
    documents: z
      .array(DocumentSchema.extend({ original: z.string().max(28_000_000) }))
      .max(1000),
    rules: z.array(RuleSchema).max(1000),
  })
  .strict();

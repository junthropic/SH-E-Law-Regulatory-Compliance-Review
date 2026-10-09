import { z } from "zod";
import { ReviewRequestSchema } from "../shared/types.js";
import { comparisonInput } from "../shared/dossier.js";

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
  sourceConflicts: z.array(z.string().max(3000)).max(30).optional(),
  attachments: z.array(z.object({
    title: z.string(), url: z.string().max(2000), version: z.string(), effectiveFrom: optionalDate,
    fetchedAt: z.string().datetime(), state: z.enum(["collected", "missing", "extraction_failed"]),
    originalHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    originalRef: z.string().regex(/^[a-f0-9]{64}\.bin$/).optional(), note: z.string(),
  })).max(2000).optional(),
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
  text: z.string().max(8_000_000),
  url: z
    .string()
    .url()
    .refine((s) => new URL(s).protocol === "https:"),
  version: z.string().max(200),
  effectiveFrom: optionalDate,
  effectiveTo: date.optional(),
  repealed: z.boolean().optional(),
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
  officialSources: z
    .array(
      z.object({
        url: z.string().url().max(2000),
        fetchedAt: z.string().datetime(),
      }),
    )
    .max(20)
    .optional(),
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
const ComparisonSchema = comparisonInput.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentTextHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentName: z.string().max(500),
  provenance: z.enum(["downloaded", "user_provided"]),
  changes: z
    .array(
      z.object({
        value: z.string().max(40000),
        added: z.boolean().optional(),
        removed: z.boolean().optional(),
      }),
    )
    .max(20000),
  checks: z
    .array(
      z.object({
        label: z.string().max(100),
        state: z.enum(["match", "difference", "unconfirmed"]),
        detail: z.string().max(2000),
      }),
    )
    .max(30),
  numbers: z.object({
    law: z.array(z.string()).max(10000),
    document: z.array(z.string()).max(10000),
  }),
  markers: z.object({
    law: z.array(z.string()).max(1000),
    document: z.array(z.string()).max(1000),
  }),
  review: z
    .object({
      reviewer: z.string().max(100),
      note: z.string().max(3000),
      reviewedAt: z.string().datetime(),
    })
    .optional(),
});
const AssessmentSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        value: text,
        state: z.enum(["confirmed", "incomplete", "missing", "conflict"]),
        question: z.string(),
      }),
    )
    .max(30),
  conditions: z
    .array(
      z.object({
        id: z.string(),
        evidenceId: z.string().uuid(),
        quote: z.string().max(5000),
        kind: z.string(),
        factKeys: z.array(z.string()),
        missing: z.array(z.string()),
      }),
    )
    .max(100),
  totalConditions: z.number().int().nonnegative(),
  decisions: z
    .array(
      z.object({
        conditionId: z.string(),
        reviewer: z.string().max(100),
        note: z.string().max(3000),
        decision: z.enum(["applies", "excluded", "uncertain"]),
        basisHash: z.string(),
        factsHash: z.string(),
        createdAt: z.string().datetime(),
      }),
    )
    .max(500),
});
const CheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(["checked", "missing", "review"]),
  detail: text,
});
const VerificationSchema = z.object({
  version: z.literal(1),
  checkedAt: z.string().datetime(),
  checks: z.array(CheckSchema).max(100),
  basis: z
    .array(
      z.object({
        evidenceId: z.string().uuid(),
        checks: z.array(CheckSchema).max(100),
        references: z
          .array(
            z.object({
              title: z.string(),
              evidenceIds: z.array(z.string().uuid()).max(2000),
              state: z.enum(["candidate", "missing", "ambiguous"]),
            }),
          )
          .max(100),
        passages: z
          .array(
            z.object({
              kind: z.enum(["annex", "supplement", "exception", "delegation"]),
              quote: z.string().max(5000),
              offset: z.number().int().nonnegative(),
            }),
          )
          .max(100),
        passagesTotal: z.number().int().nonnegative(),
        referencesTotal: z.number().int().nonnegative(),
      }),
    )
    .max(2000),
});
export const ReviewSchema = z.object({
  verification: VerificationSchema.optional(),
  comparisons: z.array(ComparisonSchema).max(100).optional(),
  caseAssessment: AssessmentSchema.optional(),
  referenceCollection: z
    .object({
      parentReviewId: z.string().uuid(),
      title: z.string().max(150),
      state: z.enum(["running", "collected", "failed"]),
      message: text,
      evidenceId: z.string().uuid().optional(),
    })
    .optional(),
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
        provenance: z.object({
          assertionSource: z.enum(["user", "model", "derived"]),
          userAttested: z.boolean(),
          verificationStatus: z.enum(["unverified", "document_reviewed", "site_verified"]),
          evidenceIds: z.array(z.string().uuid()).max(100),
          conflictIds: z.array(z.string().max(100)).max(100),
          recordedAt: z.string().datetime(),
          subjectId: z.string().max(200).optional(),
          measurementBasis: z.string().max(200).optional(),
          scope: z.string().max(1000).optional(),
          validFrom: date.optional(), validTo: date.optional(),
        }).optional(),
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

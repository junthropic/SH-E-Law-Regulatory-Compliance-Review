import { z } from "zod";

// v8 stage 3 contract: the response shapes the /beta/ screens read. tests/v8-beta-contract.test.ts parses real
// responses with these schemas, so a server change that breaks a screen fails the test run.
// Pure zod only: the beta bundle imports the inferred types from here.

const Check = z.object({ state: z.enum(["ok", "failed"]), checkedAt: z.string(), message: z.string() }).partial();

export const KeyServiceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  url: z.string().url(),
  purpose: z.string(),
  group: z.string(),
  configured: z.boolean(),
  check: Check,
}).strict();

export const KeyGroupSchema = z.object({
  id: z.enum(["law", "data-go-kr", "address"]),
  name: z.string(),
  required: z.boolean(),
  why: z.string(),
  issuerUrl: z.string().url(),
  configured: z.boolean(),
  configuredCount: z.number().int(),
  total: z.number().int(),
  storageError: z.string(),
  check: Check,
  services: z.array(KeyServiceSchema),
}).strict();

export const KeysSchema = z.object({
  storage: z.enum(["memory", "windows-dpapi"]),
  missingLabel: z.string(),
  groups: z.array(KeyGroupSchema),
}).strict();

export const KeySaveSchema = z.object({
  saved: z.number().int(),
  replaced: z.number().int(),
  unchanged: z.number().int(),
}).strict();

export const ProbeSchema = z.object({ ok: z.boolean(), message: z.string(), count: z.number().int().optional() }).strict();

export const CollectionSchema = z.object({
  dailyAuto: z.boolean(),
  lastRunDate: z.string().nullable(),
  lastMessage: z.string(),
  lawConfigured: z.boolean(),
  syncing: z.boolean(),
}).strict();

export const SelfReviewSchema = z.object({
  reviewId: z.string().uuid(),
  at: z.string(),
  note: z.string(),
  label: z.literal("자가 검토 — 독립 검토 아님"),
  independent: z.literal(false),
}).strict();

const IssueSchema = z.object({
  id: z.string(),
  category: z.enum(["clear_risk", "human_review", "more_data"]),
  title: z.string(),
  conclusion: z.string(),
  conditions: z.array(z.string()),
  missing: z.array(z.string()),
  nextActions: z.array(z.string()),
  exceptions: z.array(z.string()),
  citations: z.array(z.object({ evidenceId: z.string(), quote: z.string() })),
  ruleId: z.string().optional(),
});

export const BetaReviewSchema = z.object({
  review: z.object({
    id: z.string().uuid(),
    createdAt: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    progress: z.string().optional(),
    request: z.object({
      prompt: z.string(),
      region: z.string(),
      municipality: z.string(),
      asOf: z.string(),
      documentIds: z.array(z.string()),
      answers: z.record(z.string(), z.string()),
    }).passthrough(),
    facts: z.array(z.object({ key: z.string(), label: z.string(), value: z.string(), confirmed: z.boolean() }).passthrough()),
    issues: z.array(IssueSchema),
    questions: z.array(z.object({ key: z.string(), label: z.string() })),
    gaps: z.array(z.string()),
    needsReview: z.boolean(),
    error: z.string().optional(),
  }).passthrough(),
  selfReview: SelfReviewSchema.nullable(),
  preview: z.object({ on: z.boolean(), label: z.string() }).strict(),
  betaLabel: z.string(),
}).strict();

export const NoticeSchema = z.object({
  betaLabel: z.string(),
  ai: z.string(),
  autoDeleteDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
  items: z.array(z.object({ title: z.string(), text: z.string(), proof: z.array(z.string()).min(1) }).strict()),
}).strict();

export const BackupFileSchema = z.object({
  format: z.literal("she-backup-v8"),
  createdAt: z.string(),
  protection: z.enum(["windows-dpapi-current-user", "session-memory"]),
  note: z.string(),
  wrappedKey: z.string(),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
}).strict();

export const RestoreResultSchema = z.object({ ok: z.literal(true), reviews: z.number().int(), documents: z.number().int() }).strict();

export const AiPendingSchema = z.array(z.object({
  previewId: z.string().uuid(),
  purpose: z.string(),
  bytes: z.number().int(),
  payload: z.string(),
  notice: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
}).strict());

export type Keys = z.infer<typeof KeysSchema>;
export type KeyGroup = z.infer<typeof KeyGroupSchema>;
export type KeySave = z.infer<typeof KeySaveSchema>;
export type Probe = z.infer<typeof ProbeSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type SelfReview = z.infer<typeof SelfReviewSchema>;
export type BetaReview = z.infer<typeof BetaReviewSchema>;
export type Notice = z.infer<typeof NoticeSchema>;
export type RestoreResult = z.infer<typeof RestoreResultSchema>;
export type AiPending = z.infer<typeof AiPendingSchema>;

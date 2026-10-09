import { ordinanceScope } from "../shared/jurisdictions.js";
import { z } from "zod";
import { Store, evidenceIdentity } from "./store.js";
import { RuleSchema } from "./schemas.js";
import { verifyCitation } from "./legal.js";
import type { Evidence } from "../shared/types.js";
import { attachLinkedBasis, saveLinkedBasis } from "./reference-collection.js";

const ApprovalSchema = z.object({
  reviewId: z.string().uuid().optional(),
  reviewer: z.string().trim().min(2).max(100),
  region: z.string().min(2).max(100),
  municipality: z.string().max(100),
  asOf: z.string().date(),
  note: z.string().trim().min(30).max(5000),
  gazetteUrl: z
    .string()
    .url()
    .refine(
      (s) =>
        new URL(s).protocol === "https:" &&
        new URL(s).hostname.endsWith(".go.kr"),
    ),
  delegationChecked: z.literal(true),
  exceptionsChecked: z.literal(true),
  annexesChecked: z.literal(true),
  historyChecked: z.literal(true),
  evidenceHashes: z
    .array(z.string().regex(/^[a-f0-9]{64}$/))
    .min(2)
    .max(500),
  rules: z.array(RuleSchema).max(100),
});
export function approveReviewBasis(store: Store, input: unknown) {
  const approval = ApprovalSchema.parse(input);
  const review = approval.reviewId
    ? store.review(approval.reviewId)
    : undefined;
  if (
    approval.reviewId &&
    (!review ||
      review.status !== "completed" ||
      review.request.region !== approval.region ||
      review.request.municipality !== approval.municipality ||
      review.request.asOf !== approval.asOf)
  )
    throw new Error("확인서의 검토 ID·지역·시군구·기준일이 일치하지 않습니다.");
  const evidence = approvalEvidence(store, approval, review);
  if (evidence.some(e => e.sourceConflicts?.length))
    throw new Error("공식 출처 간 정보 불일치가 남아 있습니다. 공포 원본과 법령정보를 대조하여 불일치를 해소한 뒤 확인서를 등록하세요.");
  const hashes = new Set(evidence.map((e) => e.hash));
  if (
    evidence.length !== approval.evidenceHashes.length ||
    hashes.size !== evidence.length ||
    new Set(approval.evidenceHashes).size !== evidence.length ||
    new Set(evidence.map((e) => e.sourceId)).size !== evidence.length ||
    approval.evidenceHashes.some((h) => !hashes.has(h))
  )
    throw new Error(
      "검토한 원문 목록이 현재 적용 근거 전체와 일치하지 않습니다.",
    );
  if (
    !evidence.some((e) => e.kind === "law") ||
    !evidence.some(
      (e) => e.kind === "ordinance" && e.region === approval.region,
    )
  )
    throw new Error("국가법과 해당 시·도 조례가 모두 필요합니다.");
  for (const rule of approval.rules) {
    if (
      rule.evidenceHashes.some((h) => !hashes.has(h)) ||
      rule.evidenceHashes.some(
        (h) =>
          !verifyCitation(
            evidence.find((e) => e.hash === h),
            rule.quotes[h] || "",
          ),
      )
    )
      throw new Error("규칙 인용이 원문과 일치하지 않습니다.");
    if (!rule.requiredFacts.includes(rule.predicate.fact))
      throw new Error("규칙 조건의 사실을 필수 확인 목록에 넣으세요.");
  }
  store.db.exec("SAVEPOINT basis_approval");
  try {
    for (const e of evidence) {
      const verified = {
        ...e,
        verified: true,
        annexesComplete: true,
        historyComplete: true,
        verificationNote: approval.reviewer + ": " + approval.note,
      };
      if (review?.request.linkedEvidenceIds?.includes(e.id))
        saveLinkedBasis(store, review.request, verified);
      else store.saveEvidence(verified, false);
    }
    for (const rule of approval.rules)
      store.put("rules", rule.id, {
        ...rule,
        approved: true,
        reviewer: approval.reviewer,
      });
    const key =
      "coverage:" +
      approval.region +
      ":" +
      approval.municipality +
      ":" +
      approval.asOf;
    store.put("settings", key, {
      ...approval,
      identities: evidence.map(evidenceIdentity).sort(),
      checkedAt: new Date().toISOString(),
    });
    store.audit(
      "basis_approval",
      JSON.stringify({
        reviewer: approval.reviewer,
        region: approval.region,
        asOf: approval.asOf,
        hashes: approval.evidenceHashes,
      }),
    );
    store.db.exec("RELEASE basis_approval");
  } catch (e) {
    store.db.exec("ROLLBACK TO basis_approval; RELEASE basis_approval");
    throw e;
  }
  return { ok: true };
}
export function hasCoverageApproval(
  store: Store,
  region: string,
  municipality: string,
  asOf: string,
  evidence: Evidence[],
) {
  const a = store.setting<any>(
    "coverage:" + region + ":" + municipality + ":" + asOf,
    null,
  );
  return (
    !!a &&
    Date.now() - Date.parse(a.checkedAt) >= 0 &&
    Date.now() - Date.parse(a.checkedAt) < 24 * 3600 * 1000 &&
    JSON.stringify(a.identities) ===
      JSON.stringify(evidence.map(evidenceIdentity).sort()) &&
    evidence.length > 0 &&
    evidence.every((e) => a.evidenceHashes.includes(e.hash)) &&
    a.evidenceHashes.length === evidence.length
  );
}

function approvalEvidence(store: Store, approval: {region: string; municipality: string; asOf: string}, review?: import("../shared/types.js").ReviewResult) {
  const base = store.search(
    review?.request.prompt || "위험물",
    approval.region,
    approval.asOf,
  );
  const evidence = (
    review ? attachLinkedBasis(store, review.request, base) : base
  ).filter(
    (e) =>
      e.kind !== "ordinance" ||
      ordinanceScope(e.title, approval.region, approval.municipality) !==
        "other",
  );
  return evidence;
}
export function approvalContext(store: Store, id: string) {
  const review = store.review(z.string().uuid().parse(id));
  if (!review || review.status !== "completed") throw new Error("완료된 검토를 선택하세요.");
  return { reviewId: id, region: review.request.region, municipality: review.request.municipality,
    asOf: review.request.asOf, evidence: approvalEvidence(store, review.request, review).map(e => ({
      title: e.title, hash: e.hash, version: e.version, effectiveFrom: e.effectiveFrom, url: e.url,
    })) };
}

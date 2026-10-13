import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LegalIssue, ReviewResult } from "../shared/types.js";
import { Store } from "./store.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import type { Principal } from "./compliance-v2.js";
import { LEGAL_BASIS_DATE } from "./safety-manager-v7.js";
import { selectedPolicies } from "./policies-v3.js";
import { nextPolicies } from "./policies-v4.js";
import { PREVIEW_SWITCH, previewOn } from "./export-check-v8.js";

// v8 stage 2: preview switch `preview.safetyManagerV7` (default off) connects the v7 candidates
// (industrial-safety 안전관리자, training, base duties) to the default app review.
// Off: nothing runs, the review is exactly as before.
export const PREVIEW_LABEL = "검토 후보 — 법적 판단 아님, 베타";
// The single local user of an installed app. Not synthetic, holds no approval role.
const LOCAL: Principal = { id: "local-user", tenant: "local", synthetic: false, roles: ["writer"] };

// Article basis per duty. Safety manager: docs/implementation-v7/README.md §2 table.
// Training: 산업안전보건법 제29조 and 시행규칙 제26조·별표 4·5 (collected text, docs/implementation-v6/official/reference).
const ARTICLES: Record<string, string> = {
  "safety_manager.appointment": "산업안전보건법 제17조, 시행령 제16조제1항·제3항~제5항·별표 3",
  "safety_manager.qualification": "산업안전보건법 제17조, 시행령 제17조·별표 3·별표 4",
  "safety_manager.dedication": "산업안전보건법 제17조제3항, 시행령 제16조제2항",
  "safety_manager.report": "산업안전보건법 시행령 제16조제6항, 시행규칙 제11조제1항",
  "safety_manager.dismissal_report": "산업안전보건법 시행령 제16조제7항·부칙 제2조, 시행규칙 제11조제2항",
  "safety_manager.performance": "산업안전보건법 시행령 제18조",
  "training.periodic": "산업안전보건법 제29조제1항, 시행규칙 제26조·별표 4·별표 5",
  "training.recruitment": "산업안전보건법 제29조제2항, 시행규칙 제26조·별표 4·별표 5",
  "training.work_change": "산업안전보건법 제29조제2항, 시행규칙 제26조·별표 4·별표 5",
  "training.special": "산업안전보건법 제29조제3항, 시행규칙 제26조·별표 4·별표 5",
  "training.supervisor": "산업안전보건법 제29조제1항, 시행규칙 제26조·별표 4 제1호의2",
};
const LAW_BY_PREFIX: [RegExp, string][] = [[/^hazmat_/, "위험물안전관리법"], [/^risk_assessment\./, "산업안전보건법"]];
export function previewArticle(policyId: string) {
  if (ARTICLES[policyId]) return ARTICLES[policyId];
  const base = [...selectedPolicies, ...nextPolicies].find((p) => p.id === policyId) as { article?: string } | undefined;
  if (!base?.article) return "근거 조문 미확정 — 원문 확인 필요";
  const law = LAW_BY_PREFIX.find(([r]) => r.test(policyId))?.[1];
  if (law && base.article.startsWith("법 ")) return law + " " + base.article.slice(2);
  if (law && base.article.startsWith("시행규칙")) return law + " " + base.article;
  return base.article;
}
export function labelIssue(issue: LegalIssue): LegalIssue {
  const article = issue.ruleId ? previewArticle(issue.ruleId) : "근거 조문 미확정 — 원문 확인 필요";
  return {
    ...issue,
    // Never a confirmed violation from the preview: approvals are 0.
    category: issue.category === "clear_risk" ? "human_review" : issue.category,
    conclusion: `[${PREVIEW_LABEL}] ${issue.conclusion}`,
    conditions: [PREVIEW_LABEL, `법률 기준일 ${LEGAL_BASIS_DATE}`, `근거 조문: ${article}`, ...issue.conditions],
  };
}
// Evaluate in a scratch in-memory database so no company text is written to unsealed tables or files.
// Uploaded originals are not copied: the scratch review carries no document ids.
export function attachPreview(r: ReviewResult) {
  const dir = mkdtempSync(join(tmpdir(), "she-preview-"));
  const scratch = new Store(dir, { memory: true });
  try {
    const copy: ReviewResult = JSON.parse(JSON.stringify({ ...r, request: { ...r.request, documentIds: [] } }));
    new LegacyBridge(scratch, "v7").attach(LOCAL, copy, "project");
    r.issues = copy.issues.map(labelIssue);
    r.needsReview = true;
  } finally {
    scratch.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
export function registerPreviewV8(app: FastifyInstance, store: Store) {
  app.get("/api/preview", async () => ({ safetyManagerV7: previewOn(store), label: PREVIEW_LABEL }));
  app.post("/api/preview", async (req) => {
    const { safetyManagerV7 } = z.object({ safetyManagerV7: z.boolean() }).parse(req.body);
    store.put("settings", PREVIEW_SWITCH, safetyManagerV7);
    store.audit("preview_switch", `safetyManagerV7 ${safetyManagerV7 ? "on" : "off"}`);
    return { safetyManagerV7, label: PREVIEW_LABEL };
  });
}

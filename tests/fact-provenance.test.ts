import { it, expect } from "vitest";
import type { CaseFact } from "../shared/types.js";
import { ReviewRequestSchema } from "../shared/types.js";
import { compareDecimal, compareFactAssertions, equalQuantity, recordAssertion } from "../server/fact-provenance.js";
import { confirmedAnswer, evaluateRule } from "../server/legal.js";
import { assessCase, factsHash } from "../server/case-assessment.js";
import { newReview, runReview } from "../server/reviews.js";
import { buildVerification } from "../server/verification.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import { Vault } from "../server/vault.js";
import { ChatGPTAuth } from "../server/auth.js";
import { basis, request, rule, testStore } from "./helpers.js";

function fact(value = "500", unit = "L"): CaseFact {
  return { ...recordAssertion({ key: "quantity", label: "수량", value, unit, source: "시험 진술", confirmed: true }, "user", "2026-10-08T00:00:00.000Z"),
    provenance: { assertionSource: "user", userAttested: true, verificationStatus: "unverified", evidenceIds: [], conflictIds: [],
      recordedAt: "2026-10-08T00:00:00.000Z", subjectId: "tank-a", measurementBasis: "inventory", scope: "storage-a",
      validFrom: "2026-10-01", validTo: "2026-11-01" } };
}
it("사용자 입력 완료 및 모델 추출을 증빙 확인으로 승격하지 않는다", () => {
  const f = fact();
  f.provenance!.verificationStatus = "site_verified";
  expect(recordAssertion(f, "user", f.provenance!.recordedAt).provenance).toMatchObject({ userAttested: true, verificationStatus: "unverified", evidenceIds: [] });
  expect(recordAssertion(f, "model", f.provenance!.recordedAt).provenance?.userAttested).toBe(false);
  const input = ReviewRequestSchema.parse({ ...request(), facts: [f] });
  expect(input).not.toHaveProperty("facts");
});
it.each(["허가 서류 미제공", "신고 자료 미제출", "교육 기록 없음", "검사 문서가 없음", "선임 증빙 미업로드", "조회 결과 0건", "조회 실패", "응답 시간 초과"])("%s는 의무 불이행 사실이 아니다", value => {
  expect(confirmedAnswer(value)).toBe(false);
});
it("단위 환산은 정확히 비교하고 밀도 없는 질량·부피 환산은 보류한다", () => {
  expect(equalQuantity("1000", "mL", "1", "L")).toBe(true);
  expect(equalQuantity("0.1", "t", "100", "kg")).toBe(true);
  expect(equalQuantity("1", "kg", "1", "L")).toBeUndefined();
  expect(compareDecimal("9007199254740993", "9007199254740992")).toBe(1);
  expect(compareDecimal("0.99999999999999999999", "1")).toBe(-1);
  expect(compareDecimal("", "0")).toBeUndefined();
});
it.each(["subjectId", "measurementBasis", "scope"] as const)("%s가 다르면 다른 사실이며 충돌이 아니다", key => {
  const a = fact(), b = fact("800"); b.provenance![key] = "different";
  expect(compareFactAssertions(a, b)).toBe("different_context");
});
it("변경 전후 기간 경계는 겹치지 않으며 기준일 누락은 추가 확인이다", () => {
  const a = fact(), b = fact("800"); b.provenance!.validFrom = "2026-11-01"; b.provenance!.validTo = "2026-12-01";
  expect(compareFactAssertions(a, b)).toBe("different_context");
  delete b.provenance!.validFrom;
  expect(compareFactAssertions(a, b)).toBe("unknown");
});
it("동일 대상·산정 기준·범위·기간의 다른 수량만 충돌이며 실제 사례 검토에도 반영된다", () => {
  const a = fact(), b = fact("800");
  expect(compareFactAssertions(a, b)).toBe("conflict");
  expect(compareFactAssertions(a, fact("500000", "mL"))).toBe("equal");
  const r = newReview({ ...request(), answers: { quantity: "500 L" } }); r.facts = [a, b];
  expect(assessCase(r).facts.find(f => f.key === "quantity")?.state).toBe("conflict");
});
it("자유문장의 다른 값은 충돌 확정 대신 추가 확인하고 환산 일치는 중복 질문하지 않는다", () => {
  const r = newReview({ ...request(), prompt: "위험물 탱크 A에는 1 L가 있습니다.", answers: { quantity: "1000 mL" } });
  expect(assessCase(r).facts.find(f => f.key === "quantity")?.state).toBe("confirmed");
  r.request.answers.quantity = "탱크 B 200 L";
  expect(assessCase(r).facts.find(f => f.key === "quantity")?.state).toBe("incomplete");
});
it("사실의 증빙·검증·범위 변경 시 기존 적용 검토를 재사용하지 않는다", () => {
  const r = newReview(request()); r.facts = [fact()]; r.evidence = basis();
  r.evidence[0].text += " 다만 기존 시설은 제외한다.";
  r.verification = buildVerification(r.evidence, r.request, false);
  const c = assessCase(r).conditions[0]; expect(c).toBeDefined();
  const d = { conditionId: c.id, reviewer: "시험 검토자", note: "시험 기록", decision: "uncertain" as const,
    basisHash: r.evidence[0].hash, factsHash: factsHash(r), createdAt: new Date().toISOString() };
  expect(assessCase(r, [d]).decisions).toHaveLength(1);
  r.facts[0].provenance!.scope = "changed";
  expect(assessCase(r, [d]).decisions).toHaveLength(0);
});
it("허가가 있다는 답변과 수량 문턱값 일치만으로 기존 규칙이 무허가 결론을 내지 않는다", () => {
  const es = basis(), r = rule(es);
  r.conclusion = "무허가 위반이다";
  const facts = [ ["ratio", "1"], ["permit", "허가 있음"], ["exception", "해당 없음"] ].map(([key, value]) => ({ key, label: "시험 항목", value, source: "시험", confirmed: true }));
  const result = evaluateRule(r, facts, es, "경기도", request().asOf);
  expect(result?.category).toBe("human_review"); expect(result?.conclusion).not.toContain("무허가 위반이다");
  facts[0].value = "0.99999999999999999999";
  expect(evaluateRule(r, facts, es, "경기도", request().asOf)).toBeUndefined();
});
it("실제 검토·저장·백업 복원 경로에서도 진술과 객관 검증을 구분한다", async () => {
  const { store, clean } = testStore();
  try {
    const r = newReview({ ...request(), answers: { quantity: "500 L", permit: "허가 있음" } });
    const vault = new Vault(store.dir, true);
    await runReview(store, vault, new ChatGPTAuth(store, vault), r, async () => []);
    expect(r.status).toBe("completed");
    expect(store.review(r.id)?.facts.find(f => f.key === "permit")?.provenance).toMatchObject({ userAttested: true, verificationStatus: "unverified" });
    expect(r.gaps.join()).toContain("사용자 진술");
    const f = r.facts.find(f => f.key === "permit")!; f.provenance!.verificationStatus = "site_verified";
    store.saveReview(r); restoreBackup(store, makeBackup(store));
    expect(store.review(r.id)?.facts.find(f => f.key === "permit")?.provenance?.verificationStatus).toBe("unverified");
  } finally { clean(); }
});

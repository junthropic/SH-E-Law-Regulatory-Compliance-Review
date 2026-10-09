import { it, expect } from "vitest";
import { buildVerification, verificationGaps } from "../server/verification.js";
import { buildContext } from "../server/ai.js";
import { newReview, runReview } from "../server/reviews.js";
import { markdown } from "../server/exports.js";
import { Vault } from "../server/vault.js";
import { ChatGPTAuth } from "../server/auth.js";
import { evidence, request, testStore } from "./helpers.js";

const now = new Date("2026-10-08T03:00:00Z");
const req = { ...request(), asOf: "2026-10-08" };
it("API 경로의 부칙·시행일 필드명을 법문 표현으로 세지 않는다", () => {
  const text =
    "부칙/부칙단위/0/부칙시행일자: 20250101\n부칙/부칙단위/0/부칙내용: 제1조 이 규정은 공포한 날부터 시행한다.\n조문/조문단위/0/항내용: 다만 시험 예외는 제외한다.";
  const b = buildVerification([evidence({ text })], req, false, now).basis[0];
  expect(b.passages).toHaveLength(2);
  expect(b.passages.every((p) => !p.quote.includes("단위/"))).toBe(true);
  for (const p of b.passages)
    expect(text.slice(p.offset, p.offset + p.quote.length)).toBe(p.quote);
});
it("정확한 법규명 후보만 연결하고 유사 제목·폐지·미시행·타지역은 누락으로 남긴다", () => {
  const source = evidence({
    text: "「시험 법률」 제1조, 「미확보 규칙」. 「적용 대상」은 일반 용어입니다.",
  });
  const target = evidence({ title: "시험법률", sourceId: "target" });
  const all = [source, target];
  const report = buildVerification(all, req, false, now);
  expect(report.basis[0].references).toEqual([
    { title: "시험 법률", state: "candidate", evidenceIds: [target.id] },
    { title: "미확보 규칙", state: "missing", evidenceIds: [] },
    ...["위험물안전관리법", "위험물안전관리법 시행령", "위험물안전관리법 시행규칙"].map(title => ({title, state: "missing", evidenceIds: []})),
  ]);
  for (const override of [
    { title: "시험법률 시행령" },
    { region: "울산광역시" },
    { repealed: true },
    { effectiveFrom: "2027-01-01" },
  ]) {
    expect(
      buildVerification([source, { ...target, ...override }], req, false, now)
        .basis[0].references[0].state,
    ).toBe("missing");
  }
  expect(verificationGaps(report, all).join()).toContain("미확보 규칙");
});
it("같은 제목의 중복 버전은 하나를 임의로 확정하지 않는다", () => {
  const source = evidence({ text: "「시험법률」 제1조에 따른다." });
  const report = buildVerification(
    [
      source,
      evidence({ title: "시험법률", sourceId: "target" }),
      evidence({ title: "시험법률", sourceId: "target" }),
    ],
    req,
    false,
    now,
  );
  expect(report.basis[0].references[0].state).toBe("ambiguous");
  expect(report.basis[1].checks.find((c) => c.key === "period")?.state).toBe(
    "review",
  );
});
it("부칙·예외·별표·위임은 정확한 원문 위치를 보존하며 표시 한도를 밝힌다", () => {
  const text = Array.from(
    { length: 30 },
    (_, i) =>
      `제${i + 1}조 다만 시험 조건은 제외한다. 별표 1 및 부칙 경과조치를 준용한다.`,
  ).join("\n");
  const report = buildVerification(
    [
      evidence({
        text,
        verified: false,
        annexesComplete: false,
        historyComplete: false,
      }),
    ],
    req,
    false,
    now,
  );
  const b = report.basis[0];
  expect(b.passagesTotal).toBeGreaterThan(b.passages.length);
  for (const p of b.passages)
    expect(text.slice(p.offset, p.offset + p.quote.length)).toBe(p.quote);
  expect(new Set(b.passages.map((p) => p.kind)).size).toBe(4);
  expect(b.checks.find((c) => c.key === "exceptions")?.state).toBe("review");
  expect(b.checks.find((c) => c.key === "annex")?.state).toBe("review");
});
it("기준일 경계·미래 기준일·24시간 경계를 구분한다", () => {
  const e = evidence({
    effectiveFrom: "2026-10-08",
    effectiveTo: "2026-10-08",
    fetchedAt: now.toISOString(),
  });
  const checks = (asOf: string, fetchedAt = e.fetchedAt) =>
    buildVerification([{ ...e, fetchedAt }], { ...req, asOf }, false, now)
      .basis[0].checks;
  expect(checks("2026-10-08").find((c) => c.key === "period")?.state).toBe(
    "checked",
  );
  for (const date of ["2026-10-07", "2026-10-09"])
    expect(checks(date).find((c) => c.key === "period")?.state).toBe("review");
  for (const at of ["2026-10-07T03:00:00Z", "2026-10-08T03:00:01Z", "invalid"])
    expect(checks(req.asOf, at).find((c) => c.key === "freshness")?.state).toBe(
      "review",
    );
});
it("본문에 표지가 없어도 예외 없음으로 확인하지 않는다", () => {
  const report = buildVerification(
    [evidence({ text: "표현이 없는 시험 원문", verified: false })],
    req,
    false,
    now,
  );
  expect(report.basis[0].passages).toHaveLength(0);
  expect(
    report.basis[0].checks.find((c) => c.key === "exceptions")?.state,
  ).toBe("review");
  expect(report.checks.find((c) => c.key === "local")?.state).toBe("review");
  expect(
    buildVerification([], req, false, now).checks.filter(
      (c) => c.state === "missing",
    ),
  ).toHaveLength(2);
});
it("긴 본문 뒤의 예외를 AI 문맥에 포함하되 전체 검토 완료로 표시하지 않는다", () => {
  const e = evidence({
    text:
      "일반 내용\n".repeat(5000) +
      "부칙 제2조 다만 기존 시설은 시험 예외 조건을 적용한다.",
  });
  const es = Array.from({ length: 10 }, () => ({
    ...e,
    id: crypto.randomUUID(),
  }));
  const report = buildVerification(es, req, false, now);
  const context = buildContext(req, es, [], report);
  const input = JSON.parse(context.input);
  expect(
    input.evidence[0].reviewPassages.some((p: any) =>
      p.quote.includes("기존 시설"),
    ),
  ).toBe(true);
  expect(input.evidence[0].complete).toBe(false);
  expect(context.omitted).toHaveLength(10);
  expect(
    input.evidence.reduce(
      (n: number, e: any) =>
        n +
        e.text.length +
        e.reviewPassages.reduce((s: number, p: any) => s + p.quote.length, 0),
      0,
    ),
  ).toBeLessThanOrEqual(90000);
});
it("검토 결과·내보내기에 누락 연결이 보존되고 clear_risk로 승격되지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    store.saveEvidence(
      evidence({
        text: "시험 근거는 「없는시험법률」 제3조에 따른다. 다만 예외를 확인한다.",
      }),
    );
    const vault = new Vault(store.dir, true);
    const review = newReview(req);
    await runReview(
      store,
      vault,
      new ChatGPTAuth(store, vault),
      review,
      async () => [],
    );
    expect(review.status).toBe("completed");
    expect(review.verification?.basis.length).toBeGreaterThan(0);
    expect(review.gaps.join()).toContain("없는시험법률");
    expect(
      review.issues.some(
        (i) =>
          i.category === "more_data" &&
          i.missing.join().includes("없는시험법률"),
      ),
    ).toBe(true);
    expect(review.issues.some((i) => i.category === "clear_risk")).toBe(false);
    expect(markdown(review)).toContain("## 근거별 검증");
    expect(markdown(review)).toContain("연결 원문 필요");
    expect(store.review(review.id)?.verification).toEqual(review.verification);
  } finally {
    clean();
  }
});

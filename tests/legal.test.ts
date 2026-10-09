import { describe, it, expect } from "vitest";
import {
  verifyCitation,
  enforceIssue,
  evaluateRule,
  quantityRatio,
  evidenceGaps,
  redact,
} from "../server/legal.js";
import { basis, rule, evidence } from "./helpers.js";
import { randomUUID } from "node:crypto";
import type { CaseFact, LegalIssue } from "../shared/types.js";
const facts: CaseFact[] = [
  {
    key: "ratio",
    label: "배수",
    value: "1",
    source: "사용자 확인",
    confirmed: true,
  },
  {
    key: "permit",
    label: "허가",
    value: "미보유 확인",
    source: "사용자 확인",
    confirmed: true,
  },
  {
    key: "exception",
    label: "예외",
    value: "해당 없음",
    source: "사용자 확인",
    confirmed: true,
  },
];
const today = new Date().toISOString().slice(0, 10);
describe("법률 판정 검증", () => {
  it("정확한 연속 원문만 인용한다", () => {
    const e = evidence();
    expect(verifyCitation(e, e.text)).toBe(true);
    expect(verifyCitation(e, "제99조 법 위반 확정")).toBe(false);
    expect(verifyCitation(e, "시험")).toBe(false);
  });
  it("모델은 clear_risk를 확정할 수 없다", () => {
    const e = evidence();
    const i: LegalIssue = {
      id: randomUUID(),
      category: "clear_risk",
      title: "모델 결론",
      conclusion: "검토할 쟁점",
      citations: [{ evidenceId: e.id, quote: e.text }],
      conditions: [],
      exceptions: [],
      missing: [],
      nextActions: [],
      severity: "high",
    };
    expect(enforceIssue(i, [e], []).category).toBe("human_review");
    const invalid = enforceIssue(
      {
        ...i,
        citations: [
          { evidenceId: e.id, quote: "존재하지 않는 법규의 전문 조항" },
        ],
      },
      [e],
      [],
    );
    expect(invalid.category).toBe("more_data");
    expect(invalid.conclusion).toContain("보류");
    expect(invalid.citations).toHaveLength(0);
  });
  it("기존 수량 조건 규칙은 사용자 진술만으로 위반을 확정하지 않는다", () => {
    const es = basis();
    expect(evaluateRule(rule(es), facts, es, "경기도", today)?.category).toBe(
      "human_review",
    );
  });
  it.each([
    "unapproved",
    "missing-permit",
    "unconfirmed",
    "exception",
    "wrong-region",
    "future",
    "stale",
    "changed-text",
    "missing-annex",
    "bad-quote",
    "supplement-only",
  ])("%s이면 확정하지 않는다", (kind) => {
    const es = basis();
    const r = rule(es);
    let fs = structuredClone(facts);
    let region = "경기도";
    if (kind === "unapproved") r.approved = false;
    if (kind === "missing-permit") fs = fs.filter((f) => f.key !== "permit");
    if (kind === "unconfirmed") fs[0].confirmed = false;
    if (kind === "exception") fs[2].value = "해당 가능";
    if (kind === "wrong-region") region = "울산광역시";
    if (kind === "future") r.effectiveFrom = "2099-01-01";
    if (kind === "stale") es[0].fetchedAt = "2020-01-01T00:00:00.000Z";
    if (kind === "changed-text") es[0].hash = "0".repeat(64);
    if (kind === "missing-annex") es[0].annexesComplete = false;
    if (kind === "bad-quote")
      r.quotes[es[0].hash] = "실제 원문에 존재하지 않는 조항";
    if (kind === "supplement-only") es[0].kind = "petition";
    expect(evaluateRule(r, fs, es, region, today)).toBeUndefined();
  });
  it("잘못된 날짜 메타데이터는 최신성 불명", () => {
    const e = evidence({ fetchedAt: "invalid" });
    expect(
      evidenceGaps([e], "경기도", today).some((g) => g.includes("24시간")),
    ).toBe(true);
  });
  it("단위 환산과 경계 배수", () => {
    expect(
      quantityRatio(
        [
          { quantity: 500, unit: "mL", designated: 1, designatedUnit: "L" },
          { quantity: 0.5, unit: "kg", designated: 1000, designatedUnit: "g" },
        ],
        true,
      ),
    ).toBe(1);
  });
  it.each([
    { quantity: 1, unit: "kg", designated: 1, designatedUnit: "L" },
    { quantity: -1, unit: "L", designated: 1, designatedUnit: "L" },
    { quantity: 1, unit: "L", designated: 0, designatedUnit: "L" },
  ])("불합리한 수량 입력을 거부한다", (item) => {
    expect(() => quantityRatio([item], true)).toThrow();
  });
  it("합산 단위가 확인되지 않으면 계산하지 않는다", () => {
    expect(() => quantityRatio([], false)).toThrow();
  });
  it("전송 전 일반 개인식별 패턴을 가린다", () => {
    expect(
      redact("010-1234-5678 person@example.test 900101-1234567"),
    ).not.toMatch(/1234|person|900101/);
  });
});

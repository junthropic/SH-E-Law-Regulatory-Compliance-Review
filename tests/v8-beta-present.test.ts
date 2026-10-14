import { it, expect } from "vitest";
import { groupGaps, unique, viewIssue, COMMON_GAPS } from "../beta/present.js";
import { PREVIEW_LABEL } from "../server/preview-v8.js";

// v8 beta redesign (2026-10-14): the result screen reshapes server strings for display only. These checks keep the
// reshaping lossless: every condition and gap string is still shown somewhere, except the plain label line and the
// label prefix, which the per-card tag shows instead. Exports are not touched by this module.
const issue = {
  conclusion: `[${PREVIEW_LABEL}] 필요한 근거·사실을 확인한 뒤 판단해야 합니다.`,
  conditions: [
    PREVIEW_LABEL,
    "법률 기준일 2026-10-08",
    "근거 조문: 산업안전보건법 제17조, 시행령 제16조제1항·제3항~제5항·별표 3",
    "평가 기록 legacy-0000synthetic0000 · 버전 1 · 기준일 2026-10-14",
    "승인: 검토 필요",
    "상시근로자 수 확인(합성)",
  ],
};

it("V8-W03: 결과 화면의 근거 분리는 표시만 바꾸고 서버 문자열을 버리지 않는다(라벨 줄·접두어만 카드 태그로 대체)", () => {
  const v = viewIssue(issue, PREVIEW_LABEL);
  expect(PREVIEW_LABEL).toBe("검토 후보 — 법적 판단 아님, 베타");
  expect(v.conclusion).toBe("필요한 근거·사실을 확인한 뒤 판단해야 합니다.");
  expect(v.lawDate).toBe("2026-10-08");
  expect(v.articles).toEqual(["산업안전보건법 제17조", "시행령 제16조제1항·제3항~제5항·별표 3"]);
  expect(v.approval).toBe("검토 필요");
  expect(v.tech).toEqual([issue.conditions[3]]);
  expect(v.conditions).toEqual(["상시근로자 수 확인(합성)"]);
  // Lossless: each original condition is either the label line or recoverable from the view.
  const shown = [`법률 기준일 ${v.lawDate}`, `근거 조문: ${v.articles.join(", ")}`, `승인: ${v.approval}`, ...v.tech, ...v.conditions];
  for (const c of issue.conditions) if (c !== PREVIEW_LABEL) expect(shown, c).toContain(c);
  // Without the label (preview off) nothing is stripped.
  const plain = viewIssue({ conclusion: "기본 결론", conditions: ["기타 조건"] }, PREVIEW_LABEL);
  expect([plain.conclusion, plain.conditions]).toEqual(["기본 결론", ["기타 조건"]]);
});

it("V8-W04: '추가로 확인할 것'은 같은 문자열을 한 번만, '근거 확인이 필요한 부분'은 법령별로 묶되 모든 항목을 남긴다", () => {
  expect(unique(["가 법", "나 법", "가 법", " 나 법 "])).toEqual(["가 법", "나 법"]);
  const gaps = [
    "같은 법규의 시행일·공포일이 같은 서로 다른 원문이 있습니다. 공식 원문 대조가 필요합니다.",
    "가상 법 시행규칙: 별표·서식 확인이 필요합니다.",
    "가상 법: 예외·위임·경과조치 검증이 필요합니다.",
    "가상 법 시행규칙: 최근 24시간 내 원문 갱신을 확인하지 못했습니다.",
    "가상 법 시행규칙: 별표·서식 확인이 필요합니다.",
    "적용 조건 후보 997개 중 100개를 표시합니다. 나머지 조건은 전문에서 추가 대조해야 합니다.",
  ];
  const groups = groupGaps(gaps);
  expect(groups.map((g) => [g.name, g.items.length])).toEqual([[COMMON_GAPS, 2], ["가상 법 시행규칙", 2], ["가상 법", 1]]);
  const back = groups.flatMap((g) => g.items.map((i) => (g.name === COMMON_GAPS ? i : `${g.name}: ${i}`)));
  expect(back.sort()).toEqual(unique(gaps).sort());
});

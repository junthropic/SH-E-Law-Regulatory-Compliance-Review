import { equalQuantity } from "./fact-provenance.js";
// Explicitly reported conflicts are kept. Free text alone does not establish a shared scope.
export function factConflict(key: string, value: string, prompt = ""): string | undefined {
  if (/충돌|서로 다|불일치|엇갈/.test(value)) return "입력에서 불일치가 명시되었습니다. 원본과 기준 시점을 대조하세요.";
}
export function factClarification(key: string, value: string, prompt = ""): string | undefined {
  const text = value + "\n" + prompt;
  if (key === "permit" && /(?:허가|신고)\s*(?:있음|완료|받음|받았)/.test(text) && /무허가|미신고|(?:허가|신고)\s*(?:없음|미완료|받지 않)/.test(text)) {
    if (!/정정|과거|종전|취소|변경 전|변경 후/.test(text)) return "허가·신고가 있다는 입력과 없다는 입력이 함께 있습니다. 동일 시설·행위·기준일인지 확인하세요.";
  }
  // Only compare explicit same-field statements; different substances and before/after values need context.
  if (["quantity", "cas", "concentration"].includes(key) && value && prompt) {
    const pattern = key === "cas" ? /\b\d{2,7}-\d{2}-\d\b/g : key === "concentration" ? /\d+(?:\.\d+)?\s*%/g : /\d+(?:\.\d+)?\s*(?:kg|kL|mL|L|t)(?![A-Za-z])/g;
    const values = [...value.matchAll(pattern)].map(m => m[0].replace(/\s/g, ""));
    const candidates = [...prompt.matchAll(pattern)].map(m => m[0].replace(/\s/g, ""));
    if (values.length === 1 && candidates.length === 1 && values[0] !== candidates[0] && !/정정|변경|예시|예정/.test(prompt)) {
      const split = (v: string) => /^(\d+(?:\.\d+)?)(.*)$/.exec(v);
      const a = split(values[0]), b = split(candidates[0]);
      if (key !== "cas" && a && b && equalQuantity(a[1], a[2], b[1], b[2]) === true) return;
      return "질문 원문과 추가 답변의 값이 다릅니다. 동일 물질·시설·산정 기준·시점인지 확인하기 전에는 충돌로 확정하지 않습니다.";
    }
  }
}

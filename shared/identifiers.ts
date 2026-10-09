export function validCas(value: string) {
  if (!/^\d{2,7}-\d{2}-\d$/.test(value)) return false;
  const digits = value.replaceAll("-", "");
  const body = digits.slice(0, -1).split("").reverse();
  return (
    body.reduce((sum, d, i) => sum + Number(d) * (i + 1), 0) % 10 ===
    Number(digits.at(-1))
  );
}

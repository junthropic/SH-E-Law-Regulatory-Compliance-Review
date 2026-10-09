import type { CaseFact } from "../shared/types.js";

/** Existing input completeness never attests to site conditions or original documents. */
export function recordAssertion(fact: CaseFact, source: "user" | "model", recordedAt: string): CaseFact {
  return { ...fact, provenance: {
    assertionSource: source, userAttested: source === "user" && fact.confirmed,
    verificationStatus: "unverified", evidenceIds: [], conflictIds: [], recordedAt,
  } };
}

export function resetFactVerification(fact: CaseFact): CaseFact {
  return { ...fact, provenance: {
    ...(fact.provenance || { assertionSource: "user", userAttested: fact.confirmed,
      evidenceIds: [], conflictIds: [], recordedAt: new Date().toISOString() }),
    verificationStatus: "unverified",
  } };
}

type Fraction = { n: bigint; d: bigint };
function decimal(value: string): Fraction | undefined {
  // No Number conversion: preserve decimal boundaries, including large integers.
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m || value.length > 300) return;
  return { n: BigInt(m[2] + (m[3] || "")) * (m[1] === "-" ? -1n : 1n), d: 10n ** BigInt(m[3]?.length || 0) };
}
export function compareDecimal(a: string, b: string): number | undefined {
  const x = decimal(a), y = decimal(b);
  if (!x || !y) return;
  const delta = x.n * y.d - y.n * x.d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
const units: Record<string, { dimension: string; multiplier: bigint }> = {
  mL: { dimension: "volume", multiplier: 1n }, L: { dimension: "volume", multiplier: 1000n },
  kL: { dimension: "volume", multiplier: 1000000n }, g: { dimension: "mass", multiplier: 1n },
  kg: { dimension: "mass", multiplier: 1000n }, t: { dimension: "mass", multiplier: 1000000n },
  "%": { dimension: "percent", multiplier: 1n },
};
export function equalQuantity(a: string, au: string, b: string, bu: string): boolean | undefined {
  const x = decimal(a), y = decimal(b), u = units[au], v = units[bu];
  if (!x || !y || !u || !v || u.dimension !== v.dimension) return;
  return x.n * u.multiplier * y.d === y.n * v.multiplier * x.d;
}

export type FactComparison = "equal" | "conflict" | "different_context" | "unknown";
export function compareFactAssertions(a: CaseFact, b: CaseFact): FactComparison {
  if (a.key !== b.key) return "different_context";
  const x = a.provenance, y = b.provenance;
  const keys = ["subjectId", "measurementBasis", "scope"] as const;
  if (keys.some(k => x?.[k] && y?.[k] && x[k] !== y[k])) return "different_context";
  if (keys.some(k => !x?.[k] || !y?.[k]) || !x?.validFrom || !y?.validFrom) return "unknown";
  const ax = Date.parse(x.validFrom), by = Date.parse(y.validFrom);
  const ae = x.validTo ? Date.parse(x.validTo) : Infinity, be = y.validTo ? Date.parse(y.validTo) : Infinity;
  if (!Number.isFinite(ax) || !Number.isFinite(by) || Number.isNaN(ae) || Number.isNaN(be) || ae <= ax || be <= by) return "unknown";
  // Valid periods are half-open: a change taking effect at an old period's end is not a conflict.
  if (ae <= by || be <= ax) return "different_context";
  if (!a.value.trim() || !b.value.trim()) return "unknown";
  if (a.unit || b.unit) {
    const equal = equalQuantity(a.value, a.unit || "", b.value, b.unit || "");
    return equal === undefined ? "unknown" : equal ? "equal" : "conflict";
  }
  const compared = compareDecimal(a.value, b.value);
  return (compared === undefined ? a.value.trim() === b.value.trim() : compared === 0) ? "equal" : "conflict";
}

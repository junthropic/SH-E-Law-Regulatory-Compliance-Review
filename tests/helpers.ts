import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { Store, sha } from "../server/store.js";
import type { Evidence, Rule, ReviewRequest } from "../shared/types.js";
import { koreaDate } from "../shared/dates.js";
export function testStore() {
  const dir = mkdtempSync(join(tmpdir(), "she-test-"));
  const store = new Store(dir);
  return {
    store,
    clean: () => {
      store.close();
      if (
        dirname(resolve(dir)) !== resolve(tmpdir()) ||
        !basename(dir).startsWith("she-test-")
      )
        throw new Error("Unsafe test cleanup path");
      // Windows child-process exit can precede release of the SQLite directory handle.
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}
// Synthetic fixtures only; these strings are NOT actual Korean law.
export function evidence(overrides: Partial<Evidence> = {}): Evidence {
  const text =
    "시험용 가상 법규입니다. 조건 수량에 해당하고 예외가 없으면 시험상 신고 조건을 확인합니다.";
  return {
    id: randomUUID(),
    sourceId: "test-national",
    kind: "law",
    title: "시험용 가상 법규",
    region: "전국",
    article: "가상 제1조",
    text,
    url: "https://www.law.go.kr/법령/시험",
    version: "test-1",
    effectiveFrom: "2025-01-01",
    promulgatedAt: "2024-12-01",
    fetchedAt: new Date().toISOString(),
    hash: sha(text),
    complete: true,
    annexesComplete: true,
    historyComplete: true,
    verified: true,
    verificationNote: "테스트 fixture",
    links: [],
    ...overrides,
  };
}
export function basis() {
  return [
    evidence(),
    evidence({
      sourceId: "test-ordinance",
      kind: "ordinance",
      region: "경기도",
      title: "시험용 경기도 가상 조례",
      text: "이 문서는 시험용 가상 조례입니다. 예외 여부와 신고 조건을 별도로 확인합니다.",
      hash: sha(
        "이 문서는 시험용 가상 조례입니다. 예외 여부와 신고 조건을 별도로 확인합니다.",
      ),
    }),
  ];
}
export function rule(es: Evidence[]): Rule {
  return {
    id: "synthetic-rule",
    title: "시험용 조건 일치",
    version: "test-1",
    approved: true,
    reviewer: "가상 검토자",
    region: "경기도",
    effectiveFrom: "2025-01-01",
    evidenceHashes: es.map((e) => e.hash),
    quotes: Object.fromEntries(es.map((e) => [e.hash, e.text])),
    requiredFacts: ["ratio", "permit"],
    predicate: { fact: "ratio", operator: "gte", value: 1 },
    exceptionFacts: ["exception"],
    conclusion: "시험용 판단입니다.",
  };
}
export function request(): ReviewRequest {
  return {
    prompt: "시험용 위험물 검토 상황을 기록합니다.",
    region: "경기도",
    municipality: "시험시",
    // The app compares review dates with Korea's civil date (shared/dates.ts), not the UTC date.
    asOf: koreaDate(),
    documentIds: [],
    model: "",
    useAi: false,
    answers: {},
  };
}

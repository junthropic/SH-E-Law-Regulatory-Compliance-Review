import {
  ComplianceRepository,
  entityRef,
  type Principal,
  type Entity,
} from "../server/compliance-v2.js";
import { testStore } from "./helpers.js";
import { sha } from "../server/store.js";
export const writer: Principal = {
  id: "writer",
  tenant: "synthetic-site",
  synthetic: true,
  roles: ["writer"],
};
export const reviewer: Principal = {
  ...writer,
  id: "reviewer",
  roles: [
    "extraction_reviewer",
    "rule_reviewer",
    "case_reviewer",
    "action_reviewer",
  ],
};
export const scope = {
  site: "site-a",
  subject: "tank-a",
  place: "room-a",
  periodFrom: "2026-10-08",
  periodTo: "2026-10-08",
};
export function fixture() {
  const ctx = testStore(),
    repo = new ComplianceRepository(ctx.store);
  const put = (id: string, body: unknown) => repo.save(writer, id, 0, body);
  const approve = (e: Entity) =>
    repo.approve(
      reviewer,
      e.id,
      e.version,
      e.hash,
      "가상 시험의 해당 범위만 검토한 모의 승인 기록입니다.",
    );
  const source = put("source", {
    kind: "source",
    title: "가상 시험 조문",
    url: "https://example.test/synthetic",
    version: "fixture-1",
    text: "가상 조문",
    textHash: sha("가상 조문"),
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    sourceTag: "normative",
    complete: true,
    decisiveCellsChecked: true,
    conflicts: [],
    extractionVersion: "fixture-1",
  });
  approve(source);
  const facts: Record<string, ReturnType<typeof entityRef>> = {};
  function add(key: string, value: "true" | "false", overrides = {}) {
    const original = repo.putOriginal(writer, Buffer.from("가상 증빙 " + key));
    const ev = put("e-" + key, {
      kind: "evidence",
      scope,
      ...original,
      path: "electronic_record",
      issuedAt: "2026-10-08",
      receivedAt: null,
      validFrom: "2026-01-01",
      validTo: null,
      collectedAt: "2026-10-08T00:00:00Z",
      claims: { [key]: value },
      limitations: [],
      readable: true,
      complete: true,
      classification: "private",
      externalAllowed: false,
      retention: {
        legalBasis: null,
        internalPolicy: "시험 종료 후 격리 자료 삭제",
        deleteAfter: null,
        hold: false,
      },
    });
    approve(ev);
    const f = put(key, {
      kind: "fact",
      scope,
      predicate: key,
      value,
      truth: value,
      unit: null,
      normalizedUnit: null,
      measurementBasis: null,
      assertion: "user",
      userAttested: true,
      evidence: [entityRef(ev)],
      locations: [{ evidenceId: ev.id, page: 1, locator: "시험 문장" }],
      recordedAt: "2026-10-08T00:00:00Z",
      eventType: null,
      eventDate: null,
      formulaVersion: null,
      extractionVersion: null,
      conflicts: [],
      ...overrides,
    });
    approve(f);
    facts[key] = entityRef(f);
    return f;
  }
  const policy = put("policy", {
    kind: "policy",
    obligationId: "synthetic.check.submit",
    label: "가상 제출 의무",
    basisDate: "2026-10-08",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    basis: [entityRef(source)],
    author: writer.id,
    domain: "synthetic",
    applicability: { fact: "target" },
    fulfillment: { fact: "fulfilled" },
    nonfulfillment: { fact: "breach" },
    exceptions: { fact: "exception" },
    deadline: null,
    immediate: true,
    requirements: Object.fromEntries(
      ["target", "fulfilled", "breach", "exception"].map((k) => [
        k,
        {
          label: k + " 시험 사실",
          acceptedPaths: ["electronic_record"],
          alternatives: ["동일 대상의 시험 기관 대장"],
          insufficientAlone: ["문서 미업로드"],
          role: "가상 검토자",
        },
      ]),
    ),
    unresolved: [],
    sanction: "unknown",
  });
  approve(policy);
  function decision() {
    return put("decision", {
      kind: "decision",
      scope,
      asOf: "2026-10-08",
      policy: entityRef(policy),
      facts,
      author: writer.id,
    });
  }
  return { ...ctx, repo, put, approve, source, policy, add, decision, facts };
}

import { it, expect } from "vitest";
import { fixture, writer, scope } from "./v2-fixture.js";
import { entityRef } from "../server/compliance-v2.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const cases = [
  { id: "G01", facts: {}, expected: "pending" },
  { id: "G02", facts: { target: "false" }, expected: "out_of_scope" },
  {
    id: "G03",
    facts: {
      target: "true",
      fulfilled: "true",
      breach: "false",
      exception: "false",
    },
    expected: "fulfilled",
  },
  {
    id: "G04",
    facts: {
      target: "true",
      fulfilled: "false",
      breach: "true",
      exception: "false",
    },
    expected: "risk_candidate",
  },
  {
    id: "G05",
    facts: { target: "true", fulfilled: "false", exception: "false" },
    expected: "pending",
  },
  {
    id: "G06",
    facts: {
      target: "true",
      fulfilled: "true",
      breach: "true",
      exception: "false",
    },
    expected: "pending",
  },
  {
    id: "G07",
    facts: { target: "true", fulfilled: "false", breach: "true" },
    expected: "pending",
  },
  {
    id: "G08",
    facts: { fulfilled: "true", breach: "false", exception: "false" },
    expected: "pending",
  },
  {
    id: "G09",
    facts: {
      target: "true",
      fulfilled: "false",
      breach: "true",
      exception: "true",
    },
    expected: "pending",
  },
] as const;
it.each(cases)("$id: 가상 판정 행렬 expected=$expected", (scenario) => {
  const f = fixture();
  try {
    for (const [key, value] of Object.entries(scenario.facts))
      f.add(key, value as "true" | "false");
    const d = f.decision(),
      r = f.repo.evaluate(writer, d);
    mkdirSync(resolve("work/v2-audit/golden"), { recursive: true });
    writeFileSync(
      resolve("work/v2-audit/golden", scenario.id + ".json"),
      JSON.stringify(
        {
          id: scenario.id,
          synthetic: true,
          datasetVersion: "v2-design-1",
          asOf: "2026-10-08",
          expected: scenario.expected,
          actual: r.outcome,
          categoryBeforeApproval: r.category,
          holds: r.holds,
          recordedAt: new Date().toISOString(),
          independentLegalReview: false,
          forbiddenOutput: "승인 전 확정 위반·실제 사업장 검증 완료",
        },
        null,
        2,
      ),
    );
    expect(r.outcome).toBe(scenario.expected);
    expect(r.category).not.toBe("clear_risk");
    if (scenario.expected === "pending")
      expect(r.holds.length).toBeGreaterThan(0);
    else {
      f.approve(d);
      expect(f.repo.evaluate(writer, d).category).toBe(
        scenario.expected === "risk_candidate" ? "clear_risk" : "human_review",
      );
    }
  } finally {
    f.clean();
  }
}, 30000);
it("AC04: 만료한 증빙을 새 사실 승인에 재사용할 수 없다", () => {
  const f = fixture();
  try {
    f.add("target", "true");
    const ev = f.repo.get(writer, "e-target"),
      b = ev.body;
    if (b.kind !== "evidence") throw Error();
    const newer = f.repo.save(writer, ev.id, 1, {
      ...b,
      validTo: "2026-10-07",
    });
    f.approve(newer);
    const fact = f.repo.get(writer, "target");
    const next = f.repo.save(writer, fact.id, 1, {
      ...fact.body,
      evidence: [entityRef(newer)],
    });
    expect(() => f.approve(next)).toThrow("동일 대상");
  } finally {
    f.clean();
  }
});
it("AC10 AC11: 시행 예정인 근거를 현행 판단에 쓰지 않는다", () => {
  const f = fixture();
  try {
    f.add("target", "false");
    const d = f.decision();
    const source = f.repo.save(writer, f.source.id, 1, {
      ...f.source.body,
      effectiveFrom: "2027-01-01",
    });
    f.approve(source);
    const policy = f.repo.save(writer, f.policy.id, 1, {
      ...f.policy.body,
      basis: [entityRef(source)],
    });
    f.approve(policy);
    const newer = f.repo.save(writer, d.id, 1, {
      ...d.body,
      policy: entityRef(policy),
    });
    expect(f.repo.evaluate(writer, newer).holds.map((h) => h.code)).toContain(
      "BASIS_INCOMPLETE",
    );
  } finally {
    f.clean();
  }
});
it("V2-11 V2-13 AC30 AC31: 하나의 이행 사실은 다른 하위 의무의 완료를 입증하지 않는다", () => {
  const f = fixture();
  try {
    f.add("target", "true");
    f.add("fulfilled", "true");
    f.add("breach", "false");
    f.add("exception", "false");
    const d = f.decision();
    f.approve(d);
    const first = f.repo.evaluate(writer, d);
    const p = f.policy.body;
    if (p.kind !== "policy") throw Error();
    const next = f.put("submission-policy", {
      ...p,
      obligationId: "synthetic.result.submit",
      fulfillment: { fact: "submitted" },
      requirements: {
        ...p.requirements,
        submitted: { ...p.requirements.fulfilled, label: "제출 사실" },
      },
    });
    f.approve(next);
    const other = f.put("submission-decision", {
      ...d.body,
      policy: entityRef(next),
    });
    expect(first.outcome).toBe("fulfilled");
    expect(f.repo.evaluate(writer, other).outcome).toBe("pending");
  } finally {
    f.clean();
  }
});
it("V2-23: 조치 완료 확인은 과거 판정을 덮어쓰지 않는다", () => {
  const f = fixture();
  try {
    f.add("target", "true");
    f.add("fulfilled", "false");
    f.add("breach", "true");
    f.add("exception", "false");
    const d = f.decision();
    f.approve(d);
    const a = f.put("action", {
      kind: "action",
      decision: entityRef(d),
      historicalDecision: entityRef(d),
      owner: writer.id,
      state: "claimed_complete",
      due: null,
      dueKind: "internal",
      resources: "가상 담당자",
      temporaryControls: "가상 통제",
      completionEvidence: [],
    });
    expect(() => f.approve(a)).toThrow("효과 증빙");
    const existing = f.repo.get(writer, "e-target");
    if (existing.body.kind !== "evidence") throw Error();
    const evidence = f.put("effect", {
      ...existing.body,
      claims: { "action_effect:action": "confirmed" },
    });
    f.approve(evidence);
    const complete = f.repo.save(writer, a.id, 1, {
      ...a.body,
      completionEvidence: [entityRef(evidence)],
    });
    f.approve(complete);
    expect(f.repo.evaluate(writer, d).category).toBe("clear_risk");
    expect(f.repo.get(writer, d.id).hash).toBe(d.hash);
  } finally {
    f.clean();
  }
});

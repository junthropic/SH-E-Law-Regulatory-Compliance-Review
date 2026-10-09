import { it, expect } from "vitest";
import {
  ComplianceRepository,
  entityRef,
  truthOf,
  type Principal,
  type Entity,
} from "../server/compliance-v2.js";
import { calculateDeadline } from "../server/deadlines-v2.js";
import { testStore } from "./helpers.js";
import { sha } from "../server/store.js";
import { createApp } from "../server/app.js";
import { fixture, writer, reviewer, scope } from "./v2-fixture.js";
it("AC46: 결정적 비대상 근거는 무관한 미확인 입력과 독립적으로 판정한다", () => {
  expect(
    truthOf(
      { all: [{ fact: "a" }, { fact: "b" }] },
      { a: "false", b: "unknown" },
    ),
  ).toBe("false");
  expect(
    truthOf(
      { any: [{ fact: "a" }, { fact: "b" }] },
      { a: "true", b: "conflict" },
    ),
  ).toBe("true");
  const f = fixture();
  try {
    f.add("target", "false");
    const d = f.decision();
    expect(f.repo.evaluate(writer, d)).toMatchObject({
      outcome: "out_of_scope",
      category: "human_review",
      holds: [],
    });
    f.approve(d);
    expect(f.repo.evaluate(writer, d).approval).toBe("approved");
  } finally {
    f.clean();
  }
});
it("AC01 AC02 AC03 AC09 V2-10: 입력·API 부재는 위반과 적합 어느 것으로도 승격하지 않는다", () => {
  const f = fixture();
  try {
    const d = f.decision();
    const r = f.repo.evaluate(writer, d);
    expect(r.category).toBe("more_data");
    expect(r.outcome).toBe("pending");
    expect(r.holds[0].alternatives.length).toBeGreaterThan(0);
    expect(() => f.approve(d)).toThrow();
  } finally {
    f.clean();
  }
});
it("P0-7: 근거·정책·사실 승인 후에도 사업장 판단 승인 전 확정 리스크가 아니다", () => {
  const f = fixture();
  try {
    f.add("target", "true");
    f.add("fulfilled", "false");
    f.add("breach", "true");
    f.add("exception", "false");
    const d = f.decision();
    expect(f.repo.evaluate(writer, d)).toMatchObject({
      category: "human_review",
      outcome: "risk_candidate",
      synthetic: true,
    });
    f.approve(d);
    expect(f.repo.evaluate(writer, d).category).toBe("clear_risk");
    expect(() =>
      f.repo.approve(
        writer,
        d.id,
        d.version,
        d.hash,
        "권한 없는 사용자의 승인 시도입니다",
      ),
    ).toThrow();
  } finally {
    f.clean();
  }
});
it("AC47 V2-21: 원문 변경은 의존 판단만 무효화하며 승인 이력은 남긴다", () => {
  const f = fixture();
  try {
    f.add("target", "false");
    const d = f.decision();
    f.approve(d);
    f.repo.save(writer, f.source.id, 1, {
      ...f.source.body,
      extractionVersion: "fixture-2",
    });
    expect(f.repo.approved(writer, d)).toBe(false);
    expect(
      f.store.db.prepare("SELECT count(*) n FROM v2_approvals").get(),
    ).toHaveProperty("n", 5);
    expect(() => f.repo.save(writer, f.source.id, 1, f.source.body)).toThrow(
      "버전 충돌",
    );
  } finally {
    f.clean();
  }
});
it("AC05 AC29 V2-16: 다른 설비·만료 증빙은 사실 입증 승인에 사용할 수 없다", () => {
  const f = fixture();
  try {
    expect(() =>
      f.add("target", "true", { scope: { ...scope, subject: "tank-b" } }),
    ).toThrow("동일 대상");
  } finally {
    f.clean();
  }
});
it("P0-9 V2-22: 다른 사업장·가상 영역 접근과 자기 승인을 차단한다", () => {
  const f = fixture();
  try {
    expect(() =>
      f.repo.get({ ...writer, tenant: "other" }, "source"),
    ).toThrow();
    expect(() =>
      f.repo.get({ ...writer, synthetic: false }, "source"),
    ).toThrow();
    expect(() =>
      f.repo.approve(
        { ...writer, roles: ["extraction_reviewer"] },
        "source",
        1,
        f.source.hash,
        "자기 승인 시도는 허용되지 않습니다",
      ),
    ).toThrow();
  } finally {
    f.clean();
  }
});
it("AC43 V2-24: 별도 DB 복원은 원본·연결·과거 승인을 보존하고 현재 승인은 재검토한다", () => {
  const f = fixture(),
    target = testStore();
  try {
    f.add("target", "false");
    const d = f.decision();
    f.approve(d);
    const backup = f.repo.backup(writer),
      repo = new ComplianceRepository(target.store);
    repo.restore(writer, backup);
    expect(repo.get(writer, d.id).hash).toBe(d.hash);
    expect(repo.approved(writer, repo.get(writer, d.id))).toBe(false);
    expect(Object.keys(repo.backup(writer).originals)).toEqual(
      Object.keys(backup.originals),
    );
    expect(() => repo.restore(writer, backup)).toThrow();
  } finally {
    f.clean();
    target.clean();
  }
});
it("P0-9: 복원 전 대상·원본 해시를 검증하고 부분 DB를 만들지 않는다", () => {
  const f = fixture(),
    target = testStore();
  try {
    f.add("target", "false");
    const b = f.repo.backup(writer);
    b.originals[Object.keys(b.originals)[0]] = "bad";
    const repo = new ComplianceRepository(target.store);
    expect(() => repo.restore(writer, b)).toThrow();
    expect(
      target.store.db.prepare("SELECT count(*) n FROM v2_entities").get(),
    ).toHaveProperty("n", 0);
  } finally {
    f.clean();
    target.clean();
  }
});
const deadline = {
  anchorEvent: "certificate_issued",
  amount: 1,
  unit: "months" as const,
  includeStart: false,
  holidayRule: "none" as const,
  holidays: [],
  calculationBasis: "가상 시험의 명시된 기간 계산 정책",
  verified: true,
};
it("V2-14: 검사일과 발급일을 바꾸어 대입하지 않는다", () => {
  expect(
    calculateDeadline(
      deadline,
      { type: "inspection_performed", date: "2026-01-31" },
      "2026-10-08",
    ).state,
  ).toBe("unknown");
  expect(
    calculateDeadline(
      deadline,
      { type: "certificate_issued", date: "2026-01-31" },
      "2026-10-08",
    ).due,
  ).toBe("2026-02-28");
  expect(
    calculateDeadline(
      { ...deadline, amount: 1, unit: "years" },
      { type: "certificate_issued", date: "2024-02-29" },
      "2026-10-08",
    ).due,
  ).toBe("2025-02-28");
});
it("AC10 AC11 AC13: 미확인 계산 근거·기산일은 보류하고 기한 도래 전과 경과를 구분한다", () => {
  expect(
    calculateDeadline(
      { ...deadline, verified: false },
      { type: "certificate_issued", date: "2026-01-31" },
      "2026-10-08",
    ).due,
  ).toBeNull();
  expect(calculateDeadline(deadline, undefined, "2026-10-08").due).toBeNull();
  expect(
    calculateDeadline(
      deadline,
      { type: "certificate_issued", date: "2026-10-01" },
      "2026-10-08",
    ).state,
  ).toBe("running");
});
it("API 인증: 요청 본문의 역할이나 기존 검토자 이름은 승인 권한이 아니다", async () => {
  const f = testStore();
  const { app } = await createApp(
    f.store,
    true,
    new Map([[sha("fixture-token"), writer]]),
  );
  try {
    const boot = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1" },
    });
    const cookie = boot.headers["set-cookie"]!.toString().split(";")[0];
    const res = await app.inject({
      method: "GET",
      url: "/api/compliance-v2/entities/missing",
      headers: { host: "127.0.0.1", cookie, authorization: "Bearer forged" },
    });
    expect(res.statusCode).toBe(403);
  } finally {
    await app.close();
    f.clean();
  }
});

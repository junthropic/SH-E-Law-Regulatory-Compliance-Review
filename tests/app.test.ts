import { it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { request, basis, rule } from "./helpers.js";
import { approveReviewBasis, hasCoverageApproval } from "../server/approval.js";
import { testStore } from "./helpers.js";
it("로컬 호스트·세션·CSRF를 검사하고 실제 검토 이력을 저장한다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "she-app-test-"));
  const { app, store } = await createApp(new Store(dir), true);
  try {
    expect(
      (
        await app.inject({
          url: "/api/bootstrap",
          headers: { host: "malicious.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/status",
          headers: { host: "127.0.0.1:4317" },
        })
      ).statusCode,
    ).toBe(401);
    const bootstrap = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const cookie = bootstrap.cookies[0].name + "=" + bootstrap.cookies[0].value;
    const headers = {
      host: "127.0.0.1:4317",
      cookie,
      "x-csrf-token": bootstrap.json().csrf,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reviews",
          headers: { host: headers.host, cookie },
          payload: request(),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reviews",
          headers: { ...headers, origin: "https://evil.test" },
          payload: request(),
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: "POST",
      url: "/api/reviews",
      headers,
      payload: request(),
    });
    expect(created.statusCode).toBe(202);
    await vi.waitFor(() =>
      expect(store.review(created.json().id)?.status).toBe("completed"),
    );
    const report = await app.inject({
      url: "/api/reviews/" + created.json().id,
      headers,
    });
    expect(
      report.json().issues.some((i: any) => i.category === "more_data"),
    ).toBe(true);
    expect(
      report.json().issues.some((i: any) => i.category === "clear_risk"),
    ).toBe(false);
    const exported = await app.inject({
      url: "/api/reviews/" + created.json().id + "/export?format=md",
      headers,
    });
    expect(exported.body).toContain(request().prompt);
    const badDate = await app.inject({
      method: "POST",
      url: "/api/reviews",
      headers,
      payload: { ...request(), asOf: "2026-02-30" },
    });
    expect(badDate.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/petitions/connect",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    const backup = await app.inject({ url: "/api/backup", headers });
    expect(backup.json().reviews).toHaveLength(1);
    expect(backup.body).not.toContain("accessToken");
  } finally {
    await app.close();
    if (
      dirname(resolve(dir)) !== resolve(tmpdir()) ||
      !basename(dir).startsWith("she-app-test-")
    )
      throw new Error("Unsafe test cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
});
it("검토자 확인은 원문 전체 해시·공보·지역·기준일에 결속된다", () => {
  const { store, clean } = testStore();
  try {
    const es = basis();
    for (const e of es) store.saveEvidence({ ...e, verified: false });
    const date = request().asOf;
    const approval = {
      reviewer: "시험 검토자",
      region: "경기도",
      municipality: "시험시",
      asOf: date,
      note: "단위시험용 검토서로 실제 법률 검증이 아닙니다. 원문과 예외를 가상 확인합니다.",
      gazetteUrl: "https://www.gg.go.kr/test",
      delegationChecked: true,
      exceptionsChecked: true,
      annexesChecked: true,
      historyChecked: true,
      evidenceHashes: es.map((e) => e.hash),
      rules: [rule(es)],
    };
    approveReviewBasis(store, approval);
    expect(store.rules()[0].approved).toBe(true);
    expect(hasCoverageApproval(store, "경기도", "시험시", date, es)).toBe(true);
    expect(hasCoverageApproval(store, "경기도", "다른시", date, es)).toBe(
      false,
    );
    expect(() =>
      approveReviewBasis(store, { ...approval, evidenceHashes: [es[0].hash] }),
    ).toThrow();
  } finally {
    clean();
  }
});

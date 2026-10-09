import { it, expect, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { request, basis, rule } from "./helpers.js";
import { approveReviewBasis, hasCoverageApproval } from "../server/approval.js";
import { testStore } from "./helpers.js";
it("응답 수신 중단 시 작업 완료 전에는 잠금을 유지하고 완료 후에는 저장을 허용한다", async () => {
  const { store, clean } = testStore();
  const { app } = await createApp(store, true);
  let release!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: `127.0.0.1:${port}` },
    });
    const headers = {
      host: `127.0.0.1:${port}`,
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/api/public/update",
      method: "POST",
      headers,
    });
    req.on("error", () => {});
    req.end();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    const closed = new Promise<void>((resolve) =>
      req.once("close", () => resolve()),
    );
    req.destroy();
    await closed;
    const save = () =>
      app.inject({
        method: "POST",
        url: "/api/public-apis/grievance/key",
        headers,
        payload: { key: "syntheticAfterDisconnect" },
      });
    expect((await save()).statusCode).toBe(409);
    release(
      new Response(
        new Uint8Array(
          gzipSync(
            JSON.stringify({
              schemaVersion: 1,
              createdAt: new Date().toISOString(),
              evidence: [],
              sources: [],
            }),
          ),
        ),
      ),
    );
    await vi.waitFor(async () => expect((await save()).statusCode).toBe(200));
  } finally {
    vi.unstubAllGlobals();
    await app.close();
    clean();
  }
});
it("인증 저장소 장애가 자료함·설정 상태 조회를 막지 않는다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  try {
    vi.spyOn(vault, "read").mockRejectedValue(
      new Error("fixture vault unavailable"),
    );
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const r = await app.inject({
      url: "/api/status",
      headers: {
        host: "127.0.0.1:4317",
        cookie: b.cookies[0].name + "=" + b.cookies[0].value,
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().auth.storageError).toBeTruthy();
    expect(r.json().lawStorageError).toBeTruthy();
  } finally {
    await app.close();
    clean();
  }
});
it("공개자료를 받는 동안 복원·백업·종료를 거부하고 끝나면 잠금을 해제한다", async () => {
  const { store, clean } = testStore();
  const { app } = await createApp(store, true);
  let release!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: b.cookies[0].name + "=" + b.cookies[0].value,
      "x-csrf-token": b.json().csrf,
    };
    const pending = app
      .inject({ method: "POST", url: "/api/public/update", headers })
      .then((r) => r);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    for (const url of ["/api/restore", "/api/shutdown", "/api/backup"])
      expect(
        (
          await app.inject({
            method: url.endsWith("backup") ? "GET" : "POST",
            url,
            headers,
          })
        ).statusCode,
      ).toBe(409);
    release(
      new Response(
        new Uint8Array(
          gzipSync(
            JSON.stringify({
              schemaVersion: 1,
              createdAt: new Date().toISOString(),
              evidence: [],
              sources: [],
            }),
          ),
        ),
      ),
    );
    expect((await pending).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/backup", headers })).statusCode).toBe(
      200,
    );
  } finally {
    vi.unstubAllGlobals();
    await app.close();
    clean();
  }
});
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
      payload: { ...request(), answers: { permit: "아직 확인 중입니다." } },
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
      report.json().facts.find((f: any) => f.key === "permit").confirmed,
    ).toBe(false);
    expect(report.json().questions.some((q: any) => q.key === "permit")).toBe(
      true,
    );
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
    expect(
      hasCoverageApproval(
        store,
        "경기도",
        "시험시",
        date,
        es.map((e) => ({ ...e, effectiveTo: "2027-01-01" })),
      ),
    ).toBe(false);
    expect(() =>
      approveReviewBasis(store, {
        ...approval,
        evidenceHashes: [es[0].hash, es[0].hash],
      }),
    ).toThrow();
    expect(() =>
      approveReviewBasis(store, { ...approval, evidenceHashes: [es[0].hash] }),
    ).toThrow();
  } finally {
    clean();
  }
});

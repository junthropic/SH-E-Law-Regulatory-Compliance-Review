import { it, expect, vi } from "vitest";
import { testStore } from "./helpers.js";
import { writer } from "./v2-fixture.js";
import { createApp } from "../server/app.js";
import { EgressGate, queryDigest } from "../server/egress-v3.js";
import { CollectionService } from "../server/collection-service-v3.js";
import { Vault } from "../server/vault.js";
import { sha } from "../server/store.js";
import { workOne } from "../server/jobs-v3.js";
const p = {
  ...writer,
  validFrom: "2020-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
};
it("V3-F01/S2: 실제 worker·기존 façade는 느린 조회 중 다른 저장을 막지 않고 완료 결과를 재조회한다", async () => {
  const f = testStore(),
    host = await createApp(f.store, true, new Map([[sha("actor"), p]]), {
      principal: p,
      mode: "shadow",
      collect: true,
    }),
    { app, vault } = host;
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 500));
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00" },
            body: { totalCount: 0, items: [] },
          },
        }),
      );
    }),
  );
  try {
    await vault.write("public-waste-companies", "synthetic-no-real-key");
    const q = { keyword: "", mode: "search", page: 1, filters: {} };
    new EgressGate(f.store).decide(
      { ...p, roles: ["egress_reviewer"] },
      queryDigest("waste-companies", q),
      "query",
      "waste-companies",
      true,
      "가상 빈 검색 조건에 한해 기관 호출을 허용합니다.",
      p.expiresAt,
    );
    const b = await app.inject({
        url: "/api/bootstrap",
        headers: { host: "127.0.0.1" },
      }),
      headers = {
        host: "127.0.0.1",
        cookie: b.cookies.map((c) => c.name + "=" + c.value).join("; "),
        "x-csrf-token": b.json().csrf,
        authorization: "Bearer actor",
      };
    const first = await app.inject({
      method: "POST",
      url: "/api/public-apis/waste-companies/search",
      headers,
      payload: q,
    });
    expect(first.statusCode).toBe(400);
    expect(first.json().error).toMatch(/진행 중/);
    const saved = await app.inject({
      method: "POST",
      url: "/api/compliance-v2/originals",
      headers,
      payload: { data: Buffer.from("로컬 가상 자료").toString("base64") },
    });
    expect(saved.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 650));
    const second = await app.inject({
      method: "POST",
      url: "/api/public-apis/waste-companies/search",
      headers,
      payload: q,
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({
      total: 0,
      items: [],
      hasMore: false,
    });
    expect(calls).toBe(1);
    const denied = await app.inject({
      method: "POST",
      url: "/api/public-apis/waste-companies/search",
      headers,
      payload: { ...q, keyword: "다른 비공개 입력" },
    });
    expect(denied.statusCode).toBe(400);
    expect(calls).toBe(1);
    const accepted = await app.inject({
      method: "POST",
      url: "/api/management-v3/collections",
      headers,
      payload: {
        service: "waste-companies",
        query: q,
        idempotencyKey: "management",
      },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.headers.location).toContain(accepted.json().jobId);
    const status = await app.inject({
      url: accepted.headers.location as string,
      headers,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().job.id).toBe(accepted.json().jobId);
    await app.inject({
      method: "POST",
      url: `/api/management-v3/jobs/${accepted.json().jobId}/control`,
      headers,
      payload: { action: "cancel" },
    });
  } finally {
    await app.close();
    vi.unstubAllGlobals();
    f.clean();
  }
});
it("V3-F02: 실제 parser→목록·상세 실패·첨부 미지원 그래프가 부분 상태로 보존된다", async () => {
  const f = testStore(),
    vault = new Vault(f.store.dir, true),
    service = new CollectionService(f.store, vault);
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      calls++;
      return String(url).includes("PolicyQnaList")
        ? new Response(
            JSON.stringify({
              resultCode: "S00",
              resultCount: 1,
              resultList: [
                { faqNo: "123", title: "모의 회신", dutySctnNm: "tqapttn" },
              ],
            }),
          )
        : new Response(
            JSON.stringify({
              resultCode: "S00",
              resultData: { faqNo: "different" },
            }),
          );
    }),
  );
  try {
    await vault.write("public-qna", "synthetic");
    const job = await service.enqueue(p, "qna", {
      keyword: "위험물",
      mode: "1",
      page: 1,
    });
    await workOne(service.jobs, "worker", service.handle.bind(service));
    const rows = service.jobs.units(p, job.id);
    expect(rows.some((u) => u.role === "list" && u.state === "success")).toBe(
      true,
    );
    expect(rows.some((u) => u.role === "detail" && u.state === "error")).toBe(
      true,
    );
    expect(
      rows.some((u) => u.role === "attachment" && u.state === "not_supported"),
    ).toBe(true);
    expect(service.jobs.get(p, job.id)).toMatchObject({
      state: "succeeded",
      partial: true,
      cardinality: "data",
    });
    expect(calls).toBe(2);
  } finally {
    vi.unstubAllGlobals();
    f.clean();
  }
});
it("V3-F03: HTTP 200 오류 응답을 정상 0건으로 저장하지 않는다", async () => {
  const f = testStore(),
    vault = new Vault(f.store.dir, true),
    service = new CollectionService(f.store, vault);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              header: {
                resultCode: "30",
                resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
              },
            },
          }),
        ),
    ),
  );
  try {
    await vault.write("public-waste-sanctions", "synthetic");
    const job = await service.enqueue(p, "waste-sanctions", {
      keyword: "",
      mode: "search",
      page: 1,
    });
    await workOne(service.jobs, "worker", service.handle.bind(service));
    expect(service.jobs.get(p, job.id)).toMatchObject({
      state: "failed",
      cardinality: "unknown",
    });
    expect(service.jobs.units(p, job.id)).toHaveLength(0);
  } finally {
    vi.unstubAllGlobals();
    f.clean();
  }
});

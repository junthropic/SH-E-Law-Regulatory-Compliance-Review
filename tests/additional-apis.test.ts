import { afterEach, expect, it, vi } from "vitest";
import {
  additionalRequest,
  searchAdditional,
  detailAdditional,
} from "../server/additional-apis.js";
import {
  additionalSearchConfigs,
  additionalServiceIds,
  type AdditionalServiceId,
} from "../shared/additional-search.js";
import { additionalProbeSpecs } from "../server/public-api-probes.js";
import { searchPublic } from "../server/public-apis.js";
import { createApp } from "../server/app.js";
import { testStore } from "./helpers.js";
import { buildLookupPlan, localFacts } from "../server/intake.js";
import { ReviewRequestSchema } from "../shared/types.js";
const key = "fixturePrivateKey+/123==";
function sample(id: AdditionalServiceId) {
  const c = additionalSearchConfigs[id],
    p = additionalProbeSpecs[id].params;
  return {
    keyword: p[c.keywordParam] ?? "",
    mode: "search",
    page: 1,
    filters: Object.fromEntries(
      c.fields
        .map((f) => [f.name, f.initial ?? p[f.name] ?? ""])
        .filter(([, v]) => v)
        .map(([k, v]) => [
          k,
          c.fields.find((f) => f.name === k)?.kind === "date" &&
          /^\d{8}$/.test(v)
            ? v.slice(0, 4) + "-" + v.slice(4, 6) + "-" + v.slice(6)
            : v,
        ]),
    ),
  };
}
function envelope(
  id: string,
  items: unknown[] = [
    {
      title: "공식 시험 자료",
      docMngNo: "123",
      boardno: "123",
      serviceKey: key,
      link: "https://example.test/?confmKey=" + key,
    },
  ],
  total = 1,
) {
  if (id === "address")
    return {
      results: { common: { errorCode: "0", totalCount: total }, juso: items },
    };
  if (id === "grievance")
    return { response: { resultCode: "S00", totalCnt: total, items } };
  if (id.startsWith("fire-"))
    return { header: { resultCode: "00", totalCount: total }, data: items };
  return {
    response: {
      header: { resultCode: "00" },
      body: { totalCount: total, items: { item: items } },
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it.each(additionalServiceIds)(
  "%s: 실제 검색 경로·인증 분리·출처·검색조건·발췌 해시를 보존한다",
  async (id) => {
    const network = vi.fn(
      async () => new Response(JSON.stringify(envelope(id))),
    );
    vi.stubGlobal("fetch", network);
    const q = sample(id),
      result = await searchPublic(id, key, q);
    expect(result.items).toHaveLength(1);
    const record = result.items[0];
    expect(record).toMatchObject({
      service: id,
      level: "list",
      query: { keyword: q.keyword },
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(record.warnings.length).toBeGreaterThan(0);
    expect(record.catalogUrl).toMatch(/^https:\/\//);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(encodeURIComponent(key));
    const url = new URL((network.mock.calls[0] as unknown as [URL])[0]);
    expect(url.searchParams.get(additionalProbeSpecs[id].keyParam)).toBe(key);
    expect(
      url.searchParams.get(
        id === "address"
          ? "countPerPage"
          : id === "grievance"
            ? "pageSize"
            : "numOfRows",
      ),
    ).toBe("10");
  },
);
it("조회에는 연결시험용 인증번호·날짜·주소를 자동 사용하지 않으며 잘못된 조건은 호출 전에 거절한다", async () => {
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  for (const id of [
    "ppe-cert",
    "machine-cert",
    "address",
    "grievance",
    "fire-approval",
    "sif",
  ] as const)
    await expect(
      searchAdditional(id, key, { keyword: "", mode: "search", page: 1 }),
    ).rejects.toThrow();
  await expect(
    searchAdditional("accidents", key, {
      keyword: "",
      mode: "search",
      page: 1,
      filters: { serviceKey: "override" },
    }),
  ).rejects.toThrow();
  await expect(
    searchAdditional("grievance", key, {
      keyword: "",
      mode: "search",
      page: 1,
      filters: { reqFrom: "2026-02-30", reqTo: "2026-03-01" },
    }),
  ).rejects.toThrow();
  await expect(
    searchAdditional("grievance", key, {
      keyword: "",
      mode: "search",
      page: 1,
      filters: { reqFrom: "2026-03-02", reqTo: "2026-03-01" },
    }),
  ).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
  const request = additionalRequest("accidents", {
    keyword: "지게차",
    mode: "search",
    page: 2,
  });
  expect(request.params).toEqual({
    callApiId: "1060",
    keyword: "지게차",
    pageNo: "2",
    numOfRows: "10",
  });
});
it("비산먼지 고유 검색 변수와 행위제한 조회를 구분한다", () => {
  const dust = additionalRequest("dust-business", {
    keyword: "현장",
    mode: "search",
    page: 1,
    filters: { "cond[LCTN_ROAD_NM_ADDR::LIKE]": "화성" },
  });
  expect(dust.params["cond[CNSTST_NM::LIKE]"]).toBe("현장");
  expect(dust.params).not.toHaveProperty("cond[BPLC_NM::LIKE]");
  expect(() =>
    additionalRequest("land-use", {
      keyword: "공장",
      mode: "search",
      page: 1,
      filters: { operation: "restrictions" },
    }),
  ).toThrow();
  const land = additionalRequest("land-use", {
    keyword: "공장",
    mode: "search",
    page: 1,
    filters: { operation: "restrictions", areaCd: "41590", ucodeList: "TEST" },
  });
  expect(land.endpoint).toContain("DTarLandUseInfo");
  expect(land.params).not.toHaveProperty("operation");
});
it("후속 페이지·0건·잘못된 응답을 구별한다", async () => {
  const network = vi.fn(
    async () =>
      new Response(
        JSON.stringify(envelope("accidents", [{ title: "마지막" }], 11)),
      ),
  );
  vi.stubGlobal("fetch", network);
  expect(
    await searchAdditional("accidents", key, {
      keyword: "",
      mode: "search",
      page: 2,
    }),
  ).toMatchObject({ page: 2, total: 11, hasMore: false });
  network.mockImplementation(
    async () => new Response(JSON.stringify(envelope("accidents", [], 11))),
  );
  expect(
    await searchAdditional("accidents", key, {
      keyword: "",
      mode: "search",
      page: 3,
    }),
  ).toMatchObject({ items: [], hasMore: false });
  network.mockImplementation(
    async () => new Response(JSON.stringify(envelope("accidents", [], 0))),
  );
  expect(
    await searchAdditional("accidents", key, {
      keyword: "",
      mode: "search",
      page: 1,
    }),
  ).toMatchObject({ items: [], total: 0 });
  network.mockImplementation(
    async () => new Response("<html>maintenance</html>"),
  );
  await expect(
    searchAdditional("accidents", key, sample("accidents")),
  ).rejects.toThrow();
});
it("결정례 상세는 문서번호와 본문을 검증하며 불일치를 거절한다", async () => {
  const network = vi.fn(
    async () => new Response(JSON.stringify(envelope("grievance"))),
  );
  vi.stubGlobal("fetch", network);
  const item = (await searchAdditional("grievance", key, sample("grievance")))
    .items[0];
  expect(item.canDetail).toBe(true);
  network.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          response: {
            resultCode: "S00",
            docMngNo: "123",
            resultCn: "확인할 본문",
          },
        }),
      ),
  );
  expect(await detailAdditional(item, key)).toMatchObject({
    level: "detail",
    canDetail: false,
    fields: { docMngNo: "123" },
  });
  network.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          response: {
            resultCode: "S00",
            docMngNo: "999",
            resultCn: "다른 문서",
          },
        }),
      ),
  );
  await expect(detailAdditional(item, key)).rejects.toThrow("문서번호");
});
it("추가 자료를 가져오면 원문·출처를 보존하지만 법률 위반 증거로 승인하지 않는다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(envelope("ghs")))),
  );
  try {
    await vault.write("public-ghs", key);
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: b.cookies[0].name + "=" + b.cookies[0].value,
      "x-csrf-token": b.json().csrf,
    };
    const r = await app.inject({
      method: "POST",
      url: "/api/public-apis/ghs/search",
      headers,
      payload: sample("ghs"),
    });
    expect(r.statusCode).toBe(200);
    const imported = await app.inject({
      method: "POST",
      url: "/api/public-api-records/" + r.json().items[0].id + "/import",
      headers,
      payload: {},
    });
    expect(imported.statusCode).toBe(200);
    const doc = store.document(imported.json().id)!;
    expect(doc.confirmed).toBe(false);
    expect(doc.text).toContain("본문 SHA-256");
    expect(doc.text).toContain('"searchGubun":"2"');
    expect(doc.text).not.toContain(key);
    expect(store.all("evidence")).toHaveLength(0);
  } finally {
    await app.close();
    clean();
  }
});
it("화성 위험물 질문은 확인된 CAS만 GHS에 보내며 결정례 조회 기간을 기준일에 묶는다", () => {
  const request = ReviewRequestSchema.parse({
    prompt: "경기도 화성시에서 메탄올 CAS 67-56-1 소량위험물 저장·취급",
    region: "경기도",
    municipality: "화성시",
    asOf: "2026-10-08",
  });
  const facts = localFacts(request.prompt);
  expect(
    buildLookupPlan(request, facts).steps.some((s) => s.service === "ghs"),
  ).toBe(false);
  facts.find((f) => f.key === "cas")!.confirmed = true;
  const plan = buildLookupPlan(request, facts);
  expect(plan.steps.find((s) => s.service === "ghs")).toMatchObject({
    keyword: "67-56-1",
    filters: { searchGubun: "2" },
  });
  expect(plan.steps.find((s) => s.service === "grievance")).toMatchObject({
    filters: { reqFrom: "2022-01-01", reqTo: "2026-10-08" },
  });
  expect(plan.steps.some((s) => s.service === "accidents")).toBe(true);
});
it("재해사례가 검색어를 무시해도 무관한 결과를 제외하고 기관 전체 건수와 구분한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            envelope(
              "accidents",
              [
                { keyword: "지게차 충돌", business: "제조업" },
                { keyword: "추락 사고", business: "건설업" },
              ],
              100,
            ),
          ),
        ),
    ),
  );
  const result = await searchAdditional("accidents", key, {
    keyword: "지게차",
    mode: "search",
    page: 1,
    filters: { business: "제조업" },
  });
  expect(result.items).toHaveLength(1);
  expect(result).toMatchObject({ filteredOut: 1, total: 100, hasMore: true });
  expect(result.scopeNote).toContain("전체 건수는 확인되지");
  const empty = await searchAdditional("accidents", key, {
    keyword: "위험물",
    mode: "search",
    page: 1,
  });
  expect(empty.items).toHaveLength(0);
  expect(empty.total).toBe(100);
  expect(empty.hasMore).toBe(true);
});
it("토지이용의 별도 조건·예외 본문을 행위제한과 함께 보존한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0" },
              body: {
                totalCount: 1,
                items: {
                  item: {
                    UNAME: "시험지역",
                    actRegList: { QNODE_CONDS: { RNUM: "06006" } },
                  },
                  QnodeCond: { RNUM: "06006", QNODE_DESC: "예외 조건" },
                },
              },
            },
          }),
        ),
    ),
  );
  const r = await searchAdditional("land-use", key, {
    keyword: "주택",
    mode: "search",
    page: 1,
    filters: {
      operation: "restrictions",
      areaCd: "11110",
      ucodeList: "UQA430",
    },
  });
  expect(r.items[0].fields.QnodeCond).toEqual({
    RNUM: "06006",
    QNODE_DESC: "예외 조건",
  });
  expect(r.hasMore).toBe(false);
});

import { afterEach, expect, it, vi } from "vitest";
import {
  searchPublic,
  detailPublic,
  normalizeServiceKey,
} from "../server/public-apis.js";
import { createApp } from "../server/app.js";
import { testStore } from "./helpers.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import type { DocumentRecord } from "../shared/types.js";
import {
  additionalServices,
  connectionServices,
} from "../shared/connection-catalog.js";

const key = "fixtureKey+/abc123==";
const q = { keyword: "71-43-2", mode: "1", page: 1 };
const json = (body: unknown) => new Response(JSON.stringify(body));
const envelope = (items: unknown, totalCount = 1) => ({
  header: { resultCode: "00" },
  body: { items, totalCount, categorycount: { "1": totalCount } },
});
afterEach(() => vi.unstubAllGlobals());

it("같은 키는 유지하고 다른 키는 교체 승인 후에만 저장하며 다른 서비스에 영향을 주지 않는다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  try {
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const save = (id: string, payload: object) =>
      app.inject({
        method: "POST",
        url: `/api/public-apis/${id}/key`,
        headers,
        payload,
      });
    expect((await save("qna", { key })).statusCode).toBe(200);
    const checked = { state: "ok", checkedAt: "2026-10-07T00:00:00.000Z" };
    store.put("settings", "public-api-qna", checked);
    expect(
      (await save("qna", { key: encodeURIComponent(key) })).json(),
    ).toMatchObject({ unchanged: true });
    expect(store.setting("public-api-qna", {})).toEqual(checked);
    const changed = "replacementFixture123";
    expect((await save("qna", { key: changed })).statusCode).toBe(409);
    expect(await vault.read("public-qna")).toBe(key);
    expect(store.setting("public-api-qna", {})).toEqual(checked);
    // Separate service approvals may use the same portal credential.
    expect((await save("fire", { key })).statusCode).toBe(200);
    const replaced = await save("qna", { key: changed, replace: true });
    expect(replaced.json()).toMatchObject({ saved: true, replaced: true });
    expect(replaced.body).not.toContain(changed);
    expect(await vault.read("public-qna")).toBe(changed);
    expect(await vault.read("public-fire")).toBe(key);
    expect(store.setting("public-api-qna", {})).toEqual({});
  } finally {
    await app.close();
    clean();
  }
});

it("추가 26개 키는 분리 저장하고 연결 체크는 실제 요청 및 결과·시각을 저장한다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  const network = vi.fn(async (input: URL) => {
    const url = new URL(input);
    if (url.hostname === "business.juso.go.kr")
      return json({
        results: { common: { errorCode: "0", totalCount: "1" }, juso: [{}] },
      });
    if (url.pathname.includes("ApiDiciService"))
      return json({
        response: { resultCode: "S00", totalCnt: 1, items: [{}] },
      });
    if (/opnFsupl/.test(url.pathname))
      return json({
        header: { resultCode: "00", totalCount: "1" },
        data: [{}],
      });
    return json({ response: envelope({ item: [{}] }) });
  });
  vi.stubGlobal("fetch", network);
  try {
    expect(additionalServices).toHaveLength(26);
    expect(new Set(connectionServices.map((s) => s.id)).size).toBe(32);
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const post = (url: string, payload: Record<string, unknown> = {}) =>
      app.inject({ method: "POST", url, headers, payload });
    await vault.write("public-qna", "existingFixtureKey");
    for (const s of additionalServices) {
      const value = `fixture-${s.id}-12345678`;
      const saved = await post(`/api/public-apis/${s.id}/key`, { key: value });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({
        saved: true,
        readBackVerified: true,
      });
      expect(saved.body).not.toContain(value);
      expect(await vault.read(`public-${s.id}`)).toBe(value);
      expect((await post(`/api/public-apis/${s.id}/probe`)).statusCode).toBe(
        200,
      );
      expect(store.setting(`public-api-${s.id}`, {})).toMatchObject({
        state: "ok",
        checkedAt: expect.any(String),
      });
      const requestUrl = new URL(network.mock.calls.at(-1)![0]);
      expect(
        requestUrl.searchParams.get(
          s.id === "address"
            ? "confmKey"
            : ["chemical-accidents"].includes(s.id)
              ? "ServiceKey"
              : "serviceKey",
        ),
      ).toBe(value);
      expect(
        (await post(`/api/public-apis/${s.id}/search`, q)).statusCode,
      ).toBe(400);
    }
    const status = await app.inject({ url: "/api/public-apis", headers });
    const added = status
      .json()
      .filter((s: any) => additionalServices.some((a) => a.id === s.id));
    expect(added).toHaveLength(26);
    expect(
      added.every((s: any) => s.configured && s.state === "ok" && s.checkedAt),
    ).toBe(true);
    expect(status.body).not.toContain("fixture-");
    expect(JSON.stringify(makeBackup(store))).not.toContain("fixture-");
    expect(network).toHaveBeenCalledTimes(26);
    expect(
      (await post("/api/public-apis/not-registered/key", { key })).statusCode,
    ).toBe(400);
    for (const s of additionalServices) {
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/api/public-apis/${s.id}/key`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(await vault.read(`public-${s.id}`)).toBeUndefined();
    }
    expect(await vault.read("public-qna")).toBe("existingFixtureKey");
  } finally {
    await app.close();
    clean();
  }
});

it("스마트 전체 검색은 분류별 최대 건수로 마지막 페이지를 판단한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        header: { resultCode: "00" },
        body: {
          items: { item: [{ title: "시험 검색 결과" }] },
          totalCount: 363,
          categorycount: { "4": 5, "5": 14, "6": 217, "7": 127 },
          numOfRows: 10,
          pageNo: 21,
        },
      }),
    ),
  );
  const last = await searchPublic("smart", key, {
    keyword: "사다리",
    mode: "0",
    page: 22,
  });
  expect(last.total).toBe(363);
  expect(last.page).toBe(22);
  expect(last.hasMore).toBe(false);
  expect(
    (
      await searchPublic("smart", key, {
        keyword: "사다리",
        mode: "0",
        page: 21,
      })
    ).hasMore,
  ).toBe(true);
});

it("실제 소방청 상세의 건수 생략과 환경공단 정상 코드 200을 서비스별로 처리한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          "<response><header><resultCode>0</resultCode><resultMsg>NORMAR_SERVICE</resultMsg></header><body><item><casno>67-56-1</casno><materialkorname>메탄올</materialkorname></item></body></response>",
        ),
    ),
  );
  const fire = await searchPublic("fire", key, {
    keyword: "67-56-1",
    mode: "cas",
    page: 1,
  });
  expect(fire.total).toBe(1);
  expect(fire.hasMore).toBe(false);
  await expect(
    searchPublic("fire", key, { keyword: "", mode: "list", page: 1 }),
  ).rejects.toThrow("응답 형식");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
        body: {
          items: [{ sbstnId: "test", sbstnNmKor: "시험물질" }],
          totalCount: 1,
        },
      }),
    ),
  );
  expect(
    (await searchPublic("keco", key, { ...q, mode: "2" })).items,
  ).toHaveLength(1);
  await expect(searchPublic("msds", key, q)).rejects.toThrow("실패 코드");
});

it("Encoding 인증키를 한 번만 해제하고 URL 값으로 전달한다", async () => {
  expect(normalizeServiceKey(encodeURIComponent(key))).toBe(key);
  const fetcher = vi.fn(async (_url: URL, _options: RequestInit) =>
    json({ resultCode: "S00", resultCount: 0, resultList: [] }),
  );
  vi.stubGlobal("fetch", fetcher);
  await searchPublic("qna", key, q);
  const url = fetcher.mock.calls[0][0] as unknown as URL;
  expect(url.searchParams.get("serviceKey")).toBe(key);
  expect(url.searchParams.get("firstIndex")).toBe("1");
  expect(url.protocol).toBe("https:");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  expect(() =>
    normalizeServiceKey("https://example.com?serviceKey=secret"),
  ).toThrow();
});

it("6개 API의 JSON·XML 응답과 검색 파라미터를 구분한다", async () => {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL) => {
      urls.push(input);
      const path = input.pathname;
      if (path.endsWith("PolicyQnaList"))
        return json({
          resultCode: "S00",
          resultCount: "1",
          resultList: [
            { faqNo: "123", title: "위험물", dutySctnNm: "tqapttn" },
          ],
        });
      if (path.endsWith("getMaterialInfo"))
        return new Response(
          "<response><header><resultCode>00</resultCode></header><body><item><casno>71-43-2</casno><materialkorname>벤젠</materialkorname><hazardmaterialclass>제4류</hazardmaterialclass></item><totalCount>1</totalCount></body></response>",
        );
      if (path.endsWith("getChemList001"))
        return new Response(
          "<response><header><resultCode>00</resultCode></header><body><items><item><chemId>00012</chemId><chemNameKor>벤젠</chemNameKor></item></items><totalCount>1</totalCount></body></response>",
        );
      if (path.endsWith("smartSearch"))
        return json(
          envelope({
            item: [
              { doc_id: "law1", title: "법령 후보", content: "일부 본문" },
            ],
          }),
        );
      if (path.endsWith("chemSbstnList"))
        return json(
          envelope([
            {
              sbstnId: "1",
              sbstnNmKor: "벤젠",
              typeList: [
                {
                  contInfo: "0.1%",
                  excpInfo: "예외 조건",
                  ancmntYmd: "20260101",
                },
              ],
            },
          ]),
        );
      return json(
        envelope({
          item: {
            techGdlnNm: "측정 지침",
            techGdlnNo: "A-1",
            fileDownloadUrl: "https://www.kosha.or.kr/file.pdf",
          },
        }),
      );
    }),
  );
  const qna = await searchPublic("qna", key, q);
  expect(qna.items[0].canDetail).toBe(true);
  const fire = await searchPublic("fire", key, { ...q, mode: "cas" });
  expect(fire.items[0].level).toBe("detail");
  expect(fire.items[0].fields.hazardmaterialclass).toBe("제4류");
  const msds = await searchPublic("msds", key, q);
  expect(msds.items[0].fields.chemId).toBe("00012");
  await searchPublic("smart", key, { ...q, mode: "0" });
  const keco = await searchPublic("keco", key, { ...q, mode: "2" });
  expect(JSON.stringify(keco)).toContain("예외 조건");
  const guide = await searchPublic("guide", key, { ...q, mode: "name" });
  expect(guide.items[0].level).toBe("list");
  expect(guide.items[0].warnings.join()).toContain("본문은 원문");
  expect(urls[1].searchParams.get("ServiceKey")).toBe(key);
  expect(urls[1].searchParams.get("casNo")).toBe("71-43-2");
  expect(urls[2].pathname).toContain("msdschem1");
  expect(urls[3].searchParams.get("searchValue")).toBe("71-43-2");
  expect(urls[4].searchParams.get("returnType")).toBe("JSON");
  expect(urls[5].searchParams.get("callApiId")).toBe("1050");
});

it("인증 오류·HTML·불완전한 성공 응답을 0건으로 표시하지 않고 인증값을 노출하지 않는다", async () => {
  for (const body of [
    `<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>${key}</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>`,
    `<html><body>${key}</body></html>`,
    JSON.stringify({ header: { resultCode: key } }),
    JSON.stringify(envelope(undefined, 2)),
    '<!DOCTYPE response [<!ENTITY x "secret">]><response>&x;</response>',
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    const error = await searchPublic("msds", key, q).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain(key);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ resultCode: "E03" })),
  );
  expect((await searchPublic("qna", key, q)).total).toBe(0);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(`fetch failed ${key}`);
    }),
  );
  await expect(searchPublic("qna", key, q)).rejects.toThrow("통신 실패");
});

it("공개 QnA 상세는 번호·업무구분을 전달하고 본문 응답의 같은 번호를 확인한다", async () => {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      urls.push(url);
      return json(
        url.pathname.endsWith("PolicyQnaList")
          ? {
              resultCode: "S00",
              resultCount: 1,
              resultList: [
                { faqNo: "123", title: "위험물", dutySctnNm: "tqapttn" },
              ],
            }
          : {
              resultCode: "S00",
              resultData: {
                faqNo: "123",
                qnaTitl: "위험물 회신",
                qstnCntnCl: "질문",
                ansCntnCl: "답변",
                lawList: [{ lwrdNm: "위험물안전관리법" }],
              },
            },
      );
    }),
  );
  const list = await searchPublic("qna", key, q);
  const item = await detailPublic(list.items[0], key);
  expect(urls[1].pathname).toContain("PolicyQnaItem");
  expect(urls[1].searchParams.get("dutySctnNm")).toBe("tqapttn");
  expect(item.fields.ansCntnCl).toBe("답변");
  expect(item.level).toBe("detail");
});

it("MSDS 16항목 중 실패한 항목은 일부 누락으로 보존한다", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      calls.push(url.pathname);
      if (url.pathname.endsWith("getChemList001"))
        return json(
          envelope({ item: { chemId: "00012", chemNameKor: "시험물질" } }),
        );
      if (url.pathname.endsWith("getChemDetail151"))
        return new Response("failure", { status: 503 });
      return json(
        envelope({ item: { msdsItemCode: "test", itemDetail: "시험 설명" } }),
      );
    }),
  );
  const list = await searchPublic("msds", key, q),
    detail = await detailPublic(list.items[0], key);
  expect(calls).toHaveLength(17);
  expect(calls.at(-1)).toContain("getChemDetail161");
  expect(detail.level).toBe("partial");
  expect(detail.warnings.join()).toContain("15번 항목");
  expect(Object.keys(detail.fields.sections!)).toHaveLength(15);
});

it("인증키는 상태·자료함·백업에 포함되지 않고 API 자료는 미확인 참고문서로 연결된다", async () => {
  const { store, clean } = testStore();
  const { app } = await createApp(store, true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        resultCode: "S00",
        resultCount: 1,
        resultList: [
          {
            faqNo: "123",
            title: "시험 공개회신",
            dutySctnNm: "tqapttn",
            serviceKey: key,
            extra: `https://api.test/?serviceKey=${encodeURIComponent(key)}`,
          },
        ],
      }),
    ),
  );
  try {
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const post = (url: string, payload: Record<string, unknown> = {}) =>
      app.inject({ method: "POST", url, headers, payload });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/public-apis/qna/key",
          headers: { host: headers.host, cookie: headers.cookie },
          payload: { key },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post("/api/public-apis/qna/key", { key: encodeURIComponent(key) })
      ).json(),
    ).toMatchObject({ saved: true, readBackVerified: true });
    const status = await app.inject({ url: "/api/public-apis", headers });
    expect(status.body).not.toContain(key);
    expect(status.json()[0].configured).toBe(true);
    const search = await post("/api/public-apis/qna/search", q);
    expect(search.statusCode).toBe(200);
    expect(search.body).not.toContain(key);
    expect(search.body).not.toContain(encodeURIComponent(key));
    const item = search.json().items[0];
    const imported = await post(`/api/public-api-records/${item.id}/import`);
    expect(imported.statusCode).toBe(200);
    expect(imported.json().confirmed).toBe(false);
    expect(imported.json().agency).toBe("국민권익위원회");
    expect(imported.json().text).toContain(item.hash);
    expect(imported.json().warnings.join()).toContain("목록");
    expect(store.all("evidence")).toHaveLength(0);
    const backup = makeBackup(store);
    expect(JSON.stringify(backup)).not.toContain(key);
    expect(JSON.stringify(backup)).not.toContain(encodeURIComponent(key));
    const second = testStore();
    try {
      restoreBackup(second.store, backup);
      expect(second.store.all<DocumentRecord>("documents")[0].confirmed).toBe(
        false,
      );
    } finally {
      second.clean();
    }
    await app.inject({
      method: "DELETE",
      url: "/api/public-apis/qna/key",
      headers,
    });
    expect((await post("/api/public-apis/qna/probe")).statusCode).toBe(400);
    expect(
      (await post(`/api/public-api-records/${item.id}/import`)).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
    clean();
  }
}, 30000);

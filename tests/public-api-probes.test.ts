import { afterEach, expect, it, vi } from "vitest";
import {
  additionalProbeSpecs,
  parseProbeResponse,
  probeAdditional,
} from "../server/public-api-probes.js";
import { additionalServices } from "../shared/connection-catalog.js";
import { createApp } from "../server/app.js";
import { testStore } from "./helpers.js";
const key = "syntheticSecret+/value123=";
afterEach(() => vi.unstubAllGlobals());
function response(id: string, code: string, total: number, items: any = []) {
  if (["fire-approval", "fire-revocation"].includes(id))
    return { header: { resultCode: code, totalCount: total }, data: items };
  if (id === "address")
    return {
      results: { common: { errorCode: code, totalCount: total }, juso: items },
    };
  if (id === "grievance")
    return { response: { resultCode: code, totalCnt: total, items } };
  return {
    response: {
      header: { resultCode: code },
      body: { totalCount: total, items },
    },
  };
}
it("공식 연결 항목 26개가 빠짐없이 있으며 HTTPS 고정 주소와 소량 조회를 사용한다", () => {
  expect(Object.keys(additionalProbeSpecs).sort()).toEqual(
    additionalServices.map((s) => s.id).sort(),
  );
  for (const spec of Object.values(additionalProbeSpecs)) {
    const url = new URL(spec.endpoint);
    expect(url.protocol).toBe("https:");
    expect(["apis.data.go.kr", "business.juso.go.kr"]).toContain(url.hostname);
    expect(Object.values(spec.params)).not.toContain(undefined);
    expect(
      spec.params.numOfRows ?? spec.params.pageSize ?? spec.params.countPerPage,
    ).toBe("1");
  }
  expect(additionalProbeSpecs.accidents.params.callApiId).toBe("1060");
  expect(additionalProbeSpecs["accident-files"].params.callApiId).toBe("1070");
  expect(additionalProbeSpecs["land-use"].endpoint).toContain("/DTsearchLunCd");
  expect(additionalProbeSpecs["waste-fitness"].params.lcpmtBgngDt).toBe(
    "2026-08-19",
  );
});
it.each(additionalServices.map((s) => s.id))(
  "%s: 정상 0건과 인증 실패를 구분하고 응답 본문·키를 돌려주지 않는다",
  async (id) => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(response(id, id === "grievance" ? "S00" : "0", 0)),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeAdditional(id, key)).resolves.toMatchObject({
      ok: true,
      total: 0,
      count: 0,
    });
    const [, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify(response(id, key, 0))),
    );
    await expect(probeAdditional(id, key)).rejects.toThrow("실패 코드");
    fetchMock.mockImplementation(
      async () => new Response("<html><body>점검 중</body></html>"),
    );
    await expect(probeAdditional(id, key)).rejects.toThrow("형식");
  },
);
it("실제 A01의 NO_CONTENTS 응답과 주소 API의 빈 문자열 목록을 처리한다", () => {
  expect(
    parseProbeResponse("grievance", {
      response: { resultCode: 20, resultMsg: "NO_CONTENTS" },
    }),
  ).toEqual({ total: 0, count: 0 });
  expect(
    parseProbeResponse("address", {
      results: { common: { errorCode: "0", totalCount: "0" }, juso: "" },
    }),
  ).toEqual({ total: 0, count: 0 });
  expect(() =>
    parseProbeResponse("address", { results: { common: { errorCode: "0" } } }),
  ).toThrow("형식");
  expect(() => parseProbeResponse("ghs", response("ghs", "00", 1))).toThrow(
    "형식",
  );
});
it("XML 정상 응답, 게이트웨이 오류, HTTP 오류, 통신 예외에 인증값을 노출하지 않는다", async () => {
  const mock = vi.fn(
    async () =>
      new Response(
        "<response><header><resultCode>00</resultCode></header><body><totalCount>1</totalCount><items><item><id>1</id></item></items></body></response>",
      ),
  );
  vi.stubGlobal("fetch", mock);
  await expect(
    probeAdditional("chemical-accidents", key),
  ).resolves.toMatchObject({
    ok: true,
    total: 1,
  });
  for (const [body, status] of [
    [
      "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>" +
        key +
        "</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>",
      200,
    ],
    [key, 403],
    ['<!DOCTYPE x [<!ENTITY x "' + key + '">]><response/>', 200],
    ["x".repeat(4_000_001), 200],
  ] as const) {
    mock.mockImplementation(async () => new Response(body, { status }));
    try {
      await probeAdditional("grievance", key);
      throw new Error("expected failure");
    } catch (e) {
      expect(String(e)).not.toContain(key);
      expect(String(e)).not.toContain("expected failure");
    }
  }
  mock.mockImplementation(async () => {
    throw new Error("https://example.test/?serviceKey=" + key);
  });
  await expect(probeAdditional("address", key)).rejects.toThrow("통신 실패");
});
it("추가 서비스 실패 시각도 저장하고 키 교체·삭제로 이전 체크 결과를 초기화한다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify(response("grievance", "40", 0))),
    ),
  );
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
    await vault.write("public-grievance", key);
    const failed = await app.inject({
      method: "POST",
      url: "/api/public-apis/grievance/probe",
      headers,
      payload: {},
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);
    const saved: any = store.setting("public-api-grievance", {});
    expect(saved).toMatchObject({
      state: "failed",
      checkedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(saved.checkedAt))).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(key);
    const status = await app.inject({ url: "/api/public-apis", headers });
    expect(status.json().find((s: any) => s.id === "grievance")).toMatchObject(
      saved,
    );
    await app.inject({
      method: "POST",
      url: "/api/public-apis/grievance/key",
      headers,
      payload: { key: "replacementFixture123", replace: true },
    });
    expect(store.setting("public-api-grievance", {})).toEqual({});
    await app.inject({
      method: "DELETE",
      url: "/api/public-apis/grievance/key",
      headers,
      payload: {},
    });
    expect(await vault.read("public-grievance")).toBeUndefined();
    expect(store.setting("public-api-grievance", {})).toEqual({});
  } finally {
    await app.close();
    clean();
  }
});

it("KFI 공식 header/data 응답과 소문자 serviceKey를 사용한다", () => {
  for (const id of ["fire-approval", "fire-revocation"]) {
    expect(additionalProbeSpecs[id].keyParam).toBe("serviceKey");
    expect(
      parseProbeResponse(id, {
        header: { resultCode: "00", totalCount: "308" },
        data: [{ ctfcnNo: "fixture" }],
      }),
    ).toEqual({ total: 308, count: 1 });
    expect(() =>
      parseProbeResponse(id, { header: { resultCode: "10" } }),
    ).toThrow("실패 코드");
  }
});

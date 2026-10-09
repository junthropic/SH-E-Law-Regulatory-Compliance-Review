import { expect, it, vi } from "vitest";
import { a07Policy, createA07Transport, PublicApiError } from "../server/public-api-transport.js";

const url = (page = 1, key = "synthetic-secret") => new URL(`https://apis.data.go.kr/B552584/kecoapi/wstdspBzentyService/getWstdspBzentyInfo?pageNo=${page}&serviceKey=${key}`);
function clock() {
  let now = 0;
  const waits: number[] = [];
  return { now: () => now, random: () => .5, waits,
    sleep: async (ms: number) => { waits.push(ms); now += ms; }, advance: (ms: number) => { now += ms; } };
}
it("A07은 60초를 허용하고 일시 실패만 간격을 두어 한 번 재시도한다", async () => {
  const runtime = clock(), run = vi.fn().mockRejectedValueOnce(new PublicApiError("지연", "timeout", true)).mockResolvedValue({ rows: [1] });
  const transport = createA07Transport(run, runtime);
  await expect(transport.request(url())).resolves.toEqual({ rows: [1] });
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls.every(([, limit]) => limit === 60_000)).toBe(true);
  expect(runtime.waits).toContain(6000);
  expect(transport.metrics()[0]).toMatchObject({ attempts: 2, outcome: "success" });
  expect(JSON.stringify(transport.metrics())).not.toContain("synthetic-secret");
});
it("한도 및 인증 실패는 재시도하지 않고 다른 검색도 유예하며 키 변경은 분리한다", async () => {
  for (const code of ["rate_limit", "authentication"] as const) {
    const runtime = clock(), run = vi.fn().mockRejectedValue(new PublicApiError("중단", code, false, 90_000));
    const transport = createA07Transport(run, runtime);
    await expect(transport.request(url())).rejects.toThrow("중단");
    await expect(transport.request(url(2))).rejects.toThrow("중단");
    expect(run).toHaveBeenCalledTimes(1);
    run.mockResolvedValue({ ok: true });
    await expect(transport.request(url(2, "new-key"))).resolves.toEqual({ ok: true });
    runtime.advance(300_000);
    await expect(transport.request(url())).resolves.toEqual({ ok: true });
  }
});
it("동일 조회는 하나로 합치고 서로 다른 조회도 동시 호출하지 않는다", async () => {
  const runtime = clock(); let release!: (v: object) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise(r => { release = r; })).mockResolvedValue({ ok: true });
  const transport = createA07Transport(run, runtime);
  const one = transport.request(url()), duplicate = transport.request(url()), two = transport.request(url(2));
  expect(one).toBe(duplicate);
  await Promise.resolve(); await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);
  release({ ok: true }); await Promise.all([one, duplicate, two]);
  expect(run).toHaveBeenCalledTimes(2);
  expect(runtime.waits).toContain(a07Policy.minIntervalMs);
});
it("연속 장애 세 번 후에는 회로를 열어 추가 요청을 중단하고 빈 결과로 위장하지 않는다", async () => {
  const runtime = clock(), run = vi.fn().mockRejectedValue(new PublicApiError("기관 장애", "upstream", true));
  const transport = createA07Transport(run, runtime);
  for (let page = 1; page <= 4; page++) await expect(transport.request(url(page))).rejects.toThrow("기관 장애");
  expect(run).toHaveBeenCalledTimes(6);
  runtime.advance(300_000); run.mockResolvedValue({ ok: true });
  await expect(transport.request(url(5))).resolves.toEqual({ ok: true });
});
it("긴 Retry-After는 즉시 재시도하지 않고 지정된 기간의 재호출을 막는다", async () => {
  const runtime = clock(), run = vi.fn().mockRejectedValue(new PublicApiError("점검", "upstream", true, 600_000));
  const transport = createA07Transport(run, runtime);
  await expect(transport.request(url())).rejects.toThrow("점검");
  runtime.advance(300_000);
  await expect(transport.request(url(2))).rejects.toThrow("점검");
  expect(run).toHaveBeenCalledTimes(1);
});
it("대기 요청 수를 제한하고 인증값이 없는 고정 오류만 반환한다", async () => {
  const runtime = clock(); let release!: (v: object) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise(r => { release = r; })).mockResolvedValue({ ok: true });
  const transport = createA07Transport(run, runtime);
  const tasks = [1,2,3,4].map(n => transport.request(url(n)));
  await expect(transport.request(url(5))).rejects.toThrow("진행 중");
  await Promise.resolve(); await Promise.resolve(); release({ ok: true });
  await Promise.all(tasks); expect(run).toHaveBeenCalledTimes(4);
});
it("인증·형식·입력 오류에는 자동 재시도가 없다", async () => {
  for (const code of ["authentication", "format", "input"] as const) {
    const run = vi.fn().mockRejectedValue(new PublicApiError("확인 필요",code));
    await expect(createA07Transport(run,clock()).request(url())).rejects.toThrow("확인 필요");
    expect(run).toHaveBeenCalledTimes(1);
  }
});
it("HTTP 200의 게이트웨이 초당 제한을 인증 오류나 정상 0건으로 처리하지 않는다", async () => {
  vi.resetModules();
  const { requestOfficial } = await import("../server/public-api-transport.js");
  const mock = vi.fn().mockResolvedValue(new Response('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>23</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'));
  vi.stubGlobal("fetch",mock);
  try {
    await expect(requestOfficial(url())).rejects.toMatchObject({ code: "rate_limit", retryAfterMs: 60000 });
    await expect(requestOfficial(url(2))).rejects.toMatchObject({ code: "rate_limit" });
    expect(mock).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

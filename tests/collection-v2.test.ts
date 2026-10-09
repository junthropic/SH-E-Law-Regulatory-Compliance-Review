import { it, expect, vi } from "vitest";
import { testStore } from "./helpers.js";
import { CollectionJournal } from "../server/collection-journal-v2.js";
import {
  createA07Transport,
  PublicApiError,
  withPublicApiState,
  requestOfficial,
} from "../server/public-api-transport.js";
import type { PublicSearchResult } from "../shared/public-apis.js";
const page = (n = 1, total = 20): PublicSearchResult => ({
  page: n,
  total,
  hasMore: n < 2,
  items: [
    {
      id: "test",
      service: "waste-companies",
      title: "가상",
      fetchedAt: "2026-10-08T00:00:00Z",
      endpoint: "https://example.test",
      catalogUrl: "https://example.test",
      query: { keyword: "가상", mode: "search", page: n },
      fields: { id: n },
      level: "list",
      warnings: [],
      hash: String(n).repeat(64),
      canDetail: false,
    },
  ],
});
it("V2-01 V2-02: A08 HTTP200 내부 일일한도는 자정 해제로 추정하지 않고 저장한다", async () => {
  const ctx = testStore();
  let clock = Date.now();
  const time = vi.spyOn(Date, "now").mockImplementation(() => ++clock);
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        "<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
      ),
    );
  vi.stubGlobal("fetch", fetch);
  try {
    const url = new URL(
      "https://apis.data.go.kr/B552584/wstdspGrndsInfo/getlist?serviceKey=fixture-secret",
    );
    await expect(
      withPublicApiState(ctx.store, () => requestOfficial(url)),
    ).rejects.toMatchObject({ code: "rate_limit" });
    await expect(
      withPublicApiState(ctx.store, () => requestOfficial(url)),
    ).rejects.toMatchObject({ code: "rate_limit" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const states = ctx.store.all<any>("settings");
    expect(states.some((s) => s.blockedUntil === Number.MAX_SAFE_INTEGER)).toBe(
      true,
    );
    expect(JSON.stringify(states)).not.toContain("fixture-secret");
  } finally {
    time.mockRestore();
    vi.unstubAllGlobals();
    ctx.clean();
  }
});
it("V2-02 V2-03 AC36: 429 이후 새 전송기에서도 제한을 보존하며 정상 0건을 만들지 않는다", async () => {
  const ctx = testStore();
  try {
    let time = 0;
    const runtime = {
      now: () => time,
      random: () => 0,
      sleep: async (n: number) => {
        time += n;
      },
    };
    const storage = {
      read: (key: string) => ctx.store.setting<any>(key, undefined),
      write: (key: string, state: any) => ctx.store.put("settings", key, state),
    };
    const attempt = vi
      .fn()
      .mockRejectedValue(
        new PublicApiError("제한", "rate_limit", false, 90000),
      );
    const url = new URL("https://example.test/?serviceKey=synthetic-secret");
    await expect(
      createA07Transport(attempt, runtime, storage).request(url),
    ).rejects.toMatchObject({ code: "rate_limit" });
    await expect(
      createA07Transport(attempt, runtime, storage).request(url),
    ).rejects.toMatchObject({ code: "rate_limit" });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.store.all("settings"))).not.toContain(
      "synthetic-secret",
    );
    time += 90000;
    attempt.mockResolvedValue({ ok: true });
    await expect(
      createA07Transport(attempt, runtime, storage).request(url),
    ).resolves.toEqual({ ok: true });
  } finally {
    ctx.clean();
  }
});
it("V2-06 AC37: 저장 중 강제 실패는 원문·checkpoint를 함께 rollback하고 재개 시 중복하지 않는다", () => {
  const ctx = testStore();
  try {
    const j = new CollectionJournal(ctx.store),
      id = j.start("A07", "query");
    expect(() =>
      j.page(id, page(), () => {
        throw Error("crash");
      }),
    ).toThrow();
    expect(
      ctx.store.db.prepare("SELECT count(*) n FROM v2_collection_pages").get(),
    ).toHaveProperty("n", 0);
    j.page(id, page());
    const reopened = new CollectionJournal(ctx.store);
    reopened.page(id, page());
    expect(
      ctx.store.db.prepare("SELECT count(*) n FROM v2_collection_pages").get(),
    ).toHaveProperty("n", 1);
    reopened.cancel(id, true);
    expect(() => reopened.page(id, page(2))).toThrow();
    reopened.cancel(id, false);
    reopened.page(id, page(2));
    expect(ctx.store.get<any>("v2_collection_jobs", id).pages).toEqual([1, 2]);
  } finally {
    ctx.clean();
  }
});
it("V2-09 AC34 AC35: 실패·새 조회 0건은 이전 성공 원문을 보존하고 총건수 변동은 부분으로 남긴다", () => {
  const ctx = testStore();
  try {
    const j = new CollectionJournal(ctx.store),
      a = j.start("A08", "a"),
      b = j.start("A08", "b");
    j.page(a, page());
    j.failure(a, "timeout");
    expect(ctx.store.get<any>("v2_collection_jobs", a)).toMatchObject({
      state: "failed",
      cardinality: "unknown",
      completeness: "partial",
    });
    j.page(b, { page: 1, total: 0, items: [], hasMore: false });
    expect(ctx.store.get<any>("v2_collection_jobs", a).snapshots).toHaveLength(
      1,
    );
    j.page(a, page(2, 21));
    expect(ctx.store.get<any>("v2_collection_jobs", a)).toMatchObject({
      sourceChanged: true,
      completeness: "partial",
    });
  } finally {
    ctx.clean();
  }
});

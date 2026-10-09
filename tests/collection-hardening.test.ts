import { afterEach, it, expect, vi } from "vitest";
import { LawConnector } from "../server/sources.js";
import * as extraction from "../server/extraction.js";
import { evidence, request, testStore } from "./helpers.js";
import { ordinanceScope, jurisdictions } from "../shared/jurisdictions.js";
import { buildLookupPlan, lookupLaw } from "../server/intake.js";
import { searchPublic } from "../server/public-apis.js";
import {
  requestOfficial,
  PublicApiError,
} from "../server/public-api-transport.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { publicServices, type LookupServiceId } from "../shared/public-apis.js";
import { validCas } from "../shared/identifiers.js";
import { newReview, runReview } from "../server/reviews.js";
import { Vault } from "../server/vault.js";
import { ChatGPTAuth } from "../server/auth.js";
const e = evidence({
  kind: "ordinance",
  title: "시험 경기도 조례",
  version: "123",
  effectiveFrom: "2025-01-01",
  verified: false,
});
const raw = JSON.stringify({
  별표: { 별표단위: [{ 별표키: "10" }, { 별표키: "11" }] },
});
const row = (id: string, version = "123") => ({
  별표일련번호: id,
  관련자치법규일련번호: version,
  자치법규시행일자: "20250101",
  관련자치법규명: "<strong>시험</strong> 경기도 조례",
  별표서식파일링크: `/LSW/flDownload.do?flSeq=${id}`,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("첨부 수집 한도 밖 원본을 다음 구간으로 이어서 확보한다", async () => {
  const {store,clean}=testStore();
  try {
    vi.spyOn(extraction,"extractDocument").mockResolvedValue({success:true,markdown:"시험용 별표 원문이며 법적 자료가 아닙니다.",warnings:[]});
    const fetcher=vi.fn(async()=>new Response("synthetic annex"));
    const connector=new LawConnector("synthetic",fetcher);
    const body=JSON.stringify({별표파일링크:Array.from({length:32},(_,i)=>`/LSW/flDownload.do?flSeq=${i+1}`)});
    const item=evidence();
    const first=await connector.attachmentText(body,store,item);
    expect(first.nextOffset).toBe(30);
    const second=await connector.attachmentText(body,store,item,{offset:first.nextOffset!,limit:30});
    expect(second.nextOffset).toBeNull();
    expect(item.attachments?.filter(a=>a.originalRef)).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(32);
  } finally {clean();}
});
it("본문에 링크 없는 별지는 동일 버전·시행일·식별자의 별표 API로 보완한다", async () => {
  const { store, clean } = testStore();
  try {
    vi.spyOn(extraction, "extractDocument").mockResolvedValue({
      success: true,
      markdown: "실제 법령이 아닌 별지 추출 경로를 검증하는 시험 원문입니다.",
      warnings: [],
    });
    const fetcher = vi.fn(async (input: any) =>
      String(input).includes("lawSearch")
        ? Response.json({
            licBylSearch: { totalCnt: "2", ordinbyl: [row("10"), row("11")] },
          })
        : new Response("fake-file"),
    );
    const result = await new LawConnector(
      "fixtureSecret",
      fetcher,
    ).attachmentText(raw, store, e);
    expect(result.count).toBe(2);
    expect(result.failed).toBe(false);
    expect(result.text).toContain("flSeq=10");
    expect(result.text).not.toContain("fixtureSecret");
    expect(e.verified).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  } finally {
    clean();
  }
});
it("다른 버전·다른 시행일·다른 별지의 원본을 가져오지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    const fetcher = vi.fn(async () =>
      Response.json({
        licBylSearch: {
          totalCnt: "3",
          ordinbyl: [
            row("10", "999"),
            { ...row("11"), 자치법규시행일자: "20260101" },
            row("12"),
          ],
        },
      }),
    );
    const result = await new LawConnector(
      "fixtureSecret",
      fetcher,
    ).attachmentText(raw, store, e);
    expect(result.count).toBe(0);
    expect(result.failed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    clean();
  }
});
it("별표 추가 경로 실패 시 원문 승인 없이 미확보 상태를 반환한다", async () => {
  const { store, clean } = testStore();
  try {
    const connector = new LawConnector("fixtureSecret");
    vi.spyOn(connector, "request").mockRejectedValue(new Error("upstream"));
    expect(await connector.attachmentText(raw, store, e)).toMatchObject({
      count: 0,
      failed: true,
      text: "",
    });
  } finally {
    clean();
  }
});
it("도 조례와 선택 도시를 구분하고 다른 시 조례를 제외한다", () => {
  expect(
    jurisdictions["경기도"].municipalities.some((m) => m.name === "화성시"),
  ).toBe(true);
  expect(ordinanceScope("경기도 위험물안전관리 조례", "경기도", "화성시")).toBe(
    "province",
  );
  expect(ordinanceScope("화성시 환경 조례", "경기도", "화성시")).toBe(
    "municipality",
  );
  expect(ordinanceScope("수원시 환경 조례", "경기도", "화성시")).toBe("other");
  expect(ordinanceScope("화성시 환경 조례", "경기도", "")).toBe("other");
  expect(
    ordinanceScope("서울특별시 강남구 환경 조례", "서울특별시", "강남구"),
  ).toBe("municipality");
});
it("지역별 조례 검색은 공식 소관기관 코드로 범위를 지정한다", async () => {
  const req = { ...request(), municipality: "화성시" };
  const plan = buildLookupPlan(req, []);
  const step = plan.steps.find((s) => s.mode === "municipality")!;
  const fetcher = vi.fn(async (u: any) => {
    const url = new URL(String(u));
    expect(url.searchParams.get("org")).toBe("6410000");
    expect(url.searchParams.get("sborg")).toBe(
      jurisdictions["경기도"].municipalities.find((m) => m.name === "화성시")
        ?.org,
    );
    return Response.json({
      OrdinSearch: {
        totalCnt: "2",
        law: [
          { 자치법규명: "화성시 시험 조례" },
          { 자치법규명: "수원시 시험 조례" },
        ],
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await lookupLaw("fixtureSecret", step);
  expect(result.records.map((x) => x.title)).toEqual(["화성시 시험 조례"]);
});
it("32개 서비스 모두 알 수 없는 필터는 네트워크 호출 전에 거부한다", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const c of connectionServices) {
    const original = publicServices.find((s) => s.id === c.id);
    await expect(
      searchPublic(c.id as LookupServiceId, "fixtureSecret", {
        keyword: "71-43-2",
        mode: original ? original.modes[0][0] : "search",
        page: 1,
        filters: { serviceKey: "override" },
      }),
    ).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("네 물질 API는 CAS 검증 숫자가 틀리면 외부 호출하지 않는다", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(validCas("71-43-2")).toBe(true);
  expect(validCas("71-43-3")).toBe(false);
  for (const [id, mode] of [
    ["fire", "cas"],
    ["msds", "1"],
    ["keco", "2"],
    ["ghs", "search"],
  ] as const)
    await expect(
      searchPublic(id, "fixtureSecret", {
        keyword: "71-43-3",
        mode,
        page: 1,
        filters: id === "ghs" ? { searchGubun: "2" } : {},
      }),
    ).rejects.toThrow("CAS");
  expect(fetcher).not.toHaveBeenCalled();
});
it("호출 한도와 인증·기관 장애를 구분하고 반복 요청하거나 인증값을 내보내지 않는다", async () => {
  for (const [status, code] of [
    [429, "rate_limit"],
    [403, "authentication"],
    [503, "upstream"],
  ] as const) {
    const fetcher = vi.fn(
      async () => new Response("serviceKey=fixtureSecret", { status }),
    );
    vi.stubGlobal("fetch", fetcher);
    const err = await requestOfficial(
      new URL("https://apis.data.go.kr/test?serviceKey=fixtureSecret"),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(PublicApiError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain("fixtureSecret");
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("사업장·보유 자료 없이 검토하면 사실을 만들지 않고 추가 질문을 남긴다", async () => {
  const { store, clean } = testStore();
  try {
    const r = newReview({
        ...request(),
        municipality: "",
        documentIds: [],
        answers: {},
      }),
      vault = new Vault(store.dir, true),
      auth = new ChatGPTAuth(store, vault);
    await runReview(store, vault, auth, r);
    expect(r.status).toBe("completed");
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.caseAssessment?.facts.every((f) => f.state === "missing")).toBe(
      true,
    );
    expect(r.issues.some((i) => i.category === "clear_risk")).toBe(false);
  } finally {
    clean();
  }
});

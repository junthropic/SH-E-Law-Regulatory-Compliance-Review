import { it, expect, vi } from "vitest";
import {
  LawConnector,
  normalizeLaw,
  parseBody,
  syncSources,
  annexUrls,
} from "../server/sources.js";
it("별표 파일은 공식 출처 링크만 수집한다", () => {
  expect(
    annexUrls({
      별표파일링크: "https://malicious.test/annex.pdf",
      첨부파일링크: "http://www.law.go.kr/LSW/flDownload.do?flSeq=1",
    }),
  ).toEqual(["https://www.law.go.kr/LSW/flDownload.do?flSeq=1"]);
});
import { testStore, evidence } from "./helpers.js";
import { sha } from "../server/store.js";
it("현행 조례의 조문·부칙·별표를 모두 보관한다", () => {
  const raw = JSON.stringify({
    LawService: {
      자치법규기본정보: {
        자치법규명: "경기도 시험 조례",
        시행일자: "20260101",
        공포일자: "20251201",
      },
      조문: {
        조: {
          조내용:
            "이것은 단위시험의 가상 조문 내용입니다. 별표 1을 함께 확인하세요.",
        },
      },
      부칙: { 내용: "경과조치는 별도 적용합니다." },
      별표: { 별표제목: "가상 별표", 별표파일링크: "/file.hwp" },
    },
  });
  const e = normalizeLaw(
    raw,
    "ordin",
    { 자치법규일련번호: "123", 자치법규ID: "10" },
    "경기도",
  );
  expect(e.text).toContain("경과조치");
  expect(e.text).toContain("가상 별표");
  expect(e.annexesComplete).toBe(false);
  expect(e.verified).toBe(false);
  expect(e.sourceId).toBe("ordin:경기도:10");
  expect(e.hash).toBe(sha(e.text));
});
it.each([
  "",
  "<html>장애 안내</html>",
  "<!DOCTYPE html><html></html>",
  '<!ENTITY x "y">',
])("비정상 응답을 법규로 저장하지 않는다", (s) =>
  expect(() => parseBody(s)).toThrow(),
);
it("목록만 반환된 본문을 거부한다", () =>
  expect(() =>
    normalizeLaw(
      '{"LawService":{"자치법규기본정보":{"자치법규명":"가상"}}}',
      "ordin",
      {},
      "경기도",
    ),
  ).toThrow());
it("0건과 잘못된 목록 응답을 구분한다", async () => {
  const good = new LawConnector(
    "test",
    vi.fn(
      async () =>
        new Response("<OrdinSearch><totalCnt>0</totalCnt></OrdinSearch>"),
    ) as any,
  );
  expect(await good.list("ordin", "시험")).toEqual([]);
  const bad = new LawConnector(
    "test",
    vi.fn(async () => new Response("<Error>invalid OC</Error>")) as any,
  );
  await expect(bad.list("ordin", "시험")).rejects.toThrow();
});
it("페이지 누락·반복 시 전체 수집 성공으로 처리하지 않는다", async () => {
  let page = 0;
  const connector = new LawConnector(
    "test",
    vi.fn(
      async () =>
        new Response(
          ++page === 1
            ? "<OrdinSearch><totalCnt>2</totalCnt><law><자치법규일련번호>1</자치법규일련번호></law></OrdinSearch>"
            : "<OrdinSearch><totalCnt>2</totalCnt></OrdinSearch>",
        ),
    ) as any,
  );
  await expect(connector.list("ordin", "test")).rejects.toThrow("누락");
  page = 0;
  const repeated = new LawConnector(
    "test",
    vi.fn(
      async () =>
        new Response(
          "<OrdinSearch><totalCnt>2</totalCnt><law><자치법규일련번호>1</자치법규일련번호></law></OrdinSearch>",
        ),
    ) as any,
  );
  await expect(repeated.list("ordin", "test")).rejects.toThrow("반복");
});
it("출처 수집 실패는 이전 전문을 지우지 않는다", async () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    store.saveEvidence(e);
    const connector = {
      collect: vi.fn(async () => {
        throw new Error("시험용 장애");
      }),
    } as any;
    const states = await syncSources(
      store,
      "test",
      "경기도",
      undefined,
      connector,
    );
    expect(states.every((s) => s.status === "failed")).toBe(true);
    expect(store.all("evidence")).toHaveLength(1);
  } finally {
    clean();
  }
});

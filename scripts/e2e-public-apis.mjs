import { additionalProbeSpecs } from "../build/server/public-api-probes.js";
import { chromium } from "playwright-core";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store } from "../build/server/store.js";
import {
  additionalServices,
  connectionServices,
  connectionGroups,
} from "../build/shared/connection-catalog.js";

// Synthetic official response shapes; no public network calls or real credentials.
mkdirSync("work", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/public-api-e2e-")));
const originalFetch = globalThis.fetch;
let failSanctionsProbe = false;
globalThis.fetch = async (input) => {
  const url = new URL(input);
  if (failSanctionsProbe && url.pathname.includes("wstdspGrndsInfo"))
    throw new DOMException("synthetic timeout", "TimeoutError");
  assert.ok(["apis.data.go.kr", "business.juso.go.kr"].includes(url.hostname));
  if (url.hostname === "business.juso.go.kr")
    return new Response(
      JSON.stringify({
        results: { common: { errorCode: "0", totalCount: "1" }, juso: [{}] },
      }),
    );
  if (url.pathname.includes("ApiDiciService"))
    return new Response(
      JSON.stringify({
        response: { resultCode: "S00", totalCnt: 1, items: [{}] },
      }),
    );
  if (/opnFsupl/.test(url.pathname))
    return new Response(
      JSON.stringify({
        header: { resultCode: "00", totalCount: "1" },
        data: [{}],
      }),
    );
  if (
    Object.values(additionalProbeSpecs).some(
      (s) => new URL(s.endpoint).pathname === url.pathname,
    )
  )
    return new Response(
      JSON.stringify({
        response: {
          header: { resultCode: "00" },
          body: { totalCount: 1, items: { item: [{}] } },
        },
      }),
    );
  const success = (items) =>
    new Response(
      JSON.stringify({
        header: { resultCode: "00" },
        body: { totalCount: 1, items },
      }),
    );
  const qna = {
    faqNo: "123",
    title: "시험용 위험물 질의응답",
    dutySctnNm: "tqapttn",
  };
  if (url.pathname.endsWith("PolicyQnaList"))
    return new Response(
      JSON.stringify({ resultCode: "S00", resultCount: 1, resultList: [qna] }),
    );
  if (url.pathname.endsWith("PolicyQnaItem"))
    return new Response(
      JSON.stringify({
        resultCode: "S00",
        resultData: {
          ...qna,
          qnaTitl: qna.title,
          qstnCntnCl: "가상 질문",
          ansCntnCl: "시험용 회신. 실제 법률 판단이 아닙니다.",
        },
      }),
    );
  if (url.pathname.endsWith("getMaterialInfo"))
    return success({
      item: { casno: "67-56-1", materialkorname: "시험 메탄올" },
    });
  if (url.pathname.endsWith("getChemList001"))
    return success({ item: { chemId: "0001", chemNameKor: "시험 벤젠" } });
  if (url.pathname.includes("getChemDetail"))
    return success({ item: { itemDetail: "시험 항목", msdsItemCode: "A01" } });
  if (url.pathname.endsWith("smartSearch"))
    return new Response(
      JSON.stringify({
        header: { resultCode: "00" },
        body: {
          totalCount: 1,
          categorycount: { 1: 1 },
          items: { item: { title: "시험 검색 결과", content: "시험 본문" } },
        },
      }),
    );
  if (url.pathname.endsWith("chemSbstnList"))
    return success([
      {
        sbstnId: "0001",
        sbstnNmKor: "시험 화학물질",
        typeList: [{ contInfo: "시험 함량", excpInfo: "시험 예외" }],
      },
    ]);
  if (url.pathname.endsWith("getKoshaGuide"))
    return success({
      item: {
        techGdlnNm: "시험 기술지침",
        fileDownloadUrl: "https://www.kosha.or.kr/test.pdf",
      },
    });
  throw new Error("Unexpected fixture operation");
};
const { app, vault } = await createApp(store, true);
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
const browser = await chromium.launch({
  channel: process.env.SHE_TEST_BROWSER || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.getByRole("heading", { name: "검토할 업무 상황" }).waitFor();
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  await page.getByRole("heading", { name: "공공데이터 API 연결" }).waitFor();
  const rows = page.locator(".public-key-row");
  assert.equal(await rows.count(), 32);
  assert.equal(
    await rows
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .count(),
    0,
  );
  for (let i = 0; i < 6; i++) {
    const row = rows.nth(i);
    await row.locator("input").fill("syntheticFixture123+/=");
    assert.equal(
      await row
        .getByRole("button", { name: "API 연결 체크", exact: true })
        .count(),
      0,
    );
    await row.getByRole("button", { name: "API 키 저장" }).click();
    await row.getByText(/키 저장됨/).waitFor();
    assert.equal(await row.locator("input").inputValue(), "");
    await row
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .click();
    await row.getByText(/키 저장됨.*응답 확인/).waitFor();
  }
  for (const s of additionalServices) {
    const row = page.locator(`[data-service="${s.id}"]`);
    if (s.id === "grievance") {
      await row.locator("input").fill("invalid fixture key");
      await row
        .getByRole("button", { name: "API 키 저장", exact: true })
        .click();
      await row
        .getByRole("alert")
        .filter({ hasText: "일반 인증키를 입력하세요" })
        .waitFor();
      assert.equal(
        await row.locator("input").inputValue(),
        "invalid fixture key",
      );
      assert.equal(await vault.read("public-grievance"), undefined);
    }
    assert.equal(await row.locator("h3 a").getAttribute("href"), s.url);
    assert.equal(
      await row
        .getByRole("button", { name: "API 연결 체크", exact: true })
        .count(),
      0,
    );
    await row.locator("input").fill("additionalFixture123+/=");
    await row.getByRole("button", { name: "API 키 저장" }).click();
    await row.getByText(/키 저장됨.*연결 미검증/).waitFor();
    await row
      .getByRole("status")
      .filter({ hasText: "저장·재읽기 확인 완료" })
      .waitFor();
    assert.equal(await row.locator("input").inputValue(), "");
    await row
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .click();
    await row.getByText(/키 저장됨.*응답 확인/).waitFor();
    await row.getByText(/목록·검색 응답 확인/).waitFor();
    assert.ok(store.setting(`public-api-${s.id}`, {}).checkedAt);
  }
  // Reproduce a failed probe, then hide/show its service with search and category filters.
  const sanctionsRow = page.locator('[data-service="waste-sanctions"]');
  failSanctionsProbe = true;
  await sanctionsRow
    .getByRole("button", { name: "API 연결 체크", exact: true })
    .click();
  await sanctionsRow.getByRole("alert").filter({ hasText: "60초" }).waitFor();
  await page.getByLabel("서비스 찾기", { exact: true }).fill("재해");
  assert.equal(
    await page.locator(".public-api-settings").getByRole("alert").count(),
    0,
  );
  await page.getByLabel("서비스 찾기", { exact: true }).fill("");
  assert.equal(await sanctionsRow.getByRole("alert").count(), 0);
  await sanctionsRow
    .getByRole("button", { name: "API 연결 체크", exact: true })
    .click();
  await sanctionsRow.getByRole("alert").filter({ hasText: "60초" }).waitFor();
  await page.getByLabel("업무 분야", { exact: true }).selectOption("incidents");
  assert.equal(
    await page.locator(".public-api-settings").getByRole("alert").count(),
    0,
  );
  await page.getByLabel("업무 분야", { exact: true }).selectOption("all");
  assert.equal(await sanctionsRow.getByRole("alert").count(), 0);
  failSanctionsProbe = false;
  await sanctionsRow
    .getByRole("button", { name: "API 연결 체크", exact: true })
    .click();
  await sanctionsRow.getByText(/키 저장됨.*응답 확인/).waitFor();
  const qnaRow = page.locator('[data-service="qna"]');
  await qnaRow.locator("input").fill("replacementFixture123");
  page.once("dialog", (dialog) => dialog.dismiss());
  await qnaRow
    .getByRole("button", { name: "API 키 저장", exact: true })
    .click();
  assert.equal(await vault.read("public-qna"), "syntheticFixture123+/=");
  await qnaRow.getByText(/키 저장됨.*응답 확인/).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await qnaRow
    .getByRole("button", { name: "API 키 저장", exact: true })
    .click();
  await qnaRow.getByText(/키 저장됨.*연결 미검증/).waitFor();
  assert.equal(await vault.read("public-qna"), "replacementFixture123");
  await qnaRow
    .getByRole("button", { name: "API 연결 체크", exact: true })
    .click();
  await qnaRow.getByText(/키 저장됨.*응답 확인/).waitFor();
  await qnaRow.locator("input").fill("replacementFixture123");
  page.once("dialog", (dialog) => dialog.accept());
  await qnaRow
    .getByRole("button", { name: "API 키 저장", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "이미 저장된 API 키와 같습니다" })
    .waitFor();
  await qnaRow.getByText(/키 저장됨.*응답 확인/).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  await page.getByText("32개 표시 · 키 등록 32/32개").waitFor();
  assert.equal(
    await rows
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .count(),
    32,
  );
  for (const id of Object.keys(connectionGroups)) {
    await page.getByLabel("업무 분야", { exact: true }).selectOption(id);
    assert.equal(
      await rows.count(),
      connectionServices.filter((s) => s.group === id).length,
    );
  }
  await page.getByLabel("업무 분야", { exact: true }).selectOption("equipment");
  assert.equal(await rows.count(), 6);
  await page.getByLabel("서비스 찾기", { exact: true }).fill("보호구");
  assert.equal(await rows.count(), 2);
  await page.getByLabel("서비스 찾기", { exact: true }).fill("");
  await page.getByLabel("업무 분야", { exact: true }).selectOption("location");
  const addressRow = page.locator('[data-service="address"]');
  await addressRow.getByRole("button", { name: "키 삭제" }).click();
  await addressRow.getByText(/키 미등록.*연결 미검증/).waitFor();
  assert.equal(
    await addressRow
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .count(),
    0,
  );
  await page.screenshot({
    path: "playwright-report/public-api-settings.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "공공자료 조회", exact: true })
    .click();
  await page.getByLabel("검색어", { exact: true }).fill("위험물");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await page.getByRole("button", { name: "내용 확인", exact: true }).click();
  await page
    .getByRole("button", { name: "상세 본문 조회", exact: true })
    .click();
  await page
    .getByText("시험용 회신. 실제 법률 판단이 아닙니다.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "자료함에 저장", exact: true })
    .click();
  await page.getByText(/자료함에 저장했습니다/).waitFor();
  await page.screenshot({
    path: "playwright-report/public-api-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "새 법규 검토", exact: true }).click();
  await page.getByLabel(/qna-시험용 위험물 질의응답.txt/).check();
  await page
    .getByLabel("검토할 업무 상황")
    .fill(
      "시험용 사업장 위험물 저장 관련 검토입니다. 첨부된 공개 회신은 가상 시험자료입니다.",
    );
  await page.getByRole("button", { name: "검토 시작", exact: true }).click();
  await page
    .getByRole("heading", { name: "판단에 필요한 사실·근거 확인" })
    .waitFor();
  assert.equal(await page.locator(".issue.red").count(), 0);
  assert.equal(store.all("reviews")[0].request.documentIds.length, 1);
  assert.equal(store.all("documents")[0].confirmed, false);
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "playwright-report/public-api-mobile.png",
    fullPage: true,
  });
  for (const service of connectionServices) {
    const row = page.locator(`[data-service="${service.id}"]`);
    if (service.id !== "address") {
      await row.getByRole("button", { name: "키 삭제", exact: true }).click();
      await row.getByText(/키 미등록/).waitFor();
    }
    assert.equal(
      await row
        .getByRole("button", { name: "API 연결 체크", exact: true })
        .count(),
      0,
    );
  }
  await page.reload();
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  await page.getByText("32개 표시 · 키 등록 0/32개").waitFor();
  assert.equal(
    await rows
      .getByRole("button", { name: "API 연결 체크", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: all 32 check buttons appear only after saving and disappear after deletion/reload; 32 real-request probe paths with synthetic responses and persisted timestamps, replacement/cancellation, group/search filters, QnA detail/import and review, mobile layout. Synthetic responses only.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await browser.close();
  await app.close();
}

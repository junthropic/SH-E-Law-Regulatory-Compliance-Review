import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store } from "../build/server/store.js";
// Always own the test server and database; never upload fixtures to a user-supplied URL.
delete process.env.LAW_OC;
mkdirSync("work", { recursive: true });
const { app } = await createApp(
  new Store(mkdtempSync(resolve("work/ui-e2e-"))),
  true,
);
let browser;
mkdirSync("playwright-report", { recursive: true });
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const testUrl = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.SHE_TEST_BROWSER || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === testUrl
      ? route.continue()
      : route.abort(),
  );
  await page.goto(testUrl);
  await page.getByRole("heading", { name: "검토할 업무 상황" }).waitFor();
  assert.equal(
    await page.getByText("지정수량 배수 계산", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "공공자료 조회", exact: true })
    .click();
  assert.equal(
    await page.getByText("지정수량 배수 계산", { exact: true }).count(),
    0,
  );
  await page.getByLabel("조회 서비스", { exact: true }).selectOption("fire");
  const calculator = page
    .locator("details")
    .filter({ has: page.getByText("지정수량 배수 계산", { exact: true }) });
  await calculator.waitFor();
  assert.equal(await calculator.evaluate((el) => el.open), false);
  await page.getByLabel("조회 서비스", { exact: true }).selectOption("qna");
  assert.equal(await calculator.count(), 0);
  await page.getByRole("button", { name: "워크스페이스", exact: true }).click();
  await page.screenshot({ path: "playwright-report/home.png", fullPage: true });
  await page
    .getByLabel("검토할 업무 상황")
    .fill(
      "브라우저 시험용 가상 사업장입니다. 인화성 액체 저장장소 추가에 필요한 자료와 검토 항목을 확인합니다. 실제 법률 검토가 아닙니다.",
    );
  await page.getByRole("button", { name: "검토 시작" }).click();
  await page
    .getByRole("heading", { name: "판단에 필요한 사실·근거 확인" })
    .waitFor();
  assert.equal(await page.locator(".issue.red").count(), 0);
  await page.getByRole("button", { name: /검토 기록 1/ }).waitFor();
  await page.screenshot({
    path: "playwright-report/result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /자료함/ }).click();
  await page.locator(".upload-zone input").setInputFiles({
    name: "browser-fixture.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "시험용 회신: 가상 물질 최대 500 L. 실제 해석이 아닙니다.",
    ),
  });
  await page.getByRole("heading", { name: "browser-fixture.txt" }).waitFor();
  await page.getByRole("button", { name: "내용 보기" }).last().click();
  await page.getByLabel("회신·발급 기관").fill("시험용 기관");
  await page.getByRole("button", { name: "문서 정보 저장" }).click();
  await page.getByRole("button", { name: "원본과 대조 완료" }).click();
  await page.getByText("추출문 확인됨", { exact: true }).waitFor();
  await page.getByRole("button", { name: "법규·갱신 현황" }).click();
  assert.equal(await page.locator(".region-card").count(), 18);
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  await page.getByRole("heading", { name: "ChatGPT 구독 연결" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "로컬 앱 종료", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "워크스페이스", exact: true }).click();
  await page.getByRole("heading", { name: "검토할 업무 상황" }).waitFor();
  await page.getByRole("button", { name: "연결 설정", exact: true }).click();
  const notice = page.getByRole("region", {
    name: "정보 처리·외부 전송 및 이용 안내",
    exact: true,
  });
  await notice.waitFor();
  assert.equal(await notice.locator("details").count(), 7);
  assert.equal(await notice.getByRole("checkbox").count(), 0);
  for (const summary of await notice.locator("summary").all())
    await summary.click();
  await notice
    .getByRole("cell", {
      name: "private.sqlite 로컬 데이터베이스",
      exact: true,
    })
    .waitFor();
  await notice
    .getByRole("rowheader", {
      name: "OpenAI / AI 분석 선택 후 실행",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await notice
      .getByRole("link", {
        name: "개인정보 보호법 현행 원문 (새 창)",
        exact: true,
      })
      .getAttribute("href"),
    "https://www.law.go.kr/법령/개인정보보호법",
  );
  await page.screenshot({
    path: "playwright-report/settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "playwright-report/mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: isolated UI review, upload, metadata, confirmation, 18 source cards, workspace navigation, settings without shutdown, information notice, expanded mobile layout; no page errors.",
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await app.close();
  }
}

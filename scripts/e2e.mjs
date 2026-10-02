import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
// Own headless browser, fresh profile, local app only. Never attaches to a user's browser.
const browser = await chromium.launch({
  channel: process.env.SHE_TEST_BROWSER || "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*", (route) =>
  new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue()
    : route.abort(),
);
mkdirSync("playwright-report", { recursive: true });
try {
  await page.goto("http://127.0.0.1:4317/");
  await page
    .getByRole("heading", { name: "어떤 상황을 검토할까요?" })
    .waitFor();
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
  await page.screenshot({
    path: "playwright-report/result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /자료함/ }).click();
  await page
    .locator(".upload-zone input")
    .setInputFiles({
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
    "PASS: UI review, upload, metadata, confirmation, 18 source cards, settings, mobile layout; no page errors.",
  );
} finally {
  await browser.close();
}

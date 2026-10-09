import { chromium } from "playwright-core";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store } from "../build/server/store.js";
import { additionalSearchConfigs } from "../build/shared/additional-search.js";
import { additionalProbeSpecs } from "../build/server/public-api-probes.js";
mkdirSync("work", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/additional-e2e-")));
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (input) => {
  const url = new URL(input);
  calls.push(url);
  const id = Object.keys(additionalProbeSpecs).find(
    (id) =>
      new URL(additionalProbeSpecs[id].endpoint).pathname === url.pathname,
  );
  if (url.pathname.endsWith("selectApiDiciDetail"))
    return new Response(
      JSON.stringify({
        response: {
          resultCode: "S00",
          docMngNo: "123",
          resultCn: "가상 결정례 본문",
        },
      }),
    );
  assert.ok(id, "Unknown endpoint");
  const item = {
    title: "시험 " + id,
    docMngNo: "123",
    boardno: "123",
    filenm: "시험첨부.pdf",
    filepath: "https://example.test/attachment.pdf",
  };
  const data =
    id === "address"
      ? { results: { common: { errorCode: "0", totalCount: 1 }, juso: [item] } }
      : id === "grievance"
        ? { response: { resultCode: "S00", totalCnt: 1, items: [item] } }
        : id.startsWith("fire-")
          ? { header: { resultCode: "00", totalCount: 1 }, data: [item] }
          : {
              response: {
                header: { resultCode: "00" },
                body: { totalCount: 1, items: { item: [item] } },
              },
            };
  return new Response(JSON.stringify(data));
};
const { app, vault } = await createApp(store, true);
for (const id of Object.keys(additionalSearchConfigs))
  await vault.write("public-" + id, "isolatedFixtureKey");
await app.listen({ host: "127.0.0.1", port: 0 });
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
  await page.goto("http://127.0.0.1:" + app.server.address().port);
  await page
    .getByRole("button", { name: "공공자료 조회", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("조회 서비스", { exact: true })
      .locator("option")
      .count(),
    32,
  );
  for (const [id, c] of Object.entries(additionalSearchConfigs)) {
    await page.getByLabel("조회 서비스", { exact: true }).selectOption(id);
    const params = additionalProbeSpecs[id].params;
    await page
      .getByLabel(c.keywordLabel, { exact: true })
      .fill(params[c.keywordParam] ?? "");
    for (const f of c.fields) {
      let value = f.initial ?? params[f.name] ?? "";
      if (f.kind === "date" && /^\d{8}$/.test(value))
        value =
          value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6);
      const input = page.getByLabel(f.label, { exact: true });
      if (f.options) await input.selectOption(value);
      else await input.fill(value);
    }
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await page.locator(".public-result-row").first().waitFor();
    await page
      .getByRole("button", { name: "내용 확인", exact: true })
      .first()
      .click();
    if (id === "grievance") {
      await page
        .getByRole("button", { name: "상세 본문 조회", exact: true })
        .click();
      await page.getByText("가상 결정례 본문", { exact: true }).waitFor();
    }
    if (id === "accidents") {
      await page
        .getByRole("button", { name: "첨부파일 목록 조회", exact: true })
        .click();
      await page
        .getByText(
          "첨부파일 목록의 첫 페이지를 조회했습니다. 파일 본문은 별도 확인해야 합니다.",
          { exact: true },
        )
        .waitFor();
    }
    await page
      .getByRole("button", { name: "자료함에 저장", exact: true })
      .click();
    await page
      .getByText(
        "자료함에 저장했습니다. 원문을 대조한 뒤 새 법규 검토에서 이 자료를 선택하세요.",
        { exact: true },
      )
      .waitFor();
  }
  assert.equal(store.all("documents").length, 26);
  assert.equal(store.all("evidence").length, 0);
  assert.deepEqual(errors, []);
  await page
    .getByLabel("조회 서비스", { exact: true })
    .selectOption("fire-approval");
  await page.screenshot({
    path: "playwright-report/additional-search-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
  );
  await page.screenshot({
    path: "playwright-report/additional-search-mobile.png",
    fullPage: true,
  });
  console.log(
    "PASS: 26 search forms, official request paths, grievance detail, accident attachments, 26 provenance imports, 32 services, mobile layout; isolated synthetic data.",
  );
} finally {
  await browser.close();
  await app.close();
  globalThis.fetch = originalFetch;
}

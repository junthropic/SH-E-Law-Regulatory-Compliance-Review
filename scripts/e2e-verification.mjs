import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store, sha } from "../build/server/store.js";
import { newReview, runReview } from "../build/server/reviews.js";
import { ReviewRequestSchema } from "../build/shared/types.js";
import { koreaDate } from "../build/shared/dates.js";

delete process.env.LAW_OC;
mkdirSync("work", { recursive: true });
mkdirSync("playwright-report", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/verification-e2e-")));
// Synthetic legal texts only; the test never touches the production store.
for (const [i, text] of [
  "시험 원문: 「시험상위법률」 제1조 및 「미확보시험규칙」에 따른다.\n부칙 제2조 다만 기존 시설에는 시험 예외를 적용한다.\n별표 1의 표·수치를 확인하고 조례로 정한다.",
  "시험상위법률 제1조 이 문서는 실제 법령이 아닌 브라우저 시험용 원문입니다.",
].entries()) {
  store.saveEvidence({
    id: randomUUID(),
    sourceId: `fixture-${i}`,
    kind: i ? "law" : "ordinance",
    title: i ? "시험상위법률" : "시험 경기도 조례",
    region: i ? "전국" : "경기도",
    article: "시험 전문",
    text,
    url: "https://www.law.go.kr/",
    version: "fixture-1",
    effectiveFrom: "2025-01-01",
    promulgatedAt: "2024-12-01",
    fetchedAt: new Date().toISOString(),
    hash: sha(text),
    complete: true,
    annexesComplete: false,
    historyComplete: false,
    verified: false,
    verificationNote: "Synthetic fixture",
    links: [],
  });
}
const { app, vault, auth } = await createApp(store, true);
const review = newReview(
  ReviewRequestSchema.parse({
    prompt: "시험용 사업장의 위험물 관련 근거 연결을 확인합니다.",
    region: "경기도",
    municipality: "시험시",
    asOf: koreaDate(),
    useAi: false,
  }),
);
await runReview(store, vault, auth, review);
assert.equal(review.status, "completed");
let browser;
const originalFetch = globalThis.fetch;
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${app.server.address().port}`;
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
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base);
  await page.getByRole("button", { name: /검토 기록 1/ }).click();
  await page.locator(".history-row").first().click();
  const panel = page.getByRole("region", { name: "근거별 검증", exact: true });
  await panel.waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "시험 경기도 조례" })
    .click();
  await panel
    .getByRole("button", {
      name: "원문 수집·재검토 — 미확보시험규칙",
      exact: true,
    })
    .waitFor();
  await panel
    .getByRole("button", { name: "시험상위법률 원문 보기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "시험상위법률", exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  assert.equal(await panel.locator(".basis-passage").count(), 4);
  assert.equal(await page.locator(".issue.red").count(), 0);
  await panel.screenshot({
    path: "playwright-report/verification-desktop.png",
  });
  await page.reload();
  await page.getByRole("button", { name: /검토 기록 1/ }).click();
  await page.locator(".history-row").first().click();
  await panel.waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "시험 경기도 조례" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await panel.screenshot({ path: "playwright-report/verification-mobile.png" });
  for (const s of store.sources())
    store.put("sources", s.id, {
      ...s,
      status: "ok",
      count: 1,
      lastSuccessAt: new Date().toISOString(),
    });
  await vault.write("law", { lawOc: "synthetic-only" });
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.hostname !== "www.law.go.kr")
      throw new Error("Unexpected external request in reference test");
    if (u.pathname.endsWith("lawSearch.do"))
      return Response.json({
        LawSearch: {
          totalCnt: 1,
          law: [
            {
              법령명한글: "미확보시험규칙",
              법령일련번호: "123",
              법령ID: "1",
              시행일자: "20250101",
              공포일자: "20241201",
            },
          ],
        },
      });
    return Response.json({
      법령: {
        기본정보: {
          법령명_한글: "미확보시험규칙",
          법령ID: "1",
          시행일자: "20250101",
        },
        조문: {
          조문내용:
            "제1조 이 문서는 연결 원문 수집·검토 흐름의 시험용 가상 규칙입니다.",
        },
      },
    });
  };
  await panel
    .getByRole("button", {
      name: "원문 수집·재검토 — 미확보시험규칙",
      exact: true,
    })
    .click();
  await page
    .getByRole("region", { name: "연결 원문 수집 결과", exact: true })
    .getByText(
      "제목·기준일 원문 후보를 확보했습니다. 별표·공보·예외 적용은 별도 대조 대상입니다.",
      { exact: true },
    )
    .waitFor();
  await panel.waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "시험 경기도 조례" })
    .click();
  await panel
    .getByRole("button", { name: "미확보시험규칙 원문 보기", exact: true })
    .waitFor();
  assert.equal(
    await panel
      .getByRole("button", {
        name: "원문 수집·재검토 — 미확보시험규칙",
        exact: true,
      })
      .count(),
    0,
  );
  assert.equal(store.all("reviews").length, 2);
  assert.equal(store.review(review.id).request.linkedEvidenceIds, undefined);
  assert.equal(
    store.all("reviews").find((r) => r.id !== review.id).request.useAi,
    false,
  );
  await page
    .getByRole("button", { name: "이전 검토 보기", exact: true })
    .click();
  await panel
    .locator("summary")
    .filter({ hasText: "시험 경기도 조례" })
    .click();
  await panel
    .getByRole("button", {
      name: "원문 수집·재검토 — 미확보시험규칙",
      exact: true,
    })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: verification, missing-reference collection → new review, linked original, prior review preserved, no AI without consent, reload and mobile; isolated synthetic data.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close();
  await app.close();
}

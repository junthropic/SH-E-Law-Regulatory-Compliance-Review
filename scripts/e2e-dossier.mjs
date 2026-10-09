import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store, sha } from "../build/server/store.js";
import { newReview, runReview } from "../build/server/reviews.js";
import { ReviewRequestSchema } from "../build/shared/types.js";
import { ingestDocument } from "../build/server/documents.js";
import { koreaDate } from "../build/shared/dates.js";

delete process.env.LAW_OC;
mkdirSync("work", { recursive: true });
mkdirSync("playwright-report", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/dossier-e2e-")));
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
    municipality: "화성시",
    asOf: koreaDate(),
    useAi: false,
  }),
);
await runReview(store, vault, auth, review);
assert.equal(review.status, "completed");

const selected = review.evidence.find((e) => e.kind === "ordinance");
const doc = await ingestDocument(
  store,
  "시험용공보.txt",
  Buffer.from(selected.text.replace("기존 시설", "신규 시설")),
);
let browser;
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.SHE_TEST_BROWSER || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1080 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base);
  await page.getByRole("button", { name: /검토 기록 1/ }).click();
  await page.locator(".history-row").first().click();
  const panel = page.getByRole("region", {
    name: "원본 대조와 사업장 적용 검토",
    exact: true,
  });
  await panel.waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "공보·별표·부칙 원본 대조" })
    .click();
  await panel
    .getByRole("combobox", { name: /^대조할 법령·조례/ })
    .selectOption(selected.id);
  await panel
    .getByRole("combobox", { name: /^대조 자료/ })
    .selectOption(doc.id);
  await panel
    .getByRole("button", { name: "자료 추출문 보기", exact: true })
    .click();
  await panel.getByLabel("법령 대조 발췌", { exact: true }).fill(selected.text);
  await panel.getByLabel("공보·별표 대조 발췌", { exact: true }).fill(doc.text);
  await panel
    .getByRole("button", { name: "선택 범위 대조·저장", exact: true })
    .click();
  await panel
    .locator("summary")
    .filter({ hasText: "대조 결과와 검토자 확인 기록 (1)" })
    .waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "대조 결과와 검토자 확인 기록 (1)" })
    .click();
  await panel
    .getByText("선택 범위 문구 · 차이 있음", { exact: true })
    .waitFor();
  await panel.getByLabel("검토자 이름", { exact: true }).fill("시험 검토자");
  await panel
    .getByLabel("검토 근거·차이 해석·유의사항", { exact: true })
    .fill(
      "시험용 가상 자료의 선택 범위에서 기존과 신규의 차이를 확인했습니다. 실제 법률 승인이 아닙니다.",
    );
  await panel
    .getByLabel("원본의 선택 범위·표·수치·날짜를 직접 확인했습니다.", {
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", {
      name: "아래 검토자 정보로 원본 대조 기록",
      exact: true,
    })
    .click();
  await panel.getByText(/검토자 기록: 시험 검토자/).waitFor();
  await panel
    .locator("summary")
    .filter({ hasText: "사업장 사실과 조항·예외 연결" })
    .click();
  const condition = store
    .review(review.id)
    .verification.basis.flatMap((b) => b.passages)
    .find((p) => p.kind === "exception");
  const choices = await panel
    .getByRole("combobox", { name: /^적용 조건 후보/ })
    .locator("option")
    .allTextContents();
  const cIndex = choices.findIndex((x) =>
    x.includes(condition.quote.slice(0, 55)),
  );
  await panel
    .getByRole("combobox", { name: /^적용 조건 후보/ })
    .selectOption({ index: cIndex });
  await panel
    .getByRole("combobox", { name: /^검토자 판단/ })
    .locator('option[value="applies"][disabled]')
    .waitFor({ state: "attached" });
  await panel
    .getByRole("button", { name: "아래 검토자 정보로 판단 기록", exact: true })
    .click();
  await panel.getByText(/^판단 보류 · 시험 검토자/).waitFor();
  const packetUrl = await panel
    .getByRole("link", { name: "검토자 인계 자료 다운로드" })
    .getAttribute("href");
  const packetResponse = await page.request.get(base + packetUrl);
  assert.equal(packetResponse.status(), 200);
  assert.match(packetResponse.headers()["content-disposition"], /attachment/);
  const packet = await packetResponse.json();
  assert.equal(packet.approvalTemplate.exceptionsChecked, false);
  await panel.screenshot({ path: "playwright-report/dossier-desktop.png" });
  const answers = {
    material: "시험용 물질",
    concentration: "시험 농도 99%",
    quantity: "200 L",
    facility: "시험 실내 독립 저장실",
    activity: "시험 저장",
    permit: "시험 허가서 확인됨",
    dates: "2026-10-08 설치 예정",
  };
  for (const q of store.review(review.id).questions)
    await page
      .getByLabel(q.label, { exact: true })
      .fill(answers[q.key] || "시험 사실");
  await page.getByRole("button", { name: "답변 반영하여 재검토" }).click();
  await page.waitForFunction(
    () =>
      !!document.querySelector('[aria-label="원본 대조와 사업장 적용 검토"]'),
  );
  await page.waitForTimeout(1000);
  const latest = store.all("reviews").find((r) => r.id !== review.id);
  assert.equal(latest.status, "completed");
  assert.deepEqual(latest.questions.map(q => q.key), ["dates"]);
  assert.equal(latest.caseAssessment.facts.find(f => f.key === "dates").state, "missing");
  assert.equal(latest.comparisons.length, 1);
  assert.equal(
    latest.issues.some((i) => i.category === "clear_risk"),
    false,
  );
  assert.equal(store.review(review.id).caseAssessment.decisions.length, 1);
  assert.equal(latest.caseAssessment.decisions.length, 0);
  await page.reload();
  await page.getByRole("button", { name: /검토 기록 2/ }).click();
  await page.locator(".history-row").first().click();
  await panel.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await panel.screenshot({ path: "playwright-report/dossier-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: synthetic Hwaseong case, original comparison, differences, reviewer record, missing-fact hold, follow-up answers, new review preserving comparison, packet, reload and mobile. No production data or real approvals used.",
  );
} finally {
  await browser?.close();
  await app.close();
  store.close();
}

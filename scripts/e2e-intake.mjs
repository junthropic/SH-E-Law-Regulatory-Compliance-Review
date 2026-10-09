import { PayloadProvenance } from "../build/server/provenance-v4.js";
import { chromium } from "playwright-core";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store } from "../build/server/store.js";

// Isolated database and synthetic agency replies; never uses production keys.
delete process.env.LAW_OC;
mkdirSync("work", { recursive: true });
mkdirSync("playwright-report", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/intake-e2e-")));
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (input) => {
  const u = new URL(input);
  assert.equal(u.hostname, "apis.data.go.kr");
  calls.push(u.pathname);
  const success = (items) =>
    new Response(
      JSON.stringify({
        header: { resultCode: "00" },
        body: { totalCount: 1, items },
      }),
    );
  if (u.pathname.endsWith("ghsList"))
    return success({ item: { casNo: "67-56-1", sbstnNmKor: "가상 메탄올" } });
  if (u.pathname.endsWith("getdisaster_api02"))
    return success({
      item: {
        boardno: "123",
        keyword: "가상 위험물 사고",
        contents: "가상 사고 본문",
      },
    });
  if (u.pathname.endsWith("selectApiDiciList"))
    return new Response(
      JSON.stringify({
        response: {
          resultCode: "S00",
          totalCnt: 1,
          items: [{ docMngNo: "123", bllNm: "가상 결정례" }],
        },
      }),
    );
  if (u.pathname.endsWith("selectApiDiciDetail"))
    return new Response(
      JSON.stringify({
        response: {
          resultCode: "S00",
          docMngNo: "123",
          resultCn: "가상 결정례 본문",
        },
      }),
    );
  if (u.pathname.endsWith("PolicyQnaList"))
    return new Response(
      JSON.stringify({
        resultCode: "S00",
        resultCount: 1,
        resultList: [
          { faqNo: "123", title: "가상 회신", dutySctnNm: "tqapttn" },
        ],
      }),
    );
  if (u.pathname.endsWith("PolicyQnaItem"))
    return new Response(
      JSON.stringify({
        resultCode: "S00",
        resultData: {
          faqNo: "123",
          qnaTitl: "가상 회신",
          qstnCntnCl: "가상 질문",
          ansCntnCl: "가상 본문. 실제 법률 판단에 사용하지 않습니다.",
        },
      }),
    );
  if (u.pathname.endsWith("getMaterialInfo"))
    return success({
      item: { casno: "67-56-1", materialkorname: "가상 메탄올" },
    });
  if (u.pathname.endsWith("getChemList001"))
    return success({
      item: { chemId: "0001", chemNameKor: "가상 메탄올", casNo: "67-56-1" },
    });
  if (u.pathname.includes("getChemDetail"))
    return success({
      item: { itemDetail: "가상 MSDS 항목", msdsItemCode: "A01" },
    });
  if (u.pathname.endsWith("smartSearch"))
    return new Response(
      JSON.stringify({
        header: { resultCode: "00" },
        body: {
          totalCount: 1,
          categorycount: { 1: 1 },
          items: { item: { title: "가상 법령 검색", content: "가상 내용" } },
        },
      }),
    );
  // Deliberate upstream outage: the rest of the flow must still complete.
  if (u.pathname.endsWith("chemSbstnList"))
    return new Response("unavailable", { status: 503 });
  if (u.pathname.endsWith("getKoshaGuide"))
    return success({
      item: {
        techGdlnNm: "가상 지침",
        fileDownloadUrl: "https://www.kosha.or.kr/test.pdf",
      },
    });
  throw new Error("Unexpected fixture operation");
};
// Host-provisioned synthetic egress scope. All provider responses below remain mocked.
const principal = {id:"synthetic-intake",tenant:"synthetic-intake",synthetic:true,roles:["writer"]};
const gate = new PayloadProvenance(store);
const parent = gate.input(principal,"Synthetic intake scenario: methanol CAS 67-56-1, no real site data");
for (const provider of ["law","ordinance","qna","fire","msds","smart","keco","guide","grievance","ghs","accidents","accident-files","sif","chemical-accidents","waste-companies","waste-sanctions","environment-agencies","measurement-agencies","land-use","address","ppe-cert","machine-cert","guard-cert","ppe-declaration","machine-declaration","guard-declaration","fire-approval","fire-revocation","air-facilities","water-other","dust-business","gas-business","specific-gas","waste-fitness"])
  gate.event({...principal,roles:["egress_reviewer"]},parent,"query",provider,"release","합성 E2E 입력에 한정한 모의 전송 해제입니다.","2099-01-01T00:00:00Z");
const { app, vault } = await createApp(store, true, undefined, undefined,()=>({gate,principal,parents:[parent]}));
for (const id of [
  "qna",
  "fire",
  "msds",
  "smart",
  "keco",
  "guide",
  "ghs",
  "grievance",
  "accidents",
])
  await vault.write("public-" + id, "syntheticFixtureOnly");
await app.listen({ port: 0, host: "127.0.0.1" });
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
  await page.goto(`http://127.0.0.1:${app.server.address().port}/`);
  await page.getByRole("heading", { name: "검토할 업무 상황" }).waitFor();
  await page.getByLabel("시·군·구", { exact: true }).fill("화성시");
  await page
    .getByRole("combobox", { name: /^소재 시·도/ })
    .selectOption({ label: "서울특별시" });
  assert.equal(
    await page.getByLabel("시·군·구", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.locator('#review-municipalities option[value="강남구"]').count(),
    1,
  );
  assert.equal(
    await page.locator('#review-municipalities option[value="화성시"]').count(),
    0,
  );
  await page
    .getByRole("combobox", { name: /^소재 시·도/ })
    .selectOption({ label: "경기도" });
  assert.equal(
    await page.locator('#review-municipalities option[value="화성시"]').count(),
    1,
  );

  await page
    .getByLabel("검토할 업무 상황")
    .fill(
      "가상 시험: 경기도 화성시 공장에 메탄올(CAS 67-56-1) 99% 500 L 저장공간을 신설합니다. 허가 여부는 미확인입니다.",
    );
  await page.getByLabel("시·군·구", { exact: true }).fill("화성시");
  // The user removed the extraction controls. Verify their absence; exercise
  // the retained backend through the browser's authenticated session instead.
  assert.equal(
    await page
      .getByRole("button", { name: "1. 질문에서 사실 추출", exact: true })
      .count(),
    0,
  );
  const csrf = await page.evaluate(
    async () => (await (await fetch("/api/bootstrap")).json()).csrf,
  );
  const api = (url, body) =>
    page.evaluate(
      async ({ url, body, csrf }) => {
        const response = await fetch(
          url,
          body === undefined
            ? {}
            : {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-csrf-token": csrf,
                },
                body: JSON.stringify(body),
              },
        );
        return { status: response.status, body: await response.json() };
      },
      { url, body, csrf },
    );
  const request = {
    prompt: await page.getByLabel("검토할 업무 상황").inputValue(),
    region: "경기도",
    municipality: "화성시",
    asOf: "2026-10-08",
    documentIds: [],
    answers: {},
    useAi: false,
    model: "",
  };
  const draft = (await api("/api/intake", request)).body;
  assert.equal(draft.facts.find((f) => f.key === "cas").value, "67-56-1");
  assert.equal(draft.facts.find((f) => f.key === "cas").confirmed, false);
  const planned = (
    await api(`/api/intake/${draft.id}/plan`, {
      facts: draft.facts.map((f) => ({
        ...f,
        confirmed: ["cas", "material"].includes(f.key),
      })),
    })
  ).body;
  assert.equal(planned.steps.length, 21);
  assert.equal(
    (await api(`/api/intake/${planned.id}/execute`, { consent: false })).status,
    400,
  );
  assert.equal(
    (await api(`/api/intake/${planned.id}/execute`, { consent: true })).status,
    202,
  );
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/intake/${id}`)).json()).status === "completed",
    planned.id,
    { timeout: 60000 },
  );
  const completed = store
    .all("settings")
    .find((d) => d?.status === "completed" && d?.binding);
  assert(completed);
  for (const id of ["ghs", "grievance", "accidents"])
    assert.equal(completed.steps.find((s) => s.service === id).status, "ok");
  assert.equal(
    completed.steps.find((s) => s.service === "ghs").records[0].fields.casNo,
    "67-56-1",
  );
  assert.equal(
    completed.steps.find((s) => s.service === "grievance").records[0].level,
    "detail",
  );
  assert.equal(
    completed.steps.find((s) => s.service === "keco").status,
    "failed",
  );
  assert.equal(completed.steps.find((s) => s.service === "guide").status, "ok");
  assert.equal(
    completed.steps.find((s) => s.service === "law").status,
    "skipped",
  );
  assert.equal(calls.filter((p) => p.includes("getChemDetail")).length, 16);
  assert(calls.some((p) => p.endsWith("PolicyQnaItem")));
  assert.equal(store.document(completed.reportId).confirmed, false);
  await page.screenshot({
    path: "playwright-report/intake-desktop.png",
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
    path: "playwright-report/intake-mobile.png",
    fullPage: true,
  });
  const created = await api("/api/reviews", {
    ...request,
    intakeId: planned.id,
  });
  assert.equal(created.status, 202);
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/reviews/${id}`)).json()).status === "completed",
    created.body.id,
    { timeout: 60000 },
  );
  const review = store.all("reviews")[0];
  assert(review.request.documentIds.includes(completed.reportId));
  assert.equal(review.request.answers.cas, "67-56-1");
  assert.equal(review.request.answers.permit, undefined);
  assert(review.issues.every((i) => i.category !== "clear_risk"));
  assert.equal(
    (
      await api("/api/reviews", {
        ...request,
        municipality: "수원시",
        intakeId: planned.id,
      })
    ).status,
    400,
  );
  await page.reload();
  await page.getByRole("button", { name: "새 법규 검토", exact: true }).click();
  assert.equal(await page.locator(".composer .attachments").count(), 0);
  assert.equal(
    await page.getByText("ChatGPT로 법규 해석하기", { exact: true }).count(),
    0,
  );
  if (!(await page.locator(".ai-settings").evaluate((el) => el.open)))
    await page.locator(".ai-settings summary").click();
  await page
    .getByLabel("질문·선택 자료의 전송에 동의하고 AI 분석 사용")
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "1. 질문에서 사실 추출", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: existing UI preserves removed controls; authenticated browser API verifies extraction, consent, partial retrieval, saved report, attached review, stale region rejection; synthetic fixtures only.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await browser.close();
  await app.close();
}

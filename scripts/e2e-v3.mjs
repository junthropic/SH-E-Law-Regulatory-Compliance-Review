import { chromium } from "playwright-core";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store, sha } from "../build/server/store.js";
import { EgressGate, queryDigest } from "../build/server/egress-v3.js";
delete process.env.LAW_OC;
mkdirSync("work", { recursive: true });
mkdirSync("playwright-report", { recursive: true });
const store = new Store(mkdtempSync(resolve("work/v3-browser-")));
const principal = {
  id: "synthetic-browser-author",
  tenant: "synthetic-browser-site",
  synthetic: true,
  roles: ["writer"],
  validFrom: "2020-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
};
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async (input) => {
  const url = new URL(input);
  assert.equal(url.hostname, "apis.data.go.kr");
  externalCalls++;
  if (url.pathname.endsWith("PolicyQnaList")) {
    await new Promise((r) => setTimeout(r, 550));
    return new Response(
      JSON.stringify({
        resultCode: "S00",
        resultCount: 1,
        resultList: [
          { faqNo: "v3", title: "가상 관리자 회신", dutySctnNm: "tqapttn" },
        ],
      }),
    );
  }
  if (url.pathname.endsWith("PolicyQnaItem"))
    return new Response(
      JSON.stringify({
        resultCode: "S00",
        resultData: {
          faqNo: "v3",
          qnaTitl: "가상 관리자 회신",
          dutySctnNm: "tqapttn",
          ansCntnCl: "가상 응답입니다. 현재 사업장에 자동 적용할 수 없습니다.",
        },
      }),
    );
  throw Error("Unexpected provider path");
};
const { app, vault } = await createApp(
  store,
  true,
  new Map([[sha("synthetic-browser-token"), principal]]),
  { principal, mode: "project", collect: true },
);
await vault.write("public-qna", "synthetic-key");
new EgressGate(store).decide(
  { ...principal, roles: ["egress_reviewer"] },
  queryDigest("qna", { keyword: "위험물", mode: "1", page: 1, filters: {} }),
  "query",
  "qna",
  true,
  "가상 공개 검색어만 제공하도록 모의 검토했습니다.",
  principal.expiresAt,
);
let browser;
const checkpoints = [];
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.SHE_TEST_BROWSER || "chrome",
    headless: true,
  });
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) =>
    new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
  );
  await page.goto(base);
  await page.getByRole("button", { name: /자료함/ }).click();
  await page.locator(".upload-zone input").setInputFiles({
    name: "v3-synthetic.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "가상 사례: 관리자 퇴직과 점검 실시 기록. 후임 신고·제출 증빙은 미확인입니다.",
    ),
  });
  await page.getByRole("heading", { name: "v3-synthetic.txt" }).waitFor();
  await page.getByRole("button", { name: "워크스페이스", exact: true }).click();
  await page.getByLabel(/v3-synthetic.txt/).check();
  await page
    .getByLabel("검토할 업무 상황")
    .fill(
      "가상 사례입니다. 위험물 안전관리자가 2026년 9월 1일 퇴직했고 후임 선임·신고·대리자의 증빙은 확인되지 않았습니다.",
    );
  await page.getByRole("button", { name: "검토 시작", exact: true }).click();
  await page
    .getByRole("heading", { name: "안전관리자 재선임", exact: true })
    .waitFor();
  const review = store.all("reviews")[0],
    trace = await page.evaluate(async (id) => {
      const r = await fetch(`/api/management-v3/reviews/${id}/trace`, {
        headers: { Authorization: "Bearer synthetic-browser-token" },
      });
      return { status: r.status, data: await r.json() };
    }, review.id);
  assert.equal(trace.status, 200);
  assert.equal(trace.data.rows.length, 6);
  assert.equal(
    review.issues.filter((x) => x.category === "clear_risk").length,
    0,
  );
  checkpoints.push("S1 browser upload→question→v2 trace→six independent holds");
  await page.screenshot({
    path: "playwright-report/v3-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "공공자료 조회", exact: true })
    .click();
  await page.getByLabel("검색어", { exact: true }).fill("위험물");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await page.getByText(/자료 조회가 진행 중/).waitFor();
  for (let n = 0; n < 50; n++) {
    const rows = store.db.prepare("SELECT state FROM v3_jobs").all();
    if (rows.some((x) => x.state === "succeeded")) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await page.getByRole("button", { name: "내용 확인", exact: true }).waitFor();
  assert.equal(externalCalls, 2);
  checkpoints.push(
    "façade delayed legacy error→background real worker→cached existing schema/browser result",
  );
  await page.getByRole("button", { name: "워크스페이스", exact: true }).click();
  await page
    .getByLabel("검토할 업무 상황")
    .fill(
      "가상 점검 사례입니다. 2021년 10월 20일 점검했으나 점검결과 제출 자료가 없습니다. 미점검으로 판단해서는 안 됩니다.",
    );
  await page.getByRole("button", { name: "검토 시작", exact: true }).click();
  await page
    .getByRole("heading", { name: "안전관리자 재선임", exact: true })
    .waitFor();
  assert.equal(store.all("reviews").length, 2);
  assert.equal(
    store
      .all("reviews")
      .flatMap((r) => r.issues)
      .some((i) => i.category === "clear_risk"),
    false,
  );
  checkpoints.push(
    "S3 browser check-completion/submission separated, unknowns retained",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    "playwright-report/v3-checkpoints.json",
    JSON.stringify(
      {
        scope:
          "synthetic only; external provider mocked, internal app/DB/auth/worker real",
        checkpoints,
        externalCalls,
        uiChanged: false,
        productionTouched: false,
      },
      null,
      2,
    ),
  );
  console.log("PASS: " + checkpoints.join("; "));
} finally {
  await browser?.close();
  await app.close();
  globalThis.fetch = originalFetch;
}

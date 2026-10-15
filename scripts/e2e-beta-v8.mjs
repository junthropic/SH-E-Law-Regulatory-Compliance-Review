// v8 stage 3 browser check of the /beta/ screens with synthetic data. Own temporary database, frozen clock,
// browser requests outside the test origin aborted and counted, server-side network answered synthetically.
// Usage: node scripts/e2e-beta-v8.mjs [screenshot dir]
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const shots = resolve(process.argv[2] || "playwright-report/beta-v8");
mkdirSync(shots, { recursive: true });
for (const k of Object.keys(process.env)) if (/^(LAW_OC|DATA_GO_KR|JUSO|OPENAI)/.test(k)) delete process.env[k];
const serverCalls = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  serverCalls.push(u.host);
  if (u.host === "www.law.go.kr") return new Response("<?xml version=\"1.0\"?><LawSearch><totalCnt>7</totalCnt></LawSearch>", { status: 200 });
  return new Response("synthetic refusal", { status: 403 });
};
const FIXED = Date.parse("2026-10-13T01:00:00Z"), RealDate = Date;
function FixedDate(...a) {
  if (!new.target) return new RealDate(FIXED).toString();
  return Reflect.construct(RealDate, a.length ? a : [FIXED], new.target);
}
FixedDate.prototype = RealDate.prototype;
Object.setPrototypeOf(FixedDate, RealDate);
FixedDate.now = () => FIXED;
globalThis.Date = FixedDate;
const { createApp } = await import("../build/server/app.js");
const { Store } = await import("../build/server/store.js");
const { setAiSendGate, aiSendGate } = await import("../build/server/ai-consent-v8.js");

const dir = mkdtempSync(join(tmpdir(), "she-beta-e2e-"));
const store = new Store(dir);
store.put("settings", "preview.safetyManagerV7", true);
const { app, aiConsent } = await createApp(store, true);
let browser;
const outside = [], errors = [];
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ channel: process.env.SHE_TEST_BROWSER || "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && /Content Security Policy|Refused/.test(m.text()) && errors.push(m.text()));
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (new URL(u).origin === origin) return route.continue();
    outside.push(new URL(u).host);
    return route.abort();
  });
  await page.clock.setFixedTime(new RealDate(FIXED));
  const shot = (name) => page.screenshot({ path: join(shots, name + ".png"), fullPage: true, animations: "disabled", caret: "hide" });

  // 1. New review with an uploaded synthetic document; the preview switch is on.
  await page.goto(origin + "/beta/");
  await page.getByText("본 프로그램은 SH&E 관련 법률조회에 해당하는 기능만 법제처·공공데이터포털·도로명주소 검색 API를 통해 필요한 자료만 조회할 수 있게끔 도와주는 프로그램입니다. 별도의 법률검토는 법무법인 및 변호사와 직접 상의바랍니다.").first().waitFor();
  await page.getByLabel("검토할 업무 상황").fill("가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다. 상시근로자 120명 제조업(합성)");
  await page.getByLabel("시·군·구").fill("시험시");
  await page.locator('input[type="file"]').setInputFiles({ name: "synthetic-roster.txt", mimeType: "text/plain", buffer: Buffer.from("가상 사업장 상시근로자 120명, 안전관리자 1명 선임 기록(합성)") });
  await page.getByText("synthetic-roster.txt").waitFor();
  await shot("01-new-review");
  await page.getByRole("button", { name: "검토 시작" }).click();
  await page.getByRole("heading", { name: "판정 후보" }).waitFor({ timeout: 20000 });
  const body = await page.locator("main").innerText();
  // Redesign: the label shows once in the notice band and once per card as a tag; the basis is its own block.
  assert.equal(await page.locator(".beta-h1-note strong").first().innerText(), "검토 후보 — 법적 판단 아님, 베타");
  const cards = page.locator("article.beta-issue");
  assert.ok((await cards.count()) > 0);
  assert.equal(await page.locator("article.beta-issue .beta-tag").count(), await cards.count());
  assert.match(await cards.first().locator(".beta-basis").innerText(), /법률 기준일\s+2026-10-08/);
  assert.match(await cards.first().locator(".beta-basis").innerText(), /근거 조문\s+산업안전보건법/);
  assert.doesNotMatch(body, /\[검토 후보 — 법적 판단 아님, 베타\]/); // prefix shown by the tag, not repeated
  assert.doesNotMatch(body, /위반 가능성/);
  assert.doesNotMatch(body, /기술 정보/); // 9-2-8 removed from the screen (2026-10-15 user design); exports unchanged
  // Exports are unchanged: the label prefix and the plain condition lines are still in the file.
  const exported = await (await page.request.get(`${origin}/api/reviews/${page.url().split("/").pop()}/export?format=md`)).text();
  assert.match(exported, /\[검토 후보 — 법적 판단 아님, 베타\]/);
  assert.match(exported, /근거 조문: 산업안전보건법/);
  await shot("02-candidates");

  // 2. Self review: labelled, not independent. The result shows one part at a time, picked from the left list.
  await page.getByRole("button", { name: "자가 검토", exact: true }).click();
  for (const label of ["입력한 사실과 자료를 다시 확인했습니다.", "근거 조문과 기준일을 원문에서 확인했습니다.", "이 결과가 법적 판단이 아닌 검토 후보임을 이해했습니다."])
    await page.getByLabel(label).check();
  await page.getByLabel("검토 메모 (15자 이상)").fill("합성 자료로 사실과 근거 조문을 다시 확인했습니다.");
  await page.getByRole("button", { name: "자가 검토 기록" }).click();
  await page.getByRole("heading", { name: "자가 검토 — 독립 검토 아님" }).waitFor();
  assert.equal(await page.locator(".beta-h1-note .beta-self").innerText(), "자가 검토 — 독립 검토 아님");
  const md = await (await page.request.get(`${origin}/api/reviews/${page.url().split("/").pop()}/export?format=md`)).text();
  assert.match(md, /자가 검토 — 독립 검토 아님/);
  await shot("03-self-review");

  // 3. Fact supplement: answering creates a new review and keeps the old one.
  const before = page.url();
  await page.getByRole("button", { name: "사실 보완", exact: true }).click();
  const questions = page.locator("section:has(h2:text('사실 보완')) input");
  if (await questions.count()) {
    await questions.first().fill("120명(합성)");
    await page.getByRole("button", { name: "보완해서 다시 검토" }).click();
    await page.waitForURL((u) => u.toString() !== before);
    await page.getByRole("heading", { name: "판정 후보" }).waitFor({ timeout: 20000 });
    assert.equal((await (await page.request.get(origin + "/api/reviews")).json()).length, 2);
  }

  // 4. Key settings: one data.go.kr key for 31 services, law OC with a synthetic connection check.
  await page.goto(origin + "/beta/#/keys");
  await page.getByRole("heading", { name: "공공데이터포털 일반 인증키" }).waitFor();
  const syntheticKey = "s".repeat(24) + "Synthetic";
  const dg = page.locator("section", { has: page.getByRole("heading", { name: "공공데이터포털 일반 인증키" }) });
  await dg.getByLabel("인증키").fill(syntheticKey);
  await dg.getByRole("button", { name: "저장" }).click();
  await dg.getByText("31/31개 서비스에 저장됨").waitFor();
  const law = page.locator("section", { has: page.getByRole("heading", { name: "법제처 Open API 인증값(OC)" }) });
  await law.getByLabel("OC 값").fill("synthetic-oc");
  await law.getByRole("button", { name: "저장" }).click();
  await law.getByRole("button", { name: "연결 확인" }).click();
  await law.getByText("연결 확인됨").waitFor();
  const keysText = await page.locator("main").innerText();
  assert.ok(!keysText.includes(syntheticKey) && !keysText.includes("synthetic-oc"));
  assert.match(keysText, /미연결 — 수집 안 됨/);
  await page.getByRole("button", { name: "지금 수집" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "지금 수집" }).isEnabled(), true);
  await shot("04-keys");

  // 4-1. AI 연동 (2026-10-15 user design): reuses the existing ChatGPT sign-in start endpoint. window.open is stubbed,
  // so nothing is opened and OpenAI is never contacted; the connected state is a synthetic /api/status answer.
  const ai = page.locator("section", { has: page.getByRole("heading", { name: "AI 연동" }) });
  await ai.getByText("아직 미연동된 상태입니다").waitFor();
  await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
  await ai.getByRole("button", { name: "ChatGPT 연결하기" }).click();
  await page.waitForFunction(() => window.__opened.length === 1);
  const [opened] = await page.evaluate(() => window.__opened);
  assert.match(opened[0], /^https:\/\/auth\.openai\.com\/api\/accounts\/authorize\?/);
  assert.deepEqual(opened.slice(1), ["_blank", "noopener,noreferrer"]);
  await page.route(origin + "/api/status", (route) => route.fulfill({ json: { auth: { connected: true } } }));
  await page.reload();
  await page.locator("section", { has: page.getByRole("heading", { name: "AI 연동" }) }).getByText("연동 완료").waitFor();
  await page.unroute(origin + "/api/status");

  // 5. Data handling notice and encrypted backup out and back in.
  await page.goto(origin + "/beta/#/data");
  await page.getByRole("heading", { name: "데이터 처리 안내" }).waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "암호화 백업 내보내기" }).click()]);
  const backupPath = join(dir, "backup.json");
  await download.saveAs(backupPath);
  const backup = readFileSync(backupPath, "utf8");
  assert.equal(JSON.parse(backup).format, "she-backup-v8");
  assert.ok(!backup.includes("안전관리자 1명 선임 기록"));
  await page.locator('label:has-text("백업 가져오기") input[type="file"]').setInputFiles(backupPath);
  await page.getByText(/복원했습니다: 검토 \d+건, 자료 1건/).waitFor();
  await shot("05-data-backup");

  // 6. No feedback screen: the menu has no such item and the old route falls back to the review screen.
  assert.equal(await page.locator("nav.beta-side a", { hasText: "피드백" }).count(), 0);
  await page.goto(origin + "/beta/#/feedback");
  await page.getByRole("heading", { name: "법률 조회" }).waitFor();

  // 7. AI approval: a pending send shows its exact payload; approving releases exactly that send.
  aiConsent.enable();
  setAiSendGate((p, purpose, onWait) => aiConsent.awaitApproval(p, purpose, onWait));
  const sending = aiSendGate(JSON.stringify({ input: "합성 질문 — AI 승인 화면 확인" }), "검토 분석");
  await page.goto(origin + "/beta/#/review");
  await page.getByRole("heading", { name: "AI 전송 승인 대기 — 검토 분석" }).waitFor({ timeout: 10000 });
  await page.getByText("보낼 내용 전체 보기").click();
  await shot("07-ai-approval");
  await page.getByRole("button", { name: "이 내용 한 번 보내기" }).click();
  await sending;
  setAiSendGate(undefined);

  // 8. Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/beta/#/keys");
  await page.getByRole("heading", { name: "API 키 설정" }).waitFor();
  await shot("08-keys-mobile");

  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  assert.deepEqual([...new Set(serverCalls)].filter((h) => h !== "www.law.go.kr" && h !== "apis.data.go.kr"), []);
  console.log(JSON.stringify({ ok: true, screenshots: 7, outsideRequests: outside.length, serverHosts: [...new Set(serverCalls)] }));
} finally {
  await browser?.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

// v8 stage 3: capture the existing (frozen) screens of a build so a later build can be compared with it.
// Synthetic data only, own temporary database, browser and server network refused outside the test origin.
// Usage: node scripts/capture-ui-v8.mjs <repo dir with build/ and dist/> <out dir> [--preview-off-explicit]
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [repoArg, outArg] = process.argv.slice(2);
if (!repoArg || !outArg) throw new Error("usage: capture-ui-v8.mjs <repo dir> <out dir>");
const out = resolve(outArg), explicitOff = process.argv.includes("--preview-off-explicit");
mkdirSync(out, { recursive: true });
process.chdir(resolve(repoArg)); // the server serves dist/ relative to the working directory
for (const k of Object.keys(process.env)) if (/^(LAW_OC|DATA_GO_KR|JUSO|OPENAI)/.test(k)) delete process.env[k];
globalThis.fetch = async () => new Response("synthetic refusal", { status: 403 });
// The server runs in this process: freeze its wall clock so stored timestamps (shown on screen) repeat exactly.
const FIXED = Date.parse("2026-10-13T01:00:00Z"), RealDate = Date;
function FixedDate(...a) {
  if (!new.target) return new RealDate(FIXED).toString();
  return Reflect.construct(RealDate, a.length ? a : [FIXED], new.target);
}
FixedDate.prototype = RealDate.prototype;
Object.setPrototypeOf(FixedDate, RealDate);
FixedDate.now = () => FIXED;
globalThis.Date = FixedDate;
const load = (p) => import(pathToFileURL(resolve("build/server", p)).href);
const { createApp } = await load("app.js"), { Store } = await load("store.js"), { ingestDocument } = await load("documents.js");

const dir = mkdtempSync(join(tmpdir(), "she-capture-"));
const store = new Store(dir);
if (explicitOff) store.put("settings", "preview.safetyManagerV7", false);
const { app } = await createApp(store, true);
const sha = (b) => createHash("sha256").update(b).digest("hex");
// Values that change between runs by design: ids, clock times, today's date.
const normalize = (s) => s
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
  .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<t>")
  .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "<clock>");
let browser;
try {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const origin = `http://127.0.0.1:${app.server.address().port}`, host = new URL(origin).host;
  const b = await app.inject({ url: "/api/bootstrap", headers: { host } });
  const headers = { host, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
  await ingestDocument(store, "synthetic-roster.txt", Buffer.from("가상 사업장 상시근로자 120명, 안전관리자 1명 선임 기록(합성)"));
  const c = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { prompt: "가상 사업장 근로자 정기교육 시간 이행 여부를 확인합니다.", region: "경기도", municipality: "시험시", asOf: "2026-10-08", documentIds: [], model: "", useAi: false, answers: {} } });
  const id = c.json().id;
  for (let i = 0; i < 300 && store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));

  browser = await chromium.launch({ channel: process.env.SHE_TEST_BROWSER || "chrome", headless: true });
  const shots = [];
  for (const [device, viewport] of [["desktop", { width: 1440, height: 1080 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
    await page.clock.setFixedTime(new RealDate(FIXED));
    await page.goto(origin);
    await page.getByRole("heading", { name: "검토할 업무 상황" }).waitFor();
    const views = device === "desktop"
      ? [["new", "새 법규 검토"], ["history", "검토 기록"], ["documents", "자료함"], ["sources", "법규·갱신 현황"], ["public", "공공자료 조회"], ["settings", "연결 설정"], ["result", null]]
      : [["new", null]];
    for (const [view, label] of views) {
      if (label) await page.locator("aside").getByRole("button", { name: label }).first().click();
      if (view === "result") await page.locator(".recent button").first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const name = `${device}-${view}`, png = await page.screenshot({ path: join(out, name + ".png"), fullPage: true, animations: "disabled", caret: "hide" });
      const aria = normalize(await page.locator("body").ariaSnapshot());
      writeFileSync(join(out, name + ".aria.txt"), aria);
      shots.push({ name, png: sha(png), aria: sha(aria) });
    }
    if (errors.length) throw new Error(`${device} page errors: ${errors.join(" | ")}`);
    await page.close();
  }
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ capturedAt: new RealDate().toISOString(), explicitOff, shots }, null, 2) + "\n");
  console.log(JSON.stringify({ captured: shots.length, out }));
} finally {
  await browser?.close();
  await app.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

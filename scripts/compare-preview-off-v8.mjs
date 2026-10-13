// v8 stage 2 check: with the preview switch off (absent or false), the current build must produce the same
// review, Markdown/CSV export and reviewer packet as a baseline build. Synthetic input, network refused.
// Usage: node scripts/compare-preview-off-v8.mjs <baseline repo dir with build/> [--json out.json]
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [baseDir] = process.argv.slice(2), jsonAt = process.argv.indexOf("--json");
if (!baseDir) throw new Error("baseline directory required");
globalThis.fetch = async () => new Response("synthetic refusal", { status: 403 });
const load = async (root) => ({
  app: await import(pathToFileURL(resolve(root, "build/server/app.js")).href),
  store: await import(pathToFileURL(resolve(root, "build/server/store.js")).href),
  docs: await import(pathToFileURL(resolve(root, "build/server/documents.js")).href),
});
const builds = { baseline: await load(baseDir), current: await load(".") };
const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const prompts = [
  "가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다.",
  "가상 저장소 위험물 안전관리자 재선임 신고 기한을 확인합니다.",
  "가상 사업장 근로자 정기교육 시간 이행 여부를 확인합니다.",
  "가상 공장 폐기물 위탁 처리 조건을 검토합니다.",
];
const normalize = (s) => s
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
  .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<t>");
async function run(build, prompt, withDoc, switchValue) {
  const dir = mkdtempSync(join(tmpdir(), "she-compare-"));
  const store = new build.store.Store(dir);
  if (switchValue !== undefined) store.put("settings", "preview.safetyManagerV7", switchValue);
  const { app } = await build.app.createApp(store, true);
  try {
    const host = "127.0.0.1:4317", b = await app.inject({ url: "/api/bootstrap", headers: { host } });
    const headers = { host, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    const documentIds = withDoc ? [(await build.docs.ingestDocument(store, "synthetic.txt", Buffer.from("가상 사업장 상시근로자 120명, 안전관리자 1명 선임 기록(합성)"))).id] : [];
    const c = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { prompt, region: "경기도", municipality: "시험시", asOf, documentIds, model: "", useAi: false, answers: {} } });
    const id = c.json().id;
    for (let i = 0; i < 300 && store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    const get = async (path) => normalize((await app.inject({ url: `/api/reviews/${id}${path}`, headers })).body);
    return { review: await get(""), markdown: await get("/export?format=markdown"), csv: await get("/export?format=csv"), packet: await get("/reviewer-packet") };
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}
const results = [];
for (const prompt of prompts) for (const withDoc of [false, true]) {
  const base = await run(builds.baseline, prompt, withDoc);
  for (const [variant, value] of [["absent", undefined], ["false", false]]) {
    const cur = await run(builds.current, prompt, withDoc, value);
    for (const k of Object.keys(base)) results.push({ prompt: prompts.indexOf(prompt), withDoc, variant, artifact: k, bytes: Buffer.byteLength(base[k]), identical: base[k] === cur[k] });
  }
}
// Control: with the switch on the output must change, which shows the comparison can see a difference.
const on = await run(builds.current, prompts[0], false, true), base0 = await run(builds.baseline, prompts[0], false);
const control = { switchOnDiffers: on.review !== base0.review && on.markdown !== base0.markdown };
const different = results.filter((r) => !r.identical);
const summary = { compared: results.length, identical: results.length - different.length, different, control };
if (jsonAt > 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ asOf, results, summary }, null, 2));
console.log(JSON.stringify(summary));
process.exitCode = different.length || !control.switchOnDiffers ? 1 : 0;

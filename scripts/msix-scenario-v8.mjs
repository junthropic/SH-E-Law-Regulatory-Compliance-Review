#!/usr/bin/env node
// v8 stage 4: HTTP steps of the MSIX install test, run against the installed app (scripts/msix-install-test-v8.ps1).
// Synthetic input only; no keys are configured, so the app makes no outside calls for these steps.
// Usage:
//   node scripts/msix-scenario-v8.mjs before --port N --backup <file>   safety-manager review (preview on) + encrypted backup
//   node scripts/msix-scenario-v8.mjs after  --port N --backup <file> --review <id>   fresh install is empty, restore brings the review back
//   node scripts/msix-scenario-v8.mjs quit   --port N                    the app's own quit request
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const [phase, ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const origin = `http://127.0.0.1:${Number(opt("--port"))}`;
const ASK = "가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다. 상시근로자 120명 제조업(합성)";
const LABEL = "검토 후보 — 법적 판단 아님, 베타";
const koreaDate = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

let cookie = "", csrf = "";
async function call(method, path, body) {
  const r = await fetch(origin + path, {
    method, headers: { cookie, ...(csrf ? { "x-csrf-token": csrf } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
async function boot() { const b = await call("GET", "/api/bootstrap"); assert.equal(b.status, 200); csrf = b.json.csrf; }
async function waitReview(id) {
  for (let i = 0; i < 600; i++) { const r = await call("GET", "/api/reviews/" + id); if (r.json.status !== "running") return r.json; await new Promise((s) => setTimeout(s, 200)); }
  throw new Error("review did not finish");
}

await boot();
const result = { phase };
if (phase === "before") {
  // Installed build: features that would bypass the egress guard are off.
  const mcp = await call("POST", "/api/mcp/query", { tool: "search_law", params: { query: "산업안전보건법" } });
  assert.equal(mcp.status, 403); result.mcpQuery = mcp.status;
  const upd = await call("POST", "/api/public/update", {});
  assert.equal(upd.status, 403); result.publicUpdate = upd.status;
  const notice = await call("GET", "/api/beta/notice");
  assert.ok(notice.json.items.some((i) => i.title === "앱 제거" && i.text.startsWith("앱을 제거하면 저장된 자료가 삭제됩니다. 먼저 백업하세요.")));
  result.uninstallNotice = true;
  assert.equal((await call("POST", "/api/preview", { safetyManagerV7: true })).status, 200);
  const created = await call("POST", "/api/reviews", { prompt: ASK, region: "경기도", municipality: "시험시", asOf: koreaDate(), documentIds: [], model: "", useAi: false, answers: {} });
  assert.equal(created.status, 202, JSON.stringify(created.json));
  const review = await waitReview(created.json.id);
  assert.equal(review.status, "completed", review.error);
  const titles = review.issues.map((i) => i.title);
  assert.ok(titles.includes("안전관리자 선임(인원)"));
  assert.ok(!review.issues.some((i) => i.title === "안전관리자 재선임" || /^hazmat/.test(i.ruleId ?? "")));
  assert.ok(review.issues.every((i) => i.conditions.includes(LABEL) && i.category !== "clear_risk"));
  Object.assign(result, { reviewId: review.id, issues: review.issues.length, safetyManagerCandidate: true, hazmatMixed: false });
  const backup = await call("GET", "/api/beta/backup");
  assert.equal(backup.status, 200);
  assert.equal(backup.json.protection, "windows-dpapi-current-user");
  writeFileSync(opt("--backup"), JSON.stringify(backup.json));
  Object.assign(result, { backupProtection: backup.json.protection, backupBytes: JSON.stringify(backup.json).length });
} else if (phase === "after") {
  const id = opt("--review");
  const before = await call("GET", "/api/reviews/" + id);
  assert.equal(before.status, 404); result.freshInstallEmpty = true;
  const restored = await call("POST", "/api/beta/restore", { file: readFileSync(opt("--backup"), "utf8") });
  assert.equal(restored.status, 200, JSON.stringify(restored.json));
  result.restore = restored.json;
  const back = await call("GET", "/api/beta/reviews/" + id);
  assert.equal(back.status, 200);
  result.reviewRestored = true;
} else if (phase === "quit") {
  const q = await call("POST", "/api/shutdown", {});
  assert.equal(q.status, 200); result.quit = q.json;
} else throw new Error("phase?");
console.log(JSON.stringify(result));

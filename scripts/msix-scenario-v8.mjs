#!/usr/bin/env node
// v8 stage 4: HTTP steps of the MSIX install test, run against the installed app (scripts/msix-install-test-v8.ps1).
// Synthetic input only; no keys are configured, so the app makes no outside calls for these steps.
// H1 / F-09: the installed server gives a session only for a one-time value (75 characters, accepted once, within
// 5 minutes) that the launcher makes from its per-start launch key. launch.json in the package's per-user LocalState
// folder (--launch) holds only {port, pid, pipe} and has no token. This script reads the pipe name from it and asks the
// launcher's local pipe (\\.\pipe\<name>) for a fresh value with the request "mint" every time one is needed.
// Only the test package (build-msix-v8.mjs --test-identity) has "mint"; the Store package has no such code and answers
// "no", so this script cannot get a session from a Store package. Values are never passed on a command line, written to
// a file or printed.
// Usage:
//   node scripts/msix-scenario-v8.mjs before --port N --launch <launch.json> --backup <file>   safety-manager review (preview on) + encrypted backup
//   node scripts/msix-scenario-v8.mjs after  --port N --launch <launch.json> --backup <file> --review <id>   fresh install is empty, restore brings the review back
//   node scripts/msix-scenario-v8.mjs quit   --port N --launch <launch.json>                    the app's own quit request
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";

const [phase, ...rest] = process.argv.slice(2);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const origin = `http://127.0.0.1:${Number(opt("--port"))}`;
function readLaunchFile(file) {
  // A parse error is replaced by a fixed message so no part of the file reaches the output.
  let json;
  try { json = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch { throw new Error("launch.json could not be read"); }
  if (!json || typeof json !== "object") throw new Error("launch.json could not be read");
  const pipe = typeof json.pipe === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(json.pipe) ? json.pipe : "";
  if (!pipe) throw new Error("launch.json has no usable pipe name");
  return { pipe, hasToken: Object.hasOwn(json, "token") };
}
const launch = readLaunchFile(opt("--launch"));
const ONE_TIME_VALUE = /^[A-Za-z0-9_-]{75}$/;

// One ASCII request line, one response line, then the launcher closes the connection. The pipe takes one connection at
// a time and can be missing or busy for a moment between instances (ENOENT / EBUSY); those are retried after a short
// wait. The answer is never put into an error message.
const PIPE_RETRIES = 20, PIPE_RETRY_MS = 250, PIPE_TIMEOUT_MS = 5000;
function pipeRequestOnce(name, request) {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: "\\\\.\\pipe\\" + name });
    let data = "", done = false;
    const finish = (err, line) => {
      if (done) return;
      done = true; clearTimeout(timer); socket.destroy();
      if (err) reject(err); else resolve(line);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error("the launcher pipe did not answer"), { code: "ETIMEDOUT" })), PIPE_TIMEOUT_MS);
    socket.setEncoding("ascii");
    socket.on("connect", () => socket.write(request + "\n"));
    socket.on("data", (chunk) => {
      data += chunk;
      const end = data.indexOf("\n");
      if (end >= 0) finish(null, data.slice(0, end).replace(/\r$/, ""));
      else if (data.length > 256) finish(new Error("the launcher pipe answer was too long"));
    });
    socket.on("end", () => finish(null, data.replace(/\r?\n$/, "")));
    socket.on("close", () => finish(null, data.replace(/\r?\n$/, "")));
    socket.on("error", (e) => finish(Object.assign(new Error("the launcher pipe could not be reached (" + (e.code || "error") + ")"), { code: e.code })));
  });
}
async function pipeRequest(name, request) {
  for (let attempt = 1; ; attempt++) {
    try { return await pipeRequestOnce(name, request); } catch (e) {
      if (!["ENOENT", "EBUSY"].includes(e.code) || attempt >= PIPE_RETRIES) throw e;
      await new Promise((s) => setTimeout(s, PIPE_RETRY_MS));
    }
  }
}
// A fresh one-time value from the test package's launcher; every call gives a new one. Never printed.
async function mint() {
  const line = await pipeRequest(launch.pipe, "mint");
  if (line === "no") throw new Error("the launcher pipe refused mint (only the test package has it, not the Store package)");
  if (!ONE_TIME_VALUE.test(line)) throw new Error("the launcher pipe gave no one-time value");
  return line;
}
const ASK = "가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다. 상시근로자 120명 제조업(합성)";
const LABEL = "검토 후보 — 법적 판단 아님, 베타";
const koreaDate = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

let cookie = "", csrf = "";
async function call(method, path, body, extra = {}) {
  const r = await fetch(origin + path, {
    method, headers: { cookie, ...(csrf ? { "x-csrf-token": csrf } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
// A request without a session cookie: what any other process or Windows user on this PC can send.
async function anonymousBootstrap(headers) {
  const r = await fetch(origin + "/api/bootstrap", { headers });
  await r.text();
  return { status: r.status, cookie: !!r.headers.get("set-cookie") };
}
async function boot() {
  // F-09: launch.json no longer carries a token.
  assert.equal(launch.hasToken, false, "launch.json has a token field");
  const none = await anonymousBootstrap({});
  // Right length and characters, wrong signature.
  const wrong = await anonymousBootstrap({ "x-she-launch": "x".repeat(75) });
  assert.deepEqual([none, wrong], [{ status: 403, cookie: false }, { status: 403, cookie: false }]);
  const value = await mint();
  const b = await call("GET", "/api/bootstrap", undefined, { "x-she-launch": value });
  assert.equal(b.status, 200); csrf = b.json.csrf;
  // The value is used up: the same value again without a cookie gives no session.
  const reused = await anonymousBootstrap({ "x-she-launch": value });
  assert.deepEqual(reused, { status: 403, cookie: false });
  // The same browser (session cookie, no value) keeps its session, as the old screen at / and the OAuth return do.
  const cookieOnly = await call("GET", "/api/bootstrap");
  assert.equal(cookieOnly.status, 200);
  return { withoutToken: none.status, wrongToken: wrong.status, withToken: b.status, reusedToken: reused.status,
    cookieOnly: cookieOnly.status, launchFileHasToken: launch.hasToken };
}
async function waitReview(id) {
  for (let i = 0; i < 600; i++) { const r = await call("GET", "/api/reviews/" + id); if (r.json.status !== "running") return r.json; await new Promise((s) => setTimeout(s, 200)); }
  throw new Error("review did not finish");
}

const result = { phase, bootstrap: await boot() };
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

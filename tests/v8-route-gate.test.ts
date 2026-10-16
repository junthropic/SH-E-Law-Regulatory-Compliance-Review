import { it, expect, afterEach } from "vitest";
import { createApp } from "../server/app.js";
import { LEGACY_BACKUP_OFF_MESSAGE } from "../server/installed-v8.js";
import { testStore } from "./helpers.js";

// Security review F-01 (2026-10-16): the session/CSRF gate decided "is this /api/?" from the raw URL while the router
// percent-decodes, so "/%61pi/…" reached every API handler with no session. F-04: the plaintext JSON backup is off in
// the installed build. Synthetic data only; no outside requests are made.
const HOST = "127.0.0.1:4317";
afterEach(() => { delete process.env.SHE_INSTALLED; });

const BYPASS_PATHS = [
  "/%61pi/status", "/%61%70%69/status", "/%2561pi/status", "/api%2fstatus", "/api%2Fstatus",
  "//api/status", "/./api/status", "/API/status", "/Api/status", "/%41PI/status",
];
const MUTATIONS: [string, unknown][] = [
  ["/%61pi/shutdown", {}], ["/%61pi/settings/law", { lawOc: "SYNTHETIC-OC" }], ["/%61pi/restore", { schemaVersion: 1 }],
  ["/%61pi/ai/consent", { enabled: true }], ["/%61pi/auth/chatgpt/logout", {}],
];

it("V8-X09: 퍼센트 인코딩·대소문자·슬래시 변형 주소로 /api 세션·CSRF 검사를 피할 수 없다(F-01)", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    for (const url of BYPASS_PATHS) {
      const r = await app.inject({ url, headers: { host: HOST } });
      // Either refused, or not an API route at all (the screen's index.html for unknown paths) — never API data.
      if (r.statusCode === 200) expect(String(r.headers["content-type"]), url).toMatch(/^text\/html/);
      else expect([400, 401, 403, 404], url).toContain(r.statusCode);
      expect(r.body, url).not.toContain('"auth"');
    }
    for (const [url, payload] of MUTATIONS) {
      const r = await app.inject({ method: "POST", url, headers: { host: HOST }, payload: payload as object });
      expect([400, 401, 403, 404], url).toContain(r.statusCode);
    }
    // Undecodable paths are refused, not passed through.
    expect((await app.inject({ url: "/%E0%A4%A/status", headers: { host: HOST } })).statusCode).toBe(400);
    // Normal use still works: bootstrap → session → API.
    const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    expect((await app.inject({ url: "/api/status", headers })).statusCode).toBe(200);
    // An encoded path with a valid session still needs CSRF for mutations.
    const noCsrf = { host: HOST, cookie: headers.cookie };
    expect((await app.inject({ method: "POST", url: "/%61pi/ai/consent", headers: noCsrf, payload: { enabled: true } })).statusCode).toBe(403);
  } finally { await app.close(); f.clean(); }
});

it("V8-X10: 설치판에서는 기존 화면의 평문 JSON 백업·복원을 거부하고, 암호화 백업 경로는 그대로 둔다(F-04)", async () => {
  process.env.SHE_INSTALLED = "1";
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    const backup = await app.inject({ url: "/api/backup", headers });
    expect(backup.statusCode).toBe(403);
    expect(backup.json().error).toBe(LEGACY_BACKUP_OFF_MESSAGE);
    const restore = await app.inject({ method: "POST", url: "/api/restore", headers, payload: { schemaVersion: 1 } });
    expect(restore.statusCode).toBe(403);
    expect(restore.json().error).toBe(LEGACY_BACKUP_OFF_MESSAGE);
    // The encrypted backup route is still registered (not 403/404 by this change).
    expect([403, 404]).not.toContain((await app.inject({ url: "/api/beta/backup", headers })).statusCode);
  } finally { await app.close(); f.clean(); }
});

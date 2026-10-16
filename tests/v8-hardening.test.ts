import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCipheriv, createHash, randomBytes, type CipherGCM } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { StorageCipher, GCM_TAG_BYTES } from "../server/storage-crypto-v8.js";
import { betaBackup } from "../server/beta-v8.js";
import { BackupFileSchema } from "../server/beta-contract-v8.js";
import { newReview } from "../server/reviews.js";
import { checkNodeExe, expectedNodeHash } from "../scripts/node-shasums-v8.mjs";
import { testStore, request, basis } from "./helpers.js";

// Security review F-10 (response headers), F-11 (GCM tag length), F-12 (actions pinned to commits) and F-13 (node.exe
// checked against the official SHASUMS256). Synthetic data only; no real network (fetch answers a synthetic refusal).
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic refusal", { status: 403 }))); });
afterEach(() => { vi.unstubAllGlobals(); });
const HOST = "127.0.0.1:4317";
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

it("V8-N04: (F-10) /, /beta/, /api와 정적 파일·글꼴·내려받기·OAuth 회신 응답에 COOP·CORP·Permissions-Policy가 붙고, 기존 보안 헤더·화면 응답·내려받기는 그대로다", async () => {
  const t = testStore();
  const { app } = await createApp(t.store, true);
  try {
    const plain = { host: HOST };
    const b = await app.inject({ url: "/api/bootstrap", headers: plain });
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    const review = newReview(request()); review.evidence = basis(); review.status = "completed"; t.store.saveReview(review);
    const root = await app.inject({ url: "/", headers: plain }), beta = await app.inject({ url: "/beta/", headers: plain });
    const font = readdirSync("dist-beta/assets").find((f) => f.endsWith(".woff2"))!;
    const betaJs = /src="(\/beta\/assets\/[^"]+\.js)"/.exec(beta.body)![1], oldJs = /src="(\/assets\/[^"]+\.js)"/.exec(root.body)![1];
    const r: Record<string, Awaited<ReturnType<typeof app.inject>>> = {
      "/": root, "/beta/": beta, "/api/bootstrap": b,
      "/api": await app.inject({ url: "/api", headers: plain }),
      "/api/status": await app.inject({ url: "/api/status", headers }),
      "/api/nothing (no session)": await app.inject({ url: "/api/nothing", headers: plain }),
      font: await app.inject({ url: "/beta/assets/" + font, headers: plain }),
      betaJs: await app.inject({ url: betaJs, headers: plain }),
      oldJs: await app.inject({ url: oldJs, headers: plain }),
      exportMd: await app.inject({ url: `/api/reviews/${review.id}/export?format=markdown`, headers }),
      exportCsv: await app.inject({ url: `/api/reviews/${review.id}/export?format=csv`, headers }),
      betaBackup: await app.inject({ url: "/api/beta/backup", headers }),
      legacyBackup: await app.inject({ url: "/api/backup", headers }),
      callback: await app.inject({ url: "/auth/callback?state=synthetic", headers: plain }),
      wrongHost: await app.inject({ url: "/", headers: { host: "localhost:4317" } }),
    };
    for (const [where, res] of Object.entries(r)) {
      expect(res.headers["cross-origin-opener-policy"], where).toBe("same-origin");
      expect(res.headers["cross-origin-resource-policy"], where).toBe("same-origin");
      for (const f of ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"])
        expect(String(res.headers["permissions-policy"]), where).toContain(f);
      // Unchanged: the existing headers.
      expect([res.headers["content-security-policy"], res.headers["x-content-type-options"], res.headers["referrer-policy"]], where).toEqual([CSP, "nosniff", "no-referrer"]);
    }
    // Unchanged: both entries, assets, fonts, downloads and refusals answer as before.
    expect(root.body).toBe(readFileSync("dist/index.html", "utf8"));
    expect(beta.body).toBe(readFileSync("dist-beta/index.html", "utf8"));
    expect(r["/api"].body).toBe(root.body); // not an /api/ route: the old screen's entry, as before
    expect(r["/api/status"].json().auth).toMatchObject({ connected: false });
    expect(r["/api/nothing (no session)"].statusCode).toBe(401);
    expect([r.font.statusCode, r.font.headers["content-type"], r.font.rawPayload.equals(readFileSync("dist-beta/assets/" + font))]).toEqual([200, "font/woff2", true]);
    expect([r.betaJs.statusCode, r.oldJs.statusCode]).toEqual([200, 200]);
    for (const k of ["exportMd", "exportCsv", "betaBackup", "legacyBackup"]) {
      expect(r[k].statusCode, k).toBe(200);
      expect(String(r[k].headers["content-disposition"]), k).toMatch(/^attachment; filename=/);
    }
    expect(BackupFileSchema.parse(r.betaBackup.json()).format).toBe("she-backup-v8");
    expect([r.callback.statusCode, r.wrongHost.statusCode]).toEqual([400, 403]);
  } finally {
    await app.close();
    t.clean();
  }
});

// Seals the way the code did before F-11 (no authTagLength option; Node's default tag is 16 bytes), or with a chosen tag length.
function sealOld(key: Buffer, plain: Buffer, aad: string, authTagLength?: number) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv, authTagLength ? { authTagLength } : undefined) as CipherGCM;
  c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

it("V8-E06: (F-11) 저장 암호문의 GCM 태그는 16바이트로 고정된다 — 잘린 태그는 거부하고, 고치기 전 방식으로 봉인한 값은 그대로 열린다", () => {
  expect(GCM_TAG_BYTES).toBe(16);
  const key = randomBytes(32), cipher = new StorageCipher(key);
  // Existing data: sealed without the option (default 16-byte tag) opens with the pinned code.
  const old = sealOld(key, Buffer.from("합성 기록 본문"), "reviews:r1");
  expect(cipher.openText("she-enc:v8:" + old.toString("base64"), "reviews:r1")).toBe("합성 기록 본문");
  expect(cipher.openBytes(Buffer.concat([Buffer.from("SHEENC08"), sealOld(key, Buffer.from([1, 2, 3]), "file:a")]), "file:a")).toEqual(Buffer.from([1, 2, 3]));
  expect(cipher.openText(cipher.sealText("새 값", "settings:x"), "settings:x")).toBe("새 값");
  // A valid 8-byte tag over an empty body (iv 12 + tag 8 = 20 bytes) and a real tag cut to 12 bytes: both refused.
  const short = sealOld(key, Buffer.alloc(0), "reviews:r2", 8);
  expect(short.length).toBe(20);
  expect(() => cipher.openText("she-enc:v8:" + short.toString("base64"), "reviews:r2")).toThrow();
  expect(() => cipher.openBytes(Buffer.concat([Buffer.from("SHEENC08"), short]), "reviews:r2")).toThrow();
  const empty = cipher.sealBytes(Buffer.alloc(0), "file:b"); // magic 8 + iv 12 + tag 16
  expect(empty.length).toBe(36);
  expect(cipher.openBytes(empty, "file:b")).toEqual(Buffer.alloc(0));
  expect(() => cipher.openBytes(empty.subarray(0, 32), "file:b")).toThrow();
});

it("V8-E07: (F-11) 암호화 백업 복원은 16바이트가 아닌 GCM 태그(잘린 태그)를 거부하고, 원래 태그와 고치기 전 방식으로 만든 백업은 그대로 복원된다", async () => {
  const t = testStore();
  const made = await createApp(t.store, true);
  try {
    const b = await made.app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    const review = newReview(request()); review.status = "completed"; t.store.saveReview(review);
    const file = BackupFileSchema.parse((await made.app.inject({ url: "/api/beta/backup", headers })).json());
    expect(Buffer.from(file.tag, "base64").length).toBe(16);
    const restore = (f: object) => made.app.inject({ method: "POST", url: "/api/beta/restore", headers, payload: { file: JSON.stringify(f) } });
    for (const n of [12, 15, 8, 4]) {
      const cut = await restore({ ...file, tag: Buffer.from(file.tag, "base64").subarray(0, n).toString("base64") });
      expect([cut.statusCode, cut.json().error], String(n)).toEqual([400, "백업 파일이 손상되었거나 변경되었습니다."]);
    }
    expect((await restore(file)).json()).toMatchObject({ ok: true, reviews: 1 });
    // A backup made the old way (cipher without authTagLength, default 16-byte tag) restores unchanged.
    const key = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv) as CipherGCM;
    c.setAAD(Buffer.from("she-backup-v8"));
    const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(betaBackup(t.store)), "utf8"))), c.final()]);
    const oldFile = { ...file, wrappedKey: await made.vault.protect(key.toString("base64")), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") };
    expect((await restore(oldFile)).json()).toMatchObject({ ok: true, reviews: 1 });
  } finally {
    await made.app.close();
    t.clean();
  }
});

it("V8-M11: (F-12) 모든 워크플로의 액션은 전체 커밋 SHA로 고정되고 태그는 뒤 주석으로 남는다", () => {
  const files = readdirSync(".github/workflows").filter((f) => /\.ya?ml$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  let count = 0;
  for (const f of files)
    for (const line of readFileSync(join(".github/workflows", f), "utf8").split(/\r?\n/).filter((l) => /^\s*(-\s+)?uses:/.test(l))) {
      expect(line, f).toMatch(/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      count++;
    }
  expect(count).toBe(11);
});

it("V8-M12: (F-13) node.exe는 그 Node 버전의 공식 SHASUMS256 목록과 SHA-256이 같아야 패키지에 들어가고, CI 빌드는 목록 없이 진행하지 않으며 로컬은 해시만 기록한다", () => {
  const dir = mkdtempSync(join(tmpdir(), "she-f13-"));
  try {
    const exe = join(dir, "node.exe"), list = join(dir, "SHASUMS256.txt");
    writeFileSync(exe, "synthetic node.exe " + randomBytes(8).toString("hex"));
    const hash = createHash("sha256").update(readFileSync(exe)).digest("hex"), other = "0".repeat(64);
    const listing = (h: string, version = "v24.0.0") => [`${other}  node-${version}-win-x64.zip`, `${h}  win-x64/node.exe`, `${other}  win-arm64/node.exe`, `${other}  node-${version}.tar.gz`].join("\n") + "\n";
    const check = (extra: Partial<Parameters<typeof checkNodeExe>[0]>) => checkNodeExe({ exe, version: "v24.0.0", arch: "x64", ci: true, shasumsFile: list, ...extra });
    writeFileSync(list, listing(hash));
    expect(check({})).toEqual({ entry: "win-x64/node.exe", sha256: hash, check: "matches official SHASUMS256.txt of Node v24.0.0" });
    writeFileSync(list, listing(other));
    expect(() => check({})).toThrow("공식 SHASUMS256.txt(win-x64/node.exe)와 다릅니다");
    writeFileSync(list, listing(hash, "v22.0.0"));
    expect(() => check({})).toThrow("Node v24.0.0 의 목록이 아닙니다");
    expect(() => check({ arch: "ia32" })).toThrow();
    expect(() => check({ shasumsFile: undefined })).toThrow("CI 빌드에는 --node-shasums 가 필요합니다");
    expect(check({ shasumsFile: undefined, ci: false })).toEqual({ entry: "win-x64/node.exe", sha256: hash, check: "not checked (local build without --node-shasums)" });
    expect(() => expectedNodeHash(listing(hash) + `${other}  win-x64/node.exe\n`, "v24.0.0", "win-x64/node.exe")).toThrow("여러 번");
    // Wiring: msix.yml fetches the list and compares before either build; both builds pass it; the script checks
    // before building and records the result in msix-build.json; the script itself has no network call.
    const wf = readFileSync(".github/workflows/msix.yml", "utf8"), build = readFileSync("scripts/build-msix-v8.mjs", "utf8");
    const verify = wf.indexOf("Verify node.exe against the official SHASUMS256");
    expect(verify).toBeGreaterThan(0);
    expect(verify).toBeLessThan(wf.indexOf("Build test-signed MSIX"));
    expect(wf).toContain('Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt"');
    expect(wf.match(/build-msix-v8\.mjs [^\n]*--node-shasums "\$env:RUNNER_TEMP\\node-SHASUMS256\.txt"/g)?.length).toBe(2);
    expect(build.indexOf("checkNodeExe({")).toBeLessThan(build.indexOf('run("npm run build"'));
    expect(build).toMatch(/node: process\.version,\s*nodeExe,/);
    const code = (s: string) => s.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const src of [build, readFileSync("scripts/node-shasums-v8.mjs", "utf8")]) expect(code(src)).not.toMatch(/\bfetch\(|https?\.get\(|https?\.request\(|nodejs\.org\/dist/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

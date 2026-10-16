import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { EgressBlocked, EgressGuard, classifyHost } from "../server/egress-guard-v8.js";
// @ts-expect-error plain ESM script without type declarations
import { inLibraryPath } from "../scripts/package-scan.mjs";
import { createApp } from "../server/app.js";
import { Store, sha, PUBLIC_IMPORT_NOTE } from "../server/store.js";
import { makeBackup } from "../server/backup.js";
import { betaBackup } from "../server/beta-v8.js";
import { writePublicBundle } from "../server/public-bundle.js";
import { importPublicOnce, MCP_OFF_MESSAGE, PETITION_OFF_MESSAGE, PUBLIC_UPDATE_OFF_MESSAGE, UNINSTALL_NOTICE } from "../server/installed-v8.js";
import { NoticeSchema, RestoreResultSchema } from "../server/beta-contract-v8.js";
import { testStore, request, evidence, basis } from "./helpers.js";

// v8 stage 4 (MSIX). The launcher sets SHE_INSTALLED=1; these tests set it with vi.stubEnv and never touch the network.
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic refusal", { status: 403 }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const HOST = "127.0.0.1:4317";
async function open(store: Store) {
  const { app } = await createApp(store, true);
  const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
  const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
  return { app, headers };
}
const testSources = () => readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => readFileSync(join("tests", f), "utf8")).join("\n");

it("V8-M01: 설치판에서는 법령 MCP 조회(자식 프로세스, 외부 통신 검사 밖)와 제작자 저장소 법령 갱신이 꺼지고, 설치판이 아니면 기존 동작 그대로다", async () => {
  vi.stubEnv("LAW_OC", "");
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const mcp = () => app.inject({ method: "POST", url: "/api/mcp/query", headers, payload: { tool: "search_law", params: { query: "산업안전보건법" } } });
    const update = () => app.inject({ method: "POST", url: "/api/public/update", headers, payload: {} });
    const before = [await mcp(), await update()];
    expect(before.map((r) => r.statusCode)).toEqual([400, 400]);
    expect(before[0].json().error).toBe("법제처 OC 설정 필요");
    vi.mocked(fetch).mockClear();
    vi.stubEnv("SHE_INSTALLED", "1");
    const off = [await mcp(), await update()];
    expect(off.map((r) => r.statusCode)).toEqual([403, 403]);
    expect(off.map((r) => r.json().error)).toEqual([MCP_OFF_MESSAGE, PUBLIC_UPDATE_OFF_MESSAGE]);
    expect(vi.mocked(fetch).mock.calls.length).toBe(0); // the installed path stops before any outside request
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-M02: 설치판 데이터 처리 안내에 '앱을 제거하면 저장된 자료가 삭제됩니다. 먼저 백업하세요'가 증명 시험 ID와 함께 나오고, 설치판이 아니면 나오지 않는다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const notice = async () => NoticeSchema.parse((await app.inject({ url: "/api/beta/notice", headers })).json());
    expect((await notice()).items.some((i) => i.title === "앱 제거")).toBe(false);
    vi.stubEnv("SHE_INSTALLED", "1");
    const item = (await notice()).items.find((i) => i.title === "앱 제거")!;
    expect(UNINSTALL_NOTICE).toBe("앱을 제거하면 저장된 자료가 삭제됩니다. 먼저 백업하세요.");
    expect(item.text.startsWith(UNINSTALL_NOTICE)).toBe(true);
    const sources = testSources();
    for (const id of item.proof) expect(sources).toMatch(new RegExp(`it(\\.(runIf|skipIf)\\([^)]*\\))?\\("${id}:`));
  } finally {
    await app.close();
    t.clean();
  }
});

it("V8-M03: 설치판 시작은 같은 공개 법령 초기 자료를 다시 가져오지 않고, 파일이 바뀌면 가져온다", () => {
  const t = testStore();
  try {
    const path = join(t.store.dir, "bundle.json");
    expect(importPublicOnce(t.store, path)).toBe("absent");
    writePublicBundle(path + ".gz", { schemaVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", evidence: [evidence({ verified: false })], sources: [] });
    const spy = vi.spyOn(t.store, "importPublic");
    expect(importPublicOnce(t.store, path)).toBe("imported");
    const wal = join(t.store.dir, "private.sqlite-wal"); // folded into the database after the import
    if (existsSync(wal)) expect(statSync(wal).size).toBe(0);
    expect(importPublicOnce(t.store, path)).toBe("unchanged");
    expect(spy).toHaveBeenCalledTimes(1);
    writePublicBundle(path + ".gz", { schemaVersion: 1, createdAt: "2026-10-02T00:00:00.000Z", evidence: [evidence({ verified: false })], sources: [] });
    expect(importPublicOnce(t.store, path)).toBe("imported");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(t.store.setting<{ count: number }>("public-bundle-status", { count: 0 }).count).toBe(1);
  } finally {
    t.clean();
  }
});

// Recorded by scripts/msix-install-test-v8.ps1 on a clean GitHub Windows runner (.github/workflows/msix.yml).
it("V8-M04: 깨끗한 Windows에서 MSIX 설치 → 실행 → 안전관리자 시나리오 → 백업 → 제거(자료 삭제) → 재설치 → 백업 가져오기가 모두 통과했다", () => {
  const record = JSON.parse(readFileSync("docs/implementation-v8/stage4-msix/install-test.json", "utf8"));
  expect(record.format).toBe("she-msix-install-test-v8");
  for (const step of ["installed", "launched", "consoleHidden", "singleInstance", "scenario", "backupExported", "appQuitStopsServer",
    "launcherStopStopsServer", "uninstalled", "dataRemovedOnUninstall", "reinstalled", "restoredAfterReinstall"])
    expect(record.steps[step], step).toBe(true);
  expect(record.scenario.safetyManagerCandidate).toBe(true);
  expect(record.scenario.hazmatMixed).toBe(false);
  expect(record.scenario.mcpQuery).toBe(403);
  expect(record.scenario.backupProtection).toBe("windows-dpapi-current-user");
});

it("V8-M05: 암호화 백업은 앱에 들어 있는 공개 법령 초기 자료를 빼고, 사용자가 모은 근거와 검토 기록(쓰인 근거 포함)은 넣으며, 기존 백업 형식은 그대로다", async () => {
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    for (const e of basis()) t.store.saveEvidence(e);
    const otherText = "시험용 가상 공개 법령 초기 자료입니다. 앱과 함께 설치됩니다.";
    const path = join(t.store.dir, "bundle.json");
    writePublicBundle(path + ".gz", { schemaVersion: 1, createdAt: "2026-10-01T00:00:00.000Z", sources: [],
      evidence: [evidence({ sourceId: "bundle-national", article: "가상 제9조", text: otherText, hash: sha(otherText), verified: false })] });
    t.store.importPublic(path);
    const created = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: request() });
    const id = created.json().id as string;
    for (let i = 0; i < 300 && t.store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    const all = makeBackup(t.store), beta = betaBackup(t.store);
    expect(all.evidence.some((e: any) => e.verificationNote === PUBLIC_IMPORT_NOTE)).toBe(true);
    expect(beta.evidence.some((e: any) => e.verificationNote === PUBLIC_IMPORT_NOTE)).toBe(false);
    expect(beta.evidence.length).toBe(all.evidence.length - 1);
    expect(beta.reviews).toEqual(all.reviews);
    expect((beta.reviews as any[]).find((r) => r.id === id).evidence.length).toBeGreaterThan(0);
    const file = (await app.inject({ url: "/api/beta/backup", headers })).body;
    // The payload is compressed before encryption.
    expect(Buffer.from(JSON.parse(file).data, "base64").length).toBeLessThan(JSON.stringify(beta).length / 2);
    const back = await app.inject({ method: "POST", url: "/api/beta/restore", headers, payload: { file } });
    expect(RestoreResultSchema.parse(back.json())).toMatchObject({ ok: true, reviews: 1 });
  } finally {
    await app.close();
    t.clean();
  }
}, 30000);

it("V8-M06: 패키지 구성 — runFullTrust 외 권한 없음, 관리자 권한 요청 없음, 127.0.0.1·콘솔 숨김·NODE_OPTIONS 제거(H7: 환경을 비운 뒤 허용 목록만), Partner Center 값(2026-10-14 사용자 전달)이 그대로 들어 있다", () => {
  const manifest = readFileSync("packaging/msix/AppxManifest.template.xml", "utf8");
  expect([...manifest.matchAll(/<(?:\w+:)?Capability Name="([^"]+)"/g)].map((m) => m[1])).toEqual(["runFullTrust"]);
  expect(manifest).toContain('EntryPoint="Windows.FullTrustApplication"');
  const identity = JSON.parse(readFileSync("packaging/msix/identity.json", "utf8"));
  expect(identity).toMatchObject({ identityName: "Junthropic.KoreanSHELawComplianceCheckProgram", publisher: "CN=097FA085-6606-4CC5-9DE9-D20F20A8ECEA", publisherDisplayName: "Junthropic" });
  expect(JSON.stringify(identity)).not.toContain("TODO");
  expect(readFileSync("packaging/msix/launcher/app.manifest", "utf8")).toContain('level="asInvoker"');
  const launcher = readFileSync("packaging/msix/launcher/Launcher.cs", "utf8");
  for (const s of ['EnvironmentVariables["SHE_INSTALLED"] = "1"', "psi.CreateNoWindow = true", 'psi.EnvironmentVariables.Clear();', "IPAddress.Loopback", "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE", "LocalState"])
    expect(launcher).toContain(s);
  // H7: NODE_OPTIONS is removed by clearing the whole environment before the allow-list (V8-H09 runs it for real).
  expect(launcher).not.toMatch(/EnvironmentVariables\["NODE_[A-Z_]+"\] = (?!"production")/);
  const build = readFileSync("scripts/build-msix-v8.mjs", "utf8");
  expect(build).toMatch(/const absent = \[[^\]]*"korean-law-mcp", "playwright-core"/);
  expect(build).toMatch(/const shipped = \["pdfjs-dist"\];/);
  expect(build).not.toMatch(/cpSync\([^)]*(tests|docs|\.local|work|\.env)/);
});

it.runIf(existsSync(".local/msix/stage/AppxManifest.xml"))("V8-M07: 로컬에서 만든 패키지 폴더에 시험·문서·개발 스크립트·.env·인증서가 없다", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d, { withFileTypes: true })) n.isDirectory() ? walk(join(d, n.name)) : files.push(join(d, n.name).replace(/\\/g, "/")); };
  walk(".local/msix/stage");
  expect(files.filter((f) => /\/(tests|docs|\.git|\.local|work)\/|\/scripts\/|\.env|\.(pfx|pem|key|sqlite)$/.test(f.replace(".local/msix/stage", "")))).toEqual([]);
  // Off in the installed build, so not shipped; the isolated parser workers load only vendor/ files they may read.
  expect(files.filter((f) => /playwright|korean-law-mcp/.test(f))).toEqual([]);
  for (const w of ["parse-worker.js", "parser-worker-v5.js"])
    expect([...readFileSync(".local/msix/stage/app/server/" + w, "utf8").matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith("vendor/"))).toEqual([]);
});

it("V8-M08: 설치판은 국민신문고 계정 자동 수집을 서버에서 막고(설정·승낙 파일로도 못 켬), 국민신문고로 나가는 요청은 0건이며 허용 목록에도 없다", async () => {
  vi.stubEnv("SHE_INSTALLED", "1");
  const network = vi.mocked(fetch); // the synthetic network stub; the guard wraps it
  const guard = new EgressGuard().install();
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    // A complete, unexpired permission/selector file — the strongest input the old path accepted.
    const config = { permissionReference: "TEST-ONLY-NOT-REAL-PERMISSION", approvedBy: "가상 운영기관", permissionExpiresAt: "2099-01-01T00:00:00.000Z",
      permittedScope: "own", loginUrl: "https://www.epeople.go.kr/test-login", listUrl: "https://www.epeople.go.kr/test-list", selectorVersion: "fixture-1",
      selectorsVerifiedAt: new Date().toISOString(), selectors: Object.fromEntries(["loggedIn", "items", "next", "title", "question", "answer", "agency", "responseDate"].map((k) => [k, ".fixture"])),
      maxPages: 1, delayMs: 2000 };
    t.store.put("settings", "petitions.enabled", true); // no such switch exists; even a planted setting changes nothing
    const connect = await app.inject({ method: "POST", url: "/api/petitions/connect", headers, payload: config });
    const collect = await app.inject({ method: "POST", url: "/api/petitions/collect", headers, payload: {} });
    for (const r of [connect, collect]) expect([r.statusCode, r.json().error]).toEqual([403, PETITION_OFF_MESSAGE]);
    expect(PETITION_OFF_MESSAGE.startsWith("설치판에서는 지원하지 않습니다")).toBe(true);
    const status = (await app.inject({ url: "/api/status", headers })).json();
    expect(status.petition.enabled).toBe(false);
    // The allow-list no longer contains 국민신문고: any server-side request there is refused before a connection opens.
    expect(classifyHost("www.epeople.go.kr")).toBe("blocked");
    await expect(fetch("https://www.epeople.go.kr/")).rejects.toThrow(EgressBlocked);
    expect(guard.records.filter((r) => r.host.endsWith("epeople.go.kr") && r.allowed)).toEqual([]);
    expect(network.mock.calls.filter(([u]) => String(u).includes("epeople"))).toEqual([]); // nothing reached the network layer
  } finally {
    guard.uninstall();
    await app.close();
    t.clean();
  }
});

it("V8-M09: 패키지 검사 예외 목록은 외부 라이브러리 경로에만 적용되고, 승인된 항목 수를 넘지 않으며, 파일 자체에 이름·이메일·키 모양 글자가 없다", () => {
  const ex = JSON.parse(readFileSync("packaging/msix/scan-exceptions.json", "utf8"));
  expect(ex.libraryPaths).toEqual(["app/node_modules/", "app/server/vendor/", "THIRD_PARTY_NOTICES.txt"]);
  for (const e of ex.entries) {
    expect(inLibraryPath(e.file, ex), e.file).toBe(true);
    expect(e.reason).toMatch(/^third-party-(license-notice|library-file|code-in-bundle)/);
    expect(e.valueSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  // The user approved 194 matches on 2026-10-14; the list may only shrink.
  expect(ex.entries.reduce((n: number, e: { count: number }) => n + e.count, 0)).toBeLessThanOrEqual(194);
  // The scanner's own self-check of the list (e-mail, user path, key patterns, and names from SHE_SCAN_NAMES / .local) passes.
  const empty = mkdtempSync(join(tmpdir(), "v8-empty-"));
  try {
    const r = spawnSync(process.execPath, ["scripts/package-scan.mjs", empty, "--package", "--allow", "packaging/msix/scan-exceptions.json"], { encoding: "utf8" });
    expect([r.status, r.stderr]).toEqual([0, ""]);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

it("V8-M10: 제작자 쪽 공개 법령 갱신은 예약 없이 수동 실행만 하고, 데이터 처리 안내는 자동 갱신을 말하지 않으며 이 PC 자료의 생성일을 보여 준다", async () => {
  const wf = readFileSync(".github/workflows/public-law-sync.yml", "utf8");
  expect(wf).not.toMatch(/^\s*schedule:/m);
  expect(wf).not.toMatch(/^\s*-\s*cron:/m);
  expect(wf).toMatch(/^\s*workflow_dispatch:/m);
  const t = testStore();
  const { app, headers } = await open(t.store);
  try {
    const notice = async () => NoticeSchema.parse((await app.inject({ url: "/api/beta/notice", headers })).json()).items.find((i) => i.title === "공개 법령 자료 갱신 주기")!;
    expect((await notice()).text).not.toMatch(/매주|자동으로 갱신|예약 실행/);
    expect((await notice()).text).toContain("새 앱 버전을 낼 때 그때의 공개 법령 자료가 함께 들어갑니다");
    expect((await notice()).text).not.toContain("생성일");
    t.store.put("settings", "public-bundle-status", { importedAt: "2026-10-14T00:00:00.000Z", publishedAt: "2026-10-13T20:00:00.000Z", count: 1 });
    expect((await notice()).text).toContain("생성일 2026-10-14"); // Korean date of 20:00 UTC
    expect((await notice()).text).toContain("설치판은 이 자료를 인터넷으로 받아오지 않습니다");
  } finally {
    await app.close();
    t.clean();
  }
});

import { it, expect, vi, afterEach } from "vitest";
import { fork } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testStore } from "./helpers.js";

// F-03 (docs/implementation-v8/security-review-plan.md 9절): the upload path (POST /api/documents → ingestDocument →
// extractDocument → parse-worker) runs under the same isolation as the v5 parser: Node permission model and the H7
// allow-list environment. Synthetic data and public sample documents only.

const forks = vi.hoisted(() => [] as { path: string; opts: { execArgv?: string[]; env?: Record<string, string> } }[]);
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, fork: (...a: Parameters<typeof real.fork>) => { forks.push({ path: String(a[0]), opts: (a[2] ?? {}) as never }); return real.fork(...a); } };
});
afterEach(() => { vi.unstubAllEnvs(); forks.length = 0; });

const HOST = "127.0.0.1:4317";
function multipart(name: string, bytes: Buffer) {
  const boundary = "----synthetic" + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

it("V8-W01: 실제 업로드 경로(POST /api/documents)는 --permission·허용 목록 환경의 격리 작업 프로세스로 판독하고, 결과는 그대로다", async () => {
  const { createApp } = await import("../server/app.js");
  const { LIBUV_FILLED } = await import("../server/child-env-v8.js");
  vi.stubEnv("SHE_SYNTHETIC_SENTINEL", "synthetic-parent-only");
  const t = testStore();
  const { app } = await createApp(t.store, true);
  try {
    const boot = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    const cookie = `${boot.cookies[0].name}=${boot.cookies[0].value}`, csrf = boot.json().csrf;
    const { body, type } = multipart("notice.hwpx", readFileSync("docs/implementation-v5/official/notice.hwpx"));
    const r = await app.inject({ method: "POST", url: "/api/documents", payload: body, headers: { host: HOST, cookie, "x-csrf-token": csrf, "content-type": type } });
    expect(r.statusCode).toBe(200);
    expect(r.json().text).toContain("2025년 1월 2일");
    expect(r.json().text.length).toBe(26213);
    expect(forks).toHaveLength(1);
    const { path, opts } = forks[0];
    expect(path).toMatch(/parse-worker\.(ts|js)$/);
    expect(opts.execArgv?.[0]).toBe("--permission");
    // Reads are limited to the worker file, its vendor folder and node_modules; nothing grants writes, children or addons.
    for (const a of opts.execArgv!.slice(1)) expect(a).toMatch(/^--allow-fs-read=|^--max-old-space-size=256$/);
    expect(opts.execArgv!.filter((a) => a.startsWith("--allow-fs-read=")).map((a) => a.slice(16)).every((p) => p === path || /node_modules$|vendor$/.test(p))).toBe(true);
    expect(Object.keys(opts.env!).sort()).toEqual(process.platform === "win32" ? [...LIBUV_FILLED].sort() : ["PATH"]);
    expect(JSON.stringify(opts.env)).not.toContain("synthetic-parent-only");
  } finally {
    await app.close();
    t.clean();
  }
}, 60000);

it("V8-W02: 같은 격리 옵션으로 띄운 작업 프로세스는 허용 밖 파일을 읽지 못하고, 쓰기·자식 프로세스가 거부되며, 부모의 감시 환경 변수를 보지 못한다", async () => {
  const { isolatedWorkerOptions } = await import("../server/extraction-v5.js");
  const dir = mkdtempSync(join(tmpdir(), "she-w02-"));
  try {
    const secret = join(dir, "outside-secret.txt"), probe = join(dir, "probe.cjs"), written = join(dir, "written.txt");
    writeFileSync(secret, "SYNTHETIC-OUTSIDE-FILE");
    writeFileSync(probe, `
      const fs = require("node:fs"), cp = require("node:child_process");
      const tryIt = (f) => { try { f(); return "allowed"; } catch (e) { return e.code || "error"; } };
      process.send({
        read: tryIt(() => fs.readFileSync(${JSON.stringify(secret)})),
        write: tryIt(() => fs.writeFileSync(${JSON.stringify(written)}, "x")),
        child: tryIt(() => cp.spawnSync(process.execPath, ["-e", "0"])),
        sentinel: process.env.SHE_SYNTHETIC_SENTINEL ?? null,
        nodeOptions: process.env.NODE_OPTIONS ?? null,
      }, () => process.exit(0));`);
    vi.stubEnv("SHE_SYNTHETIC_SENTINEL", "synthetic-parent-only");
    const result = await new Promise<Record<string, string | null>>((done, fail) => {
      const c = fork(probe, [], { ...isolatedWorkerOptions(probe), stdio: ["ignore", "ignore", "ignore", "ipc"] });
      c.once("message", (m) => done(m as never));
      c.once("error", fail);
    });
    expect(result).toEqual({ read: "ERR_ACCESS_DENIED", write: "ERR_ACCESS_DENIED", child: "ERR_ACCESS_DENIED", sentinel: null, nodeOptions: null });
    expect(existsSync(written)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

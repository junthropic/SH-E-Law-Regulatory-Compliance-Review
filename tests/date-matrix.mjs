// Date × time × timezone matrix for the full Vitest suite. Test tooling only; it does not touch app code.
// Usage: node tests/date-matrix.mjs [outDir]   (run `npm run build` first; process tests read build/)
// Optional filters: SHE_MATRIX_DATES=2026-10-31,2027-01-01  SHE_MATRIX_TIMES=09:00:00  SHE_MATRIX_TZS=UTC
// Optional extra Vitest arguments (whitespace-separated): SHE_MATRIX_VITEST_ARGS="--maxWorkers=2"
// Each run sets SHE_TEST_NOW (explicit +09:00 offset) and TZ; vitest.config.ts turns that into one clock
// offset shared by every test worker and Node child. The clock keeps advancing during the run, so a run
// that starts at KST 08:59:59 crosses 09:00 almost at once; exact boundary checks live in date-boundary.test.ts.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import os from "node:os";

const list = (v, d) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);
const dates = list(process.env.SHE_MATRIX_DATES, ["2026-10-31", "2026-12-31", "2027-01-01", "2028-02-29", "2027-01-09"]);
const times = list(process.env.SHE_MATRIX_TIMES, ["00:00:00", "08:59:59", "09:00:00"]);
const tzs = list(process.env.SHE_MATRIX_TZS, ["UTC", "Asia/Seoul"]);
const out = resolve(process.argv[2] ?? "work/date-matrix");
mkdirSync(out, { recursive: true });
if (!existsSync(resolve("build/server/store.js"))) throw new Error("build/ is missing: run `npm run build` first");
const vitest = resolve("node_modules/vitest/vitest.mjs");
const vitestArgs = (process.env.SHE_MATRIX_VITEST_ARGS ?? "").split(/\s+/).filter(Boolean);

const rows = [];
for (const d of dates)
  for (const t of times)
    for (const tz of tzs) {
      const input = `${d}T${t}+09:00`;
      const id = `${d}_${t.replaceAll(":", "")}_${tz.replace("/", "-")}`;
      const clockLog = join(out, id + ".clock.jsonl");
      const report = join(out, id + ".json");
      writeFileSync(clockLog, "");
      const env = { ...process.env, SHE_TEST_NOW: input, TZ: tz, SHE_TEST_CLOCK_LOG: clockLog };
      delete env.SHE_TEST_CLOCK_OFFSET_MS; // computed once per run by vitest.config.ts
      const startedReal = new Date().toISOString();
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [vitest, "run", ...vitestArgs, "--reporter=json", "--outputFile=" + report], {
        env,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 256 * 1024 * 1024,
      });
      const ms = Date.now() - t0;
      writeFileSync(join(out, id + ".stderr.txt"), r.stderr ?? "");
      let res = null;
      try {
        res = JSON.parse(readFileSync(report, "utf8"));
      } catch {}
      const clocks = readFileSync(clockLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const offsets = [...new Set(clocks.map((c) => c.offsetMs))];
      const workers = clocks.filter((c) => /vitest[\\/]dist[\\/]workers/.test(c.argv1 ?? ""));
      const children = clocks.filter((c) => !/vitest[\\/]dist[\\/]workers/.test(c.argv1 ?? ""));
      const observed = clocks.map((c) => c.observedUtc).sort();
      const failed = [];
      for (const f of res?.testResults ?? [])
        for (const a of f.assertionResults)
          if (a.status === "failed") {
            // First line of the failure keeps timeouts and assertion errors apart in the summary.
            const why = String(a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 160);
            failed.push(f.name.split(/[\\/]/).pop() + " › " + a.fullName + " — " + why + ` (${Math.round(a.duration ?? 0)}ms)`);
          }
      const row = {
        id,
        input,
        tz,
        startedReal,
        durationMs: ms,
        exitCode: r.status,
        total: res?.numTotalTests ?? null,
        passed: res?.numPassedTests ?? null,
        failed: res?.numFailedTests ?? null,
        skipped: (res?.numPendingTests ?? 0) + (res?.numTodoTests ?? 0),
        clockProcesses: clocks.length,
        workerProcesses: workers.length,
        childProcesses: children.length,
        distinctOffsets: offsets,
        firstObservedUtc: observed[0] ?? null,
        lastObservedUtc: observed.at(-1) ?? null,
        firstObservedKst: observed[0] ? new Date(Date.parse(observed[0]) + 9 * 3600000).toISOString().replace("Z", "+09:00") : null,
        tzResolved: [...new Set(clocks.map((c) => c.tzResolved))],
        failedTests: failed,
      };
      rows.push(row);
      console.log(
        `${id}: ${row.passed}/${row.total} passed, ${row.failed} failed, ${row.skipped} skipped, ` +
          `${row.clockProcesses} clock procs (${row.childProcesses} children), offsets=${offsets.length}, ${ms}ms`,
      );
    }

const meta = { node: process.version, platform: process.platform, release: os.release(), vitestArgs, generatedReal: new Date().toISOString() };
writeFileSync(join(out, "summary.json"), JSON.stringify({ meta, rows }, null, 2));
const md = [
  `# Date matrix (${meta.platform}, Node ${meta.node})`,
  "",
  "| input (KST) | TZ | passed/total | failed | skipped | clock procs (children) | one offset | first observed (KST) | resolved TZ |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.input} | ${r.tz} | ${r.passed}/${r.total} | ${r.failed} | ${r.skipped} | ${r.clockProcesses} (${r.childProcesses}) | ${r.distinctOffsets.length === 1 ? "yes" : "NO"} | ${r.firstObservedKst} | ${r.tzResolved.join(",")} |`,
  ),
  "",
  ...rows.filter((r) => r.failedTests.length).flatMap((r) => [`## ${r.id} failures`, ...r.failedTests.map((f) => "- " + f), ""]),
];
writeFileSync(join(out, "summary.md"), md.join("\n") + "\n");
const bad = rows.filter((r) => r.failed !== 0 || r.exitCode !== 0 || r.distinctOffsets.length !== 1);
console.log(`\n${rows.length} runs, ${bad.length} with failures or clock mismatch. Summary: ${join(out, "summary.md")}`);
process.exitCode = bad.length ? 1 : 0;

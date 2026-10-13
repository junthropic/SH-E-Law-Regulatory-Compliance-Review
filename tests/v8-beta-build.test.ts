import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { betaSourceDigest } from "../scripts/beta-digest-v8.mjs";

// dist-beta/ is committed (the frozen package.json build does not build it). These checks keep it in step
// with beta/ sources: rebuild with `node scripts/build-beta-v8.mjs` after any beta source change.
it("V8-W02: 커밋된 dist-beta는 지금의 beta 소스로 만든 것이고, 베타 화면 소스는 타입 검사를 통과한다", () => {
  const info = JSON.parse(readFileSync("dist-beta/build-info.json", "utf8"));
  const now = betaSourceDigest();
  expect(now.files.map((f) => f.path)).toEqual(info.files.map((f: { path: string }) => f.path));
  expect(now.sourceDigest).toBe(info.sourceDigest);
  const html = readFileSync("dist-beta/index.html", "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/beta\/assets\/[^"]+)"/g)].map((m) => m[1]);
  expect(refs.length).toBe(2);
  for (const r of refs) expect(existsSync("dist-beta" + r.slice("/beta".length))).toBe(true);
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.beta.json"], { stdio: "pipe", windowsHide: true });
}, 30000);

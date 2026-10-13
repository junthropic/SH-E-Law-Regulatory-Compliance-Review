import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// v8 stage 3 re-freeze: the 29 v6 frozen UI files and the new beta screen files must stay byte-identical
// (line endings normalised). Changing one requires the user's approval and a new docs/implementation-v8/ui-freeze-v8.json.
it("V8-U01: 동결 목록(기존 29개 + 베타 화면)의 모든 파일이 기록된 hash와 같다", () => {
  const freeze = JSON.parse(readFileSync("docs/implementation-v8/ui-freeze-v8.json", "utf8"));
  expect(freeze.counts.v6).toBe(29);
  expect(freeze.files.length).toBe(freeze.counts.total);
  const changed = freeze.files.filter((f: { path: string; hash: string }) =>
    createHash("sha256").update(readFileSync(f.path, "utf8").replaceAll("\r\n", "\n")).digest("hex") !== f.hash);
  expect(changed.map((f: { path: string }) => f.path)).toEqual([]);
});

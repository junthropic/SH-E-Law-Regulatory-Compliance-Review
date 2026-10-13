// v8 stage 3 re-freeze: record SHA-256 (line endings normalised) of the 29 frozen UI files from v6 plus the new
// beta screen files. tests/v8-ui-freeze.test.ts fails if any listed file changes afterwards.
// Usage: node scripts/freeze-ui-v8.mjs   (run once when the beta screens are final; re-run only with approval)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name).replaceAll("\\", "/");
  return e.isDirectory() ? walk(p) : [p];
});
const v6 = JSON.parse(readFileSync("docs/implementation-v6/baseline.json", "utf8")).frozen.map((f) => f.path);
// dist/ asset names change with their content; the v6 list names the current files.
const added = [...walk("beta"), ...walk("dist-beta"), "vite.beta.config.ts", "tsconfig.beta.json", "server/beta-contract-v8.ts"].sort();
const hash = (path) => createHash("sha256").update(readFileSync(path, "utf8").replaceAll("\r\n", "\n")).digest("hex");
const files = [...v6.map((path) => ({ path, set: "v6-frozen-29" })), ...added.map((path) => ({ path, set: "v8-beta" }))]
  .map((f) => ({ ...f, hash: hash(f.path) }));
writeFileSync("docs/implementation-v8/ui-freeze-v8.json", JSON.stringify({
  frozenAt: new Date().toISOString().slice(0, 10),
  rule: "이 목록의 파일은 수정하지 않는다. 바꿔야 하면 사용자 승인 후 동결을 풀고 이 파일을 다시 만든다.",
  hash: "sha256, CRLF→LF 정규화",
  counts: { v6: v6.length, v8Beta: added.length, total: files.length },
  files,
}, null, 2) + "\n");
console.log(JSON.stringify({ v6: v6.length, v8Beta: added.length }));

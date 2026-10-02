import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { BundleSchema } from "../server/schemas.js";
import { sha } from "../server/store.js";

const root = resolve("data/public");
for (const name of readdirSync(root))
  if (!["bundle.json", "README.md"].includes(name))
    throw new Error("공개 데이터 경로에 허용되지 않은 파일: " + name);
const input = JSON.parse(readFileSync(join(root, "bundle.json"), "utf8"));
const parsed = BundleSchema.parse(input);
if (JSON.stringify(input) !== JSON.stringify(parsed))
  throw new Error("공개 데이터 스키마 외 필드 포함");
for (const e of parsed.evidence) {
  const url = new URL(e.url);
  if (
    !["law", "ordinance"].includes(e.kind) ||
    url.hostname !== "www.law.go.kr" ||
    url.searchParams.has("OC") ||
    url.username ||
    url.password ||
    sha(e.text) !== e.hash ||
    e.verified
  )
    throw new Error("공개 법규 데이터 검증 실패: " + e.id);
}
for (const s of parsed.sources)
  if (s.verified) throw new Error("자동 수집 자료에 검증 완료 표시 금지");
console.log(
  "공개 데이터 형식·출처·해시·검증 상태 확인 완료 (" +
    parsed.evidence.length +
    "개)",
);

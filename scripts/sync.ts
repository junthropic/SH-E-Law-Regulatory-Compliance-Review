import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Store, atomicJson } from "../server/store.js";
import { syncSources } from "../server/sources.js";
import type { Evidence } from "../shared/types.js";

const oc = process.env.LAW_OC;
if (!oc)
  throw new Error(
    "LAW_OC 환경변수가 필요합니다. 수집 실패를 빈 데이터로 덮어쓰지 않습니다.",
  );
// A fresh isolated database is essential: private application data never enters this exporter.
const store = new Store(mkdtempSync(join(tmpdir(), "she-public-sync-")));
const destination = resolve("data/public/bundle.json");
try {
  if (existsSync(destination)) store.importPublic(destination);
  const outcomes = await syncSources(store, oc, undefined, (message) =>
    console.log(message),
  );
  const evidence = store
    .all<Evidence>("evidence")
    .map((e) => ({
      ...e,
      verified: false,
      verificationNote: "공식 API 수집 자료. 현장 검증 전.",
    }));
  const bundle = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    evidence,
    sources: store.sources().map((s) => ({ ...s, verified: false })),
  };
  mkdirSync(resolve("data/public"), { recursive: true });
  atomicJson(destination, bundle);
  const failed = outcomes.filter((o) => o.status !== "ok");
  console.log(
    JSON.stringify({
      success: outcomes.length - failed.length,
      failed: failed.map((s) => s.region),
      documents: evidence.length,
    }),
  );
  if (failed.length) process.exitCode = 2;
} finally {
  store.close();
}

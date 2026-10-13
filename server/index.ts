import { createApp } from "./app.js";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createLegacyRedirect } from "./legacy-address.js";
import { Store } from "./store.js";
import { openProductionCipher } from "./storage-crypto-v8.js";
import { migrateToEncrypted } from "./storage-migration-v8.js";
import { EgressGuard } from "./egress-guard-v8.js";
import { purgeExpired } from "./retention-v8.js";
import { safeMessage } from "./redact-v8.js";
import type { AiConsent } from "./ai-consent-v8.js";
// Errors that escape every handler are printed without paths or values, then the process stops.
process.on("uncaughtException", (e) => {
  console.error("SH·E 오류: " + safeMessage(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  console.error("SH·E 오류: " + safeMessage(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
// Outbound allow-list: installed before any module captures fetch. AI hosts need consent + an approved preview.
let consent: AiConsent | undefined;
new EgressGuard((url, method, body) => consent?.authorize(url, method, body) ?? false).install();
const dataDir = resolve(process.env.SHE_DATA_DIR || ".local");
mkdirSync(dataDir, { recursive: true });
const cipher = await openProductionCipher(dataDir);
const { app, store, aiConsent } = await createApp(new Store(dataDir, { cipher }));
consent = aiConsent;
if (cipher) migrateToEncrypted(store);
// Optional automatic deletion of uploaded originals (default off): at start-up and once a day.
purgeExpired(store);
setInterval(() => purgeExpired(store), 86400000).unref();
try {
  store.importPublic(resolve("data/public/bundle.json"));
} catch {
  store.audit("bundle_import", "공개 자료 가져오기 실패. 기존 자료 보존.");
}
for (const r of store.all<any>("reviews"))
  if (r.status === "running") {
    r.status = "failed";
    r.error = "이전 실행이 종료되었습니다. 새 검토로 재시도하세요.";
    store.saveReview(r);
  }
const legacy =
  Number(process.env.PORT || 4317) === 4317 ? createLegacyRedirect() : null;
if (legacy)
  app.addHook("onClose", async () => {
    await legacy.close();
  });
await app.listen({ port: Number(process.env.PORT || 4317), host: "127.0.0.1" });
if (legacy) {
  try {
    await legacy.listen({ port: 4327, host: "127.0.0.1" });
  } catch {
    await legacy.close();
    console.warn(
      "이전 주소 4327의 자동 이동을 시작하지 못했습니다. 실제 앱은 4317을 사용하세요.",
    );
  }
}
console.log("SH·E ready: http://127.0.0.1:" + (process.env.PORT || 4317));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close();
  });

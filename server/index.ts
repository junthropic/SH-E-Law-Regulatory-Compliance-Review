import { createApp } from "./app.js";
import { resolve } from "node:path";
const { app, store } = await createApp();
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
await app.listen({ port: Number(process.env.PORT || 4317), host: "127.0.0.1" });
console.log("SH·E ready: http://127.0.0.1:" + (process.env.PORT || 4317));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close();
  });

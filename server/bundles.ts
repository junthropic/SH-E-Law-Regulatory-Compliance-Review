import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.js";
import { randomUUID } from "node:crypto";
import { MAX_PUBLIC_DOWNLOAD } from "./public-bundle.js";
export async function updatePublicBundle(
  store: Store,
  fetcher: typeof fetch = fetch,
) {
  const base =
    "https://raw.githubusercontent.com/junthropic/SH-E-Law-Check/main/data/public/bundle.json";
  let compressed = true;
  let r = await fetcher(base + ".gz", {
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (r.status === 404) {
    await r.body?.cancel();
    compressed = false;
    r = await fetcher(base, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  }
  if (!r.ok)
    throw new Error("Git 공개 자료를 가져오지 못했습니다 (" + r.status + ").");
  const reader = r.body?.getReader();
  if (!reader) throw new Error("공개 자료 응답 없음");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PUBLIC_DOWNLOAD) throw new Error("공개 자료 크기 초과");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const path = join(
    store.dir,
    "public-import-" + randomUUID() + (compressed ? ".json.gz" : ".json"),
  );
  try {
    writeFileSync(path, Buffer.concat(chunks));
    store.importPublic(path);
  } finally {
    unlinkSync(path);
  }
  store.audit("public_bundle_update", "GitHub main의 공개 법규만 가져옴");
  return { ok: true };
}

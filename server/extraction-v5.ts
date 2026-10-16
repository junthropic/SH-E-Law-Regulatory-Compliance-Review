import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { nodeWorkerEnv } from "./child-env-v8.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { sha } from "./store.js";
import type { Extraction } from "./extraction.js";

// Path of a parser worker that sits next to this module (server/*.ts in development, app/server/*.js when packaged).
export const workerPath = (name: string) => fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? `./${name}.ts` : `./${name}.js`, import.meta.url));

// Isolation for every document parser worker (F-03): Node permission model — read only the worker file, its bundled
// vendor/ files and node_modules; no writes, network, child processes or addons — a 256 MB heap, and the H7 allow-list
// environment (trusted SystemRoot, empty PATH; no NODE_OPTIONS/TLS/proxy variables from the parent).
export function isolatedWorkerOptions(worker: string) {
  let ancestor=dirname(worker);while(!existsSync(resolve(ancestor,"node_modules"))&&dirname(ancestor)!==ancestor)ancestor=dirname(ancestor);
  const alias=resolve(ancestor,"node_modules");
  // The installed (MSIX) build bundles kordoc into server/vendor/ next to the worker; only its external pdfjs-dist stays in node_modules.
  let modules=alias;try{modules=resolve(dirname(createRequire(import.meta.url).resolve("kordoc")),"../..");}catch{}
  const vendor=resolve(dirname(worker),"vendor");
  return { windowsHide: true, env: nodeWorkerEnv(),
    execArgv: ["--permission", `--allow-fs-read=${worker}`, ...(existsSync(vendor)?[`--allow-fs-read=${vendor}`]:[]), `--allow-fs-read=${modules}`, `--allow-fs-read=${alias}`, "--max-old-space-size=256"] };
}

export async function isolatedParse(bytes: Buffer, signal?: AbortSignal): Promise<Extraction> {
  if (bytes.length > 20_000_000) return Promise.reject(Error("문서 용량 초과"));
  signal?.throwIfAborted();
  const worker = workerPath("parser-worker-v5");
  const options = isolatedWorkerOptions(worker);
  return new Promise((done, fail) => {
    const child = fork(worker, [], { ...options, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    let result: Extraction | undefined, error: Error | undefined;
    const stop = () => { error = Error("문서 추출 취소"); child.kill(); };
    const timer = setTimeout(() => { error = Error("문서 추출 시간 한도 초과"); child.kill(); }, 30000);
    signal?.addEventListener("abort", stop, { once: true });
    child.once("error", () => { error = Error("격리 파서 실행 실패"); });
    child.once("message", (m: any) => { if (m?.success === true && typeof m.markdown === "string" && Array.isArray(m.warnings)) result = m; else error = Error(m?.reason==="archive_safety"?"문서 압축 안전성 확인 필요":"문서 형식 또는 파서 지원 확인 필요"); child.kill(); });
    child.once("close", () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); if (error || !result) fail(error || Error("격리 파서 실행 실패")); else done(result); });
    child.send(bytes.toString("base64"), e => { if (e) { error = Error("격리 파서 전달 실패"); child.kill(); } });
  });
}
export async function parseProtected(p: Principal, vault: ProtectedPayloads, attachment: string, signal?: AbortSignal) {
  assertPrincipal(p);
  const raw = vault.get(p, attachment, "attachment"), hash = sha(raw), graph = new PayloadProvenance(vault.store);
  const parent = graph.input(p, raw.toString("base64"));
  const image = raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || raw[0] === 255 && raw[1] === 216;
  const result = image ? { success: true, markdown: "", warnings: [{ message: "이미지 OCR 엔진과 원본 대조가 필요합니다." }] } : await isolatedParse(raw, signal);
  signal?.throwIfAborted(); assertPrincipal(p);
  const body = { version: "protected-extraction-v5.1", rawRef: attachment, rawHash: hash, markdown: result.markdown, warnings: result.warnings,
    status: image || !result.markdown.trim() ? "needs_ocr" : "extracted_unreviewed", resourcePermissions:(result as any).resourcePermissions??null, pageCoordinates: null, cellsVerified: false, siteFactsConfirmed: false };
  const serialized = JSON.stringify(body), node = graph.derive(p, serialized, [parent], "protected-parser-v5");
  return { ref: vault.put(p, "unit", Buffer.from(serialized), 7 * 86400000), node, parent, rawHash: hash, status: body.status, textHash: sha(result.markdown), legalApproval: false };
}

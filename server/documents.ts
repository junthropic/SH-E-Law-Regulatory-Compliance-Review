import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { extractDocument } from "./extraction.js";
import { Store, sha } from "./store.js";
import type { DocumentRecord } from "../shared/types.js";
import { deleteDocument } from "./retention-v8.js";
export async function ingestDocument(
  store: Store,
  name: string,
  buffer: Buffer,
): Promise<DocumentRecord> {
  name = basename(name);
  const ext = extname(name).toLowerCase();
  if (![".txt", ".pdf", ".hwp", ".hwpx", ".docx"].includes(ext))
    throw new Error("PDF·HWP·HWPX·DOCX·TXT 파일만 지원합니다.");
  if (buffer.length > 20 * 1024 * 1024)
    throw new Error("파일당 20MB 이하만 지원합니다.");
  const hash = sha(buffer);
  const existing = store
    .all<DocumentRecord>("documents")
    .find((d) => d.hash === hash);
  if (existing) return existing;
  let text = "";
  const warnings: string[] = [];
  if (ext === ".txt")
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  else {
    const result = await extractDocument(buffer);
    text = result.markdown;
    warnings.push(...(result.warnings || []).map((w) => String(w.message)));
  }
  if (text.length > 1_500_000) {
    text = text.slice(0, 1_500_000);
    warnings.push(
      "문서가 너무 커 추출문이 잘렸습니다. 문서를 나누어 다시 올리세요.",
    );
  }
  if (!text.trim())
    warnings.push(
      "텍스트를 추출하지 못했습니다. OCR 또는 원문 확인이 필요합니다.",
    );
  warnings.push(
    "표·수치·단위·날짜를 원본과 대조한 뒤 추출문 확인을 완료하세요.",
  );
  // Another request may have finished parsing the same bytes while we awaited extraction.
  const duplicate = store
    .all<DocumentRecord>("documents")
    .find((d) => d.hash === hash);
  if (duplicate) return duplicate;
  const doc: DocumentRecord = {
    id: randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    type: ext,
    text,
    hash,
    warnings,
    confirmed: false,
    agency: "",
    responseDate: "",
    region: "",
  };
  store.writeOriginal(doc.id + ext, buffer);
  try {
    store.put("documents", doc.id, doc);
  } catch (error) {
    unlinkSync(join(store.dir, "originals", doc.id + ext));
    throw error;
  }
  return doc;
}
// v8: deletion goes through retention-v8 (deletion log, review marking, WAL flush).
export function removeDocument(store: Store, id: string) {
  deleteDocument(store, id);
}

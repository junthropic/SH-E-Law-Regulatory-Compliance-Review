import { existsSync, unlinkSync } from "node:fs";
import type { DocumentRecord, ReviewResult } from "../shared/types.js";
import { Store } from "./store.js";

// v8 retention for the installed app. Default: keep everything (sealed at rest).
// Optional automatic deletion of uploaded originals after 30/90/365 days, manual permanent deletion,
// and a deletion log that records what and when — ids and kinds only, never content or file names.
export const RETENTION_CHOICES = [null, 30, 90, 365] as const;
export type RetentionDays = (typeof RETENTION_CHOICES)[number];
export const ORIGINAL_DELETED = "원본 삭제됨 — 재검토 불가";

function ensureLog(store: Store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS v8_deletion_log(id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
    ref TEXT NOT NULL, reason TEXT NOT NULL)`);
}
function logDeletion(store: Store, kind: string, ref: string, reason: string, at: Date) {
  ensureLog(store);
  store.db.prepare("INSERT INTO v8_deletion_log(at,kind,ref,reason) VALUES(?,?,?,?)").run(at.toISOString(), kind, ref, reason);
}
// Overwritten pages are zeroed (secure_delete); push the WAL into the main file and truncate it.
function flush(store: Store) {
  store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}
export function retentionDays(store: Store): RetentionDays {
  return store.setting<{ autoDeleteDays: RetentionDays }>("retention", { autoDeleteDays: null }).autoDeleteDays;
}
export function setRetentionDays(store: Store, days: RetentionDays) {
  if (!RETENTION_CHOICES.includes(days)) throw new Error("보존 기간은 계속 보관·30·90·365일 중에서 고르세요.");
  store.put("settings", "retention", { autoDeleteDays: days });
  return { autoDeleteDays: days };
}
export function deleteDocument(store: Store, id: string, reason = "manual", at = new Date()) {
  const d = store.document(id);
  if (!d) return false;
  const path = store.originalPath(d.id + d.type);
  if (existsSync(path)) unlinkSync(path);
  store.delete("documents", id);
  // Reviews that used this original can no longer be re-checked against it.
  for (const r of store.all<ReviewResult>("reviews"))
    if (r.request.documentIds.includes(id) && !r.gaps.includes(ORIGINAL_DELETED)) {
      r.gaps = [...r.gaps, ORIGINAL_DELETED];
      store.saveReview(r);
    }
  logDeletion(store, "document", id, reason, at);
  flush(store);
  return true;
}
export function deleteAllDocuments(store: Store, at = new Date()) {
  let n = 0;
  for (const d of store.all<DocumentRecord>("documents")) if (deleteDocument(store, d.id, "manual-all", at)) n++;
  return n;
}
export function deleteReview(store: Store, id: string, at = new Date()) {
  if (!store.review(id)) return false;
  store.delete("reviews", id);
  logDeletion(store, "review", id, "manual", at);
  flush(store);
  return true;
}
// Runs at start-up and once a day. `now` is injected so tests do not depend on the wall clock.
export function purgeExpired(store: Store, now = new Date()) {
  const days = retentionDays(store);
  if (!days) return 0;
  const cutoff = now.getTime() - days * 86400000;
  let n = 0;
  for (const d of store.all<DocumentRecord>("documents"))
    if (Date.parse(d.createdAt) < cutoff && deleteDocument(store, d.id, `auto-${days}d`, now)) n++;
  return n;
}
export function deletionLog(store: Store) {
  ensureLog(store);
  return store.db.prepare("SELECT at,kind,ref,reason FROM v8_deletion_log ORDER BY id").all();
}

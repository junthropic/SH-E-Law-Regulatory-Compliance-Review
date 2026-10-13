import { readdirSync, readFileSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Store, SEALED_TABLES, sha } from "./store.js";
import { isSealedText, isSealedBytes } from "./storage-crypto-v8.js";

export type MigrationReport = { rows: number; files: number; already: boolean };
// Test hook only: lets a test force a verification failure to prove the original survives.
export type MigrationFault = { row?: (table: string, id: string) => boolean; file?: (name: string) => boolean };

// One-time move of existing plaintext rows and originals to sealed form.
// Rows: rewritten inside one savepoint, read back and compared, then committed; any mismatch rolls back.
// Files: sealed copy written beside the original, read back and compared, then renamed over it.
// Afterwards free pages and the WAL are cleared so the old plaintext is not left on disk.
export function migrateToEncrypted(store: Store, fault: MigrationFault = {}): MigrationReport {
  const cipher = store.cipher;
  if (!cipher) throw new Error("저장 암호 키가 없어 이관할 수 없습니다.");
  let rows = 0, files = 0;
  store.db.exec("SAVEPOINT v8_encrypt");
  try {
    for (const table of SEALED_TABLES) {
      const key = table === "settings" ? "key" : "id";
      const plain = (store.db.prepare(`SELECT ${key} AS k, body FROM ${table}`).all() as { k: string; body: string }[])
        .filter((r) => !isSealedText(r.body));
      const update = store.db.prepare(`UPDATE ${table} SET body=? WHERE ${key}=?`);
      for (const r of plain) update.run(store.encodeBody(table, r.k, JSON.parse(r.body)), r.k);
      const read = store.db.prepare(`SELECT body FROM ${table} WHERE ${key}=?`);
      for (const r of plain) {
        const stored = (read.get(r.k) as { body: string }).body;
        const same = isSealedText(stored) &&
          JSON.stringify(store.decodeBody(table, r.k, stored)) === JSON.stringify(JSON.parse(r.body));
        if (!same || fault.row?.(table, r.k)) throw new Error("암호화 이관 검증 실패: " + table);
      }
      rows += plain.length;
    }
    store.db.exec("RELEASE v8_encrypt");
  } catch (error) {
    store.db.exec("ROLLBACK TO v8_encrypt; RELEASE v8_encrypt");
    throw error;
  }
  const dir = join(store.dir, "originals");
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    if (name.endsWith(".tmp")) continue;
    const path = store.originalPath(name), raw = readFileSync(path);
    if (isSealedBytes(raw)) continue;
    const tmp = path + ".v8.tmp";
    try {
      store.writeOriginal(name, raw, tmp);
      if (sha(store.cipher!.openBytes(readFileSync(tmp), "original\0" + name)) !== sha(raw) || fault.file?.(name))
        throw new Error("원본 암호화 이관 검증 실패");
      renameSync(tmp, path);
      files++;
    } catch (error) {
      if (existsSync(tmp)) unlinkSync(tmp);
      throw error;
    }
  }
  const already = rows === 0 && files === 0;
  if (!already) {
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);");
    store.audit("storage_encrypted", `행 ${rows}개, 원본 ${files}개 암호화 이관`);
  }
  store.put("settings", "storage-encryption", { cipherId: cipher.id, checkedAt: new Date().toISOString() });
  return { rows, files, already };
}

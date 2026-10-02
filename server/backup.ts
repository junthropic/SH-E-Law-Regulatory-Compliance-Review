import {
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store, sha } from "./store.js";
import { BackupSchema } from "./schemas.js";
import type { DocumentRecord } from "../shared/types.js";

export function makeBackup(store: Store) {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    reviews: store.all("reviews"),
    evidence: store.all("evidence"),
    sources: store.all("sources"),
    documents: store
      .all<DocumentRecord>("documents")
      .map((d) => ({
        ...d,
        original: readFileSync(
          join(store.dir, "originals", d.id + d.type),
        ).toString("base64"),
      })),
    rules: store.rules(),
  };
}
export function restoreBackup(store: Store, input: unknown) {
  // Validate the entire backup before touching either the database or originals.
  const b = BackupSchema.parse(input);
  for (const d of b.documents)
    if (sha(Buffer.from(d.original, "base64")) !== d.hash)
      throw new Error("백업 문서 무결성 오류");
  for (const e of b.evidence)
    if (sha(e.text) !== e.hash) throw new Error("법규 근거 해시 불일치");
  for (const r of b.reviews)
    for (const e of r.evidence)
      if (sha(e.text) !== e.hash) throw new Error("검토 근거 해시 불일치");
  const replaced: { path: string; old?: Buffer }[] = [];
  store.db.exec("SAVEPOINT restore");
  try {
    for (const d of b.documents) {
      const path = join(store.dir, "originals", d.id + d.type);
      replaced.push({
        path,
        old: existsSync(path) ? readFileSync(path) : undefined,
      });
      const tmp = path + "." + randomUUID() + ".tmp";
      writeFileSync(tmp, Buffer.from(d.original, "base64"), { mode: 0o600 });
      renameSync(tmp, path);
      const { original, ...doc } = d;
      store.put("documents", d.id, { ...doc, confirmed: false });
    }
    for (const e of b.evidence)
      store.saveEvidence(
        { ...e, verified: false, verificationNote: "백업 복원 후 재검증 필요" },
        false,
      );
    for (const r of b.reviews)
      store.saveReview({
        ...r,
        status: r.status === "running" ? "failed" : r.status,
        needsReview: true,
        coverage: { ...r.coverage, complete: false },
      });
    for (const s of b.sources)
      store.put("sources", s.id, { ...s, verified: false });
    for (const rule of b.rules)
      store.put("rules", rule.id, { ...rule, approved: false, reviewer: "" });
    store.db.exec("RELEASE restore");
  } catch (error) {
    store.db.exec("ROLLBACK TO restore; RELEASE restore");
    for (const f of replaced.reverse()) {
      if (f.old) writeFileSync(f.path, f.old);
      else if (existsSync(f.path)) unlinkSync(f.path);
    }
    throw error;
  }
  store.audit("private_restore", "자료 복원, 검증 상태 초기화");
  return { ok: true };
}

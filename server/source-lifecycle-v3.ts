import { z } from "zod";
import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
const event = z
  .object({
    sourceId: z.string().min(1).max(200),
    kind: z.enum([
      "not_returned",
      "temporary_error",
      "deleted",
      "publication_stopped",
      "private",
    ]),
    reason: z.string().min(15).max(3000),
    officialUrl: z.string().url().optional(),
    confirmed: z.boolean(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export class SourceLifecycle {
  constructor(readonly store: Store) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS v3_source_events(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,source TEXT,body TEXT)",
    );
  }
  record(p: Principal, input: unknown) {
    assertPrincipal(p);
    if (!p.roles.includes("extraction_reviewer"))
      throw new Error("원천 상태 검토 권한 필요");
    const e = event.parse(input);
    const tombstone =
      ["deleted", "publication_stopped", "private"].includes(e.kind) &&
      e.confirmed &&
      !!e.officialUrl;
    const body = {
        ...e,
        tombstone,
        preservePriorEvidence: true,
        automaticLegalEffect: false,
        actor: p.id,
        at: new Date().toISOString(),
      },
      id = sha(JSON.stringify([p.tenant, p.synthetic, body]));
    this.store.db
      .prepare("INSERT INTO v3_source_events VALUES(?,?,?,?,?)")
      .run(id, p.tenant, +p.synthetic, e.sourceId, JSON.stringify(body));
    return body;
  }
}

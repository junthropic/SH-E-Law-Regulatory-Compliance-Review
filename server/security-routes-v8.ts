import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Store } from "./store.js";
import { AiConsent } from "./ai-consent-v8.js";
import {
  RETENTION_CHOICES, retentionDays, setRetentionDays, purgeExpired, deleteAllDocuments,
  deleteReview, deletionLog, type RetentionDays,
} from "./retention-v8.js";

// v8 stage 1 endpoints: AI consent and send log, retention setting, permanent deletion and its log.
export function registerSecurityV8(app: FastifyInstance, store: Store, consent: AiConsent) {
  app.get("/api/ai/consent", async () => consent.status());
  app.post("/api/ai/consent", async (req) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    return enabled ? consent.enable() : consent.revoke();
  });
  app.get("/api/ai/send-log", async () => consent.log());
  app.get("/api/retention", async () => ({ autoDeleteDays: retentionDays(store), choices: RETENTION_CHOICES, log: deletionLog(store) }));
  app.post("/api/retention", async (req) => {
    const { autoDeleteDays } = z.object({ autoDeleteDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]) }).parse(req.body);
    return setRetentionDays(store, autoDeleteDays as RetentionDays);
  });
  app.post("/api/retention/purge", async () => ({ deleted: purgeExpired(store) }));
  app.delete("/api/reviews/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = store.review(id);
    if (r?.status === "running") throw new Error("진행 중인 검토는 삭제할 수 없습니다.");
    return deleteReview(store, id) ? { ok: true } : reply.code(404).send({ error: "검토 없음" });
  });
  app.post("/api/documents/delete-all", async (req) => {
    z.object({ confirm: z.literal("전체 삭제") }).parse(req.body);
    return { deleted: deleteAllDocuments(store) };
  });
}

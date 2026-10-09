import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { CollectionService } from "./collection-service-v3.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import { EgressGate } from "./egress-v3.js";
import { SourceLifecycle } from "./source-lifecycle-v3.js";
import {
  encryptedBackup,
  restoreEncrypted,
  recoverRestores,
} from "./backup-v3.js";
export function registerManagementV3(
  app: FastifyInstance,
  store: Store,
  grants: ReadonlyMap<string, Principal>,
  collection: CollectionService,
  backupKey?: { key: Buffer; id: string },
) {
  recoverRestores(store);
  app.register(
    async (api) => {
      api.setErrorHandler((e, _req, reply) => {
        const message = e instanceof Error ? e.message : "처리 실패";
        reply
          .code(
            e instanceof z.ZodError
              ? 400
              : /권한|영역/.test(message)
                ? 403
                : 400,
          )
          .send({
            error: e instanceof z.ZodError ? "입력 형식 확인 필요" : message,
          });
      });
      const actor = (header?: string) => {
        const token = /^Bearer (.+)$/.exec(header || "")?.[1],
          p = token ? grants.get(sha(token)) : undefined;
        if (!p || !p.validFrom || !p.expiresAt)
          throw new Error("업무 권한 인증 필요");
        assertPrincipal(p);
        return p;
      };
      api.addHook("preHandler", async (req) => {
        actor(req.headers.authorization);
      });
      api.post("/collections", async (req, reply) => {
        const b = z
          .object({
            service: z.string(),
            idempotencyKey: z.string(),
            query: z
              .object({
                keyword: z.string().max(100),
                mode: z.string().max(40),
                page: z.number().int().min(1),
                filters: z.record(z.string(), z.string()).optional(),
              })
              .strict(),
          })
          .strict()
          .parse(req.body);
        const job = await collection.enqueue(
          actor(req.headers.authorization),
          b.service,
          b.query,
          b.idempotencyKey,
        );
        return reply
          .code(202)
          .header("Location", "/api/management-v3/jobs/" + job.id)
          .send({
            jobId: job.id,
            state: job.state,
            statusUrl: "/api/management-v3/jobs/" + job.id,
          });
      });
      api.get("/jobs/:id", async (req) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
          p = actor(req.headers.authorization);
        return {
          job: collection.jobs.get(p, id),
          units: collection.jobs.units(p, id),
        };
      });
      api.post("/jobs/:id/control", async (req) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
          b = z
            .object({ action: z.enum(["pause", "resume", "cancel"]) })
            .strict()
            .parse(req.body);
        return collection.jobs.control(
          actor(req.headers.authorization),
          id,
          b.action,
        );
      });
      api.post("/quota/:id/release", async (req) => {
        const { id } = z
            .object({ id: z.string().regex(/^[a-f0-9]{64}$/) })
            .parse(req.params),
          b = z
            .object({
              note: z.string().min(15).max(3000),
              confirmation: z.string().url(),
            })
            .strict()
            .parse(req.body);
        return collection.jobs.manualRelease(
          actor(req.headers.authorization),
          id,
          b.note,
          b.confirmation,
        );
      });
      api.get("/reviews/:id/trace", async (req) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        return new LegacyBridge(store).trace(
          actor(req.headers.authorization),
          id,
        );
      });
      api.post("/egress", async (req) => {
        const b = z
          .object({
            digest: z.string(),
            purpose: z.enum([
              "review",
              "extract",
              "query",
              "ocr",
              "embedding",
              "tool",
              "upload",
            ]),
            provider: z.string().max(80),
            allowed: z.boolean(),
            basis: z.string().min(15).max(3000),
            expiresAt: z.string().datetime(),
          })
          .strict()
          .parse(req.body);
        new EgressGate(store).decide(
          actor(req.headers.authorization),
          b.digest,
          b.purpose,
          b.provider,
          b.allowed,
          b.basis,
          b.expiresAt,
        );
        return { saved: true };
      });
      api.post("/source-events", async (req) =>
        new SourceLifecycle(store).record(
          actor(req.headers.authorization),
          req.body,
        ),
      );
      api.post("/backup", async (req) => {
        if (!backupKey) throw new Error("별도 백업 암호키 미설정");
        return encryptedBackup(
          store,
          actor(req.headers.authorization),
          backupKey.key,
          backupKey.id,
        );
      });
      api.post("/restore", { bodyLimit: 100 * 1024 * 1024 }, async (req) => {
        if (!backupKey) throw new Error("별도 복원 암호키 미설정");
        return restoreEncrypted(
          store,
          actor(req.headers.authorization),
          req.body,
          backupKey.key,
        );
      });
    },
    { prefix: "/api/management-v3" },
  );
}

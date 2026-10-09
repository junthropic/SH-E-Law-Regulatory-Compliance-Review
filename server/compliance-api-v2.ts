import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Store, sha } from "./store.js";
import { ComplianceRepository, assertPrincipal, type Principal } from "./compliance-v2.js";

/** Grants are supplied by the host, never by a request body or the legacy reviewer-name field. */
export function registerComplianceV2(
  app: FastifyInstance,
  store: Store,
  grants: ReadonlyMap<string, Principal>,
) {
  const repository = new ComplianceRepository(store);
  app.register(
    async (api) => {
      api.setErrorHandler((error, _req, reply) => {
        const message = error instanceof Error ? error.message : "처리 실패";
        const code =
          error instanceof z.ZodError
            ? 400
            : /권한|영역 불일치/.test(message)
              ? 403
              : /버전 충돌|재검토|참조 자료 변경/.test(message)
                ? 409
                : 400;
        reply.code(code).send({
          error: error instanceof z.ZodError ? "입력 형식 확인 필요" : message,
        });
      });
      api.addHook("preHandler", async (req, reply) => {
        const token = /^Bearer (.+)$/.exec(
          req.headers.authorization || "",
        )?.[1];
        if (!token || !grants.has(sha(token)))
          return reply.code(403).send({ error: "검토 역할 인증 필요" });
        const p=grants.get(sha(token))!;
        if(!p.validFrom || !p.expiresAt) return reply.code(403).send({error:"업무 권한 유효기간 확인 필요"});
        assertPrincipal(p);
      });
      const actor = (authorization?: string) =>
        grants.get(sha(authorization!.slice(7)))!;
      api.get("/entities/:id", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        return repository.get(actor(req.headers.authorization), id);
      });
      api.get("/entities/:id/original",async(req,reply)=>{
        const {id}=z.object({id:z.string()}).parse(req.params),p=actor(req.headers.authorization),e=repository.get(p,id);
        if(e.body.kind!=="evidence")throw new Error("증빙 원본 대상 아님");
        return reply.type("application/octet-stream").send(repository.original(p,e.body.originalRef,e.body.originalHash));
      });
      api.post("/entities/:id", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { expectedVersion, body } = z
          .object({
            expectedVersion: z.number().int().nonnegative(),
            body: z.unknown(),
          })
          .strict()
          .parse(req.body);
        return repository.save(
          actor(req.headers.authorization),
          id,
          expectedVersion,
          body,
        );
      });
      api.post("/entities/:id/approve", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const b = z
          .object({
            version: z.number().int().positive(),
            hash: z.string(),
            note: z.string().max(3000),
          })
          .strict()
          .parse(req.body);
        return repository.approve(
          actor(req.headers.authorization),
          id,
          b.version,
          b.hash,
          b.note,
        );
      });
      api.get("/entities/:id/evaluation", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params),
          p = actor(req.headers.authorization);
        return repository.evaluate(p, repository.get(p, id));
      });
      api.post("/entities/:id/events", async(req)=>{
        const {id}=z.object({id:z.string()}).parse(req.params);
        const b=z.object({version:z.number().int().positive(),hash:z.string(),event:z.enum(["pending","rejected","changes_requested","revoked"]),note:z.string().min(15).max(3000)}).strict().parse(req.body);
        return repository.reviewEvent(actor(req.headers.authorization),{id,version:b.version,hash:b.hash},b.event,b.note);
      });
      api.post("/originals", {bodyLimit:28*1024*1024}, async(req)=>{
        const {data}=z.object({data:z.string().max(27_000_000)}).strict().parse(req.body);
        if(Buffer.from(data,"base64").toString("base64")!==data) throw new Error("원본 인코딩 확인 필요");
        return repository.putOriginal(actor(req.headers.authorization),Buffer.from(data,"base64"));
      });
    },
    { prefix: "/api/compliance-v2" },
  );
  return repository;
}

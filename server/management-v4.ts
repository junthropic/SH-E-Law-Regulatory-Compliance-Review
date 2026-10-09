import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { ProtectedCollection } from "./collection-v4.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import { assessWaste, assessSubmission } from "./cases-v4.js";
import { connectionServices } from "../shared/connection-catalog.js";
import type { LookupServiceId } from "../shared/public-apis.js";
export function registerManagementV4(app:FastifyInstance,service:ProtectedCollection,grants:ReadonlyMap<string,Principal>) {
  app.register(async api=>{
    const actor=(header?:string)=>{
      const token=/^Bearer (.+)$/.exec(header||"")?.[1],p=token?grants.get(sha(token)):undefined;
      if(!p||!p.validFrom||!p.expiresAt)throw Error("업무 권한 확인 필요");assertPrincipal(p);return p;
    };
    api.setErrorHandler((_e,_req,reply)=>reply.code(400).send({error:"요청 범위·권한·자료 상태 확인 필요"}));
    api.addHook("preHandler",async req=>{actor(req.headers.authorization);});
    api.post("/prepare",async req=>{
      const b=z.object({service:z.string(),query:z.object({keyword:z.string(),mode:z.string(),page:z.number().int().positive(),filters:z.record(z.string(),z.string()).optional()}).strict()}).strict().parse(req.body);
      if(!connectionServices.some(s=>s.id===b.service))throw Error("서비스 확인 필요");
      return service.prepare(actor(req.headers.authorization),b.service as LookupServiceId,b.query);
    });
    api.post("/egress",async req=>{
      const b=z.object({node:z.string().uuid(),purpose:z.string().min(1),provider:z.string().min(1),action:z.enum(["grant","deny","revoke","release"]),basis:z.string().min(15),expiresAt:z.string().datetime(),supersedes:z.number().int().positive().optional()}).strict().parse(req.body);
      return {sequence:service.provenance.event(actor(req.headers.authorization),b.node,b.purpose,b.provider,b.action,b.basis,b.expiresAt,b.supersedes)};
    });
    api.post("/collections",async(req,reply)=>{
      const b=z.object({ref:z.string().uuid(),idempotencyKey:z.string().min(1).max(160)}).strict().parse(req.body);
      const j=await service.enqueue(actor(req.headers.authorization),b.ref,b.idempotencyKey);return reply.code(202).send({jobId:j.id,state:j.state});
    });
    api.get("/jobs/:id",async req=>{
      const {id}=z.object({id:z.string().uuid()}).parse(req.params),p=actor(req.headers.authorization);
      return {job:service.jobs.get(p,id),units:service.jobs.units(p,id)};
    });
    api.get("/payloads/:purpose/:id",async(req,reply)=>{
      const {id,purpose}=z.object({id:z.string().uuid(),purpose:z.enum(["raw","attachment"])}).parse(req.params);
      return reply.header("Content-Disposition","attachment; filename=original.bin").type("application/octet-stream").send(service.payloads.get(actor(req.headers.authorization),id,purpose));
    });
    api.post("/reviews/:id/trace",async req=>{
      const {id}=z.object({id:z.string()}).parse(req.params),p=actor(req.headers.authorization);
      const bridge=new LegacyBridge(service.store,"v4");
      // Existing scoped trace proves ownership; arbitrary legacy review IDs are not authority.
      bridge.trace(p,id);
      const r=service.store.review(id);if(!r)throw Error("검토 없음");return bridge.attach(p,r,"shadow");
    });
    api.post("/cases/waste",async req=>{const p=actor(req.headers.authorization);if(!p.roles.includes("writer"))throw Error();return assessWaste(req.body);});
    api.post("/cases/submission",async req=>{const p=actor(req.headers.authorization);if(!p.roles.includes("writer"))throw Error();return assessSubmission(req.body);});
  },{prefix:"/api/management-v4"});
}

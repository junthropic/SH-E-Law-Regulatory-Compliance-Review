import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { WasteProposals } from "./waste-proposals-v5.js";
import { ProtectedMigration } from "./migration-v5.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";

// Host must register explicitly in an isolated app. No production entrypoint registration.
export function registerManagementV5(app:FastifyInstance,vault:ProtectedPayloads,grants:ReadonlyMap<string,Principal>) {
  const proposals=new WasteProposals(vault),migration=new ProtectedMigration(vault);
  app.register(async api=>{
    const actor=(header?:string)=>{const token=/^Bearer (.+)$/.exec(header||"")?.[1],p=token?grants.get(sha(token)):undefined;if(!p||!p.expiresAt||!p.validFrom)throw Error("권한 확인 필요");assertPrincipal(p);return p;};
    api.setErrorHandler((_e,_req,r)=>r.code(400).send({error:"요청 범위·권한·버전 확인 필요"}));
    api.addHook("preHandler",async req=>{actor(req.headers.authorization);});
    api.post("/waste/proposals",async req=>{const b=z.object({captureId:z.string().uuid()}).strict().parse(req.body);return proposals.fromCapture(actor(req.headers.authorization),b.captureId);});
    api.post("/waste/:id/supplement",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({version:z.number().int().positive(),manual:z.record(z.string(),z.string())}).strict().parse(req.body);return proposals.supplement(actor(req.headers.authorization),id,b.version,b.manual);});
    api.post("/waste/:id/review",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({version:z.number().int().positive(),note:z.string().min(15)}).strict().parse(req.body);return proposals.review(actor(req.headers.authorization),id,b.version,b.note);});
    api.post("/waste/:id/refresh",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({version:z.number().int().positive(),captureId:z.string().uuid()}).strict().parse(req.body);return proposals.refresh(actor(req.headers.authorization),id,b.version,b.captureId);});
    api.get("/waste/:id/trace",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);return proposals.project(actor(req.headers.authorization),id);});
    api.get("/reviews/:review/waste/:id/export",async(req,reply)=>{
      const {review,id}=z.object({review:z.string(),id:z.string().uuid()}).parse(req.params),p=actor(req.headers.authorization);
      const trace=new LegacyBridge(vault.store,"v4").trace(p,review),proposal=proposals.project(p,id);
      // Local authorized download; this does not grant third-party egress.
      return reply.header("Content-Disposition","attachment; filename=review-evidence.json").send({review:trace,proposal,association:"검토자가 요청한 대조 자료: 동일 사업장·시설 자동 확정 아님",externalTransmissionAllowed:false});
    });
    api.get("/migration/dry-run",async req=>migration.dryRun(actor(req.headers.authorization)));
    api.post("/migration/jobs/:id",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);return migration.copyJob(actor(req.headers.authorization),id);});
  },{prefix:"/api/management-v5"});
}

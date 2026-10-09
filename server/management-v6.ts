import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {sha} from "./store.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import {ProtectedPayloads} from "./protected-payload-v4.js";
import {TrainingCases} from "./training-cases-v6.js";
import {TrainingInput} from "./training-v6.js";
import {AttachmentGraph} from "./attachment-graph-v6.js";
import {MigrationResume} from "./migration-resume-v6.js";

// Opt-in trusted host registration; production entrypoint does not import this module.
export function registerManagementV6(app:FastifyInstance,vault:ProtectedPayloads,grants:ReadonlyMap<string,Principal>,attachments=new AttachmentGraph(vault),migration?:MigrationResume){
  const training=new TrainingCases(vault);
  app.register(async api=>{
    const actor=(header?:string)=>{const token=/^Bearer (.+)$/.exec(header||"")?.[1],p=token?grants.get(sha(token)):undefined;if(!p||!p.validFrom||!p.expiresAt)throw Error("권한 확인 필요");assertPrincipal(p);return p;};
    api.setErrorHandler((_e,_req,r)=>r.code(400).send({error:"자료·권한·버전 확인 필요"}));api.addHook("preHandler",async req=>{actor(req.headers.authorization);});
    api.post("/training",async req=>{const b=z.object({record:z.string().uuid()}).strict().parse(req.body);return training.fromDocument(actor(req.headers.authorization),b.record);});
    api.post("/training/:id/supplement",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({version:z.number().int().positive(),input:TrainingInput}).strict().parse(req.body);return training.supplement(actor(req.headers.authorization),id,b.version,b.input);});
    api.post("/training/:id/review",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({version:z.number().int().positive(),note:z.string().min(15)}).strict().parse(req.body);return training.review(actor(req.headers.authorization),id,b.version,b.note);});
    api.get("/training/:id",async req=>training.evaluate(actor(req.headers.authorization),z.object({id:z.string().uuid()}).parse(req.params).id));
    api.post("/training/:id/publish",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({review:z.string()}).strict().parse(req.body);return training.publish(actor(req.headers.authorization),id,b.review);});
    api.post("/attachments/:id/collect",async req=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params),b=z.object({index:z.number().int().nonnegative()}).strict().parse(req.body);return attachments.collect(actor(req.headers.authorization),id,b.index);});
    api.post("/attachments/from-capture",async req=>{const b=z.object({capture:z.string().uuid()}).strict().parse(req.body);return attachments.fromCapture(actor(req.headers.authorization),b.capture);});
    if(migration){api.post("/migration/:id/prepare",async req=>migration.prepare(actor(req.headers.authorization),z.object({id:z.string().uuid()}).parse(req.params).id));api.post("/migration/:id/resume",async req=>migration.resume(actor(req.headers.authorization),z.object({id:z.string().uuid()}).parse(req.params).id));api.get("/migration/:id",async req=>migration.observe(actor(req.headers.authorization),z.object({id:z.string().uuid()}).parse(req.params).id));}
  },{prefix:"/api/management-v6"});
}

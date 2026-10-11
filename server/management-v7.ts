import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {sha} from "./store.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import {ProtectedPayloads} from "./protected-payload-v4.js";
import {SafetyManagerCases} from "./safety-manager-cases-v7.js";
import {SafetyManagerInput} from "./safety-manager-v7.js";

// Opt-in trusted host registration only (same pattern as management-v6); createApp and the production entrypoint never import it.
export function registerManagementV7(app:FastifyInstance,vault:ProtectedPayloads,grants:ReadonlyMap<string,Principal>){
  const cases=new SafetyManagerCases(vault);
  app.register(async api=>{
    const actor=(header?:string)=>{const token=/^Bearer (.+)$/.exec(header||"")?.[1],p=token?grants.get(sha(token)):undefined;if(!p||!p.validFrom||!p.expiresAt)throw Error("권한 확인 필요");assertPrincipal(p);return p;};
    api.setErrorHandler((_e,_req,r)=>r.code(400).send({error:"자료·권한·버전 확인 필요"}));api.addHook("preHandler",async req=>{actor(req.headers.authorization);});
    const id=(params:unknown)=>z.object({id:z.string().uuid()}).parse(params).id;
    api.post("/safety-manager",async req=>{const b=z.object({record:z.string().uuid()}).strict().parse(req.body);return cases.fromDocument(actor(req.headers.authorization),b.record);});
    api.post("/safety-manager/:id/supplement",async req=>{const b=z.object({version:z.number().int().positive(),input:SafetyManagerInput}).strict().parse(req.body);return cases.supplement(actor(req.headers.authorization),id(req.params),b.version,b.input);});
    api.post("/safety-manager/:id/review",async req=>{const b=z.object({version:z.number().int().positive(),note:z.string().min(15)}).strict().parse(req.body);return cases.review(actor(req.headers.authorization),id(req.params),b.version,b.note);});
    api.get("/safety-manager/:id",async req=>cases.evaluate(actor(req.headers.authorization),id(req.params)));
    api.post("/safety-manager/:id/publish",async req=>{const b=z.object({review:z.string()}).strict().parse(req.body);return cases.publish(actor(req.headers.authorization),id(req.params),b.review);});
  },{prefix:"/api/management-v7"});
}

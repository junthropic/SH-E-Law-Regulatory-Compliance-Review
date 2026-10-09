import { Store } from "./store.js";
import { DurableJobs, type Job, type UnitResult } from "./jobs-v3.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { withCallContext } from "./transport-v4.js";
import { searchPublic, detailPublic, validatePublicQuery } from "./public-apis.js";
import { PublicApiError, withPublicApiCancellation, withPublicApiState } from "./public-api-transport.js";
import type { LookupServiceId, PublicQuery, PublicSearchResult } from "../shared/public-apis.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";

// Management-only service, no production provisioning or UI route changes.
export class ProtectedCollection {
  readonly jobs: DurableJobs;
  readonly provenance: PayloadProvenance;
  constructor(readonly store:Store,readonly payloads:ProtectedPayloads,
    readonly actor:(job:Job)=>Principal,
    readonly credential:(service:string)=>Promise<string>,
    readonly accountGroup:(url:URL)=>{group:string,intervalMs:number},
    readonly attachmentHook?:(p:Principal,job:Job,item:PublicSearchResult["items"][number],signal:AbortSignal)=>Promise<UnitResult[]>) {
    this.jobs=new DurableJobs(store);this.provenance=new PayloadProvenance(store);
  }
  prepare(p:Principal,service:LookupServiceId,query:PublicQuery) {
    assertPrincipal(p);
    const q=validatePublicQuery(service,query),serialized=JSON.stringify({service,query:q});
    const node=this.provenance.input(p,serialized);
    return {node,ref:this.payloads.put(p,"queue",Buffer.from(JSON.stringify({service,query:q,node})),24*3600000)};
  }
  async enqueue(p:Principal,ref:string,idem:string) {
    const data=JSON.parse(this.payloads.get(p,ref,"queue").toString());
    this.provenance.check(p,data.node,JSON.stringify({service:data.service,query:data.query}),"query",data.service);
    const key=await this.credential(data.service);
    if(!key) throw new PublicApiError("인증값 확인 필요","authentication");
    return this.jobs.enqueue(p,this.payloads.reference(p,idem),{provider:data.service,operation:"search",query:{code:ref},credentialRef:this.payloads.reference(p,key),schemaVersion:"v3-1",budgetMs:180000});
  }
  readUnit(p:Principal,unit:UnitResult) { return unit.data ? JSON.parse(this.payloads.get(p,(unit.data as {protectedRef:string}).protectedRef,"unit").toString()) : undefined; }
  async handle(job:Job,commit:(u:UnitResult)=>void,signal:AbortSignal) {
    const p=this.actor(job);assertPrincipal(p);
    if(p.tenant!==job.tenant||p.synthetic!==job.synthetic||p.id!==job.requester)throw Error("수집 주체 불일치");
    const data=JSON.parse(this.payloads.get(p,job.input.query.code!,"queue").toString());
    const serialized=JSON.stringify({service:data.service,query:data.query});
    const key=await this.credential(data.service);
    if(job.input.credentialRef!==this.payloads.reference(p,key))throw new PublicApiError("수집 인증값 변경","authentication");
    const safeCommit=(u:UnitResult)=>commit({...u,...(u.data===undefined?{}:{data:{protectedRef:this.payloads.put(p,"unit",Buffer.from(JSON.stringify(u.data)),7*86400000)}})});
    const authorize=()=>{const current=this.actor(job);this.provenance.check(current,data.node,serialized,"query",data.service);};
    authorize();
    try {
      await withCallContext({store:this.store,payloads:this.payloads,principal:p,job:job.id,service:data.service,queryRef:job.input.query.code!,deadline:Date.now()+job.input.budgetMs,account:this.accountGroup,authorize},()=>
        withPublicApiCancellation(signal,()=>withPublicApiState(this.store,async()=>{
          for(let page=job.cursor;page<job.cursor+100;page++) {
            signal.throwIfAborted();authorize();
            const root="page-"+page, prior=this.jobs.units(p,job.id),old=prior.find(u=>u.id===root&&u.state==="success");
            const result:PublicSearchResult=old?this.readUnit(p,old):await searchPublic(data.service,key,{...data.query,page});
            if(!old)safeCommit({id:root,parent:null,role:"list",state:"success",data:result});
            for(const item of result.items) {
              const id=root+":"+item.hash;
              const detailDone=prior.some(u=>u.id===id&&u.state==="success");
              if(!detailDone&&item.canDetail) {
                try {
                  authorize();const detail=await detailPublic(item,item.service==="accidents"?await this.credential("accident-files"):key);
                  safeCommit({id,parent:root,role:"detail",state:detail.level==="partial"?"error":"success",data:detail});
                } catch(e) { signal.throwIfAborted();safeCommit({id,parent:root,role:"detail",state:"error",error:e instanceof PublicApiError?e.code:"upstream"}); }
              } else if(!detailDone) safeCommit({id,parent:root,role:"detail",state:"not_supported",error:"support_unverified"});
              if(this.attachmentHook&&!prior.some(u=>u.id===id+":attachments-finished"&&u.state==="success")){const attachments=await this.attachmentHook(p,job,item,signal);for(const a of attachments)safeCommit({...a,id:id+":"+a.id,parent:id,role:"attachment"});if(attachments.every(a=>a.state!=="error"))safeCommit({id:id+":attachments-finished",parent:id,role:"attachment",state:"success",data:{count:attachments.length,allOriginals:attachments.every(a=>a.state==="success")}});}
              else if(!this.attachmentHook&&!detailDone) safeCommit({id:id+":attachment",parent:id,role:"attachment",state:"not_supported",error:"app_adapter_missing"});
            }
            safeCommit({id:root+":checkpoint",parent:root,role:"list",state:"success",nextPage:result.hasMore?page+1:null});
            if(!result.hasMore)return;
          }
          throw new PublicApiError("페이지 한도: 부분 결과 보존","size");
        })));
    } catch(e) {
      // v3 already bounded adapter retries. Preserve that behavior; no worker retry multiplication.
      if(e instanceof PublicApiError){const bounded=new PublicApiError(e.message,e.code,false,e.retryAfterMs);bounded.transportExhausted=e.transportExhausted;throw bounded;}
      throw e;
    }
  }
}

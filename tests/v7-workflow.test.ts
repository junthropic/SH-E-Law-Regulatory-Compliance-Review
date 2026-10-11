import {it,expect} from "vitest";
import {randomBytes} from "node:crypto";
import {testStore,request,basis} from "./helpers.js";
import {Vault} from "../server/vault.js";
import {ChatGPTAuth} from "../server/auth.js";
import {writer,reviewer} from "./v2-fixture.js";
import {safetyManagerFixture,manager} from "./v7-fixture.js";
import {SafetyManagerCases} from "../server/safety-manager-cases-v7.js";
import {guardManagedExport} from "../server/records-v6.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {PayloadProvenance} from "../server/provenance-v4.js";
import {createApp} from "../server/app.js";
import {ingestDocument} from "../server/documents.js";
import {newReview,runReview} from "../server/reviews.js";
import {LegacyBridge} from "../server/legacy-bridge-v3.js";
import {safetyManagerPolicies,implementedSafetyManager} from "../server/safety-manager-v7.js";
import {registerManagementV7} from "../server/management-v7.js";
import {sha} from "../server/store.js";
// Synthetic actors and grants for an isolated host only; none of this is a real approval.
const key={id:"synthetic-v7",bytes:randomBytes(32)},expiry="2099-01-01T00:00:00Z";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:["writer","egress_reviewer","collection_operator","backup_operator"] as typeof writer.roles};
const local=(g:PayloadProvenance,node:string)=>{for(const purpose of ["read","document"])g.event(p,node,purpose,"local","release","명시적 host 합성 권한이며 실제 사업장 승인이 아닙니다.",expiry);};
const implemented=safetyManagerPolicies.filter(x=>implementedSafetyManager.includes(x.id));

it.each(implemented)("V7-C01: $id 원문→수동 보완→독립 검토→기존 검토·일반 export",async policy=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),svc=new SafetyManagerCases(v);let app:any;
  try{
    // Source document: synthetic site, one manager whose appointment evidence is still missing.
    const input=safetyManagerFixture({managers:[manager({appointmentEvidence:"unknown"})]});
    const d=await ingestDocument(f.store,"v7-synthetic.txt",Buffer.from(JSON.stringify(input))),bound=svc.records.bindDocument(p,d.id);local(svc.records.graph,bound.node);
    const first=svc.fromDocument(p,bound.id);local(svc.records.graph,first.own);
    const before=svc.evaluate(p,first.id).results;
    expect(before.every(r=>r.legalApproved===false&&r.enabled===false&&r.state==="pending")).toBe(true); // 독립 검토 전·자료 미확인
    const fixed=safetyManagerFixture();
    const manual=svc.supplement(p,first.id,first.version,fixed);local(svc.records.graph,manual.own);
    expect(()=>svc.supplement(p,first.id,first.version,fixed)).toThrow(); // stale version
    expect(()=>svc.review({...p,roles:[...p.roles,"case_reviewer"]},first.id,manual.version,"자기 자료는 독립 확인으로 처리할 수 없습니다.")).toThrow();
    const checked=svc.review({...reviewer,roles:[...reviewer.roles,"writer"]},first.id,manual.version,"가상 사업장 업종 행·인원·선임 자료를 독립 합성 actor로 확인했습니다.");local(svc.records.graph,checked.own);
    // 120 workers: 전담 is out of scope (영 제16조제2항 300명), every other duty is a fulfilled candidate on the synthetic facts.
    expect(svc.evaluate(p,first.id).results.find(r=>r.id===policy.id)?.state).toBe(policy.id==="safety_manager.dedication"?"out_of_scope_candidate":"fulfilled_candidate");
    const review=newReview({...request(),asOf:fixed.asOf,prompt:"가상 사업장 산업안전보건법 "+policy.label+" 검토를 요청합니다.",documentIds:[d.id]});f.store.saveReview(review);
    new LegacyBridge(f.store,"v7").attach(p,review,"project");f.store.saveReview(review);
    // The hazmat (위험물) 안전관리자 candidates are a different duty and must not be mixed in.
    expect(f.store.review(review.id)!.issues.some(i=>/hazmat/.test(i.ruleId??"")||i.title==="안전관리자 재선임")).toBe(false);
    expect(()=>svc.publish(p,first.id,newReview({...request(),asOf:"2026-10-16",prompt:"산업안전보건법 "+policy.label,documentIds:[d.id]}).id)).toThrow();
    const publish=svc.publish(p,first.id,review.id);local(svc.records.graph,publish.binding.own);
    expect(publish.issues).toBe(1);
    const context={gate:svc.records.graph,principal:p,parents:[publish.binding.node]};
    expect(()=>guardManagedExport(f.store,review.id,context)).not.toThrow();expect(()=>guardManagedExport(f.store,review.id)).toThrow();
    expect(()=>guardManagedExport(f.store,review.id,{...context,principal:{...p,tenant:"other"}})).toThrow();
    ({app}=await createApp(f.store,true,undefined,undefined,()=>context));const init=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),headers={host:"127.0.0.1:4999",cookie:init.cookies.map((c:any)=>c.name+"="+c.value).join("; ")};
    const exported=await app.inject({url:`/api/reviews/${review.id}/export?format=markdown`,headers});expect(exported.statusCode).toBe(200);
    expect(exported.body).toContain(policy.label);expect(exported.body).toContain("법률 기준일 2026-10-08");expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(f.store.review(review.id)?.issues.every(i=>i.category!=="clear_risk")).toBe(true);
    // A later fact change invalidates the published review for export.
    const changed=svc.supplement(p,first.id,checked.version,fixed);expect(changed.version).toBe(checked.version+1);expect(()=>guardManagedExport(f.store,review.id,context)).toThrow();
  }finally{await app?.close();f.clean();}
},30000);
it("V7-S02: 같은 질문이 v6 연결에서는 위험물 안전관리자 후보로, v7 연결에서는 산업안전보건법 후보로 간다",()=>{
  const f=testStore();
  try{const ask=()=>{const r=newReview({...request(),prompt:"가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다."});f.store.saveReview(r);return r;};
    const v6=ask();new LegacyBridge(f.store,"v6").attach(p,v6,"project");
    const v7=ask();new LegacyBridge(f.store,"v7").attach(p,v7,"project");
    expect(v6.issues.some(i=>i.title==="안전관리자 재선임")).toBe(true); // existing v6 behavior, unchanged
    expect(v7.issues.some(i=>i.title==="안전관리자 재선임")).toBe(false);
    expect(v7.issues.map(i=>i.title)).toContain("안전관리자 선임(인원)");
  }finally{f.clean();}
},30000);
it("V7-F01: 기본 앱 경로(브리지 없음)의 안전관리자 질문은 위험물·산업안전보건법 후보 어느 쪽으로도 가지 않는다",async()=>{
  // server/index.ts calls createApp() without the v3 option, so finalize is undefined and runReview runs without a bridge.
  const f=testStore();
  try{
    const at=new Date(Date.now()-3600_000).toISOString();
    for(const [i,region] of ["전국","경기도"].entries())f.store.put("sources",i?"ordin-41":"national",{id:i?"ordin-41":"national",name:"시험 출처",region,status:"ok",checkedAt:at,lastSuccessAt:at,count:1,message:"시험",verified:false});
    for(const e of basis())f.store.saveEvidence(e);
    const vault=new Vault(f.store.dir,true);await vault.write("law",{lawOc:"TEST-ONLY"});
    for(const prompt of ["가상 사업장 안전관리자 선임 검토를 요청합니다.","가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다."]){
      const review=newReview({...request(),prompt});await runReview(f.store,vault,new ChatGPTAuth(f.store,vault),review,async()=>[]);
      expect(review.status).toBe("completed");
      expect(review.issues.some(i=>/^(hazmat_manager|safety_manager)\./.test(i.ruleId??"")||i.title==="안전관리자 재선임")).toBe(false);
    }
  }finally{f.clean();}
},30000);
it("V7-C02: 다른 tenant는 안전관리자 후보를 읽거나 보완할 수 없다",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),svc=new SafetyManagerCases(v);
  try{const d=await ingestDocument(f.store,"v7-tenant.txt",Buffer.from(JSON.stringify(safetyManagerFixture()))),bound=svc.records.bindDocument(p,d.id);local(svc.records.graph,bound.node);
    const first=svc.fromDocument(p,bound.id);const other={...p,tenant:"other"};
    expect(()=>svc.read(other,first.id)).toThrow();expect(()=>svc.supplement(other,first.id,first.version,safetyManagerFixture())).toThrow();
  }finally{f.clean();}
},30000);
it("V7-H02: 명시적 권한으로 등록한 격리 관리 경로는 token·독립 검토·버전을 지킨다",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),{app}=await createApp(f.store,true);
  const author={...p},checker={...reviewer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:[...reviewer.roles,"writer","case_reviewer"] as typeof writer.roles};
  registerManagementV7(app,v,new Map([[sha("v7-author-token"),author],[sha("v7-checker-token"),checker]]));
  try{
    const svc=new SafetyManagerCases(v),d=await ingestDocument(f.store,"v7-route.txt",Buffer.from(JSON.stringify(safetyManagerFixture()))),bound=svc.records.bindDocument(p,d.id);local(svc.records.graph,bound.node);
    const init=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),base={host:"127.0.0.1:4999",cookie:init.cookies.map((c:any)=>c.name+"="+c.value).join("; "),"x-csrf-token":init.json().csrf};
    const call=(method:"GET"|"POST",url:string,token:string|null,payload?:object)=>app.inject({method,url:"/api/management-v7"+url,headers:token?{...base,authorization:"Bearer "+token}:base,payload});
    expect((await call("POST","/safety-manager",null,{record:bound.id})).statusCode).toBe(400);
    expect((await call("POST","/safety-manager","wrong-token",{record:bound.id})).statusCode).toBe(400);
    const created=(await call("POST","/safety-manager","v7-author-token",{record:bound.id})).json();expect(created.version).toBe(1);local(svc.records.graph,created.own);
    expect((await call("POST",`/safety-manager/${created.id}/review`,"v7-author-token",{version:1,note:"작성자는 자기 자료를 독립 검토할 수 없습니다."})).statusCode).toBe(400);
    const reviewed=(await call("POST",`/safety-manager/${created.id}/review`,"v7-checker-token",{version:1,note:"가상 사업장 사실을 독립 합성 actor로 확인했습니다."})).json();local(svc.records.graph,reviewed.own);
    expect((await call("POST",`/safety-manager/${created.id}/supplement`,"v7-author-token",{version:1,input:safetyManagerFixture()})).statusCode).toBe(400); // stale version
    const evaluated=(await call("GET",`/safety-manager/${created.id}`,"v7-author-token")).json();
    expect(evaluated.results).toHaveLength(6);expect(evaluated.results.every((r:any)=>r.enabled===false&&r.legalApproved===false)).toBe(true);
  }finally{await app.close();f.clean();}
},30000);
it("V7-H01: 안전관리자 관리 경로는 기본 앱에 등록되지 않는다",async()=>{
  const f=testStore(),{app}=await createApp(f.store,true);
  try{expect(app.hasRoute({method:"POST",url:"/api/management-v7/safety-manager"})).toBe(false);}finally{await app.close();f.clean();}
});

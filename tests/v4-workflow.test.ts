import {it,expect,vi} from "vitest";
import {randomBytes} from "node:crypto";
import {testStore,request,evidence} from "./helpers.js";
import {fixture,writer,scope} from "./v2-fixture.js";
import {entityRef} from "../server/compliance-v2.js";
import {nextPolicies,v4Candidate,selectPolicies} from "../server/policies-v4.js";
import {LegacyBridge} from "../server/legacy-bridge-v3.js";
import {newReview} from "../server/reviews.js";
import {assessWaste,assessSubmission,riskTiming} from "../server/cases-v4.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {ProtectedCollection} from "../server/collection-v4.js";
import {registerManagementV4} from "../server/management-v4.js";
import {createApp} from "../server/app.js";
import {sha} from "../server/store.js";
import {workOne} from "../server/jobs-v3.js";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
it.each(nextPolicies)("V4-D01: $id 독립 후보·필요 사실·가상 이행과 미확인 보류",s=>{
  const f=fixture();try{
    const candidate=v4Candidate(s.id,[entityRef(f.source)],writer.id),unapproved=f.put("candidate-v4",candidate);
    expect(()=>f.approve(unapproved)).toThrow();
    const policy=f.put("synthetic-policy-v4",{...candidate,domain:"synthetic",unresolved:[],effectiveFrom:"2026-06-01"});f.approve(policy);
    const missing=f.put("missing-v4",{kind:"decision",scope,asOf:scope.periodTo,policy:entityRef(policy),facts:{},author:writer.id});
    expect(f.repo.evaluate(writer,missing).category).toBe("more_data");
    s.target.forEach(k=>f.add(k,"true"));f.add(s.done,"true");f.add(s.breach,"false");f.add("exception_applies","false");
    const d=f.put("decision-v4",{kind:"decision",scope,asOf:scope.periodTo,policy:entityRef(policy),facts:f.facts,author:writer.id});
    expect(f.repo.evaluate(writer,d).outcome).toBe("fulfilled");
    // This test approves synthetic evidence only. The candidate retains all real legal holds.
    expect(candidate.unresolved.length).toBeGreaterThan(0);
  }finally{f.clean();}
}, 30000);
it.each([
  ["폐기물 수탁업체 위탁 계약",["environment.waste_contractor"]],
  ["위험성평가 근로자대표 참여",nextPolicies.filter(s=>s.id.startsWith("risk_assessment.")).map(s=>s.id)],
  ["폐기물과 위험물 정기점검",["environment.waste_contractor","hazmat_check.result_submission"]],
  ["ABC XYZ 낯선 약어",[]],
] as [string,string[]][])("V4-C01: 주제 후보 선택 %s",(text,expected)=>{
  const s=selectPolicies(text);expect(s.policies.map(p=>p.id)).toEqual(expect.arrayContaining(expected));
  if(!text.includes("위험물"))expect(s.policies.every(p=>!p.id.startsWith("hazmat"))).toBe(true);
  if(!expected.length)expect(s.unclassified).toBe(true);expect(s.applicabilityConfirmed).toBe(false);
});
it("V4-C02: 사람이 고친 사실을 보존하고 충돌·기존 trace·연결 승인 재검토를 남긴다",()=>{
  const f=testStore();try{
    const r=newReview({...request(),prompt:"폐기물 위탁 검토"});r.evidence=[evidence()];r.facts=[{key:"permit",label:"허가",value:"미확인",source:"사용자",confirmed:false}];
    const old=new LegacyBridge(f.store);old.attach(writer,r);
    const b=new LegacyBridge(f.store,"v4");b.attach(writer,r);
    const link=JSON.parse((f.store.db.prepare("SELECT body FROM v3_legacy_links WHERE kind='fact'").get() as any).body),fact=b.repo.get(writer,link.v2.id);
    const manual=b.repo.save(writer,fact.id,fact.version,{...fact.body,value:"사람이 보완한 내용"} as any);
    r.facts[0].value="새 입력";const trace=b.attach(writer,r,"project");
    expect(b.repo.get(writer,fact.id).hash).toBe(manual.hash);expect(trace.rows.map(x=>x.policy)).toEqual(["environment.waste_contractor"]);
    expect((f.store.db.prepare("SELECT count(*) n FROM v4_merge_conflicts").get() as any).n).toBe(1);
    expect((f.store.db.prepare("SELECT count(*) n FROM v4_trace_history").get() as any).n).toBe(2);
    expect((f.store.db.prepare("SELECT count(*) n FROM v2_invalidations WHERE cause='manual-merge-v4'").get() as any).n).toBe(1);
  }finally{f.clean();}
});
const caseData={asOf:"2026-10-08",plannedAt:"2026-10-09",wasteKind:"미확인",properties:"미확인",quantity:1,unit:"ton/day",businessId:"same-company",facilityId:"different-facility",address:"가상 주소",legalPath:"notification",identity:"unknown",legalStatus:"unknown",scope:"unknown",capacity:"unknown",storage:"unknown",conditionalDocuments:"unknown",contract:"unknown",sanctionEffect:"unknown",sanctionFrom:null,sanctionTo:"2025-01-01",sourceAsOf:"2026-01-01",partial:true,basis:[]};
it("V4-C03/S2: 신고 경로·다른 시설·만료 처분·자료 기준일·현재량 누락은 자동 수탁 가능이 아니다",()=>{
  const r=assessWaste(caseData);expect(r.automaticConsignmentAllowed).toBe(false);expect(r.expiredSanction).toBe(true);expect(r.holds).toContain("현재 보관량 확인 필요");expect(JSON.stringify(r)).not.toContain("무허가");expect(r.conversionPerformed).toBe(false);
});
it("V4-C04/S3: 늦은 제출·접수·보완 이력을 현재 시정과 함께 보존한다",()=>{
  const basis={id:"synthetic-proof",version:1,hash:sha("proof")};
  const r=assessSubmission({checkAt:"2026-09-01",recordKind:"unknown",special30:"unknown",profileReviewed:true,due:"2026-10-01",events:[{type:"submitted",date:"2026-10-02",basis},{type:"received",date:"2026-10-03",basis},{type:"remediated",date:"2026-10-04",basis}]});
  expect(r).toMatchObject({historicalLate:true,received:true,remediated:true,performed:false,retentionYears:null,deemedAccepted:false,technicalComplianceConfirmed:false});
});
it("V4-C05/S5: 양식만 존재·대표 요구 미확인·정기 및 수시평가를 분리한다",()=>{
  expect(riskTiming({asOf:"2026-10-08",initialYear:2025,newRisk:true,workStart:"2026-10-10",representativeRequested:"unknown",formOnly:true})).toMatchObject({regularYearRequired:true,adHocBeforeStart:"2026-10-10",evaluationProven:false,formSufficient:false,representativeCondition:"unknown"});
});
it.each([true,false])("V4-B05: synthetic=%s 명시 context 관리 HTTP→worker→원문 접근 권한",async synthetic=>{
  const f=testStore(),actor={...p,synthetic},reviewer={...actor,id:"egress-reviewer",roles:["egress_reviewer"] as typeof p.roles},grants=new Map([[sha("writer"),actor],[sha("reviewer"),reviewer]]);
  const host=await createApp(f.store,true),payloads=new ProtectedPayloads(f.store,{id:"synthetic-key",bytes:randomBytes(32)}),s=new ProtectedCollection(f.store,payloads,()=>actor,async()=>"fake-credential",()=>({group:"fake-account",intervalMs:0}));
  registerManagementV4(host.app,s,grants);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({resultCode:"S00",resultCount:0,resultList:[]}))));
  try{const bootstrap=await host.app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1"}}),headers={host:"127.0.0.1",cookie:bootstrap.cookies.map(c=>c.name+"="+c.value).join("; "),"x-csrf-token":bootstrap.json().csrf,authorization:"Bearer writer"};
    const send=(url:string,payload:unknown,h=headers)=>host.app.inject({method:"POST",url:"/api/management-v4"+url,headers:h,payload:payload as any});
    const prepared=await send("/prepare",{service:"qna",query:{keyword:"가상",mode:"1",page:1}});expect(prepared.statusCode,prepared.body).toBe(200);const ref=prepared.json();
    expect((await send("/collections",{ref:ref.ref,idempotencyKey:"test"})).statusCode).toBe(400);
    expect((await send("/egress",{node:ref.node,purpose:"query",provider:"qna",action:"release",basis:"격리 모의 자료만 허용하는 전송 검토입니다.",expiresAt:p.expiresAt},{...headers,authorization:"Bearer reviewer"})).statusCode).toBe(200);
    const job=await send("/collections",{ref:ref.ref,idempotencyKey:"test"});expect(job.statusCode).toBe(202);await workOne(s.jobs,"worker",s.handle.bind(s));
    const state=await host.app.inject({url:"/api/management-v4/jobs/"+job.json().jobId,headers});expect(state.json().job.state).toBe("succeeded");
    const raw=JSON.parse((f.store.db.prepare("SELECT body FROM v4_captures").get() as any).body).rawRef;
    const download=await host.app.inject({url:"/api/management-v4/payloads/raw/"+raw,headers});expect(download.statusCode).toBe(200);expect(download.headers["content-disposition"]).toContain("attachment");
    grants.set(sha("writer"),{...actor,tenant:"other"});expect((await host.app.inject({url:"/api/management-v4/payloads/raw/"+raw,headers})).statusCode).toBe(400);
  }finally{await host.app.close();f.clean();vi.unstubAllGlobals();}
});

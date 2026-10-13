import {it,expect,vi,afterEach} from "vitest";
import {randomBytes} from "node:crypto";
import {readFileSync,writeFileSync,existsSync,mkdirSync} from "node:fs";
import {join} from "node:path";
import {testStore,request} from "./helpers.js";
import {writer,reviewer} from "./v2-fixture.js";
import {trainingFixture,session} from "./v6-fixture.js";
import {TrainingCases} from "../server/training-cases-v6.js";
import {ManagedRecords,guardManagedExport} from "../server/records-v6.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {PayloadProvenance} from "../server/provenance-v4.js";
import {createApp} from "../server/app.js";
import {registerManagementV6} from "../server/management-v6.js";
import {AttachmentGraph,attachmentWorkerHook} from "../server/attachment-graph-v6.js";
import {MigrationResume} from "../server/migration-resume-v6.js";
import {ProtectedCollection} from "../server/collection-v4.js";
import {workOne} from "../server/jobs-v3.js";
import {sha} from "../server/store.js";
import {ingestDocument} from "../server/documents.js";
import {newReview} from "../server/reviews.js";
import {LegacyBridge} from "../server/legacy-bridge-v3.js";
import {trainingPolicies} from "../server/training-v6.js";
const key={id:"synthetic-v6",bytes:randomBytes(32)},expiry="2099-01-01T00:00:00Z";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:["writer","egress_reviewer","collection_operator","backup_operator"] as typeof writer.roles};
const local=(g:PayloadProvenance,node:string)=>{for(const purpose of ["read","document"])g.event(p,node,purpose,"local","release","명시적 host 합성 권한이며 실제 사업장 승인이 아닙니다.",expiry);};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(trainingPolicies)("V6-C01: $id 원문→수동 보완→독립 검토→기존 검토·일반 export",async policy=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),svc=new TrainingCases(v);let app:any;
  try{const input=trainingFixture(),d=await ingestDocument(f.store,"v6-synthetic.txt",Buffer.from(JSON.stringify(input))),bound=svc.records.bindDocument(p,d.id);local(svc.records.graph,bound.node);
    const first=svc.fromDocument(p,bound.id);local(svc.records.graph,first.own);expect(svc.evaluate(p,first.id).results.every((r:any)=>r.legalApproved===false)).toBe(true);
    const manual=svc.supplement(p,first.id,first.version,input);local(svc.records.graph,manual.own);expect(()=>svc.supplement(p,first.id,first.version,input)).toThrow();
    expect(()=>svc.review({...p,roles:[...p.roles,"case_reviewer"]},first.id,manual.version,"자기 자료는 독립 확인으로 처리할 수 없습니다.")).toThrow();
    const checked=svc.review({...reviewer,roles:[...reviewer.roles,"writer"]},first.id,manual.version,"가상 대상·시간·미제공 사항을 독립 합성 actor로 확인했습니다.");local(svc.records.graph,checked.own);
    const review=newReview({...request(),asOf:input.asOf,prompt:"가상 사업장 "+policy.label+" 검토를 요청합니다.",documentIds:[d.id]});f.store.saveReview(review);new LegacyBridge(f.store,"v6").attach(p,review,"project");f.store.saveReview(review);
    const publish=svc.publish(p,first.id,review.id);local(svc.records.graph,publish.binding.own);const context={gate:svc.records.graph,principal:p,parents:[publish.binding.node]};
    expect(()=>guardManagedExport(f.store,review.id,context)).not.toThrow();expect(()=>guardManagedExport(f.store,review.id)).toThrow();expect(()=>guardManagedExport(f.store,review.id,{...context,principal:{...p,tenant:"other"}})).toThrow();
    ({app}=await createApp(f.store,true,undefined,undefined,()=>context));const init=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),headers={host:"127.0.0.1:4999",cookie:init.cookies.map((c:any)=>c.name+"="+c.value).join("; ")};
    const exported=await app.inject({url:`/api/reviews/${review.id}/export?format=markdown`,headers});expect(exported.statusCode).toBe(200);expect(exported.body).toContain(policy.label);expect(exported.headers["content-disposition"]).toContain("attachment");expect(f.store.review(review.id)?.issues.every(i=>i.category!=="clear_risk")).toBe(true);
    const changed=svc.supplement(p,first.id,checked.version,input);expect(changed.version).toBe(checked.version+1);expect(()=>guardManagedExport(f.store,review.id,context)).toThrow();
  }finally{await app?.close();f.clean();}
},30000); // app + DB workflow: explicit timeout like V7-C01 (8.9s on a Windows runner, PR #15)
it("V6-C02: 교체된 문서 버전과 다른 영역은 후보·파생의 부모로 재사용 거절",async()=>{const f=testStore(),v=new ProtectedPayloads(f.store,key),records=new ManagedRecords(v);try{const d=await ingestDocument(f.store,"synthetic.txt",Buffer.from("가상 업무 자료 원문입니다.")),b=records.bindDocument(p,d.id);local(records.graph,b.node);expect(()=>records.document({...p,tenant:"other"},b.id)).toThrow();f.store.put("documents",d.id,{...d,text:"교체된 가상 자료"});expect(()=>records.document(p,b.id)).toThrow();}finally{f.clean();}});
it.each([true,false])("V6-H01: host grant 없는 앱에서 v6 관리 경로는 미등록 (%s)",async test=>{const f=testStore(),{app}=await createApp(f.store,test);try{expect(app.hasRoute({method:"GET",url:"/api/management-v6/training/x"})).toBe(false);}finally{await app.close();f.clean();}});
it.each(["form5","notice"] as const)("V6-A01: %s 격리 관리 route가 보존 공식 페이지→download→암호화→실제 파서를 호출",async id=>{const f=testStore(),v=new ProtectedPayloads(f.store,key),bytes=readFileSync(id==="form5"?"docs/implementation-v5/official/form5.pdf":"docs/implementation-v5/official/notice.hwpx"),graph=new AttachmentGraph(v,[],{resolve:async()=>["8.8.8.8"],download:async()=>({bytes,type:id==="form5"?"application/pdf":"application/octet-stream",peer:"8.8.8.8",status:200})}),{app}=await createApp(f.store,true);
  try{const raw=graph.preserve(p,id,readFileSync(id==="form5"?"docs/implementation-v5/official/form5-detail.html":"docs/implementation-v5/official/notice.html"));local(graph.graph,raw.node);graph.graph.event(p,raw.node,"query","attachment-download","release","공식 공개 표본 다운로드를 모의하는 host 시험입니다.",expiry);registerManagementV6(app,v,new Map([[sha("v6-token"),p]]),graph);
    const init=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),headers={host:"127.0.0.1:4999",cookie:init.cookies.map(c=>c.name+"="+c.value).join("; "),"x-csrf-token":init.json().csrf,authorization:"Bearer v6-token"};
    const r=await app.inject({method:"POST",url:`/api/management-v6/attachments/${raw.id}/collect`,headers,payload:{index:0}});expect(r.statusCode).toBe(200);expect(r.json().metadataParent).toBe(raw.node);expect(r.json().extraction.status).toBe("extracted_unreviewed");expect(r.json().decisiveCellsChecked).toBe(false);expect(r.json().hash).toBe(sha(bytes));
    expect((await app.inject({method:"POST",url:`/api/management-v6/attachments/${raw.id}/collect`,headers,payload:{index:0,url:"https://attacker.invalid/file"}})).statusCode).toBe(400);
  }finally{await app.close();f.clean();}
},40000);
it("V6-A02: 사고 첨부 식별자·정확 URL·GUIDE 날짜·SIF 미지원 분리",async()=>{const f=testStore(),g=new AttachmentGraph(new ProtectedPayloads(f.store,key));try{
  const record=g.preserve(p,"accident-files",Buffer.from(JSON.stringify({body:{items:{item:{boardno:"00123",filenm:"source.pdf",filepath:"https://example.invalid/exact.pdf"}}}})));local(g.graph,record.node);const found=g.discover(p,record.id);expect((found.files[0] as any).boardno).toBe("00123");g.graph.event(p,record.node,"query","attachment-download","release","합성 metadata 확인이며 임의 외부 다운로드를 허용하지 않습니다.",expiry);await expect(g.collect(p,record.id,0)).rejects.toThrow("정책 미등록");
  const guide=g.preserve(p,"guide",Buffer.from(JSON.stringify({body:{items:{item:{fileDownloadUrl:"https://example.invalid/exact.pdf",techGdlnOfancYmd:"20261008"}}}})));local(g.graph,guide.node);expect((g.discover(p,guide.id).files[0] as any).date).toBe("20261008");const sif=g.preserve(p,"sif",Buffer.from("{}"));local(g.graph,sif.node);expect(g.discover(p,sif.id).status).toBe("support_unverified");
}finally{f.clean();}});
it("V6-Q01: 보호 이관 read switch·checkpoint 재개·중복 이관과 실제 worker",async()=>{const f=testStore(),v=new ProtectedPayloads(f.store,key),s=new ProtectedCollection(f.store,v,()=>p,async()=>"synthetic-key",()=>({group:"synthetic",intervalMs:0}));const m=new MigrationResume(s);let calls=0;
  vi.stubGlobal("fetch",vi.fn(async()=>{calls++;return new Response(JSON.stringify({response:{header:{resultCode:"00"},body:{totalCount:0,items:[],pageNo:2,numOfRows:10}}}));}));
  try{const old=s.jobs.enqueue(p,"old-v3",{provider:"waste-companies",operation:"search",query:{keyword:"가상",mode:"search",page:2},credentialRef:"legacy-reference",schemaVersion:"v3-1",budgetMs:180000});s.jobs.control(p,old.id,"pause");
    await expect(m.prepare(p,old.id,phase=>{if(phase==="before_switch")throw Error("checkpoint crash");})).rejects.toThrow("checkpoint crash");expect(f.store.db.prepare("SELECT count(*) n FROM v6_migration_routes").get()).toEqual({n:0});
    const b=await m.prepare(p,old.id);expect((await m.prepare(p,old.id)).jobId).toBe(b.jobId);expect(()=>m.resume(p,old.id)).toThrow();s.provenance.event(p,b.queryNode,"query","waste-companies","release","가상 이관 작업의 새 질의 원문에만 적용되는 명시적 권한입니다.",expiry);
    m.resume(p,old.id);await workOne(s.jobs,"v6-migration",s.handle.bind(s));const seen=m.observe(p,old.id);expect(seen.queueResumeVerified).toBe(true);expect(seen.readPathMigrated).toBe(true);expect(seen.allTraceCovered).toBe(false);expect(seen.plaintextRemovalComplete).toBe(false);expect(calls).toBe(1);expect(s.jobs.get(p,old.id).state).toBe("paused");
    const units=s.jobs.units(p,b.jobId);expect(units.every(u=>u.data===undefined||typeof (u.data as any).protectedRef==="string")).toBe(true);expect(JSON.stringify(f.store.db.prepare("SELECT body FROM v3_jobs WHERE id=?").get(b.jobId))).not.toContain("가상");
  }finally{f.clean();}
});
it.each(["accidents","guide"] as const)("V6-A03: %s 실제 worker capture→식별자 metadata→정확한 정책→원본·추출",async service=>{const f=testStore(),v=new ProtectedPayloads(f.store,key),bytes=readFileSync("docs/implementation-v5/official/form5.pdf"),url="https://fixture.example/source.pdf",provider=service==="accidents"?"accident-files":"guide";
  const graph=new AttachmentGraph(v,[{url,provider,fileId:service==="accidents"?"20250625101629Z7GLYM:source.pdf":url,mime:"application/pdf",version:"synthetic-fixture-v6",effectiveFrom:null}],{resolve:async()=>["8.8.8.8"],download:async()=>({bytes,type:"application/pdf",peer:"8.8.8.8",status:200})});
  const hook=attachmentWorkerHook(graph,async(_p,record)=>{local(graph.graph,record.node);graph.graph.event(p,record.node,"query","attachment-download","release","host가 합성 metadata의 정확한 첨부에만 부여한 시험 권한입니다.",expiry);});
  const s=new ProtectedCollection(f.store,v,()=>p,async()=>"synthetic-only",()=>({group:"synthetic",intervalMs:0}),hook);let calls=0;
  vi.stubGlobal("fetch",vi.fn(async(input:any)=>{calls++;const path=new URL(input).pathname,items=path.endsWith("Disaster_attach_api02")?[{boardno:"20250625101629Z7GLYM",filenm:"source.pdf",filepath:url}]:service==="accidents"?[{boardno:"20250625101629Z7GLYM",contents:"가상 사고 본문",keyword:"가상",atcflcnt:"1"}]:[{techGdlnNm:"가상 지침",techGdlnNo:"SYNTHETIC",techGdlnOfancYmd:"20261008",fileDownloadUrl:url}];return new Response(JSON.stringify({header:{resultCode:"00"},body:{items:{item:items},totalCount:1,pageNo:1,numOfRows:10}}));}));
  try{const prep=s.prepare(p,service,{keyword:"가상",mode:service==="guide"?"name":"search",page:1});s.provenance.event(p,prep.node,"query",service,"release","합성 provider 응답을 사용한 원문 연결 시험 권한입니다.",expiry);const job=await s.enqueue(p,prep.ref,"v6-attachments");await workOne(s.jobs,"v6-attachments-worker",s.handle.bind(s));
    const units=s.jobs.units(p,job.id),attachment=units.find(u=>u.role==="attachment"&&u.id.endsWith(":attachment-0"));expect(attachment?.state).toBe("success");const output=s.readUnit(p,attachment!);expect(output.hash).toBe(sha(bytes));expect(output.metadataParent).toBeTruthy();expect(output.extraction.status).toBe("extracted_unreviewed");expect(output.legalApproval).toBe(false);expect(calls).toBe(service==="accidents"?2:1);
  }finally{f.clean();}
},40000);

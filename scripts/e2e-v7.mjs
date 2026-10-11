import {chromium} from "playwright-core";
import {mkdtempSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomBytes} from "node:crypto";
import assert from "node:assert/strict";
import {createApp} from "../build/server/app.js";
import {Store} from "../build/server/store.js";
import {ProtectedPayloads} from "../build/server/protected-payload-v4.js";
import {SafetyManagerCases} from "../build/server/safety-manager-cases-v7.js";
import {safetyManagerPolicies} from "../build/server/safety-manager-v7.js";
// Isolated browser check (v7 spec §5): existing UI (no UI change) → upload → question → existing review → Markdown export,
// with the real internal services. Supplement and independent review have no UI and go through the isolated service, as in v6.
// Synthetic site, synthetic actors and grants only; no keys, no external calls (all non-local requests are aborted).
delete process.env.LAW_OC;
mkdirSync("work",{recursive:true});mkdirSync("playwright-report",{recursive:true});
const store=new Store(mkdtempSync(resolve("work/v7-browser-"))),p={id:"synthetic-author-v7",tenant:"synthetic-site-v7",synthetic:true,roles:["writer","egress_reviewer"],validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
const svc=new SafetyManagerCases(new ProtectedPayloads(store,{id:"synthetic-only-v7",bytes:randomBytes(32)})),g=svc.records.graph;let context;
const local=node=>{for(const purpose of ["read","document"])g.event(p,node,purpose,"local","release","격리 안전관리자 브라우저 검증의 명시적 local host 권한입니다.",p.expiresAt);};
const asOf="2026-10-09"; // review date entered in the UI; legal basis date 2026-10-08 is fixed in the case
const filing=(receivedOn,form)=>({evidence:"receipt",receivedOn,office:"competent",formUsed:form,formFieldsReviewed:true});
const input={subject:"synthetic-site",site:"synthetic-site",asOf,legalBasisDate:"2026-10-08",scopeReviewed:true,annexRow:32,rowReviewed:true,regularWorkers:120,workersBasisReviewed:true,
  contracting:{relation:"none",aggregationReviewed:null,primeDedicatedManager:null},
  joint:{claimed:false,sameEmployer:null,sameSigungu:null,within15km:null,combinedWorkers:null,combinedAmount100M:null,reviewed:null},
  entrustment:{claimed:false,agencyDesignated:null,start:null,end:null,reviewed:null},
  managers:[{id:"sm-1",appointedOn:"2026-09-01",appointmentEvidence:"document",path:"2",grade:"기사",qualificationEvidence:"document",pathFactsReviewed:true,assignment:"dedicated",dutyAllocationEvidence:"document",assignmentReviewed:true}],
  events:[{id:"ev-appoint",kind:"appointment",date:"2026-09-01",managerId:"sm-1",filing:filing("2026-09-10","annex2"),reviewed:true},{id:"ev-dismiss",kind:"dismissal",date:"2026-08-20",managerId:"sm-0",filing:filing("2026-08-28","annex3-2"),reviewed:true}],
  performance:{items:[1,2,3,4,5,6,7,8,9,10].map(item=>({item,applies:true,evidence:"record",reviewed:true})),workPatternConsidered:true,reviewed:true},
  nonperformanceProven:[],independentFactsReviewed:null};
let browser,app;const checkpoints=[];
try{
  ({app}=await createApp(store,true,undefined,{principal:p,mode:"project",adapter:"v7"},()=>context));await app.listen({port:0,host:"127.0.0.1"});const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.SHE_TEST_BROWSER||"chrome",headless:true});const page=await browser.newPage();await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await page.goto(base);
  await page.getByRole("button",{name:/자료함/}).click();await page.locator(".upload-zone input").setInputFiles({name:"v7-synthetic.txt",mimeType:"text/plain",buffer:Buffer.from(JSON.stringify(input))});await page.getByRole("heading",{name:"v7-synthetic.txt"}).waitFor();
  const d=store.all("documents").find(d=>d.name==="v7-synthetic.txt"),bound=svc.records.bindDocument(p,d.id);local(bound.node);const first=svc.fromDocument(p,bound.id);local(first.own);
  assert.ok(svc.evaluate(p,first.id).results.every(r=>r.state==="pending"&&r.enabled===false&&r.legalApproved===false)); // before independent review
  const manual=svc.supplement(p,first.id,first.version,input);local(manual.own);
  const checked=svc.review({...p,id:"independent-synthetic-v7",roles:["writer","case_reviewer"]},first.id,manual.version,"가상 사업장 업종 행·인원·선임·보고·업무 기록을 독립 actor로 검토했습니다.");local(checked.own);
  for(const policy of safetyManagerPolicies){context=undefined;await page.getByRole("button",{name:"워크스페이스",exact:true}).click();await page.getByLabel(/v7-synthetic.txt/).check();
    const prompt="가상 사업장 산업안전보건법 "+policy.label+"의 증빙과 추가 확인을 검토합니다.";await page.getByLabel("검토할 업무 상황").fill(prompt);await page.getByLabel("검토 기준일").fill(asOf);await page.getByRole("button",{name:"검토 시작",exact:true}).click();await page.getByRole("heading",{name:policy.label,exact:true}).waitFor();
    const review=store.all("reviews").find(r=>r.request.prompt===prompt);assert.ok(review);
    assert.equal(review.issues.some(i=>i.title==="안전관리자 재선임"),false,"hazmat candidate must not be mixed in");
    const projected=svc.publish(p,first.id,review.id);local(projected.binding.own);context={gate:g,principal:p,parents:[projected.binding.node]};
    const result=await page.evaluate(async id=>{const r=await fetch(`/api/reviews/${id}/export?format=markdown`);return {status:r.status,text:await r.text(),filename:r.headers.get("content-disposition")};},review.id);
    assert.equal(result.status,200);assert.ok(result.text.includes(policy.label));assert.ok(result.text.includes("법률 기준일 2026-10-08"));assert.ok(result.filename.includes("attachment"));
    assert.equal(store.review(review.id).issues.some(i=>i.category==="clear_risk"),false);
    const state=svc.evaluate(p,first.id).results.find(r=>r.id===policy.id).state;
    checkpoints.push({id:policy.id,state,oldUIUploadQuestionReview:true,sourceManualIndependent:true,ordinaryMarkdownExport:true,enabled:false,legalApproved:false});
  }
  writeFileSync("playwright-report/v7-checkpoints.json",JSON.stringify({checkpoints,oldUIUsed:true,uiChanged:false,actualKeys:0,externalCalls:"aborted",realSiteVerified:false,productionTouched:false},null,2));
  console.log("PASS v7 safety manager 6 → existing upload/question/review/Markdown export");
}finally{await browser?.close();await app?.close();store.close();}

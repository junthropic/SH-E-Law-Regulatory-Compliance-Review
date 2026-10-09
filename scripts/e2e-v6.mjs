import {chromium} from "playwright-core";
import {mkdtempSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomBytes} from "node:crypto";
import assert from "node:assert/strict";
import {createApp} from "../build/server/app.js";
import {Store,sha} from "../build/server/store.js";
import {ProtectedPayloads} from "../build/server/protected-payload-v4.js";
import {TrainingCases} from "../build/server/training-cases-v6.js";
import {trainingPolicies} from "../build/server/training-v6.js";
import {registerManagementV6} from "../build/server/management-v6.js";
delete process.env.LAW_OC;
mkdirSync("work",{recursive:true});mkdirSync("playwright-report",{recursive:true});
const store=new Store(mkdtempSync(resolve("work/v6-browser-"))),p={id:"synthetic-author-v6",tenant:"synthetic-site-v6",synthetic:true,roles:["writer","egress_reviewer"],validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
const svc=new TrainingCases(new ProtectedPayloads(store,{id:"synthetic-only-v6",bytes:randomBytes(32)})),g=svc.records.graph;let context;
const local=node=>{for(const purpose of ["read","document"])g.event(p,node,purpose,"local","release","격리 교육 브라우저 검증의 명시적 local host 권한입니다.",p.expiresAt);};
const input={subject:"synthetic-person",site:"synthetic-site",asOf:"2026-10-08",scope:"included",scopeReviewed:true,industry:"가상 제조업",size:60,role:"other",roleReviewed:true,hireDate:"2026-08-15",firstWork:"2026-08-15",workChanged:true,changedWorkStart:"2026-09-01",contract:{kind:"regular",start:"2026-08-15",end:null,boundaryReviewed:true},period:{cycle:"anniversary",from:null,to:null,planReviewed:null},special:{applies:true,workNumber:1,numberVersion:"current39",shortIntermittent:false,definitionReviewed:true},sessions:[],exceptions:[],nonperformanceProven:[],independentFactsReviewed:null};
let browser,app;const checkpoints=[];
try{
  ({app}=await createApp(store,true,undefined,{principal:p,mode:"project",adapter:"v6"},()=>context));registerManagementV6(app,svc.vault,new Map([[sha("v6-synthetic-token"),p]]));await app.listen({port:0,host:"127.0.0.1"});const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.SHE_TEST_BROWSER||"chrome",headless:true});const page=await browser.newPage();await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await page.goto(base);
  await page.getByRole("button",{name:/자료함/}).click();await page.locator(".upload-zone input").setInputFiles({name:"v6-synthetic.txt",mimeType:"text/plain",buffer:Buffer.from(JSON.stringify(input))});await page.getByRole("heading",{name:"v6-synthetic.txt"}).waitFor();
  const d=store.all("documents").find(d=>d.name==="v6-synthetic.txt"),bound=svc.records.bindDocument(p,d.id);local(bound.node);const first=svc.fromDocument(p,bound.id);local(first.own);const manual=svc.supplement(p,first.id,first.version,input);local(manual.own);
  const checked=svc.review({...p,id:"independent-synthetic-v6",roles:["writer","case_reviewer"]},first.id,manual.version,"가상 교육 자료의 사실과 미제공 사항만 독립 actor로 검토했습니다.");local(checked.own);
  for(const policy of trainingPolicies){context=undefined;await page.getByRole("button",{name:"워크스페이스",exact:true}).click();await page.getByLabel(/v6-synthetic.txt/).check();const prompt="가상 사업장 "+policy.label+"의 증빙과 추가 확인을 검토합니다.";await page.getByLabel("검토할 업무 상황").fill(prompt);await page.getByLabel("검토 기준일").fill("2026-10-08");await page.getByRole("button",{name:"검토 시작",exact:true}).click();await page.getByRole("heading",{name:policy.label,exact:true}).waitFor();
    const review=store.all("reviews").find(r=>r.request.prompt===prompt);assert.ok(review);const projected=svc.publish(p,first.id,review.id);local(projected.binding.own);context={gate:g,principal:p,parents:[projected.binding.node]};
    const result=await page.evaluate(async id=>{const r=await fetch(`/api/reviews/${id}/export?format=markdown`);return {status:r.status,text:await r.text(),filename:r.headers.get("content-disposition")};},review.id);assert.equal(result.status,200);assert.ok(result.text.includes(policy.label));assert.ok(result.filename.includes("attachment"));assert.equal(store.review(review.id).issues.some(i=>i.category==="clear_risk"),false);
    checkpoints.push({id:policy.id,oldUIUploadQuestionReview:true,sourceManualIndependent:true,ordinaryMarkdownExport:true,enabled:false,legalApproved:false});
  }
  writeFileSync("playwright-report/v6-checkpoints.json",JSON.stringify({checkpoints,oldUIUsed:true,actualKeys:0,realSiteVerified:false,productionTouched:false},null,2));console.log("PASS v6 education 5 → existing upload/question/review/Markdown export");
}finally{await browser?.close();await app?.close();store.close();}

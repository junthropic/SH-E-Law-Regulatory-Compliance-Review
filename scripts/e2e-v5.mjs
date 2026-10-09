import {chromium} from "playwright-core";
import {mkdtempSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomBytes} from "node:crypto";
import assert from "node:assert/strict";
import {createApp} from "../build/server/app.js";
import {Store,sha} from "../build/server/store.js";
import {ProtectedPayloads} from "../build/server/protected-payload-v4.js";
import {ProtectedCollection} from "../build/server/collection-v4.js";
import {WasteProposals} from "../build/server/waste-proposals-v5.js";
import {registerManagementV5} from "../build/server/management-v5.js";
import {workOne} from "../build/server/jobs-v3.js";
delete process.env.LAW_OC;
mkdirSync("work",{recursive:true});mkdirSync("playwright-report",{recursive:true});
const store=new Store(mkdtempSync(resolve("work/v5-browser-"))),p={id:"synthetic-author",tenant:"synthetic-site",synthetic:true,roles:["writer","egress_reviewer"],validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
const vault=new ProtectedPayloads(store,{id:"synthetic-only",bytes:randomBytes(32)}),service=new ProtectedCollection(store,vault,()=>p,async()=>"synthetic-key",()=>({group:"synthetic",intervalMs:0}));
const oldFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async url=>{
  if(!String(url).startsWith("https://apis.data.go.kr/B552584/kecoapi/wstdspBzentyService/getWstdspBzentyInfo"))throw Error("Unapproved fixture call");calls++;
  return new Response(JSON.stringify({response:{header:{resultCode:"00"},body:{totalCount:1,pageNo:1,numOfRows:10,items:{item:{brNo:"0012345678",bzentyNm:"가상 수탁업체",addr:"가상 주소",prcsWstListCn:"가상 폐기물"}}}}}));
};
let browser,app;
try{
  const prepared=service.prepare(p,"waste-companies",{keyword:"가상",mode:"search",page:1});service.provenance.event(p,prepared.node,"query","waste-companies","release","합성 브라우저 검증에서만 외부 기관 응답을 모의합니다.",p.expiresAt);
  const job=await service.enqueue(p,prepared.ref,"v5-e2e");await workOne(service.jobs,"v5-worker",service.handle.bind(service));assert.equal(service.jobs.get(p,job.id).state,"succeeded");
  const c=store.db.prepare("SELECT id FROM v4_captures").get(),proposals=new WasteProposals(vault),proposal=proposals.fromCapture(p,c.id),manual=proposals.supplement(p,proposal.id,proposal.version,{contractEvidence:"가상 시험: 계약 원본 미제공"});
  proposals.review({...p,id:"independent-synthetic",roles:["writer","case_reviewer"]},proposal.id,manual.version,"가상 응답과 미확인 사항을 독립 시험 주체로 대조했습니다.");
  ({app}=await createApp(store,true,undefined,{principal:p,mode:"project",adapter:"v4"}));registerManagementV5(app,vault,new Map([[sha("v5-synthetic-token"),p]]));
  await app.listen({port:0,host:"127.0.0.1"});const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.SHE_TEST_BROWSER||"chrome",headless:true});const page=await browser.newPage();await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await page.goto(base);
  await page.getByRole("button",{name:/자료함/}).click();await page.locator(".upload-zone input").setInputFiles({name:"v5-synthetic.txt",mimeType:"text/plain",buffer:Buffer.from("가상 폐기물 사례이며 시설·허가·처리용량은 확인하지 못했습니다.")});await page.getByRole("heading",{name:"v5-synthetic.txt"}).waitFor();
  await page.getByRole("button",{name:"워크스페이스",exact:true}).click();await page.getByLabel(/v5-synthetic.txt/).check();const prompt="가상 폐기물 수탁 사례입니다. 허가 서류는 미제공이며 무허가인지 확인되지 않았습니다.";await page.getByLabel("검토할 업무 상황").fill(prompt);await page.getByRole("button",{name:"검토 시작",exact:true}).click();await page.getByRole("heading",{name:"폐기물 수탁자 적격·위탁 조건",exact:true}).waitFor();
  const review=store.all("reviews").find(r=>r.request.prompt===prompt);assert.ok(review);assert.equal(review.issues.some(i=>i.category==="clear_risk"),false);
  const exported=await page.evaluate(async({review,id})=>{const r=await fetch(`/api/management-v5/reviews/${review}/waste/${id}/export`,{headers:{Authorization:"Bearer v5-synthetic-token"}});return {status:r.status,body:await r.json()};},{review:review.id,id:proposal.id});
  assert.equal(exported.status,200);assert.equal(exported.body.proposal.trace.captureId,c.id);assert.equal(exported.body.proposal.legalApproval,false);assert.ok(exported.body.proposal.reasons.includes("capacity_unknown"));assert.equal(calls,1);
  writeFileSync("playwright-report/v5-checkpoints.json",JSON.stringify({oldUIUsed:true,rawToProposal:true,manualSupplement:true,independentSyntheticReview:true,documentTrace:true,synchronousExportStatus:200,providerCallsMocked:calls,realProviderCalls:0,realSiteVerified:false,productionTouched:false},null,2));console.log("PASS v5 raw → proposal → manual → independent synthetic review → existing UI → trace export");
}finally{await browser?.close();await app?.close();store.close();globalThis.fetch=oldFetch;}

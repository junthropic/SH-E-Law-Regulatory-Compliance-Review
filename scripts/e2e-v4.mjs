import { chromium } from "playwright-core";
import { mkdtempSync,mkdirSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../build/server/app.js";
import { Store,sha } from "../build/server/store.js";
delete process.env.LAW_OC;
mkdirSync("work",{recursive:true});mkdirSync("playwright-report",{recursive:true});
const store=new Store(mkdtempSync(resolve("work/v4-browser-"))),principal={id:"synthetic-author",tenant:"synthetic-site",synthetic:true,roles:["writer"],validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async()=>{calls++;throw Error("External network forbidden in scenario test");};
const {app}=await createApp(store,true,new Map([[sha("synthetic-token"),principal]]),{principal,mode:"project",adapter:"v4"});
let browser;const checkpoints=[];
try {
  await app.listen({port:0,host:"127.0.0.1"});const base=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({channel:process.env.SHE_TEST_BROWSER||"chrome",headless:true});const page=await browser.newPage();
  await page.route("**/*",r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await page.goto(base);
  await page.getByRole("button",{name:/자료함/}).click();
  await page.locator(".upload-zone input").setInputFiles({name:"v4-synthetic.txt",mimeType:"text/plain",buffer:Buffer.from("가상 입력: 양식만 보유, 현장 이행 및 허가 여부는 미확인입니다.")});
  await page.getByRole("heading",{name:"v4-synthetic.txt"}).waitFor();
  for(const c of [
    {id:"S2",prompt:"가상 폐기물 위탁 사례입니다. 수탁업체와 시설, 허가 또는 신고 및 현재 보관량은 미확인입니다.",title:"폐기물 수탁자 적격·위탁 조건",count:1},
    {id:"S3",prompt:"가상 위험물 정기점검 사례입니다. 점검 실시와 늦은 제출 및 접수는 별도 기록이며 증빙은 없습니다.",title:"정기점검 결과 제출",count:6},
    {id:"S5",prompt:"가상 위험성평가 사례입니다. 공정 추가 예정이며 양식만 있습니다. 근로자대표 요구 및 참여, 결과 공유는 미확인입니다.",title:"위험성평가 실시",count:7},
  ]) {
    await page.getByRole("button",{name:"워크스페이스",exact:true}).click();
    await page.getByLabel(/v4-synthetic.txt/).check();
    await page.getByLabel("검토할 업무 상황").fill(c.prompt);await page.getByRole("button",{name:"검토 시작",exact:true}).click();
    await page.getByRole("heading",{name:c.title,exact:true}).waitFor();
    const review=store.all("reviews").find(r=>r.request.prompt===c.prompt);assert.ok(review);
    const trace=JSON.parse(store.db.prepare("SELECT body FROM v3_shadow WHERE review=?").get(review.id).body);
    assert.equal(trace.adapter,"legacy-v4.1");assert.equal(trace.rows.length,c.count);assert.equal(review.issues.some(i=>i.category==="clear_risk"),false);
    const exported=await page.evaluate(async id=>(await fetch(`/api/reviews/${id}/export?format=md`)).text(),review.id);
    assert.ok(exported.includes(trace.rows[0].decision.id));checkpoints.push({scenario:c.id,policies:c.count,documentTrace:true,realSiteVerified:false});
  }
  assert.equal(calls,0);writeFileSync("playwright-report/v4-checkpoints.json",JSON.stringify({checkpoints,externalCalls:0,uiChanged:false,productionTouched:false},null,2));console.log("PASS v4 S2/S3/S5 existing UI → synthetic candidate → document trace");
}finally{await browser?.close();await app.close();globalThis.fetch=originalFetch;}

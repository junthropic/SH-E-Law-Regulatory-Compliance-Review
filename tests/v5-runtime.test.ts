import { it, expect, vi, afterEach } from "vitest";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import AdmZip from "adm-zip";
import { testStore, request } from "./helpers.js";
import { fixture, writer, reviewer } from "./v2-fixture.js";
import { sha } from "../server/store.js";
import { ProtectedPayloads } from "../server/protected-payload-v4.js";
import { PayloadProvenance } from "../server/provenance-v4.js";
import { collectOfficial, discoverOfficial } from "../server/attachments-v5.js";
import { isolatedParse, parseProtected } from "../server/extraction-v5.js";
import { WasteProposals, decodeWaste, businessIdentity } from "../server/waste-proposals-v5.js";
import { form5Inventory, form5Sections, normalizeDaily, riskProfile, form5Conflict } from "../server/profiles-v5.js";
import { backupGeneration, restoreGeneration, openGeneration } from "../server/backup-v5.js";
import { ProtectedMigration, resolveLegacyDigest } from "../server/migration-v5.js";
import { SendAdmissions } from "../server/admission-v5.js";
import { ProtectedCollection } from "../server/collection-v4.js";
import { workOne } from "../server/jobs-v3.js";
import { LegacyBridge } from "../server/legacy-bridge-v3.js";
import { newReview } from "../server/reviews.js";
import { registerManagementV5 } from "../server/management-v5.js";
import { createApp } from "../server/app.js";
import { ingestDocument } from "../server/documents.js";

const key={id:"synthetic-v5",bytes:randomBytes(32)},expiry="2099-01-01T00:00:00Z";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:["writer","backup_operator","collection_operator","egress_reviewer"] as typeof writer.roles};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
const original=(file:string)=>readFileSync(join("docs/implementation-v5/official",file));
it.each(["form5","notice"] as const)("V5-A01: 공식 %s 발견·암호 원문·실제 격리 파서 연결",async id=>{
  const f=testStore(),vault=new ProtectedPayloads(f.store,key),file=id==="form5"?"form5.pdf":"notice.hwpx",bytes=original(file);
  try {
    const discovered=discoverOfficial(id,original(id==="form5"?"form5-detail.html":"notice.html").toString());
    const result=await collectOfficial(p,vault,discovered,{resolve:async()=>["8.8.8.8"],download:async()=>({bytes,peer:"8.8.8.8",status:200,type:id==="form5"?"application/pdf":"application/octet-stream"})});
    const parsed=JSON.parse(vault.get(p,result.extraction.ref,"unit").toString());
    expect(parsed.markdown).toContain(id==="form5"?"수탁":"2025년 1월 2일");expect(parsed.cellsVerified).toBe(false);expect(result.socketObservation).toBe("injected-transport");
    expect(parsed.resourcePermissions).toEqual({network:false,fileWrite:false,childProcess:false,addons:false});
    expect(readdirSync(join(f.store.dir,"originals"))).toHaveLength(0);expect(JSON.stringify(f.store.db.prepare("SELECT * FROM v4_payloads").all())).not.toContain(parsed.markdown.slice(0,100));
    expect(()=>vault.get({...p,tenant:"other"},result.ref,"attachment")).toThrow();
  }finally{f.clean();}
},40000);
it("V5-A02: 첨부 주소 추측·다른 파일ID는 발견으로 인정하지 않는다",()=>{
  expect(()=>discoverOfficial("notice","<a href='/common/downloadFile.do?file_seq=other'>x</a>")).toThrow();
});
it.each(["../escape.xml","C:stream.xml","Contents/payload.zip","Contents/entity.xml"])("V5-A03: 위험 압축 항목 %s를 파서 진입 전 거절",async name=>{
  const zip=new AdmZip();zip.addFile("mimetype",Buffer.from("application/hwp+zip"));zip.addFile("Contents/content.hpf",Buffer.from("<a/>"));zip.addFile("payload.xml",Buffer.from(name.includes("entity")?'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>':name.endsWith(".zip")?"PK\u0003\u0004":"<a/>"));zip.getEntry("payload.xml")!.entryName=name;
  await expect(isolatedParse(zip.toBuffer())).rejects.toThrow("압축 안전성");
},40000);
it("V5-A04: OCR 미지원과 사용자 취소를 추출 완료로 만들지 않는다",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key);
  try{const ref=v.put(p,"attachment",Buffer.from([137,80,78,71,13,10,26,10]),10000);expect((await parseProtected(p,v,ref)).status).toBe("needs_ocr");await expect(isolatedParse(original("form5.pdf"),AbortSignal.abort())).rejects.toThrow();}finally{f.clean();}
});
const company={brNo:"0012345678",bzentyNm:"가상 업체",addr:"가상 시설",capacity:"999",currentStock:0};
const response=(items:unknown,total=1)=>({response:{header:{resultCode:"00"},body:{items,totalCount:total,pageNo:1,numOfRows:10}}});
it("V5-C01: 공식 필드만 제공하며 누락·빈 값·0·번호 선행 0을 구분",()=>{
  const r=decodeWaste(Buffer.from(JSON.stringify(response({item:{...company,zip:"",bzentyPstnLat:0}}))),"waste-companies");
  expect(r.rows[0].fields).not.toHaveProperty("capacity");expect(r.rows[0].fields.zip.state).toBe("blank");expect(r.rows[0].fields.bzentyPstnLat.value).toBe(0);expect(r.rows[0].fields.cmptncSggNm.state).toBe("missing");
  expect(businessIdentity(company.brNo).normalized).toBe("0012345678");expect(businessIdentity("001***5678").state).toBe("masked");expect(businessIdentity(12345678).normalized).toBeNull();
});
it("V5-C02: XML 단일·복수와 A08 wrapper를 명시적으로 해석",()=>{
  const x='<response><header><resultCode>00</resultCode></header><body><totalCount>2</totalCount><items><item><brNo>0012345678</brNo></item><item><brNo>0022345678</brNo></item></items></body></response>';
  expect(decodeWaste(Buffer.from(x),"waste-companies").rows).toHaveLength(2);
  const r=decodeWaste(Buffer.from(JSON.stringify(response([{item:{brno:"0012345678",telgmRcptnYmd:"20261008"}}]))),"waste-sanctions");expect(r.rows[0].fields.brno.value).toBe(company.brNo);expect(r.rows[0].fields).not.toHaveProperty("brNo");
});
it("V5-C03: 정상 0건·기관 오류·불명 구조·0건 충돌을 구분",()=>{
  expect(decodeWaste(Buffer.from(JSON.stringify(response([],0))),"waste-companies").rows).toHaveLength(0);
  for(const value of [response({item:company},0),{response:{header:{resultCode:"01"},body:{}}},response([company])])expect(()=>decodeWaste(Buffer.from(JSON.stringify(value)),"waste-companies")).toThrow();
});
it("V5-C04: 실제 worker raw→후보→수동 보완→독립 검토→기존 검토 trace 다운로드",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),s=new ProtectedCollection(f.store,v,()=>p,async()=>"synthetic-key",()=>({group:"synthetic",intervalMs:0}));
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(response({item:company})) )));
  let app:Awaited<ReturnType<typeof createApp>>["app"]|undefined;
  try{
    const prep=s.prepare(p,"waste-companies",{keyword:"가상",mode:"search",page:1});s.provenance.event(p,prep.node,"query","waste-companies","release","가상 표본 수집에 한정한 명시적 시험 권한입니다.",expiry);
    const job=await s.enqueue(p,prep.ref,"v5-case");await workOne(s.jobs,"v5-worker",s.handle.bind(s));expect(s.jobs.get(p,job.id).state).toBe("succeeded");
    const c=f.store.db.prepare("SELECT id FROM v4_captures").get() as {id:string},svc=new WasteProposals(v),b=svc.fromCapture(p,c.id);
    const manual=svc.supplement(p,b.id,b.version,{contractEvidence:"계약서 미제공"});expect(()=>svc.supplement(p,b.id,b.version,{contractEvidence:"덮어쓰기"})).toThrow();expect(()=>svc.review({...p,roles:[...p.roles,"case_reviewer"]},b.id,manual.version,"자기 자료는 독립 검토로 승인할 수 없습니다.")).toThrow();
    const checked=svc.review({...reviewer,roles:[...reviewer.roles,"writer"]},b.id,manual.version,"가상 업체 조회 필드와 미확인 항목만 대조했습니다.");expect(checked.legalApproval).toBe(false);
    const changed=svc.refresh(p,b.id,checked.version,c.id);expect(changed.manual.contractEvidence).toBe("계약서 미제공");expect(changed.review).toBeNull();expect(()=>svc.refresh(p,b.id,checked.version,c.id)).toThrow();
    const review=newReview({...request(),prompt:"가상 폐기물 수탁 검토: 허가 서류 없음"});f.store.saveReview(review);new LegacyBridge(f.store,"v4").attach(p,review,"project");
    ({app}=await createApp(f.store,true));registerManagementV5(app,v,new Map([[sha("v5-token"),p]]));
    const bootstrap=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),h={host:"127.0.0.1:4999",cookie:bootstrap.cookies.map(c=>c.name+"="+c.value).join("; "),authorization:"Bearer v5-token"};
    const exported=await app.inject({url:`/api/management-v5/reviews/${review.id}/waste/${b.id}/export`,headers:h});expect(exported.statusCode).toBe(200);expect(exported.json().proposal.classification).toBe("추가 자료 필요");expect(exported.json().proposal.trace.rawHash).toBe(b.hash);
    const migration=new ProtectedMigration(v),m=migration.copyJob(p,job.id);expect(migration.copyJob(p,job.id).id).toBe(m.id);expect(m.plaintextRemovalComplete).toBe(false);expect(resolveLegacyDigest(v,p,sha("unknown")).state).toBe("denied");
    const copied=migration.copyReviewTrace(p,review.id);expect(migration.copyReviewTrace(p,review.id).id).toBe(copied.id);expect(()=>migration.copyReviewTrace({...p,tenant:"other"},review.id)).toThrow();expect(copied.plaintextRemovalComplete).toBe(false);
  }finally{await app?.close();f.clean();}
},40000);
it("V5-D01: 서식 목적·필요란·환산 근거·전일 재고·음수·참조 충돌 보존",()=>{
  expect(form5Sections("capacity")).toEqual([1,2,3]);expect(form5Sections("consignment")).toEqual([1,2,4]);expect(form5Sections("both")).toEqual([1,2,3,4]);
  expect(()=>normalizeDaily(365,"t/year",{})).toThrow();expect(normalizeDaily(300,"t/year",{operatingDays:300,contractPeriodReviewed:true,plannedExclusionReviewed:true})).toBe(1);expect(()=>normalizeDaily(1,"m3/day",{})).toThrow();
  const b={currentStock:1,dailyIntake:2,newConsignment:3,dailyProcessing:10,issueDate:"2026-10-08",stockDate:"2026-10-07"};expect(form5Inventory(b).value).toBe(-4);expect(()=>form5Inventory({...b,stockDate:"2026-10-08"})).toThrow();expect(form5Conflict.autoCorrected).toBe(false);
});
it("V5-D02: 평가일·개시일·조회일은 별개이며 개정 전후 기록 조문 유지",()=>{
  expect(riskProfile("2026-05-31",null,null).recordsArticle).toBe("제37조");const r=riskProfile("2026-06-01","2026-05-01","2026-05-31");expect(r.recordsArticle).toBe("제37조의4");expect(r.evaluationDate).toBe("2026-05-31");expect(r.legalApproval).toBe(false);expect(r.draft2026461Active).toBe(false);
});
it("V5-B01: 같은 snapshot 통합 백업→세대 복원·원본·작업 중지·전송 거부·현재 승인 무효",async()=>{
  const f=fixture(),v=new ProtectedPayloads(f.store,key),g=new PayloadProvenance(f.store),target=join(f.store.dir,"isolated-restore");
  try{
    const ref=v.put(p,"raw",Buffer.from("sensitive-v5"),60000),node=g.input(p,"query");g.event(p,node,"query","api","release","합성 백업 시험에서만 사용하는 가상 전송 권한입니다.",expiry);
    const document=await ingestDocument(f.store,"synthetic-v5.txt",Buffer.from("가상 업무 기록이며 실제 사업장 자료가 아닙니다."));
    const review=newReview({...request(),prompt:"가상 폐기물 수탁업체 자료를 검토합니다.",documentIds:[document.id]});f.store.saveReview(review);new LegacyBridge(f.store,"v4").attach(p,review,"project");
    const collection=new ProtectedCollection(f.store,v,()=>p,async()=>"synthetic-key",()=>({group:"test",intervalMs:0})),prep=collection.prepare(p,"qna",{keyword:"가상",mode:"1",page:1});g.event(p,prep.node,"query","qna","release","합성 백업 작업 중지 확인을 위한 시험 승인입니다.",expiry);const job=await collection.enqueue(p,prep.ref,"backup-job");
    const backup=await backupGeneration(f.store,p,key,sha("test-source"));expect(JSON.stringify(backup.archive)).not.toContain("sensitive-v5");expect(backup.manifest.completeApplicationBackup).toBe(true);mkdirSync("work",{recursive:true});writeFileSync("work/v5-backup-manifest.json",JSON.stringify(backup.manifest,null,2));
    expect(()=>restoreGeneration(target,p,{...key,bytes:randomBytes(32)},backup.archive)).toThrow();
    expect(()=>restoreGeneration(target,p,key,backup.archive,phase=>{if(phase==="before_publish")throw Error("crash");})).toThrow("crash");expect(existsSync(join(target,"current.json"))).toBe(false);
    const restored=restoreGeneration(target,p,key,backup.archive),fresh=openGeneration(target);
    try{expect(new ProtectedPayloads(fresh,key).get(p,ref,"raw").toString()).toBe("sensitive-v5");expect(()=>new PayloadProvenance(fresh).check(p,node,"query","query","api")).toThrow();expect(restoreGeneration(target,p,key,backup.archive).generation).toBe(restored.generation);expect(restored.currentApprovals).toBe(false);expect(fresh.db.prepare("SELECT count(*) n FROM v2_entities").get()).toEqual(f.store.db.prepare("SELECT count(*) n FROM v2_entities").get());expect(fresh.document(document.id)?.hash).toBe(document.hash);expect(fresh.review(review.id)).toBeDefined();expect((fresh.db.prepare("SELECT state FROM v3_jobs WHERE id=?").get(job.id) as any).state).toBe("paused");expect(new LegacyBridge(fresh,"v4").trace(p,review.id)).toBeDefined();}finally{fresh.close();}
    expect(readdirSync(join(f.store.dir,"v5-snapshots"))).toHaveLength(0);
  }finally{f.clean();}
}, 30000);
it("V5-B02: 미분류 자원은 통합 완료로 바꾸지 않고 복원 대상 덮어쓰기 금지",async()=>{
  const f=testStore();try{f.store.db.exec("CREATE TABLE unclassified_private(x TEXT)");const b=await backupGeneration(f.store,p,key,sha("test"));expect(b.manifest.completeApplicationBackup).toBe(false);expect(b.manifest.omissions).toContain("미분류 테이블:unclassified_private");expect(()=>restoreGeneration(f.store.dir,p,key,b.archive)).toThrow(/빈 격리/);}finally{f.clean();}
});
it("V5-B03: admission 이전 철회는 0회·이후 철회는 취소와 미관측 송신 구분",async()=>{
  const f=testStore(),g=new PayloadProvenance(f.store),admission=new SendAdmissions(f.store),node=g.input(p,"q"),network=vi.fn();
  try{const seq=g.event(p,node,"query","api","release","격리 전송 입장과 철회 경계를 시험합니다.",expiry);const authorize=()=>g.check(p,node,"q","query","api");const a=admission.admit(p,"q",authorize,10000);a.start();network();g.event(p,node,"query","api","revoke","격리 전송 입장 뒤 철회 경계를 시험합니다.",expiry,seq);await new Promise(r=>setTimeout(r,60));expect(a.signal.aborted).toBe(true);a.finish(false);expect(()=>admission.admit(p,"q",authorize,10000)).toThrow();expect(network).toHaveBeenCalledTimes(1);const row=JSON.parse((f.store.db.prepare("SELECT body FROM v5_send_intents").get() as any).body);expect(row.state).toBe("cancelled");expect(row.outboundFirstByte).toBe("unobserved");}finally{f.clean();}
});
it.each([[true,true],[true,false],[false,true],[false,false]])("V5-H01: 앱 시험 설정 %s와 가상 영역 %s는 권한을 자동 부여하지 않는다",async(testMode,synthetic)=>{
  vi.stubEnv("SHE_EPHEMERAL_AUTH","1");
  const f=testStore(),v=new ProtectedPayloads(f.store,key),principal={...p,synthetic}, {app}=await createApp(f.store,testMode);
  registerManagementV5(app,v,new Map([[sha("granted"),principal]]));
  try{const b=await app.inject({url:"/api/bootstrap",headers:{host:"127.0.0.1:4999"}}),h={host:"127.0.0.1:4999",cookie:b.cookies.map(c=>c.name+"="+c.value).join("; ")};
    expect((await app.inject({url:"/api/management-v5/migration/dry-run",headers:{...h,authorization:"Bearer forged"}})).statusCode).toBe(400);
    expect((await app.inject({url:"/api/management-v5/migration/dry-run",headers:{...h,authorization:"Bearer granted"}})).statusCode).toBe(200);
  }finally{await app.close();f.clean();}
});

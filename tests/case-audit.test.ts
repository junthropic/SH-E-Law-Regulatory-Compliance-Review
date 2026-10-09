import { it, expect } from "vitest";
import { assessCase } from "../server/case-assessment.js";
import { newReview, runReview } from "../server/reviews.js";
import { confirmedAnswer, evaluateRule, enforceIssue } from "../server/legal.js";
import { publicMatch } from "../server/public-match.js";
import { reviewDomains } from "../shared/review-domains.js";
import { request, testStore, basis, rule } from "./helpers.js";
import { Vault } from "../server/vault.js";
import { ChatGPTAuth } from "../server/auth.js";
import { ingestDocument } from "../server/documents.js";
import { approvalContext } from "../server/approval.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import { normalizeLaw } from "../server/sources.js";
import { EvidenceSchema } from "../server/schemas.js";

it.each(["허가 서류 미제공", "허가 자료 없음", "확인되지 않았음", "추정", "신고 예정"])("%s를 확정된 무허가 사실로 승격하지 않는다", value => {
  expect(confirmedAnswer(value)).toBe(false);
  const r = newReview({...request(), answers: {permit: value}});
  expect(assessCase(r).facts.find(f => f.key === "permit")?.state).toBe("missing");
});
it("대상·기준일이 불분명한 질문과 답변 차이는 충돌 확정 대신 추가 확인으로 남긴다", () => {
  const r = newReview({...request(), prompt: "위험물 저장 최대 200 L, 허가 있음.", answers: {quantity: "500 L", permit:"허가 없음"}});
  expect(assessCase(r).facts.filter(f => f.state === "incomplete").map(f => f.key)).toEqual(expect.arrayContaining(["quantity", "permit"]));
  r.request.prompt = "위험물 저장량 200 L에서 500 L로 변경하려고 합니다.";
  expect(assessCase(r).facts.find(f => f.key === "quantity")?.state).toBe("confirmed");
});
it("규칙은 중복 또는 미제공 허가 사실로 명확한 리스크를 만들지 않는다", () => {
  const es = basis(), r = rule(es);
  const fs = [{key:"ratio",label:"배수",value:"2",source:"시험",confirmed:true}, {key:"permit",label:"허가",value:"서류 미제공",source:"시험",confirmed:true}, {key:"exception",label:"예외",value:"해당 없음",source:"시험",confirmed:true}];
  expect(evaluateRule(r,fs,es,"경기도",request().asOf)).toBeUndefined();
  fs[1].value = "허가 있음";
  expect(evaluateRule(r,[...fs,{...fs[1],value:"허가 없음"}],es,"경기도",request().asOf)).toBeUndefined();
});
it.each([
  ["폐기물 위탁처리 검토입니다.", "wasteType", "폐기물관리법"],
  ["화학물질 취급시설 검토입니다.", "cas", "화학물질관리법"],
  ["밀폐공간 작업 산업안전 검토입니다.", "exposure", "산업안전보건법"],
])("업무별 필요한 사실과 원문을 구분한다: %s", (prompt, field, law) => {
  const r = newReview({...request(), prompt});
  expect(assessCase(r).facts.find(f => f.key === field)?.state).toBe("missing");
  expect(reviewDomains(prompt).flatMap(p => [...p.laws])).toContain(law);
});
it("화성시·자료 없음과 과거 회신을 현재 사업장의 위반 입증으로 쓰지 않는다", async () => {
  const {store,clean}=testStore();
  try {
    const d=await ingestDocument(store,"과거회신.txt",Buffer.from("다른 사업장의 과거 회신 시험자료입니다."));
    store.put("documents", d.id, {...d, responseDate:"2010-01-01",agency:"시험기관",confirmed:true});
    const r=newReview({...request(),municipality:"화성시",prompt:"실제 사업장 없음. 소량위험물 자료 조회입니다.", documentIds:[d.id]});
    const vault=new Vault(store.dir,true);
    await runReview(store,vault,new ChatGPTAuth(store,vault),r);
    expect(r.status).toBe("completed");
    expect(r.caseAssessment?.facts.every(f=>f.state!=="confirmed")).toBe(true);
    expect(r.issues.some(i=>i.category==="clear_risk")).toBe(false);
    expect(r.gaps.join()).toContain("회신일·당시 법령·사실관계");
    expect(r.issues.some(i=>i.category==="more_data")).toBe(true);
  } finally {clean();}
});
it("CAS 불일치·식별자 누락·업체명 후보를 일치 확인으로 오인하지 않는다",()=>{
  const q={keyword:"67-56-1",mode:"cas",page:1};
  expect(publicMatch("fire",{casno:"71-43-2"},q).state).toBe("mismatch");
  expect(publicMatch("fire",{},q).state).toBe("unverified");
  expect(publicMatch("fire",{casno:"67-56-1"},q).state).toBe("matched");
  expect(publicMatch("waste-companies",{bzentyNm:"시험업체"},{keyword:"시험업체",mode:"search",page:1}).state).toBe("candidate");
});
it("확인서 입력 대상은 현재 원문과 연결되고 충돌 상태는 백업 후에도 보존된다",()=>{
  const {store,clean}=testStore();
  try {
    const r=newReview({...request(),answers:{permit:"입력 불일치: 허가 있음 / 허가 없음"}});
    r.status="completed";r.evidence=basis();r.caseAssessment=assessCase(r);
    r.evidence.forEach(e=>store.saveEvidence(e,false));store.saveReview(r);
    expect(approvalContext(store,r.id).reviewId).toBe(r.id);
    const backup=makeBackup(store);restoreBackup(store,backup);
    expect(store.review(r.id)?.caseAssessment?.facts.find(f=>f.key==="permit")?.state).toBe("conflict");
    expect(store.review(r.id)?.needsReview).toBe(true);
  } finally {clean();}
});
it("큰 별표 본문을 가진 시행규칙도 자르지 않고 보존한다", () => {
  const appendix = "시험 별표 내용입니다. ".repeat(100000);
  const e = normalizeLaw(JSON.stringify({법령:{기본정보:{법령명_한글:"시험 시행규칙",시행일자:"20260101"},조문:{조문내용:"시험용 시행규칙의 본문입니다. 실제 법률이 아닙니다."},별표:{별표내용:appendix}}}),"eflaw",{법령일련번호:"123",법령ID:"321",시행일자:"20260101"},"전국");
  expect(e.text).toContain(appendix);
  expect(EvidenceSchema.safeParse(e).success).toBe(true);
});
it("개별 회신 인용만으로는 현재 사업장 위반을 판정하지 않는다", () => {
  const e = {...basis()[0],kind:"interpretation" as const};
  const issue = enforceIssue({id:crypto.randomUUID(),category:"clear_risk",title:"시험 주장",conclusion:"위반이다",conditions:[],citations:[{evidenceId:e.id,quote:e.text}],exceptions:[],missing:[],nextActions:[],severity:"unspecified"},[e],[]);
  expect(issue.category).toBe("more_data");
  expect(issue.conclusion).toContain("현재 사업장");
  expect(issue.conclusion).not.toBe("위반이다");
});
it("법규 첨부 바이너리가 없는 백업을 복원해도 원본 확보로 표시하지 않는다", () => {
  const {store,clean}=testStore();
  try {
    const e=basis()[0];e.attachments=[{title:"시험 별지",url:e.url,version:e.version,effectiveFrom:e.effectiveFrom,fetchedAt:e.fetchedAt,state:"collected",originalHash:e.hash,originalRef:e.hash+".bin",note:"시험"}];
    store.saveEvidence(e,false);restoreBackup(store,makeBackup(store));
    expect(store.all<any>("evidence")[0].attachments[0].state).toBe("missing");
    expect(store.all<any>("evidence")[0].attachments[0].originalRef).toBeUndefined();
  }finally{clean();}
});

import {it,expect} from "vitest";
import {evaluateAppointment,evaluateQualification,requirement,selectSafetyManager} from "../server/safety-manager-v7.js";
import {safetyManagerFixture as fx,manager,construction} from "./v7-fixture.js";

// 별표 3 rows 1~27: 50~499 → 1, 500+ → 2. Not a global "50 or more = 1 person" rule.
it.each([[49,null,true],[50,1,false],[499,1,false],[500,2,false]])("V7-A01: 별표3 제1~27호 상시근로자 %i명 → 필요 %s명",(w,need,out)=>{
  const r=requirement(fx({annexRow:12,regularWorkers:w}));expect(r.required).toBe(need);expect(r.outOfScope).toBe(out);
});
// Rows 28~48: 50~999 → 1, 1000+ → 2; row 40 and row 37 (except 부동산 관리업) start at 100.
it.each([
  [32,999,null,1],[32,1000,null,2],[40,99,null,null],[40,100,null,1],[37,60,true,1],[37,60,false,null],
])("V7-A02: 별표3 제%i호 %i명 (부동산관리업=%s) → 필요 %s명",(row,w,re,need)=>{
  expect(requirement(fx({annexRow:row,regularWorkers:w,realEstateManagement:re})).required).toBe(need);
});
it("V7-A03: 업종 행·인원 근거·부동산관리업 여부가 불명이면 판단하지 않고 보류",()=>{
  expect(evaluateAppointment(fx({annexRow:null})).state).toBe("pending");
  expect(evaluateAppointment(fx({rowReviewed:null})).missing).toContain("별표 3의 사업 종류 행(업종) 확인");
  expect(evaluateAppointment(fx({workersBasisReviewed:false})).missing).toContain("상시근로자 수와 산정 근거 확인");
  expect(evaluateAppointment(fx({annexRow:37,regularWorkers:60,realEstateManagement:null})).missing).toContain("제37호 중 부동산 관리업 해당 여부");
});
// 건설업(제49호): 공사금액 구간, 관계수급인 100억원, 토목 150억원 경계, 전·후 15 기간.
it.each([
  [49.9,{},"none",null,true],[50,{},"none",1,false],[60,{},"subcontractor",null,true],[100,{},"subcontractor",1,false],
  [799,{},"none",1,false],[800,{},"none",2,false],[800,{phase:"edge15"},"none",1,false],[3000,{},"none",5,false],[3000,{phase:"edge15"},"none",3,false],
])("V7-A04: 건설 공사금액 %s억원 %o 관계 %s → 필요 %s명",(amount,over,relation,need,out)=>{
  const r=requirement(fx({...construction(amount,over),contracting:{relation,aggregationReviewed:relation==="none"?null:true,primeDedicatedManager:false}}));
  expect(r.required).toBe(need);expect(r.outOfScope).toBe(out);
});
it.each([
  [130,{civilEngineering:null},"토목공사업"],[800,{phase:"unknown"},"전·후 15"],[1500,{phase:"demolition_only"},"철거공사"],[10000,{},"1조원 이상"],[200,{amountReviewed:null},"공사금액"],
])("V7-A05: 건설 %s억원 %o는 원문 해석·사실 확인 전 보류",(amount,over,needle)=>{
  const r=requirement(fx(construction(amount,over)));expect(r.required).toBeNull();expect(r.missing.join(" ")).toContain(needle);
});
it("V7-A06: 선임 인원 충족·부족·미입증·사건일 구분",()=>{
  expect(evaluateAppointment(fx()).state).toBe("fulfilled_candidate");
  const gone=fx({managers:[manager({endedOn:"2026-10-10"})]});
  expect(evaluateAppointment(gone)).toMatchObject({state:"pending",required:1,counted:0});
  expect(evaluateAppointment(gone).missing[0]).toContain("부족 인원 1명");
  expect(evaluateAppointment({...gone,nonperformanceProven:["safety_manager.appointment"]}).state).toBe("risk_candidate");
  expect(evaluateAppointment(fx({managers:[manager({appointedOn:"2026-10-20"})]})).counted).toBe(0); // 평가일 이후 선임
  expect(evaluateAppointment(fx({managers:[manager({appointmentEvidence:"unknown"})]})).state).toBe("pending");
  expect(evaluateAppointment(fx({managers:[]})).state).toBe("pending"); // 자료 없음 ≠ 미선임
  expect(evaluateAppointment(fx({independentFactsReviewed:null})).state).toBe("pending");
});
it("V7-A07: 공동선임은 같은 사업주·시군구 또는 15km·합계 300명 요건을 모두 확인해야 인원에 넣는다",()=>{
  const joint=(o:object)=>({claimed:true,sameEmployer:true,sameSigungu:false,within15km:true,combinedWorkers:280,combinedAmount100M:null,reviewed:true,...o});
  const shared=[manager({shared:true})];
  expect(evaluateAppointment(fx({joint:joint({}),managers:shared})).state).toBe("fulfilled_candidate");
  const over=evaluateAppointment(fx({joint:joint({combinedWorkers:301}),managers:shared}));
  expect(over).toMatchObject({counted:0,state:"pending"});expect(over.notes.join(" ")).toContain("공동선임 요건 불충족");
  expect(evaluateAppointment(fx({joint:joint({sameSigungu:null,within15km:null}),managers:shared})).missing.join(" ")).toContain("공동선임 요건");
  expect(evaluateAppointment(fx({joint:joint({sameEmployer:false}),managers:shared})).counted).toBe(0);
});
it("V7-A08: 위탁은 건설업 제외·300명 미만·기간 내에서만 인원으로 본다",()=>{
  const ent=(o:object)=>({claimed:true,agencyDesignated:true,start:"2026-09-01",end:null,reviewed:true,...o});
  expect(evaluateAppointment(fx({managers:[],regularWorkers:200,entrustment:ent({})})).state).toBe("fulfilled_candidate");
  expect(evaluateAppointment(fx({managers:[],regularWorkers:300,entrustment:ent({})})).counted).toBe(0);
  expect(evaluateAppointment(fx({...construction(60),managers:[],entrustment:ent({})})).counted).toBe(0);
  expect(evaluateAppointment(fx({managers:[],entrustment:ent({end:"2026-10-01"})})).counted).toBe(0);
  expect(evaluateAppointment(fx({managers:[],entrustment:ent({reviewed:null})})).state).toBe("pending");
});
it("V7-A09: 도급 관계 불명·산입 미검토는 보류, 도급인 전담 선임 시 관계수급인 비대상 후보",()=>{
  expect(evaluateAppointment(fx({contracting:{relation:"unknown",aggregationReviewed:null,primeDedicatedManager:null}})).state).toBe("pending");
  expect(evaluateAppointment(fx({contracting:{relation:"prime",aggregationReviewed:null,primeDedicatedManager:null}})).missing.join(" ")).toContain("제16조제3항");
  expect(evaluateAppointment(fx({contracting:{relation:"subcontractor",aggregationReviewed:true,primeDedicatedManager:true}})).state).toBe("out_of_scope_candidate");
});

const q=(m:object,over:Record<string,unknown>={})=>evaluateQualification(fx({managers:[manager(m)],...over}));
it("V7-Q01: 행·규모에 허용된 자격 경로만 인정하고 자료 미제출은 무자격으로 보지 않는다",()=>{
  expect(q({}).state).toBe("fulfilled_candidate");
  expect(q({path:"3"},{annexRow:29}).managers[0].status).toBe("invalid"); // 제29호는 제3호 경로 제외
  expect(q({path:"3"},{annexRow:29}).state).toBe("pending");
  expect(q({path:"3"},{annexRow:29,nonperformanceProven:["safety_manager.qualification"]}).state).toBe("risk_candidate");
  expect(q({qualificationEvidence:"none"})).toMatchObject({state:"pending"});
  expect(q({qualificationEvidence:"none"}).managers[0].status).toBe("unknown");
  expect(q({path:"unknown"}).state).toBe("pending");
  expect(q({grade:"unknown"}).managers[0].status).toBe("unknown");
});
it("V7-Q02: 교육 기간 제한은 교육 이수일로 판단하고, 허용기간 종료 후에도 기존 이수 자격은 유지",()=>{
  const p6={path:"6",fourYearDegree:false,supervisorYears:3,sameDivision:true,examPassed:true};
  expect(q({...p6,trainingCompletedOn:"1998-12-31"}).managers[0].status).toBe("valid");
  expect(q({...p6,trainingCompletedOn:"1999-01-04"}).managers[0].status).toBe("invalid");
  expect(q({...p6,supervisorYears:2,trainingCompletedOn:"1998-06-01"}).managers[0].status).toBe("invalid");
  const p72={path:"7-2",experienceYears:5,examPassed:true,trainingCompletedOn:"2028-06-01"};
  expect(q(p72,{asOf:"2029-03-02",managers:[manager({...p72,appointedOn:"2028-09-01"} as never)]}).managers[0].status).toBe("valid");
  expect(q({...p72,trainingCompletedOn:"2029-01-02"}).managers[0].status).toBe("invalid");
  expect(q({...p72},{regularWorkers:300}).managers[0].status).toBe("invalid"); // 300명 이상은 제7호의2 불가
});
it("V7-Q03: 다른 법 안전관리자(제8호)는 그 법을 적용받는 사업에서만 인정",()=>{
  expect(q({path:"8",otherLawApplies:true}).managers[0].status).toBe("valid");
  expect(q({path:"8",otherLawApplies:false}).managers[0].status).toBe("invalid");
  expect(q({path:"8",otherLawApplies:null}).managers[0].status).toBe("unknown");
});
it("V7-Q04: 구성 요건 — 500명 이상 제1~27호는 제1호·제2호(산업안전산업기사 제외)·제4호 1명 이상",()=>{
  const two=(a:object,b:object)=>evaluateQualification(fx({annexRow:12,regularWorkers:600,managers:[manager({id:"a",...a}),manager({id:"b",...b})]}));
  expect(two({grade:"산업기사"},{grade:"산업기사"}).state).toBe("pending");
  expect(two({grade:"산업기사"},{grade:"산업기사"}).notes.join(" ")).toContain("구성 요건 미충족");
  expect(two({grade:"산업기사"},{path:"1"}).state).toBe("fulfilled_candidate");
});
it("V7-Q05: 건설 1,500억원 이상은 제12호 1명 상한과 산업안전지도사등 포함 요건",()=>{
  const site=(ms:object[])=>evaluateQualification(fx({...construction(1600),managers:ms.map((m,i)=>manager({id:"c"+i,...m}))}));
  const p12={path:"12",grade:"기사",experienceYears:3,trainingCompletedOn:"2025-06-01",examPassed:true};
  expect(site([{path:"1"},{},{}]).state).toBe("fulfilled_candidate");
  expect(site([{},{},{}]).notes.join(" ")).toContain("산업안전지도사등");
  expect(site([{path:"1"},p12,p12]).notes.join(" ")).toContain("제12호 해당자는 1명만");
  expect(site([{grade:"기술사",safetyEngineerEquivalent:true},{},{}]).state).toBe("fulfilled_candidate");
});
it("V7-Q06: 위탁분은 전문기관을 안전관리자로 보고 개인 자격 평가에서 제외",()=>{
  const r=evaluateQualification(fx({managers:[],regularWorkers:200,entrustment:{claimed:true,agencyDesignated:true,start:"2026-09-01",end:null,reviewed:true}}));
  expect(r.state).toBe("fulfilled_candidate");expect(r.notes.join(" ")).toContain("영 제19조제2항");
});
it("V7-S01: 산업안전보건법 안전관리자 주제만 선택하고 위험물·보건관리자 등과 섞지 않는다",()=>{
  expect(selectSafetyManager("산업안전보건법 안전관리자 선임 인원 확인").map(x=>x.id)).toEqual(["safety_manager.appointment"]);
  expect(selectSafetyManager("산업안전 안전관리자 자격 확인").map(x=>x.id)).toEqual(["safety_manager.qualification"]);
  expect(selectSafetyManager("산업안전보건법 안전관리자 검토").length).toBe(2);
  for(const t of ["위험물 안전관리자 선임","안전관리자 직무교육","산업안전 보건관리자 선임","전기안전관리자 선임 산업안전"])expect(selectSafetyManager(t)).toEqual([]);
});

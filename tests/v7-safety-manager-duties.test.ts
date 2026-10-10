import {it,expect} from "vitest";
import {evaluateDedication,evaluateReport,evaluateDismissalReport,evaluatePerformance,reportDeadline,dedicationRequired} from "../server/safety-manager-v7.js";
import {safetyManagerFixture as fx,manager,construction,filing,performance} from "./v7-fixture.js";
// Fixed dates (weekday checked): 2026-09-01 Tue, 2026-09-05 Sat, 2026-09-25 Fri, 2026-10-09 Fri(한글날), 2026-10-12 Mon,
// 2021-11-19 Fri, 2025-04-28 Mon, 2025-04-29 Tue. Legal basis date stays 2026-10-08; asOf is set per case.
const ev=(kind:string,date:string|null,f:object|null,over:object={})=>({id:"ev-"+kind,kind,date,managerId:"sm-1",filing:f,reviewed:true,...over});

it.each([[299,false],[300,true]])("V7-D01: 영 제16조제2항 상시근로자 %i명 → 전담 대상 %s",(w,req)=>{
  expect(dedicationRequired(fx({regularWorkers:w}))).toBe(req);
});
it("V7-D02: 건설 전담 경계(120억·토목 150억)와 불명 보류",()=>{
  expect(dedicationRequired(fx(construction(119)))).toBe(false);
  expect(dedicationRequired(fx(construction(120)))).toBe(true);
  expect(dedicationRequired(fx(construction(130,{civilEngineering:true})))).toBe(false);
  expect(dedicationRequired(fx(construction(130,{civilEngineering:null})))).toBeNull();
});
it("V7-D03: 전담 대상이면 실제 업무배분 자료로 전담·겸직을 구분하고 인원만으로 확정하지 않는다",()=>{
  const at=(m:object,over:object={})=>evaluateDedication(fx({regularWorkers:320,managers:[manager(m)],...over}));
  expect(at({}).state).toBe("fulfilled_candidate");
  expect(at({dutyAllocationEvidence:"unknown"}).state).toBe("pending");
  expect(at({assignment:"unknown"}).missing.join(" ")).toContain("전담·겸임 구분 확인");
  expect(at({dutyAllocationEvidence:"none"}).missing.join(" ")).toContain("업무배분");
  expect(at({assignment:"concurrent"}).state).toBe("pending");
  expect(at({assignment:"concurrent"},{nonperformanceProven:["safety_manager.dedication"]}).state).toBe("risk_candidate");
  expect(evaluateDedication(fx({regularWorkers:120})).state).toBe("out_of_scope_candidate");
});

it("V7-R01: 14일 기한은 다음 날부터 세고, 말일이 토·일이면 다음 평일, 그 밖의 공휴일은 검토된 목록만 반영",()=>{
  expect(reportDeadline("2026-09-01",null)).toEqual({deadline:"2026-09-15",holidaysConfirmed:false});
  expect(reportDeadline("2026-09-05",null).deadline).toBe("2026-09-21"); // 09-19 Sat → Mon
  expect(reportDeadline("2026-09-05",{dates:["2026-09-21"],reviewed:true,source:"synthetic"}).deadline).toBe("2026-09-22");
  expect(reportDeadline("2026-09-25",null).deadline).toBe("2026-10-09"); // 한글날 is not assumed without a reviewed list
  expect(reportDeadline("2026-09-25",{dates:["2026-10-09"],reviewed:true,source:"synthetic"}).deadline).toBe("2026-10-12");
  expect(reportDeadline("2026-09-25",{dates:["2026-10-09"],reviewed:null,source:"unreviewed"}).deadline).toBe("2026-10-09");
});
it("V7-R02: 관할 접수일로만 제출을 판단하고, 기한 경계·공휴일 미확정은 해당 부분만 보류",()=>{
  const r=(f:object|null,over:object={})=>evaluateReport(fx({events:[ev("appointment","2026-09-25",f)],...over}));
  expect(r(filing("2026-10-09","annex2")).state).toBe("fulfilled_candidate");
  const after=r(filing("2026-10-12","annex2"));
  expect(after.state).toBe("pending");expect(after.missing.join(" ")).toContain("공휴일");
  expect(r(filing("2026-10-12","annex2"),{holidayCalendar:{dates:["2026-10-09"],reviewed:true,source:"synthetic"}}).state).toBe("fulfilled_candidate");
  const late=r(filing("2026-10-14","annex2"),{holidayCalendar:{dates:["2026-10-09"],reviewed:true,source:"synthetic"}});
  expect(late.events[0].submission).toBe("late");expect(late.state).toBe("pending");
  expect(r(filing("2026-10-14","annex2"),{holidayCalendar:{dates:["2026-10-09"],reviewed:true,source:"synthetic"},nonperformanceProven:["safety_manager.report"]}).state).toBe("risk_candidate");
});
it("V7-R03: 미접수는 기한 전 미도래, 기한 후에도 공휴일·입증 없으면 보류",()=>{
  const r=(asOf:string,over:object={})=>evaluateReport(fx({asOf,events:[ev("appointment","2026-09-25",null)],...over}));
  expect(r("2026-10-09").state).toBe("not_due");
  expect(r("2026-10-15").state).toBe("pending");
  const cal={holidayCalendar:{dates:["2026-10-09"],reviewed:true,source:"synthetic"}};
  expect(r("2026-10-15",cal).state).toBe("pending");
  expect(r("2026-10-15",{...cal,nonperformanceProven:["safety_manager.report"]}).state).toBe("risk_candidate");
});
it("V7-R04: 보고서 파일·초안·발송 기록·다른 관서 접수는 관할 접수 증거가 아니다",()=>{
  const r=(f:object)=>evaluateReport(fx({asOf:"2026-10-15",events:[ev("appointment","2026-09-01",f)]}));
  expect(r({evidence:"draft",receivedOn:null,office:"unknown"}).missing.join(" ")).toContain("초안은 제출 증거가 아님");
  expect(r({evidence:"sent_only",receivedOn:null,sentOn:"2026-09-10",office:"unknown"}).missing.join(" ")).toContain("발송 기록은 관할 접수일이 아님");
  expect(r(filing("2026-09-10","annex2",{office:"other"})).state).toBe("pending");
  expect(r(filing("2026-08-30","annex2")).missing.join(" ")).toContain("접수일이 사건일보다 앞섬");
});
it("V7-R05: 2021-11-19 이전 사건은 당시 조문 미확인으로 보류, 이후는 판정하고 2025-04-29 이전 서식만 보류",()=>{
  const r=(date:string,received:string)=>evaluateReport(fx({events:[ev("appointment",date,filing(received,"annex2"))]}));
  expect(r("2021-11-18","2021-11-25").state).toBe("pending");
  expect(r("2021-11-18","2021-11-25").missing.join(" ")).toContain("사건 당시 조문 미확인");
  const y21=r("2021-11-19","2021-12-03");expect(y21.state).toBe("fulfilled_candidate");expect(y21.events[0].form).toBe("pending");
  expect(r("2023-03-02","2023-03-16").state).toBe("fulfilled_candidate");
});
it("V7-R06: 서식 불일치는 서식 세부 조건으로만 남고 기한·제출 판정은 진행",()=>{
  const r=evaluateReport(fx({...construction(60),events:[ev("appointment","2026-09-01",filing("2026-09-10","annex2"))]}));
  expect(r.state).toBe("fulfilled_candidate");expect(r.events[0].form).toBe("mismatch");expect(r.notes.join(" ")).toContain("서식 적합 불일치");
});
it("V7-R07: 사건 자료가 없으면 보류, 평가일 이후 사건은 미도래",()=>{
  expect(evaluateReport(fx({events:[]})).state).toBe("pending");
  expect(evaluateReport(fx({events:[ev("appointment","2026-10-20",null)]})).state).toBe("not_due");
  expect(evaluateReport(fx({events:[ev("unknown","2026-09-01",null)]})).state).toBe("pending");
});

it("V7-X01: 해임 보고는 2025-04-29 신설 — 그 전 사건은 비대상, 이후는 판정",()=>{
  const x=(date:string,received:string|null)=>evaluateDismissalReport(fx({events:[ev("dismissal",date,received?filing(received,"annex3-2"):null)]}));
  const old=x("2025-04-28",null);expect(old.state).toBe("out_of_scope_candidate");expect(old.events[0].reasons[0]).toContain("신설 전 사건");
  expect(x("2025-04-29","2025-05-13").state).toBe("fulfilled_candidate");
  expect(x("2025-04-29",null).state).toBe("pending"); // 기한 경과·접수 자료 없음, 입증 없음
});
it("V7-X02: 퇴사·해임·위탁 해지·선임은 서로 다른 사건이며 해임 보고를 선임 보고로 덮지 않는다",()=>{
  expect(evaluateDismissalReport(fx({events:[ev("resignation","2026-09-01",null)]})).missing.join(" ")).toContain("퇴사는 해임·위탁 해지와 다른 사건");
  expect(evaluateDismissalReport(fx({events:[ev("appointment","2026-09-01",filing("2026-09-10","annex2"))]})).state).toBe("pending"); // 선임 보고는 해임 보고 자료가 아님
  expect(evaluateReport(fx({events:[ev("dismissal","2026-09-01",filing("2026-09-10","annex3-2"))]})).state).toBe("pending");
  const term=evaluateDismissalReport(fx({events:[ev("entrustment_termination","2026-09-01",filing("2026-09-10","annex3-2"))]}));
  expect(term.state).toBe("fulfilled_candidate");expect(term.events[0].form).toBe("ok");
});

it("V7-P01: 업무수행은 실제 기록만 인정하고 확인 범위와 미확인을 분리",()=>{
  expect(evaluatePerformance(fx()).state).toBe("fulfilled_candidate");
  const items=performance().items.map(x=>x.item===5?{...x,evidence:"appointment_only" as const}:x);
  const part=evaluatePerformance(fx({performance:{...performance(),items}}));
  expect(part.state).toBe("pending");expect(part.missing.join(" ")).toContain("선임계·위탁계약·조직도는 실제 수행 증거가 아님");
  expect(part.confirmedItems).toEqual([1,2,3,4,6,7,8,9,10]);
});
it("V7-P02: 사건이 없어 적용되지 않는 업무는 제외하되 제9호 기록·유지와 작업 형태 고려는 항상 확인",()=>{
  const items=performance().items.map(x=>x.item===6||x.item===9?{...x,applies:false}:x);
  const r=evaluatePerformance(fx({performance:{...performance(),items}}));
  expect(r.missing.some(m=>m.startsWith("제6호"))).toBe(false);expect(r.missing.some(m=>m.startsWith("제9호"))).toBe(true);
  expect(evaluatePerformance(fx({performance:{...performance(),workPatternConsidered:null}})).missing.join(" ")).toContain("작업 형태");
  expect(evaluatePerformance(fx({performance:null})).state).toBe("pending");
  expect(evaluatePerformance(fx({performance:{...performance(),items:[]},nonperformanceProven:["safety_manager.performance"]})).state).toBe("risk_candidate");
  expect(evaluatePerformance(fx()).notes.join(" ")).toContain("일률 보존기간");
});

// Candidate calculations and dated routes only; never activated as legal rules.
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function form5Sections(purpose:"capacity"|"consignment"|"both") {
  if(!["capacity","consignment","both"].includes(purpose))throw Error("서식 작성 목적 확인 필요");
  return purpose==="capacity"?[1,2,3]:purpose==="consignment"?[1,2,4]:[1,2,3,4];
}
export function normalizeDaily(value:number,unit:"t/day"|"t/year"|"t/hour"|"m3/day",basis:{operatingDays?:number;hoursPerDay?:number;density?:number;contractPeriodReviewed?:boolean;plannedExclusionReviewed?:boolean}) {
  if(!Number.isFinite(value)||value<0)throw Error("수량 확인 필요");
  if(unit==="t/day")return value;
  if(unit==="t/year"&&basis.operatingDays&&basis.operatingDays>0&&basis.operatingDays<=366&&basis.contractPeriodReviewed&&basis.plannedExclusionReviewed)return value/basis.operatingDays;
  if(unit==="t/hour"&&basis.hoursPerDay&&basis.hoursPerDay>0&&basis.hoursPerDay<=24)return value*basis.hoursPerDay;
  if(unit==="m3/day"&&basis.density&&basis.density>0&&Number.isFinite(value*basis.density))return value*basis.density;
  throw Error("단위 환산 근거 확인 필요");
}
export function form5Inventory(input:{currentStock:number;dailyIntake:number;newConsignment:number;dailyProcessing:number;issueDate:string;stockDate:string}) {
  const {currentStock,dailyIntake,newConsignment,dailyProcessing,issueDate,stockDate}=input;
  if([currentStock,dailyIntake,newConsignment,dailyProcessing].some(v=>!Number.isFinite(v)||v<0)||!validDate(issueDate)||!validDate(stockDate)||Date.parse(issueDate)-Date.parse(stockDate)!==86400000)throw Error("수량·작성 전일 재고 기준 확인 필요");
  return {value:currentStock+dailyIntake+newConsignment-dailyProcessing,unit:"t",negativePreserved:true,formula:"form5-note8-v5",generalSuitability:false};
}
export function riskProfile(asOf:string,workStart:string|null,evaluationDate:string|null) {
  if(!validDate(asOf)||(workStart!==null&&!validDate(workStart))||(evaluationDate!==null&&!validDate(evaluationDate)))throw Error("기준일·사건일 확인 필요");
  const current=asOf>="2026-06-01";
  const eventProfile=evaluationDate ? evaluationDate>="2026-06-01"?"law21374-evaluation":"before-law21374-evaluation" : "평가 실시일 미확인";
  return {asOf,workStart,evaluationDate,eventProfile,profile:current?"rule470-from-20260601":"rule-before-20260601",recordsArticle:current?"제37조의4":"제37조",methodsArticle:current?"제37조":null,
    initialRule:current?"해당 사업장에서 최초로 작업을 시작하기 전까지 최초평가":"고시의 사업 개시 후 1개월 기준 대조 필요",notice:"2024-76",noticeEffectiveFrom:"2025-01-02",
    obligationFirstEffectiveFrom:"2026-06-01",currentVersionEffectiveFrom:"2026-08-01",eventMethodsArticle:evaluationDate&&evaluationDate<"2026-06-01"?null:current?"제37조":null,
    evaluationTiming:{initial:current?"최초 작업 전":"이전 고시 원문 대조",periodic:current?"최초평가 실시 연도의 다음 연도부터 매년 1회 이상":"이전 고시 원문 대조",occasional:current?"추가 유해위험요인 우려·중대산업사고·산재 발생 시 관련 작업 시작 전":"이전 고시 원문 대조"},
    conflicts:["고시의 종전 제37조 인용과 개정 시행규칙의 조문 체계 대조 필요","최초·수시·상시 평가의 적용 시점과 부칙 검토 필요"],supplement:{law21374:"제36조는 시행 이후 실시하는 평가부터 적용",rule470:"2026년 6월 1일 시행: 해당 부칙에 추가 분기 없음",review:"공식 전문 대조·법적 승인 대기"},draft2026461Active:false,retroactiveViolation:false,legalApproval:false};
}
export const form5Conflict = {id:"form5-reference-17-18",form:"제17조제1항제3호",currentPath:"법 제18조·시행규칙 제16조의12",status:"전문가 검토 필요",autoCorrected:false,obligationReduced:false};

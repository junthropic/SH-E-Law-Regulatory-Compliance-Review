import {z} from "zod";
import type {Body,Ref} from "./compliance-v2.js";
export const trainingPolicies=[
  {id:"training.periodic",label:"근로자 정기교육"},
  {id:"training.recruitment",label:"채용 시 교육"},
  {id:"training.work_change",label:"작업내용 변경 시 교육"},
  {id:"training.special",label:"특별교육"},
  {id:"training.supervisor",label:"관리감독자 정기교육"},
] as const;
export type TrainingId=typeof trainingPolicies[number]["id"];
const date=z.string().date().refine(s=>new Date(s).toISOString().slice(0,10)===s),truth=z.boolean().nullable();
const sid=z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
export const TrainingInput=z.object({
  subject:sid,site:sid,asOf:date,scope:z.enum(["included","excluded","unknown"]),scopeReviewed:truth,
  industry:z.string().max(200).nullable(),size:z.number().int().nonnegative().nullable(),role:z.enum(["office","sales","other","supervisor","unknown"]),roleReviewed:truth,
  hireDate:date.nullable(),firstWork:date.nullable(),firstWorkAt:z.string().datetime().nullable().default(null),workChanged:truth,changedWorkStart:date.nullable(),changedWorkStartAt:z.string().datetime().nullable().default(null),
  contract:z.object({kind:z.enum(["daily","fixed","regular","unknown"]),start:date.nullable(),end:date.nullable(),boundaryReviewed:truth}).strict(),
  period:z.object({cycle:z.enum(["anniversary","fiscal","unknown"]),from:date.nullable(),to:date.nullable(),planReviewed:truth}).strict(),
  special:z.object({applies:truth,workNumber:z.number().int().min(1).max(40).nullable(),numberVersion:z.enum(["current39","old40","unknown"]),shortIntermittent:truth,definitionReviewed:truth}).strict(),
  sessions:z.array(z.object({id:sid,subject:sid,site:sid,kind:z.enum(["periodic","recruitment","work_change","special","supervisor","job_training","unknown"]),date:date,
    startedAt:z.string().datetime().nullable(),endedAt:z.string().datetime().nullable(),hours:z.number().min(0).max(1000).nullable(),workNumber:z.number().int().nullable(),
    attendance:truth,content:truth,instructor:truth,method:truth,
    methodEvidence:z.object({mode:z.enum(["classroom","on-site","internet","live","correspondence","unknown"]),profileReviewed:truth,instructorQualified:truth,attendanceTrace:truth,
      onSiteJournal:truth,annex2Reviewed:truth,learnerIdentity:truth,interaction:truth,courseMinutes:z.number().nonnegative().nullable(),videoMinutes:z.number().nonnegative().nullable(),mobile:truth,mobileAcknowledged:truth,workDrivingRestricted:truth,notWhileWorking:truth,calendarMonthPeriodReviewed:truth,materialsSent:truth}).strict().nullable().default(null)}).strict()).max(200),
  exceptions:z.array(z.object({kind:z.enum(["half-annex4","no-accidents","experience","other"]),policy:z.enum(trainingPolicies.map(p=>p.id) as [TrainingId,...TrainingId[]]),
    basis:z.string().max(2000),requirementsReviewed:truth,evidenceKind:z.enum(["document","api-zero","none"]),combinationReviewed:truth}).strict()).max(10),
  nonperformanceProven:z.array(z.enum(trainingPolicies.map(p=>p.id) as [TrainingId,...TrainingId[]])).max(5),
  independentFactsReviewed:truth,
}).strict();
export type TrainingCase=z.infer<typeof TrainingInput>;
export function addCalendarMonths(day:string,months:number) {
  date.parse(day);if(!Number.isSafeInteger(months)||months<0||months>1200)throw Error("기간 단위 확인 필요");
  const [y,m,d]=day.split("-").map(Number),target=new Date(Date.UTC(y,m-1+months,1)),end=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),Math.min(d,end))).toISOString().slice(0,10);
}
const dayBefore=(s:string)=>new Date(Date.parse(s)-86400000).toISOString().slice(0,10);
export function contractBand(c:TrainingCase["contract"]):"week"|"month"|"other"|"unknown" {
  if(c.kind==="daily")return "week";if(c.kind==="regular")return "other";
  if(c.kind!=="fixed"||!c.start||!c.end||c.end<c.start||c.boundaryReviewed!==true)return "unknown";
  const days=(Date.parse(c.end)-Date.parse(c.start))/86400000+1;
  return days<=7?"week":c.end<=dayBefore(addCalendarMonths(c.start,1))?"month":"other";
}
function period(c:TrainingCase,months:number) {
  if(c.period.cycle==="fiscal")return c.period.planReviewed===true&&c.period.from&&c.period.to&&c.period.from<=c.asOf&&c.period.to>=c.asOf?{from:c.period.from,to:c.period.to}:null;
  if(c.period.cycle!=="anniversary"||!c.hireDate||c.hireDate>c.asOf)return null;
  let n=0;while(n<1200&&addCalendarMonths(c.hireDate,(n+1)*months)<=c.asOf)n++;
  if(n>=1200)return null;return {from:addCalendarMonths(c.hireDate,n*months),to:dayBefore(addCalendarMonths(c.hireDate,(n+1)*months))};
}
type Result={id:TrainingId;label:string;state:"pending"|"fulfilled_candidate"|"risk_candidate"|"out_of_scope_candidate"|"not_due";classification:"more_data"|"human_review";requiredHours:number|null;countedHours:number;deadline:string|null;missing:string[];historicalLate:boolean;enabled:false;legalApproved:false;retention:{internalYears:null;generalLegalFiveYears:false}};
export function evaluateTraining(input:unknown):Result[] {
  const c=TrainingInput.parse(input),band=contractBand(c.contract);
  const results:Result[]=trainingPolicies.map(p=>({id:p.id,label:p.label,state:"pending",classification:"more_data",requiredHours:null,countedHours:0,deadline:null,missing:[],historicalLate:false,enabled:false,legalApproved:false,retention:{internalYears:null,generalLegalFiveYears:false}}));
  const evaluate=(r:Result) => {
    const missing=r.missing,regular=["training.periodic","training.supervisor"].includes(r.id);
    if(c.scope==="unknown"||c.scopeReviewed!==true||!c.industry||c.size===null)missing.push("업종·규모·해당 교육 조항의 적용 범위 확인");
    else if(c.scope==="excluded"&&c.independentFactsReviewed===true){r.state="out_of_scope_candidate";r.classification="human_review";return;}
    if(c.role==="unknown"||c.roleReviewed!==true)missing.push("실제 업무·관리감독자 지위 확인");
    if(c.independentFactsReviewed!==true)missing.push("정확한 자료 버전에 대한 독립 사실 검토");
    if(!missing.length&&(r.id==="training.periodic"&&c.role==="supervisor"||r.id==="training.supervisor"&&c.role!=="supervisor"&&c.role!=="unknown")){r.state="out_of_scope_candidate";r.classification="human_review";return;}
    let from:string|null=null,kind=r.id.replace("training.","");
    if(regular){const window=period(c,r.id==="training.supervisor"?12:6);if(!window)missing.push("입사 기산 주기 또는 검토된 회계 주기 계획");else{from=window.from;r.deadline=window.to;}r.requiredHours=r.id==="training.supervisor"?16:["office","sales"].includes(c.role)?6:c.role==="other"?12:null;}
    else if(r.id==="training.recruitment"){r.deadline=c.firstWork;if(!c.firstWork||!c.hireDate)missing.push("입사일·최초 직무 배치일");r.requiredHours=c.role==="supervisor"?8:band==="week"?1:band==="month"?4:band==="other"?8:null;}
    else if(r.id==="training.work_change"){
      if(c.workChanged===false&&!missing.length){r.state="out_of_scope_candidate";r.classification="human_review";return;}if(c.workChanged!==true)missing.push("기존·변경 작업의 실질과 변경 여부");r.deadline=c.changedWorkStart;if(!r.deadline)missing.push("변경 작업 시작일");r.requiredHours=c.role==="supervisor"?2:band==="week"?1:band==="unknown"?null:2;
    }else{
      if(c.special.applies===false&&!missing.length){r.state="out_of_scope_candidate";r.classification="human_review";return;}
      if(c.special.applies!==true||c.special.workNumber===null)missing.push("특별교육 대상 작업·대상자의 동일성");
      if(c.special.numberVersion!=="current39"||c.special.workNumber===40)missing.push("현행 별표 5 작업명·번호 대조: 옛 번호 자동 대체 금지");
      r.deadline=c.firstWork;if(!r.deadline)missing.push("특별작업 최초 수행일");
      if(c.special.shortIntermittent===true){if(c.special.definitionReviewed===true)r.requiredHours=2;else missing.push("단기간·간헐적 작업 정의와 실제 수행 기간");}
      else if(c.special.shortIntermittent===null)missing.push("단기간·간헐적 작업 해당 여부");
      else r.requiredHours=c.role==="supervisor"?16:band==="week"?c.special.workNumber===39?8:2:band==="unknown"?null:16;
    }
    if(r.requiredHours===null)missing.push("교육 시간 분기와 계약 기간의 확인");
    const exceptions=c.exceptions.filter(e=>e.policy===r.id);
    if(exceptions.length){
      if(exceptions.some(e=>e.requirementsReviewed!==true||e.evidenceKind!=="document"||!e.basis.trim())||exceptions.length>1&&exceptions.some(e=>e.combinationReviewed!==true))missing.push("면제·감경 원문·대상·기간·조합의 독립 대조");
      else if(exceptions.length===1&&["half-annex4","no-accidents"].includes(exceptions[0].kind)){
        if(exceptions[0].kind==="no-accidents"&&!regular)missing.push("무재해 감경의 대상 교육 범위");else if(r.requiredHours!==null)r.requiredHours/=2;
      }else missing.push("경력·간주·복수 특례의 적용 범위 판단");
    }
    const sessions=c.sessions.filter(s=>s.kind===kind&&s.subject===c.subject&&s.site===c.site&&s.date<=c.asOf&&(!from||s.date>=from)&&(!regular||!r.deadline||s.date<=r.deadline));
    const used=new Set<string>();let before=0,later=0;const split=r.id==="training.special"&&r.requiredHours===16;
    const splitDeadline=split&&c.firstWork?addCalendarMonths(c.firstWork,3):null;
    for(const s of sessions){
      if(used.has(s.id)){missing.push("동일 교육 세션 중복 가산 확인");continue;}used.add(s.id);
      if(s.attendance!==true||s.content!==true||s.instructor!==true||s.method!==true||s.hours===null){missing.push("출석·작업별 내용·강사·교육방법과 이수시간 증거");continue;}
      const m=s.methodEvidence;
      if(!m||m.mode==="unknown"||m.profileReviewed!==true||m.instructorQualified!==true||m.attendanceTrace!==true){missing.push("교육 방식별 원문 기준·강사 자격·실제 출석 기록");continue;}
      if(m.mode==="on-site"&&m.onSiteJournal!==true||m.mode==="internet"&&(m.annex2Reviewed!==true||m.learnerIdentity!==true||m.courseMinutes===null||m.courseMinutes<60||m.videoMinutes===null||m.videoMinutes<30||m.mobile===null||m.mobile===true&&(m.mobileAcknowledged!==true||m.workDrivingRestricted!==true||m.notWhileWorking!==true))||m.mode==="live"&&(m.annex2Reviewed!==true||m.learnerIdentity!==true||m.interaction!==true)||m.mode==="correspondence"&&(r.id!=="training.supervisor"||m.calendarMonthPeriodReviewed!==true||m.materialsSent!==true||m.annex2Reviewed!==true)){
        missing.push("현장 일지·원격 수강·실시간 상호작용·우편 기간 등 해당 방식의 요건");continue;}
      if(s.startedAt&&s.endedAt){if(s.startedAt>=s.endedAt||(Date.parse(s.endedAt)-Date.parse(s.startedAt))/3600000<s.hours){missing.push("수강 시각·시간의 정합성");continue;}
        if(sessions.some(other=>other.id!==s.id&&other.startedAt&&other.endedAt&&other.startedAt<s.endedAt!&&other.endedAt>s.startedAt!)){missing.push("겹치는 교육 시간의 중복 확인");continue;}}
      if(r.id==="training.special"&&s.workNumber!==c.special.workNumber){missing.push("다른 특별작업 교육의 내용 대조");continue;}
      const workAt=r.id==="training.work_change"?c.changedWorkStartAt:c.firstWorkAt;
      const sameDay=!regular&&s.date===r.deadline;
      if(sameDay&&(!workAt||!s.endedAt))missing.push("같은 날 교육 종료와 작업 시작 시각 대조");
      const timely=regular||r.deadline!==null&&(s.date<r.deadline||sameDay&&!!workAt&&!!s.endedAt&&s.endedAt<=workAt);
      if(!timely&&!(split&&splitDeadline&&s.date<=splitDeadline)&&!sameDay)r.historicalLate=true;
      if(sameDay&&workAt&&s.endedAt&&s.endedAt>workAt&&!split)r.historicalLate=true;
      if(timely)before+=s.hours;else if(split&&splitDeadline&&s.date<=splitDeadline)later+=s.hours;
    }
    r.countedHours=before+later;
    const enough=r.requiredHours!==null&&(split?before>=4&&r.countedHours>=r.requiredHours:before>=r.requiredHours);
    if(!missing.length&&enough){r.state="fulfilled_candidate";r.classification="human_review";return;}
    const due=split&&before>=4?splitDeadline:r.deadline;
    if(!missing.length&&due&&c.asOf<due){r.state="not_due";return;}
    if(!missing.length&&c.nonperformanceProven.includes(r.id)){r.state="risk_candidate";r.classification="human_review";}else missing.push("해당 대상·기간의 교육 이행 또는 미실시를 입증하는 자료");
    if(split){missing.push("최초 작업 전 선행 교육과 3개월 내 분할 이수의 별도 확인");r.deadline=splitDeadline;}
    r.missing=[...new Set(missing)];
  };
  // Special fulfillment is evaluated independently before narrow deemed-credit routes.
  const special=results.find(r=>r.id==="training.special")!;evaluate(special);
  for(const r of results.filter(r=>r!==special)){
    evaluate(r);
    if((r.id==="training.recruitment"&&c.hireDate!==null||r.id==="training.work_change"&&c.workChanged===true&&c.changedWorkStart===c.firstWork)&&special.state==="fulfilled_candidate"&&special.historicalLate===false&&c.scopeReviewed===true&&c.independentFactsReviewed===true&&r.state!=="out_of_scope_candidate"){
      r.state="fulfilled_candidate";r.classification="human_review";r.missing=[];r.countedHours=0;
    }
  }
  return results;
}
export function selectTraining(text:string) {
  if(!/교육|수강|이수|입사/.test(text))return [];
  if(/직무교육|건설(?:업)?\s*기초|특수형태|특고|외국인.*기초/.test(text)&&!/정기교육|채용\s*(?:시\s*)?교육|작업(?:내용)?\s*변경.{0,8}교육|특별교육/.test(text))return [];
  const supervisor=/관리감독자/.test(text);
  const explicit=trainingPolicies.filter(p=>({"training.periodic":/정기교육|반기/.test(text)&&(!supervisor||/일반\s*근로자|사무직|판매업무|근로자\s*정기교육/.test(text)),"training.recruitment":/채용|입사/.test(text),"training.work_change":/작업.*변경|변경.*교육/.test(text),"training.special":/특별교육|특별.*작업/.test(text),"training.supervisor":supervisor&&(!/채용|입사|변경|특별/.test(text)||/정기교육/.test(text))})[p.id]);
  return explicit.length?explicit:trainingPolicies.slice();
}
export function trainingCandidate(id:TrainingId,basis:Ref[],author:string):Extract<Body,{kind:"policy"}> {
  const p=trainingPolicies.find(p=>p.id===id);if(!p)throw Error("교육 후보 없음");
  return {kind:"policy",obligationId:id,label:p.label,basisDate:"2026-10-08",effectiveFrom:"2026-08-01",effectiveTo:null,basis,author,domain:"candidate-v6-training",
    applicability:{all:[{fact:id+".scope"},{fact:id+".target"}]},fulfillment:{fact:id+".fulfilled"},nonfulfillment:{fact:id+".nonperformance_proven"},exceptions:{fact:id+".exception"},deadline:null,immediate:false,requirements:{},
    unresolved:["실제 대상·사건일·별표·방법·예외의 분야 전문가 검토 필요","기준일 버전 표시는 개별 의무 최초 시행일이 아님"],sanction:"unknown"};
}

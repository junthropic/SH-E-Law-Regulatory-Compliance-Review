import {z} from "zod";
import type {Body,Ref} from "./compliance-v2.js";
// 산업안전보건법 제17조, 시행령 제16~19조·별표 3·4 (2026-10-08 시행 중 버전, MST 283449·288347·288431).
// Candidates only: enabled:false, no legal approval. Unknown or unreviewed facts stay "pending", never a violation.
export const safetyManagerPolicies=[
  {id:"safety_manager.appointment",label:"안전관리자 선임(인원)"},
  {id:"safety_manager.qualification",label:"안전관리자 자격"},
  {id:"safety_manager.dedication",label:"안전관리자 전담"},
  {id:"safety_manager.report",label:"안전관리자 선임·위탁 보고"},
  {id:"safety_manager.dismissal_report",label:"안전관리자 해임·위탁 해지 보고"},
  {id:"safety_manager.performance",label:"안전관리자 업무수행"},
] as const;
export type SafetyManagerId=typeof safetyManagerPolicies[number]["id"];
const ids=safetyManagerPolicies.map(p=>p.id) as [SafetyManagerId,...SafetyManagerId[]];
// Evaluation exists only for these; the rest are not offered until implemented and tested.
export const implementedSafetyManager:readonly SafetyManagerId[]=["safety_manager.appointment","safety_manager.qualification"];
export const LEGAL_BASIS_DATE="2026-10-08";

const date=z.string().date().refine(s=>new Date(s).toISOString().slice(0,10)===s),truth=z.boolean().nullable();
const sid=z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
const paths=["1","2","3","4","5","6","7","7-2","8","9","10","11","12","unknown"] as const;
export type Annex4Path=typeof paths[number];
const Manager=z.object({
  id:sid,appointedOn:date.nullable(),endedOn:date.nullable().default(null),appointmentEvidence:z.enum(["document","none","unknown"]),shared:truth.default(false),
  path:z.enum(paths),qualificationEvidence:z.enum(["document","none","unknown"]),pathFactsReviewed:truth,
  grade:z.enum(["기술사","기사","산업기사","unknown","na"]).default("na"),safetyEngineerEquivalent:truth.default(null),
  degreeRelatedReviewed:truth.default(null),fourYearDegree:truth.default(null),supervisorYears:z.number().min(0).max(80).nullable().default(null),experienceYears:z.number().min(0).max(80).nullable().default(null),
  trainingCompletedOn:date.nullable().default(null),examPassed:truth.default(null),sameDivision:truth.default(null),otherLawApplies:truth.default(null),
}).strict();
export const SafetyManagerInput=z.object({
  subject:sid,site:sid,asOf:date,legalBasisDate:z.literal(LEGAL_BASIS_DATE),scopeReviewed:truth,
  annexRow:z.number().int().min(1).max(49).nullable(),rowReviewed:truth,realEstateManagement:truth.default(null),
  regularWorkers:z.number().int().nonnegative().nullable(),workersBasisReviewed:truth,
  construction:z.object({amount100M:z.number().nonnegative().nullable(),civilEngineering:truth,amountReviewed:truth,phase:z.enum(["middle","edge15","demolition_only","unknown"])}).strict().nullable().default(null),
  contracting:z.object({relation:z.enum(["none","prime","subcontractor","unknown"]),aggregationReviewed:truth,primeDedicatedManager:truth}).strict(),
  joint:z.object({claimed:truth,sameEmployer:truth,sameSigungu:truth,within15km:truth,combinedWorkers:z.number().int().nonnegative().nullable(),combinedAmount100M:z.number().nonnegative().nullable(),reviewed:truth}).strict(),
  entrustment:z.object({claimed:truth,agencyDesignated:truth,start:date.nullable(),end:date.nullable(),reviewed:truth}).strict(),
  managers:z.array(Manager).max(50),
  nonperformanceProven:z.array(z.enum(ids)).max(6),
  independentFactsReviewed:truth,
}).strict();
export type SafetyManagerCase=z.infer<typeof SafetyManagerInput>;
type M=SafetyManagerCase["managers"][number];
type State="pending"|"fulfilled_candidate"|"risk_candidate"|"out_of_scope_candidate";
export type SafetyManagerResult={id:SafetyManagerId;label:string;state:State;classification:"more_data"|"human_review";required:number|null;counted:number;missing:string[];notes:string[];managers:{id:string;status:"valid"|"invalid"|"unknown"|"inactive";reasons:string[]}[];enabled:false;legalApproved:false};

// 별표 3 row groups. A: 1~27, B: 28~48, C: 49(건설업).
const group=(row:number)=>row<=27?"A":row<=48?"B":"C";
// Construction tiers in 억원 [from, to, required, required during the first/last 15% of the work period].
const tiers:[number,number,number,number][]=[[800,1500,2,1],[1500,2200,3,2],[2200,3000,4,2],[3000,3900,5,3],[3900,4900,6,3],[4900,6000,7,4],[6000,7200,8,4],[7200,8500,9,5],[8500,10000,10,5]];
type Need={required:number|null;outOfScope:boolean;missing:string[];notes:string[];band:string|null;edge:boolean};
export function requirement(c:SafetyManagerCase):Need {
  const n:Need={required:null,outOfScope:false,missing:[],notes:[],band:null,edge:false};
  if(c.annexRow===null||c.rowReviewed!==true){n.missing.push("별표 3의 사업 종류 행(업종) 확인");return n;}
  const g=group(c.annexRow);
  if(c.contracting.relation==="unknown")n.missing.push("도급 관계(도급인·관계수급인 여부) 확인");
  else if(c.contracting.relation!=="none"&&c.contracting.aggregationReviewed!==true)n.missing.push("영 제16조제3항에 따른 도급사업 공사금액·관계수급인 상시근로자 산입 검토");
  if(c.contracting.relation==="subcontractor"&&c.contracting.primeDedicatedManager===true){n.outOfScope=true;n.notes.push("도급인이 관계수급인 근로자 전담 안전관리자를 선임한 도급사업(영 제16조제5항)");return n;}
  if(g!=="C"){
    if(c.regularWorkers===null||c.workersBasisReviewed!==true){n.missing.push("상시근로자 수와 산정 근거 확인");return n;}
    const w=c.regularWorkers;let low=50;
    if(g==="B"&&c.annexRow===40)low=100;
    if(g==="B"&&c.annexRow===37){if(c.realEstateManagement===null){if(w>=50&&w<100){n.missing.push("제37호 중 부동산 관리업 해당 여부");return n;}}else if(c.realEstateManagement===false)low=100;}
    if(w<low){n.outOfScope=true;n.notes.push(`별표 3 대상 규모(상시근로자 ${low}명) 미만`);return n;}
    const high=g==="A"?500:1000;n.band=w>=high?g+"-high":g+"-low";n.required=w>=high?2:1;return n;
  }
  const k=c.construction;
  if(!k||k.amount100M===null||k.amountReviewed!==true){n.missing.push("건설공사 공사금액과 산정 근거 확인");return n;}
  const a=k.amount100M,sub=c.contracting.relation==="subcontractor";
  if(c.contracting.relation==="unknown"&&a>=50&&a<100)return n;
  if(a<(sub?100:50)){n.outOfScope=true;n.notes.push(`별표 3 건설업 대상 공사금액(${sub?"관계수급인 100억원":"50억원"}) 미만`);return n;}
  if(k.civilEngineering===null&&a>=120&&a<150){n.missing.push("토목공사업(건설산업기본법 시행령 별표 1 제1호가목) 해당 여부");return n;}
  const b=k.civilEngineering?150:120;
  if(a<800){n.band=a<b?"C-low":"C-mid";n.required=1;return n;}
  if(a>=10000){n.missing.push("공사금액 1조원 이상 추가 인원 산식의 원문 해석 확인");return n;}
  const t=tiers.find(([f,to])=>a>=f&&a<to)!;n.band="C-"+t[0];
  if(k.phase==="demolition_only"){n.missing.push("철거공사만 이루어지는 기간의 최소 인원(별표 3 비고 2) 해석 확인");return n;}
  if(k.phase==="unknown"&&t[2]!==t[3]){n.missing.push("전체 공사기간 중 전·후 15 기간 해당 여부");return n;}
  n.edge=k.phase==="edge15";n.required=n.edge?t[3]:t[2];return n;
}
const active=(m:M,asOf:string)=>m.appointedOn!==null&&m.appointedOn<=asOf&&(m.endedOn===null||m.endedOn>asOf);
function jointStatus(c:SafetyManagerCase):"valid"|"invalid"|"unknown"|"none" {
  const j=c.joint;if(j.claimed!==true)return "none";
  const limit=c.annexRow===49?{v:j.combinedAmount100M,max:c.construction?.civilEngineering?150:120}:{v:j.combinedWorkers,max:300};
  const parts=[j.sameEmployer,j.sameSigungu===true||j.within15km===true?true:(j.sameSigungu===false&&j.within15km===false?false:null),limit.v===null?null:limit.v<=limit.max,j.reviewed];
  if(parts.some(x=>x===false))return "invalid";return parts.every(x=>x===true)?"valid":"unknown";
}
function entrustmentStatus(c:SafetyManagerCase):"counts"|"not_eligible"|"unknown"|"none" {
  const e=c.entrustment;if(e.claimed!==true)return "none";
  if(c.annexRow===49||(c.regularWorkers!==null&&c.regularWorkers>=300))return "not_eligible";
  if(c.regularWorkers===null||e.agencyDesignated===null||e.reviewed!==true||!e.start)return "unknown";
  return e.agencyDesignated&&e.start<=c.asOf&&(e.end===null||e.end>c.asOf)?"counts":"not_eligible";
}
function common(c:SafetyManagerCase,missing:string[]) {
  if(c.scopeReviewed!==true)missing.push("사업장 범위(같은 사업장 여부) 검토");
  if(c.independentFactsReviewed!==true)missing.push("입력 사실의 독립 검토");
}
function counting(c:SafetyManagerCase) {
  const joint=jointStatus(c),entrust=entrustmentStatus(c),missing:string[]=[],valid:M[]=[];let unknown=0;
  for(const m of c.managers){
    if(m.appointedOn===null||m.appointmentEvidence==="unknown"){unknown++;missing.push(`${m.id}: 선임일·선임 자료 확인`);continue;}
    if(!active(m,c.asOf)||m.appointmentEvidence==="none")continue;
    if(m.shared===true){if(joint==="valid")valid.push(m);else if(joint==="unknown"||m.shared===null){unknown++;missing.push(`${m.id}: 공동선임 요건(같은 사업주·시군구 또는 15km·합계 규모) 확인`);}continue;}
    if(m.shared===null){unknown++;missing.push(`${m.id}: 다른 사업장과 공동선임 여부 확인`);continue;}
    valid.push(m);
  }
  if(entrust==="unknown"){unknown++;missing.push("안전관리전문기관 위탁의 지정·기간·대상(건설업 제외·300명 미만) 확인");}
  return {valid,unknown,missing,entrusted:entrust==="counts",joint,entrust};
}
function result(id:SafetyManagerId,state:State,extra:Partial<SafetyManagerResult>):SafetyManagerResult {
  return {id,label:safetyManagerPolicies.find(p=>p.id===id)!.label,state,classification:state==="pending"?"more_data":"human_review",required:null,counted:0,missing:[],notes:[],managers:[],enabled:false,legalApproved:false,...extra};
}
export function evaluateAppointment(c:SafetyManagerCase):SafetyManagerResult {
  const id="safety_manager.appointment",need=requirement(c),missing=[...need.missing];common(c,missing);
  if(need.outOfScope)return result(id,missing.length?"pending":"out_of_scope_candidate",{missing,notes:need.notes});
  const k=counting(c),counted=k.valid.length+(k.entrusted?1:0);
  if(k.entrust==="not_eligible")need.notes.push("위탁은 건설업 제외·상시근로자 300명 미만 사업장만 가능(영 제19조제1항)하거나 기간·지정이 확인되지 않아 인원에 넣지 않음");
  if(k.joint==="invalid")need.notes.push("공동선임 요건 불충족: 공동 안전관리자를 이 사업장 인원에 넣지 않음");
  const base={required:need.required,counted,notes:need.notes};
  if(need.required===null||missing.length)return result(id,"pending",{...base,missing:[...missing,...k.missing]});
  if(counted>=need.required)return result(id,"fulfilled_candidate",base);
  if(k.unknown)return result(id,"pending",{...base,missing:k.missing});
  if(c.contracting.relation==="subcontractor"&&c.contracting.primeDedicatedManager===null)return result(id,"pending",{...base,missing:["도급인의 관계수급인 전담 안전관리자 선임 여부(영 제16조제5항)"]});
  if(c.nonperformanceProven.includes(id))return result(id,"risk_candidate",base);
  return result(id,"pending",{...base,missing:[`부족 인원 ${need.required-counted}명의 선임 자료 또는 미선임을 입증하는 자료`]});
}
// 별표 3 "선임방법" column: annex 4 paths allowed for the row group and size band.
function allowed(c:SafetyManagerCase,band:string,p:Annex4Path):boolean {
  const row=c.annexRow!,w=c.regularWorkers??0;
  switch(band){
    case "A-low":return ["1","2","4","5","8"].includes(p)||(p==="6"&&w<300)||(p==="7"&&row===27)||(p==="7-2"&&w<300);
    case "A-high":return ["1","2","3","4","5","8"].includes(p)||(p==="7"&&row===27&&w<1000);
    case "B-low":return ["1","2","4","5","8"].includes(p)||(p==="3"&&(row===28||(row>=30&&row<=46)))||(p==="6"&&w<300)||(p==="7"&&row===36)||(p==="7-2"&&w<300);
    case "B-high":return ["1","2","3","4","5","8","9","10"].includes(p);
    case "C-low":return ["1","2","3","4","5","6","7","10","11","12"].includes(p);
    case "C-mid":case "C-800":return ["1","2","3","4","5","6","7","10"].includes(p);
    default:return ["1","2","3","4","5","6","7","12"].includes(p);
  }
}
const cutoff:Partial<Record<Annex4Path,string>>={"6":"1998-12-31","7":"1998-12-31","7-2":"2028-12-31","11":"2025-12-31","12":"2025-12-31"};
// One manager's annex 4 path. "invalid" needs a proven contrary fact; missing evidence stays "unknown".
export function pathStatus(c:SafetyManagerCase,band:string,m:M):{status:"valid"|"invalid"|"unknown";reasons:string[]} {
  const r:string[]=[],bad:string[]=[];const need=(ok:boolean|null,label:string)=>{if(ok===null)r.push(label);else if(!ok)bad.push(label);};
  if(m.path==="unknown")return {status:"unknown",reasons:["별표 4 자격 경로 확인"]};
  if(!allowed(c,band,m.path))return {status:"invalid",reasons:[`별표 3 이 행·규모의 선임방법에 별표 4 제${m.path}호가 없음`]};
  if(m.qualificationEvidence!=="document")r.push("자격·학위·교육·시험 자료 제출(미제출은 무자격 확정이 아님)");
  if(m.pathFactsReviewed!==true)r.push("자격 경로 사실의 독립 검토");
  const construction=c.annexRow===49;
  switch(m.path){
    case "2":case "3":need(m.grade==="unknown"||m.grade==="na"?null:true,"국가기술자격 등급");break;
    case "4":case "5":need(m.degreeRelatedReviewed,"산업안전 관련 학위 해당성");break;
    case "6":need(m.supervisorYears===null||m.fourYearDegree===null?null:m.supervisorYears>=(m.fourYearDegree?1:3),"관리감독자 업무(건설업은 시공실무) 경력 기간");need(m.sameDivision,"관리감독자로 종사한 업종과 같은 대분류");break;
    case "7":need(m.supervisorYears===null?null:m.supervisorYears>=5,"관리감독자 업무 5년 이상");need(m.sameDivision,"관리감독자로 종사한 업종과 같은 대분류");if(!construction)need(c.regularWorkers===null?null:c.regularWorkers>=50&&c.regularWorkers<1000,"상시근로자 50명 이상 1천명 미만");break;
    case "7-2":need(construction?false:true,"건설업 제외");need(m.experienceYears===null?null:m.experienceYears>=5,"건설업 제외 사업 실무경력 5년 이상");break;
    case "8":need(m.otherLawApplies,"해당 법령(고압가스·LPG·도시가스·교통안전·화약류·전기안전)을 적용받는 사업");break;
    case "9":case "10":need(m.experienceYears===null?null:m.experienceYears>=10,"해당 업무 10년 이상");break;
    case "12":need(m.grade==="기사"||m.grade==="기술사"?(m.experienceYears===null?null:m.experienceYears>=3):m.grade==="산업기사"?(m.experienceYears===null?null:m.experienceYears>=5):null,"토목·건축 자격 등급별 실무경력");break;
  }
  const cut=cutoff[m.path];
  if(cut){need(m.trainingCompletedOn===null?null:m.trainingCompletedOn<=cut,`지정기관 교육(${cut}까지의 교육만 해당) 이수`);need(m.examPassed,"정해진 시험 합격");}
  if(bad.length)return {status:"invalid",reasons:bad};return {status:r.length?"unknown":"valid",reasons:r};
}
const leader=(m:M)=>m.path==="1"||m.safetyEngineerEquivalent===true;
// Composition rules of the 선임방법 column ("…이 1명 이상 포함되어야 한다", 제12호 상한).
function composition(band:string,edge:boolean,valid:M[],unknown:M[]):{ok:boolean|null;reason:string|null} {
  const has=(f:(m:M)=>boolean,n:number,label:string)=>{const v=valid.filter(f).length,u=unknown.filter(f).length;return v>=n?{ok:true,reason:null}:v+u>=n?{ok:null,reason:label}:{ok:false,reason:label};};
  const cap=(n:number)=>valid.filter(m=>m.path==="12").length<=n;
  switch(band){
    case "A-high":return has(m=>m.path==="1"||m.path==="4"||(m.path==="2"&&m.grade!=="산업기사"),1,"별표 4 제1호·제2호(산업안전산업기사 제외)·제4호 해당자 1명 이상");
    case "B-high":return has(m=>["1","2","4","5"].includes(m.path),1,"별표 4 제1호·제2호·제4호·제5호 해당자 1명 이상");
    case "C-800":return has(m=>["1","2","3"].includes(m.path),1,"별표 4 제1호~제3호 해당자 1명 이상");
    case "C-1500":case "C-2200":return cap(1)?has(leader,1,"산업안전지도사등 1명 이상"):{ok:false,reason:"제12호 해당자는 1명만 포함 가능"};
    case "C-3000":case "C-3900":return cap(1)?has(leader,edge?1:2,`산업안전지도사등 ${edge?1:2}명 이상`):{ok:false,reason:"제12호 해당자는 1명만 포함 가능"};
    case "C-4900":case "C-6000":return cap(2)?has(leader,2,"산업안전지도사등 2명 이상"):{ok:false,reason:"제12호 해당자는 2명까지만 포함 가능"};
    case "C-7200":case "C-8500":return cap(2)?has(leader,3,"산업안전지도사등 3명 이상"):{ok:false,reason:"제12호 해당자는 2명까지만 포함 가능"};
    default:return {ok:true,reason:null};
  }
}
export function evaluateQualification(c:SafetyManagerCase):SafetyManagerResult {
  const id="safety_manager.qualification",need=requirement(c),missing=[...need.missing];common(c,missing);
  if(need.outOfScope)return result(id,missing.length?"pending":"out_of_scope_candidate",{missing,notes:need.notes});
  const k=counting(c),notes=[...need.notes];
  if(k.entrusted)notes.push("안전관리전문기관 위탁분은 그 기관을 안전관리자로 봄(영 제19조제2항): 개인 별표 4 자격 평가 대상 아님");
  if(need.required===null||!need.band)return result(id,"pending",{missing:[...missing,...k.missing],notes});
  const rows=c.managers.map(m=>k.valid.includes(m)?{m,...pathStatus(c,need.band!,m)}:{m,status:"inactive" as const,reasons:["선임이 확인된 현재 안전관리자가 아님"]});
  const valid=rows.filter(x=>x.status==="valid").map(x=>x.m),unknown=rows.filter(x=>x.status==="unknown").map(x=>x.m);
  const required=need.required-(k.entrusted?1:0),comp=composition(need.band,need.edge,valid,unknown);
  const base={required:need.required,counted:valid.length+(k.entrusted?1:0),notes:comp.ok===false&&comp.reason?[...notes,"구성 요건 미충족: "+comp.reason]:notes,managers:rows.map(x=>({id:x.m.id,status:x.status,reasons:x.reasons}))};
  if(missing.length)return result(id,"pending",{...base,missing:[...missing,...k.missing]});
  if(valid.length>=required&&comp.ok===true)return result(id,"fulfilled_candidate",base);
  const open=[...rows.filter(x=>x.status==="unknown").flatMap(x=>x.reasons.map(s=>`${x.m.id}: ${s}`)),...k.missing,...(comp.ok===null&&comp.reason?[comp.reason+" 확인"]:[])];
  if(open.length)return result(id,"pending",{...base,missing:open});
  if(c.nonperformanceProven.includes(id))return result(id,"risk_candidate",base);
  return result(id,"pending",{...base,missing:["자격 요건을 갖춘 안전관리자 선임 자료 또는 무자격을 입증하는 자료"]});
}
export function evaluateSafetyManager(c:SafetyManagerCase):SafetyManagerResult[] {
  return [evaluateAppointment(c),evaluateQualification(c)];
}
// Industrial-safety 안전관리자 only; hazmat/gas/electric/health managers and other roles are different duties.
export function selectSafetyManager(text:string) {
  if(!/안전관리자/.test(text)||!/산업안전|산안법|안전관리전문기관|별표\s*[34]/.test(text))return [];
  if(/위험물|고압가스|도시가스|액화석유가스|전기안전관리자|화약류|보건관리자|안전보건관리책임자|안전보건관리담당자/.test(text)&&!/산업안전보건법\s*(?:제17조|상)?\s*안전관리자/.test(text))return [];
  const explicit=safetyManagerPolicies.filter(p=>implementedSafetyManager.includes(p.id)&&({"safety_manager.appointment":/선임|인원|몇\s*명|공동|위탁/.test(text),"safety_manager.qualification":/자격|학위|기사|지도사|시험/.test(text)} as Record<string,boolean>)[p.id]);
  return explicit.length?explicit:safetyManagerPolicies.filter(p=>implementedSafetyManager.includes(p.id));
}
export function safetyManagerCandidate(id:SafetyManagerId,basis:Ref[],author:string):Extract<Body,{kind:"policy"}> {
  const p=safetyManagerPolicies.find(p=>p.id===id);if(!p)throw Error("안전관리자 후보 없음");
  return {kind:"policy",obligationId:id,label:p.label,basisDate:LEGAL_BASIS_DATE,effectiveFrom:LEGAL_BASIS_DATE,effectiveTo:null,basis,author,domain:"candidate-v7-safety-manager",
    applicability:{all:[{fact:id+".scope"},{fact:id+".target"}]},fulfillment:{fact:id+".fulfilled"},nonfulfillment:{fact:id+".nonperformance_proven"},exceptions:{fact:id+".exception"},deadline:null,immediate:false,requirements:{},
    unresolved:["별표 3 행·인원 산정·자격 경로의 분야 전문가 검토 필요","2026-10-08 시행 중 확인만 함: 개별 조항 최초 시행일·부칙 경과조치 미확인"],sanction:"unknown"};
}

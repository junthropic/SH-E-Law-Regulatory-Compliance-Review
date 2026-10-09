import { z } from "zod";
import { submissionTransition, retentionYears } from "./policies-v3.js";
const truth=z.enum(["true","false","unknown","conflict"]);
const reference=z.object({id:z.string().min(1),version:z.number().int().positive(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const ConsigneeCase = z.object({
  asOf:z.string().date(),plannedAt:z.string().date(),wasteKind:z.string(),properties:z.string(),quantity:z.number().nonnegative(),unit:z.enum(["ton/day","ton/year","m3"]),
  businessId:z.string(),facilityId:z.string(),address:z.string(),legalPath:z.enum(["permit","notification","statutory_facility","other_law","unknown"]),
  identity:truth,legalStatus:truth,scope:truth,capacity:truth,storage:truth,conditionalDocuments:truth,contract:truth,
  sanctionEffect:truth,sanctionFrom:z.string().date().nullable(),sanctionTo:z.string().date().nullable(),sourceAsOf:z.string().date().nullable(),partial:z.boolean(),basis:z.array(reference),
}).strict();
export function assessWaste(input:unknown) {
  const c=ConsigneeCase.parse(input),holds:string[]=[];
  if(!c.businessId||!c.facilityId||c.identity!=="true")holds.push("사업자·시설 동일성 확인 필요");
  if(c.legalPath==="unknown"||c.legalStatus!=="true")holds.push("허가·신고·법정 시설 등 해당 법적 지위 확인 필요");
  for(const [key,label] of [["scope","폐기물 종류·처리 방법"],["capacity","수탁 처리능력"],["storage","현재 보관량"],["conditionalDocuments","조건부 서류 적용 범위"],["contract","위탁 계약"]] as const)
    if(c[key]!=="true")holds.push(label+" 확인 필요");
  const expired=!!c.sanctionTo&&c.sanctionTo<c.plannedAt;
  const future=!!c.sanctionFrom&&c.sanctionFrom>c.plannedAt;
  if(c.sanctionEffect==="unknown"||c.sanctionEffect==="conflict")holds.push("처분의 효력·대상 기간 확인 필요");
  if(c.sanctionEffect==="true"&&!expired&&!future)holds.push("예정 위탁 시점의 처분 영향 검토 필요");
  if(c.sourceAsOf!==c.asOf||c.partial||!c.basis.length)holds.push("원문·조회 기준일·수집 범위 확인 필요");
  return {scenario:"S2",input:c,holds,category:holds.length?"more_data":"human_review",automaticConsignmentAllowed:false,
    expiredSanction:expired,futureSanction:future,conversionPerformed:false,sourceVerified:false,legalApproval:false};
}
export const SubmissionCase=z.object({checkAt:z.string().date().optional(),recordKind:z.enum(["general","structural","unknown"]),special30:truth,
  profileReviewed:z.boolean(),due:z.string().date().nullable(),events:z.array(z.object({type:z.enum(["performed","recorded","submitted","received","supplement_requested","rejected","corrected","resubmitted","remediated"]),date:z.string().date(),basis:reference}).strict())}).strict();
export function assessSubmission(input:unknown) {
  const c=SubmissionCase.parse(input),sent=c.events.filter(e=>e.type==="submitted"||e.type==="resubmitted").sort((a,b)=>a.date.localeCompare(b.date));
  return {scenario:"S3",transition:submissionTransition(c.checkAt),retentionYears:retentionYears(c.recordKind,c.special30),history:c.events,
    performed:c.events.some(e=>e.type==="performed"),recorded:c.events.some(e=>e.type==="recorded"),submitted:sent.length>0,received:c.events.some(e=>e.type==="received"),
    remediated:c.events.some(e=>e.type==="remediated"),historicalLate:c.profileReviewed&&c.due&&sent.length?sent[0].date>c.due:null,
    deemedAccepted:false,technicalComplianceConfirmed:false,category:"more_data",legalApproval:false};
}
export function riskTiming(input:{asOf:string;initialYear?:number;newRisk:boolean;workStart?:string;representativeRequested:"true"|"false"|"unknown";formOnly:boolean}) {
  z.string().date().parse(input.asOf);if(input.workStart)z.string().date().parse(input.workStart);
  return {scenario:"S5",regularYearRequired:input.initialYear===undefined?null:Number(input.asOf.slice(0,4))>input.initialYear,
    adHocBeforeStart:input.newRisk?input.workStart??null:null,representativeCondition:input.representativeRequested,
    evaluationProven:false,formSufficient:false,sharingBeforeAndAfterSeparate:true,category:input.formOnly?"more_data":"human_review",legalApproval:false};
}

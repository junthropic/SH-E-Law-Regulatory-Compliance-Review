import type { Body, Ref } from "./compliance-v2.js";
import { candidatePolicy, selectedPolicies } from "./policies-v3.js";
export const nextPolicies = [
  {id:"risk_assessment.evaluation",label:"위험성평가 실시",target:["work_scope","evaluation_trigger"],done:"evaluation_performed",breach:"evaluation_nonperformance_proven",article:"법 제36조제1항·시행규칙 제37조",tag:"legal_obligation"},
  {id:"risk_assessment.worker_participation",label:"근로자 참여",target:["work_scope","evaluation_trigger","participation_scope_reviewed"],done:"workers_participated",breach:"workers_excluded_proven",article:"법 제36조제2항·시행규칙 제37조의2",tag:"legal_obligation"},
  {id:"risk_assessment.risk_reduction",label:"위험 감소대책 수립·이행",target:["work_scope","identified_risk"],done:"measures_implemented",breach:"measures_nonperformance_proven",article:"법 제36조제1항",tag:"legal_obligation"},
  {id:"risk_assessment.effectiveness",label:"개선조치 효과 확인",target:["work_scope","measures_implemented"],done:"effectiveness_checked",breach:"effectiveness_failure_proven",article:"독립 법적 의무 근거 미확정",tag:"internal_design"},
  {id:"risk_assessment.retention",label:"위험성평가 기록·보존",target:["work_scope","evaluation_performed","retention_profile_reviewed"],done:"risk_records_retained",breach:"risk_records_destroyed_proven",article:"법 제36조제5항·시행규칙 제37조의4",tag:"legal_obligation"},
  {id:"environment.waste_contractor",label:"폐기물 수탁자 적격·위탁 조건",target:["waste_scope","consignment_planned","legal_path_reviewed","conditional_document_scope_reviewed"],done:"consignee_scope_capacity_contract_verified",breach:"consignment_noncompliance_proven",article:"폐기물관리법 제18조·시행규칙 제16조의12",tag:"legal_obligation"},
  {id:"risk_assessment.representative_participation",label:"요구한 근로자대표 참여",target:["work_scope","evaluation_trigger","representative_requested"],done:"representative_participated",breach:"requested_representative_excluded_proven",article:"법 제36조제3항",tag:"legal_obligation"},
  {id:"risk_assessment.sharing",label:"평가 일정·결과 공유",target:["work_scope","evaluation_trigger"],done:"schedule_and_results_shared",breach:"sharing_nonperformance_proven",article:"법 제36조제4항·시행규칙 제37조의3",tag:"legal_obligation"},
] as const;
export function selectPolicies(text: string) {
  const topics = [
    {name:"hazmat",hit:/위험물|안전관리자.{0,12}(선임|퇴직|대리)|정기점검/.test(text)},
    {name:"waste",hit:/폐기물|수탁|위탁처리/.test(text)},
    {name:"risk_assessment",hit:/위험성\s*평가|공정.{0,8}추가|유해.{0,4}위험.{0,4}요인/.test(text)},
  ];
  const policies=[...selectedPolicies.filter(()=>topics[0].hit),...nextPolicies.filter(s=>s.id.startsWith("environment.")?topics[1].hit:topics[2].hit)];
  return {version:"topic-v4.1",topics,policies,unclassified:!topics.some(t=>t.hit),applicabilityConfirmed:false,
    reason:"입력 문구에 따른 검토 후보 선정이며 법적 적용성·사실 확인이 아닙니다.",
    notSelected:[...selectedPolicies,...nextPolicies].filter(s=>!policies.some(p=>p.id===s.id)).map(s=>({id:s.id,reason:"관련 주제 미탐지: 비대상 확정 아님"}))};
}
export function v4Candidate(id:string,basis:Ref[],author:string):Extract<Body,{kind:"policy"}> {
  if(selectedPolicies.some(s=>s.id===id))return candidatePolicy(id,basis,author);
  const s=nextPolicies.find(s=>s.id===id);if(!s)throw Error("정책 후보 없음");
  const keys=[...s.target,s.done,s.breach,"exception_applies"];
  return {kind:"policy",obligationId:id,label:s.label,basisDate:"2026-10-08",effectiveFrom:"2026-06-01",effectiveTo:null,basis,author,domain:"candidate-v4",
    applicability:{all:s.target.map(fact=>({fact}))},fulfillment:{fact:s.done},nonfulfillment:{fact:s.breach},exceptions:{fact:"exception_applies"},deadline:null,immediate:true,
    requirements:Object.fromEntries(keys.map(k=>[k,{label:"대상·기간·원문 위치와 해당 사실 확인",acceptedPaths:["document","agency_register","electronic_record","site_observation"],alternatives:["동일 대상·기간의 기관 확인 또는 객관적인 현장 기록"],insufficientAlone:["양식 파일 존재","문서 미업로드","검색 0건","사용자의 이행 주장"],role:"case_reviewer"}])),
    unresolved:["정책별 실제 시행일·부칙·위임·예외 원문과 적용 범위 검토 필요","독립 분야 검토와 실제 사업장 증거 없음",...(s.tag==="internal_design"?["내부 효과 확인을 독립 법률 위반으로 활성화할 수 없음"]:[])],sanction:"unknown"};
}

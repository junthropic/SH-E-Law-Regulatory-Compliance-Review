import {randomUUID} from "node:crypto";
import {sha} from "./store.js";
import {ProtectedPayloads} from "./protected-payload-v4.js";
import {ManagedRecords} from "./records-v6.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import {SafetyManagerInput,evaluateSafetyManager,selectSafetyManager,LEGAL_BASIS_DATE,type SafetyManagerCase} from "./safety-manager-v7.js";
import {ProtectedTraceReader} from "./trace-reader-v7.js";
import type {LegalIssue} from "../shared/types.js";

// Same flow as v6 TrainingCases: source document → versioned supplement → independent fact review → existing review → export.
// Explicit management binding only; nothing here activates law or records a real approval.
export class SafetyManagerCases {
  readonly records:ManagedRecords;
  constructor(readonly vault:ProtectedPayloads){this.records=new ManagedRecords(vault);vault.store.db.exec(`
    CREATE TABLE IF NOT EXISTS v7_safety_manager_cases(id TEXT,tenant TEXT,synthetic INTEGER,version INTEGER,payload TEXT,body TEXT,PRIMARY KEY(id,tenant,synthetic,version));
    CREATE TABLE IF NOT EXISTS v7_safety_manager_current(id TEXT,tenant TEXT,synthetic INTEGER,body TEXT,PRIMARY KEY(id,tenant,synthetic));`);}
  read(p:Principal,id:string){assertPrincipal(p);const row=this.vault.store.db.prepare("SELECT * FROM v7_safety_manager_cases WHERE id=? AND tenant=? AND synthetic=? ORDER BY version DESC LIMIT 1").get(id,p.tenant,+p.synthetic) as any;
    if(!row)throw Error("안전관리자 후보 영역 확인 필요");const data=JSON.parse(this.vault.get(p,row.payload,"unit").toString()),meta=JSON.parse(row.body);
    this.records.graph.check(p,meta.node,JSON.stringify(data),"read","local");return {...data,node:meta.node};}
  private save(p:Principal,id:string,expected:number,data:any){assertPrincipal(p);if(!p.roles.includes("writer"))throw Error("후보 저장 권한 필요");const db=this.vault.store.db;db.exec("BEGIN IMMEDIATE");
    try{const old=db.prepare("SELECT version FROM v7_safety_manager_cases WHERE id=? AND tenant=? AND synthetic=? ORDER BY version DESC LIMIT 1").get(id,p.tenant,+p.synthetic) as any;
      if((old?.version||0)!==expected)throw Error("안전관리자 후보 버전 충돌");delete data.node;data.version=expected+1;
      const serialized=JSON.stringify(data),payload=this.vault.put(p,"unit",Buffer.from(serialized),7*86400000),identity={id,version:data.version,hash:sha(serialized)};
      db.prepare("INSERT INTO v7_safety_manager_current VALUES(?,?,?,?) ON CONFLICT(id,tenant,synthetic) DO UPDATE SET body=excluded.body").run(id,p.tenant,+p.synthetic,JSON.stringify(identity));
      const own=this.records.graph.bindStored(p,"v7_safety_manager_current",id,serialized),node=this.records.graph.derive(p,serialized,[own,data.sourceNode],"safety-manager-case-v7");
      db.prepare("INSERT INTO v7_safety_manager_cases VALUES(?,?,?,?,?,?)").run(id,p.tenant,+p.synthetic,data.version,payload,JSON.stringify({node,own,sourceNode:data.sourceNode}));db.exec("COMMIT");
      return {id,version:data.version,node,own,sourceNode:data.sourceNode,legalApproval:false,enabled:false};
    }catch(e){db.exec("ROLLBACK");throw e;}}
  fromDocument(p:Principal,record:string){const {binding,document}=this.records.document(p,record),input=SafetyManagerInput.parse(JSON.parse(document.text));input.independentFactsReviewed=null;
    const id=randomUUID();return this.save(p,id,0,{id,input,sourceNode:binding.node,source:binding.source,fieldLocations:Object.keys(input).map(key=>({field:key,pointer:"/"+key,originalHash:binding.source.originalHash})),author:p.id,review:null,legalApproval:false,enabled:false});}
  supplement(p:Principal,id:string,version:number,input:SafetyManagerCase){const old=this.read(p,id),data=SafetyManagerInput.parse(input);if(old.version!==version||data.site!==old.input.site||data.subject!==old.input.subject)throw Error("안전관리자 대상·버전 불일치");
    data.independentFactsReviewed=null;return this.save(p,id,version,{...old,input:data,author:p.id,review:null});}
  review(p:Principal,id:string,version:number,note:string){const old=this.read(p,id);if(!p.roles.includes("case_reviewer")||p.id===old.author||old.version!==version||note.trim().length<15)throw Error("독립 사실 검토 권한·버전 확인 필요");
    return this.save(p,id,version,{...old,input:{...old.input,independentFactsReviewed:true},review:{actor:p.id,note,synthetic:p.synthetic,legalApproval:false}});}
  evaluate(p:Principal,id:string){const data=this.read(p,id);return {caseId:id,version:data.version,source:data.source,results:evaluateSafetyManager(data.input),legalApproval:false,enabled:false};}
  publish(p:Principal,id:string,reviewId:string){const data=this.read(p,id),store=this.vault.store;new ProtectedTraceReader(this.vault).trace(p,reviewId);const r=store.review(reviewId);if(!r)throw Error("검토 기록 없음");
    if(r.request.asOf!==data.input.asOf||!r.request.documentIds.includes(data.source.id))throw Error("검토 기준일·선택 자료와 안전관리자 후보 불일치");
    const selected=selectSafetyManager(r.request.prompt);if(!selected.length)throw Error("질문에 산업안전보건법 안전관리자 검토 범위가 없습니다.");
    const descriptions={pending:"자료·사실을 보완한 뒤 판단해야 합니다.",fulfilled_candidate:"요건 충족의 합성 후보입니다. 법적 충분성은 별도 검토가 필요합니다.",risk_candidate:"요건 미충족의 합성 후보입니다. 법률 위반 확정은 아닙니다.",out_of_scope_candidate:"이 의무에 대한 비대상 후보입니다. 다른 의무를 면제하지 않습니다.",not_due:"보고 기한이 아직 도래하지 않았습니다. 기한 내 관할 접수를 확인하세요."};
    const issues:LegalIssue[]=evaluateSafetyManager(data.input).filter(x=>selected.some(s=>s.id===x.id)).map(x=>({id:id+":"+x.id,ruleId:x.id,title:x.label,category:x.classification,conclusion:descriptions[x.state],
      conditions:[`사실 후보 버전 ${data.version} · 원본 해시 ${data.source.originalHash}`,`법률 기준일 ${LEGAL_BASIS_DATE} · 평가일 ${data.input.asOf}`,`필요 인원 ${x.required??"미확인"} · 확인 인원 ${x.counted}`,...x.notes,p.synthetic?"가상 자료 검증 · 법률 승인 없음":"자료 후보 검토 · 법률 승인 없음"],
      citations:[],exceptions:[],missing:x.missing,nextActions:["별표 3 행·인원 산정 근거와 선임·자격 원본 자료를 독립 검토하세요."],severity:"unspecified"}));
    r.issues=[...r.issues.filter(x=>!x.ruleId?.startsWith("safety_manager.")),...issues];r.needsReview=true;store.saveReview(r);const binding=this.records.bindReview(p,reviewId,[data.node,data.sourceNode]);return {reviewId,version:data.version,issues:issues.length,binding,legalApproval:false,enabled:false};}
}

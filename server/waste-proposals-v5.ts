import { randomUUID } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { PayloadProvenance } from "./provenance-v4.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { sha } from "./store.js";

export const wasteFields = {
  "waste-companies": ["prcsWstListCn","tpbizNm","bzentyNm","arspNm","brNo","rprsvNm","zip","addr","telNo","bzentyPstnLot","bzentyPstnLat","bzentySttsNm","cmptncGvmnfcNm","cmptncSggNm"],
  "waste-sanctions": ["bzentyNm","brno","rprsvNm","tpbizSeNm","admdspInstNm","admdspYmd","bgngYmd","endYmd","vltnDsctn","telgmRcptnYmd"],
} as const;
type Service = keyof typeof wasteFields;
export function decodeWaste(raw: Buffer, service: Service) {
  const text = raw.toString("utf8").replace(/^\uFEFF/,"").trim(); let data:any;
  if (text.startsWith("<")) {
    if (/<!DOCTYPE|<!ENTITY|<html/i.test(text) || XMLValidator.validate(text)!==true) throw Error("공식 응답 구조 확인 필요");
    data=new XMLParser({parseTagValue:false,processEntities:false}).parse(text);
  } else data=JSON.parse(text);
  const root=data.response??data;
  if (!root.header || !["00","0","NORMAL_SERVICE"].includes(String(root.header.resultCode))) throw Error("기관 정상 결과 확인 필요");
  const body=root.body;
  if (!body || !/^\d+$/.test(String(body.totalCount))) throw Error("결과 건수 확인 필요");
  const total=Number(body.totalCount), base=data.response?"response.body.items":"body.items";
  if(total===0) {
    if(body.items && body.items!=="" && JSON.stringify(body.items)!=="[]" && JSON.stringify(body.items)!=="{}") throw Error("0건·자료 충돌");
    return {total,rows:[]};
  }
  // Each shape is tied to this provider, not a case-insensitive global remapper.
  const a=body.items;
  const entries: {value:any,path:string}[] = Array.isArray(a)
    ? a.map((x,i)=>({value:x.item,path:`${base}[${i}].item`}))
    : Array.isArray(a?.item) ? a.item.map((value:any,i:number)=>({value,path:`${base}.item[${i}]`}))
    : a?.item && typeof a.item==="object" ? [{value:a.item,path:`${base}.item`}] : [];
  if(!entries.length || entries.length>total || entries.some(e=>!e.value||Array.isArray(e.value)||typeof e.value!=="object"))throw Error("자료 항목 구조 확인 필요");
  return {total,rows:entries.map(({value,path})=>({path,fields:Object.fromEntries(wasteFields[service].map(field=>{
    const v=value[field],present=Object.hasOwn(value,field);
    return [field,{path:`${path}.${field}`,value:present?v:null,state:!present?"missing":v===null?"null":v===""?"blank":"present"}];
  }))}))};
}
export function businessIdentity(value: unknown) {
  if(typeof value!=="string" || !value.trim())return {state:"unknown",normalized:null};
  if(/[*xX•]/.test(value))return {state:"masked",normalized:null};
  const n=value.replace(/[ -]/g,"");
  return /^\d{10}$/.test(n)?{state:"exact-business-number",normalized:n}:{state:"unknown",normalized:null};
}
export class WasteProposals {
  constructor(readonly vault: ProtectedPayloads) {
    vault.store.db.exec("CREATE TABLE IF NOT EXISTS v5_waste_proposals(id TEXT,tenant TEXT,synthetic INTEGER,version INTEGER,payload TEXT,PRIMARY KEY(id,tenant,synthetic,version))");
  }
  read(p:Principal,id:string) {
    assertPrincipal(p);
    const row=this.vault.store.db.prepare("SELECT payload FROM v5_waste_proposals WHERE id=? AND tenant=? AND synthetic=? ORDER BY version DESC LIMIT 1").get(id,p.tenant,+p.synthetic) as {payload:string}|undefined;
    if(!row)throw Error("검토 후보 접근 범위 확인 필요");
    return JSON.parse(this.vault.get(p,row.payload,"unit").toString());
  }
  private save(p:Principal,b:any,expected:number) {
    assertPrincipal(p); if(!p.roles.includes("writer"))throw Error("작성 권한 필요");
    const db=this.vault.store.db;db.exec("BEGIN IMMEDIATE");
    try {
      const old=db.prepare("SELECT MAX(version) n FROM v5_waste_proposals WHERE id=? AND tenant=? AND synthetic=?").get(b.id,p.tenant,+p.synthetic) as {n:number|null};
      if((old.n??0)!==expected)throw Error("수동 보완 버전 충돌");
      b.version=expected+1;const payload=this.vault.put(p,"unit",Buffer.from(JSON.stringify(b)),7*86400000);
      db.prepare("INSERT INTO v5_waste_proposals VALUES(?,?,?,?,?)").run(b.id,p.tenant,+p.synthetic,b.version,payload);db.exec("COMMIT");return b;
    }catch(e){db.exec("ROLLBACK");throw e;}
  }
  private captureData(p:Principal,captureId:string) {
    if(!p.roles.includes("writer"))throw Error("작성 권한 필요");
    const row=this.vault.store.db.prepare("SELECT body FROM v4_captures WHERE id=? AND tenant=? AND synthetic=?").get(captureId,p.tenant,+p.synthetic) as {body:string}|undefined;
    if(!row)throw Error("원문 응답 접근 범위 확인 필요");
    const c=JSON.parse(row.body), service=c.service as Service;
    if(!(service in wasteFields)||!c.complete||c.parse!=="parsed"||c.status!==200)throw Error("원문 수집·해석 상태 확인 필요");
    const raw=this.vault.get(p,c.rawRef,"raw");if(sha(raw)!==c.hash)throw Error("응답 원문 해시 불일치");
    const parsed=decodeWaste(raw,service),g=new PayloadProvenance(this.vault.store),parent=g.input(p,raw.toString("base64"));
    return {author:p.id,captureId,rawRef:c.rawRef,hash:c.hash,collectedAt:c.collectedAt,sourceVersion:"official-schema-1.0.0",service,parent,...parsed,
      dateMeanings:{telgmRcptnYmd:"통합 시스템 수신일: 관할기관 접수일 아님",admdspYmd:"행정처분 일자: 현재 효력 확정 아님"},
      manual:{},review:null,legalApproval:false,siteFactsConfirmed:false,reasons:["source_missing","identity_conflict","contract_missing","capacity_unknown","sanction_effect_unknown"]};
  }
  fromCapture(p:Principal,captureId:string) { return this.save(p,{id:randomUUID(),...this.captureData(p,captureId)},0); }
  refresh(p:Principal,id:string,expected:number,captureId:string) {
    const old=this.read(p,id),next=this.captureData(p,captureId);
    if(old.version!==expected||old.service!==next.service)throw Error("수집 원천·수동 보완 버전 충돌");
    return this.save(p,{...next,id,manual:old.manual,review:null,previousRawHash:old.hash,manualRecheckRequired:old.hash!==next.hash},expected);
  }
  supplement(p:Principal,id:string,expected:number,manual:Record<string,string>) {
    if(!p.roles.includes("writer")||Object.keys(manual).some(k=>!["facilityIdentity","permitScope","capacityEvidence","currentStockEvidence","contractEvidence","sanctionEffectEvidence"].includes(k))||Object.values(manual).some(v=>typeof v!=="string"||v.length>6000))throw Error("수동 보완 범위 확인 필요");
    const b=this.read(p,id);if(b.version!==expected)throw Error("수동 보완 버전 충돌");
    return this.save(p,{...b,manual:{...b.manual,...manual},author:p.id,review:null},expected);
  }
  review(p:Principal,id:string,expected:number,note:string) {
    const b=this.read(p,id);
    if(!p.roles.includes("case_reviewer")||p.id===b.author||note.trim().length<15||b.version!==expected)throw Error("독립 검토·버전 확인 필요");
    // Review acknowledges the proposal only. No permit/capacity fact is automatically approved.
    return this.save(p,{...b,review:{actor:p.id,note,at:new Date().toISOString(),scope:"자료 후보와 미확인 항목 대조"}},expected);
  }
  project(p:Principal,id:string) {
    const b=this.read(p,id);return {id,version:b.version,classification:"추가 자료 필요",summary:"조회 자료는 수탁 가능 또는 위반을 확정하지 않습니다.",
      reasons:b.reasons,missing:["원본 허가 범위","동일 시설 확인","처리능력·현재 재고","계약 조건","처분의 현재 효력"],trace:{captureId:b.captureId,rawHash:b.hash,parent:b.parent,review:b.review},legalApproval:false};
  }
}

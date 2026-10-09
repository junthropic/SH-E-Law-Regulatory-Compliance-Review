import {randomUUID} from "node:crypto";
import {lookup} from "node:dns/promises";
import {sha} from "./store.js";
import {ProtectedPayloads} from "./protected-payload-v4.js";
import {PayloadProvenance} from "./provenance-v4.js";
import {collectOfficial,discoverOfficial,type OfficialAttachmentId} from "./attachments-v5.js";
import {attachmentURL,pinnedDownload,publicIPv4} from "./attachments-v4.js";
import {parseProtected} from "./extraction-v5.js";
import {SendAdmissions} from "./admission-v5.js";
import {assertPrincipal,type Principal} from "./compliance-v2.js";
import type {Job,UnitResult} from "./jobs-v3.js";
import type {PublicRecord} from "../shared/public-apis.js";

export type AttachmentDeps={resolve:(host:string)=>Promise<string[]>;download:typeof pinnedDownload};
const deps:AttachmentDeps={resolve:async h=>(await lookup(h,{all:true})).map(r=>r.address),download:pinnedDownload};
export type RegisteredFile={url:string;provider:"accident-files"|"guide";fileId:string;mime:string;version:string|null;effectiveFrom:string|null};
// Files are supplied by the trusted host catalogue, never by an HTTP body or arbitrary URL prefix.
export class AttachmentGraph {
  readonly graph:PayloadProvenance;
  constructor(readonly vault:ProtectedPayloads,readonly registered:readonly RegisteredFile[]=[],readonly transport:AttachmentDeps=deps){this.graph=new PayloadProvenance(vault.store);vault.store.db.exec("CREATE TABLE IF NOT EXISTS v6_attachment_records(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,body TEXT)");}
  preserve(p:Principal,provider:"form5"|"notice"|"accident-files"|"guide"|"sif",bytes:Buffer){assertPrincipal(p);if(!p.roles.includes("writer"))throw Error("원문 보존 권한 필요");
    const id=randomUUID(),node=this.graph.input(p,bytes.toString()),ref=this.vault.put(p,"raw",bytes,7*86400000),body={id,provider,node,ref,hash:sha(bytes),bytes:bytes.length,collectedAt:new Date().toISOString()};
    this.vault.store.db.prepare("INSERT INTO v6_attachment_records VALUES(?,?,?,?)").run(id,p.tenant,+p.synthetic,JSON.stringify(body));return body;}
  private read(p:Principal,id:string){const row=this.vault.store.db.prepare("SELECT body FROM v6_attachment_records WHERE id=? AND tenant=? AND synthetic=?").get(id,p.tenant,+p.synthetic) as any;if(!row)throw Error("첨부 발견 원본 영역 확인 필요");const b=JSON.parse(row.body),raw=this.vault.get(p,b.ref,"raw");if(sha(raw)!==b.hash||raw.length!==b.bytes)throw Error("첨부 발견 원본 변경");this.graph.check(p,b.node,raw.toString(),"read","local");return {b,raw};}
  discover(p:Principal,id:string){const {b,raw}=this.read(p,id);if(b.provider==="form5"||b.provider==="notice")return {source:b,files:[discoverOfficial(b.provider as OfficialAttachmentId,raw.toString())],status:"discovered"};
    if(b.provider==="sif")return {source:b,files:[],status:"support_unverified",reason:"공식 SIF model에 첨부 필드가 확인되지 않았습니다."};
    const parsed=JSON.parse(raw.toString()),body=parsed.response?.body??parsed.body,items=body?.items?.item??body?.items;if(!body||items===undefined)throw Error("공식 첨부 metadata 구조 확인 필요");
    const rows=Array.isArray(items)?items:[items],files=rows.flatMap<any>((r:any)=>{
      if(b.provider==="accident-files"){
        if(typeof r.filepath!=="string"||typeof r.filenm!=="string"||!((typeof r.boardno==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(r.boardno))||Number.isSafeInteger(r.boardno))||/[/\\:]|\.\./.test(r.filenm))throw Error("사고 첨부 식별자·파일명 대조 필요");
        return [{url:r.filepath,fileId:String(r.boardno)+":"+r.filenm,boardno:r.boardno,filename:r.filenm}];
      }
      if(typeof r.fileDownloadUrl!=="string")throw Error("GUIDE 원문 연결 필드 누락");return [{url:r.fileDownloadUrl,fileId:r.fileDownloadUrl,date:r.techGdlnOfancYmd??null}];
    });return {source:b,files,status:"discovered"};}
  async collect(p:Principal,id:string,index:number){const discovered=this.discover(p,id),file=discovered.files[index] as any;if(!file||!Number.isSafeInteger(index)||index<0)throw Error("보존 metadata의 첨부 선택 확인 필요");
    const authorize=()=>this.graph.check(p,discovered.source.node,this.vault.get(p,discovered.source.ref,"raw").toString(),"query","attachment-download");
    const admitted=new SendAdmissions(this.vault.store).admit(p,JSON.stringify(file),authorize,65000);
    try{admitted.start();let result:any;
      if(discovered.source.provider==="form5"||discovered.source.provider==="notice"){result=await collectOfficial(p,this.vault,file,{...this.transport,download:(u,address,policy)=>this.transport.download(u,address,policy,admitted.signal)});result.socketObservation=this.transport.download===pinnedDownload?"government-pinned-socket":"injected-transport";}
      else{const policy=this.registered.find(r=>r.provider===discovered.source.provider&&r.url===file.url&&r.fileId===file.fileId);if(!policy)throw Error("정확한 provider·file ID·URL 다운로드 정책 미등록");
        const u=attachmentURL(policy.url,{host:new URL(policy.url).hostname,pathPrefix:new URL(policy.url).pathname,maxBytes:20_000_000,timeoutMs:60000}),ips=await this.transport.resolve(u.hostname);
        if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw Error("첨부 DNS 주소 차단");const r=await this.transport.download(u,ips[0],{host:u.hostname,pathPrefix:u.pathname,maxBytes:20_000_000,timeoutMs:60000},admitted.signal);
        if(r.status!==200||r.peer!==ips[0]||r.type!==policy.mime||r.bytes.length>20_000_000||!(policy.mime==="application/pdf"&&r.bytes.subarray(0,5).toString()==="%PDF-"||["application/hwp+zip","application/octet-stream"].includes(policy.mime)&&r.bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]))))throw Error("원문 응답·형식 불일치");
        const ref=this.vault.put(p,"attachment",r.bytes,7*86400000),extraction=await parseProtected(p,this.vault,ref);result={ref,hash:sha(r.bytes),bytes:r.bytes.length,sourceVersion:policy.version,effectiveFrom:policy.effectiveFrom,extraction,socketObservation:this.transport.download===pinnedDownload?"government-pinned-socket":"injected-transport"};}
      admitted.signal.throwIfAborted();authorize();const rawNode=this.graph.input(p,JSON.stringify({hash:result.hash,ref:result.ref})),node=this.graph.derive(p,JSON.stringify(result),[discovered.source.node,rawNode],"attachment-extraction-v6");
      admitted.finish(true);return {...result,node,rawNode,metadataParent:discovered.source.node,legalApproval:false,decisiveCellsChecked:false};
    }catch(e){admitted.finish(false);throw e;}}
  async fromCapture(p:Principal,captureId:string){const row=this.vault.store.db.prepare("SELECT body FROM v4_captures WHERE id=? AND tenant=? AND synthetic=?").get(captureId,p.tenant,+p.synthetic) as any;if(!row)throw Error("provider 응답 영역 확인 필요");const c=JSON.parse(row.body);
    const provider=c.operation==="Disaster_attach_api02"?"accident-files":c.service;
    if(!c.complete||c.parse!=="parsed"||!["accident-files","guide","sif"].includes(provider))throw Error("첨부 provider·완전 응답 확인 필요");
    const raw=this.vault.get(p,c.rawRef,"raw");if(sha(raw)!==c.hash)throw Error("provider 응답 해시 불일치");return this.preserve(p,provider,raw);}
}
// Explicit host grant callback is required. An adapter cannot grant itself access to a new parent.
export function attachmentWorkerHook(graph:AttachmentGraph,authorizeHost:(p:Principal,record:{id:string;node:string;provider:string})=>Promise<void>){
  return async(p:Principal,job:Job,item:PublicRecord,signal:AbortSignal):Promise<UnitResult[]>=>{
    if(!["accidents","guide","sif"].includes(item.service))return [{id:"attachment",parent:null,role:"attachment",state:"not_supported",error:"support_unverified"}];
    const rows=graph.vault.store.db.prepare("SELECT id,body FROM v4_captures WHERE job=? AND tenant=? AND synthetic=? ORDER BY rowid DESC").all(job.id,p.tenant,+p.synthetic) as any[];
    const capture=rows.find(r=>{const c=JSON.parse(r.body);return c.complete&&c.parse==="parsed"&&(item.service==="accidents"?c.operation==="Disaster_attach_api02":c.service===item.service);});
    if(!capture)return [{id:"attachment",parent:null,role:"attachment",state:"error",error:"metadata_missing"}];
    const record=await graph.fromCapture(p,capture.id);await authorizeHost(p,record);const found=graph.discover(p,record.id);if(!found.files.length)return [{id:"attachment",parent:null,role:"attachment",state:"not_supported",error:"support_unverified"}];
    const files=found.files.map((f:any,index)=>({f,index})).filter(({f})=>item.service==="accidents"?String(f.boardno)===String(item.fields.boardno):item.service==="guide"?f.url===item.fields.fileDownloadUrl:false);
    if(!files.length)return [{id:"attachment",parent:null,role:"attachment",state:"error",error:"item_mismatch"}];
    const output:UnitResult[]=[];for(const {index} of files){signal.throwIfAborted();try{const collected=await graph.collect(p,record.id,index);signal.throwIfAborted();output.push({id:"attachment-"+index,parent:null,role:"attachment",state:"success",data:{...collected,providerCapture:capture.id,metadataRecord:record.id}});}catch{signal.throwIfAborted();output.push({id:"attachment-"+index,parent:null,role:"attachment",state:"error",error:"attachment_failed"});}}
    return output;
  };
}

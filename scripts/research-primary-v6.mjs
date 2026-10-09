import {writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {lookup} from "node:dns/promises";
import {pinnedDownload,publicIPv4} from "../work/v6-typecheck/server/attachments-v4.js";
import {officialAttachments} from "../work/v6-typecheck/server/attachments-v5.js";
const root="docs/implementation-v6/official",hash=b=>createHash("sha256").update(b).digest("hex"),rows=[];mkdirSync(root,{recursive:true});
for(const [id,seq,article,branch] of [["rule-before-37","271485","0037","00"],["rule-june-37","286657","0037","00"],["rule-current-37","288431","0037","00"],["rule-current-37-2","288431","0037","02"],["rule-current-37-3","288431","0037","03"],["rule-current-37-4","288431","0037","04"],["training-26","288431","0026","00"],["training-27","288431","0027","00"],["law-training-29","283449","0029","00"]]){
  const url=`https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=${seq}&joNo=${article}&joBrNo=${branch}&docCls=jo&urlMode=lsScJoRltInfoR`;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:"error"}),raw=Buffer.from(await r.arrayBuffer());if(raw.length>2_000_000)throw Error("size");writeFileSync(`${root}/${id}.html`,raw);const text=raw.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();writeFileSync(`${root}/${id}.txt`,text);rows.push({id,url,seq,article,branch,status:r.status,hash:hash(raw),bytes:raw.length,collectedAt:new Date().toISOString(),articleMarker:text.includes("제"+Number(article)+"조"),threeYearMarker:text.includes("3년"),legalApproved:false});}catch(e){rows.push({id,url,status:"blocked",reason:e.name,collectedAt:new Date().toISOString()});}
  writeFileSync("docs/implementation-v6/legal-primary-capture.json",JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));await new Promise(r=>setTimeout(r,300));
}
const diagnostics=[];
for(const [id,definition] of Object.entries(officialAttachments)){
  const u=new URL(definition.url),entry={id,url:definition.url,at:new Date().toISOString(),host:u.hostname,SNI:u.hostname,TLSVerification:true,redirectAllowed:false,encoding:"identity",observed:false};
  try{const all=await lookup(u.hostname,{all:true}),ips=all.map(x=>x.address);entry.DNS=ips;const ip=ips.find(publicIPv4);if(!ip)throw Error("no public IPv4");entry.pinnedAddress=ip;
    const r=await pinnedDownload(u,ip,{host:u.hostname,pathPrefix:u.pathname,maxBytes:1_000_000,timeoutMs:15000});const expected=id==="form5"?r.bytes.subarray(0,5).toString()==="%PDF-":r.bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));Object.assign(entry,{observed:true,status:r.status,MIME:r.type,peer:r.peer,bytes:r.bytes.length,hash:hash(r.bytes),signatureExpected:expected,original:expected&&r.type===definition.mime});
    if(!expected){const safe=r.bytes.subarray(0,4000);writeFileSync(`${root}/${id}-pinned-error.txt`,safe);entry.errorExcerptHash=hash(safe);}
  }catch(e){Object.assign(entry,{original:false,reason:e.message,causeConfirmed:false});}
  diagnostics.push(entry);writeFileSync("docs/implementation-v6/pinned-diagnostics.json",JSON.stringify(diagnostics,null,2));console.log(JSON.stringify(entry));
}

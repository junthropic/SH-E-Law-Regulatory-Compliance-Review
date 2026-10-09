import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { sha } from "./store.js";

export type AttachmentPolicy = { host: string; pathPrefix: string; maxBytes: number; timeoutMs: number };
// Fail closed on IPv6 until its special-purpose ranges are independently tested.
export function publicIPv4(address: string) {
  if(isIP(address)!==4) return false;
  const [a,b,c] = address.split(".").map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100&&b>=64&&b<=127) ||
    (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2)) ||
    (a===198&&(b===18||b===19||(b===51&&c===100))) || (a===203&&b===0&&c===113));
}
export function attachmentURL(input: string, policy: AttachmentPolicy) {
  const u = new URL(input);
  if(u.protocol!=="https:" || u.hostname!==policy.host || u.port || u.username || u.password || u.hash ||
    !u.pathname.startsWith(policy.pathPrefix) || /%2f|%5c|%2e|%3a/i.test(u.pathname) ||
    /\\|\x00/.test(input) || [...u.searchParams.keys()].some(k=>/key|token|authorization|cookie|confm|^oc$/i.test(k)))
    throw Error("첨부 주소 허용 범위 확인 필요");
  if(policy.maxBytes<=0||policy.maxBytes>20_000_000||policy.timeoutMs<=0||policy.timeoutMs>60000) throw Error("첨부 처리 한도 확인 필요");
  return u;
}
type Download = { bytes: Buffer; type: string; peer: string; status: number };
export async function pinnedDownload(u: URL, address: string, policy: AttachmentPolicy, signal?:AbortSignal): Promise<Download> {
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const chunks: Buffer[]=[]; let size=0;
    const req=request(u,{method:"GET",agent:false,servername:u.hostname,signal,
      lookup: ((_host: string,options: any,cb: any)=>options?.all?cb(null,[{address,family:4}]):cb(null,address,4)) as any,
      headers:{Accept:"application/pdf,image/png,image/jpeg", "Accept-Encoding":"identity"}},res=>{
      const peer=res.socket.remoteAddress?.replace(/^::ffff:/,"")||"";
      if(peer!==address || res.statusCode!==200 || (res.headers["content-encoding"] && res.headers["content-encoding"]!=="identity")) {
        res.destroy(); reject(Error("첨부 연결 주소·응답 확인 필요")); return;
      }
      res.on("data",chunk=>{size+=chunk.length;if(size>policy.maxBytes)req.destroy(Error("첨부 용량 초과"));else chunks.push(chunk);});
      res.on("error",()=>reject(Error("첨부 수신 실패")));
      res.on("end",()=>{
        if(!res.complete) { reject(Error("첨부 수신 미완료")); return; }
        resolve({bytes:Buffer.concat(chunks),type:String(res.headers["content-type"]||"").split(";")[0],peer,status:200});
      });
    });
    const timer=setTimeout(()=>req.destroy(Error("첨부 시간 초과")),policy.timeoutMs);
    req.on("close",()=>clearTimeout(timer));req.on("error",()=>reject(Error("첨부 통신 실패")));req.end();
  });
}
export async function collectAttachment(p: Principal, payloads: ProtectedPayloads, input: string, policy: AttachmentPolicy,
  deps = { resolve: async(host:string)=>(await lookup(host,{all:true})).map(x=>x.address), download:pinnedDownload }) {
  assertPrincipal(p);if(!p.roles.includes("writer"))throw Error("첨부 수집 권한 없음");
  const u=attachmentURL(input,policy), addresses=await deps.resolve(u.hostname);
  if(!addresses.length||addresses.some(x=>!publicIPv4(x))) throw Error("첨부 DNS 주소 차단");
  const result=await deps.download(u,addresses[0],policy);
  assertPrincipal(p);
  if(result.peer!==addresses[0]||result.status!==200||result.bytes.length>policy.maxBytes) throw Error("첨부 연결·용량 확인 실패");
  const b=result.bytes;
  const mime=b.subarray(0,5).toString()==="%PDF-"?"application/pdf":b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":b[0]===255&&b[1]===216&&b[2]===255?"image/jpeg":null;
  if(!mime||mime!==result.type) throw Error("첨부 형식·서명 불일치 또는 파서 미지원");
  const ext=u.pathname.split(".").at(-1)?.toLowerCase();
  if(ext&&["pdf","png","jpg","jpeg","html","zip","exe"].includes(ext)&& !({"application/pdf":["pdf"],"image/png":["png"],"image/jpeg":["jpg","jpeg"]}[mime]||[]).includes(ext)) throw Error("첨부 확장자 불일치");
  return {id:payloads.put(p,"attachment",b,7*86400000),hash:sha(b),urlRef:payloads.reference(p,u.href),bytes:b.length,
    mime,parser:"not_supported",decisiveCellsChecked:false,complete:true,directRender:false,archiveSupport:false,sourceVersion:"unverified"};
}

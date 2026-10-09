// Public catalogue pages only. Never loads a vault or calls a keyed API.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
const root="docs/implementation-v6/official",registry=JSON.parse(readFileSync("docs/implementation-v5/api-registry.json"));
mkdirSync(root,{recursive:true});const results=[],h=b=>createHash("sha256").update(b).digest("hex");
for(const entry of registry.entries) {
  const url=new URL(entry.url);if(url.hostname!=="www.data.go.kr"||!/^\/data\/\d+\/openapi.do$/.test(url.pathname)){results.push({id:entry.id,status:"blocked",reason:"공식 catalogue URL 확인 필요"});continue;}
  try {
    const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(20000)}),raw=Buffer.from(await r.arrayBuffer());if(raw.length>3_000_000)throw Error("size");
    const text=raw.toString("utf8");writeFileSync(`${root}/${entry.id}.html`,raw);
    const m=text.match(/const swaggerJson\s*=\s*`([\s\S]*?)`/);let schema,parseError;
    if(m)try{schema=JSON.parse(m[1].replace(/\\\\/g,"\\"));}catch{parseError="embedded_schema_parse_failed";}
    if(schema)writeFileSync(`${root}/${entry.id}-schema.json`,JSON.stringify(schema,null,2));
    results.push({id:entry.id,url:url.href,status:r.status,at:new Date().toISOString(),bytes:raw.length,hash:h(raw),schemaHash:schema?h(JSON.stringify(schema)):null,paths:schema?Object.keys(schema.paths||{}):[],schemaAvailable:!!schema,parseError,liveResponse:false});
    console.log(JSON.stringify({id:entry.id,status:r.status,paths:results.at(-1).paths}));
  }catch(e){results.push({id:entry.id,url:url.href,status:"blocked",reason:e.name,at:new Date().toISOString()});console.log(entry.id,e.name);}
  writeFileSync("docs/implementation-v6/catalogue-capture.json",JSON.stringify(results,null,2));
  await new Promise(r=>setTimeout(r,250));
}

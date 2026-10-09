import { it, expect } from "vitest";
import { createServer } from "node:https";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { testStore } from "./helpers.js";
import { writer } from "./v2-fixture.js";
import { PayloadProvenance } from "../server/provenance-v4.js";
import { SendAdmissions } from "../server/admission-v5.js";
import { backupGeneration, restoreGeneration, recoverGenerationLock, openGeneration } from "../server/backup-v5.js";
import { sha } from "../server/store.js";
const build=()=>resolve(process.env.SHE_TEST_BUILD||"build");
function child(code:string,env:NodeJS.ProcessEnv=process.env,expected=0){return new Promise<string>((done,fail)=>{let out="",err="";const c=spawn(process.execPath,["--input-type=module","-e",code],{windowsHide:true,env,stdio:["ignore","pipe","pipe"]});c.stdout.on("data",b=>out+=b);c.stderr.on("data",b=>err+=b);c.once("error",fail);c.once("close",n=>n!==expected?fail(Error(err)):done(out.trim()));});}
it("V5-A05: 격리 실제 TLS 소켓에서 pin·인증서·원문 bytes 확인하고 redirect 거부",async()=>{
  const key=readFileSync("tests/fixtures/v5-tls/synthetic-key.pem"),cert=readFileSync("tests/fixtures/v5-tls/cert.pem"),bytes=Buffer.from("%PDF-synthetic-socket");let calls=0;
  const server=createServer({key,cert},(req,res)=>{calls++;if(req.url==="/redirect"){res.writeHead(302,{location:"https://evil.test/"});res.end();}else{res.writeHead(200,{"content-type":"application/pdf"});res.end(bytes);}});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
  try{const port=(server.address() as any).port,code=`import {pinnedDownload} from ${JSON.stringify(pathToFileURL(resolve(build(),"server/attachments-v4.js")).href)};const p={host:'fixture.test',pathPrefix:'/',maxBytes:1000,timeoutMs:2000};const r=await pinnedDownload(new URL('https://fixture.test:${port}/file'),'127.0.0.1',p);let redirectBlocked=false;try{await pinnedDownload(new URL('https://fixture.test:${port}/redirect'),'127.0.0.1',p)}catch{redirectBlocked=true}console.log(JSON.stringify({peer:r.peer,bytes:r.bytes.toString(),redirectBlocked}));`;
    const result=JSON.parse(await child(code,{...process.env,NODE_EXTRA_CA_CERTS:resolve("tests/fixtures/v5-tls/cert.pem")}));expect(result).toEqual({peer:"127.0.0.1",bytes:bytes.toString(),redirectBlocked:true});expect(calls).toBe(2);
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
},30000);
it("V5-B04: 다른 프로세스의 revoke commit 이전·이후 admission과 취소 순서",async()=>{
  const f=testStore(),p={...writer,roles:["writer","egress_reviewer"] as typeof writer.roles},gate=new PayloadProvenance(f.store),a=new SendAdmissions(f.store),expires="2099-01-01T00:00:00Z";
  try{
    const node=gate.input(p,"serialized"),seq=gate.event(p,node,"query","api","release","다중 프로세스 격리 시험을 위한 전송 승인입니다.",expires),authorize=()=>gate.check(p,node,"serialized","query","api");
    const admitted=a.admit(p,"serialized",authorize,10000);admitted.start();
    const code=`import {Store} from ${JSON.stringify(pathToFileURL(resolve(build(),"server/store.js")).href)};import {PayloadProvenance} from ${JSON.stringify(pathToFileURL(resolve(build(),"server/provenance-v4.js")).href)};const s=new Store(${JSON.stringify(f.store.dir)});new PayloadProvenance(s).event(${JSON.stringify(p)},${JSON.stringify(node)},'query','api','revoke','다른 프로세스에서 승인 철회 commit을 기록합니다.',${JSON.stringify(expires)},${seq});s.close();console.log('revoked');`;
    expect(await child(code)).toBe("revoked");await new Promise(r=>setTimeout(r,70));expect(admitted.signal.aborted).toBe(true);admitted.finish(false);
    expect(()=>a.admit(p,"serialized",authorize,10000)).toThrow();expect((f.store.db.prepare("SELECT count(*) n FROM v5_send_intents").get() as any).n).toBe(1);
  }finally{f.clean();}
},30000);
it("V5-B05: 실제 복원 프로세스 중단 뒤 공개 세대는 없고 잠금 복구 후 재복원",async()=>{
  const f=testStore(),p={...writer,roles:["writer","backup_operator"] as typeof writer.roles},key={id:"synthetic-crash",bytes:randomBytes(32)},target=resolve(f.store.dir,"generation-target");
  try{
    const {archive}=await backupGeneration(f.store,p,key,sha("synthetic-source")),file=resolve(f.store.dir,"synthetic-archive.json");writeFileSync(file,JSON.stringify(archive));
    const code=`import fs from 'node:fs';import {restoreGeneration} from ${JSON.stringify(pathToFileURL(resolve(build(),"server/backup-v5.js")).href)};restoreGeneration(${JSON.stringify(target)},${JSON.stringify(p)},{id:'synthetic-crash',bytes:Buffer.from(${JSON.stringify(key.bytes.toString("base64"))},'base64')},JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')),phase=>{if(phase==='before_publish')process.exit(47)});`;
    await child(code,process.env,47);expect(existsSync(resolve(target,"current.json"))).toBe(false);expect(()=>restoreGeneration(target,p,key,archive)).toThrow(/잠금/);
    expect(recoverGenerationLock(target,sha(JSON.stringify(archive))).generationsDeleted).toBe(0);const restored=restoreGeneration(target,p,key,archive);expect(restored.egress).toBe("denied");const fresh=openGeneration(target);fresh.close();
  }finally{f.clean();}
},30000);

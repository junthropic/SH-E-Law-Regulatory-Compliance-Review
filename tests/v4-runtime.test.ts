import { it,expect,vi,afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { testStore } from "./helpers.js";
import { writer } from "./v2-fixture.js";
import { ProtectedPayloads } from "../server/protected-payload-v4.js";
import { withCallContext, CallPermits } from "../server/transport-v4.js";
import { requestOfficial } from "../server/public-api-transport.js";
import { ProtectedCollection } from "../server/collection-v4.js";
import { workOne } from "../server/jobs-v3.js";
import { collectAttachment,attachmentURL,publicIPv4 } from "../server/attachments-v4.js";
import { PayloadProvenance } from "../server/provenance-v4.js";
import { sha } from "../server/store.js";
import { createA07Transport, PublicApiError } from "../server/public-api-transport.js";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const key={id:"synthetic-v4",bytes:randomBytes(32)},p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z"};
afterEach(()=>vi.unstubAllGlobals());
function context(f:ReturnType<typeof testStore>) {const payloads=new ProtectedPayloads(f.store,key);return {store:f.store,payloads,principal:p,job:"synthetic-job",service:"qna",queryRef:"opaque-ref",deadline:Date.now()+120000,account:()=>({group:"synthetic-account",intervalMs:0}),authorize:()=>{}};}
it("V4-A01: parser 이전 BOM·공백 바이트와 변환 hash를 분리 보존하고 credential echo를 암호화한다",async()=>{
  const f=testStore(),c=context(f),body='\ufeff {"value":"synthetic-secret-key"} \n';
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(Buffer.from(body))));
  try {
    expect(await withCallContext(c,()=>requestOfficial(new URL("https://apis.data.go.kr/test?serviceKey=synthetic-secret-key")))).toEqual({value:"synthetic-secret-key"});
    const row=f.store.db.prepare("SELECT body FROM v4_captures").get() as any,b=JSON.parse(row.body);
    expect(b).toMatchObject({stage:"client-decoded-entity-bytes",wireCapture:false,complete:true,parse:"parsed",legalVerified:false});
    expect(c.payloads.get(p,b.rawRef,"raw").toString()).toBe(body);
    expect(b.hash).toBe(sha(Buffer.from(body)));expect(b.transformedHash).not.toBe(b.hash);
    expect(JSON.stringify(f.store.db.prepare("SELECT * FROM v4_payloads").all())).not.toContain("synthetic-secret-key");
    expect(row.body).not.toContain("serviceKey");
  }finally{f.clean();}
});
it.each(["","<html>login</html>","<response><items>",'{"response":'])('V4-A02: 잘못된 응답 %s를 정상 0건으로 바꾸지 않는다',async body=>{
  const f=testStore(),c=context(f);vi.stubGlobal("fetch",vi.fn(async()=>new Response(body)));
  try{await expect(withCallContext(c,()=>requestOfficial(new URL("https://apis.data.go.kr/test")))).rejects.toThrow();
    const b=JSON.parse((f.store.db.prepare("SELECT body FROM v4_captures").get() as any).body);expect(b.parse).toBe("invalid");expect(b.legalVerified).toBe(false);
  }finally{f.clean();}
});
it("V4-A03: 중단된 스트림은 받은 부분 원문만 보존한다",async()=>{
  const f=testStore(),c=context(f);let count=0;
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(new ReadableStream({pull(ctrl){if(count++===0)ctrl.enqueue(Buffer.from('{"partial":'));else ctrl.error(Error("synthetic-stream"));}}))));
  try{await expect(withCallContext(c,()=>requestOfficial(new URL("https://apis.data.go.kr/test")))).rejects.toThrow();
    const b=JSON.parse((f.store.db.prepare("SELECT body FROM v4_captures").get() as any).body);expect(b.complete).toBe(false);expect(b.reason).toBe("stream_interrupted");
  }finally{f.clean();}
});
it("V4-A04: 실제 호출별 permit이 병렬 호출을 직렬화하고 오래된 fence 해제를 거절한다",async()=>{
  const f=testStore(),c=context(f);let active=0,max=0,calls=0;
  vi.stubGlobal("fetch",vi.fn(async()=>{calls++;max=Math.max(max,++active);await new Promise(r=>setTimeout(r,25));active--;return new Response('{}');}));
  try{await withCallContext(c,()=>Promise.all(Array.from({length:4},()=>requestOfficial(new URL("https://apis.data.go.kr/test")))));expect(max).toBe(1);expect(calls).toBe(4);
    const permits=new CallPermits(f.store),id=sha("other"),fence=permits.acquire(id,"old",0,5,0)!;
    expect(permits.acquire(id,"new",6,5,0)).toBe(fence+1);permits.release(id,"old",fence);expect(permits.acquire(id,"third",7,5,0)).toBeUndefined();
  }finally{f.clean();}
});
it("V4-B01: 보호 자료의 영역·키·TTL은 실패를 명시하고 queue hold를 허용하지 않는다",()=>{
  const f=testStore();let now=0;const vault=new ProtectedPayloads(f.store,key,()=>now);
  try{const id=vault.put(p,"queue",Buffer.from("sensitive"),10);expect(()=>vault.get({...p,tenant:"other"},id,"queue")).toThrow();expect(()=>new ProtectedPayloads(f.store,{...key,bytes:randomBytes(32)},()=>now).get(p,id,"queue")).toThrow();
    expect(()=>vault.put(p,"queue",Buffer.from("x"),10,true)).toThrow();now=10;expect(()=>vault.get(p,id,"queue")).toThrow(/만료/);expect(vault.expire()).toBe(1);
  }finally{f.clean();}
});
it("V4-B02: 실제 prepare→worker→adapter→capture에서 민감 검색어는 큐·일지·event에 평문으로 남지 않는다",async()=>{
  const f=testStore(),payloads=new ProtectedPayloads(f.store,key),s=new ProtectedCollection(f.store,payloads,()=>p,async()=>"synthetic-key",()=>({group:"synthetic-account",intervalMs:0}));
  const sensitive="가상직원-건강-비공개123";
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({resultCode:"S00",resultCount:0,resultList:[]}))));
  try{
    const q=s.prepare(p,"qna",{keyword:sensitive,mode:"1",page:1});
    s.provenance.event({...p,roles:["egress_reviewer"]},q.node,"query","qna","release","가상 검색 자료에 한정한 모의 전송 해제입니다.",p.expiresAt);
    const j=await s.enqueue(p,q.ref,"sensitive-idem");await workOne(s.jobs,"synthetic-worker",s.handle.bind(s));
    expect(s.jobs.get(p,j.id).state).toBe("succeeded");
    const unit=s.jobs.units(p,j.id).find(u=>u.data)!;expect(s.readUnit(p,unit).total).toBe(0);
    for(const table of ["v3_jobs","v3_job_units","v3_job_events","v4_captures","v4_payloads","v4_provenance","v4_grants"])
      expect(JSON.stringify(f.store.db.prepare(`SELECT * FROM ${table}`).all())).not.toContain(sensitive);
    expect((f.store.db.prepare("SELECT count(*) n FROM v4_captures").get() as any).n).toBe(1);
  }finally{f.clean();}
});
it("V4-B03: enqueue 후 철회는 worker의 실제 outbound를 0회로 유지한다",async()=>{
  const f=testStore(),payloads=new ProtectedPayloads(f.store,key),s=new ProtectedCollection(f.store,payloads,()=>p,async()=>"synthetic-key",()=>({group:"g",intervalMs:0}));const network=vi.fn();vi.stubGlobal("fetch",network);
  try{const q=s.prepare(p,"qna",{keyword:"가상",mode:"1",page:1}),reviewer={...p,roles:["egress_reviewer"] as typeof p.roles};
    const seq=s.provenance.event(reviewer,q.node,"query","qna","release","가상 자료 조회만 허용하는 모의 승인입니다.",p.expiresAt);
    const j=await s.enqueue(p,q.ref,"revoked");s.provenance.event(reviewer,q.node,"query","qna","revoke","가상 전송 허용의 철회 시험을 수행합니다.",p.expiresAt,seq);
    await workOne(s.jobs,"synthetic-worker",s.handle.bind(s));expect(network).not.toHaveBeenCalled();expect(s.jobs.get(p,j.id).state).not.toBe("succeeded");
  }finally{f.clean();}
});
it("V4-B04: 같은 hash 다른 버전·목적·제공자와 이전 파생물에 해제가 전파되지 않는다",()=>{
  const f=testStore(),g=new PayloadProvenance(f.store),r={...p,roles:["egress_reviewer"] as typeof p.roles};
  try{const old=g.input(p,"same"),current=g.input(p,"same"),summary=g.derive(p,"summary",[old],"summary-v4");
    g.event(r,current,"review","openai","release","현재 입력에 대해서만 허용하는 가상 검토입니다.",p.expiresAt);
    expect(()=>g.check(p,current,"same","review","openai")).not.toThrow();
    expect(()=>g.check(p,summary,"summary","review","openai")).toThrow();expect(()=>g.check(p,current,"same","query","openai")).toThrow();expect(()=>g.check(p,current,"same","review","elsewhere")).toThrow();
    expect(()=>g.event(r,current,"review","openai","grant","이전 해제 사건을 누락하는 잘못된 검토입니다.",p.expiresAt)).toThrow(/충돌/);
  }finally{f.clean();}
});
const policy={host:"files.example.test",pathPrefix:"/public/",maxBytes:1000,timeoutMs:1000};
it("V4-A09: A07 transport 소진은 실제 시도 2회와 retry disposition으로 구분한다",async()=>{
  let now=0,calls=0;
  const transport=createA07Transport(async()=>{calls++;throw new PublicApiError("합성 오류","network",true);},{now:()=>now,sleep:async ms=>{now+=ms;},random:()=>0});
  try{await transport.request(new URL("https://apis.data.go.kr/test?serviceKey=fake"));throw Error("expected failure");}
  catch(e){expect(e).toBeInstanceOf(PublicApiError);expect((e as PublicApiError).retryDisposition).toBe("transport_exhausted");}
  expect(calls).toBe(2);expect(transport.metrics()[0].attempts).toBe(2);expect(now).toBe(5000);
});
it("V4-A10: 서로 다른 프로세스의 같은 계정 permit은 한 호출만 허용한다",async()=>{
  const f=testStore();new CallPermits(f.store);
  const build=resolve(process.env.SHE_TEST_BUILD||"work/v4-typecheck"),id=sha("cross-process-account");
  const script=`import {Store} from ${JSON.stringify(pathToFileURL(resolve(build,"server/store.js")).href)};import {CallPermits} from ${JSON.stringify(pathToFileURL(resolve(build,"server/transport-v4.js")).href)};const store=new Store(${JSON.stringify(f.store.dir)});const fence=new CallPermits(store).acquire(${JSON.stringify(id)},String(process.pid),Date.now(),60000,0);console.log(JSON.stringify({acquired:fence!==undefined}));store.close();`;
  const run=()=>new Promise<boolean>((res,rej)=>{const child=spawn(process.execPath,["--input-type=module","-e",script],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>err+=b);child.on("error",rej);child.on("close",code=>code===0?res(JSON.parse(out).acquired):rej(Error(err||"synthetic child failed")));});
  try{const settled=await Promise.allSettled([run(),run()]);const results=settled.map(r=>{if(r.status==="rejected")throw r.reason;return r.value;});expect(results.filter(Boolean)).toHaveLength(1);}finally{f.clean();}
});
it.each(["127.0.0.1","10.0.0.1","169.254.169.254","192.168.0.1","100.64.0.1","::1","::ffff:127.0.0.1","2001:db8::1"])("V4-A05: 특수주소 %s 차단",ip=>expect(publicIPv4(ip)).toBe(false));
it.each(["http://files.example.test/public/a.pdf","https://evil.test/public/a.pdf","https://user@files.example.test/public/a.pdf","https://files.example.test/public/%2e%2e/a.pdf","https://files.example.test/public/a.pdf?serviceKey=secret"])("V4-A06: 허용 범위 밖 URL %s 차단",url=>expect(()=>attachmentURL(url,policy)).toThrow());
it("V4-A07: 모의 downloader의 실제 연결 주소·서명·범위를 검사하고 직접 렌더하지 않는다",async()=>{
  const f=testStore(),payloads=new ProtectedPayloads(f.store,key),bytes=Buffer.from("%PDF-synthetic"),resolve=async()=>["8.8.8.8"];
  try{const deps={resolve,download:async()=>({bytes,type:"application/pdf",peer:"8.8.8.8",status:200})};
    const a=await collectAttachment(p,payloads,"https://files.example.test/public/a.pdf",policy,deps);expect(a).toMatchObject({parser:"not_supported",directRender:false,complete:true});expect(payloads.get(p,a.id,"attachment")).toEqual(bytes);
    await expect(collectAttachment(p,payloads,"https://files.example.test/public/a.pdf",policy,{...deps,download:async()=>({...await deps.download(),peer:"127.0.0.1"})})).rejects.toThrow();
    await expect(collectAttachment(p,payloads,"https://files.example.test/public/a.pdf",policy,{...deps,download:async()=>({...await deps.download(),bytes:Buffer.from("<html>login</html>")})})).rejects.toThrow();
  }finally{f.clean();}
});

import {it,expect,vi} from "vitest";
import {randomBytes} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {testStore} from "./helpers.js";
import {writer} from "./v2-fixture.js";
import {withCallContext} from "../server/transport-v4.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {probeAdditional,additionalProbeSpecs} from "../server/public-api-probes.js";
import {searchPublic,detailPublic} from "../server/public-apis.js";
import {searchAdditional,detailAdditional} from "../server/additional-apis.js";
import {publicServices,type PublicRecord} from "../shared/public-apis.js";
it("V4-A08: 기존 52 operation 모두 실제 adapter 경유 합성 응답·capture 대조; 공식 specimen 검증은 별도",async()=>{
  const f=testStore(),payloads=new ProtectedPayloads(f.store,{id:"matrix-synthetic",bytes:randomBytes(32)}),seen=new Set<string>();let current="";
  const body=(url:URL):unknown=>{
    const operation=url.pathname.split("/").at(-1)!;
    seen.add(current+":"+operation);
    if(current==="address")return {results:{common:{errorCode:"0",totalCount:0},juso:[]}};
    if(current==="grievance")return operation==="selectApiDiciDetail"?{resultCode:"S00",docMngNo:"123",resultCn:"가상 결정례 본문"}:{response:{resultCode:"S00",totalCnt:0,items:[]}};
    if(current.startsWith("fire-"))return {header:{resultCode:"00",totalCount:0},data:[]};
    if(current==="qna")return operation==="PolicyQnaItem"?{resultCode:"S00",resultData:{faqNo:"123",title:"가상 회신",ansCntnCl:"가상 답변 본문"}}:{resultCode:"S00",resultCount:1,resultList:[{faqNo:"123",title:"가상 회신",dutySctnNm:"tqapttn"}]};
    const items=current==="fire"?[{casno:"67-56-1"}]:current==="msds"?[{chemId:"123",chemNameKor:"가상 물질",itemName:operation,itemDetail:"가상 항목"}]:current==="smart"?[{title:"가상 법령"}]:current==="keco"?[{sbstnId:"123"}]:current==="guide"?[{techGdlnNm:"가상 지침"}]:[];
    return {response:{header:{resultCode:"00"},body:{totalCount:items.length,items:{item:items},categorycount:{"1":items.length}}}};
  };
  vi.stubGlobal("fetch",vi.fn(async(input:URL)=>new Response(JSON.stringify(body(new URL(input))))));
  const run=async<T>(service:string,fn:()=>Promise<T>)=>{current=service;return withCallContext({store:f.store,payloads,principal:writer,job:"matrix",service,queryRef:"synthetic",deadline:Date.now()+120000,account:()=>({group:service,intervalMs:0}),authorize:()=>{}},fn);};
  try{
    for(const id of Object.keys(additionalProbeSpecs))await run(id,()=>probeAdditional(id,"synthetic-key"));
    for(const s of publicServices){const r=await run(s.id,()=>searchPublic(s.id,"synthetic-key",{keyword:"67-56-1",mode:s.id==="fire"?"list":s.modes[0][0],page:1}));
      if(["qna","fire","msds"].includes(s.id))await run(s.id,()=>detailPublic(r.items[0],"synthetic-key"));
    }
    await run("grievance",()=>detailAdditional({service:"grievance",fields:{docMngNo:"123"},query:{keyword:"",mode:"search",page:1}} as unknown as PublicRecord,"synthetic-key"));
    await run("land-use",()=>searchAdditional("land-use","synthetic-key",{keyword:"공장",mode:"search",page:1,filters:{operation:"restrictions",areaCd:"41590",ucodeList:"TEST"}}));
    const registry=JSON.parse(readFileSync("docs/implementation-v3/api-registry.json","utf8"));
    const operations=registry.entries.flatMap((s:any)=>s.operations.map((o:any)=>({id:s.id+":"+o.operation,endpoint:o.endpoint,syntheticAdapterExecuted:seen.has(s.id+":"+o.operation),officialSpecimenValidated:false,schemaCoverage:"synthetic-contract-only"})));
    expect(operations).toHaveLength(52);expect(operations.filter((o:any)=>!o.syntheticAdapterExecuted)).toEqual([]);
    expect((f.store.db.prepare("SELECT count(*) n FROM v4_captures").get() as any).n).toBe(52);
    mkdirSync("work",{recursive:true});writeFileSync("work/v4-operation-matrix.json",JSON.stringify({operations,liveCalls:0,legalApproval:false},null,2));
  }finally{f.clean();vi.unstubAllGlobals();}
});

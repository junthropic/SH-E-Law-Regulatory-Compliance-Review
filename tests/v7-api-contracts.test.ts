import {afterEach,expect,it,vi} from "vitest";
import {searchPublic,detailPublic} from "../server/public-apis.js";
import {searchAdditional} from "../server/additional-apis.js";
// v7 T3: checks backed ONLY by the official flat request/response tables in docs/implementation-v6/official-contract-tables.json
// (operation paths, official parameter names/required flags, official item field names). The response wrappers used in the
// synthetic replies below (resultList, resultData, header/body/items, header/data) are the app's current decoder shape and are
// NOT official; types, wrappers, single/empty representation and success/empty codes stay unknown and are not asserted.
// Not covered: address:addrLinkApi.do (no official table in the repo); the fire-* key name (official "ServiceKey" vs app "serviceKey")
// is a recorded conflict and is not asserted either way.
const key="synthetic-contract-key";
const json=(body:unknown)=>new Response(JSON.stringify(body));
afterEach(()=>vi.unstubAllGlobals());
function capture(reply:(url:URL)=>unknown){const urls:URL[]=[];vi.stubGlobal("fetch",vi.fn(async(u:URL)=>{const url=new URL(String(u));urls.push(url);return json(reply(url));}));return urls;}

it("V7-T01 qna:PolicyQnaList — 공식 경로·필수 firstIndex/recordCountPerPage·type/searchType 값·공식 항목명 보존",async()=>{
  const urls=capture(()=>({resultCode:"S00",resultCount:1,resultList:[{faqNo:"101",title:"가상 질의",ancName:"가상 기관",ancCode:"1234567",regDate:"20201109174438",dutySctnNm:"tqapttn"}]}));
  const r=await searchPublic("qna",key,{keyword:"가상",mode:"2",page:3});
  const u=urls[0];expect(u.pathname.endsWith("/PolicyQnaList")).toBe(true);
  expect(u.searchParams.get("firstIndex")).toBe("3");expect(u.searchParams.has("recordCountPerPage")).toBe(true);
  expect(["1","2","3"]).toContain(u.searchParams.get("type"));expect(["1","2"]).toContain(u.searchParams.get("searchType"));
  expect(r.items[0].fields).toMatchObject({faqNo:"101",ancName:"가상 기관",ancCode:"1234567",regDate:"20201109174438",dutySctnNm:"tqapttn"});
  expect(r.items[0].canDetail).toBe(true);
  await expect(searchPublic("qna",key,{keyword:"가".repeat(101),mode:"1",page:1})).rejects.toThrow(); // official keyword size 100
});
it("V7-T02 qna:PolicyQnaItem — 목록 행의 faqNo·dutySctnNm을 그대로 보내고 공식 상세 항목명을 보존",async()=>{
  const urls=capture(url=>url.pathname.endsWith("/PolicyQnaList")
    ?{resultCode:"S00",resultCount:1,resultList:[{faqNo:"101",title:"가상 질의",dutySctnNm:"tqaplcy"}]}
    :{resultCode:"S00",resultData:{faqNo:"101",dutySctnNm:"tqaplcy",qnaTitl:"가상 상세 제목",qstnCntnCl:"가상 질문",ansCntnCl:"가상 답변",deptName:"가상 부서",regDate:"20201109"}});
  const list=await searchPublic("qna",key,{keyword:"가상",mode:"1",page:1}),detail=await detailPublic(list.items[0],key);
  const u=urls[1];expect(u.pathname.endsWith("/PolicyQnaItem")).toBe(true);
  expect(u.searchParams.get("faqNo")).toBe("101");expect(u.searchParams.get("dutySctnNm")).toBe("tqaplcy");
  expect(detail.title).toBe("가상 상세 제목");
  expect(detail.fields).toMatchObject({qstnCntnCl:"가상 질문",ansCntnCl:"가상 답변",deptName:"가상 부서",regDate:"20201109"});
});
it("V7-T03 fire:getMaterialList — 공식 경로·ServiceKey·pageNo/numOfRows, casNo 없음, 공식 항목명 보존",async()=>{
  const urls=capture(()=>({response:{header:{resultCode:"00"},body:{totalCount:1,items:{item:[{casno:"71-43-2",chemicalname:"벤젠",chemicalno:"00001",hazardmaterialclass:"제4류",unno:"1114"}]}}}}));
  const r=await searchPublic("fire",key,{keyword:"",mode:"list",page:2});
  const u=urls[0];expect(u.pathname.endsWith("/1661000/materialInfoSvc/getMaterialList")).toBe(true);
  expect(u.searchParams.get("ServiceKey")).toBe(key);expect(u.searchParams.get("pageNo")).toBe("2");
  expect(u.searchParams.get("numOfRows")!.length).toBeLessThanOrEqual(2);expect(u.searchParams.has("casNo")).toBe(false);
  expect(r.items[0].title).toBe("벤젠");expect(r.items[0].fields).toMatchObject({casno:"71-43-2",chemicalno:"00001",hazardmaterialclass:"제4류",unno:"1114"});
});
it("V7-T04 fire:getMaterialInfo — 공식 필수 casNo·pageNo·numOfRows, totalCount 없는 응답 허용, 잘못된 CAS는 호출 전 거부",async()=>{
  const urls=capture(()=>({response:{header:{resultCode:"00"},body:{item:{casno:"71-43-2",materialkorname:"벤젠",materialengname:"Benzene",hazardmaterialclass:"제4류",unno:"1114"}}}}));
  const r=await searchPublic("fire",key,{keyword:"71-43-2",mode:"cas",page:1});
  const u=urls[0];expect(u.pathname.endsWith("/getMaterialInfo")).toBe(true);
  for(const name of ["ServiceKey","casNo","pageNo","numOfRows"])expect(u.searchParams.has(name)).toBe(true);
  expect(u.searchParams.get("casNo")).toBe("71-43-2");
  expect(r.items[0].title).toBe("벤젠");expect(r.items[0].fields).toMatchObject({materialengname:"Benzene",hazardmaterialclass:"제4류",unno:"1114"});
  const before=urls.length;await expect(searchPublic("fire",key,{keyword:"71-43-X",mode:"cas",page:1})).rejects.toThrow();expect(urls.length).toBe(before);
});
it("V7-T05 chemical-accidents:csclist — 공식 경로·ServiceKey·pageNo/numOfRows, yyyy는 선택·4자리, 공식 항목명 보존",async()=>{
  const items=[{dataNo:"2020-001",cscDe:"20200101",cscTy:"누출",area:"가상 지역",cause:"가상 원인",chem:"가상 물질",place:"가상 장소",summary:"가상 개요"}];
  const urls=capture(()=>({response:{header:{resultCode:"00"},body:{totalCount:1,items:{item:items}}}}));
  const r=await searchAdditional("chemical-accidents",key,{keyword:"2025",mode:"search",page:1});
  const u=urls[0];expect(u.pathname.endsWith("/1480802/iciscsc/csclist")).toBe(true);
  expect(u.searchParams.get("ServiceKey")).toBe(key);expect(u.searchParams.get("yyyy")).toBe("2025");
  expect(u.searchParams.has("pageNo")).toBe(true);expect(u.searchParams.has("numOfRows")).toBe(true);
  expect(r.items[0].fields).toMatchObject(items[0]);
  await searchAdditional("chemical-accidents",key,{keyword:"",mode:"search",page:1});expect(urls[1].searchParams.has("yyyy")).toBe(false);
  const before=urls.length;await expect(searchAdditional("chemical-accidents",key,{keyword:"25",mode:"search",page:1})).rejects.toThrow();expect(urls.length).toBe(before);
});
it.each([
  ["fire-approval","/B552486/opnFsuplAprv/opnFsuplAprv01",{ctfcnYmd:"2020-11-02"}],
  ["fire-revocation","/B552486/opnFsuplRtrcn/opnFsuplRtrcn01",{rtrcnYmd:"2017-07-25",dspsCn:"가상 취소사유"}],
] as const)("V7-T06 %s — 공식 경로·필수 fromAprv/toAprv(8자리)/gdsClCd·선택 gdsCd(5자리)·공식 항목명 보존 (인증키 이름은 미결로 검사 안 함)",async(id,path,extra)=>{
  const row={cmpyNm:"가상 회사",gdsNm:"가상 품목",ctfcnNo:"가상-001",ctfcnFomNm:"가상 형식",...extra};
  const urls=capture(()=>({header:{resultCode:"00",totalCount:1},data:[row]}));
  const filters={fromAprv:"2020-01-01",toAprv:"2021-02-18",gdsClCd:"01"};
  const r=await searchAdditional(id,key,{keyword:"04600",mode:"search",page:1,filters});
  const u=urls[0];expect(u.pathname.endsWith(path)).toBe(true);
  expect(u.searchParams.get("fromAprv")).toBe("20200101");expect(u.searchParams.get("toAprv")).toBe("20210218");
  expect(u.searchParams.get("gdsClCd")).toBe("01");expect(u.searchParams.get("gdsCd")).toBe("04600");
  expect(u.searchParams.has("pageNo")).toBe(true);expect(u.searchParams.has("numOfRows")).toBe(true);
  expect(r.items[0].title).toBe("가상 품목");expect(r.items[0].fields).toMatchObject(row);
  await searchAdditional(id,key,{keyword:"",mode:"search",page:1,filters});expect(urls[1].searchParams.has("gdsCd")).toBe(false);
  const before=urls.length;
  await expect(searchAdditional(id,key,{keyword:"",mode:"search",page:1,filters:{fromAprv:"2020-01-01",toAprv:"2021-02-18"}})).rejects.toThrow();
  await expect(searchAdditional(id,key,{keyword:"046",mode:"search",page:1,filters})).rejects.toThrow();
  expect(urls.length).toBe(before);
});

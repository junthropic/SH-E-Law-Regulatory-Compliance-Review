import {it,expect,vi,afterEach} from "vitest";
import {randomBytes} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {testStore,request} from "./helpers.js";
import {writer} from "./v2-fixture.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {ProtectedTraceReader} from "../server/trace-reader-v7.js";
import {LegacyBridge} from "../server/legacy-bridge-v3.js";
import {newReview} from "../server/reviews.js";
import {ProtectedCollection} from "../server/collection-v4.js";
import {MigrationResume} from "../server/migration-resume-v6.js";
import {CollectionJournal} from "../server/collection-journal-v2.js";
import {backupGeneration,backupClassification} from "../server/backup-v5.js";
import {sha} from "../server/store.js";
// Synthetic key, actors and grants for an isolated store only. Plaintext originals are never deleted here.
const key={id:"synthetic-v7-migration",bytes:randomBytes(32)},expiry="2099-01-01T00:00:00Z";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:["writer","egress_reviewer","collection_operator","backup_operator"] as typeof writer.roles};
afterEach(()=>{vi.unstubAllGlobals();});
const traced=(f:ReturnType<typeof testStore>)=>{const r=newReview({...request(),prompt:"가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토"});f.store.saveReview(r);new LegacyBridge(f.store,"v7").attach(p,r,"project");f.store.saveReview(r);return r;};
const shadowCount=(f:ReturnType<typeof testStore>)=>(f.store.db.prepare("SELECT count(*) n FROM v3_shadow").get() as {n:number}).n;

it("V7-M01: 합성 검토 trace를 보호 복사·대조한 뒤 읽기를 보호 경로로 전환하고 평문 원본은 보존한다",()=>{
  const f=testStore(),reader=new ProtectedTraceReader(new ProtectedPayloads(f.store,key));
  try{const r=traced(f),before=(f.store.db.prepare("SELECT body FROM v3_shadow WHERE review=?").get(r.id) as {body:string}).body;
    expect(reader.trace(p,r.id).source).toBe("legacy"); // not migrated yet
    const route=reader.migrate(p,r.id);expect(route).toMatchObject({readSwitched:true,plaintextRetained:true,plaintextRemovalComplete:false,deletionAuthorized:false,hash:sha(before)});
    const read=reader.trace(p,r.id);expect(read.source).toBe("protected");expect(read.trace).toEqual(JSON.parse(before));
    expect(shadowCount(f)).toBe(1);expect((f.store.db.prepare("SELECT body FROM v3_shadow WHERE review=?").get(r.id) as {body:string}).body).toBe(before);
    expect(reader.migrate(p,r.id).migrationId).toBe(route.migrationId); // idempotent
  }finally{f.clean();}
});
it("V7-M02: 전환 후에는 보호 사본이 없거나 평문이 바뀌면 평문으로 대체하지 않고 거부한다",()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),reader=new ProtectedTraceReader(v);
  try{const r=traced(f),route=reader.migrate(p,r.id);
    f.store.db.prepare("UPDATE v3_shadow SET body=? WHERE review=?").run(JSON.stringify({...JSON.parse((f.store.db.prepare("SELECT body FROM v3_shadow WHERE review=?").get(r.id) as {body:string}).body),asOf:"2026-10-11"}),r.id);
    expect(()=>reader.trace(p,r.id)).toThrow("재이관 필요");
    const r2=traced(f),route2=reader.migrate(p,r2.id);
    expect(f.store.db.prepare("DELETE FROM v4_payloads WHERE id=?").run(route2.ref).changes).toBe(1);
    expect(()=>reader.trace(p,r2.id)).toThrow("보호 자료 없음"); // no plaintext fallback even though v3_shadow still has the row
    expect(shadowCount(f)).toBe(2);
    expect(route.plaintextRetained).toBe(true);
  }finally{f.clean();}
});
it("V7-M03: 다른 영역은 이관·읽기 불가, 실제(비합성) 주체는 이번 이관 대상이 아니다",()=>{
  const f=testStore(),reader=new ProtectedTraceReader(new ProtectedPayloads(f.store,key));
  try{const r=traced(f);reader.migrate(p,r.id);
    expect(()=>reader.trace({...p,tenant:"other"},r.id)).toThrow();
    expect(()=>reader.migrate({...p,tenant:"other"},r.id)).toThrow();
    expect(()=>reader.migrate({...p,synthetic:false},r.id)).toThrow("합성 자료만");
  }finally{f.clean();}
});
it("V7-M04: 이관된 이전 v3 작업은 평문 재개·결과 읽기를 막고 상태 조회와 이관 작업은 유지한다",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),s=new ProtectedCollection(f.store,v,()=>p,async()=>"synthetic-key",()=>({group:"synthetic",intervalMs:0})),m=new MigrationResume(s);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({response:{header:{resultCode:"00"},body:{totalCount:0,items:[],pageNo:2,numOfRows:10}}}))));
  try{const old=s.jobs.enqueue(p,"old-v3-v7",{provider:"waste-companies",operation:"search",query:{keyword:"가상",mode:"search",page:2},credentialRef:"legacy-reference",schemaVersion:"v3-1",budgetMs:180000});s.jobs.control(p,old.id,"pause");
    expect(s.jobs.units(p,old.id)).toEqual([]); // before migration: legacy read allowed
    const b=await m.prepare(p,old.id);
    expect(()=>s.jobs.control(p,old.id,"resume")).toThrow("이관된 작업");
    expect(()=>s.jobs.units(p,old.id)).toThrow("이관된 작업");
    expect(s.jobs.get(p,old.id).state).toBe("paused");
    expect(Array.isArray(s.jobs.units(p,b.jobId))).toBe(true);
    expect(f.store.db.prepare("SELECT count(*) n FROM v3_jobs WHERE id=?").get(old.id)).toEqual({n:1}); // plaintext row kept
  }finally{f.clean();}
},30000);
it("V7-B02: 서버 코드의 모든 테이블은 백업 분류가 있고 미분류가 없다",()=>{
  const names=new Set<string>();
  for(const file of readdirSync("server").filter(n=>n.endsWith(".ts")))for(const m of readFileSync("server/"+file,"utf8").matchAll(/CREATE (?:VIRTUAL )?TABLE IF NOT EXISTS ([a-z0-9_]+)/g))names.add(m[1]);
  expect(names.size).toBeGreaterThanOrEqual(45);
  expect([...names].filter(n=>backupClassification(n)==="unclassified")).toEqual([]);
  expect(backupClassification("v2_collection_jobs")).toBe("excluded_public_cache");
  expect(backupClassification("v2_collection_pages")).toBe("excluded_public_cache");
  expect(backupClassification("v7_trace_routes")).toBe("backed_up");
});
it("V7-B03: 공개 캐시 테이블은 manifest에 '공개 캐시 — 제외(재수집 가능)'로 기록되고 누락으로 세지 않는다",async()=>{
  const f=testStore();
  try{new CollectionJournal(f.store);const r=traced(f);new ProtectedTraceReader(new ProtectedPayloads(f.store,key)).migrate(p,r.id);
    const backup=await backupGeneration(f.store,p,key,sha("v7-b03"));
    expect(backup.manifest.excludedTables).toEqual([{table:"v2_collection_jobs",classification:"공개 캐시 — 제외(재수집 가능)"},{table:"v2_collection_pages",classification:"공개 캐시 — 제외(재수집 가능)"}]);
    expect(backup.manifest.omissions.filter((o:string)=>o.startsWith("미분류 테이블"))).toEqual([]);
    expect(backup.manifest.tableInventory).toContain("v7_trace_routes");
  }finally{f.clean();}
},60000);

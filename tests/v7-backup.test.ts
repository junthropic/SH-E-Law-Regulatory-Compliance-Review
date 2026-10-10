import {it,expect} from "vitest";
import {randomBytes} from "node:crypto";
import {join} from "node:path";
import {testStore} from "./helpers.js";
import {writer,reviewer} from "./v2-fixture.js";
import {safetyManagerFixture} from "./v7-fixture.js";
import {SafetyManagerCases} from "../server/safety-manager-cases-v7.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {PayloadProvenance} from "../server/provenance-v4.js";
import {ingestDocument} from "../server/documents.js";
import {backupGeneration,restoreGeneration,openGeneration} from "../server/backup-v5.js";
import {sha} from "../server/store.js";
// Synthetic key, actors and grants for an isolated store only.
const key={id:"synthetic-v7-backup",bytes:randomBytes(32)},expiry="2099-01-01T00:00:00Z";
const p={...writer,validFrom:"2020-01-01T00:00:00Z",expiresAt:expiry,roles:["writer","egress_reviewer","backup_operator"] as typeof writer.roles};
const local=(g:PayloadProvenance,node:string)=>{for(const purpose of ["read","document"])g.event(p,node,purpose,"local","release","격리 백업 시험의 명시적 host 합성 권한입니다.",expiry);};

it("V7-B01: 안전관리자 사실 후보는 백업 manifest에 분류되고, 복원하면 독립 검토를 다시 요구하는 새 버전이 된다",async()=>{
  const f=testStore(),v=new ProtectedPayloads(f.store,key),svc=new SafetyManagerCases(v),target=join(f.store.dir,"v7-isolated-restore");
  try{
    const d=await ingestDocument(f.store,"v7-backup.txt",Buffer.from(JSON.stringify(safetyManagerFixture()))),bound=svc.records.bindDocument(p,d.id);local(svc.records.graph,bound.node);
    const first=svc.fromDocument(p,bound.id);local(svc.records.graph,first.own);
    const checked=svc.review({...reviewer,roles:[...reviewer.roles,"writer","case_reviewer"]},first.id,first.version,"가상 사업장 사실을 독립 합성 actor로 확인했습니다.");
    const backup=await backupGeneration(f.store,p,key,sha("v7-source"));
    expect(backup.manifest.tableInventory).toEqual(expect.arrayContaining(["v7_safety_manager_cases","v7_safety_manager_current"]));
    expect(backup.manifest.omissions.filter((o:string)=>o.includes("v7_"))).toEqual([]);
    const restored=restoreGeneration(target,p,key,backup.archive),fresh=openGeneration(target);
    try{
      expect(restored.currentApprovals).toBe(false);
      const row=fresh.db.prepare("SELECT version,payload FROM v7_safety_manager_cases WHERE id=? AND tenant=? AND synthetic=? ORDER BY version DESC LIMIT 1").get(first.id,p.tenant,+p.synthetic) as {version:number;payload:string};
      const data=JSON.parse(new ProtectedPayloads(fresh,key).get(p,row.payload,"unit").toString());
      expect(row.version).toBe(checked.version+1);
      expect(data).toMatchObject({version:checked.version+1,review:null,restored:true,legalApproval:false});
      expect(data.input.independentFactsReviewed).toBeNull(); // restored facts need a new independent review
      expect(data.historicalReview.actor).toBe(reviewer.id);
      const current=JSON.parse((fresh.db.prepare("SELECT body FROM v7_safety_manager_current WHERE id=?").get(first.id) as {body:string}).body);
      expect(current.version).toBe(checked.version+1);
    }finally{fresh.close();}
  }finally{f.clean();}
},30000);

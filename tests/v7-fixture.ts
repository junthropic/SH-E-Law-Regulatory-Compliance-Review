import {SafetyManagerInput,type SafetyManagerCase} from "../server/safety-manager-v7.js";
// Synthetic site only. Legal basis date 2026-10-08 (fixed by the v7 spec); evaluation date and event dates are explicit
// so results do not depend on the day the suite runs.
export const AS_OF="2026-10-15";
type Manager=SafetyManagerCase["managers"][number];
export const manager=(over:Partial<Manager>={})=>({id:"sm-1",appointedOn:"2026-09-01",appointmentEvidence:"document" as const,path:"2" as const,grade:"기사" as const,qualificationEvidence:"document" as const,pathFactsReviewed:true,...over});
export function safetyManagerFixture(over:Record<string,unknown>={}):SafetyManagerCase {
  return SafetyManagerInput.parse({
    subject:"synthetic-site",site:"synthetic-site",asOf:AS_OF,legalBasisDate:"2026-10-08",scopeReviewed:true,
    annexRow:32,rowReviewed:true,regularWorkers:120,workersBasisReviewed:true,
    contracting:{relation:"none",aggregationReviewed:null,primeDedicatedManager:null},
    joint:{claimed:false,sameEmployer:null,sameSigungu:null,within15km:null,combinedWorkers:null,combinedAmount100M:null,reviewed:null},
    entrustment:{claimed:false,agencyDesignated:null,start:null,end:null,reviewed:null},
    managers:[manager()],nonperformanceProven:[],independentFactsReviewed:true,...over,
  });
}
export const construction=(amount100M:number,over:Record<string,unknown>={})=>({annexRow:49,regularWorkers:null,workersBasisReviewed:null,construction:{amount100M,civilEngineering:false,amountReviewed:true,phase:"middle",...over}});

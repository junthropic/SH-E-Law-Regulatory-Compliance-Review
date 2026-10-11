import {SafetyManagerInput,type SafetyManagerCase} from "../server/safety-manager-v7.js";
// Synthetic site only. Legal basis date 2026-10-08 (fixed by the v7 spec); evaluation date and event dates are explicit
// so results do not depend on the day the suite runs.
export const AS_OF="2026-10-15";
type Manager=SafetyManagerCase["managers"][number];
export const manager=(over:Partial<Manager>={})=>({id:"sm-1",appointedOn:"2026-09-01",appointmentEvidence:"document" as const,path:"2" as const,grade:"기사" as const,qualificationEvidence:"document" as const,pathFactsReviewed:true,
  assignment:"dedicated" as const,dutyAllocationEvidence:"document" as const,assignmentReviewed:true,...over});
// Event dates are fixed: appointment 2026-09-01 (Tue) → deadline 2026-09-15 (Tue); previous manager dismissed 2026-08-20 (Thu) → 2026-09-03 (Thu).
export const filing=(receivedOn:string|null,form:"annex2"|"annex3"|"annex3-2",over:object={})=>({evidence:"receipt" as const,receivedOn,office:"competent" as const,formUsed:form,formFieldsReviewed:true,...over});
export const events=()=>[
  {id:"ev-appoint",kind:"appointment" as const,date:"2026-09-01",managerId:"sm-1",filing:filing("2026-09-10","annex2"),reviewed:true},
  {id:"ev-dismiss",kind:"dismissal" as const,date:"2026-08-20",managerId:"sm-0",filing:filing("2026-08-28","annex3-2"),reviewed:true},
];
export const performance=()=>({items:[1,2,3,4,5,6,7,8,9,10].map(item=>({item,applies:true,evidence:"record" as const,reviewed:true})),workPatternConsidered:true,reviewed:true});
export function safetyManagerFixture(over:Record<string,unknown>={}):SafetyManagerCase {
  return SafetyManagerInput.parse({
    subject:"synthetic-site",site:"synthetic-site",asOf:AS_OF,legalBasisDate:"2026-10-08",scopeReviewed:true,
    annexRow:32,rowReviewed:true,regularWorkers:120,workersBasisReviewed:true,
    contracting:{relation:"none",aggregationReviewed:null,primeDedicatedManager:null},
    joint:{claimed:false,sameEmployer:null,sameSigungu:null,within15km:null,combinedWorkers:null,combinedAmount100M:null,reviewed:null},
    entrustment:{claimed:false,agencyDesignated:null,start:null,end:null,reviewed:null},
    managers:[manager()],events:events(),performance:performance(),nonperformanceProven:[],independentFactsReviewed:true,...over,
  });
}
export const construction=(amount100M:number,over:Record<string,unknown>={})=>({annexRow:49,regularWorkers:null,workersBasisReviewed:null,construction:{amount100M,civilEngineering:false,amountReviewed:true,phase:"middle",...over}});

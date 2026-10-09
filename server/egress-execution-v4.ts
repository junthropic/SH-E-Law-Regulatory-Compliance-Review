import { AsyncLocalStorage } from "node:async_hooks";
import { PayloadProvenance } from "./provenance-v4.js";
import type { Principal } from "./compliance-v2.js";
import { EgressDenied } from "./egress-v3.js";
import { SendAdmissions } from "./admission-v5.js";
export type Execution = {gate:PayloadProvenance;principal:Principal;parents:string[]};
const execution=new AsyncLocalStorage<Execution>();
export const withPayloadExecution=<T>(ctx:Execution,fn:()=>Promise<T>)=>execution.run(ctx,fn);
export function requirePayloadRead(){const c=execution.getStore();if(!c)throw new EgressDenied();for(const parent of c.parents)c.gate.checkReference(c.principal,parent,"read","local");}
// The caller supplies exact bytes after normalization/serialization. Parents come from trusted host context.
export function checkSerializedPayload(serialized:string,purpose:string,provider:string,transformer:string,readRequired=false) {
  const c=execution.getStore();if(!c)throw new EgressDenied();
  readRequired ||= c.parents.some(parent=>c.gate.needsManagedRead(c.principal,parent));
  const node=c.gate.derive(c.principal,serialized,c.parents,transformer);
  if(readRequired)requirePayloadRead();
  c.gate.check(c.principal,node,serialized,purpose,provider);
  const recheck=()=>{if(readRequired)requirePayloadRead();return c.gate.check(c.principal,node,serialized,purpose,provider);};
  return {node,recheck,async send<T>(operation:(signal:AbortSignal)=>Promise<T>,timeoutMs=180000) {
    const admitted=new SendAdmissions(c.gate.store).admit(c.principal,serialized,recheck,timeoutMs);
    try{admitted.start();const result=await operation(admitted.signal);admitted.signal.throwIfAborted();admitted.finish(true);return result;}
    catch(e){admitted.finish(false);throw e;}
  },result(output:string){recheck();const derived=c.gate.derive(c.principal,output,[node],"received-result-v6");c.parents=[...new Set([...c.parents,derived])];return derived;}};
}
export const hasPayloadExecution=()=>!!execution.getStore();
export const currentPayloadExecution=()=>execution.getStore();

import {it,expect,vi} from "vitest";
import {randomBytes} from "node:crypto";
import {testStore,request} from "./helpers.js";
import {writer} from "./v2-fixture.js";
import {ProtectedPayloads} from "../server/protected-payload-v4.js";
import {PayloadProvenance} from "../server/provenance-v4.js";
import {withPayloadExecution} from "../server/egress-execution-v4.js";
import {extractIntake} from "../server/intake.js";
import {ChatGPTAuth} from "../server/auth.js";
import {Vault} from "../server/vault.js";
import {backupV4Layer,restoreV4Layer} from "../server/backup-v4.js";
import {queryMcp} from "../server/mcp.js";
const expires="2099-01-01T00:00:00Z";
it("V4-B06: 실제 intake 정규화 payload 등록·전송 직전 철회·MCP context 누락은 outbound 0회",async()=>{
  const f=testStore(),gate=new PayloadProvenance(f.store),network=vi.fn(),r={...request(),useAi:true,model:"synthetic"},auth=new ChatGPTAuth(f.store,new Vault(f.store.dir,true));
  vi.stubGlobal("fetch",network);
  try{
    const node=gate.input(writer,JSON.stringify(r)),reviewer={...writer,roles:["egress_reviewer"] as typeof writer.roles};
    const seq=gate.event(reviewer,node,"extract","openai","release","가상 입력의 분석을 위한 모의 전송 해제입니다.",expires);
    vi.spyOn(auth,"accessToken").mockImplementation(async()=>{gate.event(reviewer,node,"extract","openai","revoke","토큰 준비 도중의 가상 철회 시험입니다.",expires,seq);return "synthetic-token";});
    await expect(withPayloadExecution({gate,principal:writer,parents:[node]},()=>extractIntake(auth,r))).rejects.toThrow(/외부 전송/);
    expect((f.store.db.prepare("SELECT count(*) n FROM v4_provenance").get() as any).n).toBe(2);
    await expect(queryMcp("synthetic-key","search_law",{query:"private"})).rejects.toThrow(/외부 전송/);expect(network).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();f.clean();}
});
function init(f:ReturnType<typeof testStore>,key:{id:string,bytes:Buffer}) {
  const payloads=new ProtectedPayloads(f.store,key),gate=new PayloadProvenance(f.store);
  f.store.db.exec("CREATE TABLE IF NOT EXISTS v4_captures(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,job TEXT,body TEXT)");
  return {payloads,gate};
}
it("V4-B07: v4 보호자료 계층 백업은 키 제외·복원 거부 기본값·실패 원자성을 보존한다",()=>{
  const f=testStore(),target=testStore(),key={id:"synthetic-backup",bytes:randomBytes(32)},a=init(f,key),b=init(target,key),operator={...writer,roles:["writer","backup_operator"] as typeof writer.roles};
  try{
    const id=a.payloads.put(writer,"raw",Buffer.from("secret-fixture-body"),100000),node=a.gate.input(writer,"sensitive-query");
    a.gate.event({...writer,roles:["egress_reviewer"]},node,"query","qna","release","가상 자료 전송을 허용하는 시험 승인입니다.",expires);
    const archive=backupV4Layer(f.store,operator,key);expect(JSON.stringify(archive)).not.toContain("secret-fixture-body");expect(JSON.stringify(archive)).not.toContain(key.bytes.toString("base64"));expect(archive.completeApplicationBackup).toBe(false);
    expect(()=>restoreV4Layer(target.store,operator,key,archive,()=>{throw Error("fault");})).toThrow("fault");expect((target.store.db.prepare("SELECT count(*) n FROM v4_payloads").get() as any).n).toBe(0);
    expect(restoreV4Layer(target.store,operator,key,archive)).toMatchObject({jobsStarted:0,egress:"denied",completeApplicationRestore:false});
    expect(b.payloads.get(writer,id,"raw").toString()).toBe("secret-fixture-body");expect(()=>b.gate.check(writer,node,"sensitive-query","query","qna")).toThrow();
    expect(()=>restoreV4Layer(target.store,operator,key,archive)).toThrow(/비어/);
  }finally{f.clean();target.clean();}
});

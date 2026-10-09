import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,cpSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const out="docs/implementation-v5",read=p=>JSON.parse(readFileSync(p,"utf8")),hash=x=>createHash("sha256").update(x).digest("hex"),write=(p,x)=>writeFileSync(join(out,p),JSON.stringify(x,null,2)+"\n");
const baseline=read(out+"/baseline.json"),execution=read("work/v5-audit/isolated-validation.json"),tests=read("work/v5-audit/final-tests.json");
const paths=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const q=join(p,e.name);if(e.isDirectory())walk(q);else if(/\.(ts|tsx|css|mjs|py|json|html|svg|pem)$/.test(e.name))paths.push(q.replaceAll("\\","/"));}}
for(const dir of ["server","shared","src","tests","scripts","public","data"])if(existsSync(dir))walk(dir);
paths.push("package.json","package-lock.json","tsconfig.json","tsconfig.server.json","vite.config.ts","vitest.config.ts","index.html","AGENTS.md");
const files=[...new Set(paths)].sort().map(path=>({path,hash:hash(readFileSync(path))}));
const meta={head:execFileSync("git",["-c",`safe.directory=${resolve('.').replaceAll('\\','/')}`,"rev-parse","HEAD"],{windowsHide:true,encoding:"utf8"}).trim(),sourceDigest:hash(JSON.stringify(files)),at:new Date().toISOString(),runtime:process.version,scope:"격리 구현·공식 공개 자료 조사·합성 시험. 법적 승인·실제 사업장·운영 완료 아님"};
write("source-manifest.json",{...meta,files,changed:files.filter(f=>baseline.files.some(b=>b.path===f.path&&b.hash!==f.hash)).map(f=>f.path),added:files.filter(f=>!baseline.files.some(b=>b.path===f.path)).map(f=>f.path)});
const frozen=baseline.frozen.map(f=>({...f,actual:hash(readFileSync(f.path)),unchanged:hash(readFileSync(f.path))===f.hash}));
write("ui-freeze.json",{...meta,count:29,files:frozen,changed:frozen.filter(f=>!f.unchanged).length,productionAccess:0,realKeysUsed:0,deployed:0,restarted:0,activated:0});
const mismatches=files.filter(f=>!existsSync(join(execution.directory,f.path))||hash(readFileSync(join(execution.directory,f.path)))!==f.hash).map(f=>f.path);
write("build-verification.json",{...meta,directory:execution.directory,mismatches,operationalDataAccess:0});
const rows=tests.testResults.flatMap(r=>r.assertionResults.map(t=>({file:relative(execution.directory,r.name).replaceAll("\\","/"),name:t.fullName,status:t.status,duration:t.duration}))),old=read("docs/implementation-v4/test-inventory.json").rows;
const preserved=old.filter(o=>rows.some(r=>r.file===o.file&&r.name===o.name&&r.status==="passed")).length;
write("test-inventory.json",{...meta,total:rows.length,passed:tests.numPassedTests,failed:tests.numFailedTests,baseline:380,preservedBaseline:preserved,newTests:rows.filter(r=>r.name.startsWith("V5-")),rows});
mkdirSync(out+"/logs",{recursive:true});
for(const f of readdirSync("work/v5-audit").filter(x=>/\.log$/.test(x)||/^v5-validation-.*\.json$/.test(x)||x==="baseline-failed-tests.json"))cpSync("work/v5-audit/"+f,out+"/logs/"+f);
write("execution.json",{...meta,...execution,tests:{total:rows.length,passed:tests.numPassedTests,failed:tests.numFailedTests},oldBrowserCount:8,newBrowserCount:1,actualApiKeyCalls:0});
for(const v of ["v3","v4","v5"]){const f=join(execution.directory,`playwright-report/${v}-checkpoints.json`);if(existsSync(f))cpSync(f,join(out,`${v}-browser-checkpoints.json`));}
cpSync(join(execution.directory,"work/v5-backup-manifest.json"),join(out,"backup-manifest.json"));
const ac=read("docs/implementation-v4/acceptance-map.json");write("acceptance-map.json",{...meta,originalCount:72,rows:ac.rows,additional:rows.filter(r=>r.name.startsWith("V5-")),note:"기존 72개 인수 ID·미검증 상태 보존. 추가 시험을 실제 사업장 인수로 승격하지 않음"});
const matrix=read(join(execution.directory,"work/v4-operation-matrix.json"));
const operations=matrix.operations.map(o=>{const id=o.endpoint.endsWith("/getWstdspBzentyInfo")?"a07":o.endpoint.endsWith("/getlist")&&o.endpoint.includes("wstdspGrndsInfo")?"a08":null;return {...o,
  evidence:{synthetic_contract:o.syntheticAdapterExecuted,official_schema:!!id,official_document_example:false,independent_observed_response:false,authorized_live_observed:false},
  officialSchema:id?{path:`official/${id}-schema.json`,hash:hash(readFileSync(`${out}/official/${id}-schema.json`)),sourceURL:`https://www.data.go.kr/data/${id==="a07"?"15141649":"15156661"}/openapi.do`,version:"1.0.0",collectedAt:read(out+"/official/manifest.json").find(r=>r.file===id+".html").at}:null,
  missing:["독립 정상·빈·오류·부분·용량·quota·인증 실응답 표본","공식 갱신·계정 공유 한도·conditional 지원 확인"]};});
write("operation-specimens.json",{...meta,denominator:52,operations,counts:{synthetic:operations.filter(o=>o.evidence.synthetic_contract).length,officialSchema:operations.filter(o=>o.evidence.official_schema).length,officialDocumentExample:0,independentObserved:0,authorizedLive:0}});
const registry=read("docs/implementation-v4/api-registry.json");write("api-registry.json",{...registry,...meta,services:32,operations:52,scope:"현재 운영 키·저장 상태를 읽지 않았음. 기존 호출 조건과 52 합성 adapter 시험 보존"});
const policies=read("docs/implementation-v4/policy-contracts.json");write("policy-contracts.json",{...policies,...meta,originalTotal:43,additionalIds:policies.additionalIds,expertApproved:0,enabled:0,newLegalRules:0,nextOrder:["교육 5","안전관리자 6","안전검사 5","나머지 후보"],note:"별지 목적·단위·음수·시점 및 위험성평가 사건일 profile 보강. 원래 정책 후보 분모 유지; 실제 규칙 활성화 없음"});
const updates={
 "A-attachments":["공식 PDF·HWPX 2개 확보·격리 파서 실행·원문 대조. 실제 격리 TLS 시험 통과. 정부 pin 경로는 HTML 오류 응답으로 2개 모두 원문 미확보","정부 pin 원문 정상 응답·다른 provider·이미지 OCR·전체 결정 셀 대조"],
 "A-schemas":["52 합성 adapter 유지, A07/A08 공식 명세 2개 확보. 실응답과 혼합하지 않음","나머지 50 operation 공식 schema와 독립 표본; 실제 키 호출은 후속 승인 필요"],
 "B-egress":["v4 공공 API transport에 SQLite 전송 admission·25ms 철회 확인·취소 연결. 다중 프로세스 revoke 검증. legacy digest 자동 승격 금지","AI/MCP/재사용 등 전체 경로의 정확한 부모 연결과 v3 fallback 이관. 송신 이후 bytes 회수는 보장 불가"],
 "B-queue":["v3 job·단위·이력 및 검토 trace 보호 복사·해시 대조·중복 실행 확인. 원본 평문 유지","실제 삭제 승인·hold/TTL 검토·실행 재개 검증·모든 trace와 오류 잔류 이관"],
 "B-backup":["동일 snapshot의 legacy/v2/v3/v4 범위와 v5 metadata를 암호 묶음·세대 복원. 원본/paused/deny·실제 프로세스 중단·잠금 복구 시험","미연결 legacy·공개 자료 캐시 복원 범위, 동시 파일 변경/디스크 부족/ACL/키 회전·전원 차단 전체 매트릭스"],
 "C-cases":["A07 worker raw→제공 필드 후보→수동 보완→독립 합성 검토→기존 UI 검토와 관리용 자료 export 연결","A08 실응답·현재 처분효력·시설/허가/계약/능력 근거·독립 사실 승인; 기존 일반 export의 자동 후보 결합은 별도"],
 "D-policy":["공식 별지 제5호 3쪽 및 2024-76 HWPX, 법21374·규칙470 전문 확보. 참조 충돌·음수·시점·개정 사건일 보존","폐기물 하위 참조·예외 전체 전개, 5월31일 원문 조회 실패, 고시/시행규칙 충돌·후속 공표·분야 전문가 승인"],
};
const gates=read("docs/implementation-v4/release-gate.json").blockers.map(b=>updates[b.id]?{...b,previous:b,status:"부분구현·미완료",reason:updates[b.id][0],close:updates[b.id][1]}:b);
write("release-gate.json",{...meta,productionReady:false,blockers:gates});
write("metrics.json",{...meta,technical:{tests:rows.length,passed:tests.numPassedTests,preserved,oldBrowser:8,newBrowser:1,frozen:29},source:{officialBytes:2,officialParse:2,governmentPinnedOriginal:0,governmentPinnedDenominator:2,isolatedTLSTest:1},specimens:{operations:52,synthetic:52,officialSchema:2,independentResponse:0,live:0},legal:{denominator:0,value:null},realSite:{denominator:0,value:null},independentGolden:{denominator:0,value:null}});
write("failure-record.json",{...meta,records:[
 {phase:"baseline",result:"378/380",failures:["V3-J07 cleanup EPERM","V4-A10 child failure"],correction:"SQLite 연결 시 bounded busy_timeout; child close·allSettled 이후 정리, stderr 보존",retest:"380/380 + 8 browser"},
 {phase:"new-parser",result:"403개 이전 4개 실패",correction:"격리 node_modules junction 별칭 read 허용, 취소를 Promise rejection으로 유지, 공식 query mode=search 시험값 정정"},
 {phase:"pinned-network",result:"Node lookup all 주소 형식 오류",correction:"Node all 요청에 family/address 배열 반환. 격리 TLS 실소켓 시험 통과"},
 {phase:"government-pinned",result:"HTTP200 text/html 오류 문서",correction:"원문 성공 처리하지 않음; 서명/형식 검사 유지; blocked 보존"},
 {phase:"backup-fixture",result:"검토 질문 최소 길이 불일치",correction:"합성 질문을 기존 저장 계약 길이에 맞춤; 검증 조건 유지"},
 {phase:"historical-rule",result:"MST271485 공개 조회 2회 모두 기본정보 조회 실패",correction:"본문 부재·과거 규정 없음으로 해석하지 않고 미확보 유지"}
]});
write("current-status.json",{...meta,implementationFinished:false,uiChanged:0,productionReady:false,blockers:gates.map(g=>g.id),preservedDenominators:{tests:380,browser:8,acceptance:72,policies:43,additionalPolicies:2,services:32,operations:52,frozen:29,gates:12}});
console.log(JSON.stringify({tests:rows.length,passed:tests.numPassedTests,preserved,frozen:frozen.length,sourceDigest:meta.sourceDigest,mismatches}));
if(mismatches.length||frozen.some(f=>!f.unchanged)||preserved!==380||tests.numFailedTests||execution.steps.length!==10||execution.steps.some(s=>s.code!==0)||operations.length!==52||ac.rows.length!==72||gates.length!==12)throw Error("v5 최종 검증 불완전");

import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync,cpSync} from "node:fs";
import {join,resolve,relative} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const out="docs/implementation-v4",read=p=>JSON.parse(readFileSync(p,"utf8")),hash=x=>createHash("sha256").update(x).digest("hex");
const write=(p,x)=>writeFileSync(join(out,p),JSON.stringify(x,null,2)+"\n");
const baseline=read(out+"/baseline.json"),execution=read("work/v4-audit/isolated-validation.json"),tests=read("work/v4-audit/final-tests.json");
const paths=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const q=join(p,e.name);if(e.isDirectory())walk(q);else if(/\.(ts|tsx|css|mjs|py|json|html|svg)$/.test(e.name))paths.push(q.replaceAll("\\","/"));}}
for(const dir of ["server","shared","src","tests","scripts","public","data"])if(existsSync(dir))walk(dir);
paths.push("package.json","package-lock.json","tsconfig.json","tsconfig.server.json","vite.config.ts","vitest.config.ts","index.html","AGENTS.md");
const files=[...new Set(paths)].sort().map(path=>({path,hash:hash(readFileSync(path))}));
const meta={head:execFileSync("git",["-c",`safe.directory=${resolve('.').replaceAll('\\','/')}`,"rev-parse","HEAD"],{windowsHide:true,encoding:"utf8"}).trim(),dirty:true,sourceDigest:hash(JSON.stringify(files)),at:new Date().toISOString(),runtime:process.version,scope:"격리 구현·합성 시험. 실제 사업장·법적 승인·운영 완료 아님"};
write("source-manifest.json",{...meta,files,changedFromBaseline:files.filter(f=>baseline.files.some(b=>b.path===f.path&&b.hash!==f.hash)).map(f=>f.path),added:files.filter(f=>!baseline.files.some(b=>b.path===f.path)).map(f=>f.path)});
const frozen=baseline.frozen.map(f=>({...f,actual:hash(readFileSync(f.path)),unchanged:hash(readFileSync(f.path))===f.hash}));
write("ui-freeze.json",{...meta,files:frozen,count:frozen.length,changed:frozen.filter(f=>!f.unchanged).length,productionAccess:0,restarts:0,deployments:0,realCredentialsRead:0,legalRulesActivated:0});
if(frozen.some(f=>!f.unchanged))throw Error("Frozen file changed");
const mismatches=files.filter(f=>!existsSync(join(execution.directory,f.path))||hash(readFileSync(join(execution.directory,f.path)))!==f.hash).map(f=>f.path);
write("build-verification.json",{...meta,directory:execution.directory,mismatches,packageLock:hash(readFileSync("package-lock.json")),temporaryData:true,defaultOperationalPathsExcluded:true});
const rows=tests.testResults.flatMap(r=>r.assertionResults.map(t=>({file:relative(execution.directory,r.name).replaceAll("\\","/"),name:t.fullName,status:t.status,duration:t.duration})));
const oldTests=read(out+"/baseline-tests.json").testResults.flatMap(r=>r.assertionResults.map(t=>t.fullName));
write("test-inventory.json",{...meta,total:rows.length,passed:rows.filter(r=>r.status==="passed").length,failed:rows.filter(r=>r.status==="failed"),preservedBaseline:oldTests.filter(n=>rows.some(r=>r.name===n&&r.status==="passed")).length,baseline:oldTests.length,rows});
mkdirSync(out+"/logs",{recursive:true});
for(const f of readdirSync("work/v4-audit").filter(x=>x.endsWith(".log")||x.startsWith("v4-validation-")&&x.endsWith(".json")))cpSync("work/v4-audit/"+f,out+"/logs/"+f);
for(const v of ["v3","v4"]){const p=join(execution.directory,`playwright-report/${v}-checkpoints.json`);if(existsSync(p))cpSync(p,join(out,`${v}-browser-checkpoints.json`));}
write("execution.json",{...meta,...execution,finalTests:{total:tests.numTotalTests,passed:tests.numPassedTests,failed:tests.numFailedTests},baselineEvidence:"baseline-execution.json",outboundProviders:"합성 fetch 응답만 사용; 공식 공개 HTML 조사만 별도 무인증 수집"});
const prior=read("docs/implementation-v3/acceptance-map.json");
write("acceptance-map.json",{...meta,originalCount:72,rows:prior.rows,newTests:rows.filter(r=>r.name.startsWith("V4-")),note:"원래 72개 항목과 미검증 상태 보존. 기술 시험 통과를 법적 승인으로 승격하지 않음"});
const matrixPath=join(execution.directory,"work/v4-operation-matrix.json"),matrix=existsSync(matrixPath)?read(matrixPath):{operations:[]};
write("operation-matrix.json",{...meta,...matrix});
const registry=read("docs/implementation-v3/api-registry.json");
write("api-registry.json",{...meta,services:32,operations:52,entries:registry.entries.map(s=>({...s,operations:s.operations.map(o=>({stableId:s.id+":"+o.operation,endpoint:o.endpoint,provider:s.agency,officialTerms:s.url,credentialReference:"host-provisioned only; real key not accessed",role:o.role,timeoutMs:o.timeoutMs,retryMax:o.retryMax,fixture:matrix.operations.find(x=>x.id===s.id+":"+o.operation)??null,rawCapture:"v4 context→requestOnce before decoder/parser; encrypted client-decoded bytes",parsing:"adapter contract only; official specimen pending",detail:"existing adapter coverage; complete original not implied",attachment:"separate graph node; application adapter not yet connected",institutionSupport:"unverified",quota:"host account mapping + per-call SQLite permit; provider limits/reset unverified",conditional304:"adapter support unverified; no unconditional reuse",partial:"offset snapshot cannot establish full-provider coverage",live:"not_run_user_prohibited",nextClosure:"승인된 테스트 자격·공식 응답 specimen·서비스별 첨부 경로 확인"}))})),attachmentNodes:[{id:"v4.generic-attachment",secureBoundary:"pinned IPv4 HTTPS/no redirects/stream limits/MIME signature/encrypted bytes",fixture:"V4-A05/A06/A07",providerDiscovery:"unconnected",parser:"not_supported",archive:"not_supported",realSocketVerification:"not_executed"}],supportProjection:{agency_not_supported:"공식 미지원 확인 자료 필요",no_attachment:"해당 응답에 첨부 없음",app_adapter_missing:"앱 첨부 adapter 미연결",support_unverified:"기관 지원 범위 미확인"}});
const chosen=["risk_assessment.evaluation","risk_assessment.worker_participation","risk_assessment.risk_reduction","risk_assessment.effectiveness","risk_assessment.retention","environment.waste_contractor"];
const contracts=read("docs/implementation-v3/policy-contracts.json");
const passedIds=chosen.filter(id=>rows.some(r=>r.name.startsWith("V4-D01: "+id+" ")&&r.status==="passed"));
write("policy-contracts.json",{...meta,originalTotal:43,previousExecutable:6,newCandidateExecutable:passedIds.length,remainingExecutionCandidates:37-passedIds.length,additionalIds:["risk_assessment.representative_participation","risk_assessment.sharing"],expertApproved:0,realSiteVerified:0,enabled:0,policies:contracts.policies.map(p=>({...p,v3Status:p.implementation,v4Implementation:passedIds.includes(p.id)?"독립 합성 실행·누락 보류 시험 통과; 원문·profile·실제 분야 승인 미완료":"v3 상태 유지",realLegalReview:"미완료",enabled:false}))});
const sources=read(out+"/official-sources.json");
write("legal-version-graph.json",{...meta,nodes:sources.map(s=>({...s,stage:"article bytes collected; not approved",articleEffectiveDate:"separate review required; do not inherit statute header",decisiveCellsApproved:false})),edges:[{from:"osha-36",to:"osha-rule-37-00",kind:"delegation",predicates:["work_scope","evaluation_trigger"],complete:false},{from:"osha-36",to:"osha-rule-37-02",kind:"participation",predicates:["participation_scope_reviewed"],complete:false},{from:"osha-36",to:"osha-rule-37-03",kind:"sharing",complete:false},{from:"osha-36",to:"osha-rule-37-04",kind:"retention",complete:false},{from:"waste-18",to:"waste-rule-16-12",kind:"conditional_consignment",complete:false}],missing:["2026-05-31/06-01의 법률·부칙 전문 적용례 대조","시행규칙 제37조 이전 기록조항 version mapping","2024-76호 고시 전문·개정 연혁","2026-461호는 행정예고: 현행 규칙으로 활성화 금지","폐기물 영 제8조의4·규칙 제18조·제18조의2 대상 펼치기","별지 제5호 원본·서명·능력 산식 결정 셀"]});
const blockers=[
 {id:"A-attachments",status:"미완료",reason:"보안 downloader 합성 검증. accident/guide/sif·법령 별표 실제 발견→다운로드 자동 연결과 parser/OCR 미완료",close:"공식 URL/역할/원본 표본 확보 후 provider별 연결·원문 대조"},
 {id:"A-schemas",status:"미검증",reason:"52 operation 합성 adapter 실행은 완료. operation별 공식 schema/표본·변경·빈응답·quota 전체 조합은 미검증",close:"실표본·공식 사용조건 확인; 실제 키는 별도 사용자 승인 필요"},
 {id:"A-quota",status:"부분구현",reason:"각 requestOnce permit 적용. job gate 유지, provider account mapping host 공급 필요. 신규 permit 다중 프로세스 배타 시험 추가; crash/장시간 네트워크 중 fence 시험 미완료",close:"동일 credential 다른 서비스·MSDS16 실제 공유계정 규칙 검증"},
 {id:"A-conditional",status:"미완료",reason:"304/range adapter 연결 및 snapshot 변동·복구 실표본 미검증",close:"공식 conditional 지원·representation/validator 범위 확인"},
 {id:"B-egress",status:"부분구현",reason:"실제 AI/intake payload·MCP·v4 collection 생성 경로 연결. 전체 파생/export/답변 재사용의 자동 parent 해석·v3 digest 경로 대체 미완료; cross-process 권한 철회 직전 race 잔존",close:"모든 private 생성 경로의 정확한 entity/version/hash 자동 연결·lease 검증"},
 {id:"B-queue",status:"부분구현",reason:"v4 queue/raw/unit 암호화·TTL 적용. 기존 v3 평문 큐를 이관/삭제하지 않음; source·case trace 자체 기밀 저장 설계 별도",close:"운영 승인 후 이관; key rotation/hold/OS ACL 검토"},
 {id:"B-backup",status:"부분구현",reason:"v4 보호자료 계층 암호화 백업·rollback·복원 전송 거부 검증. v2/v3+v4 전체 원자 복원·작업 paused 복원 통합 미완료",close:"전체 앱 backup manifest·concurrent restore/crash/junction/ADS/공유원본 복구 시험"},
 {id:"C-cases",status:"부분구현",reason:"S2/S3/S5 기존 질문·문서→후보·보류 trace 브라우저 확인. A07/A08 raw→정확한 case fact 자동 매핑→독립 승인·문서 전과정은 미완료",close:"업체/시설/처분기간/계약·능력 원문을 단일 검토 객체에 연결"},
 {id:"D-policy",status:"부분구현",reason:"다음 6개+추가2개 후보 독립 합성시험. 날짜 profile·하위 참조·별지·효과확인 법적 태그 gate 유지",close:"원문·시행일·조건·예외·결정 셀 대조 및 실제 권한자 검토"},
 {id:"D-next",status:"미구현",reason:"교육5→안전관리자6→안전검사5→위험물/환경 잔여는 기존 후보 유지",close:"우선6의 원문/실무 gate를 닫고 독립 사실·기한식 구현"},
 {id:"E-site",status:"차단",reason:"실제 사업장 정보·보유자료·독립 전문가 승인이 없음",close:"사용자가 해당 자료/권한자 검토 제공"},
 {id:"E-production",status:"금지",reason:"이번 요청에서 운영 접속·키 사용·배포·재시작·활성화 금지",close:"후속 사용자 명시 지시"}
];
write("release-gate.json",{...meta,productionReady:false,blockers});
write("metrics.json",{...meta,technical:{tests:rows.length,passed:tests.numPassedTests,baselinePreserved:oldTests.length,newTests:rows.length-oldTests.length,browser:execution.steps.filter(s=>s.command.includes("e2e")&&s.code===0).length,syntheticAdapterOperations:matrix.operations.filter(o=>o.syntheticAdapterExecuted).length,operationDenominator:52},legal:{denominator:0,value:null},realWorkplace:{denominator:0,value:null},officialGolden:{denominator:0,value:null},live:{denominator:0,value:null}});
write("failure-record.json",{...meta,records:[{phase:"baseline-environment",failure:"sandbox EPERM node_modules junction",resolution:"격리 validator 숨김 실행 권한으로 재실행",testFailure:false},{phase:"operation-fixture-1",failure:"합성 qna dutySctnNm=test: 상세 대상 아님",resolution:"기존 adapter 허용 tqapttn으로 모의 식별값 정정"},{phase:"operation-fixture-2",failure:"토지이용행위명 누락",resolution:"필수 합성 검색 입력 추가"},{phase:"windows-test-cleanup",failure:"V3-J07 child 종료 직후 격리 디렉터리 삭제 EPERM",resolution:"기존 경로 검증 유지, 테스트 정리만 50ms 간격 최대5회 재시도"},{phase:"legacy-intake-browser",failure:"새 fail-closed egress 경계로 합성 조회 차단",resolution:"test host에만 explicit provenance·합성 release 공급; 차단 코드 유지"}],historyFiles:readdirSync(out+"/logs").filter(x=>x.endsWith(".json"))});
write("current-status.json",{...meta,baselineMatched:baseline.changed.length===0,uiChanged:0,productionReady:false,implementationFinished:false,blockers:blockers.map(b=>b.id)});
console.log(JSON.stringify({tests:rows.length,passed:tests.numPassedTests,frozen:frozen.length,mismatches,sourceDigest:meta.sourceDigest,operations:matrix.operations.filter(o=>o.syntheticAdapterExecuted).length}));
if(mismatches.length||tests.numFailedTests||execution.steps.length!==9||execution.steps.some(s=>s.code!==0))throw Error("Final verification incomplete");

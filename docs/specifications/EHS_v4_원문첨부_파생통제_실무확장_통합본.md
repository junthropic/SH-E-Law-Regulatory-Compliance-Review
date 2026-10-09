# EHS v4 통합본: 원문·첨부·파생자료 통제와 실무 검토 확장

- 법률·자료 조사 기준일: 2026-10-08.
- 입력: 사용자가 제공한 v3 결과, `docs/implementation-v3/README.md` 및 관련 보고·코드·시험 기록.
- 이번 산출물은 조사와 다음 실행 지시다. 앱 구현·332개 시험 재실행·운영 API 재호출·운영 반영을 완료한 보고서가 아니다.
- UI/UX 완전 동결, 기존 검토 흐름 유지, 운영 배포·재시작·실제 법적 규칙 활성화 금지를 그대로 유지한다.

## 전달 방법

**CODEX에는 이 통합본 하나만 전달한다.** 본문은 조사·정정·미확인 범위, 부록은 실제 실행 지시다. 부록 v4를 한 번 실행하고 v2/v3 프롬프트를 처음부터 중복 실행하지 않는다. 별도 실행 프롬프트 파일은 필요 없다.

# 1. v3 결과에 대한 판단

v3는 별도 모델 수준에서 실제 격리 연결 수준으로 진전했다. 기존 검토·trace, 권한·승인, worker·재개·취소, 전송 차단과 관리용 암호화 복원을 실제 시험한 기록이 있다.

확인한 보고 기준선:

- HEAD: `e770bdefb32fbb6a010b435f372f2d13c9fb384f`.
- 최종 미커밋 소스 digest: `26dc4d816b8caa152bc551bd28f6dbdfcc6b6654b4db6fc078c85ee0afea938a`.
- 기존282개 시험+6개 E2E 재실행 보고.
- 최종332개 시험, 브라우저7개 통과 보고. 기존 시험 이름 유지,50개 추가.
- 32서비스·52operation, 기존43개 후보 및72개 인수 유지.
- 선택 실행 후보6개, 나머지37개 실행 구현 미완료.
- UI 동결29개 hash 동일 보고.
- 운영 접속·키 사용·배포·재시작·데이터 변경·법적 규칙 활성화 미수행 보고.

이번 조사에서는 해당 보고·JSON·선택 코드를 읽었다. 소스 전체를 새로 hash하거나 시험을 재실행하지 않았다. 보고된 성공을 이번 조사에서 직접 실행한 성공으로 바꾸지 않는다.

**다음 목표는 시험 개수를 늘리는 것이 아니라, 실제 자료의 확보→정규화→사실→정책→판정→승인→변경 영향이 끊기지 않게 만드는 것이다.**

# 2. 실무자는 무엇을 확인하며 사용해야 하는가

현재는 격리·가상 검증 단계다. 실제 사업장 결재의 단독 근거로 쓰거나, 운영에서 새 기능이 이미 동작한다고 안내하지 않는다. 민감자료 투입은 전체 egress와 저장 통제를 먼저 검증해야 한다.

## 2.1 질문 접수와 법적 사실 확정을 분리

예: ‘A업체에 지정폐기물을 위탁해도 되나요?’

프로그램이 업체 목록 하나로 답하면 안 된다. 폐기물 종류·양·위탁 시점, 수탁 업체와 실제 시설, 허가/신고 지위·대상 종류·방법·능력, 계약, 처분 효력과 후속 변경을 분리한다.

자료가 부족하면 ‘위탁 불가’가 아니라 어떤 조건이 미확인인지와 최소 추가 자료를 보여준다. 허가증 미업로드·조회0건·API timeout은 실제 무허가나 부적정 처리 사실이 아니다.

## 2.2 원문이 없는 결과는 조사 단서로 취급

목록 제목·정규화 JSON·AI 요약·검색 snippet은 원문 bytes와 다르다. 본문·첨부·별표·부칙에서 실제 판정에 쓰인 위치가 확인돼야 한다.

원문이 확보되지 않았다면 출처의 제목·URL이 있다는 이유만으로 source.complete나 결정 셀 확인을 true로 바꾸지 않는다. partial 응답은 그대로 partial이다.

## 2.3 위험성평가는 양식 존재가 아니라 절차·참여·공유·조치 검토

예: ‘위험성평가표가 있으니 올해 평가 완료인가요?’

확인할 것은 실제 공정과 작업, 평가 실시 시기, 유해·위험요인 파악, 허용 가능성 결정, 필요한 개선대책 수립·이행, 근로자 참여, 요청이 있는 경우 근로자대표 참여, 일정·결과 공유, 기록·보존이다.

작성된 표의 존재와 실제 평가·참여·조치·공유를 합치지 않는다. 참여자 서명만으로 해당 작업의 실질적 참여 전체를 입증하지 않는다. 요구가 없는 경우의 근로자대표 참여와 근로자 참여 일반 의무도 구분한다.

## 2.4 점검·제출은 접수와 현재 시정까지 연결

점검일·점검 실체·결과 기록·제출·접수 확인·기한·지연 이력을 구분한다. 현재 제출을 보완했다고 과거 지연을 지우지 않는다. 제도상 ‘수리’가 필요한지 확인하지 않고 모든 제출에 수리증을 필수로 요구하지 않는다.

## 2.5 기존 화면 흐름은 유지

질문→자료→수집→검토→문서→승인의 기존 동선을 유지한다. 새로운 상태·출처·추적 정보는 기존 결과 데이터 계약 또는 관리 API/CLI로 전달한다. 새 메뉴·버튼·로그인·설정·자동 polling UI를 만들지 않는다.

# 3. 코드 대조에서 확인한 다음 공백

아래는 정적 코드 관찰이다. 취약점 실행 재현·현재 운영 피해 확인을 뜻하지 않는다.

## 3.1 질문 주제에 따른 정책 선택이 필요

`server/legacy-bridge-v3.ts:236` 부근은 `selectedPolicies.map()`으로 현재6개 위험물 후보를 순회한다. project 모드에서는 이6개 행을 기존 issues로 투영한다.

따라서 폐기물·위험성평가 질문에도6개 위험물 검토가 붙을 수 있는 구조다. v4는 주제별 정책 선택과 선택 근거를 연결해야 한다. 주제 후보 선정은 법적 대상 확정이 아니므로 시설·의무자·기간의 적용성은 별도로 검증한다.

## 3.2 수집 결과는 원문 bytes가 아니다

`server/public-api-transport.ts`는 response stream을 모아 UTF-8 text로 바꾸고 JSON/XML을 파싱한다. 반환·일지에 저장되는 것은 파싱·정규화된 data다. 원문 capture를 별도 영속 경로에 연결해야 한다.

별표를 저장하는 `server/sources.ts`의 법령 수집 경로와32서비스의 일반 수집 경로는 별도다. 한쪽 원본 저장 성공을 모든52operation의 원문 보존으로 확대하지 않는다.

## 3.3 첨부 metadata와 실제 파일을 분리

`collection-service-v3.ts`의 attachment 단위는 현재 adapter_missing 또는 support_unverified/not_supported 기록이다. 실제 바이너리 다운로드가 아니다.

기관의 첨부 미지원, 해당 자료에 첨부 없음, metadata만 확보, 앱 adapter 미구현, 다운로드 실패, 차단·권한 필요를 다른 상태로 관리한다.52개 기존operation 모두에 별도 첨부 API가 있다고 가정하지 않는다.

## 3.4 quota는 작업 내부 실제 HTTP까지 이어져야 함

현재 job claim과 종료의 공유 quota는 다른 작업 간 직렬화를 돕는다. 페이지·상세·MSDS 내부 병렬 호출·다른 credential의 상세 서비스까지 계정별 실제 요청 수를 완전히 조정한 것은 아니다.

기관 전체한도와 operation 한도는 확인한 범위만 반영한다. credential hash가 다르다는 이유로 같은 계정의 제한이 독립이라고 추정하지 않는다.

## 3.5 재시도 중첩은 이미 일부 방지됨

좁은 코드 재확인 결과, `collection-service-v3.ts`의 handle catch는 `PublicApiError`를 retryable=false로 다시 던진다. 따라서 현재 실제 공공 API 오류가 그대로 worker 재시도에 들어가 A07/A08 횟수가 무조건 곱해진다고 단정하는 것은 틀리다.

다만 모든 PublicApiError를 false로 바꾸는 방식과 operation별 transient 오류의 재개 정책은 구분해야 한다. v4는 transport 소진·worker 재시도 허용·수동 재개를 명시하고 실제 outbound 횟수와 전체 budget을 시험한다.

## 3.6 파생자료 출처 등록이 실제 생성 경로에 연결되지 않음

`egress-v3.ts`의 derived()는 parents를 호출자가 등록해야 한다. 확인한 운영 코드 경로에는 실제 생성 시점 호출이 없고 관련 시험에서 등록한다.

AI context의 정제·요약, intake 정규화, 도구 인수, 검색 query의 실제 전송 payload가 어느 원본에서 만들어졌는지 연결해야 한다. 원본 hash 검사와 실제 전송 bytes 검사는 다른 검증이다.

## 3.7 queue는 민감 검색어를 평문으로 저장할 수 있음

`collection-service-v3.ts`의 normalized query가 job.input.query로 들어가고 `jobs-v3.ts`의 job body 및 CollectionJournal query에도 저장된다. 현재 허용 검사는 저장 비밀성·TTL을 대신하지 않는다.

검색어가 개인정보·업무기밀을 포함할 가능성을 분류하고 복수 저장·로그·백업·event까지 보호한다. 해시만 저장하면 worker가 재개에 필요한 검색어를 복구할 수 없으므로, 보호된 암호화 payload와 비식별 참조를 설계한다.

## 3.8 허용 변경과 과거 버전 금지가 충돌할 수 있음

egress check는 같은 원본 digest를 가진 과거 evidence 버전의 externalAllowed=false도 확인한다. 이후 정당한 허용 검토가 있어도 과거 금지가 지속될 수 있다.

해결책을 단순 ‘최신 row만 조회’로 만들면 과거 파생물의 금지를 우회할 수 있다. 정확한 evidence/version/hash·목적·제공자·승인/철회 이력과 해제 근거를 모델링해야 한다. 새 버전 허용이 옛 버전·다른 자료의 허용을 뜻하지 않는다.

## 3.9 legacy 도구 차단이 파일럿 flag에 의존

MCP query와 intake execute의 차단은 현재 v3 파일럿의 임시 경로다. 재사용 가능한 egress context를 서비스 호출 직전에 강제하고 UI·test·synthetic flag와 독립적으로 검증해야 한다.

운영 기본 서버를 새 코드로 바꾸라는 뜻은 아니다. 새 코드는 격리에서 검증하고 실제 운영 적용은 별도 승인이다. 기존 코드가 gate를 거치지 않는 경로가 남으면 ‘전체 egress 통제 완료’라고 보고하지 않는다.

# 4. 공식 기술자료에서 반영할 기준

## 4.1 원문과304

[공식 표준] RFC9110은 HTTP content/representation을 구분하고304를 이미 저장된 representation의 재사용과 연결한다.

[설계 권고] 원문이라고 부르는 capture 단계가 네트워크 wire bytes인지, HTTP client가 transfer/content decoding한 entity bytes인지 명시한다. Node fetch가 자동으로 복호화·압축 해제한 bytes를 wire 원본이라고 주장하지 않는다.

304는 같은 query·representation·validator·권한 scope의 저장 bytes가 있어야 재사용한다. 저장 본문이 없거나 hash가 손상됐으면 재조회/실패다.304를 정상0건이나 새 원문으로 저장하지 않는다.

## 4.2 임의 첨부 URL과SSRF

[전문단체 권고] OWASP SSRF 지침은 허용 대상·scheme·host·IP와 redirect의 우회를 다룬다. host 문자열만 허용해도 DNS 재해석에서 목적지가 바뀔 수 있다.

[설계 권고] registry에서 검증한 기관·첨부 host/path만 사용한다. 자동 redirect를 차단하거나 hop마다 새 목적지를 검증한다. 사설·loopback·link-local·metadata 주소·다른 scheme을 차단하고 실제 연결 IP도 검증한다. HTTPS에서 HTTP로 내려가거나 다른 host에 key/cookie를 전달하지 않는다.

현재 redirect:error가 있다고 임의 attachment URL에 대한 전체 SSRF 보호까지 있다고 주장하지 않는다.

## 4.3 파일을 받는 것과 안전하게 파싱하는 것

[전문단체 권고] OWASP File Upload 지침은 extension·Content-Type만 신뢰하지 말고 파일 형식·크기·이름·저장 위치·권한·parser 안전성을 다층으로 검증하라고 권고한다.

[설계 권고] 다운로드 첨부에도 같은 원리를 적용한다. 실제 bytes로 형식을 대조하고 웹루트 밖에 저장한다. archive는 경로탈출·symlink·중첩·압축 해제량·파일 수·시간을 제한한다. HTML/script·매크로·외부참조를 자동 실행하지 않는다.

현재4MB decoded stream 제한이 압축·CPU·메모리·archive 폭탄의 전체 방어를 검증했다는 뜻은 아니다.

## 4.4 외부 문서의 지시문은 데이터

[전문단체 권고] OWASP LLM 보안 자료는 외부 문서·도구 결과로 들어오는 indirect prompt injection과 모델 밖의 권한·도구 인수 검증을 다룬다.

[설계 권고] 공문·법령 첨부·PDF·OCR·API 오류 내용에 승인·전송·도구 호출을 지시하는 문장이 있어도 프로그램의 명령으로 실행하지 않는다. 수집과 파싱은 승인·권한·법적 규칙 활성화를 만들지 않는다. 모델 출력은 schema·대상·권한·출처를 다시 검증한다.

이 권고는 보편적인 한국 EHS 법정 보안 형식을 선언하는 것이 아니다.

# 5. 법률 조사: 다음 정책 묶음

## 5.1 위험성평가 현행 법률과 조문 이동

[MCP 확인·정부 원문] 2026-10-08 기준 산업안전보건법 법령ID001766/MST283449, 시행규칙 법령ID007364/MST288431을 조회했다.

법 제36조는 평가·개선대책 수립/이행, 근로자 참여, 요구가 있는 경우 근로자대표 참여, 관련 사항 알림, 기록·보존을 구분한다. 중대재해 가능 요인의 상시 주지는 해당 문장의 ‘노력’ 의무 성격도 구분한다.

현행 시행규칙:

- 제37조: 방법·절차·시기. 최초평가, 정기평가, 수시평가를 구분.
- 제37조의2: 근로자 참여의 순회 점검, 병행 방법, 특별한 사정의 대체 참여 방법.
- 제37조의3: 실시 전 일정과 실시 후 요인·수준·개선대책·이행 결과 공유.
- 제37조의4: 시기·담당자, 참여 근로자/대표, 결과 사항의 기록과3년 보존.

과거 시행규칙 제37조의 ‘기록·보존’ 인용을 현행 제37조에 그대로 연결하면 틀린 위치를 사용할 수 있다. 제목·본문·효력일을 함께 비교한다.

[기준일 경계 확인] 법 제36조를2026-05-31과06-01로 조회하여 구·신 조문 차이를 확인했다.6월1일 조회의 반환 법령 머리 시행일은8월1일로 표시될 수 있으므로 조문별 시행·부칙을 우선한다. MCP applicable_law는 법률 제21374호 부칙의 시행 이후 평가 적용례를 발췌했다. 고용노동부 공식 안내도 위험성평가 개선과 제재의 시행 시점을 분리한다.

과태료·벌칙은 이 조사로 현재 적용액을 활성화하지 않는다. 시행예정 제재와 의무 본체를 합치지 않는다. 시행규칙 부칙·고시·모든 변경 사건의 전수 검토는 후속 gate다.

## 5.2 현행 고시와 행정예고를 구분

[정부 원문] 고용노동부고시 제2024-76호의 공표 페이지와 국가법령정보센터 버전 metadata를 확인했다.

[정부 원문]2026-09-23 공고 제2026-461호 페이지는 전부개정고시 **안의 행정예고**다. 이 페이지의 존재를 확정 시행 고시로 바꾸지 않는다.

이번에는 지침 전문·별표·부칙 전체와 이후 확정 공고의 전수 대조까지 끝내지 않았다. 상위 법률·시행규칙과 기존 고시의 차이를 정리하고 필요한 부분만 후보로 구현한다. 과거 고시의 상시평가 대체를 현행 법률 요건 면제로 임의 일반화하지 않는다.

## 5.3 위험성평가5개 기존 후보에 새 하위 의무 보강

기존 ID 유지:

- risk_assessment.evaluation.
- risk_assessment.worker_participation.
- risk_assessment.risk_reduction.
- risk_assessment.effectiveness.
- risk_assessment.retention.

근로자대표 요구/참여와 공유는 독립 sub-obligation으로 추적한다. 기존5개에 하위 trace를 추가할지 보충 ID를 만들지 정하되, 두 조건을 worker_participation 하나로 충족 처리하지 않는다.

보충 ID를 만들면 원래43개 분모는 그대로 두고 ‘추가 발견 의무2개’를 따로 계수한다. effect 확인의 법정 근거와 내부 효과검증 설계도 분리한다. effect 검토가 필요하다는 이유만으로 독립된 보편 법정 위반 항목을 만들어내지 않는다.

## 5.4 폐기물 수탁업체: 목록 이상으로 필요한 실제 자료

[MCP 확인·정부 원문] 폐기물관리법 제18조①은 허가업체 외 신고자·일부 법정 시설·다른 법률의 허가/등록 경로도 구분한다. 허가증이 없다는 사실만으로 모든 수탁자가 불법인 것은 아니다.

[MCP 확인·정부 원문] 시행규칙 MST290881/기준일2026-10-08 제16조의12는 해당 대상에 대해 다음을 정한다.

1. 수탁처리능력 확인서와 허가/신고·이행보증 관련 서류.
2. 공개 자료 등을 통한 적법한 수탁자 확인.
3. 폐기물 종류·수량, 기간·비용, 성질·상태·주의사항을 포함한 서면 위탁계약.
4. 계약 체결일부터3년간 계약서 보관.

적용 대상은 이 조가 참조하는 시행령 제8조의4, 시행규칙 제18조·제18조의2 등을 펼쳐서 판단해야 한다. 모든 사업장·모든 폐기물에 같은 서류 묶음을 강제하지 않는다.

현재 시행규칙 제17조는 음식물류 폐기물 배출자의 범위다. 옛 서식·검색결과의 제17조 수탁 확인 인용을 현행 위치로 복사하지 않는다. 별지 제5호의 현재 버전·첨부·서명·산정 기준도 추가 확인한다. API 정보가 그 서류 전체를 대체한다고 가정하지 않는다.

## 5.5 이번 조사의 법적 한계

- 위험성평가 고시 전문·최신 확정 상태·모든 시행규칙 부칙·특례 전수 미완료.
- 위험성평가 대상/사업장 적용 제외와 실제 근로자대표 사실 미확인.
- 폐기물 제16조의12 참조 대상·별표·현행 서식·처리과정 확인 전체 미완료.
- 실제 처리능력 계산·기관 처분 효력·취소/집행정지·계약 적합성 미확인.
- 실제 사업장·실사용자·전문가 승인 없음.

법정 숫자를 확인한 것과 실행 policy 전체를 승인한 것은 다르다.

# 6. v4의 실무 시나리오와 우선순위

1. **V4-A 자료 신뢰 기반:**52개operation 추적표, transport 원문, 첨부 발견/보안/저장, 실요청 quota.
2. **V4-B 파생자료 통제:**실제 AI context·검색·tool 인수 provenance, queue 보호, 허용/철회/해제의 버전별 정책.
3. **V4-C 실무 연결:**주제 선택, S2 위탁·수탁 객체, S3 제출/접수/지연 이력, 사람이 보완한 fact의 재변환 병합.
4. **V4-D 정책 확장:**위험성평가5개+environment.waste_contractor를 우선 실행 후보로 구현하고 새 하위 의무도 추적.37개 중 이번6개가 실제 구현·시험됐을 때의 계획상 잔여31개는 후속 묶음으로 지속하되 미확인 법률을 활성화하지 않는다.
5. **V4-E 인수:**원래72개와 신규 시험을 보존하고 기술·법적·실무·사업장·운영 검증을 분리.

31개는 이번에6개 기존 후보가 실제 구현·시험됐을 때의 계획상 잔여 수다. 현재 확인된 잔여37개를 미리31개로 바꾸지 않는다.

# 7. 공식 출처와 조사 기록

## 법률·기관

- 산업안전보건법 제36조
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=283449&joNo=0036&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR
- 시행규칙 제37조
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=288431&joNo=0037&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR
- 시행규칙 제37조의2
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=288431&joNo=0037&joBrNo=02&docCls=jo&urlMode=lsScJoRltInfoR
- 시행규칙 제37조의3
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=288431&joNo=0037&joBrNo=03&docCls=jo&urlMode=lsScJoRltInfoR
- 시행규칙 제37조의4
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=288431&joNo=0037&joBrNo=04&docCls=jo&urlMode=lsScJoRltInfoR
- 2024-76호 고시 공표
  https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20241201150
- 고시 버전 metadata
  https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000251014&chrClsCd=010201
- 2026-461호 행정예고
  https://www.moel.go.kr/info/lawinfo/lawmaking/view.do?bbs_seq=20260900747
- 근로자 참여 가이드 소개(보조자료, 이번 전문 미검토)
  https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20241202175
- 제도개선 안내(법령·부칙 원문 확인 우선)
  https://www.moel.go.kr/news/enews/report/enewsView.do?news_seq=18908
- 폐기물관리법 제18조
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=284397&joNo=0018&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR
- 시행규칙 제16조의12
  https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=290881&joNo=0016&joBrNo=12&docCls=jo&urlMode=lsScJoRltInfoR
- A07
  https://www.data.go.kr/data/15141649/openapi.do
- A08
  https://www.data.go.kr/data/15156661/openapi.do

## 표준·전문단체 권고

- RFC9110
  https://www.rfc-editor.org/rfc/rfc9110.html
- OWASP SSRF
  https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP File Upload
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP LLM Prompt Injection
  https://genai.owasp.org/llmrisk/llm01-prompt-injection/

## 자체 입력·관찰

- 사용자 v3 결과와 README·integration-contract·durability-api·security-egress-backup·selected-policy-review.
- policy-contracts·acceptance-map·api-registry·execution·test-inventory·manifest·freeze.
- 선택 코드·시험 읽기. 코드/시험 파일 존재와 실행 결과의 직접 재확인은 구분.
- 원문 JSON은 같은 저장 폴더의 `원문근거/v4/`에 보존한다. 키·인증값·실제 사업장 자료는 조회하지 않는다.

# 8. 이번 산출물의 완료 범위

이 통합본 작성과 저장·전달은 이번 작업의 완료 범위다. 아래 부록을 수행할 CODEX의 앱 구현·시험·법적 승인·운영 반영은 아직 수행되지 않았다.

---

# 부록: CODEX 실행 프롬프트 v4

## 시작 지시

이 문서의 본문을 조사·정정 참고자료로 읽고 이 부록을 한 번 실행하라. v3 결과를 재사용하고 v2/v3 전체 지시를 중복 실행하지 마라. 계획서만 쓰고 끝내지 말고 권한 있는 격리 환경에서 아래 구현·회귀·실무 시험을 수행하라.

## 0. 절대 금지와 작업 원칙

- UI/UX·버튼·탭·메뉴·문구 템플릿·레이아웃·CSS·모델 선택·설정·화면 동선 변경 금지.
- 기존29개 동결 파일과 운영 dist·프론트·shared·public·index·Vite·package/lockfile을 보존한다. 추가 dependency나 shared 타입 변경으로 동결을 우회하지 않는다.
- 기존 미커밋 변경을 되돌리거나 이번 변경으로 재분류하지 않는다.
- 운영4317 접속·재시작·교체·배포·.local/실제 인증키/운영 데이터 접근 금지.
- 외부 감시 루틴·반복 polling 예약·실제 법적 규칙 활성화·권한자/전문가 승인 생성 금지.
- 가상 principal·모의 자료의 합성 표식을 끝까지 유지한다.

백엔드·격리 관리 API·CLI·시험·문서만 수정한다. 문서가 지시하는 UI 템플릿 변경이나 새 로그인/동의 창을 만들지 않는다. 기존 response 계약을 유지한다. 새 결과 데이터·trace와 화면 템플릿 변경은 구분한다.

기존 결과 계약은 이미 지원되는 필드·enum·문자열/배열 의미 안에서 사용한다. frozen shared 타입이나 프론트 parser 수정을 요구하는 새 구조는 기존 endpoint에 넣지 않는다. backend 전용 신규 타입/관리 API/CLI에서만 표현하고, 기존 화면에 표현하지 못한 연결은 미완료로 기록한다. shared에 새 파일을 만들어 UI 동결을 우회하지 않는다.

자료·승인이 필요한 작업은 차단으로 기록하되 실행 가능한 다른 구현·시험까지 멈추지 않는다. 기능은 신규 v4 namespace/버전 또는 명시적인 호환 확장으로 두고 v3 산출물을 덮지 않는다.

## 1. 실제 기준선부터 확인

보고 기준:332시험·7브라우저 시험, sourceDigest `26dc4d816b8caa152bc551bd28f6dbdfcc6b6654b4db6fc078c85ee0afea938a`, HEAD `e770bdefb32fbb6a010b435f372f2d13c9fb384f`,29동결,43후보/선택6/잔여37,72인수,32서비스/52operation.

현재 source와 보고 manifest 차이를 검사한다. 격리 복사본·DB·원본·임의 port에서 기준선 시험을 재실행하고 실패·환경차이를 보존한다. 현재 기준선이 다르면 과거 값으로 강제하지 않는다.

시험 이름·기존72개ID·기존43개ID·52operation 식별자를 보존한다. sourceDigest뿐 아니라 lockfile·runtime·migration·fixture·외부 provider 모의 범위를 기록한다.

## 2. operation별 자료 그래프와 검증표

52개 기존operation을 하나도 삭제하지 않고 다음 필드로 대응한다.

- service/operation stable ID·provider·공식 사용조건·endpoint 확인 위치.
- list/search/detail/attachment metadata/linked lookup 등의 역할.
- 실제 호출 경로·자격 참조·계정/기관/operation quota group.
- 요청·응답 schema/버전·정규화·단위·분석일.
- 원문 capture·parsing·상세·첨부 발견·바이너리 각각의 상태.
- 기관지원 확인 상태와 앱adapter 구현 상태.
- fixture·live·법적 출처 검토 상태.
- coverage 범위·partial 사유·미확인·다음 종료 조건.

첨부 다운로드가 기존52operation 안에 없는 별도 기능이면 추가 그래프 노드로 관리한다. 모든operation에 첨부 endpoint를 만들어내지 않는다.

not_supported는 ‘기관공식미지원’, ‘자료에첨부없음’, ‘앱범위미구현’, ‘지원미확인’을 구분하도록 versioned 상태를 보강한다. 기존 API enum을 깨지 말고 내부 상태/projection을 명시한다. 기능미지원과 통신실패를 같은 정상0건으로 합치지 않는다.

52개 모두의 fixture를 adapter 경유로 실행한다. 공통 fixture 하나를52번 복제한 것을52개 실제 schema 검증으로 세지 않는다. 실제 문서/응답 specimen이 없는 경우 schema 미확인을 남긴다.

## 3. transport 원문을 파싱 전에 영속 연결

현재 requestOnce→JSON/XML parser→정규화 경로에 capture seam을 추가한다. 다음을 연결한다.

- capture ID·tenant/synthetic·job/parent·service/operation.
- 비밀을 제거한 요청 식별·보호 query 참조·시도ID.
- 응답 status·안전한 header subset·validator·content type/encoding.
- capture 단계·수신 bytes·길이·hash·수집시각.
- partial/complete·종료 사유·HTTP budget·단위별 소요.
- parser/decoder 버전·원문→추출→정규화의 관계.

API key·token·cookie·Authorization·민감 full URL을 meta/log/event에 저장하지 않는다. response가 비밀을 echo하면 별도 암호화 quarantine/제외 정책을 적용하고 안전한 표시본과 raw를 구분한다. 비밀이 있는 raw를 일반 export/backup에 섞지 않는다.

실제 capture가 client-decoded bytes라면 그렇게 표시한다. text trim/BOM removal/encoding 변환 이전 bytes를 보존하고 변환 결과의 별도hash를 남긴다. wire capture를 구현하지 않았으면 주장하지 않는다.

HTTP200 빈본문·로그인HTML·내부quota오류·잘린XML·schema변경은 parse/검증 실패 또는partial이다. 원문 확보 성공과 법적 결정 셀 확인/승인은 별개다.

파일과 DB가 별도이면 staging→hash확인→짧은DBcommit→publication/복구 상태를 명시한다. 미완성 원본을 evidence로 내보내지 않는다. crash 전후 동일 원문 재사용·중복외부조회 가능성·저장효과 멱등성을 시험한다. 외부 exactly-once는 보장하지 않는다.

이전에 실패한 단위의 원문이 진단용 quarantine인지 판단 근거인지 구분한다. 실패원문이 있다는 이유로 source.complete를 true로 만들지 않는다.

## 4. 첨부 발견·다운로드·파싱·접근 제어

첫 실제 연결은 공식자료로 URL·역할을 확인할 수 있는 accident/guide/sif 계열 및 법령 별표의 존재 경로에서 선택한다. 실제 endpoint를 확인하지 못하면 해당 node는 차단으로 남기고 모의 generic downloader 검증과 구분한다.

안전 경계를 다운로드보다 먼저 구현한다.

- provider별 허용 scheme/host/port/path와 URL canonical parse.
- 사설·loopback·link-local·특수주소·허용되지 않은 protocol/userinfo 차단.
- DNS 검사 후 실제 연결도 검증 주소에만 수행. HTTP client가 보장 못 하면 경계를 완료로 표시하지 않는다.
- 기본 redirect 차단. 필요한 공식 redirect만 hop마다 재검증·hop상한·TLS정책 적용.
- key/header/cookie를 다른 host에 전파하지 않음.
- Content-Length 유무와 무관한 streaming byte상한·작업 총량·timeout/CPU/메모리 budget.
- MIME·signature·extension의 일치 검증, 안전한 내부 파일명·웹루트 밖 저장.
- path traversal·NTFS ADS·junction/symlink·case alias·기존파일 overwrite/공유원본 삭제 차단.
- archive의 경로·중첩·member수·압축해제량/시간, active content·외부참조·macro의 실행 금지.

필요한 parser가 없으면 바이너리 확보와 파싱 미지원 상태를 남긴다. OCR 오류·잘못된 셀·표를 실제 사실로 승격하지 않는다. 외부 OCR/scan 업체를 자동 추가하지 않는다. 기존 로컬 parser 또는 권한 있는 격리 도구만 사용한다.

바이너리와 DB 연결에는 attachment ID·원문URL 참조·별표/서식/부칙/자료 버전·실제hash·parser버전·page/cell 위치를 둔다. 원문 접근/다운로드는 매요청 권한·tenant·synthetic scope를 검사한다. content-hash URL을 안다고 자료를 받을 수 없어야 한다. unsafe파일은 직접 browser render하지 않는다.

## 5. 실제 HTTP 호출 단위 quota·재시도

job 전체 lease/fence는 소유권이고 기관 quota는 실제 call별 budget이다. 둘을 분리한다.

페이지·상세·첨부·MSDS 내부 sub-operation 각각이 공통 호출 gateway의 permit을 통과하도록 연결한다. 다른 credential을 읽는 상세 서비스의 실제 계정 group도 확인한다. 확인되지 않은 account reset·limit를 임의로 넣지 않는다.

부모가 이미 보유한 동일 lock을 자식이 기다리는 deadlock을 만들지 않는다. job heartbeat와 개별permit의 fence/만료를 나누고 취소가 현재 호출에 전파되도록 한다. 기존 MSDS16병렬 호출에 승인된 계정별 동시성/간격을 적용한다.

재시도 disposition을 명시한다.

- transport 내부 재시도 소진.
- worker가 재시도할 수 있는 transient 실패.
- 인증/형식/권한/크기 등 자동재시도 금지.
- quota waiting.
- 명시적 수동재개와 새budget.

현재 collection handle의 PublicApiError retryable=false 변환을 읽고 baseline실제 동작을 재현한다. 중복재시도 단정을 전제로 코드를 바꾸지 않는다. 실제outbound 횟수·elapsed·남은budget·adapter 소진 표시로 회귀시험한다.

A07 기관 지연 해소를 종료조건으로 하지 않는다. 실패의 bounded 처리·부분 원문 보존·기존업무 동시성·재개/취소·정확한 상태가 종료조건이다. 실제 키/live 호출은 이번 실행에서 금지한다. 필요한 실표본은 [blocked: 사용자 별도 승인·사용조건·테스트 자격 필요]로 남긴다. 합성 actor, 내부 검토 이벤트, CODEX 자체 판단을 실제 사용자 승인으로 간주하지 않는다. 후속 사용자 지시로 범위가 명시적으로 변경되기 전에는 키를 읽거나 실호출하지 않는다.

## 6.304·원천 변경·삭제·재개

실제 지원하는 adapter에만 conditional request를 연결한다. query·scope·credential/representation·ETag/Last-Modified와 저장hash를 대조한다.304인데 대응bytes가 없으면 재조회 또는명시실패다.

range/resume은 지원확인과 validator 일치가 있을 때만 한다.206구간·전체길이·validator를 확인하고 바뀐첨부의 일부를 옛파일에 이어붙이지 않는다. 안정성이 없으면 전체재수집한다.

원천변경은 새version. 검색누락·일시404·권한변경·공개중단·확인된삭제를 별도로 관리한다. tombstone으로 과거 판단의근거를즉시삭제하지 않는다. 재등장·상호변경·같은ID다른내용을시험한다.

offset API의 snapshot변동·총건수변화·부분실패를 보존한다.52개문서의목록성공을 전수완전성이라고부르지않는다.

## 7. 실제 파생 payload provenance 연결

원문→추출→정제→요약→답변/검색어→tool 인수의 그래프를 실제 생성 함수에서 등록한다. 최소 AI context builder, intake 정규화/execute, MCP query, 공개 API enqueue/worker, 답변 재사용/export를 inventory한다.

전송 검사 대상은 실제 serialization한 payload hash다. source entity/version/hash·부모 payload·transformer/version을 연결한다. 시험에서만 직접 derived를 등록한 것으로 실제 생성 경로 연결을 완료하지 않는다.

서버가 작성한 derivation만 신뢰한다. 요청 body나 모델이 parent ID를 생략하거나 원본을 public으로 바꿔 우회하지 못하게 한다. 부분 문자열·결합·base64·번역·OCR·요약·도구 인수도 같은 원칙이다.

출처 unknown은 외부전송 차단이다. 문서에서 추출한 명령은 권한이 아니다. 분류/LLM 출력은 schema와 scope를 검증한다. parser가 조작한 claim에 따라 예외·허용·승인을 만들지 않는다.

법적 source의 결정 셀 승인과 egress 허용은 다른 권한이다. 공개 법령의 고정 조회와 사용자 자료를 포함한 query를 분리한다. 실제 private 내용을 고정 public 경로라는 이름으로 전송하지 않는다.

## 8. egress 승인·철회·재승인·복원

egress에 정확한 자료 ID/version/hash·목적·제공자·허용 근거·주체·기간·actor·supersedes/release 관계를 둔다. 승인·거절·철회·해제를 append-only 사건으로 보존하고 현재 view를 계산한다.

과거 false 때문에 정당한 해제가 불가능한 공백을 닫되, 최신 true만 선택하는 우회도 금지한다. 이전 자료와 같은 hash라도 scope/권리가 다를 수 있다. 승인된 해제는 정확한 대상·사유·기간만 바꾸며 옛 파생물/다른 자료에 자동 확장하지 않는다.

외부 허용·법률상 처리 근거·계약 검토를 분리한다. 내부 egress_reviewer 승인으로 국외이전·위탁 적법성을 확정하지 않는다.

enqueue 직후 철회·worker 호출 직전 철회·retry 직전 만료·여러 버전 동일 hash·목적 변경·provider 변경을 시험한다. 호출 전 검사와 실제 전송 사이 race도 검토하고 허용 lease/버전 재검사 경계를 명시한다. 이미 전송한 bytes를 철회로 되돌렸다고 주장하지 않는다.

UI/test/synthetic flag만으로 검사를 켜고 끄지 않는 재사용 서비스 context를 구현한다. enforcement context가 있는 일반 앱과 합성 앱을 모두 검증한다. context가 없을 때 private 전송을 implicit 허용하지 않는다. 기존 지원 경로가 문서화된 예외로 남으면 해당 경로를 미완료로 기록한다.

운영 entrypoint 활성화/배포는 별도 승인이다. UI에 새 동의 창을 만들지 말고 관리 API/CLI의 명시적 검토로 후속 provision을 준비한다. 실제 권한자가 없으면 가상 승인까지만 한다.

복원 후 egress 거부와 과거 이력을 보존한다. 백업에 있던 외부 허용을 현재 허용으로 자동 복구하지 않는다.

## 9. 민감 queue·저널·로그·원문 저장 보호

query/filter에 개인정보·업무기밀 가능성을 분류한다. HMAC/불투명 ID와 암호화된 scope-bound payload 참조를 사용하여 worker 재개가 가능하게 한다. 단순 SHA가 암호화나 익명화라고 표시하지 않는다.

v3_jobs, job_events, CollectionJournal, retry/dead-letter, trace, cache, audit, backup의 중복 평문을 inventory하고 보호한다. 암호키는 별도 참조·권한·key ID/버전으로 관리하며 평문 DB/로그/backup에 넣지 않는다. 실제 운영 키를 읽거나 재생성하지 않는다.

허용 목적·TTL·최소 보존·법정 보존/사고·분쟁 hold와 삭제 정책을 분리한다. queue 실행 payload와 법적 증거 원본은 같은 보존 대상이 아니다. 종료 job에는 최소 감사 이력을 남기고 민감 query를 무기한 보관하지 않는다.

decryption 실패·키 부재·만료·권한 철회·복원 후 paused를 정상0건으로 바꾸지 않는다. RAM 완전 삭제를 보장하지 않으면 그렇게 주장하지 않는다.

민감 fixture가 DB 본문·일지·event·로그·오류·평문 backup에 남지 않는지 시험한다. 식별용 digest의 재식별 가능성과 저장 파일 접근 권한도 검토한다.

## 10. 주제별 정책 선택과 사람의 fact 보완

현재 bridge의 무조건 selectedPolicies.map을 주제별 선택으로 바꾼다. 기존 질문/답변의 data만 이용하고 새 UI 필드를 요구하지 않는다.

주제 선정 근거·선택 policy/version·미선택 이유·미분류 항목을 trace에 둔다. 주제 분류 성공은 법적 적용성 true가 아니다. 폐기물 질문에 위험물6개만 붙이지 않고, 위험성평가 질문에 관련 정책을 연결한다.

복합 질문·낯선 약어·명칭 중복·오분류·미분류를 시험한다. 후보 없음을 적합/비대상으로 반환하지 않는다. 의미 확인이 필요한 경우 기존 자료 보완/사람 판단 계약으로 전달한다.

legacy fact와 사람이 수정·승인한 fact의 소유권/버전을 정한다. 재변환이 수동 보완을 덮지 않도록 expectedVersion·manual/derived 원천·merge conflict를 보존한다. 새 입력과 기존 승인이 다르면 해당 연결만 재검토한다.

동일한 정책6개를 일괄 붙였던 old trace도 삭제하지 않고 adapter 버전·영향 목록으로 남긴다. 기존 issues의 필수 필드·enum·문서/export 템플릿은 보존한다.

## 11. S2 수탁업체를 끝까지 연결

기존 가상 사례를 단일 업무 객체로 연결한다.

- 위탁자·폐기물 분류/성상·량/단위/기간·예정 사건.
- 수탁 법인/사업자와 실제 시설·주소·허가/신고/등록번호.
- 법정 지위·영업대상 종류·방법·능력·허용보관량과 확인 시점.
- 수탁처리능력 확인서·이행보증·계약·기관 자료.
- 처분의 대상/기간/효력·변경/정지/취소 확인 범위.
- 원문/첨부/사실 version·필요한 대체 확인·각 하위 의무 결과.

폐기물관리법 제17·18조, 시행규칙 제16조의12의 참조 대상/서식/하위 조건을 현재 기준일로 펼친다. 허가 없음이 신고/법정 시설 경로 전체의 위반은 아니다. 적용 범위 미확인에서 보편적인 서류 요건을 추가하지 않는다.

계산은 ton/day·ton/year·m3·시설/차량/매립 단위를 분리한다. 최신 보유량·계약량·능력 자료가 없으면 자동 수탁 가능을 출력하지 않는다. 공식 서식 산정식을 확인하지 않고 편의 산식을 법정 기준으로 만들지 않는다.

A07/A08의 list/detail/원문→동일성→허가 범위/처분 효력→계약/능력→보류/검토→가상 승인→문서 trace까지 HTTP/E2E로 연결한다. 외부 provider만 모의하고 내부 서비스·DB·worker·권한은 실제 구현을 쓴다.

동명 업체·같은 사업자 다른 시설·기간 지난 처분·처분 효력 unknown·부분 응답·자료 기준일 차이·현재 보관량 미확인을 시험한다. 조회0건을 모든 처분 부존재로 보증하지 않는다.

## 12. S3 점검·제출·접수·지연 이력

점검 실시·기록·보존·제출·접수 확인·시정 완료를 독립 사실로 연결한다. 법적 근거 없이 수리증이나 승인서를 추가하지 않는다.

접수로 확인되는 주장과 실제 점검/기술기준 이행을 확인하는 주장을 나눈다. 제출일·기관 접수일·내부 등록일은 다른 날짜다. 재제출·보완 요구·거절·정정·늦은 제출이 현재 상태와 공존해야 한다.

2021-10-21 개정 전후 점검일과 부칙 적용례, 현재3/25/30년 분기, 미확정 기한 profile을 유지한다. 신고/제출 자동 간주가 실제 조문에 없는데 행정기본법 일반 논리만으로 생성하지 않는다.

기산 사실 보완→법적 profile 검토→판정 재계산→가상 승인→현재 보완/과거 지연 구분을 기존 질문/문서 경로로 시험한다.

## 13. 다음 정책 묶음과 법령 version graph

기존 risk_assessment5개+environment.waste_contractor를 우선 실행 후보로 작성한다. 이번 조사의6개 기존 후보와 위험물 기존6개를 혼동하지 않는다.

S5는 신규 위험성평가 가상 시나리오다. 기존 질문에서 공정 추가·작업 시작 예정·평가표·참여 자료·대표 요구·공유 기록을 분리하고, 원문/참조→사실→후보 정책→보류/가상 승인→문서 trace까지 연결한다. 양식 존재만 확인된 경우, 대표 요구 여부가 미확인인 경우, 최초평가 다음 연도의 정기평가, 추가 위험요인에 대한 수시평가, 개선대책 주장과 실제 이행 불일치를 시험한다. 가상 질문의 진술을 객관적 불이행 입증으로 자동 바꾸지 않는다.

근로자대표 요구/참여와 실시 전후 공유를 독립 sub-obligation으로 추적한다. 새 ID면 원래43개 분모를 유지하고 추가2개를 별도로 표시한다. 원래37개 잔여를 실제 구현/시험 전에 미리 줄이지 않는다.

각 정책에 다음을 연결한다.

- 대상·주체·작업/시설·기준일·사건일.
- 필요한 fact와 증거·단독 불충분·대체 경로.
- 조문/항/호/별표/부칙·시행일·source hash·decisive 위치.
- 적용·예외·이행·불이행·기한·승인·잔존 의무의 독립식.
- 법적 의무/노력 의무/행정지침/내부 설계 태그.
- 실행 후보·원문 검토·독립 자동 시험·분야 검토 대기·실제 승인.

현재 법 제36조③의 대표 참여는 요구가 있는 경우다. 근로자 참여 일반 의무와 분리한다. 시행규칙 제37조의2의 순회 참여·특별 사정 대체를 검토한다. 제37조의3의 일정/결과 공유, 제37조의4의 기록/3년 보존을 적절한 하위 의무로 연결한다.

environment.waste_contractor 내부의 제16조의12 서류·계약·보관 조건은 시행령 제8조의4와 시행규칙 제18조·제18조의2 등 참조 대상이 확인된 범위에만 적용한다. 폐기물 수탁의 다른 법적 경로·별도 의무와 분리하고, 이 조건을 전체 사업장·전체 폐기물에 일반화하지 않는다.

risk_assessment.effectiveness의 법적 근거와 내부 효과검증을 분리한다. 근거 없는 독립 법정 위반을 생성하지 않는다.

법률 MST283449의 머리8월1일과 조문별 시행/부칙을 구분한다.5월31일/6월1일 및 해당 시행규칙 경계를 조회하고 적용례를 원문으로 대조한다.2026-461 행정예고를 시행 고시로 활성화하지 않는다. 고시 제2024-76호의 실제 전문·변경·특례를 대조한다.

참조 조문 graph는 링크 개수만 채우지 말고 실행 대상 predicate까지 펼친다. 법령 ID/MST/공포/조문별 시행/부칙/위임/별표/hash/추출 버전/승인/영향을 보존한다. 새 원문 승인은 과거 fact를 승인하지 않는다.

과태료·벌칙·규모별 단계 시행은 별도 후속 gate이며 금액/현재 부과 가능성을 이번 후보 완성으로 활성화하지 않는다.

나머지 계획상 잔여31개는 training5→safety_manager6→safety_inspection5→hazmat permit/manager/check 잔여→environment 잔여 등 실제 등록부 ID로 묶어 지속한다. 각 묶음의 수는 현재 등록부에서 계산하고 추정하지 않는다. 시간이 길면 기술적으로 가능한 다음 묶음을 진행하되 법적 미확인/전문가 승인 차단은 보존한다.

## 14. raw·첨부·queue의 backup/restore와 내구성

관리용 암호화 backup 범위를 신규 raw/첨부/derivation/보호 query/허용 사건/정책 graph까지 명시한다. 권한 없는 다른 tenant와 key를 포함하지 않는다. 기존 UI 평문 JSON backup을 새 암호 format으로 바꾸지 않는다.

암호화된 원본을 복원하려면 key 참조/별도 복구가 필요하다. missing-key를 완전 복원으로 표시하지 않는다. 법적 근거 보존과 실행 payload 폐기를 다르게 한다.

동일 backup 동시 복원·중간 종료·DB rollback 후 원본 정리·공유 원본 보존·junction/ADS·hash 충돌 대응·큰 원본·일부 파일 부재를 시험한다. fsync/OS 전원 장애 내구성을 시험하지 않았다면 미검증으로 남긴다.

복원 후 jobs paused·egress deny·현재 법적 승인 재검토를 유지한다. 이전 metadata/신원/허용을 현재 실사용자로 승격하지 않는다.

## 15. 실무·보안·회귀 인수

최소 다음 집합을 실행한다.

- 332개 기준선과7개 브라우저 시험. 신규/수정/삭제 사유 및 이름 유지 검사.
- 52operation 각 adapter의 schema/실패/빈 응답/정상0건/partial/capture 범위.
- 실제 원문 bytes→파싱→첨부→fact→policy→decision의 동일성.
- 첨부 대신 로그인 HTML·큰 chunked·잘린 파일·MIME 오류·압축/파서 제한.
- 허용 host의 금지 redirect·DNS/연결 불일치·IPv6/로컬 목적지·key 유출0.
- 다중 process call permit·lease/fence·중단/재개·outbound 횟수.
- 실제 AI/intake/MCP/공개 API payload의 부모 연결·deny 시 outbound0.
- queue/로그/일지/평문 backup의 민감 fixture 부재.
- 철회/만료/정당한 해제/옛 파생물/복원의 버전 정책.
- 주제 선택·수동 fact 보완 보존·관련 승인만 무효화.
- S2 단일 실무 객체·S3 현재 제출/과거 지연·신규 위험성평가 시나리오.
- 29동결 및 프론트/배포 파일 변경0, 동기 endpoint 계약/기존 UI 재조회.

악성 문서 시험은 격리에서 무해한 fixture로 하고 실제 키/PC 내부 파일/외부 불법자료를 대상으로 하지 않는다. SSRF 차단 시험의 loopback 목적지는 모의 resolver/transport로 차단을 검증하며 운영4317에 실제 접속하지 않는다.

Golden 정답은 정책 작성 LLM의 자체 답변만으로 만들지 않는다. 공식 원문·별도 검토·holdout·미확정 목록을 연결한다. 자동 검토를 실제 전문가 승인으로 부르지 않는다.

거짓 위반·거짓 적합·거짓 비대상·불필요 보류·원문 버전 오류·기한 오류·출처 누락·권한 우회·전송 누락·재개 손실을 분모와 함께 측정한다. 실제 분모0은 null이다. 가상0오류를 운영/법률 정확도100%로 표시하지 않는다.

기존72개 인수는 원문/ID/이전 결과를 유지한다. 새로운 V4 항목을 별도로 추가한다. P0 실패가 있으면 관련 단계 완료를 보류하고 다른 작업은 진행한다. 시험 개수 맞추기·실패 시험 삭제·unsupported로의 임의 변경을 금지한다.

## 16. 단계별 종료조건과 산출물

`docs/implementation-v4/`에 다음을 남긴다.

- 기준선/전후 manifest/29동결/격리 환경/실행·실패·수정·재실행.
- 52operation 추적표와 첨부 추가 node·schema·fixture·원문/partial.
- capture 계약·원문/첨부 manifest·decoder/parser/validator/version graph.
- secure fetch·allowlist/redirect/DNS/크기/파서 guard·접근 권한 시험.
- 실제 HTTP quota/재시도 disposition/attempt budget/재개 시험.
- egress 실제 생성 경로 inventory·payload derivation·허용 사건·deny0.
- queue/저널/로그/backup 보호·TTL/hold/key 참조.
- 주제 route·수동 fact merge·S2/S3/S5 실무 trace.
- 위험성평가/수탁업체 정책·원문·새 하위 의무·기존 잔여37개 진도.
- 72개+V4 인수·측정/null·분야/실사업장/운영 차단.

V4-A 종료:52개 등록 추적이 완전하고 구현 지원 operation의 capture·첨부가 실제 adapter 경로로 시험된다. 기관/자격/문서 미확인은 정확한 gap으로 남긴다.52개 전부 live/원문을 검증하지 않았다면 ‘52개 완료’라고 하지 않는다.

V4-B 종료:지정한 실제 생성/전송 경로의 parent/payload 연결·queue 보호·철회/해제가 시험되고 미연결 경로는 없거나 명시적으로 차단된다. flag 존재/시험 직접 등록만으로 완료하지 않는다.

V4-C 종료:topic별 실제 정책 선택·S2/S3 업무 객체·수동 보완 보존이 기존 흐름에서 끝까지 작동한다. 실제 자료가 없으면 가상 범위만 종료한다.

V4-D 종료:우선6개 기존 추가 후보+대표/공유 하위 의무의 실행·원문·기한/예외·증거·보류가 검증된다. 원래43개 분모와 보충 분모를 구분한다. 법적 승인은 대기다.

V4-E 종료:회귀·실무·보안 시험과72개 전체 상태표를 해당 최종 sourceDigest에 귀속한다. 마지막 코드 변경 후 영향 시험과 최종 전체 검사를 다시 수행한다.

## 17. 최종 보고 형식

다음을 구분해 보고하라.

1. 실제 재확인한 기준선과 정확한 소스 식별.
2. 새로 구현/연결한 기능과 정적 관찰만 한 부분.
3. 실제 실행 성공·실패·수정 후 재시험.
4. 52개 원문/상세/첨부의 정확한 지원/검증 분모.
5. 파생/전송/queue 보호의 완료 범위와 차단 경로.
6. S2/S3/위험성평가의 실무 연결과 미확인 자료.
7. 43개 기존/추가 의무/실행 후보/원문 검토/전문가 승인의 별도 수치.
8. 아직 미구현·미검증·해석 미확정·[blocked]와 최소 해제 조건.
9. UI/UX 변경0, 운영 접속/배포/재시작/자료 변경0의 실제 확인 범위.
10. 다음 실행 묶음과 종료조건.

기술 시험·자료 확보·법적 원문 확인·전문가 승인·실사업장 적용·운영 serving은 다른 단계다. ‘전체 완료’, ‘법적으로 적합’, ‘운영 반영’을 증거 없이 쓰지 마라.

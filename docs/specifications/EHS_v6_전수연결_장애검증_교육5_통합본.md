# EHS v6 통합본: 전송·첨부 전수 연결, 장애 검증, 교육 5개 구현

- 법률 판단 기준일: **2026-10-08**. 이전 기준일을 유지한다.
- 조사일: **2026-10-09 KST**. 교육·평가·채용·작업변경의 실제 사건일은 별도다.
- 입력: 사용자 v5 결과 첨부 전문, 저장소 `docs/implementation-v5/`의 metrics·release-gate·정책/등록부·선택 서버 코드 및 공식 공개 자료.
- 저장소: `C:\Users\유준호\Documents\Codex\2026-10-02\1-x20\outputs\SH-E-Law-Check`.
- 이번 작업은 **읽기 전용 코드 조사·공식 자료 조회·다음 실행 지시 작성**이다. 앱 수정, 404개 시험 재실행, 운영 접속, 실제 키 사용, 배포, 규칙 활성화를 하지 않았다.

## CODEX 전달 방법

**이 통합본 하나만 전달한다.** 본문은 실무 사용안·조사·정정이며, 부록은 실행 프롬프트 v6 전체다. 부록 v6를 한 번 실행한다. v2~v5 지시를 처음부터 중복 실행하지 않는다. 결과 수치와 완료 상태는 이번 실제 실행 후에만 갱신한다.

# 1. v5를 어떻게 받아들일 것인가

v5는 기술적으로 진전했다. 공식 PDF/HWPX의 저장·추출, A07/A08 후보와 수동 보완, 동일 DB snapshot 기반 통합 복원, 공공 API 전송 admission, 보호 복사를 추가했다. 하지만 **기능 이름이 생긴 것과 실제 호출 지점까지 연결된 것은 다르다.**

읽은 `metrics.json`과 `release-gate.json`은 다음 기준선을 보고한다.

- HEAD: `e770bdefb32fbb6a010b435f372f2d13c9fb384f`.
- v5 sourceDigest: `630ad6a52597c544ef16590c4c15c9f0d1e3ad5c7dbe4fbeef50c0c4bb03b005`.
- 격리 시험 **404/404**, 기존 380 보존; 브라우저 **8+1=9**; 동결 파일 **29**.
- 원래 인수 **72**, 기존 정책 후보 **43+추가 2**, 서비스 **32**, operation **52**.
- 52개 합성 adapter 실행과 별개로, 이번 v5 공식 schema **2/52**, 독립 공식 응답 예시 **0/52**, 독립 관측 실응답 **0/52**, 실제 키 응답 **0/52**.
- 공식 파일 확보·파싱 **2개**와 별개로, 정부 고정 IP socket의 정상 원본 취득 **0/2**.
- 실제 전문가 승인 정답셋·법률 정확도·실제 사업장 검증의 분모는 **0**, 비율은 null.
- `productionReady:false`, 실제 승인·규칙 활성화 **0**.

이 수치는 v5 보고값이다. 이번 조사에서 전체 소스 digest를 새로 계산하거나 시험을 재실행한 것이 아니다. v6 시작 시 manifest와 작업트리를 실제 대조해야 한다.

**이번 목표:** 같은 미완료 문구를 반복하지 말고, 세부 미완료의 시작값→이번 증거→종료값을 남긴다. 큰 gate 12개의 ID와 과거 기록은 보존하되, 실제 조건을 충족한 세부 항목은 갱신한다. ID 보존은 상태를 영원히 고정하라는 뜻이 아니다.

# 2. 실무자의 기존 흐름은 그대로 유지한다

## 2.1 폐기물 수탁업체 검토

1. 기존 자료 업로드로 계약서·허가 자료·시설 식별 자료·처리능력 확인 자료를 넣는다. 실제 자료가 없는 이번 개발에서는 명확히 표시한 합성 자료만 사용한다.
2. 기존 질문 입력에서 “이 시설이 이 폐기물을 이 물량으로 위탁받을 수 있는지, 현재 처분 영향은 무엇인지”를 묻는다.
3. A07/A08은 원문 출처가 있는 **사실 후보**만 제안한다. 사업자번호가 같아도 시설까지 같다고 확정하지 않는다.
4. 허가 범위, 허가번호, 계약 대상, 현재 처리·보관 능력, 처분 효력은 각각 보완·독립 검토한다. API가 제공하지 않는 값은 만들지 않는다.
5. 기존 검토 화면에서는 기존 분류인 **추가 자료 필요**와 기존 추가확인·근거·조치 항목을 사용한다. 새 화면·버튼·문구·상태코드는 만들지 않는다.
6. 문서는 검토한 정확한 업체/시설/자료 버전과 연결한다. 관리용 증빙 묶음과 기존 일반 Markdown export를 같은 구현으로 주장하지 않는다.

실무 결론의 예: “업체 후보는 연결되었으나, 이번 계약의 처리시설·허가범위·수탁능력·처분 효력은 추가 확인이 필요합니다.” 이를 무허가·부적합 확정으로 바꾸지 않는다.

## 2.2 교육 5개: 이번에 실제 미구현을 줄일 흐름

기존 업로드→질문→검토→문서 흐름에 다음 정보를 연결한다.

- 익명 대상자·소속 사업장·업종·업무·관리감독자 해당 사실.
- 계약기간·입사일·직무 배치일·작업변경일·특별작업 종류.
- 교육 종류·실시일·시간·내용·강사·방법·출석/수강 증거.
- 면제·감경·간주를 주장하는 원문과 그 요건을 입증하는 자료.

질문 예: “입사 후 정기교육과 채용교육을 각각 충족했는지 확인하고, 부족한 자료와 교육을 구분해줘.”

처리 순서는 **대상 확인→적용 버전→교육 종류→기간·시간·내용·강사·방법→예외→증거 충분성→독립 검토**다. 출석표나 수료증이 있다는 이유만으로 다섯 의무를 동시에 적합 처리하지 않는다. 정기교육 시간으로 채용·특별교육을 임의 대체하지 않는다.

실무자는 기존 화면에서 부족한 사실과 자료를 확인한다. 프로그램은 “자료 없음”과 “교육 미실시가 확인됨”을 분리한다. 자료 보완으로 보류가 해제되는 것과 실제 추가 교육을 실시해 시정 완료되는 것은 별도 사건이다.

## 2.3 위험성평가

평가 실시일·최초 작업일·수시평가 유발 사건을 먼저 확인한다. 평가, 근로자 참여, 근로자대표 요구, 사전/사후 공유, 개선대책 이행, 기록은 독립 확인한다. 교육자료에 위험성평가 문구가 있다고 실제 평가나 공유를 자동 충족시키지 않는다.

## 2.4 외부 전송·문서 재사용·복원

- 자료 읽기, 로컬 문서 생성/다운로드, AI/MCP로 외부 전송은 서로 다른 권한이다.
- 요약·답변·문서·추출문에는 실제 부모 entity/version/hash를 붙인다. 요약의 승인이 원본의 전송 승인을 대신하지 않는다.
- 복원한 작업은 paused, lease 무효, 외부 전송 deny, 기존 승인은 재검토로 유지한다. 복원 후 자동 감시나 외부 호출을 재개하지 않는다.
- 이번의 재개 시험은 격리 합성 worker에 한정한다. 실무자의 실제 업무·계정·승인·운영 앱을 자동 생성하지 않는다.

# 3. 코드에서 확인한 실제 연결과 다음 경계

## 3.1 정부 첨부: 실패 원인 추정부터 하지 않는다

`server/attachments-v5.ts:8–35`에는 공식 두 파일을 발견·고정 IP 다운로드·서명/MIME 검증·보호 저장·파싱하는 helper가 있다. 그러나 helper가 있다는 것과 실제 격리 route/worker/adapter에서 호출된다는 것은 별도다. 조사한 범위에서 다른 서버 파일의 이 helper 참조가 확인되지 않았다. 운영 시작점에 미등록한 것은 기존 금지사항을 지킨 정상 상태이며, 이를 운영 등록 지시로 바꾸지 않는다.

v5 보존 진단:

- 법제처 PDF: peer `27.101.207.66`, HTTP 200, `text/html`, 5,786 bytes.
- 고용노동부 HWPX: peer `27.101.220.190`, HTTP 200, `text/html`, 1,897 bytes.
- 둘 다 파일 서명이 아닌 HTML 오류 응답으로 차단되었다.

`attachments-v4.ts`는 HTTPS·host/path·공개 IPv4·실제 peer·리다이렉트/encoding 제한을 적용한다. `https.request(URL)`에 DNS lookup pin과 `servername:u.hostname`을 이미 공급한다. **“SNI가 없어서 실패했다”는 근거는 없다.** Node 공식 문서의 SNI 설명은 조사 체크리스트의 근거이지 이번 실패 원인의 증명이 아니다.[R07]

다음에 좁게 확인할 것:

- 공식 페이지에 실제 게시된 정확한 파일 ID·다운로드 경로·query와 discovery 원문 hash.
- 요청의 실제 Host·SNI·Accept/Accept-Encoding/User-Agent, DNS 전체 결과와 선택 IP·실제 peer.
- redirect 여부·최종 응답 MIME·길이·서명·공개 오류 문서 분류.
- 연구 취득과 앱 socket의 경로/환경 차이. cookies·proxy·인증정보의 **값은 기록하지 않는다**.

보안 검사를 완화해 HTML을 원본으로 저장하거나 browser 연구 fetch를 앱의 pinned transport로 대체하지 않는다. 정상 파일 취득이 끝내 불가능하면 공식 원본의 수동 공급·암호 보존·검증은 별도 fallback으로 제공하고, 자동 취득 gate는 미완료다.

## 3.2 AI/intake·MCP와 재사용

`server/ai.ts:194–228`에서 `hasPayloadExecution()`이 없으면 기존 v3 `requireEgress`의 digest 검사가 있다. 따라서 **“context가 없으면 아무 권한 검사 없이 전송한다”는 설명은 틀리다.** 문제는 v3 digest 승인과 v4 payload 검사만으로 v5 admission·전송 직전 철회·정확한 모든 부모 연결이 전수 완료되지 않았다는 것이다.

근거:

- `server/admission-v5.ts:5–41`: SQLite intent와 철회 관찰.
- `server/egress-execution-v4.ts:5–13`: trusted host context와 파생 primitive.
- `server/provenance-v4.ts:26–58`: 부모 존재와 각 부모의 grant.
- `server/mcp.ts:23–34`: serialized args 경로.
- `server/migration-v5.ts:42–47`: 정확한 evidence ref 없는 legacy digest 자동 승격 거부.

v6는 실제 생성/송신 지점에서 부모를 서버가 확정하게 한다. 관리 대상 private payload의 context가 누락되거나 부모가 불명확하면 차단한다. summary·MCP 결과·재사용 문서·export까지 연결한 뒤에만 범위를 넓힌다. 기존 일반/공개 경로를 관리 private 자료로 오인해 무조건 중단하거나, 반대로 private 자료를 public으로 재분류하여 검사를 우회하지 않는다.

**로컬 export에 외부 전송 grant를 무조건 요구하지 않는다.** 정확한 부모와 읽기·문서 생성 권한을 검증한 로컬 export, 대상 기관/목적/범위를 승인한 외부 전송을 별도 계약으로 둔다. 기존 일반 export 포맷·동선을 바꾸지 않고 backend에서 증빙 parent를 연결한다.

## 3.3 보호 복사와 재개 가능한 이관은 다르다

`migration-v5.ts:12–40`은 running job을 거부하고 암호 복사·hash·중복 실행을 확인한다. 보고는 `resumeVerified:false`, `plaintextRemovalComplete:false`다.

v6는 paused/미실행 합성 작업을 보호 저장으로 전환하고 실제 worker가 재개·중단·재시작·재개할 때 원래 평문을 다시 읽지 않는지 확인한다. source/case/review/error/audit trace의 분류와 잔류도 검사한다. 복사 성공만으로 읽기 경로 이관이나 평문 제거 완료를 선언하지 않는다. **원본 평문 삭제는 이번에 금지**하며 별도 보존·hold·삭제 승인을 요구한다.

## 3.4 전체 복원: 현재 성공 범위보다 장애를 좁혀 추가한다

`backup-v5.ts:39–123` 및 `tests/v5-runtime.test.ts:94–127`, `tests/v5-process.test.ts:24–42`는 동일 snapshot 묶음, 세대 복원, paused/deny, 실패한 미공개 세대, 별도 프로세스 중단과 잠금 회복을 다룬다.

추가해야 할 것은 동시 원본 변경, 참조 불일치, 디스크 부족, 쓰기/rename/권한 실패, 잘린 archive, 키 버전 불일치, 경로 alias, 공개 cache 분류다. SQLite 트랜잭션의 원자성만으로 외부 파일·세대 포인터·OS flush·키 전달이 함께 원자적이라고 보장하지 않는다.[R08–R10]

# 4. 공식 API 명세: 이번 조사에서 확보한 두 추가 operation

## 4.1 `accident-files:Disaster_attach_api02`

공식 페이지를 실제 열고 operation의 입력과 응답 Model/Example 화면을 보존했다.[R03]

- 입력: `serviceKey` 필수 string, `pageNo`·`numOfRows` 필수 integer, `boardno` 필수 string, `callApiId` 필수 integer 고정값.
- 본문 설명에는 `ServiceKey`, Swagger에는 `serviceKey`라는 표기 차이가 있다. 이를 실응답으로 해소했다고 주장하지 않는다.
- 응답: `header.resultCode/resultMsg`, `body.items.item.{filenm,boardno,filepath}`, `numOfRows/totalCount/pageNo`.
- 이번 UI에서 callApiId의 실제 고정값은 확보하지 못했다. 참고문서 등 공식 원문으로 추가 확인해야 하며 숫자를 만들지 않는다.
- `filepath`는 다운로드 후보이지 허용 host·경로·정상 파일·완전한 첨부목록 증명이 아니다.

Swagger의 `"string"`, `0` Example은 모델 생성값이다. **독립 공식 실응답 예시로 세지 않는다.** 한 건 object 표시도 실제 다건 array 관측으로 바꾸지 않는다.

## 4.2 `guide:getKoshaGuide`

공식 operation 입력·응답과 오류 설명을 보존했다.[R04]

- 입력: `serviceKey` 필수 string, `callApiId` 필수 string, `pageNo/numOfRows/techGdlnNm/techGdlnNo/ofancYmd`.
- 공식 오류 설명 99에 `callApiId = 1050` 입력이 명시된다. 이 값은 문서 확인값이며 실제 호출 성공값은 아니다.
- 응답: `techGdlnOfancYmd`, `techGdlnNm`, `techGdlnNo`, `fileDownloadUrl`; 페이지/count 필드가 string으로 표시된다.
- **검색 필드 `ofancYmd`와 응답 필드 `techGdlnOfancYmd`를 동일 필드명으로 임의 치환하지 않는다.**
- KOSHA GUIDE는 해당 공식 페이지에서도 법적 구속력이 없는 기술적 권고라고 구분한다. 지침 번호나 다운로드가 존재한다고 법적 위반 기준으로 활성화하지 않는다.

두 operation의 연구 증거가 추가되었다고 앱의 schema 검증값을 즉시 4/52로 고치지 않는다. 정확한 stableId·버전·필수값·decoder·mapper·시험을 연결한 실행 결과 후에만 올린다. 기존 A07/A08 2개와 이번 2개는 서로 중복되지 않는지 확인한다.

## 4.3 나머지 50개를 조사하는 방법

v5 등록부의 32개 서비스·52개 stableId 전부를 유지한다. operation마다 공식 페이지/참고문서/Swagger·필수 입력·응답 필드/형식·에러·수정일·비용·신청/운영 조건·트래픽·첨부 의미를 별도 기록한다. 공개 명세 조회와 키를 넣는 API 실행은 다르다.

- 공개 자료만으로 확보 가능한 50개 명세는 계속 조사·연결한다. 우선순위는 accident-files→guide→accidents→sif→나머지다.
- MSDS의 여러 operation을 “서비스 페이지 하나 봄”만으로 모두 검증 완료로 세지 않는다.
- 신청 가능 트래픽 `개발계정 1,000` 표시는 리셋 시간·공유 계정 범위·1일 기준을 자동 입증하지 않는다.
- 기관 설명/AI Summary는 필드 schema나 실제 상세·첨부 제공 능력의 증거가 아니다.
- conditional/304/range 지원을 일반 HTTP 표준이 있다는 이유만으로 기관이 지원한다고 가정하지 않는다.
- 명세 없음/오류/로그인 요구면 재시도·대체 공식 참고문서 조회 후 부족한 항목을 기록한다. 실제 키·활용신청·운영계정 승인으로 넘어가지 않는다.

# 5. 교육 5개에 사용할 공식 근거와 실무 정정

## 5.1 기준일 법령

[MCP 확인] 기준일 2026-10-08:

- 산업안전보건법 제29조·제30조: 법률 제21374호, 해당 조회 버전 MST **283449**.
- 시행령 제2조·별표 1: 대통령령 제36540호, MST **288347**.
- 시행규칙 제26조·제27조·별표 4/5: 고용노동부령 제477호, MST **288431**, 버전 표시 시행 2026-08-01.
- 안전보건교육규정: 고용노동부고시 **2025-77**, 시행 2025-11-27, 일련번호 **2100000269024**. 제2~7조·제9조를 별도 조회했다.

MCP 고시 본문 응답은 전체 85,390자 중 앞부분 약 49,942자에서 잘린다. 해당 파일을 고시 전문 전수 확보라고 부르지 않는다. 필요한 조문은 별도 조회했고, 방법별 별표·부칙을 사용하는 구현은 추가 원문 대조해야 한다.

[정부 안내] 고용노동부는 2026-07-21 게시물에 **2026년 안전보건교육 안내서** ZIP을 제공한다.[R02] 이번에 ZIP 3,610,153 bytes, 내부 PDF **4,458,061 bytes·253쪽**을 취득·텍스트 추출했다. PDF 표지에는 **2026-07-01 시행 중인 법령·고시 기준**임을 명시한다. 따라서 이 안내서가 기준일 10월의 모든 개정을 전수 반영한다고 주장하지 않는다. 현행 별표/조문을 우선 대조하고, 안내서는 실무 해설과 증빙 방향으로 사용한다.

## 5.2 5개 후보의 기본 분기

다음 값은 시행규칙 별표 4의 기본값이다. 먼저 업종·대상·예외·사건일을 검토한다. 전체 사업장에 일괄 적용하지 않는다.

### `training.periodic`

- 사무직: 매반기 6시간 이상.
- 판매업무 직접 종사: 매반기 6시간 이상.
- 그 밖의 근로자: 매반기 12시간 이상.
- 관리감독자 연간 16시간은 별도 `training.supervisor`로 평가한다.

“모든 직원 분기 3/6시간”이라는 오래된 검색 결과를 현재 규칙에 사용하지 않는다. 직함이 사무직이라는 이유만으로 업무·근무 장소 확인 없이 사무직 분기를 확정하지 않는다.

[정부 안내] 안내서 인쇄 p.20/PDF 24쪽은 반기를 입사일부터 6개월로 설명한다. 인쇄 p.123/PDF 127쪽은 입사일 기산을 원칙으로 하되 교육관리 편의를 위한 회계연도 조정과 적절한 분할 계획을 예외적으로 설명한다. **단순히 1~6월·7~12월을 모든 직원의 자동 기본값으로 고정하지 않는다.** 입사일 원칙, 회사 운영 방식, 전환 계획과 검토 근거를 분리한다. 설명 사례의 “약 1개월 2시간”을 모든 중도입사자에 대한 법정 비례식으로 일반화하지 않는다.

### `training.recruitment`

- 일용 및 계약기간 1주 이하 기간제: 1시간 이상.
- 계약기간 1주 초과 1개월 이하 기간제: 4시간 이상.
- 그 밖: 8시간 이상.
- 법 제29조제2항 단서의 건설 일용 기초교육 등은 별도 요건을 확인한다.

직무 배치 전 실시를 확인한다. “기간제는 모두 8시간”, “1개월은 항상 30일”, “공통 입문교육이 있으니 안전보건교육 충족”으로 단순화하지 않는다. 계약서가 특정한 달/주 기간과 시작·끝을 확인한다. 경계의 법적 기간 계산이나 계약 변경 적용이 미확정이면 보류한다.

### `training.work_change`

- 일용 및 계약기간 1주 이하 기간제: 1시간 이상.
- 그 밖: 2시간 이상.
- 기존 작업과 새 작업의 실질 및 변경 작업 수행 전 실시를 확인한다.

부서 이동만으로 작업 변경을 자동 확정하거나, 직책명이 같다는 이유만으로 변경 없음으로 확정하지 않는다.

### `training.special`

- 시행규칙 별표 5 제1호라목의 작업과 대상자·작업 사건을 연결한다.
- 일용/1주 이하 기간제의 일반 해당 작업: 2시간 이상; **현행 제39호 작업**은 8시간 이상.
- 그 밖 대상 근로자: 일반 16시간 이상, 최초 작업 전 4시간 이상과 나머지 12시간의 3개월 내 분할 가능 여부를 나누어 확인.
- 단기간·간헐적 작업은 2시간 분기이나, 정의·실제 작업 기간/일수·관련 고시 요건을 확인한 경우만 적용한다.

옛 별표의 제40호와 현행 제39호를 번호만으로 동일 취급하지 않는다. 특별교육을 실제 충족하면 시행규칙 제26조제1항에 따른 채용/작업변경 교육 간주를 검토할 수 있지만, **추가자료 필요인 특별교육으로 간주부터 적용하지 않는다.** 4시간 완료를 16시간 최종 완료로 표시하지 않는다. 특별작업별 내용·공통 내용·강사·방법을 각각 확인한다.

### `training.supervisor`

- 관리감독자 지위와 업무 사실을 먼저 확인한다.
- 별표 4 제1호의2의 정기교육은 연간 16시간 이상이다.
- 해당 지위의 채용/작업변경/특별교육에 별도 기본표가 있으므로 일반 근로자 단기계약 분기를 무조건 우선하지 않는다.
- 별표 5의 관리감독자 교육내용, 고시 교육방법, 면제·감경·간주를 확인한다.

관리감독자 정기교육과 시행규칙 제29조의 안전보건관리책임자·안전관리자 등 직무교육은 다르다. 관리감독자에게 모든 직무교육의 3개월/2년 주기를 일괄 적용하지 않는다. 이번 기존 5개 ID에 새 직무교육 의무를 몰래 추가하지 않는다.

## 5.3 예외와 이수 증거

- 시행령 별표 1은 업종/사업장별로 제외되는 법 조항을 다르게 둔다. 업종과 규모 하나만으로 법 전체 비대상을 선언하지 않는다.
- 별표 4 비고의 일부 사업/50명 미만 도매·숙박·음식점 감경, 시행규칙 제27조의 전년도 무재해·다른 교육·경력/동일 작업 등, 고시 제9조의 체험/직무/강사 특례는 **요건·대상 교육·기간·증거를 각각 연결**한다.
- 무재해 감경은 API 검색 0건으로 확인하지 않는다. 산업재해율/관련 사실과 별도 검토가 필요하다.
- 여러 감경·간주를 일괄 중첩하거나 동일 교육 세션을 중복 가산하지 않는다. 조합 근거가 확인된 분기만 계산하고 나머지는 검토로 보류한다.
- 강사 자격, 교육 내용, 방식별 출석·수강·실시간 상호작용 등의 요건은 확인한 원문으로 분기한다. 단순 이름·파일 제목·온라인 접속 시간이 이수시간 전체를 입증하지 않는다.

## 5.4 교육 기록 “5년”의 정확한 의미

[정부 안내] 안내서 인쇄 p.126–127/PDF 130–131쪽:

- 일반 법 제29조 교육실시 결과에 특정 서식을 정하여 기록·보존하도록 의무화한 것은 아니라고 설명한다.
- 교육 실시를 감독 시 충분히 증명할 수 있어야 한다고 설명한다.
- 과태료 시효 5년을 이유로 교육 자료 보존·증빙이 **바람직**하다고 설명한다.

따라서 일반 교육 기록에 대해 `법정 보존기간=5년`, `기간 내 파일 삭제=법 위반`을 자동 생성하지 않는다. 법정 기록의무, 교육 실체, 증명 충분성, 기관/원격교육의 별도 출결 기록, 내부 보관정책을 분리한다. 내부 5년 보관을 선택하면 **운영 권고/내부정책**으로 표시하고 실제 채택 승인은 별도다. TTL로 법적 hold 자료를 삭제하지 않는다.

# 6. 위험성평가 미확보 원문: 이번에 좁게 보완한 것

v5에서 미확보였던 2026-05-31 적용본을 유효한 파라미터로 다시 조회했다.

- [MCP 확인] 2026-05-31: 시행규칙 MST **271485**, 버전 시행 2026-01-01, 제37조는 평가 실시내용/결과 기록·보존. 포함 항목과 **3년 보존** 문구를 확보했다.
- [MCP 확인] 2026-06-01: MST **286657**, 고용노동부령 제470호. 제37조는 방법·절차·시기이며 최초 작업 전, 최초평가 연도의 다음 연도부터 연 1회 이상, 수시 사건의 관련 작업 전으로 구분한다.
- [MCP 확인] 기준일 시행규칙 MST **288431**: 제37조의2 참여, 제37조의3 공유, 제37조의4 기록·3년 보존을 별도로 확보했다.

참여는 순회점검과 병행 방법, 순회 참여가 불가능한 특별한 사정의 대체 방법을 구분한다. 설문/면담 파일만 있다는 이유로 모든 참여 의무가 충족된다고 하지 않는다. 공유는 실시 전 일정과 실시 후 유해위험요인·수준결정·개선대책 및 이행 결과를 구분한다. 법 제36조의 근로자대표 요구/참여도 별도로 확인한다.

[정부 원문] 법률 제21374호 개정문 부칙은 **제36조 적용을 시행 후 실시하는 평가부터**로 정한다. 제36조의 개정 시행은 2026-06-01이며 일부 다른 조항은 2026-08-01, 제재 일부는 2027/2028 단계 시행이다.[R05] **현행 버전 헤더 2026-08-01을 제36조 전체의 최초 시행일로 사용하지 않는다.** 의무 시행, 법령 버전 표시, 적용례, 제재 시행은 서로 다르다.

고용노동부 제470호 공식 게시물도 공포 2026-05-29·시행 2026-06-01을 명시한다.[R06] 다만 모든 하위 규정·세부 대상·제재의 전문가 검토가 완료된 것은 아니다.

MCP의 현재 위험성평가 지침 연혁 검색은 제2024-76호를 현행으로 표시한다. 이는 검색 DB 관측이며 **2026-461 행정예고의 후속 확정 공표가 없다는 전수 증명은 아니다**. 공식 고시/부처 공표를 추가 확인하고, 행정예고를 시행 지침으로 활성화하지 않는다.

# 7. 전송 admission의 보장 범위

SQLite의 동일 DB 트랜잭션에서 revoke commit이 admission보다 먼저라면 새 admission을 거부한다는 논리적 순서와, admission 이후 실제 socket 송신의 물리적 순서는 구분한다.

- 전송 시작 전 재검사, 진행 중 취소와 관찰을 실제 HTTP/AI/MCP transport에 연결한다.
- 25ms polling은 철회 관찰 간격이지 즉시 차단 보장이나 최대 유출량 보장이 아니다.
- 실제 첫 송신 byte를 관측하지 못하면 `unobserved`로 남긴다. 응답 bytes·body 크기와 혼동하지 않는다.
- 이미 보낸 bytes는 회수하지 못한다. 취소를 자동 재시도 가능한 네트워크 실패로 분류하지 않는다.
- 요청·MCP args만 아니라 결과·요약·답변·문서와 재전송/재사용의 부모도 보호한다.
- 권한을 확인한 뒤 전송하는 동안 DB write lock을 잡고 기다리지 않는다.

Node Permission Model은 악성 코드를 방어하는 OS sandbox가 아니라 신뢰 코드의 자원 오사용을 제한하는 모델이다.[R11] 옵션 이름·지원 범위는 실제 고정 런타임에서 확인한다. 최신 문서에 옵션이 있다고 v26.7.0에 모두 존재한다고 가정하지 않는다. audit mode는 차단 모드가 아니다. 권한 drop도 이미 열린 socket/FD/process를 자동 닫지 않으므로 취소/종료는 앱 책임이다. 파서 보안 결과를 “악성 파일 OS 완전 격리 완료”로 확대하지 않는다.

# 8. 복원·이관 장애를 어떻게 검증할 것인가

기술 설계 권고이며 새로운 법정 의무 목록이 아니다.

1. **archive/참조:** 잘림·길이/hash 불일치·부모 누락·불명 테이블/원본·wrong tenant/key version에서 공개 전 실패.
2. **동시 변경:** snapshot 취득 후 원본 변경/삭제, 동일 파일 다중 참조, writer와 백업 경쟁. 불일치 시 fail closed, 오래된/새로운 원본을 임의 혼합하지 않음.
3. **파일시스템 장애:** stage write·flush·manifest·rename·pointer publish 각각에 ENOSPC/EACCES/EPERM/IO 오류를 주입. 이전 세대가 유지되고 미공개 세대는 노출되지 않음.
4. **중단/잠금:** 앱 소유의 격리 child만 중단; lease/PID 재사용 가능성·archive hash·작업영역까지 확인한 lock recovery. 살아 있는 다른 restore의 lock은 회수하지 않음.
5. **Windows 경로:** canonical containment·junction/ADS/중복·case alias·공유 원본을 검사. 상위 디렉터리 link 및 TOCTOU도 한계를 기록. 권한 모델만으로 link escape 방어를 끝냈다고 하지 않음.
6. **키/캐시:** 잘못된 키·버전·키 미공급 거부; 운영 키 생성/회전 금지. 공개 cache는 복원 포함/제외/재수집과 필요한 원문 참조를 manifest에 구분.
7. **이관 재개:** checkpoint 전후 crash·중복 이관·worker 재개·lease/fence·철회·TTL/hold·오류 trace 보호를 실제 합성 실행으로 검증.

에러 주입은 코드의 fail path 시험이다. **실제 디스크 부족·Windows ACL·전원 차단**과 구분하여 환경에서 실제 한 항목만 해당 등급으로 기록한다. 운영 디스크를 채우거나 사용자 프로세스/ACL을 건드리지 않는다.

# 9. 12개 gate의 갱신 원칙

원래 ID: `A-attachments`, `A-schemas`, `A-quota`, `A-conditional`, `B-egress`, `B-queue`, `B-backup`, `C-cases`, `D-policy`, `D-next`, `E-site`, `E-production`.

- 큰 gate를 완료로 하려면 기존 close 조건 전체와 이번 증거를 대조한다. 부분 완료를 전체 완료로 승격하지 않는다.
- 각 gate 내부에 subcheck를 두어 `기준선/이번 구현/시험/공식 근거/차단/잔여`를 누적한다. 새 subcheck는 법적 의무가 아니라 검증 단위다.
- 전체 schema 52개가 아직 미완료여도 확인한 operation은 정확한 개수와 부족한 필드로 남긴다.
- A-quota는 provider의 공유계정·리셋·한도 공식 규칙과 합성 경쟁/fence 시험을 구분한다.
- A-conditional은 기관 지원이 미확인이면 비활성 경로로 유지한다. 304에서 원문 없는/다른 표현·버전·범위의 cache 재사용을 금지한다.
- E-site는 실제 자료/권한자 검토가 없어서 차단, E-production은 이번 요청에서 금지다. 이를 CODEX 판단이나 합성 actor로 해제하지 않는다.
- 교육 5개를 전부 독립 구현·시험한 경우에만, 기존 43개 중 실행 후보가 **12→17**, 원래 미구현 후보가 **31→26**으로 줄었다고 쓸 수 있다. 추가 2개는 별도다. 이는 구현 후보 수이지 전문가 승인·법률 정확도·운영 활성화 수가 아니다.

# 10. 공식 출처 및 보존 위치

근거 폴더: `C:\Code\6. Aside\2026-10-08_EHS_판정기준_구현설계\원문근거\v6\`.

- 사용자 첨부 전문과 v5 metrics·gate·manifest·정책·전송·이관·복원 보고를 보존했다.
- 교육 법령/별표 MCP 원문, 파라미터 오류와 재조회 성공, 교육 고시의 부분 본문과 별도 조문, 위험성평가 연혁·경계 조문을 구분하여 보존했다.
- 안내서 ZIP/PDF·전체 추출문 및 명세 화면 snapshot을 보존했다. PDF SHA-256: `833666998c09a52db13ed42561514e9d2258104e79836d39e44194aef4fbc45c`.
- 이번 연구 fetch가 앱의 보안 downloader/격리 파서/이관/시험을 통과한 증거는 아니다.

[R01] 국가법령정보센터 시행규칙 기준일 버전
https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=288431

[R02] 고용노동부 2026년 안전보건교육 안내서 게시물/ZIP
https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20260700685
https://www.moel.go.kr/common/downloadFile.do?file_seq=20260701173&bbs_seq=20260700685&bbs_id=29&file_ext=zip

[R03] 국내재해사례 첨부파일 공식 명세
https://www.data.go.kr/data/15121008/openapi.do

[R04] KOSHA GUIDE 공식 명세·권고 성격
https://www.data.go.kr/data/15144147/openapi.do

[R05] 산업안전보건법 제21374호 개정문·부칙
https://www.law.go.kr/LSW/lsRvsDocListP.do?lsId=001766&chrClsCd=010102

[R06] 고용노동부 제470호 공포/시행 게시물
https://www.moel.go.kr/info/lawinfo/revision/view.do?bbs_seq=20260501222

[R07] Node TLS: SNI·서버명·인증 검증
https://nodejs.org/api/tls.html

[R08] SQLite Online Backup
https://www.sqlite.org/backup.html

[R09] SQLite Atomic Commit
https://www.sqlite.org/atomiccommit.html

[R10] SQLite 오류 코드
https://www.sqlite.org/rescode.html

[R11] Node Permission Model의 제한
https://nodejs.org/api/permissions.html

[R12] 안전보건교육규정 제2025-77호
https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000269024

[R13] SIF 공식 페이지: 다음 schema 확인 대상, 이번 완전 model 검증 아님
https://www.data.go.kr/data/15161362/openapi.do

MCP 조회: `https://mcp.gomdori.app/law`. 무키 공개 조회를 사용했고 실제 사용자 OC/API 키를 넣지 않았다. 근거 태그는 확인 범위만 의미하며 전문가 법률 승인은 아니다.

---

# 부록. CODEX 실행 프롬프트 v6 전체

아래를 이번 한 차례 격리 개발 실행의 지시로 사용한다. 위 본문은 조사·정정 자료다. 구현한 v5를 재사용하고 기존 기능을 다시 새로 만드는 방식으로 시작하지 않는다.

## 0. 목표와 우선순위

EHS 준수평가 시스템의 현재 v5에서 UI/UX를 완전히 동결한 채 실제 backend 연결·공식 명세·장애 검증·교육 5개를 완성해 미구현/미검증을 줄여라.

우선순위는 다음 세 트랙이며 서로 독립인 범위는 병행한다.

- T1 연결/보안: 정부 첨부 helper의 실제 격리 등록, provider별 첨부 graph, AI/intake/MCP/재사용/export의 정확한 parent와 admission, 보호 이관 재개.
- T2 자료/내구성: 52 operation 공식 명세 대조, quota/conditional의 지원 증거, 통합 복원 장애 매트릭스.
- T3 업무 규칙: 기존 ID의 교육 **5개**를 backend 독립 실행 후보로 구현하고 기존 질문·검토·문서에 연결. 위험성평가 날짜 profile/구·신 조문 정정.

정부 서버의 HTML 오류나 실제 키 승인 부재에 막혀도 T2의 공개 명세와 T3를 계속 진행한다. 외부 금지를 이유로 가능한 내부 구현까지 중단하지 않는다. 반대로 이번 실행에서 확보할 수 없는 기관 실응답·전문가 승인·운영 연결은 만들어내지 않는다.

## 1. 절대 변경·실행 금지

1. UI/UX, 기존 화면, 버튼, 사용자 동선, 메뉴, 문구, 스타일, `src/**`는 수정하지 않는다.
2. v5 `ui-freeze.json`의 29개를 정확히 대조하고 그대로 동결한다. 기존 shared 파일을 수정하거나 새 shared 파일을 만들어 우회하지 않는다. 패키지/lock/빌드/배포/config 동결도 유지한다.
3. 기존 동기 endpoint의 상태/응답 계약을 202 접수 방식으로 바꾸지 않는다. 신규 관리 API는 격리 앱에서 명시적 host grant로만 등록한다.
4. 운영 앱·운영 DB·`.local` 실제 자격/실자료·4317·실제 인증값/키·live keyed API·배포·재시작·운영 파일 교체·자동 감시·법적 규칙 활성화는 접근/실행 0이다.
5. 실제 사업장 판정·검토자/승인자 신원·승인 권한·전문가 승인·사용자 승인·운영 승인을 생성하지 않는다. 합성 actor/grant는 격리 시험용이라는 표시를 유지하며 실제 승인으로 승격하지 않는다.
6. 평문 원본 삭제, 실제 키 회전, OS 계정/ACL 변경, 운영 디스크 채우기, 사용자 프로세스 종료, 외부 OCR/LLM 전송은 금지한다.
7. 별도 UI를 만들거나 새 권한 입력 화면을 요구하지 않는다. 새로운 metadata는 backend 관리 계약·CLI·시험에서 처리하고 기존 shared 계약에 유출하지 않는다.

사용자 추가 승인 없이는 금지 범위를 해제하지 않는다. CODEX 자체 판단은 사용자 승인으로 보지 않는다.

## 2. 시작 기준선·작업트리·검증 방식

- 사용자 v5 첨부와 `docs/implementation-v5/`를 읽고 HEAD/sourceDigest/시험 inventory/동결/metrics/gate를 대조한다.
- 보고 기준: 404 시험, 브라우저 9, frozen 29, acceptance 72, original policies 43+additional 2, services 32, operations 52.
- 이전 v5 sourceDigest는 본문 값이다. 현재 소스와 불일치하면 diff와 원인을 먼저 기록한다. 이미 있던 미커밋 변경을 reset/clean/덮어쓰지 않는다.
- 기존 404와 브라우저 9를 격리 환경에서 먼저 재시험한다. 실패는 숨기거나 삭제하지 말고 수정 전/후 로그를 보존한다. 최소/기대 개수를 최종 통과 개수로 미리 쓰지 않는다.
- 시험 앱/DB/파일은 이 작업의 격리 디렉터리를 사용한다. 실제 앱, 4317, 사용자 브라우저 세션에 접속하지 않는다. 격리 child의 PID·작업영역·소유권을 기록한다.
- 법률 기준일은 2026-10-08, 조회일과 실제 교육/작업/평가 사건일은 별도다.

## 3. 첨부 helper의 실제 호출 경로

`attachments-v5.ts` 단독 helper의 직접 시험에 그치지 말고, 명시적 권한을 가진 격리 관리 route/worker/adapter에서 provider 발견→다운로드→원문 보호→파싱→사실 후보/문서 근거로 연결되는 경로를 등록한다. 운영 시작점 등록은 금지다.

- API caller가 URL·discoveryHash·host·원문 버전을 제출했다는 이유만으로 신뢰하지 않는다. 서버가 보존된 provider 페이지/응답, file ID, exact URL, hash, 출처/버전을 대조하여 발견 객체를 만든다.
- raw capture, metadata, attachment, extraction은 각각 ref/hash와 관계를 남긴다. PDF 표현본과 HWP master를 구분한다.
- 실제 두 정부 socket 실패를 재현/진단하되 요청/응답 조건만 정확히 관찰한다. SNI는 현재 코드에도 존재한다. 원인이 확인되기 전 단정하지 않는다.
- TLS 인증·Host/SNI 정합·DNS 공개주소·실제 peer pin·redirect·encoding·MIME·서명·길이 제한을 완화하지 않는다. `rejectUnauthorized:false`, 임의 proxy, Cookie/Authorization 전달, API 키 추출, browser fallback fetch를 production transport로 넣는 것은 금지다.
- 공식적으로 확인한 무인증 공개 다운로드 흐름만 좁게 구현한다. User-Agent 등 일반 헤더 변경은 확인한 사실/정책에 근거하고 WAF/CAPTCHA·접근통제 우회 수단으로 사용하지 않는다.
- 정상 원본이면 bytes/hash/형식/페이지 또는 ZIP 구조/원문 대조까지 확인한다. HTTP 200 HTML·오류/로그인·불명 MIME·잘림은 attachment_failed/more_data이고 원본 성공 아님.
- 공개 오류 본문은 제한적으로 보존하고 HTML 실행 금지. 인증값·cookies·query의 민감값은 로그/trace에서 제거한다.

이번 본문의 연구 ZIP/PDF는 수동 공급 표본으로 사용할 수 있지만 해당 socket 성공이나 앱 파서 성공을 대신하지 않는다. 장애 기록은 유지한다.

## 4. provider별 첨부 graph와 parser/OCR

- accident→boardno→attachment metadata의 `filepath/filenm/boardno` 연결, guide→`fileDownloadUrl`, sif→실제 확인한 첨부 필드만 provider별 등록한다.
- 임의 download URL을 host/path prefix 허용으로 확대하지 않는다. 정확한 등록 정책과 redirect 각 hop·file ID·DNS/peer를 검증한다. URL/파일명의 path traversal·ADS·중복·압축 경로·symlink·DTD/entity·nested ZIP·개수/크기/ratio/CRC 제한을 유지한다.
- 공식 metadata schema와 실제 첨부 bytes·parser 추출·원문 셀 대조·OCR를 다른 증거 등급으로 기록한다.
- PDF/HWPX parser는 실제 고정 Node 런타임과 제한 child에서 시행한다. 자원 권한 오류는 필요한 최소 read 범위를 정확히 수정하며 네트워크/write/addon/child/WASI/FFI/inspector 등을 통째로 허용하지 않는다.
- Node Permission Model의 OS sandbox 한계를 문서/metrics에 유지한다. 최신 문서 옵션을 현재 런타임에서 capability 확인 없이 사용하지 않는다. audit mode 시험을 enforce mode 성공으로 바꾸지 않는다.
- OCR 엔진 설치·외부 OCR/API·패키지 변경이 필요한 경우 실행하지 않는다. `needs_ocr`·취소·보류를 유지하고 설치/OS 격리/원문 대조가 남았음을 표시한다. 필요하면 기존 설치 엔진에 대한 최소 backend adapter를 비활성 계약으로 작성하되 실제 OCR 성공을 주장하지 않는다.

## 5. 52개 공식 명세 대조

`api-registry.json`의 32/52와 stableId를 보존하며 모든 operation에 source row를 둔다.

필수 항목: 공식 URL·문서/수정일·operation path·필수 입력/타입/고정값·key param 표기·정상/오류 응답·빈/단건/다건·페이지/count·상세/첨부 역할·이용 조건/트래픽·version/hash·조회일·미확인.

- 먼저 본문 accident-files/guide의 공개 화면 증거를 실제 adapter/decoder/mapper와 대조한다. guide의 callApiId 문서값 1050, 검색/응답 날짜 필드 차이를 반영한다.
- accident-files 고정 callApiId는 공식 참고문서로 확인해야 한다. 빈 값/명세 설명만으로 숫자를 만들어 호출하지 않는다. ServiceKey/serviceKey 표기 충돌은 관측 한계와 사용한 문서 근거를 남긴다.
- 이후 accidents/sif 및 나머지 공개 명세를 계속 확인한다. 한 서비스의 여러 operation은 각각 대조한다.
- Swagger 생성 `string/0`는 model example. 독립 공식 response example과 별개다. 합성 fixture, 공식 schema 기반 합성 fixture, 독립 공식 응답 예시, 독립 관측 실응답, 실제 키 응답을 독립 열로 둔다.
- 기존 schema 2/52가 늘었다면 정확한 추가 stableId와 독립 대조/시험 근거를 제시한다. 모든 operation row가 존재한다고 52/52 schema 검증을 쓰지 않는다.
- 실제 키·로그인/활용신청 없이 가능한 공개 명세만 취득한다. 이 경로에서 민감 key/OC를 임의 취득하거나 공유 credential을 live 테스트하지 않는다.
- 공식 schema와 구현이 불일치하면 fixture를 구현에 맞게 바꾸어 통과시키지 말고 decoder/mapper를 정정한다. 해결 안 되면 blocked 유지한다.

## 6. quota·conditional·전체 원문

- 동일 credential이 여러 서비스/operation에 공유되는 범위를 host-provisioned account mapping과 공식 근거로 나눈다. 실제 키는 읽지 않고 격리 합성 accountRef만 사용한다.
- requestOnce마다 permit, 재시도·redirect/별도 첨부 요청의 소비 여부, worker crash·장시간 요청·lease 만료/fence·다중 프로세스 경쟁을 시험한다. 송신 후 취소/오류를 “호출 안 함”으로 환불하지 않는다.
- 기관의 quota reset/조건 미확인은 unknown으로 유지한다. 개발 1,000 표시를 1일/자정 리셋으로 임의 고정하지 않는다.
- 조건부 요청과 range는 provider가 지원함을 확인한 경로에서만 사용한다. 304에 대응 원문이 없거나 validator/표현/query/권한/버전이 다르면 재사용 거부.
- partial bytes/list 일부/빈 응답으로 complete를 올리지 않는다. 완료·별표완료·연혁완료의 범위와 누락을 각각 보존한다.
- 이번 기관 실응답 시험이 금지면 합성 장애/상태 시험을 실행하고 기관 지원/응답 gate는 남긴다.

## 7. 전송 경로 전수 inventory

AI review, intake, MCP args/results, public query, summary, answer reuse, document build, ordinary export, managed export, backup/restore를 호출 지점별로 조사한다.

각 row는 입력의 public/private/혼합 구분, entity/version/hash parent, actual bytes/args, server principal, 읽기/로컬 생성/외부 송신 목적 권한, admission/recheck/cancel, 실제 call site, fixture/transport 시험, fallback, 잔여를 포함한다.

- 지금의 v3 requireEgress를 “검사 없음”으로 잘못 설명하지 않는다. 하지만 digest 승인이 exact parent/payload 전송 승인을 대체하지 못한다.
- body reviewer/role/tenant, bootstrap cookie, legacy approved, 해시 문자열만으로 실사용자 승인 권한을 만들지 않는다. trusted host가 explicit grant를 주어야 한다.
- 기본 createApp에서 신규 준수 관리 route 활성화 금지. 관리 grant 없는 일반 앱/격리 앱·실제/합성 영역 조합을 다시 시험한다.

## 8. actual admission·철회·부모 자동 연결

- 관리 private AI/intake/MCP 등 실제 outbound transport에 v5 admission과 시작 전 검사·진행 취소를 연결한다. helper에만 호출하는 시험은 미완료다.
- exact parent를 서버의 보존 객체에서 해석한다. parent 없는 요청·MCP 결과/요약·hash/version mismatch·cross-tenant·만료/철회·조상 누락은 fail closed.
- args뿐 아니라 tool 결과·AI 답변·요약·재사용 문서가 다른 private 원문을 포함할 때 부모 집합을 보존한다. 서버가 확정 못하면 외부 전송/재사용을 보류한다.
- 알려진 protected/private 관리 자료가 context 누락으로 legacy/public 경로에 빠져나가지 못하게 한다. 기존 일반 UI의 공개/비관리 계약은 유지하며 불분명한 경로는 범위와 보류를 기록한다.
- 승인 범위는 대상/provider/purpose/행위/자료 버전과 매칭한다. 로컬 export와 외부 전송을 혼동하지 않는다.
- cross-process revoke-before-admission, admission-after-commit-before-send, active stream, parent revoke, 재사용·재시도 차단을 실제 격리 transport로 시험한다. 실제 OpenAI/MCP/기관 송신 금지.
- 외부 서버 mock과 내부 서비스 mock을 구분한다. 내부 권한/보호/worker를 mock으로 대체하지 않는다.
- 실제 첫 byte가 미관측이면 unobserved 유지. 25ms를 원자적 zero-race로 표현하지 않는다. 이미 보낸 byte 회수 불가를 기록한다.

## 9. 로컬·일반 export와 기존 문서

- v5 관리 export는 기존 일반 Markdown export 구현의 증거가 아니다. 두 경로를 따로 inventory에 둔다.
- 일반 문서/다운로드에도 정확한 backend source parent와 현 검토 버전을 연결하되 기존 응답 스키마·filename/header·형식·섹션순서·UI 계약을 유지한다.
- 일반 export에 수탁업체/교육 후보를 새 섹션으로 무조건 삽입하지 않는다. 실제 질문·검토 결과에 해당하는 기존 근거/추가확인/조치 필드로 직렬화한다.
- local-read/document grant가 있고 external-send grant가 없는 경우 로컬 허용·외부 거부를 따로 시험한다. 외부 grant만으로 로컬 읽기 권한을 올리지 않는다.
- 부모 철회/보류·수동 보완 버전변경·원문 교체 후 stale 검토/문서 재사용을 막고 재검토가 필요함을 기존 구조로 반환한다.

## 10. 보호 이관을 실제 worker 재개에 연결

- paused/not-running 합성 v3 작업과 source/case/review/error/audit trace를 먼저 inventory/dry-run한다.
- 보호 복사·hash 대조·checkpoint marker·read routing을 연결하고 실제 worker가 보호 원본/단위만 읽어 재개하게 한다. 평문 fallback을 다시 쓰면 이관 재개 완료가 아니다.
- copy/checkpoint/read-switch/resume 경계에서 격리 child 중단·중복 실행·lease/fence를 시험한다. 원문 결과 중복 생성이나 권한/영역 혼합이 없어야 한다.
- TTL/hold·파생 parent·오류/로그 잔류를 보호 정책과 연결한다. 원본 삭제와 운영 cutover는 하지 않는다.
- `protectedCopyVerified`, `readPathMigrated`, `queueResumeVerified`, `allTraceCovered`, `plaintextRemovalComplete`는 실제 개별 결과로 둔다. 삭제 미승인이면 마지막 값은 false다.

## 11. 통합 복원 장애 매트릭스

v5의 동일 snapshot·미공개 세대·pointer publish 구조를 재사용한다. 기존 성공/중단 시험을 보존하고 본문 8장의 장애를 단계별로 추가한다.

필수 불변식:

- snapshot DB·파일·manifest의 참조/버전/길이/hash/tenant/key version 정합.
- 현재 유효 세대는 실패한 복원으로 바뀌지 않음; 미공개 데이터는 일반 route에서 보이지 않음.
- 작업 paused, lease 무효, external deny, 승인 재검토.
- 다른 archive/tenant의 lock 회수 불가, 살아 있는 restore 중복 진행 불가.
- 키 미공급/불일치 중단, 키를 archive에 포함하지 않음.
- 미연결 legacy·미분류 테이블/파일·공개 cache의 포함/제외/재수집을 manifest에 명시; 필수 원문을 제외하고 전체 복구 성공이라 하지 않음.

오류 주입과 실제 OS 사건의 증거 등급을 분리한다. runtime/platform에서 fsync/rename/ACL/locking 보장이 미확정이면 capability와 잔여를 적고 원자성/전원 안전 완료를 주장하지 않는다. 실제 사용자 파일/ACL/프로세스/디스크는 건드리지 않는다.

## 12. 교육 5개 실제 backend 구현

기존 ID `training.periodic`, `training.recruitment`, `training.work_change`, `training.special`, `training.supervisor`를 유지한다. 다섯 개를 독립 실행 후보로 구현한다.

- topic 선택→source-backed fact proposal→versioned manual confirmation→applicable profile→독립 의무 판정→독립 합성 검토→기존 질문/검토/문서까지 연결한다.
- 모든 질문에 교육 5개를 강제로 적용하지 않는다. 안전관리자 직무교육·건설기초·특고·외국인 기초교육은 기존 후보/별도 대상이며 이 5개 완성으로 함께 완료 처리하지 않는다.
- 공통 fact는 익명 대상자/사업장/업종/규모/업무/계약/입사/직무배치/변경/특별작업/지위/교육 세션/출석/내용/강사/방법/예외를 원천 ref/version/hash에 연결한다.
- 개인정보는 최소화·보호 저장한다. 합성 사원 식별자를 실제 직원으로 주장하지 않는다. 사실 입력 actor와 독립 검토 actor를 구분한다.
- 본문 5장 기본값·분기를 구현하고 공식 별표 4/5와 고시 필요한 방법별 기준·부칙을 직접 대조한다. 본문 요약만으로 전체 법적 예외를 닫지 않는다.
- unknown과 false, null과 0, 미실시와 미입증, 기간 미도래와 기한 초과, 기본시간과 감경/간주, 실시 증거와 법적 충분성을 구분한다.
- 기간계산은 달/주/일·입사 기산·회계 주기 조정·특별교육 분할 deadline을 분리한다. 1개월=30일, 모든 반기=회계반기, 중도입사 시간 자동 비례를 금지한다.
- 출석표만/수료증만/파일제목만·일반교육으로 특별교육 대체·시간 중복·작업별 내용 불명·강사/방법 불명은 각각 보류 조건이다.
- 감경/간주 조합은 확인된 근거와 증거가 있을 때만 적용한다. 전년도 무재해는 API 0건으로 확인하지 않는다.
- 일반교육 보관 5년을 새 법정 위반 규칙으로 만들지 않는다. 내부 보관과 특정 교육방식/기관의 기록 의무는 별개다.
- 후보와 합성 결과는 enabled:false이며 실제 전문가 승인/법적 활성화는 0이다. 법적 의무, 기술적 권고, 내부 설계 policy 태그를 분리한다.

## 13. 교육 독립 시험과 기존 브라우저 흐름

새 시험은 실행한 소스에서만 보고한다. 최소 다음 독립 시나리오를 포함하고 ID/분모/통과/실패/미실행을 기록한다.

- 사무직/판매/그 밖/관리감독자, 업종별 제외·규모 미확인.
- 정기교육 입사 반기/회계 조정 주장·계획 부재·기간 미도래·다른 기간의 이수.
- 채용 계약 1주 이하/초과·1개월 이하/초과·경계 미확정, 실제 배치 전/후.
- 작업 실질변경/이동만/사실 불명과 변경 작업 전/후.
- 특별작업 해당/비대상/불명, 현행 제39호·옛 번호, 4시간 선행·12시간 분할·기한/내용 불명.
- 관리자 지위 증거, 관리자 정기교육/직무교육 혼동, 일반 단기계약 표와 관리자 표 충돌.
- special 충족→채용/변경 간주, special 보류→간주 거부, 동일 세션 중복 가산 거부.
- 면제/감경/간주 원문·증거·기간·조합·대상 불일치.
- 강사/원격교육 수강·내용 부족, 이수증만, 교체 원문 후 검토 해제.
- 로컬 문서/외부 전송의 권한 분리, parent/tenant/review 버전 불일치.

기존 UI를 수정하지 않은 격리 브라우저에서 교육 자료 업로드→교육 질문→기존 검토→기존 문서 생성/다운로드를 확인한다. 후보 입력/명시 grant는 backend 격리 관리 계약으로만 공급한다. 화면 변경으로 문제를 해결하지 않는다. 기존 9개 흐름과 새로운 교육 흐름은 독립 수치로 둔다.

## 14. 위험성평가 날짜 profile·잔여 법령

- v5 미확보였던 MST271485/2026-05-31 제37조를 이번 근거로 재확보·원문 대조하고 오류 조회와 성공을 모두 기록한다.
- 2026-06-01 MST286657, 기준일 MST288431의 제37조·제37조의2/3/4를 별도 연결한다. 옛 기록 조문을 새 방법 조문으로 오인하지 않는다.
- 법21374 제36조의 6월1일 시행/시행 후 평가 적용례와 일부 다른 조항의 8월1일·제재 단계 시행을 분리한다. 현행 version 헤더를 개별 의무 최초 시행일로 쓰지 않는다.
- 순회점검 참여·특별사정 대체·근로자대표 요구·사전/사후 공유·개선대책 이행·기록 항목을 독립 확인한다. 효과확인은 별도 내부/법적 근거 태그를 유지한다.
- 2026-461은 행정예고다. MCP 연혁의 2024-76 현행 표시만으로 후속 고시 부존재를 확정하지 않는다. 공식 후속 공표를 찾아 확인한 경우만 candidate profile을 갱신하며 enabled는 false다.
- 폐기물 하위 참조·위임·제외/수탁 범위, 공식 서식 제17조 인용과 현행 제18조 경로 충돌은 기존 보류를 유지하며 원문 근거로 좁게 대조한다. 임의 서식 교정/의무 범위 축소/음수 재고를 0으로 보정하지 않는다.
- 전문가 검토가 없는 해석은 그 상태를 보존한다. 조문 존재 확인을 법적 적용 승인으로 바꾸지 않는다.

## 15. 완료 수치와 gate 갱신

`A-attachments`~`E-production`의 원래 12개 ID와 previous를 유지한다. 새 증거를 subcheck와 종료값으로 추가한다.

- 공식 schema/표본/실응답/실키, helper/route/worker, 보호복사/실재개/삭제, fault injection/실제 OS, candidate 실행/전문가 승인/운영 활성화를 각각 분리한다.
- 교육 5개가 모두 독립 구현/시험/경로 연결에 성공한 경우에만 original executable 12→17, original remaining 31→26을 반영한다. 일부면 실제 완료한 ID 개수만 반영한다. additional 2를 original 43에 섞지 않는다.
- D-next는 교육 5개 세부 완료를 표시하더라도 안전관리자6→안전검사5→나머지가 남으면 큰 gate 완료가 아니다.
- 전문가 정답셋/실제 사업장 분모 0이면 정확도 null. 근거 없는 퍼센트/운영준비 완료 금지.
- 불가능/금지/자료 부족을 구분한다. 실제 키 없어서 차단된 gate를 합성 성공으로 닫지 않는다.

## 16. 필수 산출물과 검증

`docs/implementation-v6/`에 다음을 작성한다. 별도 사용자 실행 프롬프트를 만들어 중복 전달하지 않는다.

- README: 실제 한 일·하지 않은 일·이전 실패·새 실패·수정/재시험·법적/실사업장/운영 범위.
- baseline/source-manifest/build-verification/execution/test-inventory/ui-freeze/metrics/release-gate/acceptance-map.
- attachment-route-map/provider-discovery/pinned-diagnostics/parser-security/operation-specimens/api-registry.
- egress-paths/parent-coverage/export-compatibility/migration-resume/migration-status.
- backup-manifest/restore-fault-matrix/restore-capabilities.
- training-policy-contracts/training-date-profiles/training-case-matrix/legal-profile-review.
- 기존 정책 43+2와 신규 구현/미구현 목록, 서비스 32/operation52 전수 행.

각 증거는 sourceDigest·정확한 파일/행/시험ID·실행 명령·격리 경로·fixture/공식/실응답 구분·수집일·법률 기준일·자료 버전·hash·길이·누락·승인 상태를 남긴다. 로그/백업/원문/manifest에서 키·토큰·cookies·민감 query·실직원 정보를 노출하지 않는다.

원본 bytes와 파생 추출·요약을 같은 hash로 주장하지 않는다. 공개 연구 원문 복사와 앱의 실제 수집/파싱 성공은 별개다. 형식 검사·명령 성공만으로 전체 인수 통과를 쓰지 않는다. 실패나 미검증 row를 삭제/분모 축소하지 않는다.

## 17. 종료 조건과 결과 회신

가능한 구현·검증을 계속 실행한다. 이 실행은 아래가 완료되거나 각 항목이 구체적 이유로 차단될 때까지 이어간다.

1. 기존 404/브라우저9/frozen29 회귀와 신규 실제 실행 결과.
2. helper가 아닌 실제 격리 첨부 등록·실패/성공 증거·provider별 graph.
3. 공개 공식 명세의 실제 추가 대조와 52개 증거 행.
4. 관리 private 전송·부모·재사용/export 경로의 실제 연결과 철회 시험.
5. 보호 이관의 실제 worker 재개와 통합 복원 장애별 불변식.
6. 교육 5개 독립 실행과 기존 사용자 흐름 연결·위험성평가 구/신 profile 보완.
7. 미완료 큰 gate와 세부 종료값, 다음 순서 안전관리자6→안전검사5→잔여.

최종 회신은 ‘격리 기술 결과/공식 자료 대조/법적 검토/실제 사업장/운영’을 구분한다. 통과 시험 수만 말하지 말고 **원래 미구현 몇 개와 세부 미검증 몇 개가 실제로 줄었는지, 무엇이 왜 남았는지**를 함께 제시한다.

운영 접속·실제 키·배포·재시작·규칙 활성화·UI/UX 변경은 마지막까지 0이어야 한다.

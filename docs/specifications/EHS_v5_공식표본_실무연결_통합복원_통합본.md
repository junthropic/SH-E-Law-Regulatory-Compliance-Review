# EHS v5 통합본: 공식 표본·실무 사실 연결·전체 앱 복원

- 법률 판단 기준일: **2026-10-08**. v4의 기준일을 유지한다.
- 이번 조사 시각: 2026-10-09 KST. 조사 시각과 법률 적용일을 혼동하지 않는다.
- 입력: 사용자 v4 결과, 저장소 `docs/implementation-v4/`의 README·release-gate·security-and-durability 및 선택 코드.
- 이번 작업: 읽기 전용 코드 조사, 공식 웹·법령·공개 첨부 확인, 다음 실행 지시 작성. 앱 수정·380개 시험 재실행·운영 접속·키 사용·배포를 한 작업이 아니다.

## CODEX 전달 방법

**이 통합본 하나만 전달한다.** 본문은 조사·정정·실무 사용안이고 부록은 실행 프롬프트 v5다. 부록 v5를 한 번 실행한다. v2/v3/v4 전체 지시를 다시 처음부터 실행하거나 별도 프롬프트를 중복 전달하지 않는다.

# 1. v4 결과를 어떻게 받아들일 것인가

v4는 원문 저장과 개별 HTTP 제한, 실제 payload의 일부 파생/철회 검사, 주제별 후보 선택, 수동 자료 보존을 추가했다. 이는 합성 환경의 실질적인 기술 진전이다.

확인한 보고 기준선:

- 자동시험380/380: 기존332개 보존,48개 추가.
- 브라우저8/8: 기존7개 보존, v4 1개 추가.
- 동결29개 변경0.
- 32서비스/52operation: 합성 adapter 응답 시험. 독립적인 기관 실응답52개가 아님.
- sourceDigest `dc4b4f2029b66d306253fcb8ca724fcd46e30de2a08e2aeb854fcbbdd0688c83`.
- HEAD `e770bdefb32fbb6a010b435f372f2d13c9fb384f`, 미커밋 작업 트리.
- 원래43개와 추가2개 ID 보존. 기존 위험물6개, 추가 위험성평가5개+수탁1개, 대표/공유2개 실행 후보 보고. 실제 법적 승인·사업장 검증·운영 활성화0.
- productionReady:false. 미완료12개 release gate를 보존.

이번에는 보고와 선택 코드의 범위를 확인했다. source 전체 hash·380개 시험·8개 E2E를 새로 재실행하지 않았다. ‘통과 보고를 확인했다’와 ‘직접 다시 통과시켰다’를 구분한다.

**v5의 목표는 정책 수를 먼저 늘리는 것이 아니라, 외부 자료가 실무 사건의 사실과 승인까지 연결되고 전체 자료를 일관되게 복원하는 것이다.** 법률이나 권한 자료가 필요한 부분은 보류를 유지하되, 합성 환경에서 실행 가능한 구현까지 함께 보류하지 않는다.

# 2. 실무자는 기존 흐름에서 어떻게 사용해야 하는가

아래는 개발 중인 격리 흐름의 사용안이다. 현재 운영 화면에 v4/v5가 배포됐다는 뜻이 아니다. 실제 민감자료 투입과 실제 결재는 전체 전송·저장·권한 검증 및 별도 승인 후 단계다.

## 2.1 수탁업체: 업체를 검색하는 것과 위탁 판단을 분리

기존 질문 예: ‘A사 B시설에 폐유를 위탁하려고 합니다. 무엇을 확인해야 하나요?’

1. 위탁자·폐기물 종류/분류번호·성상·량·기간·예정 위탁일을 확인한다.
2. 업체와 **실제 시설**을 식별한다. 사업자번호가 같아도 시설이 다를 수 있다.
3. A07에서 업체/업종/처리폐기물 등 조회 자료, A08에서 처분 관련 자료를 얻는다.
4. 허가/신고·법정 대체 경로, 영업대상·방법·시설·처리능력·현재 보관량·계약·보증 관련 증빙을 따로 연결한다.
5. 수탁처리능력 확인과 지정폐기물 수탁확인의 서식 목적을 구분한다.
6. API가 제공하지 않는 사실은 부족 자료로 남긴다.0건/timeout/목록 제목만으로 적법성이나 불법성을 확정하지 않는다.
7. 원문→필드 후보→사람 확인→독립 검토→가상 승인→기존 문서 trace까지 검증한다. 자동 추출과 독립 승인은 다른 단계다.

프로그램은 ‘업체 목록에 있음→위탁 가능’으로 답하면 안 된다. ‘처분 기간 종료→모든 현재 영업 적법’도 아니다. 처분 종류·대상 시설·변경/취소/집행정지·현재 효력에 필요한 원문이 없으면 그 부분은 판정보류다.

## 2.2 위험성평가: 사건일과 당시 적용 규정을 먼저 연결

기존 질문 예: ‘공정을 추가했고 평가표는 작성했습니다. 참여와 공유까지 완료된 건가요?’

평가 실시일·관련 작업 시작일·최초/정기/수시 사건을 구분한다. 참여 근로자·근로자대표 요구 여부·일정 공유·결과/대책/이행 공유·실제 개선 이행·기록을 분리한다.

양식, 서명, TBM 사진은 각각 특정 주장에 대한 자료다. 하나로 전체 의무를 충족 처리하지 않는다. 근로자대표 참여는 요구 조건과 일반 근로자 참여를 구분한다. 법률의 상시 주지 ‘노력’과 다른 강행 의무도 구분한다.

특히 옛 지침의 최초평가 시기·상시평가 간주를 새 시행규칙의 ‘작업 시작 전’ 요건에 자동 대입하지 않는다. 충돌하는 부분은 근거를 나란히 보존하고 분야 검토 대상으로 남긴다.

## 2.3 점검·제출: 현재 보완이 과거 지연을 지우지 않음

점검 실체·결과 기록·보존·제출·기관 접수·보완·시정 완료를 독립 확인한다. 시스템 연계 수신일을 기관 접수일이나 수리일로 바꾸지 않는다. 실제 법령에 없는 수리증·자동 간주 조건을 추가하지 않는다.

## 2.4 복원: 파일을 다시 읽는 것보다 업무 일관성 확인

복원 후 질문·문서·원본·근거·fact·policy·decision·승인 이력·job·보호 payload가 같은 사건으로 연결돼야 한다. 작업은 paused이고 외부전송은 현재 거부 상태다. 과거 승인은 역사로 보존하되 현재 실행 권한을 자동 복구하지 않는다.

복원 성공 문구만 보고 업무 재개하지 않는다. key 부재·파일 누락·parent 단절·정책 버전 차이·기간 만료를 별도로 확인한다.

# 3. 이번에 좁혀 확인한 실제 코드 경계

## 3.1 첨부 parser가 없는 것이 아니라 연결이 끊겨 있음

- `server/attachments-v4.ts:17–62`: URL/DNS/public IPv4 고정·peer·크기·MIME/signature 검사와 암호화 저장. parser:not_supported.
- `server/collection-v4.ts:61–62`: attachment는 app_adapter_missing 상태.
- 기존 `server/extraction.ts`: 별도 child process,256MB heap·30초 제한.
- `server/parse-worker.ts`: 이미 설치된 kordoc/adm-zip, `ocr:false`, archive member/크기 제한, 추출문 길이 제한.
- `server/documents.ts`: 기존 문서 업로드 parser 경로와 원본 대조 경고. 이 경로의 원본/추출문 저장은 v4 보호 계층과 다르다.

따라서 우선 기존 로컬 parser를 **보호 첨부 경로**에 연결하는 seam을 만든다. 바로 legacy ingestDocument를 호출해 private 첨부를 평문 originals/documents에 복제하면 안 된다.

child process와 heap 제한은 권한 격리 자체가 아니다. parser의 외부 URL·파일·script 처리와 실제 지원 옵션을 검토한다. `scriptTags:true`라는 옵션 이름만으로 코드 실행을 단정하지도, 안전성을 단정하지도 않는다.

## 3.2 S2는 완성된 fact를 입력받음

`server/cases-v4.ts:5–23`은 ConsigneeCase 입력을 평가한다. raw에서 business/facility/capacity/sanctionEffect로 변환하는 경로가 아니며 conversionPerformed:false/sourceVerified:false를 구분한다.

`collection-v4.ts`의 unit/detail와 `transport-v4.ts`의 capture를 S2 fact proposal로 실제 연결해야 한다. API에 없는 값은 이 adapter가 만들어내지 않는다.

## 3.3 전체 앱 backup이 아님

`server/backup-v4.ts`는 v4_payloads/captures/provenance/grants 계층이고 completeApplicationRestore:false다. 기존 질문·문서·v2/v3 업무/작업 자료와 원본까지 복원한 것으로 확대하면 안 된다.

## 3.4 전송 직전 확인에도 교차 프로세스 경계가 남음

`provenance-v4.ts:53–60`은 최종 검사와 send 사이에 await를 두지 않지만 cross-process race를 명시한다. AI/intake에는 v3 fallback과 v4 context 분기도 남는다.

DB-backed send-intent나 lease만 추가했다고 네트워크 송신과 철회를 물리적으로 원자화했다고 주장하지 않는다. 어느 사건을 전송 승인 경계로 삼고, 경계 전 철회/경계 후 취소/이미 전송된 bytes를 어떻게 처리하는지 명확히 해야 한다.

# 4. 공식 웹·첨부·MCP 조사 결과

## 4.1 A07과 A08: 필드와 법적 사실이 다름

[정부 공개 모델 확인] 공공데이터포털의 Swagger 모델을 열어 읽었다. Try it out/Execute·실제 key·API 실호출은 사용하지 않았다. 모델은 실응답 specimen이 아니다.

A07 item에서 확인한 필드:

- prcsWstListCn: 처리폐기물.
- tpbizNm, bzentyNm, arspNm: 업종·업체명·전문분야.
- brNo, rprsvNm, zip, addr, telNo.
- bzentyPstnLot/Lat, bzentySttsNm, cmptncGvmnfcNm, cmptncSggNm.

**이 모델에 처리능력·현재 보관량·허가번호 필드는 보이지 않는다.** 처리폐기물이나 업체상태명으로 법적 허가 범위 전체와 수탁 가능성을 확정하지 않는다.

A08 item에서 확인한 필드:

- bzentyNm, **brno**, rprsvNm, tpbizSeNm, admdspInstNm.
- admdspYmd: 행정처분일자.
- bgngYmd/endYmd: 시작/종료일자.
- vltnDsctn: 위반내역.
- telgmRcptnYmd: **연계수신일자**.

A07 brNo와 A08 brno의 대소문자를 구분해 매핑한다. 표시·형식 정규화 전 원값을 보존하고 선행0·마스킹·누락을 고려한다. 사업자번호 일치가 시설 일치를 뜻하지 않는다.

A08 날짜와 위반내역은 법적 처분의 모든 효력을 증명하지 않는다. 현재 취소/집행정지/변경 상태, 어떤 시설·업종에 적용하는지, 처분 원문을 추가 확인한다. 연계수신일은 관청 접수증이 아니다.

A07 모델의 items/item과 A08 모델의 배열/중첩 표현도 다르다. 모델 UI만 보고 실제 JSON/XML shape를 확정하지 않는다. 문서 schema 검토와 독립 실응답 검증을 분리한다.

공식 페이지에는 개발계정 트래픽10,000으로 표시된다. 이 수를 일일·분당 한도로 임의 해석하지 않는다. A08 운영단계는 심의승인으로 표시되어 있다. 공개 schema 열람은 운영 API 사용 승인이 아니다.

## 4.2 폐기물 위탁·수탁의 대상은 조건부

[MCP 확인] 기준일2026-10-08 시행규칙 MST290881, 시행령 MST284591을 확인했다.

제16조의12는 **시행령 제8조의4제1호의 집단급식소**, 시행규칙 제18조① 각 호, 제18조의2① 각 호의 해당자를 참조한다. 제8조의4의 다른 음식물류 배출자 전체에 이 문구를 그대로 확장하지 않는다.

- 제8조의4제1호: 일반 집단급식소100명/일 평균, 유치원200명/일 평균, 사회복지시설 집단급식소 제외 및 본문 사업장폐기물배출자 중복 분기.
- 제18조①: 지정폐기물 외 사업장폐기물의 제외 품목과 배출시설/시설 종류,100kg/일 평균·300kg/일 평균·공사/작업5ton 등 서로 다른 요건과 공동처리 분기.
- 제18조의2①: 지정폐기물 종류별 월 평균과 합계 기준, PCB/폐유독물질/의료·수은 등 별도 유형, 제외·특례.

이 숫자는 전체 대상식의 일부다. 참조되는 시설·폐기물 정의·고시·제외·공동처리를 펼친 뒤 적용한다. 자료 미확인에서 비대상이나 위반을 자동 확정하지 않는다.

## 4.3 최신 목록의 별지 제5호 PDF를 실제 확보

[정부 원문 확보·MCP 대조] 현재 시행2026-10-02 법령의 서식 목록에서 별지 제5호를 열었다. 원문 표시는 **개정2025-03-17**,3쪽이며 공식 PDF representation96,810bytes를 확보했다. 별지의 개정일과 본문 전체 시행일은 다른 metadata다.

이 PDF의 본문/이미지와 MCP HWP 추출을 대조했다. underlying HWP master의 동일 bytes와 앱 downloader/parser 실행까지 확인한 것은 아니다.

주요 의미:

- 수탁처리능력 확인: (1)~(3).
- 폐기물 수탁확인: (1),(2),(4).
- 병행: 두 목적과 (1)~(4).
- 위탁량/수탁예정량 ton/year, 처리능력 ton/day 또는 ton/hour, 매립 m3, 운반차량의 ton/대수 등을 분리.
- 현재 보관량: 확인서 발급일 전일 기준.
- 평균 반입량: 계약량과 최근1년 가동일수, 계약예정 물량 제외와1년 초과 계약/1년 미만 가동 분기.
- 전체 보관량: 현재 보관량+1일 평균 반입량+금회 수탁량−1일 처리량이라는 작성방법.
- 작성방법은 계산 결과 음수도 그대로 기재하도록 한다. 임의로0으로 clamp하지 않는다.

이 작성식을 일반 재고 예측이나 모든 폐기물 수탁 가능성 알고리즘으로 확대하지 않는다. 업종·보관 승인·처리능력·허가와 실제 발급 자료가 필요하다.

### 발견한 실제 원문 불일치

현행 본문 제18조가 사업장폐기물배출자 신고인 반면, 별지 제5호 제2쪽 첨부/공무원 확인란에는 ‘제17조제1항 각 호의 사업장폐기물배출자’라고 남아 있다. 본문 제16조의12의 서류 요건과 서식 주석 범위도 나란히 검토해야 한다.

브라우저·PDF 이미지·embedded text·MCP에서 해당 참조를 확인했다. 원문 불일치인지 연혁·서식 개정 연결 문제인지 공식 확인/분야 검토가 필요하다. **AI가17을18로 조용히 치환하거나 서식 주석으로 본문 의무를 축소하지 않는다.** 충돌하는 결정 셀은 profile 검토 대기다.

표의 원문에는 특수기호 글리프가 있고 추출문에서 일부 필드 번호가 깨진다. 텍스트 추출 성공을 정확한 셀 매핑/OCR 검증으로 부르지 않는다.

## 4.4 위험성평가 고시 전문과 부칙 경계

[정부 원문 확보] 고용노동부 공표 페이지에서 고시2024-76호 전문 HWPX95,319bytes를 확보했다. ZIP/XML로 본문과 부칙을 읽었다. 개정 부칙은2025-01-02 시행과 인정/사후점검 적용례를 구분한다. 표 전체의 결정 셀 검토는 별도다.

[MCP 확인] 시행규칙 제37조를2026-05-31/06-01로 비교했다.

- 5월31일 적용본 MST271485: 제37조 기록·보존.
- 6월1일 적용본 MST286657: 제37조 방법·절차·시기; 기록·보존은 제37조의4.
- 신 제37조: 최초평가 작업 시작 전, 정기평가 최초 연도 다음 연도부터 매년1회 이상, 해당 수시평가 관련 작업 시작 전.
- 법 제21374호 부칙 적용례: 개정 제36조는 시행 이후 실시하는 위험성평가부터 적용. 평가 실시 사건과 조회 시각을 구분한다.

### 옛 고시와 신 시행규칙의 차이

2024-76호 전문 제15조①은 사업 성립일부터1개월이 되는 날까지 최초평가 **착수**, 제15조④는 월/주/매작업일 요건의 상시평가 간주를 규정한다. 제14조는 옛 시행규칙 제37조를 인용한다.

신 시행규칙과 같은 기한·같은 조문 위치로 취급할 수 없다. 상위 법령·부칙·위임 관계를 우선 대조하고, 고시의 양립 가능한 세부방법과 충돌/시행 미확정 부분을 분리한다. 고시 전체를 자동 폐기하거나 신 법률을 옛 고시로 면제하지 않는다.

2026-461호는 확인한 페이지에서 전부개정고시안 행정예고다. 이를 확정 시행 고시로 활성화하지 않는다. 이후 확정 공고 여부는 기준일 범위에서 별도 확인한다.

시행규칙 applicable_law의 발췌가2026-470호 부칙을 충분히 보여주지 않은 것은 부칙 부존재가 아니다.2026-470호 전체 부칙 원문·모든 분기·특례의 전수 확인은 남겨 둔다.

## 4.5 SQLite 자료가 말하는 복원 범위

[공식 기술문서] SQLite Online Backup API는 DB snapshot을 만들며 WAL에는 별도 파일이 있고, 여러 attached DB의 WAL transaction은 DB별 atomic이지 전체 atomic이 아니다.

[설계 권고] DB snapshot만으로 원본 파일·여러 저장 계층·key 참조·job·현재 권한의 시점을 맞췄다고 할 수 없다. write fence/짧은 정합성 구간과 immutable 파일 manifest 또는 generation publication을 사용하고 crash recovery를 설계한다.

DB transaction과 filesystem rollback을 같은 보장으로 표현하지 않는다. 프로세스 강제종료 시험은 실제 전원 장애 검증과 다르다.

# 5. v5 우선순위와 이번에 제공하는 실제 자료

1. **공개 첨부2개로 실제 연결 시작:**별지 제5호 PDF와 위험성평가 전문 HWPX. 연구용 다운로드는 했지만 앱 adapter 안전 다운로드/parser 시험은 CODEX가 해야 한다.
2. **52operation 검증 등급 분리:**합성·공식 schema·공식 문서 example·독립 실응답·실호출/실패조합을 각각 계수.
3. **S2 field proposal 완성:**A07/A08 실제 제공 필드만 매핑하고 누락을 별도 증빙으로 보완. 사람 확인·독립 검토·기존 문서까지 연결.
4. **전체 앱 암호화 복원:**legacy/v2/v3/v4 업무/원본/작업/추적을 하나의 manifest/generation으로 검증.
5. **egress 통합과 교차 프로세스 경계:**v3 fallback 안전 이관, 모든 parent 자동 연결, 전송 admission/철회/cancel의 시험 가능한 의미.
6. **법적 profile 공백 축소:**폐기물 대상/서식 충돌과 위험성평가 사건일/고시 관계를 먼저 검토. 실제 전문가·사업장 승인0은 유지.
7. **그 다음 잔여 정책:**교육→안전관리자→안전검사→위험물/환경. 앞 공백 때문에 모든 후속 구현을 무기한 멈추지는 않되 후보 상태를 정직하게 유지.

원문·조회 JSON·모델 snapshot·PDF/HWPX와 추출문은 같은 작업 폴더 `원문근거/v5/`에 보존한다. 신규 통합본만 다운로드로 전달한다. 표본이 같은 PC에 없으면 공식 URL로 재확보하고 hash·수집 시각을 다시 기록한다. 연구용 자료의 위치가 없다는 이유로 합성 자료를 공식 실응답으로 표시하지 않는다.

# 6. 출처

- A07 공식 설명/모델: https://www.data.go.kr/data/15141649/openapi.do
- A08 공식 설명/모델: https://www.data.go.kr/data/15156661/openapi.do
- 폐기물 시행규칙 현재 목록: https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=008567
- 별지5 공식 PDF: https://www.law.go.kr/LSW/flDownload.do?flSeq=169879609&bylClsCd=110202
- 고시2024-76호 공표: https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20241201150
- 전문 HWPX: https://www.moel.go.kr/common/downloadFile.do?file_seq=20241202005&bbs_seq=20241201150&bbs_id=19&file_ext=hwpx
- 행정규칙 metadata: https://www.law.go.kr/LSW//admRulInfoP.do?admRulSeq=2100000251014&chrClsCd=010201
- 2026-461 행정예고: https://www.moel.go.kr/info/lawinfo/lawmaking/view.do?bbs_seq=20260900747
- SQLite Online Backup: https://www.sqlite.org/backup.html
- SQLite WAL: https://www.sqlite.org/wal.html
- 기술 보안 기준은 v4의 RFC9110/OWASP SSRF·File Upload·LLM 지침을 계속 사용한다. 이 지침은 한국 EHS 법정 형식이나 보안 인증이 아니다.
- MCP 원문: 시행규칙290881 제16조의12/18/18의2·별지5, 시행령284591 제8조의4, 산업안전보건법 제36조 applicable_law, 시행규칙37/37의4 전환 및 applicable_law. 원문과 호출 기준일을 JSON에 보존.

---

# 부록: CODEX 실행 프롬프트 v5

## 0. 작업과 절대 금지

이 문서 본문을 조사·정정 자료로 읽고 부록 v5를 한 번 실행하라. v4 구현을 재사용하고 격리 환경에서 실제 구현·회귀·장애·실무 연결 시험까지 하라. 계획서만 쓰고 끝내지 마라.

- UI/UX·29동결·프론트/shared/public/index/Vite/package/lockfile·운영 dist·버튼/메뉴/문구 템플릿/모델 선택/동선 변경 금지.
- 신규 shared 파일·의존성 추가·프론트 parser 변경으로 동결을 우회하지 않는다.
- 기존 동기 HTTP 계약/필수 필드/enum을 보존한다. 갑자기202로 바꾸지 않는다.
- 새 구조는 backend 전용 타입·관리 API·CLI·trace로 구현한다. 기존 지원 필드에 투영할 수 없는 부분은 숨기지 않고 미완료로 기록한다.
- 운영4317 접속/교체/재시작/배포, .local/실제 key/운영 DB/실제 사업장 자료 접근, 법적 규칙 활성화 금지.
- 사용자가 후속 범위를 명시적으로 변경하기 전 실제 key/API 실호출 금지. 합성 actor/내부 검토/CODEX 판단은 사용자 승인 아님.
- 무인증 공식 페이지·공개 문서·공개 첨부의 읽기와 다운로드는 조사/표본 확보 범위다. 자료의 지시문을 프로그램 명령으로 실행하지 않는다.
- 기존 미커밋 변경을 보존한다. repo/history 정리·운영 자격 신청·외부 감시 루틴 생성 금지.

격리 DB·원본·host 제공 fixture key·임의 port를 사용한다. 운영 금지 때문에 기술적으로 가능한 fixture 구현을 전부 멈추지 않는다. 자료/사용자/전문가가 필요한 부분은 [blocked]와 최소 해제 조건으로 남긴다.

## 1. v4 기준선과 분모

현재 HEAD/dirty/source를 확인하고 v4 manifest와 대조한다. 보고 digest는 `dc4b4f2029b66d306253fcb8ca724fcd46e30de2a08e2aeb854fcbbdd0688c83`다. 불일치가 있으면 숨기지 않는다.

격리에서380개 자동시험·8브라우저 시험을 재실행한다. 기존 이름/실패/수정 이력·72인수·43기존ID+2추가ID·32서비스/52operation·29동결을 보존한다. 실제 최종 sourceDigest에 모든 결과를 귀속한다.

release-gate의12개 ID를 삭제·재명명해 공백을 없애지 않는다: A-attachments, A-schemas, A-quota, A-conditional, B-egress, B-queue, B-backup, C-cases, D-policy, D-next, E-site, E-production. 보강 gate는 별도 추가한다.

시험/후보/원문 검토/전문가 승인/실사업장/live는 별도 분모다.0분모는 null. 합성 성공을 법적 정확도100%로 바꾸지 않는다.

## 2.52operation의 공식 표본 검증 등급

기존 operation matrix에 다음 증거 등급을 추가한다.

1. synthetic_contract: 앱/테스트 작성 응답.
2. official_schema: 기관 공개 명세/모델을 실제 읽음.
3. official_document_example: 기관 문서에 수록된 예시. 실관찰 응답 아님.
4. independent_observed_response: 독립 확보 실응답. 출처/권한/기준일 필요.
5. authorized_live_observed: 사용자 승인 자격으로 실호출. 이번에는 금지/차단.

등급은 성공 점수 순서가 아니라 다른 증거다. 공식 예시도 실응답과 다를 수 있다. 이번 조사에서 확인한 A07/A08 모델2개와52개 독립 실응답을 혼동하지 않는다.

provider/operation ID, source URL/version/hash/수집시각, schema path·자료 shape·단위·날짜·정상0건/빈본문/내부오류/partial/크기/quota/인증, adapter 결과와 결정 셀을 기록한다. 실제 수집한 분모와 아직 없는 분모를 따로 계수한다.

무인증 문서/모델은 가능한 operation부터 확보한다. 접근 실패·문서 부재를 미지원으로 임의 바꾸지 않는다. 공식 응답이 없으면 fixture와 명세검증까지만 완료하고 독립 실응답은 [blocked]다. 실제 key를 찾아 해결하지 않는다.

A07/A08의 XML/JSON object/array/wrapper·단일 item·여러 item·빈 items 차이를 공식 확인한 variant별로 시험한다. case-insensitive key 변환으로 전체 schema를 뭉개지 않는다. unknown shape는 source partial/schema_changed로 보존한다.

## 3. 먼저 연결할 공개 첨부2개

1. 현재 폐기물 시행규칙의 서식5 발견→공식 PDF representation→안전 다운로드→local parser→field/source 위치.
2. 고용노동부2024-76호 공표 페이지→전문 HWPX 링크→안전 다운로드→local parser→본문/부칙 위치.

이 본문에 URL·바이트 길이·형식이 있다. 연구용 파일을 앱 safety 검증 성공으로 취급하지 않는다. 가능하면 공식 URL을 앱 adapter로 받고, 재현 fixture는 동일 원문 bytes와 manifest를 사용한다. provider 경로와 generic downloader 직접 호출을 별도로 시험한다.

발견은 실제 페이지/metadata의 링크에서 하며 guessed endpoint나 전체 host wildcard를 만들지 않는다. 다운로드 endpoint의 허용 path와 file ID query는 비밀 query와 구분하여 검증한다. 법령 viewer의 변환 PDF와 HWP master를 다른 representation으로 관리한다.

현재 IPv4 pinning/peer/redirect 거부/크기/time/MIME/signature 검사를 보존한다. 연구실의 진짜 TLS socket 통합은 격리 시험 서버·명시적 test-only resolver/pinning으로 검증하고 production allowlist를 넓히지 않는다. 모의 socket, 실제 격리 socket, 공개 provider 실제 전송 시험은 별도로 계수한다.

실제 인터넷 provider socket 시험이 환경상 불가능하면 그 gate를 남긴다. 시스템 proxy/사설목적지/운영4317로 우회하지 않는다.

## 4. 보호 parser seam과 OCR 경계

새로운 parser가 처음부터 필요한 것은 아니다. 기존 extractDocument/parse-worker의 kordoc·adm-zip을 검토하고 보호 계층에 연결한다. package/lockfile 변경 없이 이미 제공된 의존성만 사용한다.

ingestDocument로 private 첨부를 legacy 평문 originals/documents에 복제하지 않는다. parser의 입력/출력을 v4/v5 암호화 payload·원문hash·tenant/synthetic·parent로 연결하고 임시 평문 파일의 필요/수명/삭제를 통제한다.

PDF embedded text, HWP, HWPX와 이미지-only/OCR 필요를 분리한다. 우선 PDF/HWPX 실제 표본부터 연결하고 현재 다운로드 미지원 HWP는 별도 지원/차단으로 남긴다. MIME/extension만 보고 판단하지 않는다.

child process·메모리/시간 제한은 유지한다. network/file 접근·외부참조·활성 콘텐츠·scriptTags 옵션의 실제 동작을 확인하고 parser 권한 격리를 시험한다. 라이브러리 이름이나 fork 사용만으로 sandbox 완료라 하지 않는다.

ZIP/HWPX에 member수·전체/개별 확장량·암호화·경로탈출·symlink·중첩·압축율·CRC/손상·DOCTYPE/external entity·시간 상한을 검증한다. unsupported를 허용파일로 bypass하지 않는다.

추출 길이 제한·문자깨짐·표 재배열·필드 번호 glyph 유실은 partial/needs_review다. page/cell/span 위치와 parser 버전/hash를 남긴다. PDF 좌표가 제공되지 않으면 좌표가 있다고 만들지 않는다.

OCR은 기존 허용 로컬 engine이 있는지 확인한다. 없다면 interface·needs_ocr·재시도/취소·수동 보완을 구현하고 engine 설치/외부전송은 [blocked]다. 실제 OCR을 하지 않고 모델의 텍스트 추론을 OCR 완료라고 부르지 않는다. 원문 공식 표본은 재현 fixture로 쓰되 채워진 사업장 자료를 만들어 원본과 혼합하지 않는다.

## 5. S2 raw→field proposal→독립 검토

collection 결과/capture를 받는 실제 adapter를 구현한다. 서버가 원본 field path/value/hash/version/수집시각/source scope를 기록하고 proposal을 만든다. 최종 fact·legal approval을 자동 생성하지 않는다.

A07의 brNo/bzentyNm/tpbizNm/prcsWstListCn/arspNm/addr/관할/업체상태는 확인한 의미로만 매핑한다. 모델에 없는 permit number/capacity/current stock/facility stable ID를 채우지 않는다. 처리폐기물 string은 확정 허가 범위 전체가 아니다.

A08의 brno/bzentyNm/tpbizSeNm/admdspInstNm/admdspYmd/bgngYmd/endYmd/vltnDsctn/telgmRcptnYmd를 매핑한다. dates와 위반내역으로 sanctionEffect를 자동 확정하지 않는다. 연계수신일을 접수/수리일로 바꾸지 않는다.

business ID 정규화는 표시기호와 선행0·마스킹·유효형식을 분리한다. same business≠same facility. 이름/주소/좌표 fuzzy match는 동일성 proposal일 뿐이다. 불일치·복수시설·과거주소·기간차이는 conflict다.

필드별 raw path/basis/confidence/원값/정규화값/단위/기준일/검토상태를 둔다. confidence는 확률/법적 적합 보증이 아니다. 누락은 unknown,0은 확인된 숫자,빈칸은 별도다. UI의 confirmed/legacy approved는 실제 reviewer 권한이 아니다.

별지5·허가/신고증명·계약·보증·처분 원문을 각 하위 의무에 연결한다. 문서 출처가 추가되면 해당 필드/승인 연결만 재검토한다. 사람의 수정/승인 fact를 자동 재수집으로 덮지 않는다.

실제 HTTP→worker→암호화raw→adapter proposal→수동보완→권한있는 합성 독립검토→판정/보류→기존 질문/문서/export trace를 끝까지 시험한다. 외부 provider만 모의하고 내부 서비스·DB·권한·worker·bridge는 실제 구현이다. A07/A08 임의 합성 field를 실제 제공 필드처럼 넣지 않는다.

S2는 최종 ‘위탁가능’만이 아니라 source_missing/identity_conflict/contract_missing/capacity_unknown/sanction_effect_unknown 등 이유를 연결한다. 기존 response enum을 변경하지 말고 지원 projection과 관리 trace로 표현한다.

## 6. 서식5 적용성·단위·산식

서식 목적 두 가지와 병행을 모델링한다. (1)~(4) 구역이 서로 다른 claim을 증명함을 보존한다. blank official form은 사업장 fact가 아니다.

제16조의12의 대상은 제8조의4제1호, 제18조①, 제18조의2①의 참조 범위다. 배출시설/시설 정의·제외품목·지정폐기물·평균/합계·공사/작업·공동처리·특례를 펼친다. 다른 음식물 배출자나 모든 폐기물에 동일 문서 묶음을 강제하지 않는다. 비대상인 것은 해당 하위 조건이지 폐기물 법 전체가 아니다.

ton/year→ton/day는 가동일수·해당 계약/기간·예정량 제외 등 서식 작성방법이 충족된 경우만 변환한다. 시간량→일량은 가동시간과 근거가 있어야 한다. m3↔ton은 밀도/근거 없이 변환하지 않는다. 숫자 단위와 물리적 stock/flow를 함께 보존한다.

현재 보관량의 발급일 전일 기준과 평균 계약량의 기준시점을 연결한다. 전체 보관량 작성식은 버전별로 정확히 적용하고 공식 지시의 음수 기재를0으로 clamp하지 않는다. 산식 출처·원값·가동일수·계약량·단위·검토를 저장한다.

서식 산식 결과만으로 법적 수탁 가능을 확정하지 않는다. 허용 보관·처리 능력·방법·영업대상·시설·현재 효력 확인이 남는다.

제2쪽 ‘제17조①’ 참조와 현재 제18조 및 제16조의12 본문/서식 주석 충돌은 source conflict로 보존한다. 조문 번호 silent replace·본문 의무 축소·불리한 범위 자동 확대를 금지한다. 관련 조건의 실제 profile 승인은 분야 검토 대기다.

## 7. 위험성평가 profile와 고시 충돌

기존5개+대표/공유2개 ID를 유지하고 평가실시일·작업시작일·최초평가연도·변경/재해사건으로 적용 버전을 선택한다. 조회일·법령 전체 머리 시행일로 적용일을 복사하지 않는다.

법21374호 부칙과 시행규칙470호 전체 부칙을 공식 원문으로 대조한다. MCP 발췌에 없다는 이유로 부칙 없음 처리하지 않는다.5월31일/6월1일/기준일 버전을 조문별로 기록한다.

고시2024-76호 전문·부칙·2026-461안 및 후속 확정 여부를 구분한다. 고시의1개월 내 착수와 신 시행규칙 작업 시작 전, 상시평가 간주, 옛 제37조 인용을 충돌/위임검토 표에 둔다.

확인된 상위 조문, 양립 가능한 고시 세부사항, 해석/시행 미확정 부분을 분리한다. 고시 전체 폐기·자동 면제·제재 활성화를 하지 않는다. 분야 승인 전에는 실제 법적 profile를 활성화하지 않는다.

S5:신규/기존사업장·개정전후 평가·6월1일 경계·정기/수시 사건·대표 요구/없음/unknown·실시전/결과 공유·노력 의무·실제 개선 이행·기록3년의 조건을 시험한다. 옛 기록을 신 대표/공유 의무로 소급 위반 처리하지 않는다. risk.effectiveness의 내부 설계 태그는 유지한다.

## 8. 전체 앱 통합 backup manifest

v4 보호 계층을 전체 앱 backup이라고 바꾸지 말고 legacy/v2/v3/v4 저장소·원본·DB·job·trace·policy/version·권한 이력의 inventory를 만든다. 포함/제외/민감/키참조/재생성/법정보존/현재실행금지 자원을 명시한다.

정확한 tenant/synthetic scope, schema/migration/parser/runtime/sourceDigest, 각 파일hash/길이/representation, parent/원본ID, job과 fencing/generation, keyID/알고리즘을 manifest에 연결한다. 키·token·cookie·OS 비밀·.local·다른 tenant를 넣지 않는다. 보안 감사 이력과 현재 실행 자격을 분리한다.

SQLite 일관 snapshot을 사용하고 원본/filesystem 시점도 맞춘다. 여러 DB의 WAL transaction은 전체atomic이 아님을 반영한다. WAL을 무시한 DB파일 단순copy나 테이블별 서로다른시각 export를 전체 정합 snapshot으로 부르지 않는다.

짧은 write fence 또는 generation/immutable 원본 참조로 snapshot 일관성을 확보한다. long network/parse를 SQLite write transaction 안에서 기다리지 않는다. 백업 중 변경/삭제/업로드도 시험한다.

기존 UI 평문 backup format/화면을 바꾸지 않는다. 새 관리용 통합 암호 archive는 별도 계약이다. 기존 평문형식이 남으면 그 미완료/사용제한을 숨기지 않는다.

## 9. 전체 복원 publication과 crash recovery

이번에는 빈 격리 target으로 전체 앱 복원까지 검증한다. 운영 DB에 restore/migration하지 않는다. 동일 scope 검증·archive 크기/멤버/길이/hash/schema/key 검증을 먼저 한다.

DB+파일의 물리적 한 transaction을 주장하지 말고 staging generation→검증→DB/metadata commit→원자 publication 또는 명확한 복구 상태 머신을 만든다. publication 전 incomplete generation을 읽거나 내려받지 못하게 한다. 독자는 하나의 generation을 보며 혼합하지 않는다.

concurrent restore ID/idempotency·동일tenant 다른archive·복원중종료·source파일누락·shared원본·rollback 후 orphan정리·손상hash/key·disk-full·junction/symlink/ADS/case alias·overwrite를 시험한다. manifest 경로를 신뢰하지 말고 canonical containment와 형식을 검증한다.

복원 후 jobs paused, admission/lease 무효,현재 egress deny, 실제 신원/승인 재검토다. 과거grant/승인 이력은 보존하되 현재 허용으로 활성화하지 않는다. source/policy/fact의 역사와 현재유효성을 구분한다.

fixture key 부재/회전/호환 실패는 recoverable blocked이며 완전복원 아님. 원본/parent/필드 연결, 질문/자료/검토/문서·전체legacy-v2-v3-v4 경로를 새 격리 앱으로 읽고 대조한다. completeApplicationRestore는 포함 manifest 전부 검증됐을 때만 true다.

프로세스 crash 검증과 fsync/실제 OS 전원장애·운영 key/ACL/회전 검증을 분리한다. 미시험 항목은 gate에 남긴다.

## 10. v3/v4 egress 통합·답변 재사용/export

현재 AI/intake/MCP/공개worker/linked detail/요약/답변 재사용/export/backup다운로드 경로를 inventory한다. local authorized download와 제3자외부송신은 다른 정책이다. 둘 다 exact source/version/tenant의 접근 근거는 필요하다.

v3 digest 기반 허용은 권한있는migration 없이 v4 grant로 자동승격하지 않는다. exact evidence/version/hash를 복구할 수 없으면 unknown/deny다. 기존 v3 경로의 migration adapter를 격리 복사본에서 시험한다.

모든 private 전송에 서버가 생성한 parent와 actual serialized payload hash를 연결한다. 같은hash 다른 자료·옛파생물·부분문자열·번역·결합·도구결과·응답재사용을 포함한다. caller가parent를조작하거나public으로선언해 우회하지 못하게 한다.

fallback 제거 전에380기준선의 각호출과legacy facade를확인하고fixture host에정확한scope/grant를provision한다. 테스트 bypass·synthetic이면무조건allow·bootstrap신원자동승격은금지한다.

production entrypoint 연결/배포는 하지 않는다. 격리 enforcement 일반앱+합성앱에서 UI/test flag없이 fail-closed를 시험한다. 아직 fallback/parent미해석이남으면 B-egress미완료다.

## 11. 교차 process 전송 admission/철회의 보장

보장할 순서를 먼저 정의하고 구현한다.

- revoke commit이 전송 admission commit보다 먼저이면 새 전송은 허용하지 않고 outbound0을 검증.
- admission 후 철회에는 새 lease/재시도/후속호출을 막고 대기중송신/진행중stream을 가능한범위에서cancel.
- admission과실제first-byte 사이, 이미송신된bytes는 무조건0/회수로 보장하지 않는다. 상태와한계를 기록.

DB-backed send-intent/fence·짧은transaction·단일dispatcher 등 구현방식을선택하되, 실제 transport와linearization point를연결한다. 단순‘마지막check후await없음’을 cross-processatomic으로 부르지 않는다. broker를도입해도원격서비스의fencing/회수없는물리적한계를명시한다.

revoke도같은권한epoch/상태기계에참여하고활성송신의cancel신호를전달한다. worker crash·lease만료·DB busy·dispatcher재시작·토큰획득중철회·기타process철회·send시작경계에서barrier/hook로결정적시험한다. retry는새permission확인과budget이며 과거admitted상태를재사용하지않는다.

send-intent admitted/started/firstByteObserved/completed/cancelled/unknown을 실제 관찰 가능한 범위로 나눈다. host에서 first byte를 관찰하지 못하면 그렇게 남긴다. 허용된전송1회와취소후잔여byte측정,금지전송0회를분리한다.

네트워크 await를 길게 DB write lock 안에 넣어 철회 자체를 막거나 deadlock을 만들지 않는다. ‘마지막 check→bytes’의 잔여race를실제로닫지못하면한계와최소다음조건을유지한다.

## 12. v3 평문 queue와 trace의 격리 migration

운영이관은금지지만 migration코드·dry-run·fixture복사본검증은구현한다. v3queue/저널·source/case/trace·오류·backup에남는평문을inventory한다.

보호query/payload·parent로이관하되원본의법적보존/hold와실행TTL을분리한다.24시간/7일은모의설정이지법정기간아니다. 최소감사이력과민감내용의폐기를분리한다.

읽기전용dry-run→보호copy→hash/parent/재개검증→migrationmarker→원래자료삭제가능검토의단계를정한다. 실제사용자승인없이는운영평문삭제를하지않는다. 복사/대조만으로평문 제거 완료라하지않는다.

migration실패/중단/두번실행/키부재/hold/TTL/복원/수동보완충돌을시험한다. 제어되지않은기밀trace가남으면 B-queue/저장보호gate는미완료다. OS ACL/실제 키회전은별도미검증.

## 13. quota·conditional·오류 원문 잔여

현재 per-request permit과transport_exhausted분기를보존한다. 다중 process crash/장시간socket·동일계정다른service·MSDSlinked16·취소/fence를시험한다. 공식 계정 mapping이없으면모의그룹과실제그룹을구분한다.

A07지연해소를종료조건으로하지않는다. 기존 bounded시도·취소·재개·partial·이력과다른작업동시성을검증한다. 이미막힌재시도곱을있는것처럼단정하지않는다.

HTTP오류본문은미수집상태를유지하거나별도상한/암호quarantine을구현한다. echo비밀과기관로그인HTML을정상capture/증거로바꾸지않는다.

304/range는공식지원·같은query/권한/representation/validator/저장hash가확인된adapter에만연결한다. 저장본문없는304·변경validator·중간206·snapshot변동을시험한다. 공식미지원과앱미구현을구분하고정상0건으로합치지않는다.

## 14. 인수·측정·후속 정책

380시험과8브라우저기준선은보존하고추가시험수는실제 기능에따라계산한다. 개수 목표 맞추기·기존 실패 삭제·fixture를실표본으로 표시·P0실패무시금지.

최소증거:

- 공식PDF/HWPX2개 provider발견→download→암호화→parser→원문 대조.
- 52operation각증거등급·실제 검증 분모/누락.
- A07/A08제공필드만S2proposal·독립검토·문서trace.
- 서식목적/단위/시점/음수/참조충돌·S5개정경계.
- legacy/v2/v3/v4 전체 복원및generation/paused/deny.
- v3 전송fallback migration·답변 재사용/export parent.
- 다중 processrevoke/admission/cancel·quota/fence/crash.
- queue/trace모의 migration·민감fixture의로그/평문backup잔류.
- 29동결·동기계약·기존 질문/자료/검토/문서/승인UI흐름.

외부provider모의와내부서비스모의를혼동하지않는다. 주요 E2E는내부 실제 구현이다. Golden정답은공식자료+독립검토/holdout으로만들고LLM자체답변만으로정답셋을만들지않는다.

거짓적합/위반/비대상·보류오류·단위/기한/버전오류·parent누락·권한/전송우회·복원단절을분모와함께기록한다.

교육5→안전관리자6→안전검사5→잔여는등록부실제ID로다음묶음을만들고기술적으로가능하면계속진행한다. 그러나법적 의무와내부권고·분야 승인 대기를분리한다. 효과확인후보를독립법률위반으로활성화하지않는다.

## 15. 결과 산출물과 종료조건

`docs/implementation-v5/`에README·전후 manifest/동결/최종 sourceDigest·execution/실패기록·380이름 보존·8기존E2E·72인수+신규·operation specimen matrix·공식첨부manifest/원문/추출·S2field-mapping/실무trace·법령profile/conflict·전체backupmanifest/복구상태·egresspath/admission/race·migration/TTL·release-gate를남긴다.

종료는영역별로구분한다.

- A-attachments:표본provider의실제경로/암호capture/parser와원문 대조까지. 다른provider/OCR/인터넷socket미검증은유지.
- A-schemas:공식 명세·예시·독립 실응답분모를구분해확보한것만완료.52전부실호출검증으로하지않음.
- C-cases:S2raw→제공필드proposal→수동보완→합성독립검토→문서가끝까지연결. 실제fact/사업장승인은대기.
- B-backup:포함manifest전부와legacy/v2/v3/v4읽기·paused·deny·crash정합성검증. 미포함 자원/실제power-loss/key/ACL은명시.
- B-egress:정확parent통합과admission기준철회보장. 물리적송신이후의한계·미연결경로를숨기지않음.
- B-queue:격리 migration와민감잔류검증. 운영평문정리/실제hold·TTL승인은대기.
- D-policy:공식원문·기준일·참조·서식/고시충돌을명확히축소. 실제 분야 승인없이활성화하지않음.
- E-site/E-production:실제자료/사용자권한과후속 운영 승인이없으므로유지.

## 16. 마지막 보고

1. 재확인한기준선/현재소스차이.
2. 새실제연결/정적관찰/합성 fixture의구분.
3. 시험성공/실패/수정후재시험·최종 sourceDigest.
4. 52operation의합성·명세·문서예시·독립 실응답·실호출분모.
5. provider별첨부/parser/OCR/socket완료범위.
6. S2mapping과누락/동일성/독립승인의한계.
7. 전체 앱 복원manifest포함범위·중간장애·paused/deny.
8. 전송 admission/교차 process 철회/cancel의 보장 범위와 잔여 race 한계.
9. 법적 원문/고시·서식충돌/전문가검토·43+2후보상태.
10. 유지한12개gate+[blocked]의최소 해제 조건과다음묶음.
11. UI/UX변경0·운영 접속/key/배포/재시작/실자료변경/활성화0.

기술 시험 완료·공식 자료 확보·원문 대조·법적 승인·실사업장 적용·운영 완료를한상태로합치지마라. 이번v5가끝나도증거없는‘전체완료/운영 준비 완료/법적으로적합’을선언하지마라.

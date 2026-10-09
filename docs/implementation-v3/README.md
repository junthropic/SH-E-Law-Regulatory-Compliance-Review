# v3 실행 결과 — 격리 개발

첨부 통합본의 본문은 조사·정정 참고자료로 읽고, 부록 CODEX 실행 프롬프트 v3를 한 번 수행했다. v2의 중복 프롬프트를 재실행하지 않았다. 아래 결과는 실제 사업장 적합성이나 운영 적용 완료를 뜻하지 않는다.

## 1. 실제 확인한 기준선

- HEAD: `e770bdefb32fbb6a010b435f372f2d13c9fb384f`.
- 기존 작업 트리는 미커밋 상태였다. 기존 변경을 되돌리거나 새 변경으로 재분류하지 않았다.
- v2 sourceDigest `58adb10c72f45450a365ea5d1aed9ea61ede26ee1941b62f7a149deb59bc14d2`의 108개 파일을 다시 대조했고 모두 일치했다.
- 변경 전 격리 환경에서 기존 282개 시험 및 6개 E2E를 재실행하여 통과했다.
- 32서비스·52operation, 8그룹·43개 하위 의무, AC48개+V2 24개를 유지했다. 과거 API 성공을 이번 live 성공으로 바꾸지 않았다.

기준선은 baseline.json과 baseline-validation 기록을 참조한다. 최종 변경 소스 digest는 `26dc4d816b8caa152bc551bd28f6dbdfcc6b6654b4db6fc078c85ee0afea938a`다. HEAD만으로 시험 빌드를 식별하지 않는다.

## 2. 새로 구현한 연결

기존 자연어 review·자료 원본·사실을 v2 source/evidence/fact/policy/decision과 trace에 연결했다. 원래 입력 확인과 새 증빙 승인을 구분하고, 기존 세 결과 분류 및 export 형식을 유지했다. shadow 비교와 격리 projection을 제공하며 운영 기본 entrypoint에는 등록하지 않았다.

가상 관리 HTTP에서 유효기간·철회·scope·역할, cookie/CSRF, 원문 업로드, 작성·독립 승인·반려·보완 요청·철회·판정·조치를 연결했다. 영속 작업에는 lease/fence·공유 quota·checkpoint·취소·재개와 기존 동기 응답 호환 경로를 추가했다.

6개 위험물 의무 후보, 기간 계산·반복 모델·예외 효과, 실제 호출 직전 전송 차단, SQLite online snapshot 기반 관리용 AES-GCM 백업·복원을 구현했다. 상세 계약의 한계도 각각 문서화했다.

## 3. 직접 실행한 결과

최종 격리 복사본 `work/v3-validation-2jt8ec`에서 타입 검사·서버 빌드·프론트 빌드 및 **332/332 시험**을 통과했다. 기존 282개 시험 이름은 모두 남아 있고 50개 case가 추가됐다. 시험 개수는 assertion 수나 법률 정확도가 아니다.

기존 브라우저 E2E 6개와 신규 v3 E2E 1개, 총 7개를 통과했다. 외부 provider만 모의하고 새 시험의 앱·권한·DB·worker·façade는 실제 코드로 실행했다. 두 독립 프로세스의 claim/quota 경쟁, worker 비정상 종료 후 checkpoint 재개, 복원 프로세스 중단 후 일지 복구, 전송 금지 시 실제 fetch 0회, 3MiB 원본의 HTTP 암호 백업 왕복을 확인했다.

| 가상 시나리오 | 이번 실행 | 남은 범위 |
|---|---|---|
| S1 관리자 변경 | 기존 화면 업로드·질문→6개 하위 의무 보류·trace. 별도 HTTP 증빙·정책·판정·조치 승인 연쇄 | 자유문 사건 날짜 정규화·실제 관리자/자격/신고 증빙 |
| S2 수탁업체 | A07 지연·기존 endpoint 재조회·로컬 저장 동시성, A08 오류, 동일성·처분·허가 불일치 함수 시험 | A07/A08 전체 증빙을 하나의 실무 객체로 자동 연결하는 수직 흐름은 부분 구현. 실제 위탁 적합성 미검증 |
| S3 점검·제출 | 기존 화면의 점검일 질문, 개정 전후 날짜·보존기간 분기·제출과 점검 사실 분리 시험 | 전체 제출 수리 증빙·늦은 제출의 독립 결과 추적 및 실제 원문 적용 승인 |
| S4 변경·복원 | HTTP 원문 변경의 관련 승인 무효화, 빈 격리 DB 복원·현재 재검토·원본 유지·복원 중단 | 실제 운영 자료 복원·운영 키 관리·실제 동시 복원 부하 |

독립 전문가 정답 자료가 없어 법률 정확도·거짓 적합률·거짓 비대상률 등은 null로 남겼다. 작은 모의시험의 성공을 정확도 100%로 표기하지 않는다.

## 4. 실패와 수정 후 재시험

- 초기 컴파일에서 타입 이름(Query/PublicQuery)과 오류 처리의 unknown 타입을 바로잡았다.
- 새 HTTP 시험이 createApp 반환 객체를 잘못 취급하던 시험 코드와 누락 헤더 표현을 수정했다. 실제 세션/CSRF 행렬은 수정 후 통과했다.
- 새 A07 시험의 mode를 기존 계약인 search로 바로잡았다. 제품 계약을 바꾸지 않았다.
- 월말 초일 제외에 따른 실제 기산일 이동을 코드·공식 원문 대조로 발견해 기간 계산을 수정하고 회귀시험을 추가했다.
- 새 브라우저 시험은 이전 결과 제목을 찾다가 한 번 시간초과했다. projection이 제공하는 의무 제목으로 시험 선택자를 수정한 후 다시 통과했다. 화면을 수정하지 않았다.
- 공식 단일조문 endpoint의 HTTP 200 빈 본문을 확보 완료로 보지 않고 full 법령 경로에서 부칙을 확인했다.

초기 E2E 실패 로그와 최종 성공 로그는 별도 보존한다. 이전 실행의 실패·보류를 지우지 않는다.

## 5. 미구현·미검증·해석 미확정

32/52 전체 operation별 원문·상세·첨부 바이너리와 fixture의 완전한 대응, 실제 conditional 304 transport, 모든 원천의 변경·삭제 자동 탐지, 나머지 37개 정책의 실행 구현, 실제 예외 효과와 정책의 완전 결합은 남아 있다.

전체 간접 전송 경로의 파생 출처 연결, queue에 들어갈 수 있는 민감 검색어의 완전한 보호, 운영 계정별 quota/reset, 다중 실사용자 신원 공급, 원본 파일시스템 공격·전원 장애 내구성·최대 크기 부하시험도 추가 검증 대상이다. 현재 코드의 검증 범위를 넘는 '통합 완료'로 표시하지 않는다.

기존 UI 백업은 기존 평문 JSON 계약이다. 암호화 백업은 별도 관리 HTTP 경로로 검증했다. UI parser 연결은 변경 금지 때문에 이번 작업에서 바꾸지 않았다.

## 6. 자료·전문가·운영 승인이 필요한 항목

실제 사업장 정보와 보유자료가 없으므로 실제 화성시 사업장의 사실관계는 여전히 미확인이다. 전체 공보·위임·별표·예외의 적용 적합성을 이번 후보 시험으로 확정하지 않는다. 실제 실무자·분야 전문가의 법적 승인, 사용자 계정별 API 운영 승인, 외부 AI 제공 계약 검토가 필요하다.

72개 인수항목의 이전 원문·ID·결과와 미확인 조건을 acceptance-map.json에 보존했다. 기술 구현·실행·법적 검토·실무 검토·사업장·배포 축을 분리했다. 법적/실무 인수 72개 전체 완료가 아니다.

## 7. UI/UX 변경 0 확인

기존 동결 12개와 확장 동결 **29개**의 전후 SHA-256이 모두 같다. src·shared·public·index·Vite 설정·package/lockfile·운영 dist를 포함해 점검했다. 기존 버튼·탭·문구 템플릿·레이아웃·동선은 수정하지 않았다. 결과 데이터에는 요청한 한국어 보류와 추적 정보만 기존 계약으로 전달한다.

manifest의 addedSinceBaseline은 **기존 108개 manifest에 없던 항목**이라는 뜻이다. AGENTS.md, index.html, vite.config.ts는 원래 존재한 파일이며 이번에 만든 파일이 아니다. UI 파일의 기존 미커밋 변경도 이번 변경으로 재분류하지 않는다.

## 8. 운영 배포·재시작 0

운영 4317에 접속하지 않았고 서버 종료·재시작·교체·배포, .local 읽기/쓰기, 반복 감시 재개, 실제 인증키 사용, 실제 법적 규칙 활성화를 하지 않았다. 격리 서버만 임의 포트로 실행하고 시험이 끝난 뒤 종료했다. 작업 파일은 미커밋 상태로 남아 있으며 push도 하지 않았다.

## 9. 다음 단계 종료 조건

1. operation별 원문·상세·첨부 adapter와 독립 fixture를 52개 모두 명시적으로 대응하고, 부분 실패·변경·재개 시 원문 유실이 없음을 확인한다.
2. S2의 허가·처리능력·계약·처분 자료, S3의 제출 수리·지연 이력을 기존 관리 객체와 끝까지 연결한다. 실물 자료가 없으면 가상 범위만 종료한다.
3. 6개 정책의 대상·기산·특별규정·예외·위임·잔존 의무를 분야 검토자가 해당 원문 버전으로 승인하기 전 실제 규칙을 활성화하지 않는다. 37개 후보는 별도 묶음으로 이어간다.
4. 모든 파생물의 egress 출처 연결, 민감 queue 보호, 계정별 제한·운영 신원·암호키 복구를 확정하고 회귀시험한다.
5. 운영 적용은 사용자 별도 승인 후에만 진행한다. 현재 앱에 바로 반영된 것으로 안내하지 않는다.

## 산출물 찾아보기

| 요청 산출물 | 파일 |
|---|---|
| 기준선·전후 소스·동결 | baseline.json, source-manifest.json, build-verification.json, ui-freeze.json |
| legacy/v2·기간·projection | integration-contract.md |
| principal·HTTP 행렬 | security-egress-backup.md, test-inventory.json의 V3-H |
| 6개 정책·원문·정정·승인 | selected-policy-review.md, policy-contracts.json, official-sources.json, official/ |
| 기간·반복·예외 | selected-policy-review.md, tests/v3-policies.test.ts |
| worker·quota·checkpoint·cancel | durability-api.md, tests/v3-runtime.test.ts |
| A07/A08 가상 사례·live 구분 | durability-api.md, tests/v3-collection.test.ts |
| 32/52 수집 그래프 | api-registry.json |
| egress inventory·deny | security-egress-backup.md, V3-E01~03 |
| 백업 포맷·키·크기·복구 | security-egress-backup.md, V3-B01~04 |
| 72개+V3 추적·S1~S4 | acceptance-map.json, 이 문서 3번 |
| 실행·실패·지표 | execution.json, test-inventory.json, metrics.json, failure-record.json, logs/ |
| 실제 사업장·승인·배포 차단 | current-status.json, release-gate.json |

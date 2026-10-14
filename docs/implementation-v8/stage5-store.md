# v8 단계 5 — Store 제출 자료와 베타 문서

작성 2026-10-14. 기준 main `7c1a20a`. 제출은 사용자가 직접 한다(Microsoft 계정 로그인·Partner Center 입력·제출 버튼은 Claude Code가 하지 않는다).

## 1. 산출물 (`docs/implementation-v8/stage5-store/`)

| 파일 | 내용 | 지시서 항목 |
|---|---|---|
| `privacy-policy.md`, `privacy-policy.html` | 개인정보 처리방침(한국어). HTML은 외부 자원 없는 단일 파일(웹 게시용, 어두운 화면 대응) | 개인정보 처리방침 |
| `store-listing.md` | 앱 이름 후보 3개, 짧은 설명, 상세 설명(첫 줄 "검토 후보 — 법적 판단 아님, 베타"), 주요 기능 8개, 검색어, 연령 등급 질문지 답변안, 카테고리·판매 지역·가격·공개 범위 제안 | Store 등록 문구, 연령 등급·카테고리·지역·가격, 공개 범위 |
| `screenshots/` | 합성 자료 스크린샷 6장, 1920×1080 PNG(Partner Center 데스크톱 최소 1366×768), `README.md`에 화면별 설명 | 스크린샷 |
| `submission-checklist.md` | 제출 전 결정 → 최종 패키지 → Partner Center 입력 순서, 인증 참고 사항(영문)·`runFullTrust` 문안 위치, 거절 시 흔한 이유와 대응 | 제출 체크리스트 |
| `beta-guide.md` | 설치 안내(Store 차단 시 IT 담당자 요청 문안 포함), 처음 할 일, 데이터 처리 안내, 알려진 한계, 의견·문의 방법(메일) | 베타 문서 |
| `changelog.md` | 버전 번호 규칙, 0.8.0.0 변경 기록(단계별 PR), 알려진 문제 | 버전 번호와 변경 기록 |

자리표시(사용자 값을 받은 뒤 채움): `TODO_SUPPORT_EMAIL`, `TODO_PRIVACY_URL`, `TODO_EFFECTIVE_DATE`, `TODO_STORE_LINK`.

## 2. 문구의 근거

모든 문장은 아래 시험·기록으로 확인한 내용만 썼다.

| 문구 | 근거 |
|---|---|
| 제작자 서버로 보내는 것 없음, 허용 목록 밖 연결 0 | V8-O01, V8-O02 (`server/egress-guard-v8.ts`) |
| 저장 암호화(AES-256-GCM, DPAPI로 감싼 키), 디스크에 평문 없음 | V8-E01~E05, V8-P04 |
| AI 기본 꺼짐, 미리보기·승인 1회 = 전송 1회, 10분 유효, 철회 후 0, 본문 없는 전송 기록 | V8-A01~A03 (`server/ai-consent-v8.ts`) |
| 자료가 없는 AI 요청(모델 목록·로그인)은 미리보기 없이 연결 | `server/ai-consent-v8.ts` — 처리방침에 그대로 적었다 |
| 보존 기본 계속, 자동 삭제 30/90/365일, 개별·전체 삭제, 삭제 기록 | V8-R01 |
| 백업 암호화, 같은 Windows 사용자 재설치 후 복원 확인, 다른 사용자·PC 미확인, 키·설정 미포함 | V8-K01·K02·K04, V8-M05, 설치 시험 `restore.ok` (`stage4-msix/install-test.json`) |
| API 키 DPAPI 저장·표시 안 함, 3묶음(OC 필수, 공공데이터포털 31개 공통, 도로명주소) | V8-Y01, V8-L01 |
| 피드백 기능 없음(2026-10-14 삭제), 문의는 메일 | V8-F01 |
| 설치판 MCP·제작자 갱신·국민신문고 꺼짐 | V8-M01, V8-M07, V8-M08 |
| 제거 시 자료 삭제 안내 | V8-M02, V8-M04, 설치 시험 `dataRemovedOnUninstall` |
| 관리자 권한 없이 설치, 첫 실행 약 141초·두 번째 1.6초 | 설치 시험(CI run 38553954580) |
| Windows 11과 CI Windows에서만 설치 시험, Windows 10 미시험 | 설치 시험 기록 |

쓰지 않은 것: 디스크 사용량(미측정, 보안 검증 계획 U10), 보안 인증·인프라 표현, AI 서비스 학습 여부 약속, 정확도·적법성 약속.

## 3. 문서와 코드가 어긋나지 않게 하는 시험 (`tests/v8-store-docs.test.ts`)

| ID | 확인 |
|---|---|
| V8-D01 | 처리방침(MD·HTML)·IT 요청 문안의 외부 주소 = 실제 허용 목록(`PUBLIC_EGRESS`·`AI_EGRESS`)의 모든 항목, 차단 주소 없음, 국민신문고 없음 |
| V8-D02 | 제출 자료에 메일 주소·PC 사용자 경로 없음, 문의처는 `TODO_SUPPORT_EMAIL` |
| V8-D03 | 상세 설명 첫 줄과 짧은 설명에 베타 라벨, 금지 표현(보안 인증·다중화·학습 미사용·보장·100%·완벽) 없음 |
| V8-D04 | 앱 이름·버전·제거 안내가 `identity.json`·`UNINSTALL_NOTICE`와 같음 |
| V8-D05 | 스크린샷 4~6장, 모두 1920×1080 PNG |

## 4. 이번에 찾은 것

- `stage1-security.md`가 국민신문고 주소를 아직 허용 목록에 적고 있었다 → 2026-10-14 제거 사실로 고쳤다.
- (2026-10-14 해소) 피드백 파일 `environment.appVersion` 고정값 문제는 피드백 기능을 삭제해 없어졌다(`beta-redesign.md`).
- 시험 번호 `V8-S01` 중복(`v8-beta`·`v8-package-scan`). 바꾸지 않았다.
- 지금 있는 Store 업로드용 MSIX(run 38553954580)는 #24 이전 코드다. 제출할 때는 main에서 다시 만든다(체크리스트 B2).

## 5. 사용자가 할 일 (요약, 상세는 `stage5-store/submission-checklist.md`)

1. Partner Center 예약 이름이 "한국 환경안전보건관리자 법령조회 프로그램"과 같은지 확인
2. 보안 검증 계획 진행 여부 결정(H1 위험도 높음, 고친 뒤 제출 권고)
3. 문의용 메일 주소 만들기 → 전달
4. 처리방침 HTML 게시 → URL 전달
5. (Claude Code) 자리표시 채우기 → main에서 최종 MSIX 생성·설치 시험·WACK
6. Partner Center 입력(가격·지역·공개 범위 → 속성 → 연령 등급 → 패키지 → 등록 정보·스크린샷 → 인증 참고 사항·`runFullTrust` 사유) → 직접 제출

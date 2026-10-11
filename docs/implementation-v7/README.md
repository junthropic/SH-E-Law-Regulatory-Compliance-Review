# v7 구현 기록 (안전관리자 6 · trace 보호 읽기 · 잔여 API 계약)

작성 2026-10-10. 기준 PR #10 (`feat/v7-safety-manager`). 법률 기준일 2026-10-08.
기술 시험·공식 원문 대조 기록이며 법적 적합성, 실제 사업장 적용, 운영 활성화를 검증한 문서가 아니다.

## 1. 결과 요약

| 트랙 | 결과 | 증거 |
|---|---|---|
| T1 안전관리자 6 | 6개 ID 모두 독립 구현·시험·격리 흐름 연결. 실행 후보 17→23, 원래 미구현 26→20 | `metrics.json`, 시험 V7-A/Q/D/R/X/P/C, `scripts/e2e-v7.mjs` |
| T2 trace 보호 | 전수 목록 작성, 확정 합성 객체 2개 범주 이관(검토 trace 읽기 전환, 이관 작업 평문 대체 차단). `allTraceCovered=false` 유지 | `trace-inventory.json`, `migration-status.json`, V7-M01~M04, V7-B02/B03 |
| T3 잔여 API 8 | 공식 평면 표가 있는 7개에 내부 계약 시험. 주소 API는 공식 표 없음. 공식 model 0개 추가 | `api-contract-levels.json`, V7-T01~T06 |

모든 후보 `enabled:false`, 전문가 승인 0, 실사업장 검증 0, 정확도 null.
UI(`src/**`)·`shared/**`·package·빌드 설정·운영 앱·실키·배포·재시작·활성화·평문 삭제: 모두 0.

## 2. 안전관리자 6 (server/safety-manager-v7.ts)

| ID | 근거 | 판정 핵심 | 보류로 남기는 것 |
|---|---|---|---|
| appointment | 영 제16조①③④⑤, 별표 3 | 행 그룹(1~27/28~48/49 건설) 인원, 관계수급인 100억·토목 150억, 전·후 15 기간, 공동선임·위탁 요건 | 1조원 이상 추가 산식, 철거만 하는 기간, 행·인원 근거 미확인 |
| qualification | 영 제17조, 별표 3 선임방법·별표 4 | 행·규모별 허용 경로, 교육 이수일 기한(이후 소멸로 보지 않음), 제8호 다른 법 적용 사업 한정, 구성 요건 | 자료 미제출(무자격 아님), 경로 사실 미검토 |
| dedication | 법 제17조③, 영 제16조② | 300명·건설 120억(토목 150억) 이상, 업무배분 자료로 전담·겸직 구분 | 인원만 있고 배분 자료 없음 |
| report | 영 제16조⑥, 규칙 제11조①, 별지 2·3호 | 관할 접수 증빙만 제출 인정, 14일(민법 제157·161조) | 2021-11-19 이전 사건(당시 조문 미확인), 토·일 외 공휴일, 2025-04-29 이전 서식 |
| dismissal_report | 영 제16조⑦(제35483호 신설), 부칙 제2조, 규칙 제11조②, 별지 3호의2 | 2025-04-29 이전 사건은 "신설 전 사건 — 비대상", 퇴사·해지·선임 구분 | 퇴사의 보고 대상 여부 |
| performance | 영 제18조 | 실제 업무 기록만 인정, 확인 범위·미확인 분리, 제9호·작업형태 고려 상시 확인 | 일률 보존기간·횟수·서식은 만들지 않음 |

미이행 후보는 독립 검토에서 미이행 입증 표시가 있을 때만 낸다. 원문·조회 근거: `official-source-and-annex-map.json`, `source/manifest.json`.

## 3. 흐름 연결과 실제 화면

**기본 앱은 v3~v7 연결을 쓰지 않는다.** `server/index.ts:4`가 `createApp()`을 인자 없이 부르고, 연결은 v3 옵션이 있을 때만 생기며(`app.ts:49-50`) 그 옵션은 시험·합성 주체에서만 허용된다(`app.ts:48`). 기본 경로의 안전관리자 질문은 위험물·산업안전보건법 후보 어느 쪽으로도 가지 않고 일반 "판단에 필요한 사실·근거 확인"만 나온다(시험 V7-F01).

격리 연결(`LegacyBridge "v7"`)에서는 산업안전보건법 안전관리자 질문이 위험물 후보와 섞이지 않는다(V7-S02).

**격리 브라우저 확인 범위 (`scripts/e2e-v7.mjs`)**
- 화면으로 확인: 업로드, 질문 → 기존 검토, Markdown export(브라우저 fetch)
- UI가 없어 서비스로 확인: 수동 보완, 독립 사실 검토
- 전체 브라우저 검증이 아니다.

## 4. 실제 화면 연결(B) 전 선결 과제 — 사용자 결정 필요

| # | 과제 | 고치면 바뀌는 동작 | 영향 범위 |
|---|---|---|---|
| B-1 | 기본 경로를 v7 연결로 전환 (`app.ts:48` 제한, 연결 종류 `v7`, `index.ts` 설정) | 운영 검토 결과가 의무 후보(위험물·폐기물·위험성평가·교육·안전관리자)로 대체·추가되고 trace·사실 표에 쓰기가 생김 | 모든 운영 검토, export 내용 |
| B-2 | 보호 사례 결과(v6 교육·v7 안전관리자)가 publish 때 평문 `reviews`에 복사됨 (`training-cases-v6.ts:40`, `safety-manager-cases-v7.ts:43`) | 화면·export가 평문 review를 읽으므로, 막으면 화면 표시·export가 보호 경로 읽기로 바뀌어야 함 | 검토 화면, Markdown/CSV export, reviewer packet |
| B-3 | `guardManagedExport`가 binding 없는 legacy review를 검사 없이 통과(`records-v6.ts:45-46`), reviewer packet export는 검사 없음(`dossier.ts:425`) | 검사하면 binding 없는 기존 검토의 export·reviewer packet이 거부되거나 권한 확인을 요구 | 기존 검토 export·다운로드 |
| B-4 | 기본 표 8개(reviews, evidence, documents, settings 등)에 tenant 없음·평문 저장, 운영 라우트 18개가 세션 쿠키만 확인 | tenant 구분을 넣으면 기존 자료의 소유권 귀속(이관 정책)이 먼저 필요하고 화면 목록·검색이 영역별로 나뉨 | 전체 운영 자료, 모든 화면 목록 |
| B-5 | 결과 표시 UI: 수동 보완·독립 검토 화면 없음 | `src/**` 동결 해제 필요 | UI 29개 동결 대상 |
| B-6 | 전문가 검토·활성화 | `enabled:false` → 활성화 시 실제 판단으로 쓰임 | 법적 책임 범위 |

## 5. 시험·CI 결과 (GitHub 실제 수치는 HANDOFF 1절)

- 새 v7 시험 76개. 로컬 Windows 전체 656/656.
- 30조건 매트릭스(b98ed6a): 로컬 Windows 30/30, GitHub Linux 30/30, GitHub Windows 25/30(시간 초과 6건, v7 시험 실패 0).
- 기존 브라우저 스크립트 10/10 + e2e-v7 통과(격리 데이터 폴더).

## 6. 이번에 하지 않은 것 (v7 문서 8·9절 등)

- 정부 첨부 2건 HTML 실패 좁은 진단, OCR, 결정 셀 원문 대조(8절): 미착수.
- 복원 directory durability·path alias·writer 경쟁·키 버전(9절): 미착수(기존 v6 32 주입 결과 유지).
- 주소 API 공식 표 확보, fire-* 인증키 이름 결정.
- 공휴일 목록을 공식 출처에서 받는 기능(현재: 토·일 자동, 나머지는 검토된 목록 입력 시에만).
- 안전검사 5: 미착수.

## 7. 파일

| 파일 | 내용 |
|---|---|
| `metrics.json` | 정책·시험·매트릭스 수치 |
| `trace-inventory.json` | T2 전수 목록 |
| `migration-status.json` | T2 이관 집계 |
| `api-contract-levels.json` | T3 8개 operation 수준 |
| `official-source-and-annex-map.json` | 법령·부칙·서식·기간 근거 조회 기록 |
| `source/` | 원문근거 v7 자료 3개(+manifest: hash·원본 경로, 제외 1개와 사유) |

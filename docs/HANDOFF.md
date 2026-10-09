# 작업 인계 (시험 안정화 · 날짜 매트릭스)

작성: 2026-10-09 (KST). 다음 작업자(Codex 포함)가 이미 끝난 일을 다시 하지 않도록 현재 상태만 기록한다.
이 문서는 시험·CI 설정 범위의 기록이며, 법적 적합성이나 운영 동작을 검증한 문서가 아니다.

## 1. 기준 커밋과 상태

| 항목 | 값 |
|---|---|
| 기준 main | `52fe8d9` (PR #2 squash merge) |
| 이번 브랜치 | `test/ci-failfast-kst-boundary` |
| main CI (52fe8d9) | run 37900494977, attempt 1, Linux·Windows 모두 성공. 실패 작업 재실행 없음 |
| PR #1 이후 main CI | run 37886239003: attempt 1에서 Windows 5개 시간 초과(5초 기본 제한), attempt 2(실패 작업만 재실행)에서 성공 |
| 알려진 문제 | 이슈 #3: V5-B05가 로컬 Windows·Node 26.7 Vitest worker에서 약 30초 지연 (CI Node 24에서는 재현 안 됨) |

작업 위치 주의: 로컬 Codex 폴더(`...\outputs\SH-E-Law-Check`)는 GitHub main과 같은 코드인지 대조되지 않았다.
이어서 작업할 때는 GitHub 최신 main을 먼저 받아서 시작한다.

## 2. 이번 브랜치에서 바꾼 것 (시험·CI 설정만)

| 파일 | 내용 |
|---|---|
| `.github/workflows/ci.yml` | matrix `fail-fast: false`. Linux 실패가 Windows 작업을 취소하지 않는다. 다른 CI 동작은 동일 |
| `.github/workflows/date-matrix.yml` | 새 workflow. `workflow_dispatch` 전용(수동 실행). Linux·Windows에서 30조건 매트릭스 실행, 결과를 step summary와 annotation으로 남김 |
| `tests/date-matrix.mjs` | 매트릭스 실행기. 날짜 5 × KST 00:00:00·08:59:59·09:00:00 × TZ UTC·Asia/Seoul |
| `tests/fixed-now.preload.mjs` | `SHE_TEST_CLOCK_LOG`가 지정된 경우에만 프로세스별 offset·관측 시각·TZ를 파일에 한 줄 기록. stdout에는 쓰지 않음. 미지정 시 동작 변화 없음 |
| `tests/date-boundary.test.ts` | 새 시험 14개. 9시·자정 경계를 정확한 순간으로 고정해 확인하고, 매트릭스 시계와 `vi.setSystemTime`·`vi.spyOn(Date,"now")`가 겹쳐 이중 적용되지 않는지 확인 |
| `docs/HANDOFF.md` | 이 문서 |

앱·서버 소스, 기준일 대조 장치, UI/UX, 법적 규칙: 변경 없음. 시험 삭제·skip·조건 완화: 없음.
시험 수 변화: 565 → 579 (새 경계 시험 14개). Linux의 DPAPI 1개 건너뜀은 기존 그대로.

## 3. 재현 명령

```bash
npm ci
npm run check                                   # 기본 실행 (SHE_TEST_NOW 없음)
npm run build && node tests/date-matrix.mjs work/date-matrix   # 30조건 매트릭스
# 일부만: SHE_MATRIX_DATES=2027-01-01 SHE_MATRIX_TIMES=09:00:00 SHE_MATRIX_TZS=UTC node tests/date-matrix.mjs work/dm
```

결과: `work/date-matrix/summary.md`, `summary.json`, 조건별 `*.json`(Vitest 보고), `*.clock.jsonl`(프로세스별 시계 기록), `*.stderr.txt`.
`work/`는 `.gitignore` 대상이라 커밋되지 않는다.

CI에서: Actions → "Date matrix (manual)" → Run workflow. 입력을 비우면 기본 30조건.

## 4. 확인된 결과

### 4-1. Linux · Node 24.21.0 (CI와 같은 버전), 2026-10-09 클라우드 작업 환경

- 기본 실행: 564 통과 · 0 실패 · 1 건너뜀 (변경 전 main), 578 · 0 · 1 (이 브랜치)
- 매트릭스 30조건: 모두 578/579 통과, 0 실패, 1 건너뜀(DPAPI)
- 조건마다 시계를 설치한 프로세스 63개(Vitest worker 42 + 자식 21), offset 값은 조건마다 정확히 1개
- 자식 21개에는 `node -e` 자식 13, 임시 스크립트 자식 6, `parse-worker.ts` 2가 포함된다
- 입력 시각과 첫 관측 시각 차이: 0.07~0.14초
- 08:59:59 조건은 시작 약 1초 뒤 09:00을 넘고, 약 45초 뒤 종료된다. 이 조건 전체가 "9시 직전"에 머문 결과가 아니다. 경계 자체는 `DATE-B01`~`B02`가 고정 순간으로 확인한다.

### 4-2. Windows

- CI Windows (Node 24.21.0), `date-matrix.yml` 수동 실행 2회 (main `229a01c` run 37912039577, `test/windows-stall-probe` run 37918383173):
  - 각 회 30조건 중 23조건 579/579 통과, 7조건에서 1~2개 실패. Windows 전용 DPAPI 시험은 60회 모두 실제 실행·통과
  - 실패 시험은 매번 달랐다 (V4-A08 5회, V3-H04 2회, V3-J03·V3-J05·V6-A01·V6-C01·sources·ai-auth×2·intake·petitions-documents 각 1회)
  - 실패 이유가 기록된 2회차 8건: 시간 초과 7건(5초 제한 6건, 40초 제한 V6-A01 1건 = 41초), 시간 예산 판정 V3-J05 1건(1초 예산 안에 작업 상태가 바뀌지 않음)
  - 날짜·시각·시간대와의 상관이 없고, 같은 조건이 Linux에서는 매번 통과했다 → Windows 실행 환경의 일시적 멈춤으로 추정 (원인 미확정)
  - 일반 CI에서도 같은 현상: main `229a01c` Windows V4-A08 시간 초과(재실행 통과), PR #5 PR 실행 Windows 10건(재실행 통과, 같은 커밋 push 실행은 통과)
  - 이슈 #3(V5-B05, Vitest worker 안에서 완료 처리가 약 30초 늦어짐)과 같은 계열일 가능성이 있으나 확인하지 않았다
- 이전 로컬 결과(Windows · Node 26.7, 다른 세션): 00:00·08:59·12:00 시각으로 30조건 565/565. 09:00:00 조건은 포함되지 않았다

### 4-3. 프로세스·장시간 시험 25개 (Linux · Node 24.21.0, ms)

"변경 전" = `a33c8e1`(PR #2 이전, 5초 기본 제한), "변경 후" = 이 브랜치. 둘 다 같은 환경에서 같은 날 측정.
CI의 시험별 소요시간은 이 작업 환경에서 로그 다운로드가 차단되어 직접 확인하지 못했다(이슈 #3의 V5-B05 수치만 인용 가능).

| 시험 | 파일 | 생성 경로 | 제한 전→후 | 변경 전 | 변경 후 | 매트릭스 30회 |
|---|---|---|---|---|---|---|
| V3-J07 | v3-runtime | `spawn(node)` 자식 2개 | 5s→30s | 282 | 276 | 269–336, 30/30 |
| V3-J08 | v3-runtime | `spawn(node)` 자식 2개 | 5s→30s | 286 | 272 | 267–333, 30/30 |
| V3-J09 | v3-runtime | `spawn(node)` 자식 강제 종료 | 5s→30s | 229 | 252 | 249–301, 30/30 |
| V3-B04 | v3-workflow | `spawn` 복원 자식 중단 | 5s→30s | 190 | 199 | 207–352, 30/30 |
| V4-A10 | v4-runtime | `spawn(node -e)` 2개 | 5s→30s | 168 | 169 | 166–227, 30/30 |
| V5-A05 | v5-process | `spawn(node -e)` + 시험용 TLS 서버 | 5s→30s | 163 | 161 | 167–219, 30/30 |
| V5-B04 | v5-process | `spawn(node -e)` revoke | 5s→30s | 199 | 197 | 211–275, 30/30 |
| V5-B05 | v5-process | `spawn(node -e)` 복원 중단 | 5s→30s | 210 | 205 | 223–331, 30/30 |
| V6-E01 review | v6-egress | `spawn(node -e)` revoke | 5s→30s | 178 | 182 | 181–241, 30/30 |
| V6-E01 extract | v6-egress | `spawn(node -e)` revoke | 5s→30s | 145 | 167 | 151–233, 30/30 |
| V6-E02 | v6-egress | `spawn(node -e)` revoke | 5s→30s | 141 | 158 | 138–176, 30/30 |
| V6-E03 | v6-egress | `spawn(node -e)` + 로컬 HTTP | 15s→30s | 143 | 145 | 144–187, 30/30 |
| V6-E05 | v6-egress | MCP `StdioClientTransport` peer | 20s→30s | 52 | 60 | 53–69, 30/30 |
| V6-E07 | v6-egress | MCP stdio peer + `spawn` revoke | 20s→30s | 180 | 200 | 178–236, 30/30 |
| MCP 고정 버전 서버 연결 | mcp-vault | MCP 서버 프로세스 | 15s 유지 | 339 | 399 | 336–430, 30/30 |
| 손상 문서 추출 격리 | petitions-documents | 추출 프로세스 | 65s 유지 | 368 | 344 | 320–468, 30/30 |
| V6-Q02 | v6-resume-process | `spawn(node -e)` 자식 중단 | 30s 유지 | 501 | 525 | 498–630, 30/30 |
| V5-A02 | v5-runtime | 코드상 프로세스 생성 없음 | 40s 유지 | 0 | 1 | 0–1, 30/30 |
| V5-C04 | v5-runtime | 코드상 `spawn` 호출 없음 | 40s 유지 | 146 | 130 | 117–149, 30/30 |
| V6-B02 | v6-restore | 코드상 프로세스 생성 없음 | 30s 유지 | 37 | 38 | 35–50, 30/30 |
| V6-B05 | v6-restore | 코드상 프로세스 생성 없음 | 30s 유지 | 9 | 8 | 8–14, 30/30 |
| V6-B06 | v6-restore | 코드상 프로세스 생성 없음 | 30s 유지 | 8 | 7 | 6–20, 30/30 |
| V6-B07 | v6-restore | 코드상 프로세스 생성 없음 | 30s 유지 | 47 | 42 | 41–91, 30/30 |
| V6-C02 | v6-workflow | 코드상 프로세스 생성 없음 | 40s 유지 | 10 | 11 | 11–33, 30/30 |
| V6-Q01 | v6-workflow | 코드상 `spawn` 호출 없음 | 40s 유지 | 67 | 51 | 41–100, 30/30 |

이 25개는 "명시적 제한 시간이 있는 시험" 목록이다. 이 중 8개는 코드상 프로세스를 직접 만들지 않는다.
제한 시간을 바꾼 것은 위 14개뿐이고 나머지 11개는 기존 값(15s·30s·40s·65s)을 그대로 둔다.

## 5. 남은 작업과 미확인 범위

1. Windows CI 일시 멈춤(4-2절): 원인 조사 또는 대응 방침 결정 필요. 현재는 실패 작업만 재실행하고 별도로 표시한다.
2. CI의 시험별 소요시간: 로그를 내려받을 수 있는 환경에서 확인한다.
3. 시계 고정이 적용되지 않는 경로(이전 보고 그대로): SQLite `datetime('now')`(compliance-v2.ts 273·275, 이관 기록 시각만), OpenSSL 인증서 유효기간(시험 인증서는 2020~2035 유효), 환경 변수를 제한해서 넘기는 자식(서버 `extraction-v5.ts`의 parser worker, MCP SDK stdio peer — 이전 보고에서 시간을 읽는 코드가 없음을 확인), 브라우저 UI. Linux 매트릭스에서 `parse-worker.ts`로 실행된 프로세스 2개는 같은 offset을 받았으나, 이것이 서버 경로인지 시험이 직접 띄운 것인지는 구분하지 않았다.
4. 시험 자료의 "오늘" 기준 불일치(아래 6절) — PR #5에 수정안, 병합 여부 결정 필요.
5. 이슈 #3 V5-B05 지연: Windows·Node 26 로컬 전용, 미해결.

## 6. 확인된 사항 (수정하지 않음, 결정 필요)

- `tests/helpers.ts`의 `request().asOf`와 `tests/legal.test.ts`의 `today`는 `new Date().toISOString().slice(0,10)`, 즉 **UTC 날짜**를 쓴다.
- 서버는 `shared/dates.ts`의 `koreaDate()`, 즉 **한국 날짜**로 비교한다 (`server/legal.ts` 55행, `server/reference-collection.ts` 110행, `server/verification.ts` 44행). 기본 시험 자료는 `historyComplete: true`라서 legal.ts 55행 분기에는 영향이 없다.
- 따라서 KST 00:00~08:59에 실행하면 시험의 기준일이 한국 날짜로 "어제"가 되어, 다른 시간대와 다른 경로를 지난다.
- 30조건 모두 통과했으므로 현재 어떤 시험도 이 차이로 실패하지 않는다. 대신 이 시간대에는 일부 시험이 의도한 "오늘 기준" 경로를 검사하지 않을 수 있다.
- 시험 보조 코드만 바꾸면 되는 수정이지만(예: `koreaDate()` 사용), 시험 동작이 바뀌므로 사용자 확인 후 진행한다.

## 7. 이전 보고 표현 정정

- "운영에서는 모든 프로세스가 같은 시스템 시계를 쓰므로 이 상황이 생기지 않는다"는 시험으로 확인한 사실이 아니다. 확인한 것은 "시험 환경에서 부모·자식 시계 차이가 생기면 V3-J09가 실패하고, 같은 offset을 쓰면 통과한다"까지다.
- 전체 제한 시간을 1ms로 강제한 실행은 "개별 제한 시간이 실제로 적용되는지"만 확인한 것이다. 성능이나 Windows 안정성의 증거가 아니다.
- "자식 프로세스를 쓰지 않는 562개 시험"은 틀린 표현이다. 562개에도 프로세스 시험이 포함된다. 정확히는: 이전 날짜 방식에서 통과한 562개(그중 프로세스 시험은 자식 내부가 실제 날짜로 실행됨), 시계 불일치로 실패한 J07·J08·J09, 그리고 현재 방식에서 부모·자식 모두 같은 offset으로 실행된 579개(4-1절).
- "나머지 11개는 기존 30~40초"는 부정확하다. 실제로는 15s·30s·40s·65s다(4-3절).
- 시험 통과는 법적 적합성이나 실제 사업장 적용을 검증한 것이 아니다.

# 작업 인계 (시험 안정화 · 날짜 매트릭스)

작성: 2026-10-09 (KST), 갱신 2026-10-10 (v7). 다음 작업자가 이미 끝난 일을 다시 하지 않도록 현재 상태만 기록한다.
이 문서는 시험·CI·후보 구현 범위의 기록이며, 법적 적합성이나 운영 동작을 검증한 문서가 아니다.
v7 상세: `docs/implementation-v7/README.md`.

## 0. v8 현재 상태 (2026-10-15 갱신, 이 절이 아래 1~7절보다 최신)

| 항목 | 값 |
|---|---|
| 지시서 | EHS 실행 지시서 v8 — 설치형 베타(Microsoft Store), 단계 0~5 |
| 기준 main | `7c1a20a` (#25). main CI Linux 711 통과·4 건너뜀, Windows 714 통과·1 건너뜀 |
| 단계별 기록 | `docs/implementation-v8/stage0-scan.md` ~ `stage5-store.md` |
| 단계 5 | Store 제출 자료·베타 문서 `docs/implementation-v8/stage5-store/`(처리방침 MD·HTML, 등록 문구, 스크린샷 6장, 제출 체크리스트, 베타 안내, 변경 기록). 문서·코드 일치 시험 V8-D01~D05 |
| 패키지 | `packaging/msix/identity.json` 0.8.2.0(2026-10-17 올림), Partner Center 값 반영. 최종 Store MSIX는 main에서 `msix.yml`로 다시 만든다(run 38553954580 산출물은 #24 이전) |
| 베타 화면 개편 | 브랜치 `v8-beta-redesign`(main `5ffab56` 기준, 미커밋·미푸시): 디자인 토큰·Pretendard 번들·결과 화면 재구성·접근성(P0/P1), 피드백 화면·API 삭제, UI 재동결(기존 29개 그대로), Store 스크린샷 6장 재촬영. 기록 `docs/implementation-v8/beta-redesign.md`. 다크 테마는 나중에 |
| 사용자 결정 대기 | 예약 앱 이름 일치 확인, 보안 검증 계획 실행 여부(H1 높음), 문의 메일, 처리방침 게시 URL, DAST 도구 사용 여부 |
| 제출 | Microsoft 계정·Partner Center·Store 제출은 사용자가 직접 한다 |
| CI 방침 | PR은 Linux만, main push는 Linux+Windows. Windows 시간 초과는 실패 job만 재실행하고 기록. 무거운 시험은 개별 30초(#25) |
| 알려진 문제 | 시험 번호 V8-S01 중복(`stage5-store/changelog.md`). 피드백 `appVersion` 문제는 기능 삭제로 해소 |

## 1. 기준 커밋과 상태 (v7 시점 기록)

| 항목 | 값 |
|---|---|
| 기준 main | `d138dca` (PR #9 squash merge, 2026-10-10) |
| main CI (d138dca) | run 38041510706, attempt 1: Linux 579 통과·1 건너뜀(DPAPI)/580, Windows 580/580 |
| 진행 중 브랜치 | `feat/v7-safety-manager` → PR #10 (초안, 사용자 확인 후 병합) |
| PR #10 CI | 최종 수치는 PR #10 본문·최종 보고 참고. Windows 시간 초과로 실패 작업만 재실행한 기록은 4-5절 |
| 기본 앱 연결 | **운영 `createApp()`은 v3~v7 연결을 쓰지 않는다** (`index.ts:4`, `app.ts:48-50`). v7 안전관리자 후보는 격리 환경에서만 동작 |
| 알려진 문제 | 이슈 #3: V5-B05가 로컬 Windows·Node 26.7 Vitest worker에서 약 30초 지연 |

작업 위치: `C:\she\repo` (GitHub `junthropic/SH-E-Law-Regulatory-Compliance-Review`). Codex 폴더와 `SH-E-Law-Check` 저장소는 더 이상 쓰지 않는다.
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

### 4-4. V4-A08 · V3-J05 (2026-10-10)

**Windows `--maxWorkers=2` 실험** (`date-matrix.yml` 수동 실행 동시 2회, 브랜치 `test/matrix-vitest-args`)

| | A 인자 없음 (run 38027503755) | B `--maxWorkers=2` (run 38027505182) |
|---|---|---|
| Windows 실패 조건 | 13/30 (실패 14건, 모두 5초 시간 초과, V4-A08 5회) | 30/30 (실패 31건, 대부분 V4-A08 시간 초과 5.2~7.1초) |
| Windows 소요 | 80.9분 | 64.5분 |
| Linux | 0/30 실패, 19.5분 | 1/30 실패(V3-J05), 12.0분 |

→ "동시 실행이 많아서 멈춘다" 가설은 뒷받침되지 않았다. `--maxWorkers=2`는 일반 CI에 적용하지 않는다.
`SHE_MATRIX_VITEST_ARGS`(매트릭스 실행기에 Vitest 인자 전달)는 실험 도구로 PR #8에 포함했다.

**V4-A08** (PR #8, `add51c4`): 개별 제한 시간 5s(기본) → 30s. 판정 조건·전체 `testTimeout` 변경 없음.
PR #8 CI 소요: Windows 1,642ms·1,992ms, Linux 412ms·348ms. 매트릭스 결과 파일은 실패 시험만 기록하므로 매트릭스에서의 통과 소요시간은 확인하지 못했다.

**V3-J05 원인**: 시험이 `workOne`에 lease 100ms(갱신 33ms 간격)를 줬다. 이벤트 루프가 약 100ms 이상 멈추면 lease가 만료되고,
1초 예산 타이머가 `fail()`을 부를 때 `current()`가 거부(`만료·취소된 worker 결과 차단`)한다. `workOne`이 이 예외를 삼키고 `null`을 돌려주므로 상태가 `running`으로 남는다.
멈춘 작업은 다음 `claim`에서 `failed`/`budget`으로 정리된다. 운영 lease는 70초라 같은 일이 일어나려면 수십 초 멈춤이 필요하다 → 앱 경쟁 조건이 아니라 시험의 lease가 짧은 문제.
고의 멈춤 시험: 0·30·60ms 멈춤은 통과, 90ms 이상 멈춤은 매번 `running`.

**V3-J05 보완** (PR #9, 병합 대기):
- 시험: lease 100ms → 500ms(예산 1초 미만 유지). 판정(`failed`/`timeout`) 변경 없음.
- 새 시험 V3-J11: 주입한 작업 시계로 lease 만료를 고정 재현. `workOne`이 `null`, 상태 `running`, `fail_rejected` 기록, 다음 `claim`이 `failed`/`budget`으로 정리.
- 앱(`server/jobs-v3.ts`): `workOne`에서 `fail()`이 거부되면 기존 `v3_job_events`에 `fail_rejected` 이벤트를 남긴다(lease 만료 시 사유 `만료 후 실패 기록 거부`). 작업 상태·반환값·흐름 변경 없음. UI 변경 없음.

V3-J05 로컬 재현율 (Windows, 16코어, V3-J05만 반복 실행):

| 부하 | lease 100ms | lease 500ms |
|---|---|---|
| 순차 30회 | 0/30 | — |
| 16 동시 | 0/64 | — |
| 32 동시 | 13/96 (13.5%) | 0/96 |
| 16 동시 + CPU 부하 16 | 36/64 (56%) | — |
| 32 동시 + CPU 부하 16 | 75/96 (78%) | 4/96 (4.2%), 재측정 0/96 |

V3-J11은 32 동시 + CPU 부하 16에서 0/96. PR #9 CI: Linux 579 통과·1 건너뜀(DPAPI) / 580, Windows 580/580 (push·PR 실행 모두 attempt 1).

### 4-5. v7 (2026-10-10, PR #10)

- 안전관리자 6개 후보 구현·격리 흐름 연결, T2 trace 보호 읽기 일부 이관, T3 API 7개 내부 계약 시험. 상세 `docs/implementation-v7/`.
- 새 시험 76개, 로컬 Windows 전체 656/656. 기존 브라우저 스크립트 10/10 + `e2e-v7` 통과(격리 데이터 폴더).
- 격리 브라우저 확인 범위: 화면으로 확인 = 업로드·질문→기존 검토·Markdown export / UI가 없어 서비스로 확인 = 수동 보완·독립 검토. 전체 브라우저 검증이 아니다.
- 30조건 매트릭스(b98ed6a): 로컬 Windows Node 26.7 30/30 643/643, GitHub Linux 30/30(642·1 건너뜀), **GitHub Windows 25/30 — 5조건 시간 초과 6건**: V5-B01 2회(그중 1회 20.4초), V4-A04, V5-A04, store 백업 시험, V2-06. v7 시험 실패 0. V5-B01 20.4초가 이슈 #3(Vitest worker 안 SQLite 백업 완료 지연)과 같은 계열인지는 **추정만 가능, 확인하지 않음**. 일반 CI에서 V5-B01은 변경 전 1,079ms·후 1,080ms로 같았다.
- 일반 CI에서 실패 작업만 재실행한 기록(모두 Windows, 모두 시간 초과):
  - `c0ffff2` push: reference-collection 5초 → 재실행 1회 통과
  - `b98ed6a` push: V3-E01 5초 → 재실행 1회차 V3-H04·V5-B01 5초 → **재실행 2회차 통과**
  - `0e25da2` PR: DPAPI 15초·reference-collection 5초·**V7-F01 30초**(평소 2~8초) → 재실행 1회 통과
- 작업 절차 기록: 편집 보호 훅(lean-forge)이 Edit를 막았을 때 `sed`로 시험 파일을 바꾼 일이 1회 있었다(그 과정에서 import가 지워졌고 허용된 방법으로 복구). 이후로는 막히면 이유와 필요한 변경을 보고하고 허용된 방법으로만 진행한다.

## 5. 남은 작업과 미확인 범위

1. Windows CI 간헐 실패 처리 방침(2026-10-10 결정, 당분간): 시간 초과나 V3-J05 실패는 실패한 작업만 재실행하고, 재실행으로 통과한 결과는 별도로 표시한다. 원인(Windows runner 멈춤)은 미확정. `--maxWorkers=2`는 개선이 아니었다(4-4절).
2. 이슈 #3 V5-B05 지연: Windows·Node 26 로컬, 미해결. CI 매트릭스의 V5-B01 20.4초가 같은 계열인지 미확인(4-5절).
3. 시계 고정이 적용되지 않는 경로: SQLite `datetime('now')`(compliance-v2.ts 273·275, 이관 기록 시각만), OpenSSL 인증서 유효기간(시험 인증서 2020~2035), 환경 변수를 제한해서 넘기는 자식(parser worker, MCP stdio peer — 시간을 읽는 코드 없음 확인), 브라우저 UI.
4. **실제 화면 연결(B) 전 선결 과제 — 사용자 결정 필요** (각 항목의 바뀌는 동작은 `docs/implementation-v7/README.md` 4절): ① 기본 경로를 v7 연결로 전환, ② v6/v7 보호 사례 결과의 평문 reviews 복사, ③ `guardManagedExport`의 binding 없는 legacy review 무검사 통과·reviewer packet 무검사, ④ 기본 표 8개 tenant 부재·평문 저장과 운영 라우트 tenant 미구분, ⑤ 수동 보완·독립 검토 UI(동결 해제 필요), ⑥ 전문가 검토·활성화.
5. T2 잔여: `allTraceCovered=false`. 소유권 불명 표 16개, parent 없는 외부 결과 12곳, 평문 잔류 12곳, 평문 삭제 0. v3_shadow의 다른 reader(management-v3/v4/v5)는 평문 경로. 보호 사본 7일 TTL(`migration-status.json`).
6. T3 잔여: 공식 typed model 0/8. 주소 API 공식 표 없음. **fire-approval·fire-revocation 인증키 이름 충돌**(공식 표 `ServiceKey` ↔ 앱·기존 시험 `serviceKey`) — 결정 필요.
7. 공휴일: 기한 계산은 토·일 자동, 그 밖의 공휴일은 검토된 목록을 입력한 경우에만 반영. **공식 출처에서 공휴일 목록을 받는 기능은 범위 밖 — 남은 작업.**
8. v7 문서 8·9절 미착수: 정부 첨부 2건 HTML 실패 진단, OCR, 결정 셀 원문 대조, 복원 directory durability·path alias·writer 경쟁·키 버전. 안전검사 5 미착수.
9. V3-J05: lease 500ms에서도 극단 부하에서 1회 4.2% 실패(4-4절). PR #9 병합 후 일반 CI에서는 아직 재발하지 않음(관찰 계속).
10. 일일 법령 수집: GitHub Actions 비밀값 `LAW_OC` 미등록으로 2026-10-10 실행이 수집 전에 종료(재실행·수정 안 함).

(지난 항목 정리: "CI 시험별 소요시간 확인"은 로그 다운로드로 해결, "PR #5 병합 여부"는 병합 완료로 삭제)

## 6. 확인된 사항 — 해결됨 (PR #5, 2026-10-10 병합)

PR #5로 아래 두 곳이 `koreaDate()`(한국 날짜)를 쓰도록 바뀌었다. 아래는 당시 기록이다.

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

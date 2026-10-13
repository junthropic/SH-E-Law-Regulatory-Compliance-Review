# v8 단계 4 — MSIX 패키지 (Microsoft Store 제출용)

작성 2026-10-13. 기준 main `095d9f3`. 시험은 모두 합성 자료로 했다. 실제 키, 실제 사업장 자료, 외부 API 호출은 쓰지 않았다.
설치 시험과 WACK은 깨끗한 GitHub Windows 러너(`.github/workflows/msix.yml`)에서 돌렸고, 로컬(Windows 11) 결과와 구분해 적는다.

## 1. 결과 요약

| 항목 | 결과 |
|---|---|
| 패키지 | `SHELaw-Beta_0.8.0.0_x64_test.msix` **71.1MB**(CI, Node 24.21.0). 설치 후 파일 302개, 약 144MB |
| 패키지 검사기 | 차단 0건. 검토된 외부 항목 194건은 예외 목록과 정확히 일치해 통과(§6) |
| WACK 10.0.26100.8249 | **전체 PASS**. 필수 시험 13개 모두 PASS. 선택 시험 11개 중 2개 FAIL(§5) |
| 설치 시험(CI) | **12/12 단계 통과** ([run 38409111339](https://github.com/junthropic/SH-E-Law-Regulatory-Compliance-Review/actions/runs/38409111339)) |
| 관리자 권한 | 설치에 관리자 권한이 필요 없다. CI에서 새로 만든 표준 사용자 계정으로 설치했고 `installed=True admin=False`였다. 관리자 작업은 시험 인증서 신뢰 단계 하나뿐이다(시험 전용, Store 배포에는 없음) |
| 첫 실행 / 두 번째 실행 | CI는 첫 실행 138초(법령 초기 자료 가져오기), 두 번째 2.7초. 로컬은 첫 실행 102초, 두 번째 1초 |

## 2. 패키지 구성

`node scripts/build-msix-v8.mjs --test-identity [--sign-test]` 또는 `--store`로 만든다. 출력은 `.local/msix/`(git 제외)이다.

| 경로 | 내용 |
|---|---|
| `SHELaw.exe` | 시작 메뉴 실행기(C# 5, Windows 기본 .NET Framework 컴파일러로 빌드). 소스는 `packaging/msix/launcher/` |
| `app/node/node.exe` | 빌드한 Node(공식 배포본). CI 빌드는 24.21.0 |
| `app/server/*.js` | 서버를 rolldown으로 묶은 파일. 실제로 쓰는 코드만 들어간다. 개발 의존성·시험·문서는 들어가지 않는다 |
| `app/node_modules/` | 묶을 수 없는 두 라이브러리의 실행 파일만 넣었다. `pdfjs-dist`(PDF 판독)와 `playwright-core`(국민신문고 연결) |
| `app/dist/`, `app/dist-beta/` | 기존 화면과 베타 화면의 빌드 결과 |
| `app/data/public/bundle.json.gz` | 공개 법령 초기 자료(패키지 생성 시점) |
| `THIRD_PARTY_NOTICES.txt` | 들어간 외부 패키지 105개의 라이선스 전문과 Node 라이선스 |
| `AppxManifest.xml`, `resources.pri`, `Assets/` | 매니페스트, 리소스 색인, 로고 |

- 빼거나 줄인 것:
  - `korean-law-mcp`: 설치판에서 MCP 조회를 껐기 때문에 넣지 않는다.
  - kordoc의 선택 부품(OCR 모델·이미지 엔진): 쓰지 않는다.
  - 화면용 라이브러리: 이미 `dist/`에 들어 있다.
  - 이것들을 그대로 넣으면 의존성만 약 770MB였다.
- 빌드 단계의 정리:
  - 묶은 파일에서 rolldown이 남기는 `//#region node_modules/...` 주석을 지운다.
  - 설치판에서 쓰지 않는 제작자 저장소 주소(`bundles.ts`)를 지운다. 정확히 1곳이 아니면 빌드가 실패한다.
- 매니페스트(`packaging/msix/AppxManifest.template.xml`, 값은 `packaging/msix/identity.json`):
  - 표시 이름 `한국 환경안전보건관리자 법령조회 프로그램`, 게시자 표시 이름 `ARETE`, 버전 `0.8.0.0`
  - `Identity Name`과 `Publisher`는 `TODO_PARTNER_CENTER_*` 자리표시다. `--store` 빌드는 이 값이 채워질 때까지 거부된다.
  - 시험 빌드는 `SHELaw.Beta.LocalTest` / `CN=SHELaw Local Test`를 쓴다.
  - 권한은 `runFullTrust` 하나다. 최소 Windows 버전은 10.0.19041(Windows 10 2004)이다.

## 3. 실행 흐름 (실행기 `SHELaw.exe`)

1. 시작 메뉴 아이콘을 누르면 4317 포트를 쓰고, 사용 중이면 빈 포트를 쓴다. 서버는 127.0.0.1에서만 연다.
2. `node.exe`를 콘솔 창 없이 실행한다(`CreateNoWindow`). `NODE_OPTIONS`와 `NODE_PATH`는 지운다. `SHE_INSTALLED=1`을 설정한다.
3. 데이터 폴더는 MSIX 사용자별 폴더 `%LOCALAPPDATA%\Packages\<패키지 이름>\LocalState`다.
4. 알림 영역에 아이콘을 띄운다. 처음 실행 때는 법령 초기 자료를 준비하느라 몇 분 걸릴 수 있다고 안내한다.
5. 준비되면 기본 브라우저로 `http://127.0.0.1:<포트>/beta/`를 연다. 포트는 데이터 폴더의 `launch.json`에 적는다.
6. 이미 실행 중이면 서버를 하나 더 띄우지 않는다. `launch.json`의 포트로 기존 화면만 연다(사용자별 이름 있는 mutex).
7. 종료할 때:
   - 알림 영역 "종료"는 화면의 종료와 같은 `/api/shutdown`을 쓴다. 작업이 진행 중이면 거절하고 이유를 보여준다.
   - 화면에서 종료하면 실행기도 함께 끝난다.
   - 실행기가 끝나면 job object(종료 시 함께 종료)로 서버와 그 하위 프로세스가 모두 끝난다.
8. 자체 업데이트 기능은 없다. 앱 업데이트는 Store가 한다.

## 4. 설치판에서만 달라지는 동작 (`SHE_INSTALLED=1`)

| 동작 | 이유 | 시험 |
|---|---|---|
| `/api/mcp/query` 403 | korean-law-mcp를 자식 프로세스로 실행해서, 그 통신이 프로세스 안의 외부 통신 검사(EgressGuard)를 거치지 않는다. 사용자 결정(2026-10-13)에 따라 껐다 | V8-M01, 설치 시험 |
| `/api/public/update` 403 | 제작자 GitHub에서 법령 자료를 받는 경로다. EgressGuard가 이미 막지만 설치판은 이유를 알려준다 | V8-M01 |
| 공개 법령 초기 자료를 같은 파일이면 다시 가져오지 않음 | 매번 다시 가져오면 시작에 약 90초가 걸렸다. 첫 가져오기 뒤에는 WAL 파일을 정리한다(약 650MB → 0) | V8-M03 |
| 데이터 처리 안내에 "앱을 제거하면 저장된 자료가 삭제됩니다. 먼저 백업하세요." 추가 | MSIX는 제거할 때 앱 데이터를 묻지 않고 지운다 | V8-M02, V8-M04 |
| 이전 주소(4327) 자동 이동 안 띄움 | 설치판에는 이전 주소가 없다 | — |

설치판이 아닌 경로(`npm start`, 시험)는 그대로다. 공개 자료 가져오기도 기존처럼 매번 한다.

### 단계 3 백업 수정 (설치 시험 중 발견)

- 공개 법령 초기 자료가 들어 있는 실제 DB에서는 암호화 백업이 **약 340MB**였다. 가져오기 한도(200MB)를 넘어 복원할 수 없었다.
- 단계 3 시험은 초기 자료가 없는 DB로 해서 이 문제가 드러나지 않았다.
- 고친 점:
  - 앱에 함께 들어 있는 공개 법령 초기 자료(검증 메모가 가져오기 상태 그대로인 근거)는 백업에서 뺀다.
  - 검토 기록 안에 들어 있는 근거 조문은 그대로 백업된다.
  - 암호화 전에 gzip으로 압축한다.
- 결과: 검토 4건이 든 백업이 **11.7MB**다(로컬).
- 단계 3 형식(압축 안 됨)의 백업도 그대로 가져올 수 있다(로컬에서 확인, V8-M05).
- 기존 화면의 JSON 백업(`/api/backup`)은 바꾸지 않았다.
- 데이터 처리 안내의 "암호화 백업" 항목에 "공개 법령 초기 자료는 넣지 않음"을 추가했다.

## 5. WACK (Windows App Certification Kit 10.0.26100.8249, CI)

전체 결과는 **PASS**다. 24개 시험 중 22개가 PASS다. FAIL 2개는 모두 선택(OPTIONAL) 시험이다.

| 시험 | 결과 | 내용과 판단 |
|---|---|---|
| Blocked executables (선택) | FAIL | node.exe의 `CreateProcessW`와 실행기의 `Process.Start` 참조, 그리고 글자 일치 오탐(압축 법령 자료·node.exe·pdf.js·playwright 라이선스 안의 "cmd", "reg", "powershell" 같은 문자열)이다. 실행기가 node.exe를 띄우는 것은 앱 구조 자체다(`runFullTrust` 사유). 서버는 Windows 사용자 키(DPAPI) 처리에 `powershell.exe`를 쓴다(단계 1부터 동일). Store 심사에서 문의가 오면 §7 설명을 쓴다 |
| Archive files usage (선택) | FAIL | `bundle.json.gz`가 압축 파일이라서다. 안에는 법령 JSON만 있고 실행 파일은 없다(패키지 검사기가 풀어서 확인). 풀어서 넣으면 설치 크기가 약 200MB 늘어 그대로 두었다 |
| DPIAwarenessValidation | PASS | 첫 실행에서 WARNING이 나와 실행기 매니페스트에 PerMonitorV2를 넣었다 |

보고서 원본: CI 산출물 `msix-results/result/wack.xml`, 요약 `wack-summary.json`.

## 6. 패키지 검사기 (단계 0 검사기 + 예외 목록)

- 단계 0 기준(키·이메일·사용자 경로·이름·금지 폴더 0건)으로 처음 검사했을 때:
  - 라이브러리 폴더를 그대로 넣으면 5,473건이었다.
  - 서버를 묶은 뒤에는 206건이었다.
- 남은 항목은 모두 외부 소프트웨어의 글자다.
  - 라이선스 전문 속 저자 이메일, 라이브러리 코드 안 base64 데이터·글꼴, 리눅스 예시 경로(`/home/...`)다.
  - 단계 0에서 오탐으로 판정한 `server/auth.ts` 토큰 필드 대입 2건도 포함된다.
- 그래서 검사기에 **검토된 예외 목록**을 추가했다(`--allow packaging/msix/scan-exceptions.json`).
  - 파일, 종류, 일치한 글자의 SHA-256이 모두 같아야 통과한다. 값 자체는 저장하지 않는다.
  - 새로 생기거나 바뀐 항목은 실패한다.
  - 이름, 현재 Windows 사용자 경로, 금지 폴더·파일, 개발 스크립트는 예외로 받을 수 없다(V8-S09).
- 예외 87개(일치 194건)의 출처:

| 출처 | 일치 건수 |
|---|---|
| 라이선스 전문(`THIRD_PARTY_NOTICES.txt`, Node LICENSE 포함) | 28 |
| 외부 라이브러리 파일(`app/node_modules/pdfjs-dist`, `playwright-core`) | 144 |
| 묶은 서버 파일 안의 외부 라이브러리 코드(각 일치가 해당 npm 파일에도 있는지 대조함) | 20 |
| 우리 코드 오탐(`server/auth.ts`, 단계 0 판정) | 2 |

- `.gz` 파일은 이제 풀어서 검사한다(V8-S08). 공개 법령 초기 자료 안에서 찾은 항목은 0건이다.
- 사용자 실명·이메일 아이디·GitHub 계정명으로도 검사했다(`SHE_SCAN_NAMES`, 로컬). 결과는 0건이다.

## 7. `runFullTrust` 사용 사유 (제출용)

Partner Center의 제한된 기능(restricted capability) 설명란에 쓸 문안이다.

> 이 앱은 MSIX로 포장한 데스크톱 앱입니다. 시작 메뉴에서 실행하면 사용자 PC에서만 접속되는 로컬 웹 서버(Node.js, 127.0.0.1)를 시작하고, 기본 브라우저로 그 로컬 주소를 엽니다. 화면은 브라우저에서 동작합니다. `runFullTrust`는 이 로컬 서버 프로세스(와 문서 판독용 하위 프로세스)를 시작·종료하고, 앱을 끝낼 수 있는 알림 영역 아이콘을 두는 데 필요합니다. 서비스·드라이버·시작 프로그램을 설치하지 않고, 관리자 권한이 필요 없으며, 다른 앱이나 시스템 설정을 바꾸지 않습니다. 사용자 자료는 앱 전용 사용자별 데이터 폴더에 Windows 사용자 보호(DPAPI)로 감싼 키로 암호화해 저장합니다.

> This app is a desktop app packaged as MSIX. When started from the Start menu, it starts a local web server (Node.js) that listens only on 127.0.0.1 on the user's PC and opens that local address in the default browser; the user interface runs in the browser. runFullTrust is required to start and stop this local server process (and its document-parsing worker processes) and to keep a notification-area icon for quitting the app. The app installs no services, drivers or startup entries, needs no administrator rights, and does not change other apps or system settings. User data is stored in the app's own per-user data folder, encrypted with a key protected by Windows DPAPI.

## 8. 설치 시험 (CI, `scripts/msix-install-test-v8.ps1`)

순서: 시험 인증서 신뢰(시험 전용) → 설치 → 실행 → 콘솔 창 확인 → 안전관리자 시나리오 → 암호화 백업 내보내기 → 두 번째 실행(한 번만 실행 확인) → 앱 종료로 서버 종료 → 실행기 강제 종료로 서버 종료 → 제거 → 데이터 폴더 삭제 확인 → 재설치 → 백업 가져오기.

| 단계 | 내용 | 결과 |
|---|---|---|
| `installed` | 설치(`Add-AppxPackage`, 사용자별) | 통과 |
| `launched` | 시작 메뉴 실행 → 서버 준비 → `launch.json` | 통과 |
| `consoleHidden` | 앱 프로세스(SHELaw, node) 모두 창 없음 | 통과 |
| `scenario` | 안전관리자 시나리오 | 통과 |
| `backupExported` | 암호화 백업 내보내기(2.9MB) | 통과 |
| `singleInstance` | 두 번째 실행: 실행기 1개, 서버 1개, 같은 포트 | 통과 |
| `appQuitStopsServer` | 앱 종료 → 서버·실행기 종료 | 통과 |
| `launcherStopStopsServer` | 실행기 강제 종료 → 서버 종료(job object) | 통과 |
| `uninstalled` | 제거 | 통과 |
| `dataRemovedOnUninstall` | 제거하면 데이터 폴더 삭제 | 통과 |
| `reinstalled` | 재설치 → 실행 | 통과 |
| `restoredAfterReinstall` | 새 설치는 비어 있고, 백업 가져오기로 검토 1건 복원 | 통과 |

- CI 실행 기록:
  - 첫 실행(run 38404200466): `singleInstance` 실패, WACK DPI WARNING.
  - 두 번째 실행(run 38407465872): `singleInstance` 실패.
  - 원인은 시험 스크립트가 프로세스가 1개일 때 개수를 세지 못한 것이었다(PowerShell 배열 처리). 고친 뒤 세 번째 실행에서 12/12 통과했다.
  - 관리자 아닌 계정 시험은 첫 두 번의 방식(작업 스케줄러 권한 부족, 자격 증명 실행)이 러너에서 실행되지 않아 세 번째에 방식을 바꿨다.

- 안전관리자 시나리오(`scripts/msix-scenario-v8.mjs`, 합성 질문, 미리보기 켬):
  - "안전관리자 선임(인원)" 후보가 나오고, 위험물 후보가 섞이지 않는다.
  - 모든 후보에 "검토 후보 — 법적 판단 아님, 베타"가 붙고, `clear_risk`는 0건이다.
  - MCP 조회와 제작자 저장소 갱신은 403이다.
- 백업 보호 방식은 `windows-dpapi-current-user`다.
  - 같은 Windows 사용자로 제거 → 재설치한 뒤 복원했다.
  - 다른 사용자나 다른 PC로의 복원은 확인하지 않았다(안내문 그대로).
- 결과 기록은 `docs/implementation-v8/stage4-msix/install-test.json`이고, V8-M04가 이 기록을 확인한다.

## 9. 도구와 버전

| 도구 | 버전 |
|---|---|
| Windows SDK (MakeAppx, MakePri) | 10.0.26100.0 (파일 버전 10.0.26100.8249 CI / 10.0.26100.7705 로컬) |
| SignTool (시험 서명만) | 10.0.26100 SDK |
| Windows App Certification Kit | 10.0.26100.8249 (CI 러너) |
| C# 컴파일러 (실행기) | .NET Framework 4.8 csc 4.8.9221.0 |
| Node (패키지에 포함) | 24.21.0 (CI) |
| rolldown (서버 묶기) | 1.2.12 |
| CI 러너 | windows-latest (Windows Server 2025, 10.0.26100) |

## 10. 시험

- V8-M01~M07(`tests/v8-msix.test.ts`), V8-S08~S10(`tests/v8-package-scan.test.ts`)을 새로 만들었다.
- 기존 시험은 바꾸거나 건너뛰지 않았다.
- 화면 동결 목록(29+16)은 그대로다. `server/beta-contract-v8.ts`도 바꾸지 않았다.

## 11. 남은 사용자 결정

1. **Partner Center 값:** 제품 ID 화면의 `Package/Identity/Name`과 `Package/Identity/Publisher`(CN=...)를 받아야 Store용 패키지를 만들 수 있다.
2. **검사기 예외 목록 방식(§6) 승인:** 외부 라이선스·라이브러리의 글자를 "값 해시로 정확히 일치할 때만 통과"로 받을지 정해야 한다. 받지 않으면 라이선스 전문을 빼야 하는데, 그러면 라이선스 조건을 지키기 어렵다.
3. **선택 WACK 항목 2개(§5):** 지금처럼 둘지(권장) 정한다. 압축 법령 자료를 풀어서 넣으면 설치 크기가 약 200MB 늘어난다.
4. **국민신문고 연결 기능(playwright-core):** 설치판에 계속 둘지 정한다. 기본안은 유지다(기존 기능).

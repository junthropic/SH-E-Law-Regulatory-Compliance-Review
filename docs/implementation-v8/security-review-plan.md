# v8 Store 제출 전 최종 보안·사용성 검증 계획 (준비)

작성 2026-10-14. 상태는 **준비**이며, 아직 검증을 실행하지 않았다. 이 문서는 무엇을, 누구 입장에서, 어떤 방법으로 확인하고, 언제 통과로 볼지를 정한다.
검증 대상은 Store에 올릴 MSIX(`--store` 빌드)와 같은 코드로 만든 시험 서명 패키지다.

## 1. 지킬 것 (자산)

| 자산 | 위치 | 현재 보호 |
|---|---|---|
| 회사 자료(업로드 원본, 추출문, 사실, 검토 기록) | MSIX LocalState의 `private.sqlite`, `originals/` | Windows 사용자 키(DPAPI)로 감싼 키로 암호화(V8-E01~E05) |
| API 키(법제처 OC, 공공데이터포털, 도로명주소, AI) | 같은 폴더의 `*.dpapi` | DPAPI. 화면·응답·로그에 값 없음(V8-Y01, V8-L01) |
| 암호화 백업 파일 | 사용자가 고른 위치 | AES-256-GCM, 키는 DPAPI(V8-K01~K04) |
| AI 전송 내용 | AI 서비스 | 기본 꺼짐. 보낼 때마다 미리보기 승인(V8-A01~A03) |
| 앱 실행 파일 | `C:\Program Files\WindowsApps\…` | Store 서명, 사용자 쓰기 불가 |

## 2. 해커 입장 — 공격 경로와 확인 방법

`예상 위험`은 준비 중 코드를 읽고 붙인 등급이다. 검증 결과로 바뀔 수 있다.

| # | 공격자와 경로 | 지금 방어 | 확인 방법(예정) | 예상 위험 |
|---|---|---|---|---|
| H1 | **같은 PC의 다른 프로세스·다른 Windows 사용자**가 `127.0.0.1:<포트>`에 접속. loopback은 사용자 구분이 없고, `/api/bootstrap`은 누구에게나 세션을 준다 | **고침(2026-10-15).** 실행기가 시작할 때마다 32바이트 난수 실행 토큰을 만들어 환경 변수 `SHE_LAUNCH_TOKEN`으로 서버에 넘긴다(명령줄에 넣지 않음). 서버는 시작하자마자 이 값을 환경에서 지워 자식 프로세스가 물려받지 않는다. 브라우저는 `/beta/#launch=<토큰>`으로 열고(조각이라 요청·로그에 안 남음), 베타 화면이 읽자마자 주소에서 지운 뒤 bootstrap 머리글 `x-she-launch`로만 보낸다. 설치판 bootstrap은 이 토큰(상수 시간 비교) 또는 이미 받은 세션 쿠키가 있어야 세션을 주고, 아니면 403 "시작 메뉴에서 앱을 다시 열어 주세요.". 두 번째 실행·설치 시험은 사용자별 LocalState의 `launch.json`(이 사용자와 SYSTEM만 읽는 접근 목록)에서 토큰을 읽는다. 개발·시험(환경 변수 없음)은 그대로 | 자동 시험 V8-X01~X07. 실제 서버 프로세스+브라우저로 확인: 토큰 없는 브라우저·일반 프로세스 403, 실행기 주소로 연 브라우저 200, 같은 브라우저의 기존 화면 `/` 200. 설치 시험에 `launchTokenRequired` 단계 추가(CI 미실행). 두 번째 표준 사용자 계정 시험은 미실행(아래 stage4-msix 13절) | **해결(설치 시험 CI 재실행 필요)**. 남는 위험: 같은 Windows 사용자로 도는 프로그램과 관리자는 `launch.json`을 읽을 수 있다(설계상 범위 밖). 토큰 없는 경로: 실행기는 매번 토큰을 넣지만, 서버 혼자서는 `SHE_INSTALLED=1`이어도 토큰이 없으면 예전 bootstrap으로 연다(V8-X08이 현재 동작을 기록, 8.5절). 막을지는 사용자 결정 |
| H2 | 악성 웹사이트(사용자 브라우저 경유): CSRF, DNS rebinding, 교차 출처 읽기, 클릭재킹 | Host=127.0.0.1 검사, Origin·`Sec-Fetch-Site` 검사, CSRF 토큰, `SameSite=Strict` 쿠키, CSP(`frame-ancestors 'none'`, `script-src 'self'`) | 실제 브라우저로 다른 출처 페이지에서 form POST·fetch·iframe·rebinding 흉내(Host 위조) 자동 시험 | 낮음(확인 필요) |
| H3 | 악성 문서 업로드: 파서 취약점, zip bomb, XXE, 경로 조작 | 격리 파서(`--permission`, 256MB, 30초, 20MB), 압축 안전 검사(V5-A03) | 깨진·거대·중첩 PDF/HWPX/HWP/DOCX 묶음(fuzz) 투입. 서버 생존, 격리 프로세스 밖 파일 읽기 0, 시간·메모리 한도 확인 | 중간(확인 필요) |
| H4 | 공공 API 응답 변조·악성 응답(XML 폭탄, 거대 응답, 스크립트 삽입) | 크기 한도, XML 파서 설정, 화면은 React 이스케이프(원시 HTML 삽입 0건 확인) | 합성 악성 응답으로 수집 경로 시험. 화면·Markdown·CSV 출력에 스크립트·수식 실행 0 | 낮음~중간 |
| H5 | 내보내기 파일로 공격: CSV 수식 삽입, Markdown 링크 | CSV는 `= + - @` 시작 칸 앞에 `'`를 붙임(코드 확인) | 수식·링크가 든 합성 사실로 내보내기 → Excel에서 실행 안 됨 확인 | 낮음 |
| H6 | 조작된 백업 파일 가져오기 | GCM 인증, DPAPI 키, 형식 검사, 200MB 한도 | 비트 변조·다른 사용자 백업·거대 JSON·압축 폭탄(gzip 512MB 한도) 시험 | 낮음 |
| H7 | **환경 변수·PATH 하이재킹**: 실행기가 사용자 환경을 서버에 넘긴다. `NODE_TLS_REJECT_UNAUTHORIZED=0`, `NODE_EXTRA_CA_CERTS`를 넣으면 TLS 검증이 꺼지거나 가짜 인증서를 믿는다. `powershell.exe`(DPAPI 처리)를 PATH에서 찾으므로, 사용자 쓰기 가능 경로에 가짜를 두면 키가 샌다 | **고침(2026-10-16, 8절).** 고치기 전: 실행기가 사용자 환경 전체에서 `NODE_OPTIONS`·`NODE_PATH`만 지워 넘겼고, DPAPI용 `powershell.exe`는 이름만으로(작업 폴더·PATH 검색) 사용자 환경 거의 전부와 함께 실행했다. 지금: 실행기→서버, 서버→파서 작업 프로세스·PowerShell 모두 허용 목록으로 만든 환경만 넘긴다(부모 환경을 합치지 않음, 대소문자 무관). PowerShell은 Windows가 실제로 올린 System32(ntdll.dll 위치)에서 찾은 절대 경로로만 실행하고, 못 찾으면 실패한다(PATH로 대신 찾지 않음) | V8-H01~H10(단위·실제 프로세스·로컬 TLS·C# 실행기 컴파일 실행). 여러 Windows 사용자 실기기 시험은 미실행(승인 필요) | **고침(설치 시험 CI 재실행 필요)**. 남는 한계: 같은 Windows 사용자로 도는 악성 프로그램과 관리자는 범위 밖(DPAPI는 같은 사용자의 악성 프로그램을 막지 못함). 사내 프록시·사내 CA는 지원하지 않음(8.3절) |
| H8 | AI 경로 악용: 승인 우회, 문서 속 지시문으로 정보 빼내기 | 승인한 내용만 1회 전송, EgressGuard | 승인 없는 전송 시도, 문서 속 "다른 자료도 보내라" 문구 → 전송 내용이 미리보기와 같은지 바이트 비교 | 낮음 |
| H9 | 외부 통신 우회: 자식 프로세스·브라우저 자동화 | MCP 조회·국민신문고 수집 설치판에서 제거(V8-M01, V8-M08) | 시험 중 PC 수준 네트워크 기록(Windows 방화벽 로그 또는 `netstat`)으로 허용 목록 밖 연결 0 확인 | 낮음 |
| H10 | 공급망: npm 의존성·Node·pdf.js 취약점 | lock 고정, 번들 패키지 목록(`THIRD_PARTY_NOTICES.txt`, 105개) | `npm audit --omit=dev`, 번들 패키지 버전 대 알려진 취약점 대조, Node 24 보안 릴리스 확인, pdf.js `isEvalSupported` 설정 확인 | 확인 필요 |
| H11 | 포트 선점: 악성 프로세스가 4317을 먼저 열고 기다림 | 실행기가 빈 포트를 고름 | 4317 선점 상태에서 실행 → 앱이 다른 포트로 뜨고, 브라우저가 가짜 서버로 가지 않음 확인 | 낮음 |
| H12 | 메모리·충돌 덤프로 키·자료 유출 | 없음(Windows 기본 동작) | Windows 오류 보고 덤프 설정 확인, 덤프 안 평문 여부 검토 | 낮음(문서화) |
| H13 | 패키지 자체: 서명, 자체 업데이트, 숨은 파일 | Store 서명, 자체 업데이트 없음, 패키지 검사기(차단 0) | Store 업로드본 해시 대 CI 빌드 해시 대조, WACK 재실행 | 낮음 |

## 3. 이용자 입장 — 쓰다가 생길 문제

| # | 상황 | 확인 방법(예정) | 통과 기준 |
|---|---|---|---|
| U1 | 처음 실행이 1~2분 걸림(법령 초기 자료 준비) | 저사양 VM(2코어·4GB)에서 처음 실행 시간 측정 | 안내 풍선이 나오고, 10분 안에 화면이 열린다 |
| U2 | 앱 제거 = 자료 삭제 | 데이터 처리 안내·설치 안내 문구 확인, 백업 → 제거 → 재설치 → 복원 | 안내가 보이고, 같은 사용자로 복원된다(V8-M04) |
| U3 | 다른 PC·다른 사용자로 옮기기 | 다른 사용자로 복원 시도 | 이해할 수 있는 거절 문구(지금: "만든 Windows 사용자 계정에서만…") |
| U4 | Store 업데이트 뒤 자료 유지 | 0.8.0.0 설치 → 자료 생성 → 0.8.1.0으로 업데이트 | 자료·설정·키가 남는다 |
| U5 | 회사 PC에서 Store 차단, 프록시, 오프라인 | 프록시 환경 VM, 네트워크 끊은 상태 | 오프라인에서도 열리고, 수집 실패 문구가 명확하다 |
| U6 | 백신·SmartScreen 오탐(`node.exe`, `powershell.exe` 실행) | Microsoft Defender 기본 설정에서 설치·실행 | 차단 없음. 있으면 Store 제출 메모에 기록 |
| U7 | 포트 충돌, 두 번 실행, 브라우저 닫음 | 4317 선점, 아이콘 두 번 클릭, 브라우저 닫고 다시 열기 | 다른 포트로 시작, 서버 1개, 알림 영역 "화면 열기"로 복귀 |
| U8 | 고해상도·접근성 | 150~200% 배율, 키보드만으로 조작, 화면 낭독기(내레이터) | 글자 깨짐 없음, 주요 작업 키보드 가능 |
| U9 | 판정 결과 오해 | 모든 결과·내보내기에 "검토 후보 — 법적 판단 아님, 베타" 표시, 다른 법 섞임 없음(V8-P06) | 라벨 100%, 섞임 0 |
| U10 | 디스크 사용량 | 처음 실행 뒤 LocalState 크기 | 약 650MB(가져오기 뒤 WAL 정리). 안내문에 적는다 |
| U11 | 종료 | 알림 영역 종료, 화면 종료, PC 종료 | 서버 프로세스가 남지 않는다 |

## 4. 방법과 도구

1. **자동 시험(저장소 안):** 기존 시험 714개에 새 보안 시험을 더한다(H1·H2·H5·H6·H7·H8·H11은 `V8-X` 계열 예정). CI Linux와 Windows에서 돌린다.
2. **깨끗한 Windows에서 설치 시험:** `msix.yml`(설치 → 시나리오 → 제거 → 재설치 → 복원 → WACK)을 Store 업로드본과 같은 커밋으로 다시 돌린다. 표준 사용자 계정 시험을 포함한다.
3. **로컬 동적 점검(DAST):** 실행 중인 앱(127.0.0.1)에 OWASP ZAP baseline 또는 동급 도구를 돌린다.
   - Docker 같은 도구 설치·실행은 사용자 승인 뒤에만 한다.
   - 외부 서버로 스캔 결과를 보내는 서비스는 쓰지 않는다.
4. **문서 fuzz:** 공개 표본과 합성 변형 문서 수백 개를 격리 파서에 넣는다.
5. **의존성 점검:** `npm audit --omit=dev`와 번들 패키지·버전 목록을 대조하고, SBOM(CycloneDX)을 만든다.
6. **코드 보안 검토:** 서버 경로(인증, 외부 통신, 파일, 자식 프로세스)를 공격자 관점으로 다시 읽는다.
7. **수동 점검표:** 위 U1~U11을 사람이 직접 해 보고 화면 캡처를 남긴다.

## 5. 통과 기준 (제출 조건)

- 높음·치명 등급 미해결 0건. 중간 등급은 고치거나, 완화책과 사유를 문서에 남기고 사용자가 승인한다.
- H1은 **고친 뒤 제출**하는 것을 권장한다. 회사 PC는 여러 사람이 함께 쓰는 경우가 있기 때문이다.
- 설치 시험 12/12, WACK 필수 시험 전부 PASS, 패키지 검사기 차단 0.
- 데이터 처리 안내·Store 설명에 시험으로 증명하지 않은 주장이 0건이다.

## 6. 준비 중 이미 확인한 것

| 항목 | 결과 |
|---|---|
| 국민신문고 자동 수집(브라우저 자동화, EgressGuard 밖) | 설치판에서 제거, 허용 목록에서 삭제, 전송 0건 시험(V8-M08) |
| 법령 MCP 조회(자식 프로세스, EgressGuard 밖) | 설치판에서 제거(V8-M01) |
| 격리 파서가 설치판에서 동작하지 않던 문제 | 묶은 파일이 권한 밖이었고, 옛 HWP용 `cfb`가 빠져 있었다. 고친 뒤 공개 표본 PDF·HWPX를 판독했다(§stage4-msix 4절) |
| CSV 수식 삽입 | 코드에서 막고 있음을 확인(H5, 실행 시험 예정) |
| DPAPI 비밀값 전달 | 명령줄이 아니라 표준 입력으로 넘긴다. 다른 사용자가 프로세스 목록으로 볼 수 없음(코드 확인) |
| 화면의 원시 HTML 삽입(`dangerouslySetInnerHTML`) | `src/`, `beta/`에서 0건 |

## 7. 다음 단계 (사용자 결정)

1. 이 계획대로 검증을 시작할지 결정해 주세요. H1(2026-10-15)과 H7(2026-10-16)은 고쳤습니다. H1의 토큰 없는 경로는 사용자 승인(2026-10-17)으로 설치판에서 막았습니다(9.6절).
2. 동적 점검 도구(ZAP 등, Docker 필요)를 이 PC에서 써도 될지 정해 주세요.
3. (해결됨) GitHub Actions 결제 문제는 2026-10-14에 사용자가 해결했고, 이후 CI·설치 시험을 계속 돌렸다.
4. F-01(인코딩된 `/api` 접두어 인증 우회, 치명)과 F-04(설치판 평문 백업)는 사용자 승인(2026-10-16)으로 고쳤습니다(9.1·9.3절). 베타 안내의 "기존 화면(연결 설정)의 JSON 백업…" 문구(V8-K03)를 설치판에 맞게 바꿀지는 따로 정해 주세요.

## 8. H7 처리 기록 (환경 변수·PATH 하이재킹, 2026-10-16)

### 8.1 고치기 전 상태 (main 9c25953 코드 확인)

| 위치 | 물려준 것 |
|---|---|
| `packaging/msix/launcher/Launcher.cs:66-72` | 실행기를 띄운 사용자 환경 전체에서 `NODE_OPTIONS`·`NODE_PATH` 두 개만 지우고 node 서버에 넘겼다. `node_options` 같은 다른 표기는 .NET 사전이 대소문자를 가리지 않아 함께 지워졌지만, `NODE_TLS_REJECT_UNAUTHORIZED`·`NODE_EXTRA_CA_CERTS`·`NODE_USE_ENV_PROXY`·`HTTPS_PROXY`·`OPENSSL_CONF`·`SSL_CERT_FILE` 등은 그대로 넘어갔다 |
| `server/vault.ts:39-51` | DPAPI용 PowerShell을 `spawn("powershell.exe", …)`로 이름만 주어 실행했다. 이때 libuv가 작업 폴더를 먼저 찾고 그다음 PATH를 찾는다(V8-H04 대조 시험으로 실제 확인). 환경은 서버 환경 전체에서 `PSModulePath`만 뺐다 |
| `server/extraction-v5.ts:22` | 격리 파서는 `{SYSTEMROOT: 부모 값, PATH: ""}`만 넘겼다. 다만 libuv가 빠진 필수 변수(HOMEDRIVE, TEMP, USERPROFILE 등 11개)를 부모에서 채워 넣었다 |
| `server/extraction.ts:14-27` | 예전 파서는 `env`를 지정하지 않아 서버 환경 전체를 물려받았다(`NODE_OPTIONS` 포함) |
| `server/mcp.ts:20`, `server/petitions.ts:70` | 법령 MCP(node 자식)와 국민신문고(Edge) 실행 경로다. 둘 다 설치판에서는 실행 전에 403으로 막히고(`server/app.ts:615-623`), 패키지에도 들어가지 않는다. 개발 전용이라 이번에 바꾸지 않았다 |

### 8.2 고친 것

- **실행기→서버**(`Launcher.cs:69`, `SetServerEnvironment` `:232`)
  - 환경을 `Clear()`로 비운 뒤 다음 값만 넣는다. 사용자 환경에서 읽어 오는 값은 없다.
    - `SystemRoot`·`windir`·`PATH`: `Environment.SystemDirectory`(GetSystemDirectory API)로 정한다. PATH는 `System32;Windows`뿐이다.
    - `TEMP`·`TMP`: `Path.GetTempPath()`
    - `USERPROFILE`·`APPDATA`·`LOCALAPPDATA`: 알려진 폴더 API
    - 앱 값: `SHE_DATA_DIR`, `SHE_INSTALLED=1`, `PORT`, `NODE_ENV=production`, 그리고 node에만 `SHE_LAUNCH_TOKEN`
  - 시스템 폴더가 드라이브 경로가 아니거나 없으면 시작하지 않는다.
- **서버→파서 작업 프로세스**(`extraction-v5.ts:24`, `extraction.ts:28`, `nodeWorkerEnv`): libuv가 채워 넣는 11개 변수를 모두 직접 지정한다. 믿을 수 있는 `SYSTEMROOT`·`WINDIR`만 값을 갖고, 나머지(`PATH` 포함)는 빈 값이다.
- **서버→PowerShell**(`vault.ts:43-47`, `trustedPowerShell`·`powerShellEnv`)
  - 실행 파일: Windows가 이 프로세스에 올린 `ntdll.dll`의 폴더를 실제 System32로 본다. `process.report`의 모듈 목록에서 읽고, 환경 부분은 빼고 읽는다. 그 아래 `WindowsPowerShell\v1.0\powershell.exe`를 절대 경로로 실행한다.
  - SystemRoot·windir·PATH·작업 폴더는 보지 않는다. 찾지 못하면 `TrustedPathError`로 실패하며, 다른 곳에서 찾지 않는다.
  - 실행 방식: 실행 파일과 인자를 나눠 주고 셸은 쓰지 않는다. `-NoProfile -NonInteractive`이며 작업 폴더는 System32다. 비밀값은 지금처럼 표준 입력으로만 넘긴다.
  - 환경: 시스템 값, `PSModulePath=<System32>\WindowsPowerShell\v1.0\Modules`(사용자 문서 폴더의 모듈은 빠짐), 그리고 이 사용자의 `USERPROFILE`·`APPDATA`·`LOCALAPPDATA`·`TEMP`·`TMP`만 넘긴다. `USERPROFILE`이 없으면 PowerShell이 시작하지 못한다(로컬 확인).
- 이름은 대소문자를 가리지 않는다. 같은 이름이 표기만 달리해 다른 값으로 두 번 있으면 없는 것으로 본다.
- 환경 값은 어디에도 출력하지 않는다.
- 암호 설계(DPAPI, AES-GCM)는 바꾸지 않았다.

- **CI 시간 초과 수정(2026-10-16):** 첫 CI(run 38886604964)에서 Windows DPAPI 시험 3개가 15초 제한에 걸렸고, 설치 시험에서는 앱이 시작되지 못했다. 진단 실행(run 38905175053, GitHub Windows)에서 원인을 확인했다.
  - 환경 변수를 줄인 것은 원인이 아니었다. 입력만 읽는 PowerShell은 0.4초였다.
  - `ConvertTo-SecureString`이 `Microsoft.PowerShell.Security` 모듈을 자동으로 불러오는 데 12.7~25.1초가 걸렸다. 환경 변수를 넓혀도 13초 안팎이었다.
  - 그래서 금고는 같은 Windows DPAPI를 .NET `ProtectedData`(GAC의 System.Security)로 직접 호출하고, cmdlet을 하나도 쓰지 않는다. 첫 수정(커밋 eec5007)은 `Add-Type`·`New-Object`를 써서 다른 모듈 자동 로드가 남았고, CI에서 같은 시간 초과가 났다(run 38906633813). 그 뒤로 어셈블리 로드는 `[Reflection.Assembly]::Load`, 배열은 `[byte[]]::new`, 16진수는 `BitConverter`로 바꿨다.
  - 저장 형식은 그대로다: CurrentUser 범위, UTF-16LE, 추가 엔트로피 없음, 소문자 16진수. 예전 방식으로 감싼 값은 새 방식으로, 새 값은 예전 방식으로 열린다(V8-H11). 이 PC에서 네 방향 모두 원래 값으로 돌아왔고, 새 방식은 0.27초였다.

### 8.3 변수별 정책과 근거

근거:
- 배포 Node는 24.21.0이다(`msix-build.json`). 패키지 안 node.exe는 실행하지 않았다.
- Node 24 공식 문서(`nodejs.org/docs/latest-v24.x/api/cli.html` 환경 변수 절)를 읽었다.
- 이 PC의 Node 26.7.0에서 대조 시험을 했다. 실행 파일 검색 순서는 Node 24.11.1(libuv 1.51)에서도 확인했다.

| 변수 | 영향(Node 24) | 정책 |
|---|---|---|
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0`이면 TLS 인증서 검증을 끈다. 대조 시험에서 자체 서명 인증서를 받아들였다(V8-H08) | 차단 |
| `NODE_EXTRA_CA_CERTS` | 지정 파일의 CA를 추가로 믿는다(v7.3.0~). 대조 시험에서 받아들였다 | 차단 |
| `NODE_OPTIONS` | 명령줄 옵션을 주입한다(`--require` 코드 실행, `--use-openssl-ca` 등). 대조 시험에서 감시 파일이 실행됐다(V8-H07) | 차단 |
| `NODE_PATH` | 모듈 검색 경로 앞에 붙는다 | 차단 |
| `SSL_CERT_FILE`·`SSL_CERT_DIR` | `--use-openssl-ca`일 때(Windows·macOS 밖에서는 `--use-system-ca`일 때도) 신뢰 저장소를 바꾼다 | 차단. 켜는 옵션도 `NODE_OPTIONS` 차단으로 막힌다 |
| `OPENSSL_CONF` | 시작할 때 OpenSSL 설정을 읽는다. 설정 파일이 아니면 node가 시작하지 못한다(대조 시험) | 차단 |
| `NODE_USE_ENV_PROXY`, `HTTP_PROXY`·`HTTPS_PROXY`·`NO_PROXY` | 24.0.0부터 켜면 환경 변수의 프록시로 요청을 보낸다 | 모두 차단 |
| `NODE_USE_SYSTEM_CA` | 24.6.0부터 Windows 인증서 저장소의 CA를 더한다 | 차단 |
| `NODE_COMPILE_CACHE`, `NODE_V8_COVERAGE`, `NODE_REDIRECT_WARNINGS`, `NODE_DEBUG`, `NODE_ICU_DATA`, `NODE_PRESERVE_SYMLINKS`, `NODE_REPL_EXTERNAL_MODULE`, `UV_THREADPOOL_SIZE`, `TZ` | 파일 쓰기·로딩·동작을 바꾼다(TLS와는 무관) | 차단 |
| `SSLKEYLOGFILE` | Node 24 문서에 환경 변수로는 없다(`--tls-keylog` 옵션만 있음) | 목록에 없으므로 넘어가지 않는다 |
| `PSModulePath` | PowerShell이 모듈을 찾는 경로 | 시스템 모듈 폴더로 고정 |
| `PATH`, `SystemRoot`, `windir` | 실행 파일·DLL 검색, Windows 경로 | 사용자 값을 쓰지 않는다. 시스템 폴더만 쓴다(서버 PATH는 `System32;Windows`, 파서 PATH는 빈 값) |
| `LAW_OC`, `SHE_EPHEMERAL_AUTH` | 개발용 값(법제처 키 대체, 메모리 인증) | 설치판 서버에 넘기지 않는다. 키는 화면의 ‘API 키 설정’으로만 넣는다 |

**사내 프록시·사내 CA (지원 범위):**
- 설치판은 환경 변수 프록시와 추가 CA를 쓰지 않는다. Node는 Windows 시스템 프록시 설정도 쓰지 않는다.
- 그래서 다음 회사 망에서는 공공 API 수집과 AI 전송이 실패한다.
  - 프록시를 반드시 거쳐야 하는 망
  - 사내 CA로 TLS를 다시 서명하는 망
- 화면 열기, 저장된 자료 보기, 문서 판독, 백업은 PC 안에서만 동작하므로 영향이 없다.
- 프록시나 사내 CA가 필요하다면 앱 안에서 사용자가 명시적으로 켜는 설정으로 따로 설계해야 한다. 아직 만들지 않았고, 환경 변수로 몰래 켜지게 하지는 않는다.

### 8.4 시험

| 구분 | 내용 | 결과 |
|---|---|---|
| 코드 검토 | 서버의 자식 프로세스 생성 전부: `fork` 2곳, `spawn` 1곳, 개발 전용 MCP·Edge 각 1곳 | 8.1 표 |
| 단위 | V8-H01: 대소문자를 섞은 위험 변수 34개가 빠지고, 필요한 값만 남고, 토큰이 워커·PowerShell에 가지 않는다. V8-H02: 시스템 폴더 판정(UNC·`\\?\`·상대·다른 폴더 거부), PowerShell 경로가 없으면 예외. V8-H10: 실행기 소스 | 통과 |
| 통합(실제 프로세스, 이 PC) | 아래 6건 | 통과 |
| 여러 Windows 사용자 실기기 | 다른 표준 사용자 계정으로 같은 PC에서 시험 | **하지 않음.** 계정 생성·전환은 사용자 승인이 필요하다 |

통합 시험(실제 프로세스, 이 PC) 6건:
- V8-H03: SystemRoot·windir·PATH를 가짜로 바꿔도 실제 System32를 쓴다.
- V8-H04: 대조 시험. 이름만으로 실행하면 작업 폴더·PATH에 둔 가짜 `powershell.exe`가 실제로 실행된다.
- V8-H05: 가짜를 PATH 맨 앞, 작업 폴더, SystemRoot/windir 폴더에 각각 둔 채 실제 DPAPI 왕복을 해도 가짜는 한 번도 실행되지 않는다.
- V8-H06: 경로를 못 찾으면 실패하고 가짜도 실행되지 않는다.
- V8-H07: 실제 격리 파서 2종이 오염된 부모 환경에서도 정상 판독하고, `--require` 감시 파일은 생기지 않는다.
- V8-H08·H09: 로컬 TLS 시험(127.0.0.1, 자체 서명 인증서). 부모에 `NODE_TLS_REJECT_UNAUTHORIZED=0`·`NODE_EXTRA_CA_CERTS`가 있어도 자식 node는 인증서를 거부한다. H09는 `Launcher.cs`를 패키지 빌드와 같은 csc로 실제 컴파일해, 실행기 코드로 띄운 node를 확인한다.

### 8.5 H1 토큰 없는 경로 (2026-10-16 조사 기록 — 2026-10-17 고침, 9.6절)

아래는 고치기 전 조사 기록이다. 제안대로 `index.ts`에서 막았고, 결과는 9.6절에 있다.

- 실행기는 매번 토큰을 만들어 서버 시작 전에 넣는다(`Launcher.cs:58`, `:70`, `:78`). 그 사이에 이 단계를 건너뛰는 분기는 없다(V8-X08).
- 서버(`server/index.ts:15`, `server/app.ts:199`)는 토큰이 있을 때만 검사한다. 따라서 `SHE_INSTALLED=1`이고 `SHE_LAUNCH_TOKEN`이 없으면(실행기 결함 등) 예전처럼 누구에게나 세션을 주는 bootstrap으로 동작한다.
- 개발·시험 모드와 설치판은 토큰이 있는지로만 나뉘고, `SHE_INSTALLED`로는 나뉘지 않는다.
- 제안(사용자 결정 필요): 설치판에서 토큰이 없으면 서버가 시작하지 않게 한다. 예를 들어 `index.ts`에서 `isInstalled() && !launchToken`이면 오류를 내고 종료한다.
  - 바뀌는 범위: `server/index.ts` 1곳, V8-X08 수정
  - 설치 시험(`msix-install-test-v8.ps1`)은 실행기로 시작하므로 영향이 없다.
  - 수동으로 `SHE_INSTALLED=1`만 주고 띄우는 개발 절차가 있다면 그 절차도 토큰을 넣어야 한다.

### 8.6 보호 한계

- 같은 Windows 사용자로 도는 악성 프로그램과 관리자는 범위 밖이다. 이들은 다음을 할 수 있다.
  - 프로세스 메모리와 `launch.json`을 읽는다.
  - 같은 사용자 권한으로 DPAPI를 풀 수 있다. DPAPI는 같은 사용자의 악성 프로그램을 막지 못한다.
  - 실행 중인 프로세스를 조작한다.
- 이 사용자의 `USERPROFILE`·`APPDATA`·`LOCALAPPDATA`·`TEMP` 값은 PowerShell에 그대로 넘어간다. 이 값을 바꿀 수 있는 것은 같은 사용자뿐이다.
- 개발 실행(`npm start`)에는 실행기가 없으므로 서버 자체는 사용자 환경으로 돈다. 자식 프로세스에는 같은 허용 목록이 적용된다.
- 시스템 폴더 판정은 Node 진단 보고서(`process.report`)의 모듈 목록에 기댄다. 형식이 바뀌면 판정이 실패하고 보호 저장소가 열리지 않는다. 다른 경로로 대신 찾지는 않는다.
- kordoc 안에는 HWP 변환용 `powershell` 실행 코드가 있다. 우리 파서는 파일 경로 없이 바이트만 넘기므로 이 코드에 닿지 않는다. 격리 파서는 `--permission`으로 자식 프로세스 생성도 거부된다.

## 9. 적대적 검토 지적 F-01~F-06과 H1 토큰 없는 경로 (2026-10-16~17)

검토는 origin/main 9c25953을 대상으로 했다. 재현 스크립트는 `.local/security-review/poc/`에 있다(저장소 밖, git 무시). 9.1~9.3은 0.8.1.0, 9.4~9.6은 0.8.2.0에서 고쳤다. 9.7(F-02)은 코드를 바꾸지 않았다.

### 9.1 F-01 인코딩된 `/api` 접두어로 인증 우회 — **고침**

- **고치기 전:** `server/app.ts`의 전역 검사는 원래 요청 줄이 `/api/`로 시작하는지로 세션·CSRF 검사 여부를 정했다. 그런데 라우터는 경로를 퍼센트 디코딩한다.
  - 그래서 `/%61pi/...`는 세션·CSRF·실행 토큰 없이 모든 `/api` 처리기에 닿았다.
  - 재현(설치 모드 서버, 9c25953): `GET /%61pi/status` 200, `POST /%61pi/settings/law` 200, `POST /%61pi/ai/consent` 200, `GET /%61pi/backup` 200(평문 백업), `POST /%61pi/restore` 200, `POST /%61pi/shutdown` 200(서버 종료).
- **고친 것(`server/app.ts`):**
  - 보안 판단에 원래 요청 줄을 쓰지 않는다. `routedPath()`는 라우터가 고른 경로 패턴(`req.routeOptions.url`)을 쓰고, 맞는 경로가 없을 때만 디코딩한 경로를 쓴다. 디코딩할 수 없는 경로는 400으로 거절한다.
  - 전역 세션·CSRF·교차 사이트 검사, 사전 처리 잠금(종료 중·작업 중), 404 처리를 모두 이 경로로 판단한다.
  - `/api` 아래의 예외는 `/api/bootstrap` 하나다.
- **시험:**
  - V8-X09(`tests/v8-route-gate.test.ts`): `/%61pi/status`, `/%61%70%69/status`, 이중 인코딩 `/%2561pi/status`, `/api%2fstatus`·`%2F`, `//api/status`, `/./api/status`, `/API/status`·`/Api/status`·`/%41PI/status`를 세션 없이 보냈다. 모두 거절(400/401/403/404)되거나, API가 아닌 화면 파일(text/html)로만 응답했다. API 자료는 나오지 않았다. 세션 없는 `POST /%61pi/shutdown`·`settings/law`·`restore`·`ai/consent`·`auth/chatgpt/logout`도 모두 거절됐다. 세션이 있어도 CSRF 없는 인코딩 경로 POST는 403이다. 정상 bootstrap → 세션 → API 흐름은 그대로다.
  - 재현 스크립트를 고친 빌드로 다시 실행했다(설치 모드 실서버). `/%61pi/status`·`settings/law`·`beta/keys`·`ai/consent`·`restore`·`backup`·`retention`·`auth/chatgpt/logout`·`shutdown`이 모두 401이었고, 서버는 종료되지 않았다. 교차 사이트 표시가 있는 인코딩 경로는 403이다. 결과는 `.local/security-review/poc/h1-encoded-prefix-bypass.after.txt`, `routes-and-guards.after.txt`에 있다.
- **남는 한계:** 같은 Windows 사용자로 실행되는 악성 프로그램과 관리자는 이 방어의 범위 밖이다(6.4절, 8.6절).

### 9.2 F-03 업로드 경로의 파서가 격리되지 않음 — **고침**

- **고치기 전:** 실제 업로드 경로는 v5 격리 파서(`isolatedParse`)를 쓰지 않았다.
  - 업로드 경로: `POST /api/documents` → `documents.ts:29` → `extraction.ts:14-27` → `parse-worker.ts`. 법령 별표 수집 `sources.ts:451`도 같다.
  - 이 작업 프로세스는 `--permission` 없이 서버 환경 전체를 물려받았다. 재현에서 환경 변수 102개를 물려받았다.
  - 설치판 묶음에는 `isolatedParse`가 아예 들어가지 않는다(로컬 빌드로 확인). 그래서 설치판의 모든 문서 판독이 이 비격리 경로였다.
- **고친 것:**
  - `extraction-v5.ts`의 격리 설정을 `isolatedWorkerOptions`로 떼어 냈다. 내용은 Node 권한 모델(작업 파일·`vendor/`·`node_modules`만 읽기, 쓰기·네트워크·자식 프로세스·애드온 거부), 256MB, H7 허용 목록 환경이다.
  - `extractDocument`(`extraction.ts`)도 이 설정으로 `parse-worker`를 띄운다.
  - 판독 로직(`parse-worker.ts`)과 오류 문구는 바꾸지 않았다. v5 작업 프로세스로 바꾸지 않은 이유가 있다. v5는 HWPX가 아닌 zip(DOCX)을 거부하고, 150만 자 초과 시 잘라 내지 않고 실패하는 등 결과가 달라지기 때문이다.
- **결과 동일성(로컬):** 예전 방식과 새 방식으로 같은 입력을 판독해 결과를 바이트 단위로 비교했다. 8건 모두 같았다.
  - 판독 성공: 공개 PDF 2개(8,049자·264,153자), 공개 HWPX(26,213자), 합성 DOCX
  - 실패 처리: 깨진 zip, 임의 바이트, 가짜 HWP 머리, 25MB 넘는 zip 항목
  - 실제 HWP 원본은 저장소에 없어 비교하지 못했다.
- **패키지 배치:** 로컬에서 시험용 MSIX 단계 폴더를 만들어(`build-msix-v8.mjs --test-identity`, 서명 없음) 확인했다. 단계 폴더의 node로 `extractDocument`를 실행하자 PDF·HWPX·DOCX가 같은 글자 수로 판독됐고, 깨진 입력은 같은 오류 문구를 냈다.
- **시험:**
  - V8-W01: 실제 `POST /api/documents`가 `--permission`과 허용 목록 환경으로 판독하고, 결과는 26,213자로 같다.
  - V8-W02: 같은 격리 옵션의 프로세스에서 허용 밖 파일 읽기·쓰기·자식 프로세스가 `ERR_ACCESS_DENIED`이고, 부모의 감시 변수와 `NODE_OPTIONS`가 보이지 않는다.
  - V8-H07: 두 파서 모두 오염된 부모 환경에서도 정상 판독한다.
  - 재현 스크립트 `upload-worker-isolation`을 다시 돌렸다. 업로드 경로 작업 프로세스는 고치기 전 "환경 전체 상속, 권한 옵션 없음"이었고, 지금은 `--permission`과 읽기 허용 3개, 환경 변수 11개다.
- **남는 한계:** Node 권한 모델은 Node 문서상 악성 코드에 대한 보안 경계가 아니다. 파서 취약점으로 작업 프로세스 안에서 코드가 실행되면 허용된 읽기 범위(앱 파일)와 IPC 응답은 쓸 수 있다.

### 9.3 F-04 설치판에서 평문 JSON 백업·복원이 열려 있음 — **고침**

- **고치기 전:** `GET /api/backup`, `POST /api/restore`는 설치판(`SHE_INSTALLED=1`)에서도 열려 있었다. 세션만 있으면 모든 자료를 평문 JSON으로 내려받거나 덮어쓸 수 있었다.
- **고친 것:** 설치판에서만 두 경로가 403과 `LEGACY_BACKUP_OFF_MESSAGE`("설치판에서는 지원하지 않습니다. 데이터·백업 화면의 암호화 백업을 쓰세요.", `server/installed-v8.ts`)를 낸다. 개발 모드와 암호화 백업(`/api/beta/backup`, `/api/beta/restore`)은 그대로다.
- **시험:** V8-X10(설치판에서 두 경로 403·문구, 암호화 백업 경로는 그대로). 개발 모드의 기존 백업 시험(V8-K03 등)은 그대로 통과한다.
- **기존 화면에 생기는 일(화면 파일은 바꾸지 않음):**
  - 기존 화면(연결 설정)의 "백업 다운로드"는 일반 링크(`<a href="/api/backup">`)다. 그래서 설치판에서는 브라우저 탭에 403 응답 본문(JSON 한 줄)이 그대로 보인다.
  - "백업 복원"은 확인 창 뒤에 요청을 보내고, 기존 오류 처리로 서버 문구를 보여 준다.
- **문구 확인 필요:** 베타 화면의 데이터 처리 안내에는 "기존 화면(연결 설정)의 JSON 백업…" 항목이 있다(V8-K03). 설치판에서는 이 기능이 막혔으므로 문구가 맞지 않을 수 있다. 문구를 바꿀지는 사용자 결정이며, 지금은 바꾸지 않았다.

### 9.4 F-06 설치판에서 ChatGPT 로그인·토큰 갱신·원격 폐기가 막힘 — **고침**

- **고치기 전:** OAuth 코드 교환·갱신(`auth.ts:257`)과 원격 폐기(`auth.ts:364`)는 본문을 `URLSearchParams`로 보낸다.
  - 외부 통신 검사(`egress-guard-v8.ts` `wrapFetch`)는 문자열이 아닌 본문을 모두 `"\0binary"`로 바꿔 AI 동의 모듈에 넘겼다.
  - AI 동의(`ai-consent-v8.ts:112`)는 `\0`으로 시작하는 본문을 거부한다. 그래서 동의를 켜도 설치판에서 로그인이 실패했다(안전한 쪽으로 실패). 연결 해제의 원격 폐기도 늘 실패했다(`remoteRevoked false`).
  - 재현(`oauth-flow-probe`, 설치판 배선): `callback correct state FAILED: EgressBlocked ... auth.openai.com`, `logout remoteRevoked false`, 전송 기록 `POST auth.openai.com blocked`.
- **고친 것(`server/egress-guard-v8.ts:44` `bodyText`):**
  - 검사가 `URLSearchParams` 본문을 `toString()` 글자로 읽는다. undici가 실제로 보내는 바이트(`application/x-www-form-urlencoded`)와 같은 글자다.
  - 스트림·Blob·바이트 본문은 지금처럼 `"\0binary"`이고 AI 주소로는 막힌다.
  - `auth.ts`는 바꾸지 않았다. 검사 쪽에서 고치면 OAuth 코드와 기존 인증 시험이 그대로이고, 같은 형식의 다른 본문도 실제 글자로 판단된다.
- **바뀌지 않은 규칙:**
  - auth.openai.com은 지금처럼 AI 전송 동의가 켜져 있어야 한다(`ai-consent-v8.ts:110-113`). 이 줄은 바꾸지 않았다.
  - api.openai.com으로 가는 본문은 형식과 관계없이, 승인한 미리보기와 글자가 같을 때 1회만 나간다. 양식 본문도 같은 규칙이다(V8-G06).
  - 허용 목록에 새 주소를 넣지 않았다.
- **시험(`tests/v8-egress-oauth.test.ts`):** OpenAI는 로컬 스텁(로컬 RSA 키, `FAKE-*` 토큰)이다. 전역 fetch를 스텁으로 바꾸고 그 위에 `index.ts`와 같은 배선(EgressGuard + 앱의 AiConsent)을 설치했다. 실제 네트워크는 쓰지 않는다.
  - V8-G01: 실제 라우트(`/api/auth/chatgpt/start` → `/auth/callback`)로 코드 교환, 금고에 토큰 저장(시험은 메모리 금고)
  - V8-G02: 만료 토큰으로 `/api/auth/chatgpt/models`를 부르면 refresh_token 교환 후 새 토큰 저장
  - V8-G03: 연결 해제가 폐기를 호출하고 `remoteRevoked: true`
  - V8-G04: 접근·갱신·ID 토큰과 인증 코드가 API 응답, 콘솔·표준 출력, 감사 기록, AI 전송 기록, 검사 기록, 평문·베타 백업 내용, 내보내기(MD·CSV), 데이터 폴더 파일에 없다
  - V8-G05: 동의가 꺼져 있으면 교환·갱신·원격 폐기가 연결 전에 막히고(스텁 호출 0건), 로컬 연결 해제는 된다
  - V8-G06: 양식 본문도 미리보기 승인 1회 규칙을 따르고, 바이트·Blob·스트림 본문은 계속 막힌다
  - V8-G07(Windows만): 실제 DPAPI 금고 파일(소문자 16진수 DPAPI 값)에 저장되고, 파일에 토큰 글자가 없다
  - 고치기 전 검사 코드로 같은 시험을 돌리면 G05를 뺀 F-06 시험이 모두 실패했다(로컬 대조).
- **재현 스크립트 전후(`.local/security-review/poc/oauth-flow-probe.out.txt` → `.after2.txt`, 설치판 배선):**

  | 항목 | 고치기 전 | 고친 뒤 |
  |---|---|---|
  | callback correct state | FAILED: EgressBlocked auth.openai.com | connected, code_verifier 일치 true |
  | logout remoteRevoked | false | true |
  | AI 전송 기록 | `POST auth.openai.com blocked` | `POST … sent`, `GET … sent` ×3, `POST … sent` |
  | status()에 토큰 글자 | false | false |

- **남는 한계:**
  - AI 전송 기록은 로그인·갱신·폐기 요청도 크기와 SHA-256만 남긴다. 본문에는 일회용 코드나 갱신 토큰이 들어 있지만 기록에 원문은 없다.
  - 로그아웃 뒤 이메일 등 등록 정보가 남는 문제(F-07)는 이번 범위가 아니다. 고친 뒤 설치판 배선에서도 같은 결과가 보인다.
  - 실제 OpenAI 서버와 실제 계정으로는 시험하지 않았다.

### 9.5 F-05 외부 통신 검사의 빈틈 — **고침**

- **고치기 전(`egress-guard-v8.ts:51-61`, `:69`):**
  - `http.request(url, { hostname })`에서 검사는 url만 보았다. Node는 options의 hostname으로 접속했다. 재현: `http.request('http://127.0.0.1', {hostname:'127.0.0.2'})` → `connected to 127.0.0.2`.
  - fetch가 리다이렉트를 따라갈 때 새 주소를 다시 검사하지 않았다. 재현에서 302 → `evil.example`은 앱 검사가 아니라 재현용 차단 장치가 막았다. 공공 API는 이미 `redirect:"error"`였고, AI 호출과 모델 목록은 기본값(follow)이었다.
  - `net`·`tls`·`http2` 직접 연결과, 검사 설치 전에 잡아 둔 fetch는 검사 밖이었다.
- **고친 것(`server/egress-guard-v8.ts`):**
  - **실제 접속 대상(`:71` `effectiveRequestTarget`, `:139`):** `http(s).request`·`get`은 Node와 같은 순서로 url 인자와 options를 합친다(options 우선, `hostname || host || "localhost"`). 그 결과의 프로토콜·호스트를 검사한다. `setHost`·`headers.host`는 접속 대상이 아니라 Host 머리글이라 보지 않는다. `socketPath`는 로컬 파이프로 본다. 호스트를 URL로 만들 수 없으면 막는다.
  - **리다이렉트(`:102-137`):** `redirect`가 follow(기본값)이면 검사가 `redirect:"manual"`로 보내고, 3xx의 Location을 한 단계씩 첫 요청과 같은 검사(허용 목록, https, AI는 동의와 그 단계의 본문)로 확인한 뒤 따라간다.
    - 한도는 fetch 표준과 같은 20번이다. http/https가 아닌 주소로는 가지 않는다.
    - 메서드 처리도 fetch 표준과 같다. 303과 POST의 301/302는 GET으로 바꾸고 본문과 본문 머리글을 뺀다. 307/308은 같은 본문을 다시 보낸다. 다시 보낼 수 없는 본문이면 오류로 끝낸다.
    - 다른 출처로 가면 `authorization`·`proxy-authorization`·`cookie`를 넘기지 않는다.
    - `redirect:"error"`(공공 API, OAuth)와 `"manual"`(jose 등)은 그대로 원래 fetch에 넘긴다.
    - 승인한 AI 본문이 307로 다른 곳에 다시 가려면 새 승인이 필요하다(승인 1회 = 전송 1회).
  - **원시 소켓(`:162` `wrapSocketConnect`):** `net.Socket.prototype.connect`를 감싼다. undici(fetch)·http·https·http2·net·tls 연결이 모두 여기를 지난다. 호스트가 루프백이나 허용 목록(공공·AI) 이름이 아니면 연결 전에 `EgressBlocked`로 끝낸다.
    - 경로(파이프) 연결과 루프백은 그대로다. 앱 서버의 listen, DPAPI 도우미·파서 작업 프로세스의 표준 입출력·IPC는 connect를 쓰지 않거나 파이프라 영향이 없다.
    - 이 단계에는 본문이 없으므로 AI 주소의 동의·승인 검사는 하지 않는다. 그 검사는 fetch 단계에 있고, `http(s).request`로 AI 주소에 가는 것은 지금처럼 막힌다.
- **유지한 동작:** 공공 API `redirect:"error"`, 동의·승인을 거친 AI 전송, 루프백(V8-O05, 전체 시험·e2e).
- **시험(`tests/v8-egress-oauth.test.ts`, 실제 소켓, "외부"는 127.0.0.2와 DNS 전에 막히는 이름):**
  - V8-O03: url과 options를 합친 실제 대상 검사(`hostname` 덮어쓰기, `host`만, `setHost:false`, 공공 주소의 http, URL 객체+options). 127.0.0.2 서버 도달 0건. Node 우선순위대로 루프백은 그대로 닿는다.
  - V8-O04: 실제 undici로 리다이렉트를 따라갈 때 127.0.0.2·`evil.example`·2단계 뒤 127.0.0.2가 모두 막히고, 자기 자신으로 도는 리다이렉트는 20번에서 끝난다. 루프백 302·307(같은 본문)은 동작한다. 다른 출처로는 Authorization이 가지 않는다. `redirect:"error"`·`"manual"`은 전과 같다.
  - V8-O05(스텁 네트워크): 공공 주소가 307로 AI 주소에 보내면 AI 동의 검사로 막힌다. 승인한 AI 전송은 1회 나가고, AI 주소의 307 재전송은 막힌다. 공공 API `redirect:"error"`는 그대로 전달된다. 공공 주소의 http로 가는 리다이렉트는 막힌다.
  - V8-O06: `net.connect`(포트·옵션·`new Socket().connect`), `tls.connect`, `http2.connect`, 검사 설치 전에 잡아 둔 fetch가 127.0.0.2·`evil.example`에 연결되지 않는다(127.0.0.2 서버의 연결 수락 0). 루프백 TCP와 로컬 파이프는 연결된다. 해제하면 원래 connect로 돌아온다.
  - 고치기 전 검사 코드로 돌리면 O03~O06이 모두 실패했다(로컬 대조).
- **재현 스크립트 전후(`egress-guard-probe.out.txt` → `.after2.txt`):**

  | 항목 | 고치기 전 | 고친 뒤 |
  |---|---|---|
  | `http.request('http://127.0.0.1', {hostname:'127.0.0.2'})` | connected to 127.0.0.2 | guard threw EgressBlocked |
  | fetch 루프백 → 302 evil.example | 재현용 차단 장치가 막음(앱 검사는 보지 않음) | EgressBlocked, 앱 검사가 다시 확인 |
  | auth.openai.com, URLSearchParams 본문 | blocked | ALLOWED(동의 켜짐, F-06) |
  | api.openai.com 미승인 POST / 승인 1회 / 2회째 | blocked / ALLOWED / blocked | 같음 |
  | 호스트 분류 10건 | — | 같음 |

- **남는 한계:**
  - DNS 조회 자체(`dns.lookup`)와 UDP(`dgram`)는 검사하지 않는다. 허용 목록 밖 이름을 조회하는 것만으로 이름이 DNS 서버에 보일 수 있다. 앱 코드에는 그런 호출이 없다.
  - 허용된 이름을 다른 주소로 풀어 주는 사용자 지정 `lookup`·`createConnection`·`agent`, 그리고 이미 열린 소켓을 넘기는 `tls.connect({socket})`은 이름만 보는 이 검사로 잡지 못한다. 이것은 프로세스 안의 코드가 해야 하는 일이고, 그런 코드는 검사 자체를 풀 수도 있다. 검사는 실수나 라이브러리의 송신을 막는 장치이며 악성 코드에 대한 경계가 아니다.
  - 소켓 단계는 허용 목록 이름(공공·AI)으로의 연결을 막지 않는다. AI 본문 규칙은 fetch 단계에만 있다.
  - 자식 프로세스는 이 검사 밖이다. 설치판의 자식은 DPAPI 도우미(PowerShell)와 `--permission`으로 띄운 파서 작업 프로세스뿐이고, 법령 MCP·국민신문고는 설치판에서 꺼져 있다(6절, 9.2절).
  - `::ffff:127.0.0.1` 같은 다른 루프백 표기는 루프백으로 보지 않고 막는다(앱은 쓰지 않음).

### 9.6 H1 토큰 없는 경로 — 설치판은 토큰 없이 시작하지 않음 — **고침**

- **고치기 전:** 8.5절. `SHE_INSTALLED=1`인데 `SHE_LAUNCH_TOKEN`이 없으면(실행기 결함, 수동 실행) 서버가 누구에게나 세션을 주는 예전 bootstrap으로 동작했다. V8-X08이 이 동작을 기록했다.
- **고친 것:**
  - `server/index.ts:18-21`: 토큰을 꺼낸 바로 다음에 `isInstalled() && !launchToken`이면 `LAUNCH_MISSING`(`server/launch-token-v8.ts:11`)을 표준 오류에 한 줄 쓰고 종료 코드 1로 끝난다.
  - 이 검사는 외부 통신 검사 설치, 데이터 폴더 생성, 저장소 키, 앱 생성, listen보다 앞이다. 그래서 포트를 열지 않고 데이터 폴더도 만들지 않는다.
  - 문구에는 환경 값·경로·토큰이 없다. 빈 문자열 토큰도 없는 것으로 본다.
  - 개발·시험 모드(`SHE_INSTALLED` 없음)와 `createApp`은 그대로다.
- **실행기 확인:** `Launcher.cs` `Run()`은 `NewToken()`(32바이트 난수, base64url 43자)을 만들고, node를 띄우기 전에 `SHE_LAUNCH_TOKEN`에 넣는다. 그 사이에 분기·반환이 없다(V8-X08 소스 검사).
- **설치 시험 확인(스크립트 읽음):** `msix-install-test-v8.ps1`은 앱을 `shell:AppsFolder\…!App`으로만 시작한다. `msix-scenario-v8.mjs`는 떠 있는 서버에 `launch.json`의 토큰으로 접속하기만 한다. 둘 다 node 서버를 토큰 없이 직접 띄우지 않는다. 설치 시험·WACK는 0.8.2.0 코드로 아직 돌리지 않았다.
- **시험(`tests/v8-launch-token.test.ts`):**
  - V8-X08(바꿈): 기존 실행기 검사에 더해 32바이트 토큰 생성을 확인한다. `index.ts`에서 검사가 토큰 꺼내기 바로 뒤, 다른 시작 단계보다 앞에 있는지 본다. 개발 모드 bootstrap 200은 그대로다.
  - V8-X11(추가, 실제 프로세스): `node build/server/index.js`를 `SHE_INSTALLED=1`로, 토큰 없이 그리고 빈 토큰으로 띄운다. 종료 코드 1, 표준 오류는 `LAUNCH_MISSING` 한 줄, 준비 문구 없음, 포트 연결 거부, 데이터 폴더 없음.
  - V8-X12(추가, 실제 프로세스): 토큰을 주면 설치판이 시작한다(토큰 없는 bootstrap 403, 토큰 머리글 200). `SHE_INSTALLED` 없는 개발 실행은 토큰 없이 시작한다(200). 출력에 토큰이 없다. 이 PC의 `listen EFAULT`는 다른 포트로 다시 시도한다(최대 3번).
- **재현 스크립트:** `h1-encoded-prefix-bypass`(토큰을 준 설치 모드 실서버)를 다시 돌렸다. `.after.txt`와 같은 결과다. 토큰 없는 bootstrap 403, 인코딩 경로 401, 인증 없는 shutdown 뒤에도 서버 유지(`.after2.txt`). `routes-and-guards.after2.txt`도 무작위 값(세션·CSRF·시각) 말고는 `.after.txt`와 같다.
- **남는 한계:** 수동으로 `SHE_INSTALLED=1`만 주고 서버를 띄우던 개발 절차는 이제 시작하지 않는다(필요하면 토큰을 넣는다). 같은 Windows 사용자의 악성 프로그램은 여전히 범위 밖이다(8.6절).

### 9.7 F-02 다른 로컬 프로그램이 브라우저 쿠키를 받으면 세션을 쓸 수 있음 — **남은 위험(이번 버전 고치지 않음)**

- **사용자 결정(2026-10-17): 이번 버전은 남은 위험으로 문서화, 다음 버전에서 수정.**
- **상태:** PLAUSIBLE(재현하지 않음). 코드 근거와 브라우저 표준 동작 근거만 있다. 실제 브라우저가 다른 포트로 쿠키를 보내는 것을 실측하지 않았다(검토 보고서 6절).
- **시나리오:**
  - 쿠키는 포트별로 나뉘지 않는다. 또 `127.0.0.1`의 다른 포트도 같은 사이트로 취급되므로 `SameSite=Strict`가 막지 못한다.
  - 같은 PC의 다른 로컬 프로그램(다른 Windows 사용자의 프로그램 포함)이 `127.0.0.1`의 다른 포트에서 듣고 있다고 하자. 사용자의 브라우저가 그 포트로 요청하면 `she_session` 쿠키가 함께 갈 수 있다.
  - 그 프로그램은 받은 쿠키만으로 `/api/bootstrap`에서 CSRF 값을 다시 받을 수 있다(`server/app.ts`의 bootstrap, 실행 토큰은 쿠키가 없을 때만 요구). 그 뒤 앱 API 전체를 쓸 수 있다.
  - 근거: `routes-and-guards.after2.txt`의 "stolen cookie only, no launch header → 200, 같은 CSRF".
- **성립 조건:**
  - 다른 로컬 프로그램이 `127.0.0.1`의 다른 포트에서 듣고 있다.
  - 사용자의 브라우저가 그 포트로 요청을 보내고, 그 요청에 이 앱의 쿠키가 실린다.
  - 이 앱이 실행 중이고 세션이 살아 있다.
  - 같은 Windows 사용자의 악성 프로그램은 이 조건 없이도 `launch.json`과 메모리를 읽을 수 있으므로 원래 범위 밖이다(8.6절).
- **지금 고치지 않는 이유:**
  - 제대로 고치려면 화면이 서버에 인증하는 방식을 바꿔야 한다. 예를 들어 세션을 쿠키가 아니라 탭 메모리의 값으로 보내야 한다.
  - 그러면 화면 코드가 바뀐다. 동결된 기존 화면(`src/`)도 포함된다.
  - 사용자는 기존 UI·UX 변경을 금지했다("기존의 UI, UX는 절대로 고치면 안돼").
- **이번 버전에서 줄어든 범위(완화일 뿐 해결은 아님):** F-01은 고쳤다. 실행 토큰(H1)이 없으면 쿠키 없는 첫 세션은 생기지 않는다. 설치판 평문 백업은 꺼져 있다(F-04).
- **다음 버전 계획:** 보고서 권고안(세션 비밀을 탭 메모리 bearer로, 또는 설치판에서 쿠키만으로 CSRF를 다시 주지 않기, 실행 토큰 1회 사용화)을 화면 변경을 포함해 설계한다. 화면 변경은 사용자 승인을 받아 진행한다.

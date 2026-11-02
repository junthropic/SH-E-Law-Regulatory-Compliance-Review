# packaging/msix/ — Microsoft Store 패키지

## 맡은 일
MSIX 패키지의 재료: 앱 정보 `AppxManifest.template.xml`, 이름·게시자·버전 `identity.json`, 아이콘 `Assets/`(`make-assets.ps1`), C# 런처 `launcher/`(서버를 숨김 창으로 띄우고 실행 키와 데이터 폴더를 넘긴 뒤, 열 때마다 새 1회용 값으로 브라우저를 연다), 패키지 스캔 예외 `scan-exceptions.json`.

## 맡지 않는 일
- 서버·화면 로직. 런처는 서버를 시작하고 브라우저를 열 뿐이다.
- 패키지 빌드 절차 자체(`scripts/build-msix-v8.mjs`)와 Store 제출. 제출은 사용자가 직접 한다.

## 반드시 지키는 것
- 버전은 네 자리이고 마지막 자리는 0이다. 같은 버전은 다시 올릴 수 없으므로 올릴 때마다 버전을 높인다.
- `identity.json`의 게시자 정보와 계정 이름은 이 파일에만 둔다. 다른 파일·로그·화면·문서에 옮기지 않는다.
- 런처는 시작할 때마다 새 난수 실행 키를 만들어 서버에 환경변수 `SHE_LAUNCH_TOKEN`으로만 넘긴다. 브라우저에는 열 때마다 실행 키로 서명한 새 1회용 값을 `#launch=` 조각으로 넘긴다(형식은 `docs/contracts.md`). 실행 키와 1회용 값을 파일·로그에 쓰지 않으며 `launch.json`에는 포트·프로세스 번호·통로 이름만 적는다. 서버에 넘기는 환경변수는 허용 목록 값뿐이다.
- 두 번째 실행은 로컬 통로로 "화면 열어 줘"(`open`) 신호만 보낸다. 통로로 값을 돌려주는 방식으로 바꾸지 않는다(결정 0011). 값을 주는 `mint` 요청은 `#if SHE_TEST_PIPE` 안에만 있고, `build-msix-v8.mjs`는 `--test-identity`일 때만 그 기호를 넘긴다. Store 실행 파일에는 그 코드가 없어야 한다(V8-Q03·Q08).
- 통로 접근 목록은 현재 사용자 읽기·쓰기 허용과 네트워크 거부뿐이다. 통로 이름에는 Windows 로그인 세션 번호가 들어간다.
- 데이터 폴더는 패키지 전용 앱 데이터 폴더다. 앱을 제거하면 지워진다. 이 사실을 안내하는 고지문을 지우지 않는다.
- 런처는 보이는 콘솔 창을 열지 않는다(`windowsHide`).
- 패키지에 넣는 `node.exe`는 해당 Node 버전의 공식 `SHASUMS256.txt`와 일치해야 한다.
- `scan-exceptions.json`에 항목을 더할 때는 사용자 승인과 이유 기록이 필요하다. 이름이나 값을 직접 적지 않는다.

## 시험
- `v8-msix`, `v8-package-scan`, `v8-launch-token`, `v8-launch-pipe`, `v8-env-allowlist` 시험이 지킨다. `v8-launch-pipe`는 in-box csc로 `Launcher.cs`를 시험용·Store용 두 벌 컴파일하며, csc가 없거나 Windows가 아니면 건너뛴다.
- 설치·실행·백업·제거·재설치·복원은 `msix.yml`(수동 또는 `msix-test/*` 브랜치)로 확인한다. PR·main CI에는 없다.

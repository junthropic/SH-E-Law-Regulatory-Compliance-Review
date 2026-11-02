# scripts/ — 수집·점검·패키징·E2E 스크립트

## 맡은 일
- 수집·점검(TypeScript, `build/scripts/`로 빌드): `sync.ts`(공개 법령 수집), `public-check.ts`(번들 검사), `approve.ts`(검토자 확인서 등록), `backup.ts`.
- 서버를 띄우는 E2E(`e2e*.mjs`)와 단계별 점검(`audit-*`, `validate-isolated-*`, `collect-*`, `research-*`).
- 화면: 베타 빌드(`build-beta-v8.mjs`), 잠금(`freeze-ui-v8.mjs`), 스크린샷(`capture-ui-v8.mjs`).
- 패키징: `build-msix-v8.mjs`, `package-scan.mjs`, `node-shasums-v8.mjs`, `msix-install-test-v8.ps1`, `msix-scenario-v8.mjs`.
- 출처 점검 `source-probe.mjs`, 로컬 감시 `local-watchdog.py`.

## 맡지 않는 일
- 앱 런타임 로직. 스크립트는 `server/`·`shared/`를 가져다 쓰되 서버 동작을 바꾸지 않는다.
- 사용자의 실제 데이터 폴더를 읽거나 쓰는 일.

## 반드시 지키는 것
- E2E와 점검은 격리된 `SHE_DATA_DIR`(임시 폴더)에서 돌린다. `.local`에 붙이지 않는다.
- 공개 수집(`sync.ts`)은 격리 DB를 쓴다. 사용자 질문·첨부·민원·OAuth·인증값이 번들에 들어가지 않는다. `public-check.ts`는 완화하지 않는다.
- `freeze-ui-v8.mjs`는 사용자 승인 없이 돌리지 않는다. 잠글 옛 화면 목록은 저장소 안의 기준 목록 파일(`baseline.json`)에서 읽으므로 그 파일을 옮기거나 바꾸면 잠금이 깨진다.
- 하위 프로세스를 띄울 때 `windowsHide: true`. 보이는 콘솔 창을 열지 않는다. PowerShell 스크립트는 전역 실행 정책을 바꾸지 않는다.
- `package-scan.mjs`의 새 발견은 자동 허용하지 않는다. 예외 목록 변경은 사용자 승인과 이유 기록이 필요하다. 찾을 이름 목록은 환경변수(`SHE_SCAN_NAMES`)로 받고 파일에 적지 않는다.
- `build-msix-v8.mjs`는 `node.exe`의 해시가 공식 `SHASUMS256.txt`와 일치할 때만 진행한다.
- 전자민원(petition) 자동화는 시험에서 가짜 드라이버만 쓴다. 실제 사이트로 나가는 스크립트를 만들지 않는다.
- 로그에 키·본문·사용자 경로를 출력하지 않는다.

## 시험
- 스크립트의 판단 로직(패키지 스캔, 잠금, 해시 확인)은 `tests/`의 시험이 지킨다. 스크립트를 바꾸면 해당 시험을 같이 고친다.
- 단계 접미사(`-v2`~`-v8`)는 만든 단계를 뜻한다. 현행 흐름에서 쓰는 것은 `e2e.mjs`, `e2e-*.mjs`(접미사 없는 것), `e2e-beta-v8.mjs`, 패키징·잠금 스크립트다.

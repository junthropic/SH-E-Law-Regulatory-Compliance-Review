# 실행·빌드·배포

## 개발 실행

필요한 것: Node 24 이상, Windows.

| 할 일 | 명령 | 비고 |
|---|---|---|
| 의존성 설치 | `npm ci` | 잠금 파일 기준 |
| 전체 빌드 | `npm run build` | 타입 검사 → 서버 빌드(`build/`) → 옛 화면 빌드(`dist/`). 베타 화면은 `scripts/build-beta-v8.mjs`가 `dist-beta/`로 만든다 |
| 서버 시작 | `npm start` | `127.0.0.1:4317`. 옛 화면은 `/`, 베타 화면은 `/beta/`. 프로젝트 루트의 `.env`가 있으면 읽는다 |
| 개발 중 자동 재시작 | `npm run dev` | 빌드 후 파일 변경을 감시한다 |
| 숨김 창으로 시작(개발용) | `Start.vbs` | 먼저 `npm run build`가 되어 있어야 한다. 콘솔 창 없이 서버를 띄우고 2초 뒤 브라우저로 `/`를 연다 |
| 전체 확인 | `npm run check` | 빌드 + 전체 시험 |
| 시험만 | `npm test` | 시험 범위는 `tests/**/*.test.ts` |
| 서버를 띄우는 E2E | `npm run test:e2e`, `:public`, `:intake`, `:additional`, `:verification`, `:dossier` | 반드시 격리된 `SHE_DATA_DIR`로. 사용자의 실제 `.local`에 붙이지 않는다 |
| 베타 화면 E2E | `node scripts/e2e-beta-v8.mjs` | 화면 변경 뒤 필수 |

## 환경변수

- `LAW_OC`: 법제처 인증값. 개발·수집용 보조 경로이고 사용자가 설정 화면에 넣는 값이 정식 경로다.
- `PORT`: 기본 4317.
- `SHE_DATA_DIR`: 데이터 폴더. 기본은 프로젝트의 `.local`.
- `SHE_EPHEMERAL_AUTH=1`: 보호 저장소를 메모리에만 둔다(프로세스를 끄면 키가 사라진다). E2E·시험용.
- `SHE_INSTALLED=1`, `SHE_LAUNCH_TOKEN`: 설치판 전용. 런처가 넣는다. 개발 중 손으로 넣는 값이 아니다.
- `.env`는 Git에 올리지 않는다(`.env.example`만 올린다). 예시 파일에는 실제 값을 쓰지 않는다.

서버를 개발 실행으로 시작하면 시작할 때마다 번들을 다시 가져오고, 설치판은 번들 파일이 지난 가져오기와 다를 때만 가져온다.

## 자동 수집

서버가 켜져 있는 동안 하루 한 번(한국 달력 기준) 법령을 자동 수집하는 기능이 있다. 서버 시작 60초 뒤 처음 확인하고 이후 30분마다 확인하며, 하루에 최대 한 번만 돈다. 사용자가 설정에서 켜고 끌 수 있고 기본은 꺼짐이다. 켜고 끄는 사건과 실행은 감사 기록에 남는다.

## 공개 법령 번들 갱신

번들(`data/public/bundle.json.gz`)은 새 앱 버전을 만들기 전에 사람이 갱신한다.

1. `npm run sync`: 격리 DB에서 법령을 수집한다.
2. `npm run publish:check`: 번들 후보에 사용자 자료·개인 흔적이 없는지 검사한다. 실패하면 완화하지 않고 원인을 고친다.
3. 통과한 번들만 `data/public/`에 넣고 커밋한다.

`public-law-sync` 워크플로는 이 일을 CI에서 수동으로 돌린다(저장소 비밀값 `LAW_OC` 필요). 매주 자동 실행은 꺼 두었다.

## 근거 승인

검토자 확인서(JSON)를 받아 `npm run approve -- 확인서.json`으로 규칙을 켠다. 확인서는 해시가 현재 근거 전체와 같고 24시간 안일 때만 통과한다. 자세한 조건은 승인 화면·서버가 검증한다.

## CI

| 워크플로 | 언제 | 내용 |
|---|---|---|
| `ci.yml` | PR(Linux), main(Linux + Windows) | `npm run check` + `npm run publish:check` |
| `date-matrix.yml` | 수동 | 여러 기준 날짜로 시험을 돌려 날짜 민감 변경 확인 |
| `msix.yml` | 수동 또는 `msix-test/*` 브랜치 푸시 | 서명 시험용 MSIX와 Store용 MSIX 빌드, 패키지 스캔, 설치·실행·백업·제거·재설치·복원 시험, Windows 인증 키트 |
| `public-law-sync.yml` | 수동만 | 공개 법령 번들 수집 |
| `source-probe.yml` | 수동 | 법령 출처 응답 점검 |

- Windows 작업이 시간 초과로 실패하면 그 작업만 다시 돌린다.
- 외부 액션은 커밋 해시로 고정한다. 태그로 되돌리지 않는다.
- 패키지 스캔이 찾는 이름 목록은 저장소 비밀값(`SHE_SCAN_NAMES`)에서 받는다. 저장소 파일에 적지 않는다.

## Store 패키지와 배포

1. 버전을 올린다: `packaging/msix/identity.json`의 `version`(네 자리, 마지막 자리 0). 같은 버전은 다시 올릴 수 없다.
2. 패키지 빌드: `node scripts/build-msix-v8.mjs --store`(서명 없는 Store용). 시험용은 `--test-identity --sign-test`. 빌드는 C# 런처와 `node.exe`를 묶으며, `node.exe`의 해시가 공식 `SHASUMS256.txt`와 같을 때만 진행한다.
3. 패키지 스캔: `node scripts/package-scan.mjs <패키지> --package --allow packaging/msix/scan-exceptions.json`. 새로 걸린 항목은 자동으로 허용하지 않고 사용자에게 목록(파일·종류·개수, 값 제외)을 보여 준다.
4. 설치 시험: `msix.yml`을 돌려 설치·백업·제거·재설치·복원이 통과하는지 본다.
5. 제출: 사용자가 Partner Center에서 직접 한다. Store가 서명한다. 게시자 식별 값은 `identity.json`에만 있고 문서·로그·화면에 옮기지 않는다.
6. 제출 설명·인증 메모·스크린샷이 현재 화면 문구와 같은지 확인한다. 화면 문구가 바뀌면 스크린샷(`scripts/capture-ui-v8.mjs`)을 다시 찍는다.

## 사용자 PC에서의 운영

- 앱을 제거하면 저장 자료가 지워진다. 제거 전에 베타 화면의 백업 기능으로 암호화 백업을 만든다.
- 백업은 같은 Windows 사용자 계정에서만 복원된다. 앱에 들어 있는 공개 법령 초기 자료는 백업에 넣지 않으므로 복원 후 앱이 다시 가져온다.
- 설치판의 데이터 폴더는 패키지 전용 앱 데이터 폴더(`%LOCALAPPDATA%\Packages\<패키지 이름>\LocalState`)다. 앱을 제거하면 함께 지워진다. 직접 열어 고치지 않는다.

## 되돌리기

- 앱 버전: Store에서 이전 버전으로 되돌릴 수 없다. 문제가 있으면 다음 버전으로 고쳐 올린다.
- 데이터: 암호화 백업으로 복원한다. 복원은 형식·인증 태그를 먼저 검증하고(실패 시 400), 진행 중인 작업이 있으면 거절한다(409).
- 번들: 이전 번들 파일로 되돌리고 `publish:check`를 다시 통과시킨다.

# v8 단계 0 — 개인정보·키 검사 결과 (값 없음)

검사일 2026-10-11, 기준 main `0a5c323`. 도구 `scripts/package-scan.mjs` (값을 출력하지 않고 파일·종류·줄만 기록).
이름 목록은 실행 시 환경 변수로만 넘겼다(저장소에 기록하지 않음). 상세 결과 JSON은 `work/v8-scan/`(Git 제외)에 있다.

## 1. 현재 추적 파일 (`--git-tracked`)

| 종류 | 건수 | 파일 수 | 판정 |
|---|---|---|---|
| 실제 API 키 (`.env` 형식 대입) | 33 | 1 (`.env.api-keys`) | **실제 키** — 법제처 OC 1 + 공공데이터 API 키 32. 재발급 후 제거 PR 대기 |
| 키 대입 패턴 (그 밖) | 3 | 2 (`server/auth.ts`, `tests/ai-auth.test.ts`) | 오탐: 코드 변수 대입, 합성 시험값 |
| base64 긴 문자열 | 302 | 8 | 오탐: `package-lock.json` 무결성 해시 252, 공개 PDF·HTML·JS 본문, 문서 본문, 시험용 TLS 인증서 |
| 개인 키 블록 | 1 | 1 (`tests/fixtures/v5-tls/synthetic-key.pem`) | 시험용 자체 생성 TLS 키(합성). 패키지 금지 대상 |
| 이메일 | 85 | 45 | 공개 기관 주소(`@nia.or.kr`, 공식 페이지 저장본) 66, 시험·문서의 예약 도메인 주소, gz 바이너리 우연 일치 |
| 사용자 경로 (`C:\Users\…`) | 766 | 80 | 모두 `docs/` (실행 로그·과거 기록) |
| 이름 | 545 | 78 | 모두 `docs/` (실행 로그의 경로·과거 기록) |

`docs/development-history/api-key-archive.md`에는 키 값 형식이 없다(설명 문서). 지시대로 `.env.api-keys`와 함께 제거 PR 대상이다.

## 2. Git 이력 전체 (`--git-history`, 모든 ref의 모든 blob + 커밋 정보)

| 종류 | 위치 | 판정 |
|---|---|---|
| 실제 API 키 | `.env.api-keys` blob 1개(커밋 `b18cc4b`에서 추가) | 다른 blob·다른 경로에는 키 없음 |
| 키 후보 (그 밖) | 현재 트리와 같은 오탐·시험 자료 (`server/auth.ts` 3개 버전 포함) | 오탐 |
| 커밋 작성자·커미터 정보 | 개인 메일 도메인(`@gmail.com`) 34회, noreply 50회, github.com 9회, anthropic.com 1회 / 사람 이름 표기 4종 | 개인 메일이 이력에 남아 있음. 이력 재작성은 하지 않음(지시) |
| 이름·경로 | `docs/` 아래 과거 기록 | 패키지 대상 아님 |

## 3. 판단

- 키 값이 노출된 곳은 `.env.api-keys` 하나다. 저장소는 Private이며, 사용자가 키를 재발급한 뒤 작업 트리에서 제거한다(이력은 유지).
- 이름·사용자 경로·개인 메일은 문서·로그·커밋 정보에만 있고 앱 소스(`server/`, `shared/`, `src/`)에는 없다.
- 패키지는 `scripts/package-scan.mjs --package`로 금지 폴더(`docs/`, `tests/`, `.local/`, `work/`, `.git` 등)·`.env*`·인증서 개인 키·DB·개발 스크립트를 실패 처리하므로, 위 기록들은 패키지에 들어갈 수 없다.

# 계약: 화면과 서버의 약속, 외부와의 약속

## 공통 약속

- 서버는 `127.0.0.1`에서만 받는다. 모든 `/api/` 요청은 세션 쿠키(`she_session`)가 필요하고, GET·HEAD가 아닌 요청은 `X-CSRF-Token` 헤더가 필요하다. 처음 열리는 경로는 `GET /api/bootstrap` 하나다.
- 설치판에서 `/api/bootstrap`은 유효한 세션 쿠키가 없으면 `x-she-launch` 헤더(주소의 `#launch=` 조각에서 받은 1회용 값)가 유효해야 세션을 준다. 1회용 값은 5분 안에 한 번만 쓸 수 있다(아래 "파일 형식"의 1회용 값).
- 오류 응답은 `{ "error": "한국어 메시지" }` 형태다. 입력 형식 검사에 걸리면 `입력 내용을 확인하세요: <항목> <사유>, …` 형태의 400이 나가고, 코드에서 던진 일반 오류도 400이다. 상태 코드가 붙은 오류만 그 코드를 쓴다. 상태 코드의 뜻:
  - 400: 입력 형식 오류, 복원 파일 검증 실패
  - 401: 세션 없음·모르는 세션
  - 403: Host·Origin·교차 사이트·CSRF·1회용 값 위반, 설치판에서 꺼진 기능
  - 404: 대상 없음
  - 409: 진행 중인 작업과 충돌, 이미 저장된 키가 있는데 교체 승인이 없음
  - 503: 서버 종료 중
  - 429: `POST /api/reviews`에 코드가 있으나, 검토가 도는 동안은 변경 요청이 먼저 409로 막히므로 실제로는 나가지 않는다
- 요청 본문 한도는 전체 2MB다. 예외는 암호화 복원(`POST /api/beta/restore`) 200MB와 옛 평문 복원(`POST /api/restore`) 100MB다.
- 오류 메시지에는 본문·키·파일 경로가 없다. 화면은 메시지를 그대로 보여 준다.
- 날짜는 `YYYY-MM-DD`(실재하는 날짜만), 시각은 ISO 8601이다. 해시는 소문자 16진수 64자(SHA256)다.

## 서버가 화면에 내놓는 경로

### 검토

| 경로 | 뜻 |
|---|---|
| `GET /api/reviews` | 검토 목록 |
| `POST /api/reviews` | 검토 만들기. 아래 상세 참고. 202와 `{ id }`를 바로 돌려주고 뒤에서 계산한다 |
| `GET /api/reviews/:id` | 검토 한 건 |
| `DELETE /api/reviews/:id` | 검토 삭제 |
| `GET /api/reviews/:id/events` | 진행 상황 스트림 |
| `POST /api/reviews/:id/resolve-reference` | 참조 해소 |
| `GET /api/reviews/:id/export` | 내보내기(마크다운·CSV). 표시 문구가 항상 붙는다 |
| `GET /api/reviews/:id/dossier` · `GET …/reviewer-packet` | 근거 묶음, 검토자용 묶음 |
| `POST /api/reviews/:id/comparisons` · `POST …/conditions` | 비교 입력, 조건 입력 |

### 문서·근거

| 경로 | 뜻 |
|---|---|
| `GET /api/documents` · `POST /api/documents` | 문서 목록, 업로드. 형식은 `.txt .pdf .hwp .hwpx .docx` |
| `GET /api/documents/:id/original` · `…/text` | 원본 파일, 추출 텍스트 |
| `POST /api/documents/:id/confirm` | 추출 내용 확인 |
| `POST /api/documents/official` | 공식 문서 등록 |
| `DELETE /api/documents/:id` · `POST /api/documents/delete-all` | 삭제 |
| `GET /api/evidence` · `GET /api/evidence/:id/diff` | 근거 목록, 버전 비교 |

### 설정·갱신·승인

| 경로 | 뜻 |
|---|---|
| `GET /api/status` | 상태 |
| `GET/POST /api/preview` | 후보 표시 스위치(`safetyManagerV7`) 조회·변경. 변경은 감사 기록에 남는다 |
| `POST /api/settings/law` | 법제처 인증값 저장 |
| `POST /api/sync` | 법령 수집 |
| `POST /api/public/update` | 공개 번들 업데이트(설치판 꺼짐) |
| `GET /api/basis/context/:id` · `POST /api/basis/approve` | 승인 맥락 조회, 검토자 확인서 등록 |
| `POST /api/quantity-ratio` | 지정수량 배수 합산 |
| `GET /api/backup` · `POST /api/restore` | 평문 JSON 백업·복원(설치판 꺼짐) |
| `GET/POST /api/retention` · `POST /api/retention/purge` | 보존 기간 설정, 영구 삭제 |
| `POST /api/shutdown` | 서버 종료 |

### AI·접수·공공 API·기타

| 경로 | 뜻 |
|---|---|
| `POST /api/auth/chatgpt/{start,cancel,logout}` · `GET …/models` · `GET /auth/callback` | AI 서비스 로그인(OAuth) |
| `GET/POST /api/ai/consent` · `GET /api/ai/send-log` · `GET /api/ai/pending` · `POST /api/ai/pending/:id` | AI 전송 동의, 전송 기록, 대기 중인 전송의 승인·거부 |
| `POST /api/intake` · `GET /api/intake/:id` · `POST …/plan` · `POST …/execute` | 자연어 접수 |
| `GET /api/public-apis` · `POST/DELETE /api/public-apis/:service/key` · `POST …/probe` · `POST …/search` | 공공 API 서비스 목록, 키, 연결 점검, 조회 |
| `POST /api/public-api-records/:recordId/{detail,import}` | 공공 API 결과의 상세 조회, 근거로 가져오기 |
| `POST /api/petitions/{connect,collect,disconnect}` | 전자민원(설치판 꺼짐) |
| `POST /api/mcp/query` | MCP 조회(설치판 꺼짐) |

### 베타 화면 전용

| 경로 | 뜻 |
|---|---|
| `GET /api/beta/keys` | 연결 목록과 각 키의 저장 여부(키 값은 돌려주지 않는다) |
| `POST/DELETE /api/beta/keys/law` · `POST …/law/probe` | 법제처 인증값 저장·삭제·점검 |
| `POST/DELETE /api/beta/keys/data-go-kr`, `…/address` | 공공데이터포털 일반 인증키, 도로명주소 승인키 저장·삭제 |
| `GET/POST /api/beta/collection` | 자동 수집 상태·켜기·끄기 |
| `GET /api/beta/reviews/:id` | 베타 화면용 검토 보기 |
| `POST /api/beta/reviews/:id/self-review` | 자가 검토 기록 |
| `GET /api/beta/notice` | 화면에 보여 줄 고지문 |
| `GET /api/beta/backup` · `POST /api/beta/restore` | 암호화 백업·복원 |

연결 목록은 코드 기준으로 법제처 인증값 1개와 서비스 28개(공공데이터포털 26, 도로명주소 2)이며 바뀔 수 있다. 목록의 단일 출처는 코드이고, 화면은 `GET /api/beta/keys` 응답이 주는 목록을 그대로 그린다.

### 주요 경로의 입력·출력·오류

**`GET /api/bootstrap`**: 세션이 없을 때만 새로 만든다. 출력 `{ csrf, regions, version }`과 `she_session` 쿠키(HttpOnly, SameSite=Strict). 설치판 판정: 유효한 쿠키가 있으면 헤더와 관계없이 기존 세션으로 200(헤더의 값이 유효하면 그 값은 "쓴 것"이 된다). 쿠키가 없으면 유효한 1회용 값일 때만 새 세션으로 200이고 그 값은 "쓴 것"이 된다. 그 밖(값 없음, 틀린·쓴·5분 지난·1분 넘게 미래·형식이 틀린 값, 헤더 여러 개)은 403 `{ error: "화면 오른쪽 아래 알림 영역의 SH·E 아이콘에서 「화면 열기」를 누르거나, 시작 메뉴에서 앱을 다시 열어 주세요." }`이고 쿠키를 주지 않는다. 세션이 100개를 넘으면 모두 비운다.

**`POST /api/reviews`**: 입력 `{ prompt(10~30000자), region(17개 시·도 중 하나), municipality(100자 이하, 기본 빈 값), asOf(YYYY-MM-DD), documentIds(UUID 20개 이하), linkedEvidenceIds(30개 이하), comparisonIds(100개 이하), model, useAi(기본 false), answers(항목별 6000자 이하), intakeId(선택) }`. 출력 202 `{ id }`. 형식이 틀리면 400. 진행 상황과 결과는 `GET /api/reviews/:id`와 `…/events`로 읽는다.

**`POST /api/basis/approve`**: 입력은 검토자 확인서(아래 파일 형식). 출력 `{ ok: true }`. 오류(모두 400): 검토 ID·지역·시군구·기준일 불일치, 공식 출처 간 불일치, 확인서의 근거 해시가 현재 근거 전체와 다름, 국가법·해당 시·도 조례 누락, 규칙 인용이 원문과 다름, 규칙 조건의 사실이 필수 확인 목록에 없음. 진행 중인 작업이 있으면 거절한다. 저장은 한 덩어리로 하고 실패하면 되돌린다.

**`POST /api/quantity-ratio`**: 입력 `{ groupConfirmed, items[≤100]: { quantity, unit, designated, designatedUnit } }`. 출력 `{ ratio, note }`. `groupConfirmed`가 false이거나 품목이 없거나, 단위가 모르는 값이거나 품목 안에서 종류(질량·부피)가 다르거나, 수량이 음수·지정수량이 0 이하면 400.

**`POST /api/documents`**: multipart 파일 하나. 확장자는 `.txt .pdf .hwp .hwpx .docx`만, 파일당 20MB 이하. 어기거나 파일이 없으면 400. 같은 내용(해시)이 이미 있으면 새로 만들지 않고 기존 문서 기록을 돌려준다. 추출문은 150만 자에서 자르고 경고를 붙이며, 텍스트를 못 뽑으면 경고만 남긴다. 출력은 문서 기록(추출문·경고 포함)이다.

**`GET/POST /api/ai/consent`**: 조회는 현재 동의 상태. 변경은 `{ enabled: boolean }`. **`GET /api/ai/pending`**: 승인을 기다리는 전송 목록(화면은 보낼 내용을 그대로 보여 준다). **`POST /api/ai/pending/:id`**: `:id`는 UUID, 본문은 `{ approve: boolean }` 한 항목만 허용한다. 승인하면 그 건 한 번만 전송한다.

**`GET /api/beta/keys`**: 출력 `{ storage, missingLabel, groups[] }`. 그룹은 법제처(`law`), 공공데이터포털(`data-go-kr`), 도로명주소(`address`)이고 각각 저장 여부·저장된 개수·전체 개수·서비스별 상태를 담는다. 키 값은 돌려주지 않는다.
**`POST /api/beta/keys/law`** `{ lawOc }`: 저장 후 다시 읽어 확인한다. **`POST /api/beta/keys/{data-go-kr,address}`** `{ key(8~1500자), replace(기본 false) }`: 그룹의 모든 서비스에 같은 키를 저장하고 `{ saved, replaced, unchanged }`를 돌려준다. 이미 다른 키가 저장된 서비스가 있는데 `replace`가 없으면 409. 알 수 없는 항목이 본문에 있으면 400(엄격 검사). `DELETE`는 그룹 전체를 지운다.
**`POST /api/beta/keys/law/probe`**: 법제처에 목록 조회를 한 번 보내 연결을 확인한다. 출력 `{ ok, message, count? }`. 실패해도 200이고 `ok: false`다.

**`POST /api/beta/reviews/:id/self-review`**: 입력 `{ note(15~2000자), checks: { facts: true, basis: true, limits: true } }`. 완료된 검토만 가능(아니면 400), 없으면 404. 기록에는 항상 자가 검토 표시가 붙고 `independent: false`다.

**`GET /api/beta/backup`**: 암호화 백업 파일(JSON)을 내려준다. 작업이 진행 중이면 409. **`POST /api/beta/restore`** `{ file: 백업 파일 내용 }`: 작업이 진행 중이면 409. 백업 파일이 아니거나(400), 만든 Windows 사용자가 아니어서 키를 풀 수 없거나(400), 인증 태그가 틀리거나 변경됨(400)이면 복원하지 않는다. 성공하면 `{ ok: true, reviews, documents }`(복원한 개수).

## 두 화면이 함께 쓰는 타입

- `shared/`의 타입(`ReviewRequestSchema`, 쟁점·근거·사실 형태)과 서버가 내보내는 `beta-contract`가 화면과 서버의 형태 약속이다. 형태를 바꾸면 양쪽 시험이 같이 깨져야 정상이다. `beta-contract` 파일은 화면 잠금 대상이므로 바꿀 때 사용자 승인과 재잠금이 필요하다.
- 쟁점 분류는 `clear_risk` / `human_review` / `more_data` 세 값만 쓴다. 화면은 이 값을 `shared/result-language.ts`의 문구로 바꿔 보여 준다.

## 외부와의 약속

| 상대 | 용도 | 비고 |
|---|---|---|
| 법제처 Open API(`law.go.kr`) | 법령·조례·행정규칙·해석례 | 사용자가 발급한 인증값(OC). 서버가 직접 호출 |
| 공공데이터포털(`apis.data.go.kr`, `www.data.go.kr`) | 보조 공개 자료 28개 서비스 중 26개 | 서비스별 일반 인증키 |
| 도로명주소(`business.juso.go.kr`) | 주소 확인 | 승인키 |
| 지자체 공보 · 고용노동부(`www.gg.go.kr`, `www.hscity.go.kr`, `www.moel.go.kr`) | 조례 공보, 공개 자료 | 키 없음 |
| OpenAI 로그인·API(`auth.openai.com`, `api.openai.com`) | AI 분석 | 사용자가 켜고, 건별로 승인한 내용만. 보낸 내용은 기록하지 않고 크기·해시만 남긴다 |

- 위 호스트가 아닌 곳으로는 호출이 나가지 않는다. 호스트를 늘리려면 허용 목록과 시험을 같이 바꾼다.
- 외부 응답은 그대로 믿지 않는다. 법령 응답은 근거(Evidence)로 바꾸면서 해시를 계산하고, 출처 간 불일치를 기록하며, 원문 확인 시각(`fetchedAt`)을 붙인다.
- 외부 서비스가 응답하지 않거나 "조회 실패"·"응답 시간 초과"로 끝난 값은 확정 답변으로 인정하지 않는다.

## 파일 형식

- **공개 법령 번들** `data/public/bundle.json.gz`: 근거 버전 목록(건수는 갱신 때마다 바뀐다). 검토 기록·사용자 문서·키는 들어가지 않는다. `publish:check`가 이를 검사한다.
- **암호화 백업**: 백업마다 새 256비트 키로 gzip 후 256비트 AES-GCM(태그 16바이트) 암호화하고, 그 키를 Windows 사용자 보호로 감싸 파일 안에 넣는다. 인증키·설정·감사 기록·공개 번들 초기 자료는 들어가지 않는다. 복원 한도: 요청 본문 200MB, 압축 해제 512MB.
- **검토자 확인서**(JSON): 검토자 이름, 지역·시군구·기준일, 설명, 지자체 공보 주소(`.go.kr`), 네 가지 확인 표시, 현재 적용 근거 전체의 해시. `npm run approve -- <파일>` 또는 승인 경로로 등록한다.
- **1회용 값**(설치판, `#launch=`·`x-she-launch`): 56바이트를 base64url(채움 없음) 75자로 적는다. 0~7바이트 만든 시각(Unix 밀리초, 부호 없는 큰 끝), 8~23바이트 난수 16바이트, 24~55바이트 HMAC-SHA256(키는 실행 키 문자열의 UTF-8 바이트 그대로, 메시지는 0~23바이트). 서버는 다시 인코딩한 문자열이 받은 것과 정확히 같을 때만 검사를 이어 간다. 유효 범위: 나이 −60,000ms~300,000ms(경계 포함). 런처(`Launcher.cs`)와 서버(`server/launch-token-v8.ts`)가 같은 계산을 하며 V8-Q01이 두 쪽을 맞대 본다.
- **`launch.json`**(설치판 데이터 폴더, 런처가 쓰고 종료 때 지움, 이 사용자와 SYSTEM만 읽기): `{"port":<번호>,"pid":<서버 프로세스 번호>,"pipe":"<통로 이름>"}`. 실행 키·1회용 값은 적지 않는다. 런처는 통로를 연 뒤에 이 파일을 쓴다.
- **로컬 통로**(설치판 런처): 이름 `SHE-Law-Beta-<Windows 세션 번호>-<데이터 폴더 해시 16자>`. 한 연결에 ASCII 요청 한 줄, 응답 한 줄(줄 끝은 LF)을 주고받고 끊는다. `open` → `ok`(2초 안에 다시 온 신호도 `ok`지만 브라우저는 열지 않음). `mint` → 시험용 패키지는 새 1회용 값 한 줄, Store 패키지는 `no`. 그 밖 → `no`. 2초 안에 요청이 없으면 끊는다. 한 번에 한 연결만 받으므로 연결하는 쪽은 "없음·사용 중"이면 잠시 뒤 다시 시도한다. 서버가 준비된 뒤에 열린다.
- **업로드 원본 파일 이름**: 영문·숫자·`-`로 된 이름 + `.` + 소문자 확장자 형식만 허용한다(경로 이탈 방지).

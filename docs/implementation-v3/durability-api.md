# 영속 수집과 API 검증

## 상태와 저장

`queued → running → succeeded`가 기본 실행 흐름이다. retryable 실패는 최대 3회와 전체 budget 안에서 waiting_retry로 이동한다. 실제 공공 API adapter의 내부 재시도와 외부 worker 재시도가 곱해지지 않도록 adapter에서 소진한 오류는 자동 재시도하지 않는다. 인증·형식·크기 오류는 실패로 남는다.

429/한도는 waiting_quota, reset 미확인은 eligible=null로 둔다. pause/resume/cancel은 owner·fence를 변경한다. 완료·취소 작업은 과거 응답으로 되살릴 수 없다. 수동 재개는 명시적 새 budget이며 이전 snapshot·이력은 남긴다. 취소는 실행 소유권을 즉시 무효화하는 방식으로 구현했으며 별도 cancelling 단계는 없다.

HTTP 접수는 입력·서비스별 검색 조건·전송 허용·키 참조를 검사한 뒤 DB에 저장하고 202+job ID+Location을 보낸다. 같은 idempotency key와 같은 내용은 동일 ID, 다른 내용은 충돌이다. 실제 외부 요청의 exactly-once는 보장하지 않는다.

claim·원문 결과 단위·checkpoint·종료는 짧은 SQLite transaction 안에서 실행한다. HTTP는 transaction 밖이다. busy timeout 200ms와 bounded retry를 둔다. 두 독립 Node 프로세스가 같은 DB에서 하나의 작업 및 공유 quota를 획득하는 시험을 수행한다. WAL을 네트워크 파일시스템에서 검증한 것은 아니다.

lease 기본 70초, heartbeat는 대략 lease/3마다 수행하며 job과 quota lease를 함께 연장한다. worker 소유자와 증가하는 fence가 맞아야 결과를 저장한다. 만료·취소 후 응답은 거절한다. 전체 budget 기본 180초, 허용 범위 1~600초다. 응답하지 않는 모의 transport도 budget 종료로 반환한다. 취소 signal은 실제 public transport에 연결한다.

목록 → 각 상세 → 첨부 상태를 연결한 뒤 해당 페이지 checkpoint를 전진시킨다. 재시작은 저장된 목록을 재사용한다. 상세 실패는 error로 남고 정상 목록 성공에 묻히지 않는다. partial MSDS 상세를 전체 상세 성공으로 바꾸지 않는다. 작업 succeeded는 실행 종료이며 전체 coverage complete가 아니다.

수집 adapter는 한 작업 최대 100페이지, 결과 단위 JSON 4MB를 제한한다. 전체 offset snapshot의 안정성·누락 0을 보장하지 않는다. 기존 CollectionJournal의 총건수 변화·중복·부분 상태를 함께 유지한다.

## quota와 호환 경로

provider+credential hash를 공유 quota 키로 사용한다. 작업 간 최소 2초와 독점 lease를 두며 기관별 실제 계정 한도를 확인했다고 표시하지 않는다. 과거 A07/A08 transport의 제한된 재시도·cooldown도 유지한다. 다른 키를 쓰는 상세 서비스 및 MSDS 내부 병렬 operation의 계정 전체 quota까지 완전히 공통 조정한 것은 아니다.

수동 해제는 collection_operator, 해당 scope의 작업, 기관 확인 URL, 사유를 요구하고 이전/이후 상태와 actor를 남긴다. 해제는 연결 성공이 아니다.

기존 `/api/public-apis/:service/search`는 기존 200 결과 또는 기존 오류 형태를 유지한다. 250ms 이내 저장 결과가 없으면 기존 오류 형태로 진행 중을 알리고 job은 백그라운드에서 계속한다. 기존 화면에서 완료 후 재조회가 성공하는 경로를 새 격리 브라우저 시험으로 확인했다. 새 async 관리 API의 202를 기존 화면에 보내지 않는다.

## A07/A08 수탁업체 사례

A07(waste-companies)의 기존 단일 시도 timeout은 60초이며 최대 2회, 대기·재시도를 포함한 transport budget은 180초다. 일반 endpoint의 기본 단일 timeout 20초와 다르다. v3는 그 위에 영속 작업·취소·checkpoint·공유 quota를 연결했다. 기관 지연이나 간헐 장애를 제거했다고 하지 않는다. 이번에는 실제 키를 읽거나 A07/A08 live를 재호출하지 않았다.

다음 조건을 모의한다: A07 시간초과/A08 성공, A07 성공/A08 실패, 0건, 동명 다른 사업자, 동일 사업자의 다른 시설, 과거 종료 처분, 현재 효력 미확인, 허가 대상 폐기물 불일치. 업체명만으로 자동 join하지 않고 사업자·시설·대상 폐기물·허가기간·처분 효력 확인을 남긴다. 처리능력·계약·처리방법을 포함한 전체 위탁·수탁 적합성 모델은 미완료다.

포털 공개 안내는 이번에 확인했다: [A07](https://www.data.go.kr/data/15141649/openapi.do), [A08](https://www.data.go.kr/data/15156661/openapi.do). 개발계정 신청가능 트래픽은 사용자 실제 남은 quota/reset이 아니다. A08 운영 활용 승인 여부도 키 저장만으로 확정하지 않는다.

## 원본·변경의 남은 공백

32서비스·52operation은 api-registry.json에 모두 보존한다. 현재 영속 단위는 정규화된 결과 snapshot이다. 모든 transport 원문, 모든 상세 operation, 첨부 바이너리 다운로드·원본 대조가 구현되었다고 할 수 없다. 첨부의 not_supported는 현 adapter 역할에 대한 상태이며 기관 자체가 미지원이라는 법적·기술적 확정이 아니다. guide/accident 파일 등은 adapter_missing으로 명시한다.

304 재사용은 query/validator/이전 본문이 일치해야 하는 함수와 시험을 추가했으나, 모든 adapter의 실제 conditional HTTP 요청까지 연결하지 않았다. 원천 생애주기 이벤트는 확인된 삭제·공개중단·비공개와 검색 미반환·일시 오류를 분리하며 과거 근거를 삭제하지 않는다. 모든 원천의 자동 삭제 탐지기는 미구현이다.

계정별 사용조건·현재 승인·전체 operation별 fixture·지연 지표·원문·첨부를 확인한 뒤에만 해당 gap을 닫는다. 과거 성공·새 연결 시험·법적 적용 승인·실제 현재 API 성공은 다른 축이다.

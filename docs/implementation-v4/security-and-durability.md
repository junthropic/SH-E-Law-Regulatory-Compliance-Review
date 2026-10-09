# v4 연결 범위와 제한

| 경로 | 현재 구현 | 남은 항목 |
|---|---|---|
| 공식 API transport | 파싱 전 capture, 안전 metadata, 실제 호출마다 SQLite permit, 취소/timeout | provider별 HTTP 오류 본문 quarantine, actual account group, 모든 상태별 specimen |
| 원문 저장 | AES-GCM bytes를 동일 SQLite 행에 원자 삽입; 미완료 capture 구분 | payload와 capture 참조 사이 장애로 생기는 미참조 암호문 정리, fsync/전원 장애 실험 |
| v4 queue | query/filter AES-GCM, HMAC idempotency/credential reference, 24시간 TTL, unit 7일 TTL | 법적 보존과 실행 payload 별도 실제 정책, 기존 v3 migration, 작업 완료 시 조기 정리 |
| AI context/사실 추출 | 실제 serialized payload digest 및 host 부모 노드 등록, 토큰 획득 뒤 권한 재검사 | 기존 v3 digest 기반 승인 대체 및 모든 증빙 ref 자동 매핑 |
| intake execute | 실제 서비스 호출 전에 context 필요, 없는 private 실행은 실패 처리 | 단계별 실제 최종 URL·상세 payload까지 provenance 확장 |
| MCP | child 실행 전 인수 provenance 확인, callTool 직전 재확인 | SDK child 창 정책 및 전체 tool-result 재사용 검증 |
| v4 public worker | prepare 입력 node, enqueue/worker/per-call 권한 검토, 암호화 결과·raw | 실제 URL serialization의 provenance 및 linked-detail 제공자별 추가 권한 매핑 |
| 답변 재사용/export | 기존 경로 보존, 신규 자동 egress 허용 없음 | 생성 경로의 모든 부모를 자동 연결하는 전용 adapter |
| attachments | 고정 DNS 주소로 HTTPS 접속, peer 비교, redirect 거부, 인증값 query 거부, byte/time 한도 | 실제 provider 발견/다운로드 연결, IPv6/압축·archive/parser/OCR, 원문 위치·셀 대조 |
| v4 backup | 보호자료 계층만 encrypted archive, 키 제외, 원자 DB 복원·이력+deny | v2/v3 전체 앱/작업/원본과 통합 복원, crash·동시성·power-loss |

기존 v3 큐/저널·기존 backup 형식을 몰래 이관하거나 삭제하지 않았다. v4 경로는 명시적 host 구성과 관리 API가 있어야 사용되며 production entrypoint에는 연결하지 않았다. 일반 앱에서 host enforcement를 제공할 수 있지만 제공 자체를 실제 사용자의 동의나 법적 처리 근거로 간주하지 않는다.

소유권 job fence와 기관 call permit은 별도 테이블이며 부모 lock을 자식 호출이 재획득하지 않는다. 실제 기관 quota는 모의 간격으로 확정하지 않는다. A07 기존 60초×최대2회 구조를 보존하고 `transport_exhausted`, `quota_wait`, `transient_worker_eligible`, `automatic_retry_forbidden`를 내부적으로 구분했다. Collection은 기존처럼 adapter 오류를 자동 worker 재시도 불가로 바꾸어 중첩 재시도를 피한다. A07 장애가 완전히 사라졌다고 주장하지 않는다.

304/range는 공식 지원·동일 representation/validator·기존 bytes 연결이 확정되지 않아 자동 재사용을 활성화하지 않았다. 원천 삭제·공개중단은 v3의 명시적 상태 기록을 유지한다. 전수 동기화·실시간 최신성 보장은 하지 않는다.

참고 기준은 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)과 [OWASP SSRF 방지 지침](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)이다. 지침 인용은 보안 인증이나 모든 취약점 해소를 의미하지 않는다.

# v4 실행 결과 — 격리 구현과 합성 검증

이번 실행은 사용자 첨부 통합본의 **부록 v4 한 번**에 해당한다. 본문은 조사·정정 자료로 사용했으며 v2/v3 지시를 재실행하지 않았다. 구현 전체나 운영 준비 완료를 의미하지 않는다. 미구현·미검증은 [release-gate.json](release-gate.json)에 유지했다.

최종 결과: **380/380 자동시험 통과(기존 332개 보존 + 신규 48개), 브라우저 시험 8/8 통과(기존 7개 + v4 1개), 29개 동결 파일 변경 0, 52개 operation 합성 adapter 실행**. 최종 소스 digest는 `dc4b4f2029b66d306253fcb8ca724fcd46e30de2a08e2aeb854fcbbdd0688c83`이며 검증 복사본과 불일치 0이다. 기술 시험 외 법적 정확도·실제 사업장·실호출 검증률은 계산하지 않았다.

1. **기준선**: HEAD `e770bdefb32fbb6a010b435f372f2d13c9fb384f`의 미커밋 작업 트리다. v3 sourceDigest `26dc4d816b8caa152bc551bd28f6dbdfcc6b6654b4db6fc078c85ee0afea938a`에 포함된 128개 파일 모두 일치했다. 격리 복사본에서 기존 332개 시험과 7개 브라우저 시험을 다시 통과했다. 기존 변경을 되돌리거나 이번 변경으로 분류하지 않았다. 최종 소스·검증 복사본 일치 여부는 [build-verification.json](build-verification.json), 최종 digest는 [source-manifest.json](source-manifest.json)에 기록한다.

2. **실제 구현**: `requestOnce`의 실제 파싱 이전에 바이트 capture와 개별 HTTP permit을 연결했다. 원문은 Node fetch가 압축을 해제한 entity bytes이며 wire bytes가 아니다. BOM/trim 이전 hash와 이후 hash를 나눈다. 원문·검색어·결과 단위를 AES-256-GCM으로 SQLite에 저장하고 host가 별도로 제공한 키 참조만 남긴다. 민감한 전체 URL·인증 헤더·인증값을 로그에 저장하지 않는다. HTTP 오류 본문은 읽지 않은 상태로 명시하며 성공 원문으로 만들지 않는다. 원문 수신·파싱 성공도 API 의미 검증·법적 결정 셀 승인을 뜻하지 않는다.

3. **실행 결과와 수정**: 최종 자동시험/브라우저 수치, 기존 시험 이름 보존, 실패·수정 이력은 [execution.json](execution.json), [test-inventory.json](test-inventory.json), [failure-record.json](failure-record.json)에 있다. Q&A 합성 식별값 및 토지이용 필수 입력을 수정했고, 강화된 전송 경계에 맞춰 기존 intake E2E host에 명시적인 합성 권한을 제공했다. Windows 자식 프로세스 종료 후 시험 폴더의 일시적 EPERM은 기존 경로 검증을 유지한 제한 재시도로 처리했다. 실패 로그를 삭제하지 않았다.

4. **32개 서비스/52 operation**: 기존 ID를 모두 보존했고 52개를 기존 adapter 경유로 실행해 capture를 대조했다. 서비스 응답 구조에 맞춘 합성 계약 시험이다. 독립적인 기관 실응답 specimen 52개를 확보·검증한 것은 아니다. [operation-matrix.json](operation-matrix.json)과 [api-registry.json](api-registry.json)은 이 차이를 분리한다. 공식 첨부 발견/지원 여부를 확인하지 않은 곳에 첨부 endpoint를 만들지 않았다. 안전 downloader는 HTTPS·지정 호스트/경로·공인 IPv4 DNS 고정·연결 주소 재검사·redirect 거부·스트림 한도·MIME/signature를 적용한다. IPv6·archive·OCR·활성 콘텐츠 실행은 지원하지 않는다. 해당 코드의 실제 인터넷 socket 시험 및 provider 첨부 자동 연결은 미검증이다.

5. **외부 전송·파생 통제**: 신규 provenance에는 정확한 evidence ID/version/hash 또는 서버가 기록한 입력 노드를 연결하고, 목적/제공자/기간별 grant·deny·revoke·release 사건을 보존한다. 같은 hash의 다른 자료·이전 파생물에 release를 자동 전파하지 않는다. 실제 AI/intake serialization, MCP 인수 생성, 신규 보호 collection prepare/worker에 경계를 연결했다. 토큰 준비 중 철회 후 네트워크 0회도 시험했다. host enforcement context는 UI/test flag와 독립이다. 아직 기존 digest 기반 v3 경로, 답변 재사용·export 전체의 자동 parent 해석, 교차 프로세스 철회와 I/O 사이 race를 모두 닫지는 못했다. 이미 전송된 바이트를 회수했다고 주장하지 않는다.

6. **S2/S3/S5와 수동 보완**: v4 bridge를 명시적으로 선택하면 질문/답변에 따라 후보를 고른다. 폐기물에는 수탁 후보를, 위험성평가에는 관련 후보를 연결한다. 미분류는 적합·비대상으로 처리하지 않는다. 기존 v3 trace는 archive하고 사람의 수정 버전을 자동 변환으로 덮지 않으며 충돌한 연결 승인을 재검토 대상으로 만든다. 기존 화면에서 가상 문서 업로드→질문→주제별 보류→문서 export trace를 시험했다. S2의 법적 지위 대체 경로·다른 시설·처분기간·현재량 누락, S3의 제출/접수/시정 및 과거 지연, S5의 양식만 존재·대표 요구 미확인·정기/수시평가를 분리했다. **A07/A08 원문에서 단일 case fact를 자동 구성해 독립 승인까지 이어지는 전과정은 미완료**다. 실제 사업장 사실 확인은 수행하지 않았다.

7. **정책 후보 수와 원문**: 원래 43개 ID와 추가 2개 ID를 분리했다. 기존 위험물 6개에 이어 위험성평가 5개+폐기물 수탁 1개를 독립 실행 후보로 작성하고, 대표 참여·공유 2개를 추가했다. 독립 합성시험 통과 수만 [policy-contracts.json](policy-contracts.json)의 실행 후보에 반영한다. 실제 분야 승인·사업장 검증·운영 활성화는 모두 0이다. 효과 확인은 독립 법률 위반 근거가 미확정된 내부 설계로 보류한다. 각 후보의 날짜는 법적 profile 미확정 gate가 남아 있으므로 실제 적용에 사용할 수 없다.

   무인증 공식 공개 페이지에서 [산업안전보건법 제36조](https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=283449&joNo=0036&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR), 시행규칙 제37조·제37조의2~4, 폐기물관리법 제18조·시행규칙 제16조의12의 HTML 7건을 수집했다. 출처·hash·수집 시각은 [official-sources.json](official-sources.json)에 있다. 실제 시행일·부칙·고시 전문·별지 제5호·하위 참조 대상 및 결정 셀은 [legal-version-graph.json](legal-version-graph.json)의 미완료 항목이다. 법령 전체 표제 시행일을 개별 조문 시행일로 자동 복사하지 않는다. 행정예고는 현행 규칙으로 활성화하지 않는다.

8. **백업·미완료 종료조건**: 신규 v4 보호자료 계층은 암호화 백업, 영역/키 검증, 복원 실패 rollback, 과거 grant 이력 유지와 현재 거부 상태를 시험했다. **전체 앱 백업이 아니다.** v2/v3 자료·작업 상태까지 통합한 원자 복원, concurrent restore/crash/공유파일/junction/ADS/fsync 검증은 남아 있다. queue TTL은 현재 모의 설정이며 법정 보존기간이 아니다. 운영 키·OS 권한·키 회전은 실제 자료로 검증하지 않았다. 분야별 원문/표본 확보와 사용자 승인/실제 자료 없이는 닫을 수 없는 항목을 삭제하지 않았다.

9. **동결·금지 준수**: 프론트/shared/public/index/Vite/package/lockfile 및 운영 dist의 29개 동결 파일을 hash로 확인한다. UI/UX·문구 템플릿·메뉴·모델 선택·기존 동선을 수정하지 않았다. 운영 4317 접속, `.local` 접근, 실제 인증키 사용, 운영 재시작/배포/규칙 활성화는 하지 않았다. 모든 서버와 브라우저 시험은 격리 DB·임의 포트·숨김 실행 경로다. 현재 운영 화면에는 이번 변경이 배포되지 않았다.

10. **다음 묶음**: 먼저 provider별 첨부 원문 발견→안전 다운로드→허용된 로컬 parser 연결, 52 operation별 공식 specimen, S2 원문→case fact 매핑, 전체 보호 백업 복원을 닫아야 한다. 법적 검증은 위험성평가 개정 부칙/고시 및 폐기물 조건부 대상/별지 제5호부터 진행한다. 교육 5→안전관리자 6→안전검사 5→위험물/환경 잔여는 기존 미구현 후보로 유지한다. 기존 72개 인수 항목과 새 시험을 함께 보존하며, 전문가 정답셋·실제 사업장·live 지표는 분모 0과 null로 표시한다.

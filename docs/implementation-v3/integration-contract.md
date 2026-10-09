# v3 격리 연결 계약

범위: 첨부 통합본의 부록 v3를 한 번 적용한다. 본문은 조사·정정 참고자료다. 실제 사업장·실사용자 승인·운영 적용은 포함하지 않는다. 이전 v2 보고서는 덮어쓰지 않는다.

## 기존 입력과 새 객체

| 기존 데이터 | v2/v3 연결 | 유지하는 한계 |
|---|---|---|
| review/request | review ID별 6개 decision, 기준일, 평가 창 | 사업장·시설·장소는 `unidentified`; 주소 입력으로 실제 현장을 확인했다고 표시하지 않음 |
| facts | 원래 값·provenance를 보존한 fact | confirmed·userAttested·legacy verification을 입증 승인으로 승격하지 않음. 초기 truth는 unknown |
| document | 해시 대조한 실제 원본 → evidence | claims는 비어 있음. 실제 효력기간 대신 평가 창이라는 제한 기록. 별도 증빙·사실 검토 필요 |
| evidence/citation | source 및 원래 본문·버전·시행일·URL | legacy verified와 새 source 승인은 별개. 결정적 셀 확인을 추정하지 않음 |
| 기존 rule/approved/reviewer | legacy 객체에 원문 보존, 새 후보 정책과 별도 | 이전 rule의 임의 술어를 실제 승인 정책으로 자동 이식하지 않음. 일반 rule 변환기는 미구현 |
| review issues | 기존 세 category로 projection | 내부 outcome·approval·holds·scope는 trace에 보존 |
| 문서 내보내기 | 기존 conditions에 평가 ID·버전·기준일·승인 여부 | UI 및 export 템플릿은 변경하지 않음. 현재 실무자 신원 연동은 미완료 |

변환 기록은 `v3_legacy_links`에 legacy 원문·내용 해시·대상 ID/버전/해시·변환기 버전·미매핑 이유를 저장한다. 동일 자료 재변환은 버전을 늘리지 않고, 변경된 자료는 새 버전을 만든다. 가상 시험의 체크 표시를 실제 승인으로 가져오지 않는다.

`createApp`의 네 번째 인수로 명시한 격리 가상 환경에서만 bridge와 관리 연결을 등록한다. 기본 entrypoint는 이 인수를 제공하지 않는다. 운영 DB 마이그레이션을 실행하지 않았다. 원래 로컬 화면은 다중 tenant 인증 UI가 아니며, 가상 관리 API의 권한 시험을 실제 다중 사용자 배포 완료로 해석하지 않는다.

## 날짜와 시각

- 날짜와 timestamp, 시간대, closed/half-open, 열린 종료/미확인 종료를 구분한다.
- 날짜 경계만 하루 변환한다. timestamp의 closed/half-open 변경은 자동 변환하지 않는다.
- 열린 날짜 종료를 기준일로 자를 때 `assessmentWindow=true`와 원래 열린 값을 보존한다. 미확인 종료는 미매핑으로 남긴다.
- 기존 비교의 AC06/07/08 회귀시험과 V3-P01~03은 별도다. 기존 모든 산정 기준을 새 fact scope로 완전히 자동 이식한 것은 아니다.
- 월·연 계산은 실제 산입 시작일을 기준으로 해당일 전일 또는 해당일 없는 달의 말일을 계산한다. 이번에 월말 초일 제외 후 다음 달 1일로 기산일이 이동하는 경우를 수정했다.
- 법적 기간 성격·특별규정·휴일 달력·검토가 미확정이면 `unknown`. `synthetic_approved`는 실제 영역에서 사용할 수 없다.

## 판단과 승인

fulfilled/out_of_scope는 내부 outcome이며 기존 human_review 표시와 구분한다. 승인·적합·위반을 하나의 boolean으로 합치지 않는다. 허가증 미제공, 공개 조회 0건, 과거 회신, 문서 미제공은 불이행 입증이 아니다.

6개 정책은 서로 다른 적용·이행·불이행 fact key를 사용한다. 재선임 30일, 신고 14일, 대리 지정, 대행기간 상한, 기록 보존, 결과 제출을 분리한다. 정책 자체의 미확인 조건과 실제 증빙이 남으면 명확한 리스크를 출력하지 않는다.

bridge 오류가 발생하면 안전한 자료 보완 분류로 낮추고 오류 사유를 남긴다. legacy 확정 위반으로 우회하지 않는다. shadow 결과에는 이전 category와 차이 이유가 보존된다.

## 아직 연결하지 않은 내용

일반 legacy rule→실제 policy 자동 변환, 전체 사건 날짜의 자연어 정규화, 실사업장 동일성, 사람이 보완한 fact와 재변환 결과의 병합 정책, 37개 추가 정책의 실행 구현, 원문·별표·부칙·지자체 위임 전체 적용 검토는 남아 있다. 자료가 없다는 이유로 이 항목을 삭제하거나 완료로 바꾸지 않는다.

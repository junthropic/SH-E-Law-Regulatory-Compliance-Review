# 외부 연결 운영

## 법제처

[국가법령정보 공동활용](https://open.law.go.kr/LSO/openApi/guideList.do)에서 필요한 API의 이용 조건과 승인 범위를 확인하고 OC를 발급받습니다. 로컬 앱의 OC와 GitHub Actions Secret은 각각 설정합니다. 출력 로그와 공개 원문 URL에 OC를 남기지 않습니다.

수집 경로:

- 국가법: `lawSearch.do?target=eflaw`, 시행일 기준 본문 `lawService.do?target=eflaw&MST=...&efYd=...`
- 자치법규: `target=ordin`, 현행 및 연혁 페이지 순회, MST로 전문 조회
- 행정규칙: `target=admrul`, ID로 전문 조회
- 별표: 원문 응답이 제공하는 law.go.kr 파일 링크

2026-10-03에 사용자가 로컬 OC 및 GitHub LAW_OC Secret을 설정했고 첫 실수집을 시작했습니다. 출처별 완료 결과는 재검토 기록을 확인하세요. 승인 범위 부족, API 응답 변경, 키워드 검색 누락은 실패/미확인으로 남깁니다. 자치법규 API의 별표 제공 범위가 제한되어 별표가 없는 응답만으로 전체 원문의 완전성을 승인하지 않습니다.

## ChatGPT 구독 OAuth

OpenAI의 OSS Sign in with ChatGPT 흐름을 사용합니다. 최초 요청의 `dynamic_agent_client`, 설치별 `ext_agent_host_id`, callback의 발급 client ID를 처리합니다. loopback callback은 `http://127.0.0.1:4317/auth/callback`입니다. 시크릿이 없는 PKCE public client이며 로그인은 공식 인증 페이지에서 사용자가 직접 진행합니다.

보관하는 access/refresh/id token은 `.local/chatgpt.dpapi`에 Windows 사용자별로 보호됩니다. scope와 모델은 실제 계정 응답으로 확인합니다. `/v1/models`의 표시 가능한 모델만 선택하고 `/v1/responses`를 `store:false, stream:true`로 호출합니다. `response.completed` 전에 끊긴 스트림, 한도 초과, 실패/미완료 이벤트는 완료된 법률 검토로 처리하지 않습니다. 결제수단이나 API 키로 자동 우회하지 않습니다.

일부 샌드박스·서비스 계정에서는 Windows DPAPI 사용자 프로필이 없어 저장이 실패합니다. 평문 파일로 전환하지 않습니다. 일반 로그인 사용자 환경에서 다시 실행하거나, `.env`에 `SHE_EPHEMERAL_AUTH=1`을 명시해 인증값을 **현재 프로세스 메모리에만** 보관할 수 있습니다. 이 모드는 서버 종료 후 OC와 ChatGPT를 다시 연결해야 하며 화면에 '세션 한정'으로 표시합니다. 2026-10-03 일반 Windows 사용자 프로필 및 Windows CI에서 실제 암호화 파일 저장·새 인스턴스로 복호화·삭제 시험을 통과했습니다.

이 기능은 제공자의 프리뷰 범위와 계정 권한에 따라 달라질 수 있습니다. 실제 사용자 로그인을 대신 실행하지 않았습니다. 환경이 바뀌면 `docs/references.md`의 공식 문서로 파라미터와 권한을 재확인합니다.

## 국민신문고

**기본 상태는 비활성**입니다. 본인 계정이라는 이유만으로 자동 접근을 허용하지 않습니다. 이용약관의 사전 승낙 조건을 반영해 `PetitionConfigSchema`가 운영기관 승낙 식별자·유효기간·승인 범위·검증된 사이트 구조를 요구합니다.

승낙 전에는 보유 회신을 자료함에 업로드하거나 공식 사이트를 직접 열어 사용합니다. 개인 민원 원본과 추출문은 Git에 올리지 않습니다.

승낙 이후 연결 순서:

1. 실제 허용 범위가 공개 사례인지 본인 민원인지 기록합니다. 운영기관 승낙 자료를 로컬로 보관합니다.
2. 허용된 페이지에서 개발자가 제목·질의·답변·기관·회신일·다음 페이지 선택자를 직접 확인합니다. 기본 선택자는 추측하여 넣지 않았습니다.
3. 아래 구조의 JSON에 검증한 값만 넣어 로컬 파일로 저장합니다. `.local` 경로를 권장합니다.
4. 앱의 **검토자 확인과 승인된 연결 → 국민신문고 사전 승낙 후 연결**에서 등록합니다.
5. 열린 독립 Edge 창에서 직접 로그인합니다. CAPTCHA·공동인증서·추가 인증을 자동 우회하지 않습니다.
6. **직접 로그인 완료 · 수집**으로 허용된 페이지를 읽고 결과를 자료함에서 확인합니다.

```json
{
  "permissionReference": "운영기관의 실제 승낙 문서 식별자",
  "permissionExpiresAt": "실제 만료시각 ISO 8601",
  "approvedBy": "승낙한 운영기관",
  "permittedScope": "own",
  "loginUrl": "https://www.epeople.go.kr/실제승인된로그인주소",
  "listUrl": "https://www.epeople.go.kr/실제승인된목록주소",
  "selectorVersion": "현장 검증 버전",
  "selectorsVerifiedAt": "실제 검증시각 ISO 8601",
  "selectors": {
    "loggedIn": "검증한 선택자",
    "items": "상세화면 링크 선택자",
    "next": "다음 페이지 선택자",
    "title": "제목 선택자",
    "question": "질의 선택자",
    "answer": "답변 선택자",
    "agency": "기관 선택자",
    "responseDate": "회신일 선택자"
  },
  "maxPages": 5,
  "delayMs": 3000
}
```

위 예시는 **실행 가능한 사이트 설정이 아닙니다**. 승낙을 대신하는 자료도 아닙니다. 현재 드라이버의 네트워크는 `https://www.epeople.go.kr`로 제한됩니다. 인증에 외부 SSO 도메인이 필요하거나 목록이 팝업·첨부 위주인 경우에는 승인 범위를 확인한 별도 드라이버 수정·시험이 필요합니다. 공개 API의 정확한 승인 endpoint도 아직 확정하지 않았으므로 가상의 API URL을 탑재하지 않았습니다.

공개 사례도 이 버전에서는 로컬 문서로만 보관합니다. 주민번호 등 패턴 제거가 되더라도 민원 전체를 자동으로 공개 Git 데이터로 전환하지 않습니다.

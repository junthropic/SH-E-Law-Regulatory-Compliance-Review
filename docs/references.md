# 확인한 공식 자료

확인일: 2026-10-02. 기능 범위를 결정한 기술 자료이며 법률 의견 자체가 아닙니다.

| 자료                                                                                                       | 사용 목적                                                             |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [국가법령정보 공동활용 API 목록](https://open.law.go.kr/LSO/openApi/guideList.do)                          | 법령·조례·행정규칙·연혁·연계·기관 해석례 제공 범위                    |
| [자치법규 목록 API](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=ordinListGuide)             | `nw=1` 현행, `nw=2` 연혁, 페이지·기관 필드                            |
| [시행일 기준 본문 API](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdInfoGuide)         | `eflaw`, MST와 실제 시행일 지정                                       |
| [Korean Law MCP](https://github.com/chrisryugj/korean-law-mcp)                                             | 4.15.5 소스·라이선스·도구 확인; 긴 조례의 TOC 반환과 전문 저장의 구분 |
| [국민신문고 이용약관](https://www.epeople.go.kr/nep/gdnc/TermsConditions.npaid)                            | 자동 접근·수집의 사전 승낙 조건                                       |
| [Sign in with ChatGPT 등록과 로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) | 동적 OSS client, loopback, PKCE·scope·state·nonce                     |
| [계정과 세션](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)          | 사용자 계정·로그아웃·계정 일치 처리                                   |
| [모델과 추론](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)           | 구독 사용 모델 목록과 Responses                                       |
| [프리뷰 제한](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)            | `store:false`, 스트리밍, 지원하지 않는 파라미터                       |
| [토큰 레퍼런스](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)              | refresh token 교체·만료·scope 필드                                    |

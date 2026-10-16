# Microsoft Store 제출 체크리스트 (사용자가 직접 진행)

Microsoft 계정 로그인, Partner Center 입력, 업로드, 제출 버튼은 모두 사용자가 직접 한다. Claude Code는 자료와 패키지만 준비한다.

표시: ✅ 끝남 · ⬜ 사용자가 할 일 · 🛠 Claude Code가 할 일(사용자가 값을 알려준 뒤)

## A. 제출 전에 정할 것

| # | 할 일 | 상태 |
|---|---|---|
| A1 | Partner Center 개인 개발자 등록 | ✅ |
| A2 | 앱 이름 예약, 패키지 정보(Name·Publisher·PublisherDisplayName) 받아 전달 | ✅ 매니페스트 반영(#23) |
| A3 | Partner Center 이름 관리에서 "한국 환경안전보건관리자 법률조회 프로그램" 추가 예약 확인. 기존 영문 이름과 내부 ID는 유지 | ✅ 2026-10-15 |
| A4 | **보안 검증 계획 진행 여부 결정.** `security-review-plan.md`의 H1(같은 PC의 다른 사용자·프로세스가 로컬 서버에 접근, 2026-10-15)과 H7(환경 변수·PATH 하이재킹, 2026-10-16)은 코드에서 고쳤고 자동 시험이 있다. 설치 시험·WACK는 바뀐 코드로 아직 다시 돌리지 않았다(B2). 남은 결정: ① 계획의 나머지 항목(H2~H6, H8~H13, U1~U11) 검증 진행 여부 ② H1의 토큰 없는 경로를 설치판에서 막을지(계획 8.5절) ③ 여러 Windows 사용자 실기기 시험(계정 생성 필요) 승인. ④ 적대적 검토 지적 F-01(인코딩된 `/api` 접두어로 인증 우회, 치명)·F-03(업로드 파서 격리)·F-04(설치판 평문 백업)는 고쳤다(계획 9절, V8-X09·X10·W01·W02). 나머지 지적 F-02, F-05~F-15는 결정 전이다(`.local/security-review/report.md`). 남는 위험은 계획 8.6절에 적었고, 수용 여부는 정하지 않았다 | ⬜ |
| A5 | 문의용 메일: `yourmissionisours@gmail.com` (사용자 지정) | ✅ 2026-10-15 |
| A6 | `privacy-policy.html`을 로그인 없이 열리는 공개 페이지에 게시 → URL 알려주기 | ✅ https://sites.google.com/view/korean-sh-e-program-privacy/ , 시행일 2026-10-16. ⬜ 저장소 문서의 "대상 버전"을 0.8.1.0으로 바꿨다(2026-10-16 사용자 결정). 게시된 페이지도 같은 값으로 고쳐야 한다 |

## B. 최종 패키지 만들기 (A3~A6 값을 받은 뒤)

| # | 할 일 | 상태 |
|---|---|---|
| B1 | 새 예약 이름과 문의 메일 반영. 게시 주소·시행일 채우기 | ✅ 문서에 `TODO_PRIVACY_URL`·`TODO_EFFECTIVE_DATE` 없음 |
| B2 | 🛠 main 최신에서 `msix.yml`을 돌려 Store용 MSIX(`SHELaw-Beta_<버전>_x64_store.msix`, 서명 없음)를 만들고, 같은 실행에서 설치 시험·WACK·패키지 검사기 결과를 확인한다. 지금 있는 산출물(run 38553954580)은 #24(갱신 주기 안내) 이전 코드라 **업로드에 쓰지 않는다** | ⬜ |
| B3 | 🛠 버전 번호 결정: 같은 버전으로 다시 올릴 수 없으므로, 업로드 후 고치면 `identity.json`의 `version`을 올린다. 마지막 자리는 0이어야 한다 | ✅ 0.8.1.0(2026-10-16). `msix.yml` 파일 이름, 실행기 `app.manifest`, 개인정보 처리방침 "대상 버전"도 함께 바꿨다 |
| B4 | B2 산출물을 내려받기(GitHub Actions → 해당 실행 → Artifacts) | ⬜ |

## C. Partner Center 입력 (제출 화면 순서대로)

| # | 화면 | 넣을 값 | 자료 |
|---|---|---|---|
| C1 | 가격 및 사용 가능 여부 | 판매 지역 대한민국만, 무료, 공개 범위 "공개 대상 + 직접 링크로만"(또는 비공개 대상) | `store-listing.md` 7절 |
| C2 | 속성 | 카테고리(비즈니스 → 법률 및 인사, 없으면 생산성), 개인정보 처리방침 URL, 지원 연락처, 시스템 요구 사항 | `store-listing.md` 5·7절 |
| C3 | 연령 등급 | IARC 질문지 | `store-listing.md` 6절 |
| C4 | 패키지 | B4의 `.msix` 업로드. 장치 패밀리 Windows 데스크톱만 | — |
| C5 | Store 등록 정보(한국어) | 짧은 설명, 상세 설명, 주요 기능, 검색어, 스크린샷 6장, 저작권 | `store-listing.md` 2~5절, `screenshots/` |
| C6 | 제출 옵션 → 인증 참고 사항(Notes for certification) | 아래 D1 문안 | 이 문서 D절 |
| C7 | 제한된 기능 사유(`runFullTrust`) | 아래 D2 문안 | `../stage4-msix.md` 7절 |
| C8 | 제출 | 사용자가 직접 누른다 | — |

## D. 붙여넣기 문안

### D1. 인증 참고 사항 (영문, 인증 담당자용)

> This is a beta desktop app (MSIX, full trust). When launched from the Start menu it starts a local web server bound to 127.0.0.1 and opens it in the default browser; there is no separate window. The first launch can take a few minutes (about 2-3 minutes was observed on a Windows CI runner) because it prepares the bundled public law data; later launches take a few seconds. Please use the browser tab that the app opens (or "화면 열기" on the notification-area icon); typing the local address by hand is refused by design. The notification-area icon also lets the user quit the app ("종료"). No account, sign-in or API key is needed to open the app and browse the screens; data collection from public law APIs needs the user's own free API keys and is optional. AI analysis is off by default. To test: launch the app, wait for the browser to open, choose "법률 조회", type a question such as "안전관리자 선임 검토" and press "검토 시작".

### D2. `runFullTrust` 사유

`../stage4-msix.md` 7절의 한국어·영어 문안을 그대로 쓴다.

## E. 인증 거절 시 흔한 이유와 대응

거절 통보에는 정책 번호와 이유가 적혀 온다. 그 번호를 Claude Code에 그대로 전달하면 해당 부분을 고친다.

| 흔한 이유 | 이 앱에서 해당할 수 있는 점 | 대응 |
|---|---|---|
| 앱이 실행되지 않거나 멈춘 것처럼 보임 | 첫 실행 준비에 몇 분 걸림, 화면이 별도 창이 아니라 브라우저에서 열림 | D1 문안에 첫 실행 시간과 브라우저로 열린다는 점을 적었다. 그래도 거절되면 첫 실행 시간을 줄이는 작업을 한다 |
| 개인정보 처리방침 없음·접속 불가 | 인터넷 연결을 쓰므로 처리방침 URL이 필요 | A6 URL이 로그인 없이 열리는지 확인 |
| 설명과 실제 기능이 다름 | 설명에 확인 안 된 기능이 들어간 경우 | 등록 문구는 시험으로 확인한 내용만 썼다. 지적된 문장을 고친다 |
| 제한된 기능 사유 부족 | `runFullTrust` | D2 문안 보강 |
| 미완성·베타 앱으로 보임 | "베타" 표시와 보류 결과 | 공개 범위를 비공개 대상으로 바꾸거나, 지적 내용에 맞춰 설명을 보강한다 |
| WACK 실패 | 선택 시험 2건 FAIL(차단된 실행 파일, 압축 파일 사용) | 필수 시험은 모두 통과. 사유는 `../stage4-msix.md` 12.3절. 지적되면 그 내용으로 답하거나 해당 부분을 바꾼다 |
| 연령 등급·카테고리 부적절 | — | 지적대로 바꾼다 |
| 같은 버전 재업로드 | — | B3대로 버전을 올린다 |

## F. 제출 후

- 인증 통과 후 Store 링크(`https://apps.microsoft.com/detail/<제품 ID>`)를 받으면 알려준다 → 🛠 베타 설치 안내의 `TODO_STORE_LINK`를 채운다.
- 베타 사용자에게는 `beta-guide.md`(설치 안내·데이터 처리·한계·문의 방법)를 전달한다.

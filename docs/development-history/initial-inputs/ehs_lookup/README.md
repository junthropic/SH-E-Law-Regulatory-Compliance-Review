# ehs_lookup: EHS 법령·조례·해석례·민원 Q&A 조회 파이프라인

환경안전보건 담당자의 서류·법률 검토용 **조회 전용** 레퍼런스 코드입니다. Python 3.10 이상, 표준 라이브러리만 사용합니다.

```
법 조항 ─▶ 위임(시행령·시행규칙·고시·조례) ─▶ 시·도 조례 조문 원문 ─▶ 해석례 ─▶ 국민신문고 Q&A
```

## 1. 키 준비
| 키 | 발급처 | 용도 | 비고 |
|---|---|---|---|
| `LAW_OC` | open.law.go.kr > OPEN API 신청 (이메일 ID가 OC 값) | 법령, 조례, 위임, 해석례, 판례 등 | 개발 중에는 `OC=test`로도 호출됨. 운영 시 본인 OC와 서버 IP/도메인 등록 필요 |
| `DATA_GO_KR_KEY` | data.go.kr > "국민권익위원회_민원정책 질의응답조회서비스" 활용신청 | 국민신문고 민원·정책 Q&A API | 개발계정 자동승인, 일 10,000건 |

파일데이터(국민신문고 원문 CSV, 노동포털 질의회시 CSV)는 키가 필요 없습니다. `--download` 옵션으로 자동으로 받습니다.

## 2. 실행
```bash
set LAW_OC=본인OC            # mac/linux: export LAW_OC=...
set DATA_GO_KR_KEY=포털인증키   # 없으면 로컬 CSV만 검색
python run_trace.py --law 위험물안전관리법 --jo 4 --region 경기도 --download
python run_trace.py --law 산업안전보건법 --jo 114 --kw 물질안전보건자료 게시
python run_trace.py --law 폐기물관리법 --jo 17 --region 강원 --kw 지정폐기물
```
결과는 `out/{법령}_제{조}조_{지역}.md`와 `.json`으로 저장됩니다. 예시 결과는 `out/` 폴더에 있습니다.

캐시: 환경변수 `EHS_CACHE_DIR=./cache`를 지정하면 응답을 파일로 캐시해서 같은 조회를 반복할 때 호출량을 줄입니다.

## 3. 단계별 API
| STEP | 내용 | API (law.go.kr DRF) | 핵심 파라미터 |
|---|---|---|---|
| 1 | 법령 식별 | `lawSearch target=law` | query=법령명 → 법령ID, MST, 소관부처 |
| 2 | 조문 원문 | `lawService target=eflaw` | ID, JO=6자리(000400=제4조, 000502=제5조의2) |
| 2+ | 조·항·호·목 단위 | `lawService target=eflawjosub` | JO, HANG, HO, MOK |
| 3 | 위임관계 | `lawService target=lsDelegated` | ID → 조문별 시행령·시행규칙 조문, 위임 행정규칙, 위임 자치법규 |
| 3+ | 3단 비교 | `thdCmp` | 법·령·규칙 대조 |
| 3+ | 고시·별표 | `admrul`, `licbyl`, `admbyl` | 행정규칙(고시) 본문, 법령 별표(예: 위험물 및 지정수량) |
| 4 | **법 조문 → 조례 조문** | `lawSearch target=lnkLsOrdJo` | knd=법령ID, JO=4자리(0004), JOBR → 전국 시·도, 시·군·구 연계 조례 조문 |
| 4 | 조례 본문 | `lawService target=ordin` | MST=자치법규일련번호 → 조문별 원문, 별표 |
| 4+ | 조례 검색, 별표 | `ordin`(org=시도코드, search=2 본문), `ordinbyl` | 연계 데이터가 없는 조례 보완 |
| 5 | 부처 1차 해석 | `{moel,me,nfa,mois,molit,motie,mohw,kdca}CgmExpc` | query, search=2(본문) → 상세: 질의요지/회답/이유/관련법령 |
| 5 | 법제처 해석례 | `expc` | query, search=2 |
| 5+ | 판례·행정심판·결정문 | `prec`, `decc`, `acr`, `iaciac`, `ecc` | |
| 6 | 국민신문고 Q&A | data.go.kr `CivilPolicyQnaService/PolicyQnaList`, `PolicyQnaItem` | keyword, searchType=2, type=3 → 상세에 lwrdNm(법령명), fullName(법령 조문) |
| 6 | 공개민원 원문 | 파일 15164540 (CSV) | 제목, 질문내용, 답변내용, 기관명, 부서명 |
| 6 | 노동부 질의회시 | 파일 15167750 (CSV, CP949) | 질의제목, 질의, 회시, 문서번호 |

## 4. 구현 시 주의 (실제 응답에서 확인한 사항)
- law.go.kr은 결과가 1건이면 리스트가 아니라 dict를 돌려줍니다. `as_list()`로 정규화하세요.
- 응답의 최상위 키가 target마다 다릅니다. 예: `LawSearch.law`, `lnkOrdJoSearch.law`, `OrdinSearch.law`, `Expc.expc`, `CgmExpc.cgmExpc`, `AdmRulSearch.admrul`, `licBylSearch.licbyl`, `LawService`(조례 본문), `CgmExpcService`/`ExpcService`(해석 상세).
- **JO 형식이 API마다 다릅니다.** eflaw는 6자리(조 4자리 + 가지 2자리), lnkLsOrdJo는 4자리 + JOBR입니다.
- 부처 해석 상세의 `관련법령` 필드가 비어 있는 경우가 많습니다. 그래서 본문 키워드로 모은 뒤 법령 핵심어와 키워드로 연관도를 걸러야 합니다(`pipeline.py` STEP 5).
- 조례 본문의 `조내용`에 `&#8729;` 같은 HTML 엔티티와 `<table><img>` 태그가 섞여 있습니다. 별표나 표는 `별표` 노드나 `ordinbyl`의 파일 링크로 받으세요.
- 권익위 Q&A 키는 "Decoding" 키를 넣으면 코드에서 URL 인코딩합니다.
- 부처 해석 DB는 규모가 다릅니다(2026.10 기준 고용노동부 약 9,600건, 기후에너지환경부 약 2,400건, 소방청 약 800건). 목록은 가나다순으로 오므로 코드에서 연관도 점수로 다시 정렬합니다. 해당 주제의 해석이 적으면 본문에 키워드만 언급된 건이 상위에 올라올 수 있습니다(예: 폐기물관리법 지정폐기물).
- `lsDelegated`의 '인용법령'은 조문 안에서 다른 법을 인용한 것이지 위임이 아닙니다. 실제 위임은 '시행령/시행규칙/위임행정규칙/자치법규'만 보면 됩니다.
- 연계 조례가 0건이면 해당 조문은 조례 위임이 없는 것입니다(예: 산안법 제114조). 다만 연계 데이터가 누락된 조례가 있을 수 있어서 `search_ordinance(query, sido, body=True)`로 보완 검색하세요.

## 5. 바이브코딩 확장 아이디어
- 조문 → 체크리스트 자동 생성: STEP 2·4의 `exceptions`(다만/제외/불구하고/그러하지 아니하다)를 "적용 예외 확인 항목"으로 변환
- 사업장 프로필(소재지, 취급물질·수량, 업종) → 대상 법령·조문 매핑 테이블 → `trace()` 일괄 실행
- `lsJoHstInf`(조문별 변경이력), `oldAndNew`(신구법)로 개정 알림
- LLM에는 `to_markdown()` 결과를 근거 문서로 넣고, 답변에 조문과 링크를 인용하도록 프롬프트 구성

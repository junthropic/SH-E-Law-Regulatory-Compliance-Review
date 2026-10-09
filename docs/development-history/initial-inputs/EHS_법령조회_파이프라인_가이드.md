# EHS 법령·조례·해석례·민원 Q&A 조회 파이프라인 가이드

환경안전보건 담당자의 서류·법률 검토 업무용 바이브코딩을 위한 **조회 전용** 자료 모음입니다. 조사·검증일: 2026-10-04

- 함께 제공: `EHS_법령조회_API_카탈로그.xlsx`(같은 카탈로그의 엑셀판), `ehs_lookup.zip`(파이썬 코드와 예시 결과)
- 구성: 1. 요약 / 2. 키 준비 / 3. 파이프라인 단계별 API / 4. 실증 결과 / 5. 구현 시 주의사항과 한계 / 6. 카탈로그(법령정보 API, data.go.kr 오픈API, 파일데이터) / 부록 A. 실행 방법 / 부록 B. 전체 코드

## 1. 요약

- "법 조항 → 위임(시행령·시행규칙·고시·조례) → 조례 조문 원문 → 해석례 → 국민신문고 Q&A" 순서로 조회하는 파이썬 코드를 만들고, 세 가지 법령으로 실제 데이터를 받아 끝까지 돌려봤습니다.
- 조회용 API·파일데이터 총 162개: 국가법령정보 Open API(law.go.kr) 87개, data.go.kr 오픈API 46개, data.go.kr 파일데이터 29개
- 핵심 기능: 법 조문 번호만 넣으면 17개 시·도 조례의 해당 조문이 한 번에 나옵니다(법령-자치법규 연계 조회 `lnkLsOrdJo`).
- 권익위 Q&A 상세(`PolicyQnaItem`)에는 관련 법령명(`lwrdNm`)과 조문(`fullName`)이 들어 있어 법 조항과 바로 연결할 수 있습니다.
- 조문과 조례에서 "다만", "제외", "불구하고", "그러하지 아니하다" 같은 예외·단서 문구를 자동으로 뽑아 보여줍니다.

## 2. 키 준비

| 키 | 발급처 | 용도 | 비고 |
|---|---|---|---|
| `LAW_OC` | open.law.go.kr > OPEN API 신청(이메일 ID가 OC 값) | 법령, 조례, 위임, 해석례, 판례 등 | 개발 중에는 `OC=test`로도 호출됨(이번 검증도 test로 수행). 운영 시 본인 OC와 서버 IP/도메인 등록 필요 |
| `DATA_GO_KR_KEY` | data.go.kr > "국민권익위원회_민원정책 질의응답조회서비스" 활용신청 | 국민신문고 민원·정책 Q&A API | 개발계정 자동승인, 일 10,000건. **키가 없어 실제 호출은 못 했고 공식 명세서대로 구현** |
| (없음) | data.go.kr 파일데이터 | 국민신문고 공개민원 CSV, 노동포털 질의회시 CSV | 로그인·키 없이 다운로드. 코드의 `--download` 옵션으로 자동 수집(약 40MB) |

## 3. 파이프라인 단계별 API

```
법 조항 ─▶ 위임(시행령·시행규칙·고시·조례) ─▶ 시·도 조례 조문 원문 ─▶ 해석례 ─▶ 국민신문고 Q&A
```

| STEP | 내용 | API | 핵심 파라미터 / 결과 |
|---|---|---|---|
| 1 | 법령 식별 | law.go.kr `lawSearch target=law` | query=법령명 → 법령ID, MST, 시행일자, 소관부처 |
| 2 | 조문 원문 | `lawService target=eflaw` | ID, JO=6자리(000400=제4조, 000502=제5조의2) → 조문, 항·호·목 텍스트 |
| 2+ | 조·항·호·목 단위 | `lawService target=eflawjosub` | JO, HANG, HO, MOK |
| 3 | 위임관계 | `lawService target=lsDelegated` | ID → 조문별 시행령·시행규칙 조문, 위임 행정규칙(고시), 위임 자치법규 |
| 3+ | 법·령·규칙 대조 | `thdCmp`(3단 비교) |  |
| 3+ | 고시·별표 | `admrul`, `licbyl`, `admbyl` | 행정규칙(고시) 본문, 법령 별표(예: 위험물 및 지정수량) |
| 4 | **법 조문 → 조례 조문** | `lawSearch target=lnkLsOrdJo` | knd=법령ID, JO=4자리(0004), JOBR=가지번호 → 전국 시·도, 시·군·구 연계 조례 조문 |
| 4 | 조례 본문 | `lawService target=ordin` | MST=자치법규일련번호 → 조문별 원문, 별표 |
| 4+ | 조례 검색·별표 | `ordin`(org=시도코드, search=2 본문), `ordinbyl` | 연계 데이터가 없는 조례 보완 검색 |
| 5 | 부처 1차 해석 | `{moel,me,nfa,mois,molit,motie,mohw,kdca}CgmExpc` | query, search=2(본문) → 상세: 질의요지/회답/이유/관련법령 |
| 5 | 법제처 해석례 | `expc` | query, search=2 |
| 5+ | 판례·행정심판·결정문 | `prec`, `decc`, `acr`, `iaciac`, `ecc` |  |
| 6 | 국민신문고 Q&A | data.go.kr `CivilPolicyQnaService/PolicyQnaList`, `PolicyQnaItem` | keyword, searchType=2, type=3 → 상세에 lwrdNm(법령명), fullName(법령 조문) |
| 6 | 국민신문고 공개민원 원문 | 파일 15164540 (CSV, UTF-8) | 제목, 질문내용, 답변내용, 기관명, 부서명 |
| 6 | 고용노동부 질의회시 | 파일 15167750 (CSV, CP949) | 질의제목, 질의, 회시, 문서번호 |

부처 1차 해석 target 대응: 고용노동부 `moelCgmExpc`, 기후에너지환경부 `meCgmExpc`, 소방청 `nfaCgmExpc`, 행정안전부 `moisCgmExpc`, 국토교통부 `molitCgmExpc`, 산업통상부 `motieCgmExpc`, 해양수산부 `mofCgmExpc`, 보건복지부 `mohwCgmExpc`, 질병관리청 `kdcaCgmExpc`, 식품의약품안전처 `mfdsCgmExpc`, 법제처 `molegCgmExpc`

### 권익위 민원정책 질의응답조회서비스 명세(공식 참고문서 기준)

- 목록: `http://apis.data.go.kr/1140100/CivilPolicyQnaService/PolicyQnaList`
  - 요청: serviceKey(필수), firstIndex(필수), recordCountPerPage(필수), type(1:민원, 2:정책, 3:민원+정책), keyword, searchType(1:제목, 2:내용), regFrom, regTo(yyyyMMdd)
  - 응답: resultCode, resultMessage, resultCount, resultList[faqNo, title, ancName, ancCode, regDate, dutySctnNm(tqapttn:민원, tqaplcy:정책)]
- 상세: `http://apis.data.go.kr/1140100/CivilPolicyQnaService/PolicyQnaItem`
  - 요청: serviceKey, faqNo, dutySctnNm
  - 응답 resultData: faqNo, dutySctnNm, qnaTitl(제목), qstnCntnCl(질의내용), ansCntnCl(답변내용), ancName, deptName, regDate, ancCode, deptCode, fullName(법령전체명·조문), lwrdNm(법령명), subjectNo, subjectName, subjectCont

## 4. 실증 결과

| 조회 | 조문 제목 | 위임 | 하위법령 조문 | 연계 조례(전국) | 본문 조회 조례 / 조문 | 해석례 | 민원 Q&A | 결과 파일 |
|---|---|---|---|---|---|---|---|---|
| 위험물안전관리법 제4조, 경기도 | 지정수량 미만인 위험물의 저장ㆍ취급 | 1 | 0 | 16 | 1 / 9 | 8 | 4 | ehs_lookup/out/위험물안전관리법_제4조_경기도.md |
| 산업안전보건법 제114조, 키워드: 물질안전보건자료·게시 | 물질안전보건자료의 게시 및 교육 | 2 | 3 | 0 | 0 / 0 | 8 | 9 | ehs_lookup/out/산업안전보건법_제114조.md |
| 폐기물관리법 제17조, 강원, 키워드: 지정폐기물 | 사업장폐기물배출자의 의무 등 | 4 | 3 | 0 | 0 / 0 | 8 | 8 | ehs_lookup/out/폐기물관리법_제17조_강원.md |

### 예시 1 상세: 위험물안전관리법 제4조, 경기도

**법 조문**

> 제4조(지정수량 미만인 위험물의 저장ㆍ취급) 지정수량 미만인 위험물의 저장 또는 취급에 관한 기술상의 기준은 특별시ㆍ광역시ㆍ특별자치시ㆍ도 및 특별자치도(이하 "시ㆍ도"라 한다)의 조례로 정한다. <개정 2014.12.30>

**연계 조례 16개(전국)**

| 조례 | 시행일 | 연계 조문 |
|---|---|---|
| 강원특별자치도 위험물 안전관리 조례 | 20230611 | 제2조, 제3조, 제4조, 제5조 |
| 경기도 위험물안전관리 조례 | 20240320 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조 |
| 경상남도 위험물 안전관리 조례 | 20141010 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조 |
| 경상북도 위험물 안전관리 조례 | 20170612 | 제2조, 제3조, 제4조, 제5조 |
| 대구광역시 위험물 안전관리 조례 | 20260220 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조 |
| 대전광역시 위험물안전관리 조례 | 20230714 | 제3조, 제4조, 제5조, 제6조 |
| 부산광역시 위험물 안전관리 조례 | 20200715 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조 |
| 서울특별시 위험물안전관리 조례 | 20220428 | 제3조, 제4조 |
| 세종특별자치시 위험물 안전관리 조례 | 20230417 | 제2조, 제3조 |
| 울산광역시 위험물안전관리 조례 | 20260507 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조, 제11조 |
| 인천광역시 위험물 안전관리 조례 | 20231229 | 제3조, 제4조 |
| 전남광주통합특별시 위험물 안전관리 조례 | 20260701 | 제2조 |
| 전북특별자치도 위험물 안전관리 조례 | 20250711 | 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조, 제11조 |
| 제주특별자치도 위험물 안전관리 조례 | 20170308 | 제3조, 제4조, 제7조 |
| 충청남도 위험물안전관리 조례 | 20160222 | 제2조, 제3조 |
| 충청북도 위험물 안전관리조례 | 20211001 | 제2조, 제3조, 제4조, 제5조, 제6조, 제7조, 제8조, 제9조, 제10조 |

**경기도 위험물안전관리 조례: 자동 추출된 예외·단서 문구('다만'·'예외' 포함 문장)**

- 제2조 지정수량 미만인 위험물의 저장ㆍ취급 기준: 실험 등을 위한 경우로서 화재예방상 안전한 조치를 하는 때에는 예외로 한다.
- 제2조 지정수량 미만인 위험물의 저장ㆍ취급 기준: 제4류 위험물 중 인화점이 섭씨 130도 이상인 위험물을 섭씨 100도 미만의 온도에서 저장 또는 취급하는 경우에는 예외로 한다.
- 제3조 소량위험물 저장ㆍ취급의 공통기준: 다만, 해당 설비에 위험물의 누설, 넘침 또는 비산(飛散)에 따른 재해를 방지하기 위한 부대설비를 설치한 때에는 그러하지 아니하다13.
- 제3조 소량위험물 저장ㆍ취급의 공통기준: 다만, 해당 설비를 방화상 안전한 장소에 설치하거나 해당 설비에 화재를 방지하기 위한 부대설비를 설치한 때에는 그러하지 아니하다.
- 제3조 소량위험물 저장ㆍ취급의 공통기준: 다만, 해당 배관을 지하 또는 화재 등에 의한 열로부터 악영향을 받을 우려가 없는 장소에 설치하는 경우에는 그러하지 아니하다.
- 제3조 소량위험물 저장ㆍ취급의 공통기준: 다만, 해당 배관을 설치한 조건이 부식의 우려가 없는 경우에는 그러하지 아니하다.
- 제3조 소량위험물 저장ㆍ취급의 공통기준: 다만, 해당 배관의 접합부분으로부터 위험물이 누설하는지를 쉽게 점검할 수 있는 조치를 하는 경우에는 그러하지 아니하다.
- 제4조 옥외에서의 저장ㆍ취급 기준: 다만, 개구부가 없는 내화구조 또는 불연재료로 된 벽에 면하는 경우에는 그러하지 아니하다.
- 제6조 옥외탱크에서의 저장ㆍ취급 기준: 다만, 개구부가 없는 내화구조 또는 불연재료로 만든 벽에 면하는 때에는 그러하지 아니하다.
- 제6조 옥외탱크에서의 저장ㆍ취급 기준: 다만, 고체위험물을 저장 또는 취급하는 탱크에 있어서는 그러하지 아니하다.
- 제7조 옥내탱크에서의 저장ㆍ취급 기준: 다만, 점검 등에 지장이 없는 경우에는 그러하지 아니하다.
- 제8조 지하탱크에서의 저장ㆍ취급 기준: 다만, 제4류 위험물의 지하탱크로서 그 외면을 아스팔트루핑, 아스팔트프라이머, 모르타르, 에폭시수지, 타르에폭시수지 등으로 유효하게 보호하는 경우 또는 부식이 곤란한 재질로 만드는 경우에는 그러하지 아니하다.
- 제8조 지하탱크에서의 저장ㆍ취급 기준: 다만, 제4류 위험물중 제2석유류(인화점이 섭씨 40도 이상인 것에 한한다), 제3석유류, 제4석유류 및 동·식물류에 있어서 직근에 유효한 제어밸브를 설치한 경우에는 그러하지 아니하다.
- 제8조 지하탱크에서의 저장ㆍ취급 기준: 다만, 탱크의 외면에 누설을 감지 할 수 있는 감지층이 생기도록 강판 또는 강화플라스틱 등을 피복하고 해당 감지층에 누설검지설비를 부착한 것은 그러하지 아니하다.
- 제9조 이동탱크에서의 저장ㆍ취급 기준: 다만, 하천의 공지나 수면, 내화구조 또는 불연재료의 담 또는 벽 그 밖에 이와 유사한 것에 접하는 경우에는 그러하지 아니하다.
- 제9조 이동탱크에서의 저장ㆍ취급 기준: 다만, 인화점이 섭씨 40도 이상인 제4류 위험물을 용기에 옮겨 담는 경우에는 그러하지 아니하다.
- 제9조 이동탱크에서의 저장ㆍ취급 기준: 다만, 「건설산업기본법」제2조제4호에 따른 건설공사를 하는 장소에서 주입호스의 선단부에 수동개폐장치를 한 주입노즐(수동개폐장치를 개방상태로 고정하는 장치를 한 것을 제외한다)을 부착한 이동탱크로부터 해당 건설공사와 관련된 자동차(「건설기계관리법」 제2조제1항제1호에 따른 건설기계 중 덤프트럭과 콘크리트믹서트럭으로 한정한다)의 연료탱크에 인화점 섭씨 40도 이상의 위험물을 주입하는 경우에는 그러하지 아니하다.
- 제9조 이동탱크에서의 저장ㆍ취급 기준: 다만, 규칙 별표 6 Ⅰ 및 Ⅱ에 맞는 장소에 주차하는 경우에는 그러하지 아니하다.

**해석례(상위 8건)**

- [법제처 법령해석례] 민원인 - 방유제 내에 설치하는 옥외저장탱크의 용량합계가 20만ℓ 이하인 경우, 소화활동에 지장이 없다고 인정되는 3m 이상의 노면폭을 확보한 도로 또는 공지에 접해야 하는 방유제 외면의 범위(「위험물안전관리법 시행규칙」 별표 6 등 관련) ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=expc&ID=343381&type=HTML))
- [법제처 법령해석례] 민원인 - 이중벽탱크를 탱크전용실 외의 장소에 설치하는 경우 「위험물안전관리법 시행규칙」 별표 8 Ⅰ제1호가목에 따른 기준의 준용 여부(「위험물안전관리법 시행규칙」 별표 8 Ⅰ제1호가목 등 관련) ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=expc&ID=332541&type=HTML))
- [소방청 법령해석] 건설현장 소방안전관리자를 선임시 특정소방대상물의 연면적의 합계를 계산하는 기준에 위험물안전관리법에 따른 제조소등도 포함되는지 ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=nfaCgmExpc&ID=2657347&type=HTML))
- [법제처 법령해석례] 민원인 - 고객이 직접 주유하는 주유취급소의 감시대 등 설치 기준(「위험물안전관리법 시행규칙」 별표 13 등) ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=expc&ID=343303&type=HTML))
- [법제처 법령해석례] 민원인 - 주유취급소의 캐노피를 증설하는 경우가 「위험물안전관리법」 제6조제1항 후단에 따른 변경허가의 대상인지(「위험물안전관리법」 제6조제1항 및 「위험물안전관리법 시행규칙」 별표 1의2 등 관련) ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=expc&ID=341317&type=HTML))
- [소방청 법령해석] 소방안전관리자와 위험물안전관리자 대리자도 겸직이 제한 되는지 ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=nfaCgmExpc&ID=2657113&type=HTML))
- [소방청 법령해석] 공장 내 기송관 설치시 소방법 해당 여부에 대해 검토가 필요해 질의 드립니다. 1공장(위험물 제조소), 2공장(위험물제조소) 둘다 개별 건물 에서 별개건물(실험실)로 기송관을 설치하여 샘플(완제품-위험물비대상) 품질분석용을 이송하려고 검토중에 있습니다. 이럴 경우에 소방법에 따른 조치사 ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=nfaCgmExpc&ID=2657019&type=HTML))
- [소방청 법령해석] 소방시설공사업법 시행규칙 별표 4의2 소방기술과 관련된 자격, 학력 및 경력의 인정 범위 중 1. 공통기준 “다”의 2) 소방공무원으로서 다음 어느 하나에 해당하는 업무를 수행한 경력 중 가) 건축허가등의 동의 관련 업무 나) 소방시설 착공?감리?완공검사 관련 업무 다) 위험물 설치허가 ([링크](https://www.law.go.kr/DRF/lawService.do?OC=test&target=nfaCgmExpc&ID=2657697&type=HTML))

**국민신문고·질의회시**

- [국민신문고 민원질의응답 원문(CSV)] 무허가 위험물 저장·취급 및 지정수량 관련 법령 (경상남도, 2026-04-27)
  - 답변 요지: Q1. `지정수량`이란 무엇이며, 왜 중요한가요? A1. 지정수량이란 위험물의 종류별로 위험성을 고려하여 대통령령으로 정하는 수량을 말합니다. 법적 기준: 지정수량 이상의 위험물을 저장하거나 취급할 때는 반드시 관할 소방서의 설치 허가를 받아야 합니다. 처벌 규정: 허가를 받지 않고 지정수량 이상의 위험물을 저장·취급할 경우, 위험물안전관리법에 따라 3년 이하의 징역 또는 3천만 원 이하의 벌금에 처해질 수 있습니다. Q2. 여러 종류의 위험물을 함께 저장할 때 수량 계산은 어떻게 하나요? A2. 두 종류 이상의 위험물을 함께 저장…
- [국민신문고 민원질의응답 원문(CSV)] 위험물안전관리자 중복선임 할 수 있는 경우 (울산광역시, 2026-07-01)
  - 답변 요지: □ 위험물안전관리자 중복선임 근거(위험물안전관리법 제15조제8항) 다수의 제조소등을 동일인이 설치한 경우에는 제1항의 규정에 불구하고 관계인은 대통령령 이 정하는 바에 따라 1인의 안전관리자를 중복하여 선임할 수 있다. 이 경우 대통령령이 정 하는 제조소등의 관계인은 제5항의 규정에 따른 대리자의 자격이 있는 자 를 각 제조소등별 로 지정하여 안전관리자를 보조하게 하여야 한다. → (해석기준) 제조소등의 단위별로 안전관리자를 각각 선임하여야 하는 원칙에 대한 예외를 규정, 단서는 안전관리자를 중복선임 한 경우 안전관리의 공백을 방지…
- [국민신문고 민원질의응답 원문(CSV)] 지정수량 미만의 위험물 저장 시 소방관서 허가 대상 해당 여부 (부산광역시, 2026-06-08)
  - 답변 요지: 1. 안녕하십니까? 귀하께서 국민신문고로 신청하신 민원에 대해 다음과 같이 답변드립니다. 2. 귀하의 민원은 "지정수량 미만의 위험물을 저장 또는 취급하는 경우 소방관서의 허가 대상에 해당되는지 여부"로 이해됩니다. 3. 현재 저장 또는 취급하시는 물질의 양이 1톤의 경우 약 1,000리터 정도로 추정(해당 물질을 리터로 환산할 경우 밀도 또는 비중을 확인하여 계산)되며, 지정수량 배수의 1배 미만으로 소방관서의 허가 대상에 해당되지 않습니다. 4. 다만, 지정수량 미만의 위험물을 저장 또는 취급하는 경우 `부산광역시 위험물 안전관…
- [노동포털 질의회시(CSV)] 단순히 위험물 저장만을 목적으로 하는 저장소 및 상시 근무하지 않는 장소에서의 비상구 설치 여부 (고용노동부, 2001-02-08)
  - 답변 요지: 산업안전보건법 제23조 및 산업안전기준에관한규칙 제11조의 규정에 의한 비상구의 설치는 위험물에 의하여 발생한 재해나 재해발생의 위험요인으로부터 작업중인 근로자가 신속하게 대피할 수 있도록 하는데 그 목적이 있음.1. 위와 같이 비상구의 설치 목적을 고려할 때 단순히 위험물의 저장만을 목적으로 하는 옥내저장소로서 단독 건물로 존재하면서 근로자가 그 저장소내에서 상시 작업을 하지 않는 경우에는 별도의 비상구 설치는 필요하지 않다고 사료되나,2. 동 저장소내에서 근로자가 상시 작업을 하지는 않으나, 근로자가 상시 작업을행하는 옥내 작업…

### 예시 2·3 요약

**산업안전보건법 제114조**

- 위임 [시행규칙] 산업안전보건법 시행규칙 제167조(물질안전보건자료를 게시하거나 갖추어 두는 방법) 제168조(물질안전보건자료대상물질의 관리 요령 게시) 제169조(물질안전보건자료에 관한 교육의 시기ㆍ내용ㆍ방법 등)
- 예외·단서 (산업안전보건법 시행규칙 제167조): 다만, 제3호에 따른 장비에 게시하거나 갖추어 두는 경우에는 고용노동부장관이 정하는 조치를 해야 한다.
- 예외·단서 (산업안전보건법 시행규칙 제167조): 다만, 근로자가 물질안전보건자료의 게시를 요청하는 경우에는 제1항에 따라 게시해야 한다.
- 연계 조례: 0건
- 해석례 [고용노동부 법령해석] 각 공정별 교육장에 전산장비를 설치하여 물질안전보건자료를 게시·비치할 경우 「산업안전보건법」 제114조에 따른 물질안전보건자료 게시·비치로 인정되는지 알고 싶습니다.
- 해석례 [고용노동부 법령해석] MSDS 교육 대상 및 시간
- 해석례 [고용노동부 법령해석] GHS에 따른 물질안전보건자료 및 경고표시 이행 주체
- 해석례 [고용노동부 법령해석] MSDS 작성시 불순물에 대한 작성 및 제출 여부
- 해석례 [고용노동부 법령해석] MSDS 작성시 혼합물의 구성성분 작성 여부
- Q&A [국민신문고 민원질의응답 원문(CSV)] 화평법 상 중점관리물질 관련 질의
- Q&A [노동포털 질의회시(CSV)] 전산장비로 MSDS 게시비치시 인정 여부
- Q&A [노동포털 질의회시(CSV)] 특별관리물질 취급 근로자에 적용되는 안전보건교육 종류
- Q&A [노동포털 질의회시(CSV)] 특별교육, 안전보건 정기교육, MSDS 교육 관련 기준
- Q&A [노동포털 질의회시(CSV)] 화학물질 msds 작성 및 도급인 책임 관련

**폐기물관리법 제17조 강원**

- 위임 [시행규칙] 폐기물관리법 시행규칙 제16조의12(위탁ㆍ수탁의 기준 및 절차) 제17조의2(사업장폐기물배출자의 확인 등) 제17조의3(사업장폐기물배출자의 범위) 제17조의4(음식물류 폐기물 배출자 및 사업장폐기물배출자의 확인) 제18조(사업장폐기물배출자의 신고) 제18조의2(지정폐기물 처리계획의 확인)
- 연계 조례: 0건
- 해석례 [기후에너지환경부 법령해석] 폐수를 지정폐기물로 처리 시 방지시설 설치대상 여부
- 해석례 [기후에너지환경부 법령해석] 2차연소실부분의 대기배출시설여부 질의건
- 해석례 [기후에너지환경부 법령해석] 기계/금속 업종의 배출물질 배출 여부 및 방지시설 설치 문의
- 해석례 [기후에너지환경부 법령해석] 보일러 연료 사용 가능 여부
- 해석례 [기후에너지환경부 법령해석] 일반보일러에 폐유기용제를 연료로 사용시 변경신고 여부
- Q&A [국민신문고 민원질의응답 원문(CSV)] 사업장폐기물 배출·처리안내
- Q&A [국민신문고 민원질의응답 원문(CSV)] 지정폐기물 처리계획의 절차는 어떻게 되나요?
- Q&A [국민신문고 민원질의응답 원문(CSV)] 폐슬레이트 처리
- Q&A [국민신문고 민원질의응답 원문(CSV)] 학교 석면 해체·제거 시 처리 절차
- Q&A [노동포털 질의회시(CSV)] 폐석면의 적절한 처리절차

## 5. 구현 시 주의사항과 한계

- law.go.kr은 결과가 1건이면 리스트가 아니라 dict를 돌려줍니다. `as_list()`로 정규화해야 합니다.
- 응답 최상위 키가 target마다 다릅니다. 예: `LawSearch.law`, `lnkOrdJoSearch.law`, `OrdinSearch.law`, `Expc.expc`, `CgmExpc.cgmExpc`, `AdmRulSearch.admrul`, `licBylSearch.licbyl`, `LawService`(조례 본문), `CgmExpcService`/`ExpcService`(해석 상세).
- **JO 형식이 API마다 다릅니다.** eflaw는 6자리(조 4자리 + 가지 2자리), lnkLsOrdJo는 4자리 + JOBR입니다.
- `lsDelegated`에서 제17조를 조회하면 제17조의2 등 가지조문 위임까지 함께 오므로 가지번호까지 일치하는지 걸러야 합니다. 또 '인용법령'은 조문 안에서 다른 법을 인용한 것이지 위임이 아닙니다.
- 부처 해석 상세의 `관련법령` 필드가 비어 있는 경우가 많습니다. 본문 키워드로 모은 뒤 법령 핵심어와 키워드로 연관도를 걸러야 합니다. 목록은 가나다순으로 오므로 코드에서 연관도 점수로 다시 정렬합니다.
- 부처 해석 DB 규모가 다릅니다(2026.10 기준 고용노동부 약 9,600건, 기후에너지환경부 약 2,400건, 소방청 약 800건). 해당 주제 해석이 적으면 본문에 단어만 언급된 건이 상위에 올라옵니다(예: 폐기물관리법 지정폐기물).
- 조례 본문의 `조내용`에 `&#8729;` 같은 HTML 엔티티와 `<table><img>` 태그가 섞여 있습니다. 표·별표는 `별표` 노드나 `ordinbyl`의 파일 링크로 받으세요.
- 연계 조례가 0건이면 해당 조문은 조례 위임이 없는 것입니다(예: 산안법 제114조). 다만 연계 데이터가 빠진 조례가 있을 수 있어 `search_ordinance(query, sido, body=True)`로 보완 검색할 수 있게 했습니다.
- 국민신문고는 공개 민원만 조회됩니다. 공개민원 CSV는 전 분야 약 2만 건이라 EHS 관련 건은 소수이고, 권익위 API를 함께 쓰면 범위가 넓어집니다.
- 권익위 Q&A 키는 포털의 "Decoding" 키를 넣으면 코드에서 URL 인코딩합니다.
- 검증 환경 메모: 작업 환경의 파이썬은 외부 접속이 막혀 있어, 브라우저 쪽에서 실제 응답을 받아 캐시에 넣고 같은 파이썬 코드를 그대로 돌려 검증했습니다. 캐시 기능(`EHS_CACHE_DIR`)은 실사용에서도 호출량을 줄이는 데 쓸 수 있습니다.

### 바이브코딩 확장 아이디어

- 조문 → 체크리스트 자동 생성: STEP 2·4의 `exceptions`를 "적용 예외 확인 항목"으로 변환
- 사업장 프로필(소재지, 취급물질·수량, 업종) → 대상 법령·조문 매핑 테이블 → `trace()` 일괄 실행
- `lsJoHstInf`(조문별 변경이력), `oldAndNew`(신구법)로 개정 알림
- LLM에는 `to_markdown()` 결과를 근거 문서로 넣고, 답변에 조문과 링크를 인용하도록 프롬프트 구성

## 6. 카탈로그

### 6-1. 국가법령정보 공동활용 Open API (law.go.kr DRF), 87개

공통 요청변수: `OC`(인증값), `target`, `type`(XML/JSON/HTML). 가이드: https://open.law.go.kr/LSO/openApi/guideList.do

| # | 파이프라인 단계 | API | target | 요청 URL | 주요 요청변수(공통 외) | 샘플 | 검증 |
|---|---|---|---|---|---|---|---|
| 1 | 보조: 개정이력·시점 | 법령 연혁 목록 조회 | `lsHistory` | http://www.law.go.kr/DRF/lawSearch.do?target=lsHistory | query, display, page, sort, efYd, date, ancYd, ancNo, rrClsCd, org, knd, lsChapNo, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lsHistory&type=HTML&query=자동차관리법) |  |
| 2 | 보조: 개정이력·시점 | 법령 연혁 본문 조회 | `lsHistory` | http://www.law.go.kr/DRF/lawService.do?target=lsHistory | ID, MST, LM, LD, LN, chrClsCd | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=lsHistory&MST=9094&type=HTML) |  |
| 3 | 보조: 개정이력·시점 | 법령 변경이력 목록 조회 | `lsHstInf` | http://www.law.go.kr/DRF/lawSearch.do?target=lsHstInf | regDt, org, display, page, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?target=lsHstInf&OC=test&regDt=20170726&type=HTML) |  |
| 4 | 보조: 개정이력·시점 | 일자별 조문 개정 이력 목록 조회 | `lsJoHstInf` | http://www.law.go.kr/DRF/lawSearch.do?target=lsJoHstInf | regDt, fromRegDt, toRegDt, ID, JO, org, page | [샘플](http://law.go.kr/DRF/lawSearch.do?target=lsJoHstInf&OC=test&regDt=20250401&type=XML) |  |
| 5 | 보조: 개정이력·시점 | 조문별 변경 이력 목록 조회 | `lsJoHstInf` | http://www.law.go.kr/DRF/lawService.do?target=lsJoHstInf | ID, JO, display, page | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=lsJoHstInf&ID=001971&JO=000500&type=XML) |  |
| 6 | 보조: 개정이력·시점 | 신구법 목록 조회 | `oldAndNew` | http://www.law.go.kr/DRF/lawSearch.do?target=oldAndNew | query, display, page, sort, efYd, ancYd, date, nb, ancNo, rrClsCd, org, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=oldAndNew&type=HTML&query=자동차관리법) |  |
| 7 | 보조: 개정이력·시점 | 신구법 본문 조회 | `oldAndNew` | http://www.law.go.kr/DRF/lawService.do?target=oldAndNew | ID, MST, LM, LD, LN | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=oldAndNew&ID=000170&MST=122682&type=HTML) |  |
| 8 | 보조: 공단·공공기관 규정 | 학칙ㆍ공단ㆍ공공기관 목록 조회 | `school` | http://www.law.go.kr/DRF/lawSearch.do?target=school(or | nw, search, query, display, page, knd, rrClsCd, date, prmlYd, nb, gana, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=school&query=학교&type=HTML) |  |
| 9 | 보조: 공단·공공기관 규정 | 학칙ㆍ공단ㆍ공공기관 본문 조회 | `school` | http://www.law.go.kr/DRF/lawService.do?target=school(or | ID, LID, LM | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=school&LID=2055825&type=HTML) |  |
| 10 | 보조: 맞춤형(분류 등록 필요) | 맞춤형 법령 목록 조회 | `couseLs` | http://www.law.go.kr/DRF/lawSearch.do?target=couseLs | vcode, display, page, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseLs&type=XML&vcode=L0000000003384) |  |
| 11 | 보조: 맞춤형(분류 등록 필요) | 맞춤형 법령 조문 목록 조회 | `couseLs` | http://www.law.go.kr/DRF/lawSearch.do?target=couseLs | vcode, display, page, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseLs&type=XML&lj=jo&vcode=L0000000003384) |  |
| 12 | STEP1-2 법령 식별·조문 | 현행법령(시행일) 목록 조회 (국가법령정보센터 기준) | `eflaw` | http://www.law.go.kr/DRF/lawSearch.do?target=eflaw | search, query, nw, LID, display, page, sort, efYd, date, ancYd, ancNo, rrClsCd, nb, org, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=eflaw&type=XML) | 호출 확인(OC=test) |
| 13 | STEP1-2 법령 식별·조문 | 현행법령(시행일) 본문 조회 (국가법령정보센터 기준) | `eflaw` | http://www.law.go.kr/DRF/lawService.do?target=eflaw | ID, MST, efYd, JO, chrClsCd | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=eflaw&ID=1747&type=HTML) | 호출 확인(OC=test) |
| 14 | STEP1-2 법령 식별·조문 | 현행법령(공포일) 목록 조회 | `law` | http://www.law.go.kr/DRF/lawSearch.do?target=law | search, query, display, page, sort, date, efYd, ancYd, ancNo, rrClsCd, nb, org, knd, lsChapNo, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=XML) | 호출 확인(OC=test) |
| 15 | STEP1-2 법령 식별·조문 | 현행법령(공포일) 본문 조회 | `law` | http://www.law.go.kr/DRF/lawService.do?target=law | ID, MST, LM, LD, LN, JO, LANG | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=law&ID=009682&type=HTML) | 호출 확인(OC=test) |
| 16 | STEP1-2 법령 식별·조문 | 현행법령(시행일) 본문 조항호목 조회 (국가법령정보센터 기준) | `eflawjosub` | http://www.law.go.kr/DRF/lawService.do?target=eflawjosub | ID, MST, efYd, JO, HANG, HO, MOK | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=eflawjosub&type=XML&MST=193412&efYd=20171019&JO=000300&HANG=000100&HO=000200&MOK=다) |  |
| 17 | STEP1-2 법령 식별·조문 | 법령 체계도 목록 조회 | `lsStmd` | http://www.law.go.kr/DRF/lawSearch.do?target=lsStmd | query, display, page, sort, efYd, ancYd, date, nb, ancNo, rrClsCd, org, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lsStmd&type=HTML&query=자동차관리법) |  |
| 18 | STEP1-2 법령 식별·조문 | 법령 체계도 본문 조회 | `lsStmd` | http://www.law.go.kr/DRF/lawService.do?target=lsStmd | ID, MST, LM, LD, LN | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=lsStmd&MST=142362&type=HTML) |  |
| 19 | STEP1-2 법령 식별·조문 | 법률명 약칭 조회 | `lsAbrv` | http://www.law.go.kr/DRF/lawSearch.do?target=lsAbrv | stdDt, endDt | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lsAbrv&type=XML) |  |
| 20 | STEP1-2 법령 식별·조문 | 한눈보기 목록 조회 | `oneview` | http://www.law.go.kr/DRF/lawSearch.do?target=oneview | query, display, page | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=oneview&type=XML) |  |
| 21 | STEP1-2 법령 식별·조문 | 한눈보기 본문 조회 | `oneview` | http://www.law.go.kr/DRF/lawService.do?target=oneview | MST, LM, LD, LN, JO | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=oneview&type=HTML) |  |
| 22 | STEP1-2 법령 식별·조문 | 법령 용어 목록 조회 | `lstrm` | http://www.law.go.kr/DRF/lawSearch.do?target=lstrm | query, display, page, sort, regDt, gana, popYn, dicKndCd | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lstrm&type=XML) |  |
| 23 | STEP1-2 법령 식별·조문 | 법령 용어 본문 조회 | `lstrm` | http://www.law.go.kr/DRF/lawService.do?target=lstrm | query | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=lstrm&query=선박&type=HTML) |  |
| 24 | STEP1-2 법령 식별·조문 | 법령용어 조회 | `lstrmAI` | https://www.law.go.kr/DRF/lawSearch.do?target=lstrmAI | query, display, page, homonymYn | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lstrmAI&type=XML) |  |
| 25 | STEP1-2 법령 식별·조문 | 일상용어 조회 | `dlytrm` | https://www.law.go.kr/DRF/lawSearch.do?target=dlytrm | query, display, page | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=dlytrm&type=XML) |  |
| 26 | STEP1-2 법령 식별·조문 | 법령용어-일상용어 연계 조회 | `lstrmRlt` | https://www.law.go.kr/DRF/lawService.do?target=lstrmRlt | query, MST, trmRltCd | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=lstrmRlt&type=XML&query=청원) |  |
| 27 | STEP1-2 법령 식별·조문 | 일상용어-법령용어 연계 조회 | `dlytrmRlt` | https://www.law.go.kr/DRF/lawService.do?target=dlytrmRlt | query, MST, trmRltCd | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=dlytrmRlt&type=XML&query=민원) |  |
| 28 | STEP1-2 법령 식별·조문 | 법령용어-조문 연계 조회 | `lstrmRltJo` | https://www.law.go.kr/DRF/lawService.do?target=lstrmRltJo | query | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=lstrmRltJo&type=XML&query=민원) |  |
| 29 | STEP1-2 법령 식별·조문 | 조문-법령용어 연계 조회 | `joRltLstrm` | https://www.law.go.kr/DRF/lawService.do?target=joRltLstrm | query, ID, JO | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=joRltLstrm&type=XML&query=상법시행법&JO=000400) |  |
| 30 | STEP1-2 법령 식별·조문 | 관련법령 조회 | `lsRlt` | https://www.law.go.kr/DRF/lawSearch.do?target=lsRlt | query, ID, rltClsCd | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lsRlt&ID=001823&type=XML) |  |
| 31 | STEP1-2 법령 식별·조문 | 지능형 법령검색 시스템 검색 API 조회 | `aiSearch` | https://www.law.go.kr/DRF/lawSearch.do?target=aiSearch | search, query, display, page | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=aiSearch&type=XML&search=0&query=뺑소니) | 호출 확인(OC=test) |
| 32 | STEP1-2 법령 식별·조문 | 지능형 법령검색 시스템 연관법령 API 조회 | `aiRltLs` | https://www.law.go.kr/DRF/lawSearch.do?target=aiRltLs | search, query | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=aiRltLs&type=XML&search=0&query=뺑소니) |  |
| 33 | STEP3 고시·별표 | 행정규칙 목록 조회 | `admrul` | http://www.law.go.kr/DRF/lawSearch.do?target=admrul | nw, search, query, display, page, org, knd, gana, sort, date, prmlYd, modYd, nb, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=admrul&query=학교&type=HTML) | 호출 확인(OC=test) |
| 34 | STEP3 고시·별표 | 행정규칙 본문 조회 | `admrul` | http://www.law.go.kr/DRF/lawService.do?target=admrul | ID, LID, LM | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=admrul&ID=62505&type=HTML) | 호출 확인(OC=test) |
| 35 | STEP3 고시·별표 | 행정규칙 신구법 비교 목록 조회 | `admrulOldAndNew` | http://www.law.go.kr/DRF/lawSearch.do?target=admrulOldAndNew | query, display, page, org, knd, gana, sort, date, prmlYd, nb, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=admrulOldAndNew&type=HTML) |  |
| 36 | STEP3 고시·별표 | 행정규칙 신구법 비교 본문 조회 | `admrulOldAndNew` | http://www.law.go.kr/DRF/lawService.do?target=admrulOldAndNew | ID, LID, LM | [샘플](http://law.go.kr/DRF/lawService.do?OC=test&target=admrulOldAndNew&ID=2100000248758&type=HTML) |  |
| 37 | STEP3 고시·별표 | 법령 별표ㆍ서식 목록 조회 | `licbyl` | http://www.law.go.kr/DRF/lawSearch.do?target=licbyl | search, query, display, page, sort, org, mulOrg, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=licbyl&type=XML) | 호출 확인(OC=test) |
| 38 | STEP3 고시·별표 | 행정규칙 별표ㆍ서식 목록 조회 | `admbyl` | http://www.law.go.kr/DRF/lawSearch.do?target=admbyl | search, query, display, page, sort, org, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=admbyl&type=XML) |  |
| 39 | STEP3 고시·별표 | 맞춤형 행정규칙 목록 조회 | `couseAdmrul` | http://www.law.go.kr/DRF/lawSearch.do?target=couseAdmrul |  | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseAdmrul&type=XML&vcode=A0000000000601) |  |
| 40 | STEP3 고시·별표 | 맞춤형 행정규칙 조문 목록 조회 | `couseAdmrul` | http://www.law.go.kr/DRF/lawSearch.do?target=couseAdmrul |  | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseAdmrul&type=XML&lj=jo&vcode=A0000000000601) |  |
| 41 | STEP3 위임관계 | 위임법령 조회 | `lsDelegated` | http://www.law.go.kr/DRF/lawService.do?target=lsDelegated | ID, MST | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=lsDelegated&type=XML&ID=000900) | 호출 확인(OC=test) |
| 42 | STEP3 위임관계 | 3단 비교 목록 조회 | `thdCmp` | http://www.law.go.kr/DRF/lawSearch.do?target=thdCmp | query, display, page, sort, efYd, ancYd, date, nb, ancNo, rrClsCd, org, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=thdCmp&type=HTML&query=자동차관리법) |  |
| 43 | STEP3 위임관계 | 3단 비교 본문 조회 | `thdCmp` | http://www.law.go.kr/DRF/lawService.do?target=thdCmp | knd, ID, MST, LM, LD, LN | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&ID=001372&MST=162662&type=HTML) |  |
| 44 | STEP4 위임 조례 | 법령 기준 자치법규 연계 관련 목록 조회 | `lnkLs, lnkLsOrdJo, lnkDep` | http://www.law.go.kr/DRF/lawSearch.do?target=lnkLs | query, display, page, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lnkLs&type=XML) | 호출 확인(OC=test) |
| 45 | STEP4 위임 조례 | 법령-자치법규 연계현황 조회 | `drlaw` | http://www.law.go.kr/DRF/lawSearch.do?target=drlaw |  | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=drlaw&type=HTML) |  |
| 46 | STEP4 위임 조례 | 자치법규 목록 조회 | `ordin` | http://www.law.go.kr/DRF/lawSearch.do?target=ordin | nw, search, query, display, page, sort, date, efYd, ancYd, ancNo, nb, org, sborg, knd, rrClsCd, ordinFd, lsChapNo, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=ordin&type=XML) | 호출 확인(OC=test) |
| 47 | STEP4 위임 조례 | 자치법규 본문 조회 | `ordin` | http://www.law.go.kr/DRF/lawService.do?target=ordin | ID, MST | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=ordin&MST=1316146&type=HTML&mobileYn=) | 호출 확인(OC=test) |
| 48 | STEP4 위임 조례 | 자치법규 기준 법령 연계 관련 목록 조회 | `lnkOrd, lnkLsOrd, lnkOrg` | http://www.law.go.kr/DRF/lawSearch.do?target=lnkOrd | query, display, page, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=lnkOrd&type=XML) |  |
| 49 | STEP4 위임 조례 | 자치법규 별표ㆍ서식 목록 조회 | `ordinbyl` | http://www.law.go.kr/DRF/lawSearch.do?target=ordinbyl | search, query, display, page, sort, org, sborg, knd, gana, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=ordinbyl&type=XML) | 호출 확인(OC=test) |
| 50 | STEP4 위임 조례 | 맞춤형 자치법규 목록 조회 | `couseOrdin` | http://www.law.go.kr/DRF/lawSearch.do?target=couseOrdin | vcode, display, page, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseOrdin&type=XML&vcode=O0000000000602) |  |
| 51 | STEP4 위임 조례 | 맞춤형 자치법규 조문 목록 조회 | `couseOrdin` | http://www.law.go.kr/DRF/lawSearch.do?target=couseOrdin | vcode, display, page, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=couseOrdin&type=XML&lj=jo&vcode=O0000000000602) |  |
| 52 | STEP5 해석례 | 법령해석례 목록 조회 | `expc` | http://www.law.go.kr/DRF/lawSearch.do?target=expc | search, query, display, page, inq, rpl, gana, itmno, regYd, explYd, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=expc&type=XML&query=임차) | 호출 확인(OC=test) |
| 53 | STEP5 해석례 | 법령해석례 본문 조회 | `expc` | http://www.law.go.kr/DRF/lawService.do?target=expc | ID, LM | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=expc&ID=334617&type=HTML) | 호출 확인(OC=test) |
| 54 | STEP5 해석례 | 고용노동부 법령해석 목록 조회 | `moelCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=moelCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=moelCgmExpc&type=XML&query=퇴직) | 호출 확인(OC=test) |
| 55 | STEP5 해석례 | 고용노동부 법령해석 본문 조회 | `moelCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=moelCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=moelCgmExpc&ID=21822&type=XML) | 호출 확인(OC=test) |
| 56 | STEP5 해석례 | 국토교통부 법령해석 목록 조회 | `molitCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=molitCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=molitCgmExpc&type=XML&query=도로) |  |
| 57 | STEP5 해석례 | 국토교통부 법령해석 본문 조회 | `molitCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=molitCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=molitCgmExpc&ID=315912&type=XML) |  |
| 58 | STEP5 해석례 | 해양수산부 법령해석 목록 조회 | `mofCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=mofCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=mofCgmExpc&type=XML&query=항만) |  |
| 59 | STEP5 해석례 | 해양수산부 법령해석 본문 조회 | `mofCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=mofCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=mofCgmExpc&ID=319468&type=XML) |  |
| 60 | STEP5 해석례 | 행정안전부 법령해석 목록 조회 | `moisCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=moisCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=moisCgmExpc&type=XML&query=재해) |  |
| 61 | STEP5 해석례 | 행정안전부 법령해석 본문 조회 | `moisCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=moisCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=moisCgmExpc&ID=279110&type=XML) |  |
| 62 | STEP5 해석례 | 기후에너지환경부 법령해석 목록 조회 | `meCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=meCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=meCgmExpc&type=XML&query=폐기물) | 호출 확인(OC=test) |
| 63 | STEP5 해석례 | 기후에너지환경부 법령해석 본문 조회 | `meCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=meCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=meCgmExpc&ID=9636&type=XML) | 호출 확인(OC=test) |
| 64 | STEP5 해석례 | 보건복지부 법령해석 목록 | `mohwCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=mohwCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=mohwCgmExpc&type=XML&query=일반음식점) |  |
| 65 | STEP5 해석례 | 보건복지부 법령해석 본문 | `mohwCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=mohwCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=mohwCgmExpc&ID=458114&type=XML) |  |
| 66 | STEP5 해석례 | 산업통상부 법령해석 목록 | `motieCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=motieCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=motieCgmExpc&type=XML&query=공장) |  |
| 67 | STEP5 해석례 | 산업통상부 법령해석 본문 | `motieCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=motieCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=motieCgmExpc&ID=375510&type=XML) |  |
| 68 | STEP5 해석례 | 법제처 법령해석 목록 | `molegCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=molegCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=molegCgmExpc&type=XML&query=법령) |  |
| 69 | STEP5 해석례 | 법제처 법령해석 본문 | `molegCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=molegCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=molegCgmExpc&ID=427778&type=XML) |  |
| 70 | STEP5 해석례 | 소방청 법령해석 목록 | `nfaCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=nfaCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=nfaCgmExpc&type=XML&query=공공기관) | 호출 확인(OC=test) |
| 71 | STEP5 해석례 | 소방청 법령해석 본문 | `nfaCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=nfaCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=nfaCgmExpc&ID=372876&type=XML) | 호출 확인(OC=test) |
| 72 | STEP5 해석례 | 질병관리청 법령해석 목록 | `kdcaCgmExpc` | http://www.law.go.kr/DRF/lawSearch.do?target=kdcaCgmExpc | search, query, display, page, inq, rpl, gana, itmno, explYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=kdcaCgmExpc&type=XML&query=임상시험) |  |
| 73 | STEP5 해석례 | 질병관리청 법령해석 본문 | `kdcaCgmExpc` | http://www.law.go.kr/DRF/lawService.do?target=kdcaCgmExpc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=kdcaCgmExpc&ID=379352&type=XML) |  |
| 74 | STEP5+ 판례·심판·결정 | 판례 목록 조회 | `prec` | http://www.law.go.kr/DRF/lawSearch.do?target=prec | search, query, display, page, org, curt, JO, gana, sort, date, prncYd, nb, datSrcNm, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=prec&type=XML&query=담보권) | 호출 확인(OC=test) |
| 75 | STEP5+ 판례·심판·결정 | 판례 본문 조회 | `prec` | http://www.law.go.kr/DRF/lawService.do?target=prec | ID, LM | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=prec&ID=228541&type=HTML) | 호출 확인(OC=test) |
| 76 | STEP5+ 판례·심판·결정 | 행정심판례 목록 조회 | `decc` | http://www.law.go.kr/DRF/lawSearch.do?target=decc | search, query, display, page, cls, gana, date, dpaYd, rslYd, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=decc&type=XML) |  |
| 77 | STEP5+ 판례·심판·결정 | 행정심판례 본문 조회 | `decc` | http://www.law.go.kr/DRF/lawService.do?target=decc | ID, LM | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=decc&ID=243263&type=HTML) |  |
| 78 | STEP5+ 판례·심판·결정 | 국민권익위원회 결정문 목록 조회 | `acr` | https://www.law.go.kr/DRF/lawSearch.do?target=acr | search, query, display, page, gana, sort, popYn | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=acr&type=HTML) |  |
| 79 | STEP5+ 판례·심판·결정 | 국민권익위원회 결정문 본문 조회 | `acr` | https://www.law.go.kr/DRF/lawService.do?target=acr | ID | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=acr&ID=53&type=HTML) |  |
| 80 | STEP5+ 판례·심판·결정 | 산업재해보상보험재심사위원회 결정문 목록 조회 | `iaciac` | https://www.law.go.kr/DRF/lawSearch.do?target=iaciac | search, query, display, page, gana, sort, popYn | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=iaciac&type=HTML) |  |
| 81 | STEP5+ 판례·심판·결정 | 산업재해보상보험재심사위원회 결정문 본문 조회 | `iaciac` | https://www.law.go.kr/DRF/lawService.do?target=iaciac | ID | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=iaciac&ID=7515&type=HTML) |  |
| 82 | STEP5+ 판례·심판·결정 | 중앙환경분쟁조정위원회 결정문 목록 조회 | `ecc` | https://www.law.go.kr/DRF/lawSearch.do?target=ecc | search, query, display, page, gana, sort, popYn | [샘플](https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=ecc&type=HTML) |  |
| 83 | STEP5+ 판례·심판·결정 | 중앙환경분쟁조정위원회 결정문 본문 조회 | `ecc` | https://www.law.go.kr/DRF/lawService.do?target=ecc | ID | [샘플](https://www.law.go.kr/DRF/lawService.do?OC=test&target=ecc&ID=5883&type=HTML) |  |
| 84 | STEP5+ 판례·심판·결정 | 국민권익위원회 특별행정심판례 목록 조회 | `acrSpecialDecc` | http://www.law.go.kr/DRF/lawSearch.do?target=acrSpecialDecc | search, query, display, page, cls, gana, date, dpaYd, rslYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=acrSpecialDecc&type=XML) |  |
| 85 | STEP5+ 판례·심판·결정 | 국민권익위원회 특별행정심판례 본문 조회 | `acrSpecialDecc` | http://www.law.go.kr/DRF/lawService.do?target=acrSpecialDecc | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=acrSpecialDecc&ID=2071461&type=XML) |  |
| 86 | STEP5+ 판례·심판·결정 | 감사원 사전컨설팅 의견서 목록 조회 | `baiPvcs` | http://www.law.go.kr/DRF/lawSearch.do?target=baiPvcs | search, query, display, page, gana, date, rslYd, sort, popYn, fields | [샘플](http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=baiPvcs&type=XML) |  |
| 87 | STEP5+ 판례·심판·결정 | 감사원 사전컨설팅 의견서 본문 조회 | `baiPvcs` | http://www.law.go.kr/DRF/lawService.do?target=baiPvcs | ID, LM, fields | [샘플](http://www.law.go.kr/DRF/lawService.do?OC=test&target=baiPvcs&ID=30&type=XML) |  |

### 6-2. data.go.kr 오픈API, 46개

법제처 계열 API는 law.go.kr DRF와 같은 데이터를 포털에서 제공하는 것입니다. DRF를 직접 쓰면 키 하나(OC)로 해결됩니다.

| # | 파이프라인 단계 | API명 | 제공기관 | 포맷 | 엔드포인트 | 용도 | 검증/비고 | 링크 |
|---|---|---|---|---|---|---|---|---|
| 1 | STEP6 민원Q&A | 국민권익위원회_민원정책 질의응답조회서비스 | 국민권익위원회 | JSON | apis.data.go.kr/1140100/CivilPolicyQnaService/PolicyQnaList apis.data.go.kr/1140100/CivilPolicyQnaService | 핵심: 국민신문고 민원·정책 Q&A 목록(PolicyQnaList)+상세(PolicyQnaItem, 관련법령명·조문 포함) | 스펙 확인(키 필요, 미호출) | [링크](https://www.data.go.kr/data/15074671/openapi.do) |
| 2 | STEP6 민원Q&A | 국민권익위원회_고충민원 결정례 조회 서비스 | 국민권익위원회 | JSON+XML | apis.data.go.kr/1140100/ApiDiciService | 권익위 고충민원 결정례(행정기관 처분 관련 고충) |  | [링크](https://www.data.go.kr/data/15102383/openapi.do) |
| 3 | STEP5+ 결정문 | 국민권익위원회_결정문 목록조회 국가법령정보센터API | 국민권익위원회 | XML |  | 권익위 결정문 목록(국가법령정보센터 API 경유) |  | [링크](https://www.data.go.kr/data/15102917/openapi.do) |
| 4 | STEP5+ 결정문 | 국민권익위원회_결정문 본문조회 국가법령정보센터API | 국민권익위원회 | XML |  | 권익위 결정문 본문 |  | [링크](https://www.data.go.kr/data/15102919/openapi.do) |
| 5 | STEP1-2 법령 | 한국산업안전보건공단_안전보건법령 스마트검색 | 한국산업안전보건공단 | JSON | apis.data.go.kr/B552468/srch | KOSHA 안전보건법령 스마트검색: 산안법·기준규칙·고시·중처법·KOSHA GUIDE 유사어 검색 |  | [링크](https://www.data.go.kr/data/15123696/openapi.do) |
| 6 | STEP3 기술기준 | 한국산업안전보건공단_기술지원규정(코샤가이드) 조회 서비스 | 한국산업안전보건공단 | JSON | apis.data.go.kr/B552468/koshaguide | KOSHA GUIDE(기술지원규정) 조회 |  | [링크](https://www.data.go.kr/data/15144147/openapi.do) |
| 7 | STEP5+ 판례 | 근로복지공단_산재보험 판례 판결문 조회 서비스 | 근로복지공단 | XML | apis.data.go.kr/B490001/sjbPrecedentInfoService | 근로복지공단 산재보험 판례 판결문 |  | [링크](https://www.data.go.kr/data/15041878/openapi.do) |
| 8 | STEP1-2 법령 | 법제처 국가법령정보 공유서비스 | 법제처 | XML | apis.data.go.kr/1170000/law/lawSearchList apis.data.go.kr/1170000/law | 법제처 국가법령정보 공유서비스(포털 경유) |  | [링크](https://www.data.go.kr/data/15000115/openapi.do) |
| 9 | STEP3 위임관계 | 법제처_위임법령 정보 | 법제처 | XML |  | 법제처 위임법령 정보(=DRF lsDelegated) | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15038873/openapi.do) |
| 10 | STEP4 조례 | 법제처_법령 기준 자치법규 연계 관련 목록 조회 | 법제처 | XML |  | 법령 기준 자치법규 연계 목록(=DRF lnkLs/lnkLsOrdJo) | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15058266/openapi.do) |
| 11 | STEP4 조례 | 법제처_자치법규(연계) 정보 | 법제처 | XML |  | 자치법규(연계) 정보 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15031994/openapi.do) |
| 12 | STEP4 조례 | 법제처_법령-자치법규 연계현황 조회 | 법제처 | XML |  | 법령-자치법규 연계현황 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057028/openapi.do) |
| 13 | STEP4 조례 | 법제처_자치법규 목록 조회 | 법제처 | XML |  | 자치법규 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057575/openapi.do) |
| 14 | STEP4 조례 | 법제처_자치법규 본문 조회 | 법제처 | XML |  | 자치법규 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15058294/openapi.do) |
| 15 | STEP4 조례 | 법제처_별표,서식(자치법규) 정보 | 법제처 | XML |  | 자치법규 별표·서식 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15031993/openapi.do) |
| 16 | STEP4 조례 | 법제처_자치법규 의견제시사례 | 법제처 | XML |  | 자치법규 의견제시사례(법제처) | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15058421/openapi.do) |
| 17 | STEP1-2 법령 | 법제처_현행법령 본문 조회 | 법제처 | XML |  | 현행법령 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057358/openapi.do) |
| 18 | STEP1-2 법령 | 법제처_현행법령 본문 조항호목 조회 | 법제처 | XML |  | 현행법령 조항호목 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15058878/openapi.do) |
| 19 | STEP3 고시 | 법제처_행정규칙 목록 조회 | 법제처 | XML |  | 행정규칙 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057542/openapi.do) |
| 20 | STEP3 고시 | 법제처_행정규칙 본문 조회 | 법제처 | XML |  | 행정규칙 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15056579/openapi.do) |
| 21 | STEP3 고시 | 법제처 별표,서식(행정규칙)정보 | 법제처 | XML |  | 행정규칙 별표·서식 |  | [링크](https://www.data.go.kr/data/3034000/openapi.do) |
| 22 | 보조 개정이력 | 법제처_행정규칙 신구법 비교 목록 조회 | 법제처 | XML |  | 행정규칙 신구법 비교 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15138912/openapi.do) |
| 23 | STEP5 해석례 | 법제처_법령해석례 목록 조회 | 법제처 | XML |  | 법령해석례(법제처) 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15059136/openapi.do) |
| 24 | STEP5 해석례 | 법제처_법령해석례 본문 조회 | 법제처 | XML |  | 법령해석례(법제처) 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15059402/openapi.do) |
| 25 | STEP5 해석례 | 법제처_고용노동부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 고용노동부 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140236/openapi.do) |
| 26 | STEP5 해석례 | 법제처_고용노동부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 고용노동부 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140237/openapi.do) |
| 27 | STEP5 해석례 | 법제처_환경부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 환경부(기후에너지환경부) 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140241/openapi.do) |
| 28 | STEP5 해석례 | 법제처_환경부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 환경부(기후에너지환경부) 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140310/openapi.do) |
| 29 | STEP5 해석례 | 법제처_소방청 법령해석 목록 조회 | 법제처 | JSON+XML |  | 소방청 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153132/openapi.do) |
| 30 | STEP5 해석례 | 법제처_소방청 법령해석 본문 조회 | 법제처 | JSON+XML |  | 소방청 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153134/openapi.do) |
| 31 | STEP5 해석례 | 법제처_행정안전부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 행정안전부 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140311/openapi.do) |
| 32 | STEP5 해석례 | 법제처_행정안전부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 행정안전부 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140312/openapi.do) |
| 33 | STEP5 해석례 | 법제처_국토교통부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 국토교통부 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140238/openapi.do) |
| 34 | STEP5 해석례 | 법제처_국토교통부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 국토교통부 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15140240/openapi.do) |
| 35 | STEP5 해석례 | 법제처_산업통상부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 산업통상부 법령해석 목록(가스·전기 등) | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153062/openapi.do) |
| 36 | STEP5 해석례 | 법제처_산업통상부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 산업통상부 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153063/openapi.do) |
| 37 | STEP5 해석례 | 법제처_보건복지부 법령해석 목록 조회 | 법제처 | JSON+XML |  | 보건복지부 법령해석 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153058/openapi.do) |
| 38 | STEP5 해석례 | 법제처_보건복지부 법령해석 본문 조회 | 법제처 | JSON+XML |  | 보건복지부 법령해석 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15153060/openapi.do) |
| 39 | STEP5+ 판례 | 법제처_판례 목록 조회 | 법제처 | XML |  | 판례 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15059269/openapi.do) |
| 40 | STEP5+ 판례 | 법제처_판례 본문 조회 | 법제처 | XML |  | 판례 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057123/openapi.do) |
| 41 | STEP5+ 심판 | 법제처_행정심판례 목록 조회 | 법제처 | XML |  | 행정심판례 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15056915/openapi.do) |
| 42 | STEP5+ 심판 | 법제처_행정심판례 본문 조회 | 법제처 | XML |  | 행정심판례 본문 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15059509/openapi.do) |
| 43 | STEP1-2 법령 | 법제처_법령정보지식베이스 관련법령 조회 | 법제처 | XML |  | 법령정보지식베이스 관련법령 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15111336/openapi.do) |
| 44 | STEP1-2 법령 | 법제처_법령정보지식베이스 일상용어 조회 | 법제처 | XML |  | 법령정보지식베이스 일상용어(일상어→법령용어 매핑) | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15111330/openapi.do) |
| 45 | STEP1-2 법령 | 법제처_법령정보지식베이스 조문-법령용어 연계 조회 | 법제처 | XML |  | 조문-법령용어 연계 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15111335/openapi.do) |
| 46 | STEP1-2 법령 | 법제처_법령 용어 목록 조회 | 법제처 | XML |  | 법령 용어 목록 | DRF 동일 데이터(OC=test로 호출 확인) | [링크](https://www.data.go.kr/data/15057595/openapi.do) |

### 6-3. data.go.kr 파일데이터, 29개

| # | 파이프라인 단계 | 파일데이터명 | 제공기관 | 형식 | 행 수 | 용도 | 검증 | 링크 |
|---|---|---|---|---|---|---|---|---|
| 1 | STEP6 민원Q&A | 국민권익위원회_국민신문고 민원질의응답 원문데이터_20260824 | 국민권익위원회 | CSV | 20058 | 핵심: 국민신문고 공개 민원 질의·답변 원문 2020~2026 (CSV, 로그인 없이 다운로드) | 다운로드·검색 확인 | [링크](https://www.data.go.kr/data/15164540/fileData.do) |
| 2 | STEP6 민원Q&A | 고용노동부_노동포털 질의회시_AI친화 학습데이터_20230710 | 고용노동부 | CSV | 9460 | 핵심: 고용노동부 노동포털 질의회시 9,460건(산안법 포함, CP949 CSV) | 다운로드·검색 확인 | [링크](https://www.data.go.kr/data/15167750/fileData.do) |
| 3 | STEP5+ 결정문 | 고용노동부_산업재해보상보험재심사위원회_재결사례및재심사용어_AI친화 학습데이터_20210101 | 고용노동부 | CSV | 717 | 산재보험재심사위원회 재결사례·재심사용어 |  | [링크](https://www.data.go.kr/data/15166256/fileData.do) |
| 4 | STEP5 해석례 | 소방청_소방시설법령 질의회신집_20260112 | 소방청 | PDF | 1 | 소방청 소방시설법령 질의회신집 |  | [링크](https://www.data.go.kr/data/15158371/fileData.do) |
| 5 | STEP3 기술기준 | 소방청_소방시설 설치기준 개정연혁 및 자체점검 관련 법령집_20241101 | 소방청 | PDF | 1 | 소방시설 설치기준 개정연혁 및 자체점검 관련 법령집 |  | [링크](https://www.data.go.kr/data/15158370/fileData.do) |
| 6 | STEP6 민원Q&A | 한국환경공단_유해화학물질 취급시설 검사 FAQ_20250723 | 한국환경공단 | CSV | 8 | 한국환경공단 유해화학물질 취급시설 검사 FAQ |  | [링크](https://www.data.go.kr/data/15118735/fileData.do) |
| 7 | STEP6 민원Q&A | 기후에너지환경부_책임보험_업무공통FAQ정보_20240902 | 기후에너지환경부 | CSV | 10 | 기후에너지환경부 환경책임보험 업무공통 FAQ |  | [링크](https://www.data.go.kr/data/15134678/fileData.do) |
| 8 | STEP6 민원Q&A | 기후에너지환경부_책임보험_업무공통 FAQ 인허가정보_20240902 | 기후에너지환경부 | CSV | 16 | 기후에너지환경부 환경책임보험 FAQ(인허가정보) |  | [링크](https://www.data.go.kr/data/15134684/fileData.do) |
| 9 | STEP6 민원Q&A | 기후에너지환경부 국립환경과학원_수질검사실험 정보관리 포탈시스템 게시판(FAQ)_20230829 | 기후에너지환경부 국립환경과학원 | CSV | 14 | 국립환경과학원 수질검사실험 FAQ |  | [링크](https://www.data.go.kr/data/15121050/fileData.do) |
| 10 | STEP6 민원Q&A | 국민권익위원회_기업 고충민원 해결 사례집_20221231 | 국민권익위원회 | PDF | 1 | 권익위 기업 고충민원 해결 사례집 |  | [링크](https://www.data.go.kr/data/3070231/fileData.do) |
| 11 | STEP6 민원Q&A | 국민권익위원회_고충민원 결정례집_20260331 | 국민권익위원회 | PDF | 1 | 권익위 고충민원 결정례집 |  | [링크](https://www.data.go.kr/data/15053340/fileData.do) |
| 12 | STEP5+ 심판 | 국민권익위원회_행정심판재결례집_20141201 | 국민권익위원회 | PDF | 1 | 권익위 행정심판재결례집 |  | [링크](https://www.data.go.kr/data/15039823/fileData.do) |
| 13 | STEP5+ 심판 | 국민권익위원회_행정심판 결정례 국가법령정보센터 제공_20220111 | 국민권익위원회 | HWP | 23382 | 권익위 행정심판 결정례(국가법령정보센터 제공) |  | [링크](https://www.data.go.kr/data/15102926/fileData.do) |
| 14 | STEP5+ 결정문 | 국민권익위원회_의결정보 결정문 국가법령정보센터 제공_20240902 | 국민권익위원회 | HWP | 277 | 권익위 의결정보 결정문 |  | [링크](https://www.data.go.kr/data/15102923/fileData.do) |
| 15 | STEP5+ 심판 | 근로복지공단_산재보험 행정심판 재결정보_20241231 | 근로복지공단 | CSV | 78 | 근로복지공단 산재보험 행정심판 재결정보 |  | [링크](https://www.data.go.kr/data/3068551/fileData.do) |
| 16 | STEP5 해석례 | 법제처_법령해석사례집_20191231 | 법제처 | PDF | 1 | 법제처 법령해석사례집 |  | [링크](https://www.data.go.kr/data/15032082/fileData.do) |
| 17 | STEP5 해석례 | 법제처_법령해석사례집_20250619 | 법제처 | PDF | 1 | 법제처 법령해석사례집(추가판) |  | [링크](https://www.data.go.kr/data/15083945/fileData.do) |
| 18 | STEP5 해석례 | 법제처_주요 법령해석사례 해설 정보_20250113 | 법제처 | PDF | 1 | 법제처 주요 법령해석사례 해설 |  | [링크](https://www.data.go.kr/data/15034846/fileData.do) |
| 19 | STEP5 해석례 | 법제처_행정기본법 질의응답 사례집_20221228 | 법제처 | PDF | 1 | 법제처 행정기본법 질의응답 사례집(인허가 일반원칙) |  | [링크](https://www.data.go.kr/data/15138737/fileData.do) |
| 20 | STEP4 조례 | 법제처_자치법규 의견제시 사례집_20211231 | 법제처 | PDF | 1 | 법제처 자치법규 의견제시 사례집 |  | [링크](https://www.data.go.kr/data/15032085/fileData.do) |
| 21 | STEP4 조례 | 법제처_자치법규 의견제시 기본사례_20231004 | 법제처 | PDF | 1 | 법제처 자치법규 의견제시 기본사례 |  | [링크](https://www.data.go.kr/data/15124796/fileData.do) |
| 22 | STEP4 조례 | 법제처_조례 규제개선 사례 정보_20181012 | 법제처 | PDF | 1 | 법제처 조례 규제개선 사례 |  | [링크](https://www.data.go.kr/data/15032257/fileData.do) |
| 23 | STEP4 조례 | 법제처_자치법규 주요 쟁점 해설집 정보_20181002 | 법제처 | PDF | 1 | 법제처 자치법규 주요 쟁점 해설집 |  | [링크](https://www.data.go.kr/data/15032343/fileData.do) |
| 24 | STEP1-2 법령 | 법제처_국가법령정보센터_규제관련정보_20190406 | 법제처 | CSV | 30025 | 국가법령정보센터 규제관련정보 |  | [링크](https://www.data.go.kr/data/15136622/fileData.do) |
| 25 | STEP1-2 법령 | 고용노동부_중대재해처벌법 해설_20211117 | 고용노동부 | PDF | 1 | 고용노동부 중대재해처벌법 해설 |  | [링크](https://www.data.go.kr/data/15142932/fileData.do) |
| 26 | STEP3 기술기준 | 한국산업안전보건공단_안전보건기술지침(KOSHA Guide) 목록_20240812 | 한국산업안전보건공단 | CSV | 1352 | KOSHA GUIDE 목록 |  | [링크](https://www.data.go.kr/data/15116595/fileData.do) |
| 27 | STEP3 기술기준 | 한국산업안전보건공단_화학물질의 노출기준_07/30/2018 | 한국산업안전보건공단 | CSV | 1 | 화학물질의 노출기준(고시 별표 데이터) |  | [링크](https://www.data.go.kr/data/3038258/fileData.do) |
| 28 | STEP3 기술기준 | 한국가스안전공사_KGS Code(가스기술기준정보시스템)_20240313 | 한국가스안전공사 | PDF | 175 | KGS Code(가스 상세기준) |  | [링크](https://www.data.go.kr/data/15007434/fileData.do) |
| 29 | STEP3 기술기준 | 한국소방산업기술원_Korea Fire Code_20260801 | 한국소방산업기술원 | CSV | 367 | Korea Fire Code(소방 기술기준) |  | [링크](https://www.data.go.kr/data/15161428/fileData.do) |

## 부록 A. 실행 방법

```bash
set LAW_OC=본인OC            # mac/linux: export LAW_OC=...
set DATA_GO_KR_KEY=포털인증키   # 없으면 로컬 CSV만 검색
python run_trace.py --law 위험물안전관리법 --jo 4 --region 경기도 --download
python run_trace.py --law 산업안전보건법 --jo 114 --kw 물질안전보건자료 게시
python run_trace.py --law 폐기물관리법 --jo 17 --region 강원 --kw 지정폐기물
```

- 결과: `out/{법령}_제{조}조_{지역}.md`와 `.json`
- 옵션: `--data`(CSV 폴더), `--out`(결과 폴더), `--kw`(키워드, 미입력 시 조문 제목에서 추출)
- 캐시: 환경변수 `EHS_CACHE_DIR=./cache`

폴더 구조

```
ehs_lookup/
  README.md
  run_trace.py              # CLI
  ehs_lookup/
    http.py                 # HTTP + 캐시
    law_api.py              # law.go.kr DRF 클라이언트(법령·위임·조례·해석례·판례)
    qna_api.py              # 권익위 민원정책 Q&A API
    local_qna.py            # 국민신문고/노동포털 CSV 다운로드·검색
    pipeline.py             # trace() 파이프라인 + to_markdown()
  out/                      # 예시 결과 3건
```

## 부록 B. 전체 코드

### `run_trace.py`

```python
"""사용 예:
  python run_trace.py --law 위험물안전관리법 --jo 4 --region 경기도
  python run_trace.py --law 산업안전보건법 --jo 114 --kw 물질안전보건자료
환경변수: LAW_OC (law.go.kr OC, 기본 test), DATA_GO_KR_KEY (권익위 Q&A API)
데이터 파일: data/epeople_qna.csv, data/moel_qnr.csv (없으면 --download 로 자동 수집)
"""
import argparse
import json
import os
from pathlib import Path

from ehs_lookup import TraceConfig, download_file, to_markdown, trace
from ehs_lookup.local_qna import DATASETS

HERE = Path(__file__).parent
DATA = HERE / "data"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--law", required=True)
    p.add_argument("--jo", required=True, help="조번호 예: 4, 5의2")
    p.add_argument("--region", help="예: 경기도, 서울특별시")
    p.add_argument("--kw", nargs="*", help="검색 키워드(미입력 시 조문제목에서 추출)")
    p.add_argument("--download", action="store_true", help="국민신문고/노동포털 CSV 내려받기")
    p.add_argument("--out", default=str(HERE / "out"))
    p.add_argument("--data", default=str(DATA), help="CSV 파일 폴더")
    a = p.parse_args()

    data = Path(a.data)
    data.mkdir(exist_ok=True)
    files = {"epeople_qna": data / "epeople_qna.csv", "moel_qnr": data / "moel_qnr.csv"}
    if a.download:
        for k, f in files.items():
            if not f.exists():
                print("download", k, download_file(DATASETS[k], f))

    cfg = TraceConfig(oc=os.getenv("LAW_OC", "test"), data_go_kr_key=os.getenv("DATA_GO_KR_KEY"),
                      epeople_csv=str(files["epeople_qna"]), moel_csv=str(files["moel_qnr"]))
    r = trace(a.law, a.jo, region=a.region, keywords=a.kw, cfg=cfg)
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    stem = f"{a.law}_제{a.jo}조" + (f"_{a.region}" if a.region else "")
    (out / f"{stem}.json").write_text(json.dumps(r.__dict__, ensure_ascii=False, indent=1, default=list), encoding="utf-8")
    (out / f"{stem}.md").write_text(to_markdown(r), encoding="utf-8")
    print("saved:", out / f"{stem}.md")


if __name__ == "__main__":
    main()
```

### `ehs_lookup/__init__.py`

```python
from .law_api import LawAPI
from .qna_api import CivilQnaAPI
from .local_qna import LocalQnA, download_file
from .pipeline import TraceConfig, trace, to_markdown

__all__ = ["LawAPI", "CivilQnaAPI", "LocalQnA", "download_file", "TraceConfig", "trace", "to_markdown"]
```

### `ehs_lookup/http.py`

```python
"""Minimal HTTP helper (stdlib only).

- EHS_CACHE_DIR 를 지정하면 응답을 파일로 캐시(sha1(url).txt) -> 반복 조회·호출량 절감
- EHS_RECORD_MISSES 를 지정하면 네트워크 실패 URL을 해당 파일에 기록하고 빈 응답으로 진행(오프라인 검증용)
"""
import hashlib
import json
import os
import time
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (ehs-lookup/0.1)"


def get_text(url: str, params: dict | None = None, timeout: int = 20, retries: int = 2) -> str:
    if params:
        q = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")}, safe=":/")
        url = f"{url}{'&' if '?' in url else '?'}{q}"
    cache_dir = os.getenv("EHS_CACHE_DIR")
    cpath = None
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        cpath = os.path.join(cache_dir, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".txt")
        if os.path.exists(cpath):
            with open(cpath, encoding="utf-8") as f:
                return f.read()
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            txt = None
            for enc in ("utf-8", "cp949"):
                try:
                    txt = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            txt = txt if txt is not None else raw.decode("utf-8", errors="replace")
            if cpath:
                with open(cpath, "w", encoding="utf-8") as f:
                    f.write(txt)
            return txt
        except Exception as e:  # noqa: BLE001
            last = e
            if os.getenv("EHS_RECORD_MISSES"):
                break
            time.sleep(0.6 * (i + 1))
    miss = os.getenv("EHS_RECORD_MISSES")
    if miss:
        with open(miss, "a", encoding="utf-8") as f:
            f.write(url + "\n")
        return "{}"
    raise RuntimeError(f"GET failed: {url} ({last})")


def get_json(url: str, params: dict | None = None, **kw) -> dict:
    txt = get_text(url, params, **kw)
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return {"_raw": txt[:2000]}


def as_list(x):
    """law.go.kr returns a dict when there is exactly one hit, a list otherwise."""
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def first_list(obj: dict, keys: tuple[str, ...]):
    """Return the first list-ish value under any of `keys` inside the response root."""
    if not isinstance(obj, dict):
        return []
    root = next(iter(obj.values()), {}) if len(obj) == 1 else obj
    if not isinstance(root, dict):
        return []
    for k in keys:
        if k in root:
            return as_list(root[k])
    return []
```

### `ehs_lookup/law_api.py`

```python
"""국가법령정보 공동활용 Open API (law.go.kr DRF) client — 조회 전용.

가이드: https://open.law.go.kr/LSO/openApi/guideList.do
- OC: open.law.go.kr 에서 신청한 인증값(이메일 ID). 개발 테스트는 OC=test 로도 호출됨.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .http import as_list, first_list, get_json

BASE = "http://www.law.go.kr/DRF"
WEB = "https://www.law.go.kr"

# 소관부처명 -> 중앙부처 1차 해석 target
MINISTRY_TARGET = {
    "고용노동부": "moelCgmExpc",
    "기후에너지환경부": "meCgmExpc",
    "환경부": "meCgmExpc",
    "소방청": "nfaCgmExpc",
    "행정안전부": "moisCgmExpc",
    "국토교통부": "molitCgmExpc",
    "산업통상부": "motieCgmExpc",
    "산업통상자원부": "motieCgmExpc",
    "해양수산부": "mofCgmExpc",
    "보건복지부": "mohwCgmExpc",
    "질병관리청": "kdcaCgmExpc",
    "식품의약품안전처": "mfdsCgmExpc",
    "법제처": "molegCgmExpc",
}

# 광역 지자체 기관코드 (ordin 검색 org 파라미터)
SIDO_CODE = {
    "서울": "6110000", "부산": "6260000", "대구": "6270000", "인천": "6280000",
    "광주": "6290000", "대전": "6300000", "울산": "6310000", "세종": "5690000",
    "경기": "6410000", "강원": "6530000", "충북": "6430000", "충남": "6440000",
    "전북": "6540000", "전남": "6460000", "경북": "6470000", "경남": "6480000",
    "제주": "6500000",
}

EXCEPTION_PAT = re.compile(
    r"[^.。]*?(다만|예외로 한다|제외한다|제외하고|적용하지 아니|에도 불구하고|그러하지 아니하다|특례|면제|경우에는 그러하지)[^.。]*[.。]?"
)


def jo_codes(jo: str | int):
    """'5의2' -> ('000502', '0005', '02')  (eflaw JO, lnk JO, lnk JOBR)"""
    s = str(jo).replace("제", "").replace("조", "").strip()
    m = re.match(r"(\d+)(?:의(\d+))?", s)
    if not m:
        raise ValueError(f"조문번호 형식 오류: {jo}")
    n, br = int(m.group(1)), int(m.group(2) or 0)
    return f"{n:04d}{br:02d}", f"{n:04d}", (f"{br:02d}" if br else None)


def find_exceptions(text: str) -> list[str]:
    out = []
    for m in EXCEPTION_PAT.finditer(text or ""):
        s = m.group(0).strip()
        if len(s) > 8 and s not in out:
            out.append(s)
    return out


def _flatten_article(unit: dict) -> str:
    """조문단위(항/호/목 포함)를 하나의 텍스트로."""
    parts = [unit.get("조문내용", "")]
    for h in as_list(unit.get("항")):
        if isinstance(h, dict):
            parts.append(h.get("항내용", ""))
            for ho in as_list(h.get("호")):
                if isinstance(ho, dict):
                    parts.append(ho.get("호내용", ""))
                    for mok in as_list(ho.get("목")):
                        if isinstance(mok, dict):
                            mc = mok.get("목내용", "")
                            parts.append("\n".join(mc) if isinstance(mc, list) else mc)
    return "\n".join(p if isinstance(p, str) else " ".join(map(str, p)) for p in parts if p)


@dataclass
class LawRef:
    name: str
    law_id: str
    mst: str
    ef_date: str
    ministry: str
    kind: str


class LawAPI:
    def __init__(self, oc: str = "test"):
        self.oc = oc

    # ---------- low level ----------
    def search(self, target: str, **params) -> dict:
        return get_json(f"{BASE}/lawSearch.do", {"OC": self.oc, "target": target, "type": "JSON", **params})

    def service(self, target: str, **params) -> dict:
        return get_json(f"{BASE}/lawService.do", {"OC": self.oc, "target": target, "type": "JSON", **params})

    # ---------- 법령 ----------
    def find_law(self, name: str) -> LawRef | None:
        r = self.search("law", query=name, display=20)
        for x in first_list(r, ("law",)):
            if x.get("법령명한글") == name or x.get("법령약칭명") == name:
                return LawRef(x["법령명한글"], x["법령ID"], x["법령일련번호"], x["시행일자"], x.get("소관부처명", ""), x.get("법령구분명", ""))
        lst = first_list(r, ("law",))
        if lst:
            x = lst[0]
            return LawRef(x["법령명한글"], x["법령ID"], x["법령일련번호"], x["시행일자"], x.get("소관부처명", ""), x.get("법령구분명", ""))
        return None

    def article(self, law_id: str, jo: str | int) -> dict:
        """현행(시행일) 법령 특정 조문. 반환: {title, text, exceptions, raw}"""
        jo6, _, _ = jo_codes(jo)
        r = self.service("eflaw", ID=law_id, JO=jo6)
        law = r.get("법령", {})
        units = as_list((law.get("조문") or {}).get("조문단위"))
        units = [u for u in units if isinstance(u, dict) and u.get("조문여부") == "조문"] or units
        if not units:
            return {"title": "", "text": "", "exceptions": [], "raw": r}
        u = units[0]
        text = _flatten_article(u)
        return {"title": u.get("조문제목", ""), "text": text, "exceptions": find_exceptions(text),
                "effective": u.get("조문시행일자", ""), "raw": u}

    def delegations(self, law_id: str, jo: str | int | None = None) -> list[dict]:
        """위임법령 조회(lsDelegated): 법 조문 -> 시행령/시행규칙/행정규칙(고시)/자치법규(조례)."""
        r = self.service("lsDelegated", ID=law_id)
        rows = as_list(((r.get("lsDelegated") or {}).get("법령") or {}).get("위임조문정보"))
        want = None
        if jo is not None:
            _, j4, br = jo_codes(jo)
            want = (str(int(j4)), str(int(br)) if br else None)
        out = []
        for row in rows:
            info = row.get("조정보", {})
            key = (str(info.get("조문번호", "")), str(info.get("조문가지번호") or "") or None)
            if want and (key[0] != want[0] or key[1] != want[1]):   # 제17조 조회 시 제17조의2 등 가지조문 제외
                continue
            label = f"제{key[0]}조" + (f"의{key[1]}" if key[1] else "")
            for d in as_list(row.get("위임정보")):
                kinds = as_list(d.get("위임구분"))
                titles = as_list(d.get("위임법령제목"))
                arts = as_list(d.get("위임법령조문정보"))
                for i, t in enumerate(titles):
                    kind = kinds[i] if i < len(kinds) else (kinds[0] if kinds else "")
                    # 제목이 여러 개(인용법령 묶음)면 조문-대상 대응이 불명확하므로 조문 목록을 붙이지 않음
                    tarts = arts if len(titles) == 1 else []
                    out.append({"법조문": label, "구분": kind, "대상": t,
                                "대상조문": sorted({f"제{a.get('위임법령조문번호')}조" + (f"의{a['위임법령조문가지번호']}" if a.get("위임법령조문가지번호") else "") + f"({a.get('위임법령조문제목','')})" for a in tarts if a.get("위임법령조문번호") not in (None, "0")})})
                for t, s in zip(as_list(d.get("위임행정규칙제목")), as_list(d.get("위임행정규칙일련번호"))):
                    out.append({"법조문": label, "구분": "행정규칙(고시 등)", "대상": t, "일련번호": s})
                ords = as_list(d.get("위임자치법규조문정보"))
                if ords:
                    out.append({"법조문": label, "구분": "자치법규(조례)",
                                "대상": sorted({o.get("위임자치법규제목", "") for o in ords}),
                                "건수": len({o.get("위임자치법규일련번호") for o in ords})})
        return out

    # ---------- 자치법규 ----------
    def linked_ordinance_articles(self, law_id: str, jo: str | int | None = None, max_pages: int = 5) -> list[dict]:
        """법령 조문 -> 연계 조례 조문 (lnkLsOrdJo). 시·도/시·군·구 전부."""
        params = {"knd": law_id, "display": 100}
        if jo is not None:
            _, j4, br = jo_codes(jo)
            params["JO"] = j4
            if br:
                params["JOBR"] = br
        out = []
        for page in range(1, max_pages + 1):
            r = self.search("lnkLsOrdJo", page=page, **params)
            lst = first_list(r, ("law",))
            out += lst
            root = next(iter(r.values()), {}) if r else {}
            total = int(root.get("totalCnt", 0) or 0) if isinstance(root, dict) else 0
            if len(out) >= total or not lst:
                break
        return out

    def ordinance(self, mst: str) -> dict:
        """자치법규 본문 (조문 dict: '000200' -> {title, text})."""
        r = self.service("ordin", MST=mst)
        svc = r.get("LawService", {})
        info = svc.get("자치법규기본정보", {})
        arts = {}
        for a in as_list((svc.get("조문") or {}).get("조")):
            no = as_list(a.get("조문번호"))[0] if a.get("조문번호") else ""
            arts[no] = {"title": a.get("조제목", ""), "text": (a.get("조내용", "") or "").replace("&#8729;", "·")}
        return {"info": info, "articles": arts, "byl": as_list((svc.get("별표") or {}).get("별표단위"))}

    def search_ordinance(self, query: str, sido: str | None = None, body: bool = False, display: int = 50) -> list[dict]:
        p = {"query": query, "display": display, "search": 2 if body else 1}
        if sido:
            p["org"] = SIDO_CODE.get(sido[:2], sido)
        return first_list(self.search("ordin", **p), ("law",))

    def ordinance_annex(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("ordinbyl", query=query, display=display), ("ordinbyl",))

    # ---------- 행정규칙 / 별표 ----------
    def search_admrul(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("admrul", query=query, display=display), ("admrul",))

    def law_annex(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("licbyl", query=query, display=display), ("licbyl",))

    # ---------- 해석례 ----------
    def interpretations_moleg(self, query: str, body: bool = True, display: int = 20) -> list[dict]:
        """법제처 법령해석례(expc)."""
        r = self.search("expc", query=query, search=2 if body else 1, display=display, sort="ddes")
        return first_list(r, ("expc",))

    def interpretation_moleg(self, id_: str) -> dict:
        return self.service("expc", ID=id_).get("ExpcService", {})

    def interpretations_ministry(self, ministry_or_target: str, query: str, body: bool = True, display: int = 20) -> list[dict]:
        target = MINISTRY_TARGET.get(ministry_or_target, ministry_or_target)
        r = self.search(target, query=query, search=2 if body else 1, display=display)
        return first_list(r, ("cgmExpc",))

    def interpretation_ministry(self, ministry_or_target: str, id_: str) -> dict:
        target = MINISTRY_TARGET.get(ministry_or_target, ministry_or_target)
        return self.service(target, ID=id_).get("CgmExpcService", {})

    # ---------- 판례 / 행정심판 / 지능형 검색 ----------
    def search_prec(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("prec", query=query, search=2, display=display), ("prec",))

    def search_decc(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("decc", query=query, search=2, display=display), ("decc",))

    def ai_search(self, query: str, scope: int = 0, display: int = 10) -> list[dict]:
        """scope 0:법령조문 1:법령 별표·서식 2:행정규칙 조문 3:행정규칙 별표·서식"""
        r = self.search("aiSearch", query=query, search=scope, display=display)
        root = r.get("aiSearch", {})
        for k in ("법령조문", "법령별표서식", "행정규칙조문", "행정규칙별표서식"):
            if k in root:
                return as_list(root[k])
        return []

    @staticmethod
    def web_link(path: str) -> str:
        return path if path.startswith("http") else f"{WEB}{path}"
```

### `ehs_lookup/qna_api.py`

```python
"""국민신문고 민원·정책 Q&A 조회.

1) 국민권익위원회_민원정책 질의응답조회서비스 (data.go.kr 15074671)
   - PolicyQnaList : 목록 (keyword, searchType 1제목/2내용, type 1민원/2정책/3전체, regFrom/regTo)
   - PolicyQnaItem : 상세 (faqNo, dutySctnNm) -> 질의/답변 원문 + 관련 법령명(lwrdNm)/조문(fullName)
   serviceKey 는 data.go.kr 활용신청 후 발급(개발계정 자동승인, 일 10,000건).
2) 국민권익위원회_국민신문고 민원질의응답 원문데이터 (data.go.kr 15164540, CSV 2만여건) -> local_qna.py
"""
from __future__ import annotations

import html
import re
import urllib.parse

from .http import get_json

BASE = "http://apis.data.go.kr/1140100/CivilPolicyQnaService"


def _clean(s: str) -> str:
    s = html.unescape(html.unescape(s or ""))
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    return re.sub(r"<[^>]+>", "", s).strip()


class CivilQnaAPI:
    def __init__(self, service_key: str | None):
        # 포털의 'Decoding' 키를 넣으면 여기서 인코딩, 'Encoding' 키면 그대로 사용
        self.key = service_key
        if service_key and "%" not in service_key:
            self.key = urllib.parse.quote(service_key, safe="")

    @property
    def enabled(self) -> bool:
        return bool(self.key)

    def _get(self, op: str, params: dict) -> dict:
        url = f"{BASE}/{op}?serviceKey={self.key}"
        return get_json(url, params)

    def search(self, keyword: str, in_body: bool = True, kind: int = 3, page: int = 1, size: int = 20,
               reg_from: str | None = None, reg_to: str | None = None) -> dict:
        if not self.enabled:
            return {"resultList": [], "skipped": "DATA_GO_KR_KEY 미설정"}
        return self._get("PolicyQnaList", {
            "firstIndex": page, "recordCountPerPage": size, "type": kind,
            "keyword": keyword, "searchType": 2 if in_body else 1,
            "regFrom": reg_from, "regTo": reg_to,
        })

    def item(self, faq_no: str, duty: str = "tqapttn") -> dict:
        if not self.enabled:
            return {}
        d = self._get("PolicyQnaItem", {"faqNo": faq_no, "dutySctnNm": duty}).get("resultData", {}) or {}
        for k in ("qstnCntnCl", "ansCntnCl", "subjectCont"):
            if k in d:
                d[k] = _clean(d[k])
        return d

    def search_with_detail(self, keyword: str, law_name: str | None = None, top: int = 10) -> list[dict]:
        """목록 -> 상세까지. law_name 주면 상세의 관련법령(lwrdNm/fullName)이 일치하는 것을 앞으로 정렬."""
        lst = self.search(keyword, size=max(top * 2, 20)).get("resultList", []) or []
        out = []
        for x in lst[: top * 2]:
            d = self.item(x.get("faqNo"), x.get("dutySctnNm", "tqapttn"))
            if d:
                d["_law_match"] = bool(law_name and law_name in (d.get("lwrdNm", "") + d.get("fullName", "")))
                out.append(d)
        out.sort(key=lambda d: not d.get("_law_match"))
        return out[:top]
```

### `ehs_lookup/local_qna.py`

```python
"""로컬 파일데이터 검색 (API 키 불필요).

- 국민신문고 민원질의응답 원문데이터 (data.go.kr 15164540, UTF-8 CSV)
  컬럼: 제목, 질문내용, 신청일자, 답변내용, 처리일자, 기관명, 부서명, 업무구분
- 고용노동부 노동포털 질의회시 AI친화 학습데이터 (data.go.kr 15167750, CP949 CSV)
  컬럼: 연번, 회시일, 질의제목, 질의, 회시, 문서번호 (파일마다 상이할 수 있어 자동 감지)

download_file() 로 포털에서 직접 내려받을 수 있음(로그인 불필요).
"""
from __future__ import annotations

import csv
import io
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

PORTAL = "https://www.data.go.kr"
DATASETS = {
    "epeople_qna": "15164540",   # 국민신문고 민원질의응답 원문
    "moel_qnr": "15167750",      # 노동포털 질의회시
}


def download_file(public_data_pk: str, out_path: str | Path) -> Path:
    """data.go.kr 파일데이터 다운로드 (로그인 불필요한 '다운로드' 타입)."""
    ua = {"User-Agent": "Mozilla/5.0"}
    page = urllib.request.urlopen(urllib.request.Request(f"{PORTAL}/data/{public_data_pk}/fileData.do", headers=ua)).read().decode("utf-8", "replace")
    m = re.search(r"fn_fileDataDown\('\d+',\s*'([^']+)'", page)
    if not m:
        raise RuntimeError("다운로드형 파일이 아님(링크형일 수 있음)")
    meta_url = f"{PORTAL}/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk={public_data_pk}&publicDataDetailPk={urllib.parse.quote(m.group(1))}"
    meta = json.loads(urllib.request.urlopen(urllib.request.Request(meta_url, headers=ua)).read())
    url = f"{PORTAL}/cmm/cmm/fileDownload.do?atchFileId={meta['atchFileId']}&fileDetailSn={meta['fileDetailSn']}"
    data = urllib.request.urlopen(urllib.request.Request(url, headers=ua)).read()
    out = Path(out_path)
    out.write_bytes(data)
    return out



def _read_csv(path: Path) -> list[dict]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        txt = raw.decode("utf-8", "replace")
    return list(csv.DictReader(io.StringIO(txt)))


class LocalQnA:
    def __init__(self, path: str | Path, source: str, default_org: str = ""):
        self.path = Path(path)
        self.source = source
        self.default_org = default_org
        self.rows = _read_csv(self.path) if self.path.exists() else []
        cols = list(self.rows[0].keys()) if self.rows else []
        self.title_col = next((c for c in cols if "제목" in c), cols[0] if cols else "")
        self.q_col = next((c for c in cols if c in ("질문내용", "질의") or "질의내용" in c), "")
        self.a_col = next((c for c in cols if c in ("답변내용", "회시") or "답변" in c), "")
        self.org_col = next((c for c in cols if "기관" in c), "")
        self.date_col = next((c for c in cols if "일자" in c or c.endswith("일")), "")

    def search(self, all_terms: list[str], any_terms: list[str] | None = None, top: int = 10) -> list[dict]:
        """all_terms 모두 포함 + any_terms 중 하나 이상 포함. 제목 매칭 가중."""
        res = []
        for r in self.rows:
            blob = " ".join(str(r.get(c, "")) for c in (self.title_col, self.q_col, self.a_col))
            if not all(t in blob for t in all_terms):
                continue
            if any_terms and not any(t in blob for t in any_terms):
                continue
            score = sum(blob.count(t) for t in all_terms + (any_terms or [])) + 5 * sum(t in r.get(self.title_col, "") for t in all_terms)
            res.append((score, r))
        res.sort(key=lambda x: -x[0])
        return [{"source": self.source, "title": r.get(self.title_col, ""), "question": r.get(self.q_col, ""),
                 "answer": r.get(self.a_col, ""), "org": r.get(self.org_col, "") or self.default_org,
                 "date": r.get(self.date_col, "")}
                for _, r in res[:top]]
```

### `ehs_lookup/pipeline.py`

```python
"""법 조항 -> 위임(하위법령·고시·조례) -> 해석례 -> 민원 Q&A 추적 파이프라인 (조회 전용).

STEP 1  법령 식별           law(lawSearch)                          -> 법령ID/MST/소관부처
STEP 2  조문 원문·예외문구   eflaw(lawService, JO)                   -> 조문 텍스트, '다만/제외/불구하고' 등 추출
STEP 3  위임 관계           lsDelegated                             -> 시행령·시행규칙 조문, 행정규칙(고시), 자치법규
STEP 4  위임 조례 조문       lnkLsOrdJo(법령ID+JO) -> ordin(MST)     -> 시·도(시·군·구) 조례 해당 조문 원문·예외문구
        (+ STEP 3에서 나온 시행령/시행규칙 조문에 대해서도 동일하게 조례 연계 조회)
STEP 5  해석례              {부처}CgmExpc + expc(법제처)            -> 질의요지/회답/이유/관련법령
STEP 6  민원 Q&A            권익위 PolicyQnaList/Item (+ 국민신문고 원문 CSV, 노동포털 질의회시 CSV)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .law_api import MINISTRY_TARGET, LawAPI, find_exceptions, jo_codes
from .local_qna import LocalQnA
from .qna_api import CivilQnaAPI

STOP = {"관한", "대한", "등의", "경우", "기준", "사항", "방법", "절차", "그밖의", "미만", "이상", "이하", "초과",
        "설치", "관리", "운영", "제한", "의무", "신고", "허가", "특례", "적용", "범위"}


def _jo_sort_key(s: str):
    m = re.match(r"제(\d+)조(?:의(\d+))?", s or "")
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (9999, 0)


def law_core(name: str) -> str:
    """'위험물안전관리법 시행령' -> '위험물', '산업안전보건법' -> '산업안전보건'"""
    s = re.sub(r"\s*(시행령|시행규칙)$", "", name)
    s = re.sub(r"(안전관리법|관리법|에 관한 법률|법)$", "", s)
    return s or name


def title_keywords(title: str) -> list[str]:
    toks = re.findall(r"[가-힣A-Za-z0-9]{2,}", re.sub(r"[ㆍ·]", " ", title))
    out = []
    for t in toks:
        t = re.sub(r"(인|의|을|를|에|은|는|및|과|와)$", "", t)
        if len(t) >= 2 and t not in STOP and t not in out:
            out.append(t)
    return out


@dataclass
class TraceConfig:
    oc: str = "test"                       # law.go.kr OC
    data_go_kr_key: str | None = None      # data.go.kr serviceKey (권익위 Q&A)
    epeople_csv: str | None = None         # 국민신문고 원문 CSV 경로
    moel_csv: str | None = None            # 노동포털 질의회시 CSV 경로
    max_ordinances: int = 17               # 본문까지 가져올 조례 수
    max_interpretations: int = 8
    max_qna: int = 8
    follow_lower_laws: bool = True         # 시행령/시행규칙 위임조문에 대해서도 조례 연계 조회


@dataclass
class TraceResult:
    query: dict
    law: dict = field(default_factory=dict)
    article: dict = field(default_factory=dict)
    delegations: list = field(default_factory=list)
    lower_articles: list = field(default_factory=list)
    ordinances: list = field(default_factory=list)
    ordinance_index: list = field(default_factory=list)
    interpretations: list = field(default_factory=list)
    qna: list = field(default_factory=list)
    notes: list = field(default_factory=list)


def _match_region(name: str, region: str | None) -> bool:
    if not region:
        return True
    r = region.replace("특별시", "").replace("광역시", "").replace("특별자치도", "").replace("특별자치시", "").replace("도", "")[:2]
    return name.startswith(region) or name.startswith(r)


def trace(law_name: str, jo: str | int, region: str | None = None, keywords: list[str] | None = None,
          cfg: TraceConfig | None = None) -> TraceResult:
    cfg = cfg or TraceConfig()
    api = LawAPI(cfg.oc)
    res = TraceResult(query={"law": law_name, "jo": str(jo), "region": region, "keywords": keywords})

    # STEP 1
    law = api.find_law(law_name)
    if not law:
        res.notes.append(f"법령을 찾지 못함: {law_name}")
        return res
    res.law = law.__dict__

    # STEP 2
    art = api.article(law.law_id, jo)
    art.pop("raw", None)
    res.article = art
    kws = keywords or title_keywords(art.get("title", ""))[:3]
    res.query["keywords"] = kws

    # STEP 3
    res.delegations = api.delegations(law.law_id, jo)
    lower_targets = []
    if cfg.follow_lower_laws:
        for d in res.delegations:
            if d["구분"] in ("시행령", "시행규칙") and d.get("대상조문"):
                lower = api.find_law(d["대상"])
                if not lower:
                    continue
                for a in d["대상조문"][:3]:
                    no = re.match(r"제(\d+)조(?:의(\d+))?", a)
                    if not no:
                        continue
                    jo_s = no.group(1) + (f"의{no.group(2)}" if no.group(2) else "")
                    la = api.article(lower.law_id, jo_s)
                    la.pop("raw", None)
                    res.lower_articles.append({"law": lower.name, "law_id": lower.law_id,
                                               "jo": f"제{no.group(1)}조" + (f"의{no.group(2)}" if no.group(2) else ""), **la})
                    lower_targets.append((lower, jo_s))

    # STEP 4  (법 조문 + 하위법령 조문 -> 연계 조례 조문)
    links = [(law.name, x) for x in api.linked_ordinance_articles(law.law_id, jo)]
    for lw, jo_s in lower_targets:
        lbl = re.sub(r"(\d+)의(\d+)", r"\1조의\2", jo_s) if "의" in jo_s else f"{jo_s}조"
        links += [(f"{lw.name} 제{lbl}", x) for x in api.linked_ordinance_articles(lw.law_id, jo_s)]
    by_ord: dict[str, dict] = {}
    for src, x in links:
        name = x.get("자치법규명", "")
        e = by_ord.setdefault(x.get("자치법규일련번호"), {"name": name, "mst": x.get("자치법규일련번호"),
                                                     "effective": x.get("시행일자"), "articles": set(), "from": set()})
        e["articles"].add(x.get("자치법규조번호"))
        e["from"].add(src)
    res.ordinance_index = sorted(({**v, "articles": sorted(v["articles"], key=_jo_sort_key), "from": sorted(v["from"])} for v in by_ord.values()),
                                 key=lambda v: v["name"])
    targets = [o for o in res.ordinance_index if _match_region(o["name"], region)][: cfg.max_ordinances]
    if region and not targets:
        res.notes.append(f"'{region}' 연계 조례를 찾지 못함 (연계 데이터 미등록 가능). ordin 검색으로 보완 필요")
    for o in targets:
        body = api.ordinance(o["mst"])
        arts = []
        for a in o["articles"]:
            try:
                key, _, _ = jo_codes(a)
            except ValueError:
                continue
            t = body["articles"].get(key)
            if t:
                arts.append({"jo": a, "title": t["title"], "text": t["text"], "exceptions": find_exceptions(t["text"])})
        res.ordinances.append({"name": o["name"], "mst": o["mst"], "effective": o["effective"],
                               "link": f"https://www.law.go.kr/자치법규/{o['name'].replace(' ', '')}",
                               "articles": arts})

    # STEP 5  해석례 (소관부처 1차 해석 + 법제처)
    short = law.name.replace(" 시행령", "").replace(" 시행규칙", "")
    core = law_core(law.name)
    jo_label = f"제{str(jo).replace('제', '').replace('조', '')}조"
    target = MINISTRY_TARGET.get(law.ministry)
    found = []
    if target:
        # 부처 해석은 '관련법령' 필드가 비어있는 경우가 많아 본문 키워드로 수집 후 연관도 필터
        # 제목 검색(정확) -> 본문 검색(넓게) 순. 목록은 가나다순이라 아래에서 연관도 재정렬
        for q, body in [(kws[0], False), (kws[0], True), (core, False)] + [(k, False) for k in kws[1:2]]:
            if not q:
                continue
            for x in api.interpretations_ministry(target, q, body=body, display=40):
                found.append(("부처", target, x))
    for x in api.interpretations_moleg(short, body=True, display=50):
        if any(k in x.get("안건명", "") for k in kws) or jo_label in x.get("안건명", ""):
            found.append(("법제처", "expc", x))
    seen, scored = set(), []
    for src, tgt, x in found:
        sid = x.get("법령해석일련번호") or x.get("법령해석례일련번호")
        if not sid or sid in seen:
            continue
        if len(seen) >= 45:          # 상세 호출 상한(트래픽 보호)
            break
        seen.add(sid)
        d = api.interpretation_ministry(tgt, sid) if src == "부처" else api.interpretation_moleg(sid)
        blob = " ".join(str(d.get(k, "")) for k in ("안건명", "질의요지", "회답", "이유", "관련법령"))
        head = f"{d.get('안건명', '')} {d.get('질의요지', '')}"
        if kws[0] not in blob and not (core in head and any(k in blob for k in kws)):
            continue                                  # 1순위 키워드가 없고 제목/질의에 법령 핵심어도 없으면 제외
        score = 3 * (short in blob) + 2 * (core in blob) + 3 * (f"{short} {jo_label}" in blob or f"{short}」 {jo_label}" in blob) \
            + 2 * sum(k in blob for k in kws) + 4 * (kws[0] in head)
        scored.append((score, {"source": "법제처 법령해석례" if src == "법제처" else f"{law.ministry} 법령해석",
                               "id": sid, "title": d.get("안건명", ""), "date": d.get("해석일자") or d.get("등록일시", ""),
                               "question": d.get("질의요지", ""), "answer": d.get("회답", ""), "reason": d.get("이유", ""),
                               "related_law": d.get("관련법령", ""),
                               "link": f"https://www.law.go.kr/DRF/lawService.do?OC={cfg.oc}&target={tgt}&ID={sid}&type=HTML"}))
        if len(scored) >= cfg.max_interpretations * 3:
            break
    scored.sort(key=lambda s: -s[0])
    res.interpretations = [s[1] for s in scored[: cfg.max_interpretations]]

    # STEP 6  민원 Q&A
    qna = CivilQnaAPI(cfg.data_go_kr_key)
    if qna.enabled:
        for d in qna.search_with_detail(" ".join(kws[:1]), law_name=short, top=cfg.max_qna):
            res.qna.append({"source": "국민신문고 민원·정책 Q&A(권익위 API)", "title": d.get("qnaTitl"), "question": d.get("qstnCntnCl"),
                            "answer": d.get("ansCntnCl"), "org": d.get("ancName"), "dept": d.get("deptName"),
                            "law": d.get("fullName") or d.get("lwrdNm"), "date": d.get("regDate"), "law_match": d.get("_law_match")})
    else:
        res.notes.append("권익위 Q&A API 미사용(DATA_GO_KR_KEY 없음) -> 로컬 CSV만 검색")
    any_terms = [short, core] + kws[1:]
    for path, src, org in ((cfg.epeople_csv, "국민신문고 민원질의응답 원문(CSV)", ""),
                           (cfg.moel_csv, "노동포털 질의회시(CSV)", "고용노동부")):
        if path and Path(path).exists():
            res.qna += LocalQnA(path, src, org).search(all_terms=kws[:1], any_terms=any_terms, top=cfg.max_qna)
    return res


def to_markdown(r: TraceResult, max_chars: int = 600) -> str:
    cut = lambda s: (s or "").strip()[:max_chars] + ("…" if s and len(s.strip()) > max_chars else "")  # noqa: E731
    L = r.law
    md = [f"# {r.query['law']} {r.query['jo']}조 추적 결과", ""]
    md += [f"- 조회조건: 지역={r.query.get('region') or '전국'}, 키워드={', '.join(r.query.get('keywords') or [])}",
           f"- 법령: {L.get('name')} (법령ID {L.get('law_id')}, 시행 {L.get('ef_date')}, 소관 {L.get('ministry')})", ""]
    a = r.article
    md += [f"## 1. 법 조문: {a.get('title', '')}", "", cut(a.get("text")), ""]
    if a.get("exceptions"):
        md += ["**예외·단서 문구**", *[f"- {e}" for e in a["exceptions"]], ""]
    md += ["## 2. 위임 관계 (lsDelegated)", ""]
    for d in r.delegations:
        tgt = d["대상"] if isinstance(d["대상"], str) else f"{len(d['대상'])}개 조례 ({', '.join(d['대상'][:5])}…)"
        md.append(f"- [{d['구분']}] {tgt} {' '.join(d.get('대상조문', []))}")
    for la in r.lower_articles:
        md += ["", f"### {la['law']} {la['jo']} {la.get('title', '')}", cut(la.get("text"))]
        if la.get("exceptions"):
            md += ["**예외·단서**", *[f"- {e}" for e in la["exceptions"]]]
    md += ["", f"## 3. 위임 조례 (연계 조례 {len(r.ordinance_index)}건, 본문 조회 {len(r.ordinances)}건)", ""]
    md += [f"- {o['name']} (시행 {o['effective']}) 조문: {', '.join(o['articles'])} ← {', '.join(o['from'])}" for o in r.ordinance_index]
    for o in r.ordinances:
        md += ["", f"### {o['name']} (시행 {o['effective']})", o["link"]]
        for x in o["articles"]:
            md += ["", f"**{x['jo']} {x['title']}**", cut(x["text"])]
            if x["exceptions"]:
                md += ["예외·단서:", *[f"- {e}" for e in x["exceptions"]]]
    md += ["", f"## 4. 해석례 ({len(r.interpretations)}건)", ""]
    for i in r.interpretations:
        md += [f"### [{i['source']}] {i['title']}", f"- 일자: {i['date']} / 관련법령: {i['related_law']}", f"- 링크: {i['link']}",
               f"- 질의: {cut(i['question'])}", f"- 회답: {cut(i['answer'])}", ""]
    md += [f"## 5. 민원 Q&A ({len(r.qna)}건)", ""]
    for q in r.qna:
        md += [f"### [{q['source']}] {q['title']}", f"- 기관: {q.get('org', '')} / 일자: {q.get('date', '')}" + (f" / 관련법령: {q['law']}" if q.get("law") else ""),
               f"- 질의: {cut(q.get('question'))}", f"- 답변: {cut(q.get('answer'))}", ""]
    if r.notes:
        md += ["## 참고", *[f"- {n}" for n in r.notes]]
    return "\n".join(md)
```

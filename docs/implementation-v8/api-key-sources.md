# 공공 API 32개 — 발급처와 키 구분

작성 2026-10-13. 출처: `docs/implementation-v6/api-registry.json` (각 항목의 공식 신청 페이지).
키 **값은 이 문서에 없다.** 법제처 OC(korean_law_mcp용)는 별도라 제외했다.

## 키는 실제로 2개

`.env.api-keys`(2026-10-13 재발급 후 제거)의 값을 해시로만 비교한 결과(값 출력 없음):

| 키 | 발급처 | 쓰는 API 수 | 환경 변수 |
|---|---|---|---|
| 공공데이터포털 일반 인증키 | data.go.kr (계정당 1개, 마이페이지) | 31 | `SHE_API_KEY_*` 31개가 **모두 같은 값** |
| 도로명주소 API 승인키(confmKey) | business.juso.go.kr | 1 | `SHE_API_KEY_ADDRESS` |
| (제외) 법제처 OC | open.law.go.kr | — | `LAW_OC` |

공공데이터포털은 API마다 **활용신청**을 따로 하지만, 인증키는 계정에 하나다. 키를 재발급하면 31개 신청은 그대로 두고 새 키 값만 바꿔 쓰면 된다(신청 승인 상태는 포털에서 확인).

## 32개 목록

| # | 분야 | API | 제공 기관 | 키 | 환경 변수 | 신청 페이지 |
|---|---|---|---|---|---|---|
| 1 | 법령·민원 | 국민권익위원회 민원정책 질의응답 | 국민권익위원회 | 공공데이터포털 인증키 | `SHE_API_KEY_QNA` | https://www.data.go.kr/data/15074671/openapi.do |
| 2 | 화학물질 | 소방청 국가 위험물 정보 | 소방청 | 공공데이터포털 인증키 | `SHE_API_KEY_FIRE` | https://www.data.go.kr/data/15061055/openapi.do |
| 3 | 화학물질 | 안전보건공단 물질안전보건자료 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_MSDS` | https://www.data.go.kr/data/15157612/openapi.do |
| 4 | 법령·민원 | 안전보건법령 스마트검색 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_SMART` | https://www.data.go.kr/data/15123696/openapi.do |
| 5 | 화학물질 | 한국환경공단 화학물질 정보 | 한국환경공단 | 공공데이터포털 인증키 | `SHE_API_KEY_KECO` | https://www.data.go.kr/data/15149420/openapi.do |
| 6 | 법령·민원 | 안전보건공단 기술지원규정 — KOSHA GUIDE | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_GUIDE` | https://www.data.go.kr/data/15144147/openapi.do |
| 7 | 법령·민원 | 국민권익위원회_고충민원 결정례 조회 서비스 | 국민권익위원회 | 공공데이터포털 인증키 | `SHE_API_KEY_GRIEVANCE` | https://www.data.go.kr/data/15102383/openapi.do |
| 8 | 화학물질 | 한국환경공단_유독물GHS 정보 조회 서비스 | 한국환경공단 | 공공데이터포털 인증키 | `SHE_API_KEY_GHS` | https://www.data.go.kr/data/15149423/openapi.do |
| 9 | 재해·사고 | 한국산업안전보건공단_국내재해사례 게시판 정보 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_ACCIDENTS` | https://www.data.go.kr/data/15121001/openapi.do |
| 10 | 재해·사고 | 한국산업안전보건공단_국내재해사례 게시판 첨부파일 정보 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_ACCIDENT_FILES` | https://www.data.go.kr/data/15121008/openapi.do |
| 11 | 재해·사고 | 한국산업안전보건공단_사망사고 고위험요인(SIF) 아카이브 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_SIF` | https://www.data.go.kr/data/15161362/openapi.do |
| 12 | 재해·사고 | 기후에너지환경부 화학물질안전원_화학사고정보 | 기후에너지환경부 화학물질안전원 | 공공데이터포털 인증키 | `SHE_API_KEY_CHEMICAL_ACCIDENTS` | https://www.data.go.kr/data/15072446/openapi.do |
| 13 | 환경 | 한국환경공단_폐기물 처리업체 정보 조회 서비스 | 한국환경공단 | 공공데이터포털 인증키 | `SHE_API_KEY_WASTE_COMPANIES` | https://www.data.go.kr/data/15141649/openapi.do |
| 14 | 환경 | 한국환경공단_사업장폐기물 행정처분 정보 조회서비스 | 한국환경공단 | 공공데이터포털 인증키 | `SHE_API_KEY_WASTE_SANCTIONS` | https://www.data.go.kr/data/15156661/openapi.do |
| 15 | 환경 | 행정안전부_자원환경_환경관리대행기관 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_ENVIRONMENT_AGENCIES` | https://www.data.go.kr/data/15155021/openapi.do |
| 16 | 환경 | 행정안전부_자원환경_환경측정대행업 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_MEASUREMENT_AGENCIES` | https://www.data.go.kr/data/15155030/openapi.do |
| 17 | 위치·토지 | 국토교통부_토지이용규제정보서비스 | 국토교통부 | 공공데이터포털 인증키 | `SHE_API_KEY_LAND_USE` | https://www.data.go.kr/data/15058410/openapi.do |
| 18 | 위치·토지 | 주소기반산업지원서비스 — 도로명주소 검색 API | 행정안전부(도로명주소) | **도로명주소 승인키** | `SHE_API_KEY_ADDRESS` | https://business.juso.go.kr/jst/jstAddressApiApplicationWrite?uniqKey=cntcInfoApi |
| 19 | 안전인증·자율확인 | 한국산업안전보건공단_보호구 안전인증서 진위확인 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_PPE_CERT` | https://www.data.go.kr/data/15149809/openapi.do |
| 20 | 안전인증·자율확인 | 한국산업안전보건공단_위험기계기구 안전인증서 진위확인 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_MACHINE_CERT` | https://www.data.go.kr/data/15149912/openapi.do |
| 21 | 안전인증·자율확인 | 한국산업안전보건공단_방호장치 안전인증서 진위확인 서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_GUARD_CERT` | https://www.data.go.kr/data/15149897/openapi.do |
| 22 | 안전인증·자율확인 | 한국산업안전보건공단_보호구 자율안전확인신고서 진위확인 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_PPE_DECLARATION` | https://www.data.go.kr/data/15150185/openapi.do |
| 23 | 안전인증·자율확인 | 한국산업안전보건공단_위험기계기구 자율안전확인신고서 진위확인 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_MACHINE_DECLARATION` | https://www.data.go.kr/data/15150184/openapi.do |
| 24 | 안전인증·자율확인 | 한국산업안전보건공단_방호장치 자율안전확인신고서 진위확인 조회서비스 | 한국산업안전보건공단 | 공공데이터포털 인증키 | `SHE_API_KEY_GUARD_DECLARATION` | https://www.data.go.kr/data/15150186/openapi.do |
| 25 | 소방·가스 | 한국소방산업기술원_소방용품 승인정보 | 한국소방산업기술원 | 공공데이터포털 인증키 | `SHE_API_KEY_FIRE_APPROVAL` | https://www.data.go.kr/data/15077845/openapi.do |
| 26 | 소방·가스 | 한국소방산업기술원_소방용품 승인취소 정보 | 한국소방산업기술원 | 공공데이터포털 인증키 | `SHE_API_KEY_FIRE_REVOCATION` | https://www.data.go.kr/data/15077894/openapi.do |
| 27 | 환경 | 행정안전부_자원환경_대기오염물질배출시설설치사업장 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_AIR_FACILITIES` | https://www.data.go.kr/data/15154973/openapi.do |
| 28 | 환경 | 행정안전부_자원환경_수질오염원설치시설(기타) 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_WATER_OTHER` | https://www.data.go.kr/data/15154989/openapi.do |
| 29 | 환경 | 행정안전부_비산먼지발생사업정보 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_DUST_BUSINESS` | https://www.data.go.kr/data/15155073/openapi.do |
| 30 | 소방·가스 | 행정안전부_자원환경_고압가스업 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_GAS_BUSINESS` | https://www.data.go.kr/data/15155163/openapi.do |
| 31 | 소방·가스 | 행정안전부_자원환경_특정고압가스업 조회서비스 | 행정안전부 | 공공데이터포털 인증키 | `SHE_API_KEY_SPECIFIC_GAS` | https://www.data.go.kr/data/15154881/openapi.do |
| 32 | 환경 | 한국환경공단_폐기물 적합성 확인 | 한국환경공단 | 공공데이터포털 인증키 | `SHE_API_KEY_WASTE_FITNESS` | https://www.data.go.kr/data/15164544/openapi.do |

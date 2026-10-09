export const domainProfiles = [
  { id: "dangerous", match: /위험물|소량위험물|인화성|가연성/, laws: ["위험물안전관리법", "위험물안전관리법 시행령", "위험물안전관리법 시행규칙"], facts: ["material", "concentration", "quantity", "facility", "activity", "permit", "dates"] },
  { id: "waste", match: /폐기물|폐유|폐산|폐알칼리|수탁|위탁처리/, laws: ["폐기물관리법", "폐기물관리법 시행령", "폐기물관리법 시행규칙"], facts: ["wasteType", "quantity", "facility", "activity", "contractor", "permit", "dates"] },
  { id: "chemical", match: /화학|SDS|MSDS|CAS|메탄올|벤젠|톨루엔|아세톤/i, laws: ["화학물질관리법", "화학물질관리법 시행령", "화학물질관리법 시행규칙"], facts: ["material", "cas", "concentration", "quantity", "facility", "activity", "permit", "dates"] },
  { id: "osh", match: /산업안전|산업보건|근로자|사다리|추락|고소작업|밀폐|소음|분진|건강진단|작업환경측정|보호구|기계/, laws: ["산업안전보건법", "산업안전보건법 시행령", "산업안전보건법 시행규칙", "산업안전보건기준에 관한 규칙"], facts: ["activity", "facility", "workforce", "exposure", "equipment", "dates"] },
] as const;
export const domainFields = [
  ["wasteType", "폐기물 종류·분류", "발생 공정, 폐기물 종류·분류번호와 지정폐기물 해당 근거를 확인해 주세요."],
  ["contractor", "수탁업체·위탁 범위", "수탁업체의 사업자번호·사업장 주소와 허가된 폐기물 종류·처리능력·위탁 범위를 확인해 주세요."],
  ["workforce", "업종·근로자·작업 조건", "업종, 상시근로자 수, 작업 인원과 도급 관계를 확인해 주세요."],
  ["exposure", "유해인자·노출 조건", "유해인자, 작업 시간·빈도, 측정·건강진단 대상 여부를 판단할 자료를 확인해 주세요."],
  ["equipment", "설비·보호구 식별정보", "설비·제품의 종류, 모델·제조사·제조번호와 인증·검사 정보를 확인해 주세요."],
] as const;
export const reviewDomains = (prompt: string) => domainProfiles.filter(p => p.match.test(prompt));

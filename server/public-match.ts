import type { LookupServiceId, PublicQuery } from "../shared/public-apis.js";

export function publicMatch(id: LookupServiceId, fields: Record<string, unknown>, query: PublicQuery) {
  const casMode = (id === "fire" && query.mode === "cas") || (id === "msds" && query.mode === "1") ||
    (id === "keco" && query.mode === "2") || (id === "ghs" && query.filters?.searchGubun === "2");
  if (casMode) {
    const numbers = Object.entries(fields).filter(([key]) => /^(casno|cas_no|casnum|casnumber)$/i.test(key))
      .map(([, value]) => String(value).trim()).filter(Boolean);
    return { state: numbers.length ? (numbers.every(n => n === query.keyword.trim()) ? "matched" : "mismatch") : "unverified",
      detail: numbers.length ? (numbers.every(n => n === query.keyword.trim()) ? "CAS 식별자 일치. 제품 조성·농도·적용 고시는 별도 확인" : "CAS 식별자 불일치. 동일 물질의 근거로 연결하지 말고 검색 조건·원문을 재확인하세요.") : "응답의 CAS 식별자를 확보하지 못해 동일성 미확인" };
  }
  return { state: "candidate", detail: "검색 조건으로 찾은 후보. 업체·주소·허가 범위·제품·모델·기간의 동일성은 원본과 대조 필요" };
}

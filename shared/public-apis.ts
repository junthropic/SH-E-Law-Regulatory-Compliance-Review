import type { AdditionalServiceId } from "./additional-search.js";
export const publicServices = [
  {
    id: "qna",
    name: "국민권익위원회 민원정책 질의응답",
    agency: "국민권익위원회",
    catalog: "15074671",
    placeholder: "예: 위험물",
    modes: [
      ["1", "제목"],
      ["2", "내용"],
    ],
    note: "개별 질의응답입니다. 회신 당시 법령·사실관계와 현재 사업장을 대조해야 합니다.",
  },
  {
    id: "fire",
    name: "소방청 국가 위험물 정보",
    agency: "소방청",
    catalog: "15061055",
    placeholder: "예: 67-56-1",
    modes: [
      ["cas", "CAS 번호 상세"],
      ["list", "전체 목록"],
    ],
    note: "물질 참고정보입니다. 실제 제품의 성분·농도와 지정수량·조례를 별도로 확인해야 합니다.",
  },
  {
    id: "msds",
    name: "안전보건공단 물질안전보건자료",
    agency: "한국산업안전보건공단",
    catalog: "15157612",
    placeholder: "예: 벤젠 / 71-43-2",
    modes: [
      ["0", "국문명"],
      ["1", "CAS 번호"],
      ["2", "UN 번호"],
      ["3", "KE 번호"],
      ["4", "EN 번호"],
    ],
    note: "공단 참고자료이며 공급자가 제공하는 제품별 SDS를 대체하지 않습니다. 상세 조회는 16개 항목을 요청합니다.",
  },
  {
    id: "smart",
    name: "안전보건법령 스마트검색",
    agency: "한국산업안전보건공단",
    catalog: "15123696",
    placeholder: "예: 사다리",
    modes: [
      ["0", "전체"],
      ["1", "법률"],
      ["2", "시행령"],
      ["3", "시행규칙"],
      ["4", "안전보건기준 규칙"],
      ["5", "고시·훈령·예규"],
      ["6", "미디어"],
      ["7", "KOSHA GUIDE"],
      ["8", "중대재해처벌법"],
      ["9", "중대재해처벌법 시행령"],
      ["11", "유해·위험작업 취업 제한 규칙"],
    ],
    note: "검색 결과는 원문 대조가 필요한 후보 자료입니다. 전체 검색은 분류별 10건씩 표시합니다. 법제처 원문·시행일·별표·부칙 검증은 별도로 필요합니다.",
  },
  {
    id: "keco",
    name: "한국환경공단 화학물질 정보",
    agency: "한국환경공단",
    catalog: "15149420",
    placeholder: "예: benzene / 71-43-2",
    modes: [
      ["1", "영문명"],
      ["2", "CAS 번호"],
      ["3", "고유번호"],
    ],
    note: "지정 유형·함량·예외·고시일을 함께 보존합니다. 실제 제품 조성과 검토 기준일의 고시를 대조해야 합니다.",
  },
  {
    id: "guide",
    name: "안전보건공단 기술지원규정 — KOSHA GUIDE",
    agency: "한국산업안전보건공단",
    catalog: "15144147",
    placeholder: "예: 작업환경측정",
    modes: [
      ["name", "규정명"],
      ["number", "규정번호"],
    ],
    note: "기술지침 목록과 원문 링크를 조회합니다. 본문은 원문을 내려받아 자료함에 추가하세요. 법적 의무와 구별하여 검토합니다.",
  },
] as const;
export type PublicServiceId = (typeof publicServices)[number]["id"];
export type LookupServiceId = PublicServiceId | AdditionalServiceId;
export type PublicQuery = {
  keyword: string;
  mode: string;
  page: number;
  filters?: Record<string, string>;
};
export type PublicRecord = {
  identityCheck?: {state: string; detail: string};
  id: string;
  service: LookupServiceId;
  title: string;
  fetchedAt: string;
  endpoint: string;
  catalogUrl: string;
  query: PublicQuery;
  fields: Record<string, unknown>;
  level: "list" | "detail" | "partial";
  warnings: string[];
  hash: string;
  canDetail: boolean;
};
export type PublicSearchResult = {
  items: PublicRecord[];
  total: number;
  page: number;
  hasMore: boolean;
  filteredOut?: number;
  scopeNote?: string;
};
export type PublicConnection = {
  id: string;
  connectorReady: boolean;
  configured: boolean;
  storage: "memory" | "windows-dpapi";
  storageError?: string;
  checkedAt?: string;
  state?: "ok" | "failed";
  message?: string;
};

export const additionalServiceIds = [
  "grievance",
  "ghs",
  "accidents",
  "accident-files",
  "sif",
  "chemical-accidents",
  "waste-companies",
  "waste-sanctions",
  "environment-agencies",
  "measurement-agencies",
  "land-use",
  "address",
  "ppe-cert",
  "machine-cert",
  "guard-cert",
  "ppe-declaration",
  "machine-declaration",
  "guard-declaration",
  "fire-approval",
  "fire-revocation",
  "air-facilities",
  "water-other",
  "dust-business",
  "gas-business",
  "specific-gas",
  "waste-fitness",
] as const;
export type AdditionalServiceId = (typeof additionalServiceIds)[number];
export type SearchField = {
  name: string;
  label: string;
  kind?: "date" | "text";
  required?: boolean;
  options?: readonly (readonly [string, string])[];
  initial?: string;
  placeholder?: string;
};
export type AdditionalSearchConfig = {
  keywordParam: string;
  keywordLabel: string;
  required?: boolean;
  kind?: "date";
  placeholder: string;
  fields: SearchField[];
  note: string;
};
const period: SearchField[] = [
  { name: "fromAprv", label: "검색 시작일", kind: "date", required: true },
  { name: "toAprv", label: "검색 종료일", kind: "date", required: true },
  {
    name: "gdsClCd",
    label: "품목 분류코드",
    required: true,
    placeholder: "예: 01 (소화기류)",
  },
];
const certificate: AdditionalSearchConfig = {
  keywordParam: "certNo",
  keywordLabel: "인증·신고 번호",
  required: true,
  placeholder: "인증서에 기재된 번호 그대로 입력",
  fields: [],
  note: "인증번호에 대한 진위 확인 자료입니다. 실제 설비·제품과 인증서의 동일성을 별도로 확인하세요. 결과 0건만으로 미인증이라고 판단하지 않습니다.",
};
const permit: AdditionalSearchConfig = {
  keywordParam: "cond[BPLC_NM::LIKE]",
  keywordLabel: "사업장명",
  placeholder: "예: 업체명 (비워두면 전체 목록)",
  fields: [
    { name: "cond[ROAD_NM_ADDR::LIKE]", label: "도로명주소" },
    { name: "cond[OPN_ATMY_GRP_CD::EQ]", label: "개방 자치단체 코드" },
  ],
  note: "인허가 행정자료입니다. 업체명만 같은 다른 사업장, 주소 변경, 갱신 지연을 대조해야 합니다. 검색 결과가 없다는 이유로 무허가로 판단하지 않습니다.",
};
export const additionalSearchConfigs: Record<
  AdditionalServiceId,
  AdditionalSearchConfig
> = {
  grievance: {
    keywordParam: "search",
    keywordLabel: "검색어",
    placeholder: "예: 위험물",
    fields: [
      { name: "reqFrom", label: "조회 시작일", kind: "date", required: true },
      { name: "reqTo", label: "조회 종료일", kind: "date", required: true },
    ],
    note: "결정 당시 법령·사실관계와 현재 사업장을 대조하세요. 기간 조건에 포함된 결정례만 조회합니다.",
  },
  ghs: {
    keywordParam: "searchNm",
    keywordLabel: "물질 검색어",
    required: true,
    placeholder: "예: 71-43-2",
    fields: [
      {
        name: "searchGubun",
        label: "물질 검색 구분",
        required: true,
        initial: "2",
        options: [
          ["1", "영문명"],
          ["2", "CAS 번호"],
          ["3", "고유번호"],
        ],
      },
    ],
    note: "GHS 분류 참고정보입니다. 실제 제품의 성분·농도와 기준일의 고시를 별도로 대조해야 합니다.",
  },
  accidents: {
    keywordParam: "keyword",
    keywordLabel: "재해사례 제목",
    placeholder: "예: 지게차",
    fields: [
      { name: "business", label: "게시판·업종", placeholder: "예: 제조업" },
    ],
    note: "사고사례 참고자료입니다. 사업장의 위반 사실을 입증하는 자료는 아닙니다. 상세에서 첨부파일 목록도 조회할 수 있습니다.",
  },
  "accident-files": {
    keywordParam: "boardno",
    keywordLabel: "재해사례 게시판 번호",
    required: true,
    placeholder: "A03 조회 결과의 boardno",
    fields: [],
    note: "첨부파일명과 원문 링크를 제공합니다. 파일 본문은 내려받은 뒤 자료함에 추가하세요.",
  },
  sif: {
    keywordParam: "disasterOverview",
    keywordLabel: "재해유형 검색어",
    required: true,
    placeholder: "예: 사다리",
    fields: [
      {
        name: "cateSeCd",
        label: "업종 구분코드",
        required: true,
        placeholder: "공식 서비스의 업종 구분코드",
      },
    ],
    note: "고위험요인 참고자료입니다. 업무 조건과 업종을 확인한 뒤 적용하세요.",
  },
  "chemical-accidents": {
    keywordParam: "yyyy",
    keywordLabel: "사고 연도",
    placeholder: "예: 2025 (비워두면 전체)",
    fields: [],
    note: "이 API는 연도별 목록을 제공합니다. 물질·지역·사고 내용은 조회 결과에서 확인하세요.",
  },
  "waste-companies": {
    keywordParam: "bzentyNm",
    keywordLabel: "폐기물 처리업체명",
    placeholder: "업체명 (비워두면 전체)",
    fields: [
      { name: "brNo", label: "사업자등록번호" },
      { name: "addr", label: "소재지" },
      { name: "cmptncSggNm", label: "관할 시·군·구" },
    ],
    note: "수탁업체 후보 조회입니다. 실제 허가증의 폐기물 종류·처리능력·영업범위와 대조해야 합니다.",
  },
  "waste-sanctions": {
    keywordParam: "bzentyNm",
    keywordLabel: "처분 대상 업체명",
    placeholder: "업체명 (비워두면 전체)",
    fields: [{ name: "admdspYmd", label: "행정처분일", kind: "date" }],
    note: "처분 내역 참고자료입니다. 동일 업체 여부, 처분 기간·효력과 후속 변경을 확인하세요.",
  },
  "environment-agencies": permit,
  "measurement-agencies": permit,
  "land-use": {
    keywordParam: "landUseNm",
    keywordLabel: "토지이용행위명",
    required: true,
    placeholder: "예: 공장",
    fields: [
      {
        name: "operation",
        label: "조회 내용",
        initial: "codes",
        required: true,
        options: [
          ["codes", "행위 코드 검색"],
          ["restrictions", "지역·지구별 행위제한 조회"],
        ],
      },
      { name: "areaCd", label: "시·군·구 코드 (행위제한 조회 시 필수)" },
      { name: "ucodeList", label: "지역·지구 코드 (행위제한 조회 시 필수)" },
    ],
    note: "주소만으로 지역·지구를 추정하지 않습니다. 실제 필지의 토지이용계획과 지역·지구 코드를 확인하세요.",
  },
  address: {
    keywordParam: "keyword",
    keywordLabel: "도로명·지번주소",
    required: true,
    placeholder: "예: 세종대로 110",
    fields: [],
    note: "주소 표준화 후보입니다. 해당 필지의 용도지역·인허가·관할을 자동 확정하지 않습니다.",
  },
  "ppe-cert": certificate,
  "machine-cert": certificate,
  "guard-cert": certificate,
  "ppe-declaration": certificate,
  "machine-declaration": certificate,
  "guard-declaration": certificate,
  "fire-approval": {
    keywordParam: "gdsCd",
    keywordLabel: "품목 코드",
    placeholder: "예: 04600 (가스자동소화장치)",
    fields: period,
    note: "소방용품 형식승인 조회입니다. 실제 제품의 승인번호·모델·제조업체를 대조하세요.",
  },
  "fire-revocation": {
    keywordParam: "gdsCd",
    keywordLabel: "품목 코드",
    placeholder: "예: 00300 (소화약제)",
    fields: period,
    note: "소방용품 형식승인 취소 조회입니다. 승인 조회와 같은 제품·기간 조건을 사용해 대조하세요.",
  },
  "air-facilities": permit,
  "water-other": permit,
  "dust-business": {
    ...permit,
    keywordParam: "cond[CNSTST_NM::LIKE]",
    keywordLabel: "공사장명",
    fields: [
      { name: "cond[LCTN_ROAD_NM_ADDR::LIKE]", label: "소재지 도로명주소" },
      { name: "cond[OPN_ATMY_GRP_CD::EQ]", label: "개방 자치단체 코드" },
    ],
  },
  "gas-business": permit,
  "specific-gas": permit,
  "waste-fitness": {
    keywordParam: "lcpmtBgngDt",
    keywordLabel: "최초 인허가일",
    kind: "date",
    required: true,
    placeholder: "최초 허가일을 확인하세요",
    fields: [],
    note: "최초 인허가일 기준의 적합성 확인 참고자료입니다. 현재 허가·영업 상태 전체를 대신하지 않습니다.",
  },
};
export const isAdditionalService = (id: string): id is AdditionalServiceId =>
  additionalServiceIds.includes(id as AdditionalServiceId);
export function initialSearchFilters(id: AdditionalServiceId) {
  return Object.fromEntries(
    additionalSearchConfigs[id].fields
      .filter((f) => f.initial !== undefined)
      .map((f) => [f.name, f.initial!]),
  );
}

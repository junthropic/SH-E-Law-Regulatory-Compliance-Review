import {
  PublicApiError,
  invalidResponse,
  requestOfficial,
} from "./public-api-transport.js";

// Official data.go.kr operation specifications and their public sample parameters,
// checked 2026-10-07. Catalog URLs are in shared/connection-catalog.ts.
// Fixed samples only: never transmit the user's workplace/question for a probe.
type ProbeSpec = {
  endpoint: string;
  keyParam: string;
  params: Record<string, string>;
};
export const additionalProbeSpecs: Record<string, ProbeSpec> = {
  "accident-files": {
    endpoint:
      "https://apis.data.go.kr/B552468/disaster_attach_api02/Disaster_attach_api02",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      boardno: "20250625101629Z7GLYM",
      callApiId: "1070",
    },
  },
  accidents: {
    endpoint:
      "https://apis.data.go.kr/B552468/disaster_api02/getdisaster_api02",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1060",
    },
  },
  "air-facilities": {
    endpoint:
      "https://apis.data.go.kr/1741000/air_pollution_facility_installation/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "dust-business": {
    endpoint:
      "https://apis.data.go.kr/1741000/dust_emission_business_info/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "environment-agencies": {
    endpoint:
      "https://apis.data.go.kr/1741000/environment_management_agencies/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "gas-business": {
    endpoint: "https://apis.data.go.kr/1741000/high_pressure_gas/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  ghs: {
    endpoint: "https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      searchGubun: "2",
      searchNm: "2437-25-4",
      returnType: "JSON",
    },
  },
  grievance: {
    endpoint:
      "https://apis.data.go.kr/1140100/ApiDiciService/selectApiDiciList",
    keyParam: "serviceKey",
    params: {
      search: "",
      reqFrom: "20220301",
      reqTo: "20220310",
      gbn: "1",
      pageSize: "1",
      pageIndex: "1",
    },
  },
  "guard-cert": {
    endpoint: "https://apis.data.go.kr/B552468/getprotect/getprotect_api01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1100",
      certNo: "16-AV2BL-0017",
    },
  },
  "guard-declaration": {
    endpoint: "https://apis.data.go.kr/B552468/getprotection/protection_api01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1150",
      certNo: "24-AV3FH-0027",
    },
  },
  "land-use": {
    endpoint:
      "https://apis.data.go.kr/1613000/arLandUseInfoService/DTsearchLunCd",
    keyParam: "serviceKey",
    params: {
      pageNum: "1",
      numOfRows: "1",
      landUseNm: "공장",
    },
  },
  "machine-cert": {
    endpoint: "https://apis.data.go.kr/B552468/getmachine/machine_api01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1110",
      certNo: "25BZ64C50090",
    },
  },
  "machine-declaration": {
    endpoint: "https://apis.data.go.kr/B552468/getmach/mach",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1130",
      certNo: "26AE1ER06089",
    },
  },
  "measurement-agencies": {
    endpoint:
      "https://apis.data.go.kr/1741000/environment_measurement_agencies/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "ppe-cert": {
    endpoint: "https://apis.data.go.kr/B552468/getprotector/getprotector_api01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1090",
      certNo: "24-AV4CR-0435",
    },
  },
  "ppe-declaration": {
    endpoint: "https://apis.data.go.kr/B552468/getguard/guard_api01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      callApiId: "1140",
      certNo: "25-AV1GM-0035",
    },
  },
  sif: {
    endpoint: "https://apis.data.go.kr/B552468/sifArchive/view",
    keyParam: "serviceKey",
    params: {
      callApiId: "1170",
      cateSeCd: "1",
      disasterOverview: "사다리",
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "specific-gas": {
    endpoint: "https://apis.data.go.kr/1741000/specific_high_pressure_gas/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "waste-companies": {
    endpoint:
      "https://apis.data.go.kr/B552584/kecoapi/wstdspBzentyService/getWstdspBzentyInfo",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      returnType: "xml",
    },
  },
  "waste-fitness": {
    endpoint: "https://apis.data.go.kr/B552584/ifCompatibleInfoService/getList",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      returnType: "json",
      lcpmtBgngDt: "2026-08-19",
    },
  },
  "waste-sanctions": {
    endpoint: "https://apis.data.go.kr/B552584/wstdspGrndsInfo/getlist",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      returnType: "JSON",
    },
  },
  "water-other": {
    endpoint:
      "https://apis.data.go.kr/1741000/water_pollution_source_other/info",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
    },
  },
  "chemical-accidents": {
    endpoint: "https://apis.data.go.kr/1480802/iciscsc/csclist",
    keyParam: "ServiceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      yyyy: "2020",
    },
  },
  "fire-approval": {
    endpoint: "https://apis.data.go.kr/B552486/opnFsuplAprv/opnFsuplAprv01",
    // The downloadable official guide and live gateway require lowercase s.
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      fromAprv: "20020101",
      toAprv: "20210218",
      gdsClCd: "01",
      gdsCd: "04600",
    },
  },
  "fire-revocation": {
    endpoint: "https://apis.data.go.kr/B552486/opnFsuplRtrcn/opnFsuplRtrcn01",
    keyParam: "serviceKey",
    params: {
      pageNo: "1",
      numOfRows: "1",
      fromAprv: "20020101",
      toAprv: "20210220",
      gdsClCd: "01",
      gdsCd: "00300",
    },
  },
  address: {
    endpoint: "https://business.juso.go.kr/addrlink/addrLinkApi.do",
    keyParam: "confmKey",
    params: {
      currentPage: "1",
      countPerPage: "1",
      keyword: "세종대로 110",
      resultType: "json",
    },
  },
};

const object = (value: any): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseProbeResponse(
  id: string,
  data: any,
  allowEmptyPage = false,
) {
  const kfi = id === "fire-approval" || id === "fire-revocation";
  const root = id === "address" ? data?.results : (data?.response ?? data);
  if (!object(root)) throw invalidResponse();
  const code = String(
    id === "address"
      ? (root.common?.errorCode ?? "")
      : id === "grievance"
        ? (root.resultCode ?? "")
        : (root.header?.resultCode ?? ""),
  ).trim();
  const success =
    id === "address"
      ? code === "0"
      : id === "grievance"
        ? ["S00", "00", "0", "200"].includes(code)
        : ["00", "0"].includes(code) ||
          ([
            "ghs",
            "waste-companies",
            "waste-sanctions",
            "waste-fitness",
          ].includes(id) &&
            code === "200");
  const empty =
    id === "grievance"
      ? ["E03", "20"].includes(code)
      : id !== "address" && ["03", "3"].includes(code);
  if (!success && !empty) {
    if (!code) throw invalidResponse();
    // Codes and messages may echo credentials; persist only fixed messages.
    throw new PublicApiError(
      "공공 API가 실패 코드를 반환했습니다. 해당 서비스 활용 승인·인증키·요청 조건·호출 한도를 확인하세요.",
    );
  }
  const body =
    id === "address"
      ? root.common
      : id === "grievance"
        ? root
        : kfi
          ? root.header
          : root.body;
  const rawTotal = id === "grievance" ? body?.totalCnt : body?.totalCount;
  if (empty && (rawTotal === undefined || rawTotal === ""))
    return { total: 0, count: 0 };
  if (!object(body) || !/^[0-9]+$/.test(String(rawTotal)))
    throw invalidResponse();
  const total = Number(rawTotal);
  if (!Number.isSafeInteger(total) || (empty && total !== 0))
    throw invalidResponse();
  const items =
    id === "address"
      ? root.juso
      : kfi
        ? root.data
        : (body.items?.item ?? body.items);
  if (total > 0 && !allowEmptyPage && !object(items) && !Array.isArray(items))
    throw invalidResponse();
  const count =
    items === undefined || items === null || items === ""
      ? 0
      : Array.isArray(items)
        ? items.length
        : 1;
  if (
    (total === 0 && count > 0) ||
    (total > 0 && count === 0 && !allowEmptyPage)
  )
    throw invalidResponse();
  return { total, count };
}

export async function probeAdditional(id: string, key: string) {
  const spec = additionalProbeSpecs[id];
  if (!spec) throw new PublicApiError("등록되지 않은 API 연결입니다.");
  const url = new URL(spec.endpoint);
  for (const [name, value] of Object.entries(spec.params))
    url.searchParams.set(name, value);
  url.searchParams.set(spec.keyParam, key);
  const result = parseProbeResponse(id, await requestOfficial(url));
  return {
    ok: true,
    ...result,
    message: result.total
      ? "공식 응답 확인"
      : "공식 정상 응답 확인 · 검색 결과 0건",
  };
}

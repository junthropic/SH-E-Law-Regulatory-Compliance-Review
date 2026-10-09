import { validCas } from "../shared/identifiers.js";
import { z } from "zod";
import {
  additionalSearchConfigs,
  type AdditionalServiceId,
} from "../shared/additional-search.js";
import type {
  PublicQuery,
  PublicRecord,
  PublicSearchResult,
} from "../shared/public-apis.js";
import {
  additionalProbeSpecs,
  parseProbeResponse,
} from "./public-api-probes.js";
import {
  PublicApiError,
  requestOfficial,
  invalidResponse,
  scrubPublicValue,
} from "./public-api-transport.js";
import { makePublicRecord } from "./public-records.js";
const Query = z.object({
  keyword: z.string().trim().max(100),
  mode: z.literal("search"),
  page: z.number().int().min(1).max(9999),
  filters: z.record(z.string(), z.string().trim().max(200)).default({}),
});
const datesCompact = new Set(["reqFrom", "reqTo", "fromAprv", "toAprv"]);
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function additionalRequest(id: AdditionalServiceId, input: PublicQuery) {
  const q = Query.parse(input),
    config = additionalSearchConfigs[id],
    spec = additionalProbeSpecs[id];
  const permitted = new Set(config.fields.map((f) => f.name));
  if (Object.keys(q.filters).some((k) => !permitted.has(k)))
    throw new PublicApiError("이 서비스가 지원하지 않는 검색 조건입니다.");
  if (config.required && !q.keyword)
    throw new PublicApiError(config.keywordLabel + "을 입력하세요.");
  if (config.kind === "date" && !validDate(q.keyword))
    throw new PublicApiError("날짜를 YYYY-MM-DD 형식으로 입력하세요.");
  const params: Record<string, string> = {};
  // Only fixed API identifiers/output formats carry over from connection probes.
  // NEVER carry over their sample dates, board numbers, certificates or addresses.
  for (const name of ["callApiId", "returnType"])
    if (spec.params[name]) params[name] = spec.params[name];
  for (const f of config.fields) {
    const value = q.filters[f.name] ?? f.initial ?? "";
    if (f.required && !value)
      throw new PublicApiError(f.label + "을 입력하세요.");
    if (!value) continue;
    if (f.options && !f.options.some(([v]) => v === value))
      throw new PublicApiError("검색 구분을 확인하세요.");
    if (f.kind === "date" && !validDate(value))
      throw new PublicApiError(f.label + " 형식을 확인하세요.");
    if (f.name !== "operation")
      params[f.name] = datesCompact.has(f.name)
        ? value.replaceAll("-", "")
        : value;
    q.filters[f.name] = value;
  }
  if (q.keyword) params[config.keywordParam] = q.keyword;
  for (const [start, end] of [
    ["reqFrom", "reqTo"],
    ["fromAprv", "toAprv"],
  ])
    if (params[start] && params[end] && params[start] > params[end])
      throw new PublicApiError("검색 시작일은 종료일보다 늦을 수 없습니다.");
  if (id === "ghs" && params.searchGubun === "2" && !validCas(q.keyword))
    throw new PublicApiError("CAS 번호 형식과 검증 숫자를 확인하세요.");
  if (id === "chemical-accidents" && q.keyword && !/^\d{4}$/.test(q.keyword))
    throw new PublicApiError("연도는 네 자리로 입력하세요.");
  if (
    config.keywordParam === "certNo" &&
    !/^[A-Za-z0-9-]{1,60}$/.test(q.keyword)
  )
    throw new PublicApiError("인증서의 인증·신고 번호를 확인하세요.");
  if (id === "accident-files" && !/^[A-Za-z0-9_-]{1,100}$/.test(q.keyword))
    throw new PublicApiError("게시판 번호 형식을 확인하세요.");
  if (id === "sif" && !/^\d{1,4}$/.test(params.cateSeCd))
    throw new PublicApiError("업종 구분코드를 확인하세요.");
  if (
    id.startsWith("fire-") &&
    (!/^\d{2}$/.test(params.gdsClCd) ||
      (q.keyword && !/^\d{5}$/.test(q.keyword)))
  )
    throw new PublicApiError("품목 분류코드는 2자리, 품목 코드는 5자리입니다.");
  let endpoint = spec.endpoint;
  if (
    id === "land-use" &&
    (q.filters.operation ?? "codes") === "restrictions"
  ) {
    if (!/^\d{5}$/.test(params.areaCd ?? "") || !params.ucodeList)
      throw new PublicApiError(
        "행위제한 조회에는 시·군·구 코드 5자리와 지역·지구 코드가 필요합니다.",
      );
    endpoint = endpoint.replace("/DTsearchLunCd", "/DTarLandUseInfo");
  } else if (id === "land-use") {
    delete params.areaCd;
    delete params.ucodeList;
  }
  if (id === "grievance")
    Object.assign(params, {
      gbn: "1",
      pageIndex: String(q.page),
      pageSize: "10",
    });
  else if (id === "address")
    Object.assign(params, {
      resultType: "json",
      currentPage: String(q.page),
      countPerPage: "10",
    });
  else if (id === "land-use" && q.filters.operation === "restrictions") {
    if (q.page !== 1)
      throw new PublicApiError("행위제한 조회는 페이지를 지원하지 않습니다.");
  } else
    Object.assign(params, {
      [id === "land-use" ? "pageNum" : "pageNo"]: String(q.page),
      numOfRows: "10",
    });
  return { endpoint, params, keyParam: spec.keyParam, query: q };
}
function rowsOf(id: string, data: any): Record<string, unknown>[] {
  const root = data?.response ?? data;
  const value =
    id === "address"
      ? data?.results?.juso
      : id === "grievance"
        ? (root.items?.item ?? root.items)
        : id.startsWith("fire-")
          ? root.data
          : (root.body?.items?.item ?? root.body?.items ?? root.body?.item);
  if (value === undefined || value === null || value === "") return [];
  const rows = Array.isArray(value) ? value : [value];
  if (
    !rows.every(
      (r) =>
        r &&
        typeof r === "object" &&
        !Array.isArray(r) &&
        Object.keys(r).length,
    )
  )
    throw invalidResponse();
  return rows;
}
export async function searchAdditional(
  id: AdditionalServiceId,
  key: string,
  input: PublicQuery,
): Promise<PublicSearchResult> {
  const { endpoint, params, keyParam, query } = additionalRequest(id, input),
    url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set(keyParam, key);
  const data = await requestOfficial(url);
  const summary = parseProbeResponse(id, data, query.page > 1);
  const rows = rowsOf(id, data).map((r) => scrubPublicValue(r, key));
  if (
    (summary.total === 0 && rows.length) ||
    (summary.total > 0 && query.page === 1 && !rows.length)
  )
    throw invalidResponse();
  const fullRestrictions =
    id === "land-use" && query.filters.operation === "restrictions";
  if (fullRestrictions) {
    const root = data?.response ?? data;
    const conditions = root.body?.QnodeCond ?? root.body?.items?.QnodeCond;
    if (conditions !== undefined)
      for (const row of rows) row.QnodeCond = scrubPublicValue(conditions, key);
  }
  const matching =
    id === "accidents"
      ? rows.filter(
          (row) =>
            (!query.keyword ||
              String(row.keyword ?? "").includes(query.keyword)) &&
            (!query.filters.business ||
              String(row.business ?? "").includes(query.filters.business)),
        )
      : rows;
  const filteredOut = rows.length - matching.length;
  const scopeNote = filteredOut
    ? `기관 응답에서 제목·업종이 검색 조건과 다른 ${filteredOut}건을 제외했습니다. 전체 건수는 기관 제공값이며 조건에 맞는 전체 건수는 확인되지 않았습니다. 다음 페이지도 확인하세요.`
    : undefined;
  return {
    ...(scopeNote ? { filteredOut, scopeNote } : {}),
    items: matching.map((r) =>
      makePublicRecord(
        id,
        r,
        endpoint,
        query,
        "list",
        fullRestrictions
          ? [
              "행위제한·조건·예외 필드를 함께 보존했습니다. 기준일 법령·조례 원문과 대조가 필요합니다.",
            ]
          : scopeNote
            ? [scopeNote]
            : [],
      ),
    ),
    total: summary.total,
    page: query.page,
    hasMore:
      !fullRestrictions && rows.length > 0 && query.page * 10 < summary.total,
  };
}
export async function detailAdditional(
  item: PublicRecord,
  key: string,
): Promise<PublicRecord> {
  if (item.service === "accidents") {
    const attachments = await searchAdditional("accident-files", key, {
      keyword: String(item.fields.boardno),
      mode: "search",
      page: 1,
    });
    return makePublicRecord(
      "accidents",
      {
        ...item.fields,
        attachments: attachments.items.map((r) => r.fields),
        attachmentSource: additionalProbeSpecs["accident-files"].endpoint,
        attachmentFetchedAt: new Date().toISOString(),
        attachmentTotal: attachments.total,
      },
      item.endpoint,
      item.query,
      "partial",
      [
        "첨부파일 목록의 첫 페이지를 조회했습니다. 파일 본문은 별도 확인해야 합니다.",
        ...(attachments.hasMore
          ? [
              "첨부파일 목록에 다음 페이지가 있습니다. A04에서 게시판 번호로 조회하세요.",
            ]
          : []),
      ],
    );
  }
  if (item.service !== "grievance")
    throw new PublicApiError("이 자료는 추가 상세 API가 없습니다.");
  const docId = String(item.fields.docMngNo ?? "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(docId)) throw invalidResponse();
  const endpoint = additionalProbeSpecs.grievance.endpoint.replace(
      "selectApiDiciList",
      "selectApiDiciDetail",
    ),
    url = new URL(endpoint);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("docMngNo", docId);
  url.searchParams.set("gbn", "1");
  const data = await requestOfficial(url),
    root = data?.response ?? data;
  if (
    !["S00", "00", "0", "200"].includes(String(root?.resultCode)) ||
    String(root?.docMngNo) !== docId ||
    (!root.resultCn && !root.reason)
  )
    throw new PublicApiError(
      "요청한 결정례의 상세 본문·문서번호를 확인하지 못했습니다.",
    );
  return makePublicRecord(
    "grievance",
    scrubPublicValue(root, key),
    endpoint,
    item.query,
    "detail",
  );
}

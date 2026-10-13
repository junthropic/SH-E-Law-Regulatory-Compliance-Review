import { validCas } from "../shared/identifiers.js";
import { makePublicRecord as record } from "./public-records.js";
import {
  searchAdditional,
  detailAdditional,
  additionalRequest,
} from "./additional-apis.js";
import { isAdditionalService } from "../shared/additional-search.js";
import {
  PublicApiError,
  invalidResponse as invalid,
  requestOfficial,
  withPublicApiState,
  scrubPublicValue as scrub,
} from "./public-api-transport.js";
import { probeAdditional } from "./public-api-probes.js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  publicServices,
  type PublicServiceId,
  type LookupServiceId,
  type PublicQuery,
  type PublicRecord,
  type PublicSearchResult,
} from "../shared/public-apis.js";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { ingestDocument } from "./documents.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { CollectionJournal } from "./collection-journal-v2.js";

const bases: Record<PublicServiceId, string> = {
  qna: "1140100/CivilPolicyQnaService",
  fire: "1661000/materialInfoSvc",
  msds: "B552468/msdschem1",
  smart: "B552468/srch",
  keco: "B552584/kecoapi/ncissbstn",
  guide: "B552468/koshaguide",
};
const Id = z.enum(["qna", "fire", "msds", "smart", "keco", "guide"]);
const Search = z.object({
  keyword: z.string().trim().max(100),
  mode: z.string().max(20),
  page: z.number().int().min(1).max(9999).default(1),
  filters: z.record(z.string(), z.string().trim().max(200)).optional(),
});
type Query = z.infer<typeof Search>;
const arr = (v: any): Record<string, any>[] =>
  v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v];
const obj = (v: any): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function normalizeServiceKey(key: string) {
  let value = key.trim();
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      throw new PublicApiError("인증키 인코딩이 올바르지 않습니다.");
    }
  }
  if (!/^[A-Za-z0-9+/=_-]{8,512}$/.test(value))
    throw new PublicApiError(
      "공공데이터포털의 일반 인증키를 입력하세요. URL 전체는 입력하지 마세요.",
    );
  return value;
}
async function request(
  id: PublicServiceId,
  operation: string,
  key: string,
  params: Record<string, string>,
) {
  const endpoint = `https://apis.data.go.kr/${bases[id]}/${operation}`;
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set(id === "fire" ? "ServiceKey" : "serviceKey", key);
  const data = await requestOfficial(url);
  const root = data?.response ?? data;
  const code = String(
    id === "qna" ? (root?.resultCode ?? "") : (root?.header?.resultCode ?? ""),
  ).trim();
  const empty =
    (id === "qna" && code === "E03") ||
    (id !== "qna" && ["03", "3"].includes(code));
  const success =
    id === "qna"
      ? code === "S00"
      : ["00", "0"].includes(code) || (id === "keco" && code === "200");
  if (!empty && !success) {
    if (!code) throw invalid();
    // Do not echo provider strings, even a resultCode may contain the submitted key.
    throw new PublicApiError(
      "공공 API가 실패 코드를 반환했습니다. 해당 서비스 활용 승인·인증키·요청 조건·호출 한도를 확인하세요.",
    );
  }
  return { root: scrub(root, key), endpoint, empty };
}
function bodyItems(root: any) {
  const b = root?.body;
  return arr(Array.isArray(b?.items) ? b.items : (b?.items?.item ?? b?.item));
}
export function validatePublicQuery(id:LookupServiceId,input:Query){
  if(isAdditionalService(id))return additionalRequest(id,input).query;
  const q = Search.parse(input),
    config = publicServices.find((s) => s.id === id)!;
  if (!config.modes.some((m) => m[0] === q.mode))
    throw new PublicApiError("지원하지 않는 검색 구분입니다.");
  if (!(id === "fire" && q.mode === "list") && !q.keyword)
    throw new PublicApiError("검색어를 입력하세요.");
  if (q.filters && Object.keys(q.filters).length)
    throw new PublicApiError("이 검색 구분은 추가 필터를 지원하지 않습니다.");
  if (
    ((id === "fire" && q.mode === "cas") ||
      (id === "msds" && q.mode === "1") ||
      (id === "keco" && q.mode === "2")) &&
    !validCas(q.keyword)
  )
    throw new PublicApiError(
      "CAS 번호 형식과 검증 숫자를 확인하세요. 예: 67-56-1",
    );
  if (id === "msds" && q.mode === "2" && !/^\d{4}$/.test(q.keyword))
    throw new PublicApiError("UN 번호는 네 자리 숫자로 입력하세요.");
  if (id === "fire" && q.mode === "cas" && q.page !== 1)
    throw new PublicApiError("CAS 상세 조회는 페이지를 지원하지 않습니다.");
  return q;
}
export async function searchPublic(
  id: LookupServiceId,
  key: string,
  input: Query,
): Promise<PublicSearchResult> {
  if (isAdditionalService(id)) return searchAdditional(id, key, input);
  const q=validatePublicQuery(id,input);
  let operation = "",
    params: Record<string, string> = {
      pageNo: String(q.page),
      numOfRows: "10",
    };
  switch (id) {
    case "qna":
      operation = "PolicyQnaList";
      params = {
        firstIndex: String(q.page),
        recordCountPerPage: "10",
        type: "3",
        keyword: q.keyword,
        searchType: q.mode,
      };
      break;
    case "fire":
      operation = q.mode === "cas" ? "getMaterialInfo" : "getMaterialList";
      if (q.mode === "cas") params.casNo = q.keyword;
      break;
    case "msds":
      operation = "getChemList001";
      Object.assign(params, { searchWrd: q.keyword, searchCnd: q.mode });
      break;
    case "smart":
      operation = "smartSearch";
      Object.assign(params, { searchValue: q.keyword, category: q.mode });
      break;
    case "keco":
      operation = "chemSbstnList";
      Object.assign(params, {
        searchGubun: q.mode,
        searchNm: q.keyword,
        returnType: "JSON",
      });
      break;
    case "guide":
      operation = "getKoshaGuide";
      Object.assign(params, {
        callApiId: "1050",
        [q.mode === "number" ? "techGdlnNo" : "techGdlnNm"]: q.keyword,
      });
      break;
  }
  const { root, endpoint, empty } = await request(id, operation, key, params);
  if (empty) return { items: [], total: 0, page: q.page, hasMore: false };
  const rows = id === "qna" ? arr(root.resultList) : bodyItems(root);
  // The live fire CAS-detail operation returns a single body.item without pagination metadata.
  // Only that documented detail shape may derive its count from the returned item(s).
  const fireDetail = id === "fire" && q.mode === "cas";
  const count =
    id === "qna"
      ? root.resultCount
      : (root.body?.totalCount ??
        (fireDetail && root.body?.item !== undefined
          ? rows.length
          : undefined));
  const total = Number(count);
  if (
    count === undefined ||
    count === "" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !rows.every(obj) ||
    (total > 0 && !rows.length && q.page === 1)
  )
    throw invalid();
  if (rows.length > 100 || (total === 0 && rows.length)) throw invalid();
  let pageTotal = total;
  if (id === "smart" && q.mode === "0") {
    // All-category searches paginate each category separately. The aggregate count
    // would otherwise offer empty pages after the largest category is exhausted.
    const counts = root.body?.categorycount;
    if (!obj(counts) || !Object.keys(counts).length) throw invalid();
    const values = Object.values(counts).map(Number);
    if (values.some((n) => !Number.isSafeInteger(n) || n < 0)) throw invalid();
    pageTotal = Math.max(...values);
  }
  const identities: Record<PublicServiceId, string[]> = {
    qna: ["faqNo", "title"],
    fire: ["casno"],
    msds: ["chemId", "chemNameKor"],
    smart: ["title"],
    keco: ["sbstnId"],
    guide: ["techGdlnNm"],
  };
  if (
    rows.some((row) =>
      identities[id].some(
        (field) =>
          !["string", "number"].includes(typeof row[field]) ||
          String(row[field]).trim() === "",
      ),
    )
  )
    throw invalid();
  return {
    items: rows.map((r) =>
      record(
        id,
        r,
        endpoint,
        q,
        id === "fire" && q.mode === "cas" ? "detail" : "list",
      ),
    ),
    total,
    page: q.page,
    hasMore: q.page * 10 < pageTotal,
  };
}
export async function detailPublic(
  item: PublicRecord,
  key: string,
): Promise<PublicRecord> {
  if (!item.canDetail)
    throw new PublicApiError("이 자료는 추가 상세 API가 없습니다.");
  const id = item.service;
  if (isAdditionalService(id)) return detailAdditional(item, key);
  if (id === "fire") {
    const result = await searchPublic(id, key, {
      keyword: String(item.fields.casno),
      mode: "cas",
      page: 1,
    });
    if (!result.items.length)
      throw new PublicApiError("해당 물질의 상세 자료가 없습니다.");
    return result.items[0];
  }
  if (id === "qna") {
    const { root, endpoint, empty } = await request(id, "PolicyQnaItem", key, {
      faqNo: String(item.fields.faqNo),
      dutySctnNm: String(item.fields.dutySctnNm),
    });
    if (
      empty ||
      !obj(root.resultData) ||
      !root.resultData.ansCntnCl ||
      String(root.resultData.faqNo) !== String(item.fields.faqNo)
    )
      throw new PublicApiError(
        "해당 질의응답의 답변 본문을 확인하지 못했습니다.",
      );
    return record(id, root.resultData, endpoint, item.query, "detail");
  }
  const sections: Record<string, unknown> = {};
  const gaps: string[] = [];
  for (let start = 1; start <= 16; start += 4) {
    await Promise.all(
      Array.from({ length: 4 }, async (_, i) => {
        const section = start + i,
          operation = `getChemDetail${String(section).padStart(2, "0")}1`;
        try {
          const { root, empty } = await request("msds", operation, key, {
            chemId: String(item.fields.chemId),
          });
          const rows = bodyItems(root);
          if (empty || !rows.length || !rows.every(obj)) throw invalid();
          sections[String(section)] = rows;
        } catch {
          gaps.push(`MSDS ${section}번 항목을 수집하지 못했습니다.`);
        }
      }),
    );
  }
  if (gaps.length === 16)
    throw new PublicApiError(
      "MSDS 상세 항목을 모두 수집하지 못했습니다. 상세 API 활용 승인을 확인하세요.",
    );
  return record(
    "msds",
    { ...item.fields, sections },
    `https://apis.data.go.kr/${bases.msds}/getChemDetail011 … getChemDetail161`,
    item.query,
    gaps.length ? "partial" : "detail",
    gaps.sort(),
  );
}

export function registerPublicApis(
  app: FastifyInstance,
  store: Store,
  vault: Vault,
  memory: boolean,
  searchFacade?: (service:LookupServiceId,query:Query)=>Promise<PublicSearchResult>,
) {
  // Search results are temporary. Only an explicit import writes a durable document snapshot.
  const cache = new Map<string, PublicRecord>();
  function cacheItems(items: PublicRecord[]) {
    for (const [id, item] of cache)
      if (Date.now() - Date.parse(item.fetchedAt) > 30 * 60 * 1000)
        cache.delete(id);
    for (const item of items) cache.set(item.id, item);
    let bytes = [...cache.values()].reduce(
      (sum, item) => sum + Buffer.byteLength(JSON.stringify(item)),
      0,
    );
    while (cache.size > 100 || bytes > 24_000_000) {
      const first = cache.keys().next().value!;
      bytes -= Buffer.byteLength(JSON.stringify(cache.get(first)));
      cache.delete(first);
    }
  }
  const idOf = (params: unknown) =>
    z.object({ service: Id }).parse(params).service;
  const connectionIdOf = (params: unknown) =>
    z
      .object({
        service: z
          .string()
          .refine((id) => connectionServices.some((s) => s.id === id)),
      })
      .parse(params).service;
  async function keyOf(id: string) {
    const key = await vault.read<string>(`public-${id}`);
    if (!key)
      throw new PublicApiError(
        "연결 설정에서 해당 서비스 인증키를 먼저 저장하세요.",
      );
    return key;
  }
  const stateKey = (id: string) => `public-api-${id}`;
  async function checked<T>(id: string, action: () => Promise<T>, query?: Query) {
    const journal = query ? new CollectionJournal(store) : undefined;
    const jobId = journal?.start(id, JSON.stringify([query!.keyword, query!.mode, Object.entries(query!.filters || {}).sort()]));
    try {
      const result = await withPublicApiState(store, action);
      if (journal && jobId) journal.page(jobId, result as PublicSearchResult);
      const probe = obj(result) && result.ok === true ? result : undefined;
      store.put("settings", stateKey(id), {
        state: "ok",
        checkedAt: new Date().toISOString(),
        message:
          probe?.total === 0
            ? "목록·검색 정상 응답 확인 · 검색 결과 0건 (상세·원문 완전성은 별도)"
            : "목록·검색 응답 확인 (상세·원문 완전성은 별도)",
        ...(probe ? { count: probe.count, total: probe.total } : {}),
      });
      return result;
    } catch (e) {
      if (journal && jobId) journal.failure(jobId, e instanceof PublicApiError ? e.code : "upstream");
      const message =
        e instanceof PublicApiError
          ? e.message
          : "공공 API 연결 처리 실패. 인증 저장소 또는 서비스 상태를 확인하세요.";
      store.put("settings", stateKey(id), {
        state: "failed",
        checkedAt: new Date().toISOString(),
        message,
      });
      throw e instanceof PublicApiError ? e : new PublicApiError(message);
    }
  }
  app.get("/api/public-apis", async () => {
    const statuses = [];
    for (const service of connectionServices) {
      let configured = false,
        storageError = "";
      try {
        configured = !!(await vault.read<string>(`public-${service.id}`));
      } catch {
        storageError =
          "보호 저장소를 읽을 수 없습니다. 저장한 Windows 사용자로 실행하세요.";
      }
      statuses.push({
        id: service.id,
        configured,
        storage: memory ? "memory" : "windows-dpapi",
        storageError,
        ...store.setting(stateKey(service.id), {}),
        connectorReady: service.ready,
      });
    }
    return statuses;
  });
  app.post("/api/public-apis/:service/key", async (req, reply) => {
    const id = connectionIdOf(req.params),
      body = z
        .object({
          key: z.string().min(8).max(1500),
          replace: z.boolean().default(false),
        })
        .parse(req.body);
    const key = normalizeServiceKey(body.key);
    const previous = await vault.read<string>(`public-${id}`);
    if (previous === key)
      return {
        saved: true,
        unchanged: true,
        readBackVerified: true,
        storage: memory ? "memory" : "windows-dpapi",
      };
    if (previous && !body.replace)
      return reply.code(409).send({
        error:
          "이미 API 키가 저장되어 있습니다. 저장 상태를 확인한 뒤 기존 키 교체를 승인하세요.",
      });
    await vault.write(`public-${id}`, key);
    if ((await vault.read<string>(`public-${id}`)) !== key)
      throw new PublicApiError("저장한 인증키 재읽기 검증에 실패했습니다.");
    store.put("settings", stateKey(id), {});
    cache.clear();
    store.audit("public_api_key_saved", id);
    return {
      saved: true,
      replaced: !!previous,
      readBackVerified: true,
      storage: memory ? "memory" : "windows-dpapi",
    };
  });
  app.delete("/api/public-apis/:service/key", async (req) => {
    const id = connectionIdOf(req.params);
    vault.remove(`public-${id}`);
    store.put("settings", stateKey(id), {});
    cache.clear();
    return { removed: true };
  });
  app.post("/api/public-apis/:service/probe", async (req) => {
    const service = connectionServices.find(
      (s) => s.id === connectionIdOf(req.params),
    )!;
    if (isAdditionalService(service.id))
      return checked(service.id, async () =>
        probeAdditional(service.id, await keyOf(service.id)),
      );
    const id = idOf(req.params),
      examples: Record<PublicServiceId, Query> = {
        qna: { keyword: "위험물", mode: "1", page: 1 },
        fire: { keyword: "67-56-1", mode: "cas", page: 1 },
        msds: { keyword: "71-43-2", mode: "1", page: 1 },
        smart: { keyword: "사다리", mode: "0", page: 1 },
        keco: { keyword: "71-43-2", mode: "2", page: 1 },
        guide: { keyword: "작업환경측정", mode: "name", page: 1 },
      };
    return checked(id, async () => {
      const result = await searchPublic(id, await keyOf(id), examples[id]);
      return {
        ok: true,
        count: result.items.length,
        total: result.total,
        message: result.total
          ? "공식 응답 확인"
          : "공식 정상 응답 확인 · 검색 결과 0건",
      };
    });
  });
  app.post("/api/public-apis/:service/search", async (req) => {
    const id = connectionIdOf(req.params) as LookupServiceId,
      query = Search.parse(req.body);
    if (isAdditionalService(id)) additionalRequest(id, query);
    return checked(id, async () => {
      const result = searchFacade ? await searchFacade(id,query) : await searchPublic(id, await keyOf(id), query);
      cacheItems(result.items);
      return result;
    }, query);
  });
  function cached(params: unknown) {
    const { recordId } = z
        .object({ recordId: z.string().uuid() })
        .parse(params),
      item = cache.get(recordId);
    if (!item || Date.now() - Date.parse(item.fetchedAt) > 30 * 60 * 1000)
      throw new PublicApiError("조회 자료가 만료되었습니다. 다시 검색하세요.");
    return item;
  }
  app.post("/api/public-api-records/:recordId/detail", async (req) => {
    const item = cached(req.params),
      key = await keyOf(item.service === "accidents" ? "accident-files" : item.service),
      result = await withPublicApiState(store, () => detailPublic(
        item,
        key,
      ));
    cacheItems([result]);
    return result;
  });
  app.post("/api/public-api-records/:recordId/import", async (req) => {
    const item = cached(req.params),
      service = connectionServices.find((s) => s.id === item.service)!;
    const warning =
      "공공 API 참고자료입니다. 원문·기준일·적용 조건을 확인해야 하며 법률 위반 확정 근거로 자동 승인되지 않습니다.";
    const text = [
      `출처: ${service.name}`,
      `공식 안내: ${item.catalogUrl}`,
      `호출 경로(인증값 제외): ${item.endpoint}`,
      `조회 시각: ${item.fetchedAt}`,
      `자료 단계: ${item.level}`,
      `검색 조건: ${JSON.stringify(item.query)}`,
      `본문 SHA-256: ${item.hash}`,
      warning,
      ...item.warnings,
      "",
      "API 제공 필드:",
      JSON.stringify(item.fields, null, 2),
    ].join("\n");
    const doc = await ingestDocument(
      store,
      `${service.id}-${item.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80)}.txt`,
      Buffer.from(text),
    );
    doc.agency =
      publicServices.find((s) => s.id === item.service)?.agency ??
      service.name.split("_")[0];
    doc.warnings = [
      ...new Set([
        ...doc.warnings,
        warning,
        ...item.warnings,
        ...(item.level === "list"
          ? ["목록 정보만 수집되었습니다. 본문·원문을 추가로 확인하세요."]
          : []),
      ]),
    ];
    store.put("documents", doc.id, doc);
    store.audit("public_api_import", `${item.service}:${item.hash}`);
    return doc;
  });
  // v8 beta key screen: the same save/remove steps as the per-service routes above, for one key across services.
  return {
    async saveKey(id: string, raw: string, replace: boolean): Promise<"unchanged" | "saved" | "replaced" | "conflict"> {
      const key = normalizeServiceKey(raw), previous = await vault.read<string>(`public-${id}`);
      if (previous === key) return "unchanged";
      if (previous && !replace) return "conflict";
      await vault.write(`public-${id}`, key);
      if ((await vault.read<string>(`public-${id}`)) !== key)
        throw new PublicApiError("저장한 인증키 재읽기 검증에 실패했습니다.");
      store.put("settings", stateKey(id), {});
      cache.clear();
      store.audit("public_api_key_saved", id);
      return previous ? "replaced" : "saved";
    },
    removeKey(id: string) {
      vault.remove(`public-${id}`);
      store.put("settings", stateKey(id), {});
      cache.clear();
    },
  };
}

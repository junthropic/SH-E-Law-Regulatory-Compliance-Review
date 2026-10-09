import { publicMatch } from "./public-match.js";
import { randomUUID } from "node:crypto";
import {
  publicServices,
  type LookupServiceId,
  type PublicQuery,
  type PublicRecord,
} from "../shared/public-apis.js";
import {
  additionalSearchConfigs,
  type AdditionalServiceId,
} from "../shared/additional-search.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { sha } from "./store.js";
import { PublicApiError } from "./public-api-transport.js";
export function makePublicRecord(
  id: LookupServiceId,
  fields: Record<string, any>,
  endpoint: string,
  query: PublicQuery,
  level: PublicRecord["level"] = "list",
  warnings: string[] = [],
): PublicRecord {
  if (Buffer.byteLength(JSON.stringify(fields)) > 1_000_000)
    throw new PublicApiError(
      "한 자료의 응답이 저장 한도를 초과했습니다. 원문을 별도 문서로 확인하세요.",
    );
  const core = publicServices.find((s) => s.id === id);
  const s = connectionServices.find((s) => s.id === id)!;
  const note =
    core?.note ??
    additionalSearchConfigs[id as AdditionalServiceId]?.note ??
    s.purpose;
  const title = String(
    fields.qnaTitl ||
      fields.title ||
      fields.chemicalname ||
      fields.materialkorname ||
      fields.chemNameKor ||
      fields.sbstnNmKor ||
      fields.sbstnNmEng ||
      fields.techGdlnNm ||
      fields.bllNm ||
      fields.keyword ||
      fields.filenm ||
      fields.disasterOverview ||
      fields.bzentyNm ||
      fields.BPLC_NM ||
      fields.CNSTST_NM ||
      fields.gdsNm ||
      fields.roadAddr ||
      fields.LUN_NM ||
      fields.UNAME ||
      fields.dataNo ||
      (fields.docAuthYn !== undefined
        ? query.keyword + " · 인증 확인"
        : s.name),
  );
  return {
    id: randomUUID(),
    service: id,
    title,
    fields,
    endpoint,
    query,
    catalogUrl: s.url,
    fetchedAt: new Date().toISOString(),
    level,
    warnings: [note, publicMatch(id, fields, query).detail, ...warnings],
    identityCheck: publicMatch(id, fields, query),
    hash: sha(JSON.stringify(fields)),
    canDetail:
      level === "list" &&
      ((id === "qna" &&
        !!fields.faqNo &&
        ["tqapttn", "tqaplcy"].includes(fields.dutySctnNm)) ||
        (id === "msds" && !!fields.chemId) ||
        (id === "fire" && !!fields.casno) ||
        (id === "grievance" && !!fields.docMngNo) ||
        (id === "accidents" && !!fields.boardno)),
  };
}

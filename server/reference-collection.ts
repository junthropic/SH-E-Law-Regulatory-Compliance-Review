import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LawConnector,
  dateIso,
  normalizeLaw,
  parseBody,
  publicLawUrl,
} from "./sources.js";
import { Store, sha, evidenceIdentity } from "./store.js";
import {
  regions,
  type Evidence,
  type ReviewRequest,
  type ReviewResult,
} from "../shared/types.js";
import { applicable } from "./legal.js";
import { koreaDate } from "../shared/dates.js";

export class ReferenceCollectionError extends Error {}

const compact = (s: unknown) => String(s || "").replace(/\s/g, "");
const rowTitle = (r: any) =>
  String(r.자치법규명 || r.법령명한글 || r.행정규칙명 || "");
const rowId = (r: any) =>
  String(r.자치법규일련번호 || r.법령일련번호 || r.행정규칙일련번호 || "");
const entityId = (r: any) =>
  String(r.자치법규ID || r.법령ID || r.행정규칙ID || "");
export type LinkedBasis = {
  request: Pick<ReviewRequest, "region" | "municipality" | "asOf">;
  evidence: Evidence;
};

function inJurisdiction(row: any, request: ReviewRequest) {
  const title = compact(rowTitle(row));
  if (title.startsWith(compact(request.region))) return true;
  if (!request.municipality || !title.startsWith(compact(request.municipality)))
    return false;
  const authority = compact(row.지자체기관명 || row.소관기관명);
  const code = regions.find((r) => r[1] === request.region)?.[0];
  return (
    authority.includes(compact(request.region)) ||
    String(row.광역시도코드 || "") === code
  );
}

// Exact-title history search is bounded; unknown or competing versions remain unresolved.
export function selectReferenceRow(
  rows: any[],
  title: string,
  request: ReviewRequest,
  target: string,
) {
  const exact = rows.filter(
    (r) =>
      compact(rowTitle(r)) === compact(title) &&
      (target !== "ordin" || inJurisdiction(r, request)),
  );
  const eligible = exact.filter((r) => {
    const d = dateIso(r.시행일자);
    return d && d <= request.asOf;
  });
  if (!eligible.length)
    throw new ReferenceCollectionError(
      "제목·지역·기준일이 일치하는 버전을 찾지 못했습니다. 명칭 변경·연혁·소관기관 확인이 필요합니다.",
    );
  const identities = new Set(eligible.map(entityId).filter(Boolean));
  if (identities.size > 1)
    throw new ReferenceCollectionError(
      "같은 제목에 서로 다른 법규 식별자가 있습니다. 소관기관과 법규를 대조하세요.",
    );
  eligible.sort(
    (a, b) =>
      dateIso(b.시행일자).localeCompare(dateIso(a.시행일자)) ||
      dateIso(b.공포일자 || b.발령일자).localeCompare(
        dateIso(a.공포일자 || a.발령일자),
      ),
  );
  const first = eligible[0];
  const peers = eligible.filter(
    (r) =>
      dateIso(r.시행일자) === dateIso(first.시행일자) &&
      dateIso(r.공포일자 || r.발령일자) ===
        dateIso(first.공포일자 || first.발령일자),
  );
  if (new Set(peers.map(rowId)).size !== 1 || !/^\d+$/.test(rowId(first)))
    throw new ReferenceCollectionError(
      "기준일 버전이 충돌하거나 버전 식별자가 없습니다.",
    );
  if (
    ["폐지", "타법폐지", "일괄폐지"].includes(
      String(first.제개정구분명 || first.제개정정보 || ""),
    )
  )
    throw new ReferenceCollectionError(
      "기준일의 최신 이력이 폐지입니다. 이전 버전을 현행 근거로 되살리지 않습니다.",
    );
  return first;
}

export async function collectReference(
  store: Store,
  oc: string,
  request: ReviewRequest,
  title: string,
  injected?: LawConnector,
): Promise<Evidence> {
  if (!oc.trim())
    throw new ReferenceCollectionError("연결 설정에 법제처 OC를 저장하세요.");
  if (request.asOf > koreaDate())
    throw new ReferenceCollectionError(
      "미래 기준일의 적용 원문은 확정할 수 없습니다. 기준일을 확인하세요.",
    );
  const deadline = AbortSignal.timeout(180000);
  const connector =
    injected ||
    new LawConnector(oc, (url, init) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.any([
          deadline,
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
    );
  const local =
    /조례/.test(title) ||
    (title.endsWith("규칙") &&
      [request.region, request.municipality]
        .filter(Boolean)
        .some((v) => compact(title).startsWith(compact(v))));
  let target = local ? "ordin" : "eflaw";
  const current = await connector.list(target, title, { nw: local ? "1" : "3" }, 3);
  const exactCurrent = current.filter(r => compact(rowTitle(r)) === compact(title));
  const currentIds = [...new Set(exactCurrent.map(entityId).filter(Boolean))];
  // The official LID filter keeps similarly named laws and old repealed entities
  // out of a current law's history. Historical requests keep the wider search.
  const scopedId = !local && currentIds.length === 1 && exactCurrent.some(r => dateIso(r.시행일자) && dateIso(r.시행일자) <= request.asOf)
    ? currentIds[0] : undefined;
  let rows = [...current, ...(await connector.list(target, title,
    { nw: local ? "2" : "1", ...(scopedId ? { LID: scopedId } : {}) }, 3))];
  if (!local && !rows.some((r) => compact(rowTitle(r)) === compact(title))) {
    target = "admrul";
    rows = await connector.list(target, title, {}, 3);
  }
  const row = selectReferenceRow(rows, title, request, target);
  const id = rowId(row),
    date = dateIso(row.시행일자);
  const params = {
    target,
    type: "JSON",
    ...(target === "admrul" ? { ID: id } : { MST: id }),
    ...(target === "eflaw" ? { efYd: date.replaceAll("-", "") } : {}),
  };
  const raw = await connector.request("lawService.do", params);
  const region = target === "ordin" ? request.region : "전국";
  const e = normalizeLaw(raw, target, row, region);
  if (
    compact(e.title) !== compact(title) ||
    e.effectiveFrom !== date ||
    e.repealed ||
    !e.complete ||
    !applicable(e, request.region, request.asOf)
  )
    throw new ReferenceCollectionError(
      "목록과 상세 원문의 제목·시행일·적용 상태가 일치하지 않습니다.",
    );
  const json = parseBody(raw);
  const root =
    json.LawService || json.법령 || json.AdmRulService || json.행정규칙 || json;
  const info =
    root.자치법규기본정보 || root.기본정보 || root.행정규칙기본정보 || root;
  const returnedId = info.자치법규ID || info.법령ID || info.행정규칙ID;
  if (entityId(row) && returnedId && String(returnedId) !== entityId(row))
    throw new ReferenceCollectionError("목록과 상세의 법규 식별자가 다릅니다.");
  e.url = publicLawUrl(
    "https://www.law.go.kr/DRF/lawService.do?" + new URLSearchParams(params),
  );
  const attachments = await connector.attachmentText(raw, store, e);
  if (attachments.text) e.text += "\n\n" + attachments.text;
  if (attachments.count || attachments.failed) {
    e.annexesComplete = false;
    e.verificationNote += attachments.failed
      ? " 별표 일부 수집·추출 실패."
      : " 별표 추출문 확보, 표·수치는 원본 대조 전.";
  }
  e.hash = sha(e.text);
  e.verified = false;
  e.historyComplete = false;
  e.verificationNote +=
    " 연결 법규 제목·기준일로 수집한 후보. 공보·조문별 시행일·예외 적용 확인 전.";
  mkdirSync(join(store.dir, "legal-raw"), { recursive: true });
  e.rawRef = sha(raw) + ".json";
  writeFileSync(join(store.dir, "legal-raw", e.rawRef), raw);
  return e;
}

export function saveLinkedBasis(
  store: Store,
  request: ReviewRequest,
  evidence: Evidence,
) {
  store.put("settings", "linked-basis:" + evidence.id, {
    request: {
      region: request.region,
      municipality: request.municipality,
      asOf: request.asOf,
    },
    evidence,
  } satisfies LinkedBasis);
}

export function attachLinkedBasis(
  store: Store,
  request: ReviewRequest,
  base: Evidence[],
) {
  const combined = [...base];
  for (const id of request.linkedEvidenceIds || []) {
    let link = store.setting<LinkedBasis | null>("linked-basis:" + id, null);
    // Private backups include review evidence, but deliberately exclude settings.
    if (!link) {
      const restored = store
        .all<ReviewResult>("reviews")
        .find(
          (r) =>
            r.request.linkedEvidenceIds?.includes(id) &&
            r.request.region === request.region &&
            r.request.municipality === request.municipality &&
            r.request.asOf === request.asOf &&
            r.evidence.some((e) => e.id === id),
        );
      const e = restored?.evidence.find((e) => e.id === id);
      if (restored && e)
        link = {
          request: restored.request,
          evidence: {
            ...e,
            verified: false,
            historyComplete: false,
            annexesComplete: false,
            verificationNote:
              "검토 기록에서 복구한 연결 원문. 최신 원문·별표·예외 재검증 필요.",
          },
        };
    }
    if (
      !link ||
      link.request.region !== request.region ||
      link.request.municipality !== request.municipality ||
      link.request.asOf !== request.asOf
    )
      throw new ReferenceCollectionError(
        "연결 원문의 지역·시군구·기준일이 이번 검토와 다릅니다. 다시 수집하세요.",
      );
    if (
      combined.some(
        (e) => evidenceIdentity(e) === evidenceIdentity(link.evidence),
      )
    )
      continue;
    // Do not silently replace a conflicting collected source/version.
    combined.push(link.evidence);
  }
  return combined;
}

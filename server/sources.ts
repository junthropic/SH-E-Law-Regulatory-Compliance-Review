import { XMLParser } from "fast-xml-parser";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Store, sha } from "./store.js";
import { regions, type Evidence, type SourceStatus } from "../shared/types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});
export const arr = (v: any): any[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
export function parseBody(text: string): any {
  if (
    !text.trim() ||
    /^\s*(?:<!doctype html|<html)/i.test(text) ||
    text.includes("<!ENTITY")
  )
    throw new Error("법규 응답이 비어 있거나 문서 형식이 올바르지 않습니다.");
  return text.trim().startsWith("{") ? JSON.parse(text) : parser.parse(text);
}
export function dateIso(v: unknown) {
  const s = String(v || "").replace(/\D/g, "");
  const value =
    s.length === 8
      ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8)
      : "";
  return value &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : "";
}
export function publicLawUrl(input: string) {
  const u = new URL(input, "https://www.law.go.kr");
  if (u.protocol === "http:") u.protocol = "https:";
  if (
    u.protocol !== "https:" ||
    u.hostname !== "www.law.go.kr" ||
    u.username ||
    u.password
  )
    throw new Error("공식 법규 URL이 아닙니다.");
  for (const key of [...u.searchParams.keys()])
    if (/^(OC|apiKey|token|key)$/i.test(key)) u.searchParams.delete(key);
  // DRF detail links require OC even for HTML. Use the public version-specific
  // reader so citations work without disclosing the collector's credential.
  if (u.pathname === "/DRF/lawService.do") {
    const target = u.searchParams.get("target");
    const version =
      u.searchParams.get(target === "admrul" ? "ID" : "MST") || "";
    if (!/^\d+$/.test(version)) throw new Error("법규 링크의 버전 식별자 누락");
    const reader = new URL(
      "https://www.law.go.kr/LSW/" +
        (target === "ordin"
          ? "ordinInfoP.do"
          : target === "admrul"
            ? "admRulInfoP.do"
            : "lsInfoP.do"),
    );
    reader.searchParams.set(
      target === "ordin"
        ? "ordinSeq"
        : target === "admrul"
          ? "admRulSeq"
          : "lsiSeq",
      version,
    );
    const effective = u.searchParams.get("efYd");
    if (target === "eflaw" && effective && /^\d{8}$/.test(effective))
      reader.searchParams.set("efYd", effective);
    return reader.href;
  }
  return u.href;
}
export function flatten(value: any, path = ""): string {
  if (value == null) return "";
  if (typeof value !== "object")
    return `${path}: ${String(value)
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")}`;
  return Object.entries(value)
    .filter(
      ([k]) => !k.startsWith("@_") && !/링크|파일명|이미지|담당|연락처/.test(k),
    )
    .map(([k, v]) => flatten(v, path ? path + "/" + k : k))
    .filter(Boolean)
    .join("\n");
}
export function annexUrls(value: any): string[] {
  const urls: string[] = [];
  function visit(v: any, key = "") {
    if (
      typeof v === "string" &&
      /링크|link|url/i.test(key) &&
      (/별표|첨부|파일/i.test(key) ||
        /\.hwp|\.pdf|\.docx|flDownload|flSeq|ordin.*file/i.test(v))
    ) {
      try {
        const u = new URL(v, "https://www.law.go.kr");
        if (u.protocol === "http:") u.protocol = "https:";
        if (
          u.protocol === "https:" &&
          u.hostname === "www.law.go.kr" &&
          !u.username &&
          !u.password
        )
          urls.push(publicLawUrl(u.href));
      } catch {}
    } else if (v && typeof v === "object")
      for (const [k, c] of Object.entries(v)) visit(c, k);
  }
  visit(value);
  return [...new Set(urls)];
}
export function normalizeLaw(
  raw: string,
  target: string,
  record: any,
  region: string,
): Evidence {
  const json = parseBody(raw);
  const root =
    json.LawService || json.법령 || json.AdmRulService || json.행정규칙 || json;
  const info =
    root.자치법규기본정보 || root.기본정보 || root.행정규칙기본정보 || root;
  const title = String(
    info.자치법규명 ||
      info.법령명_한글 ||
      info.법령명한글 ||
      info.행정규칙명 ||
      record.자치법규명 ||
      record.법령명한글 ||
      record.행정규칙명 ||
      "",
  );
  const body = root.조문 || root.조문내용 || root.행정규칙본문;
  const changeType = String(
    info.제개정구분명 || info.제개정정보 || record.제개정구분명 || "",
  ).trim();
  const repealed = ["폐지", "타법폐지", "일괄폐지"].includes(changeType);
  const text = [
    flatten(body, "조문"),
    flatten(root.부칙, "부칙"),
    flatten(root.별표, "별표"),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!title || (!repealed && text.length < 30) || text.length > 1_200_000)
    throw new Error(
      "전문을 확인할 수 없거나 처리 크기를 넘었습니다. 목록 정보만으로 저장하지 않습니다.",
    );
  const effectiveFrom = dateIso(info.시행일자 || record.시행일자);
  if (!effectiveFrom) throw new Error("유효한 시행일을 확인할 수 없습니다.");
  const uncertainDate = effectiveFrom === "9999-12-31";
  const promulgatedAt = dateIso(
    info.공포일자 || info.발령일자 || record.공포일자 || record.발령일자,
  );
  const version =
    String(
      record.자치법규일련번호 ||
        record.법령일련번호 ||
        record.행정규칙일련번호 ||
        "",
    ) + (target === "eflaw" ? "@" + effectiveFrom : "");
  const sourceId =
    (target === "eflaw" ? "law" : target) +
    ":" +
    region +
    ":" +
    String(
      info.자치법규ID ||
        record.자치법규ID ||
        info.법령ID ||
        record.법령ID ||
        info.행정규칙ID ||
        record.행정규칙ID ||
        title,
    );
  const baseUrl =
    target === "ordin"
      ? `https://www.law.go.kr/자치법규/${encodeURIComponent(title)}`
      : target === "admrul"
        ? `https://www.law.go.kr/행정규칙/${encodeURIComponent(title)}`
        : `https://www.law.go.kr/법령/${encodeURIComponent(title)}`;
  const suppliedLink =
    record.법령상세링크 || record.자치법규상세링크 || record.행정규칙상세링크;
  let url = baseUrl;
  if (suppliedLink)
    try {
      url = publicLawUrl(String(suppliedLink));
    } catch {}
  const links = Array.from(new Set(text.match(/「[^」]+」/g) || []));
  const annexExists = !!root.별표 && JSON.stringify(root.별표).length > 5;
  return {
    id: randomUUID(),
    sourceId,
    kind: target === "ordin" ? "ordinance" : "law",
    title,
    region,
    article: "전문 (조문·부칙·별표)",
    text,
    url,
    version,
    effectiveFrom,
    repealed,
    promulgatedAt,
    fetchedAt: new Date().toISOString(),
    hash: sha(text),
    complete: !!body && !!effectiveFrom && !uncertainDate,
    // The ordinance API provides annexes only for limited institutions.
    // An absent annex field cannot establish that an ordinance has no annexes.
    annexesComplete:
      target !== "ordin" && !annexExists && !/별표\s*\d/.test(text),
    historyComplete: false,
    verified: false,
    verificationNote:
      "자동 수집. 별표 파일·조문별 시행일·예외 검증 전." +
      (uncertainDate
        ? " API 시행일이 9999-12-31로 표시되어 실제 시행일 확인 필요."
        : "") +
      (target === "ordin"
        ? " 자치법규 API의 별표 제공 범위가 제한되어 별도 원본 대조 필요."
        : "") +
      (url === baseUrl
        ? " 공식 링크는 현재 조회 화면입니다. 기준일 원문은 저장된 버전을 확인하세요."
        : ""),
    links,
  };
}
export class LawConnector {
  constructor(
    private oc: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async request(endpoint: string, params: Record<string, string>) {
    const url = new URL("https://www.law.go.kr/DRF/" + endpoint);
    url.search = new URLSearchParams({
      OC: this.oc,
      type: "XML",
      ...params,
    }).toString();
    let error: Error = new Error("법제처 요청 실패");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await this.fetcher(url, {
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
        if (!r.ok) throw new Error("법제처 응답 HTTP " + r.status);
        const text = await r.text();
        if (text.length > 12_000_000) throw new Error("법규 본문 용량 초과");
        parseBody(text);
        return text;
      } catch (e) {
        error = new Error(
          e instanceof Error
            ? e.message.replaceAll(this.oc, "[인증값]")
            : "수집 실패",
        );
        if (attempt < 2)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw error;
  }
  async list(
    target: string,
    query: string,
    extra: Record<string, string> = {},
  ) {
    const records: any[] = [];
    let total = 0;
    const seen = new Set<string>();
    for (let page = 1; page <= 100; page++) {
      const raw = await this.request("lawSearch.do", {
        target,
        query,
        display: "100",
        page: String(page),
        ...extra,
      });
      const data = parseBody(raw);
      const root = data.LawSearch || data.OrdinSearch || data.AdmRulSearch;
      if (!root || root.totalCnt === undefined)
        throw new Error("목록 응답 형식 변경 또는 API 사용 승인 확인 필요");
      const count = String(root.totalCnt).trim();
      const previousTotal = total;
      total = Number(count);
      if (!/^\d+$/.test(count) || !Number.isSafeInteger(total))
        throw new Error("법규 목록 건수를 확인할 수 없습니다.");
      if (page > 1 && previousTotal !== total)
        throw new Error("수집 중 목록이 변경되었습니다. 다시 시도하세요.");
      const rows = arr(root.law || root.admrul);
      for (const row of rows) {
        const key =
          String(
            row.자치법규일련번호 || row.법령일련번호 || row.행정규칙일련번호,
          ) +
          ":" +
          String(row.시행일자);
        if (seen.has(key))
          throw new Error(
            "목록 페이지가 반복되어 완전성을 확인할 수 없습니다.",
          );
        seen.add(key);
      }
      records.push(...rows);
      if (records.length > total)
        throw new Error("목록 건수와 실제 응답 건수가 다릅니다.");
      if (records.length === total) return records;
      if (!rows.length) throw new Error("목록 페이지 일부가 누락되었습니다.");
    }
    throw new Error("목록 수집 한도 초과: 범위를 줄여 재시도해야 합니다.");
  }
  async attachmentText(raw: string, store: Store) {
    const urls = annexUrls(parseBody(raw));
    const excerpts: string[] = [];
    let failed = urls.length > 30;
    let remaining = 250000;
    for (const url of urls.slice(0, 30)) {
      try {
        const r = await this.fetcher(url, {
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
        if (!r.ok || !r.body) throw new Error("별표 다운로드 실패");
        const reader = r.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 20 * 1024 * 1024) throw new Error("별표 용량 초과");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const buffer = Buffer.concat(chunks);
        const { extractDocument } = await import("./extraction.js");
        const result = await extractDocument(buffer);
        if (!result.success || result.markdown.trim().length < 20)
          throw new Error("별표 텍스트 추출 불가");
        mkdirSync(join(store.dir, "legal-attachments"), { recursive: true });
        writeFileSync(
          join(store.dir, "legal-attachments", sha(buffer) + ".bin"),
          buffer,
        );
        const excerpt = result.markdown.slice(0, Math.min(50000, remaining));
        remaining -= excerpt.length;
        if (excerpt)
          excerpts.push("첨부 추출문 (원본 대조 전): " + url + "\n" + excerpt);
        if (excerpt.length < result.markdown.length || result.warnings?.length)
          failed = true;
      } catch {
        failed = true;
      }
    }
    return { text: excerpts.join("\n\n"), count: urls.length, failed };
  }
  async collect(
    region: string,
    target: string,
    query: string,
    store: Store,
  ): Promise<Evidence[]> {
    const current = await this.list(
      target,
      query,
      target === "ordin" ? { nw: "1" } : target === "eflaw" ? { nw: "3" } : {},
    );
    const historical =
      target === "ordin"
        ? await this.list(target, query, { nw: "2" })
        : target === "eflaw"
          ? await this.list(target, query, { nw: "1" })
          : [];
    const rows = [
      ...new Map(
        [...current, ...historical].map((r) => [
          String(r.자치법규일련번호 || r.법령일련번호 || r.행정규칙일련번호) +
            ":" +
            String(r.시행일자),
          r,
        ]),
      ).values(),
    ];
    // Filter the jurisdiction again after upstream search. Never use the first fuzzy match.
    const selected = rows.filter(
      (row) =>
        target !== "ordin" || String(row.자치법규명 || "").startsWith(region),
    );
    if (!selected.length)
      throw new Error("해당 지역·법규 검색 결과 없음 (완전성 검증 전)");
    const staged: Evidence[] = [];
    for (const row of selected) {
      const id = String(
        row.자치법규일련번호 || row.법령일련번호 || row.행정규칙일련번호 || "",
      );
      if (!/^\d+$/.test(id)) throw new Error("법규 버전 식별자 누락");
      const efYd = dateIso(row.시행일자).replaceAll("-", "");
      if (target === "eflaw" && !efYd)
        throw new Error("시행일 기준 법령 버전 식별 실패");
      const raw = await this.request("lawService.do", {
        target,
        type: "JSON",
        ...(target === "admrul" ? { ID: id } : { MST: id }),
        ...(target === "eflaw" ? { efYd } : {}),
      });
      const e = normalizeLaw(raw, target, row, region);
      const name = sha(raw) + ".json";
      if (target === "eflaw" && e.effectiveFrom.replaceAll("-", "") !== efYd)
        throw new Error("요청한 시행 버전과 응답 본문이 다릅니다.");
      const attachments = await this.attachmentText(raw, store);
      if (attachments.text) {
        e.text += "\n\n" + attachments.text;
        e.hash = sha(e.text);
      }
      if (attachments.count) {
        e.annexesComplete = false;
        e.verificationNote += attachments.failed
          ? " 별표 일부 다운로드·추출 실패."
          : " 별표 텍스트 추출 완료, 표·수치는 원본 대조 필요.";
      }
      mkdirSync(join(store.dir, "legal-raw"), { recursive: true });
      writeFileSync(join(store.dir, "legal-raw", name), raw);
      e.rawRef = name;
      staged.push(e);
    }
    // Full history listing is collected, but title changes, repeals and staggered article dates still require review.
    return staged;
  }
}
export async function syncSources(
  store: Store,
  oc: string,
  onlyRegion?: string,
  onProgress?: (message: string) => void,
  connector = new LawConnector(oc),
) {
  if (!oc.trim()) throw new Error("설정에서 법제처 OC 인증값을 입력하세요.");
  const selected = store
    .sources()
    .filter(
      (s) => !onlyRegion || s.region === onlyRegion || s.region === "전국",
    );
  const outcomes: SourceStatus[] = [];
  for (const s of selected) {
    onProgress?.(s.name + " 확인 중");
    const now = new Date().toISOString();
    try {
      const entries: Evidence[] = [];
      if (s.region === "전국") {
        entries.push(
          ...(await connector.collect(
            "전국",
            "eflaw",
            "위험물안전관리법",
            store,
          )),
        );
        entries.push(
          ...(await connector.collect("전국", "admrul", "위험물", store)),
        );
      } else
        entries.push(
          ...(await connector.collect(
            s.region,
            "ordin",
            s.region + " 위험물",
            store,
          )),
        );
      store.db.exec("SAVEPOINT source_sync");
      try {
        for (const e of entries) store.saveEvidence(e);
        store.db.exec("RELEASE source_sync");
      } catch (error) {
        store.db.exec("ROLLBACK TO source_sync; RELEASE source_sync");
        throw error;
      }
      const status: SourceStatus = {
        ...s,
        status: "ok",
        checkedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        count: entries.length,
        message: "원문 수집 완료. 공보 대조·별표·연혁·예외 검증은 별도입니다.",
        verified: false,
      };
      store.put("sources", s.id, status);
      outcomes.push(status);
    } catch (e) {
      const status: SourceStatus = {
        ...s,
        status: "failed",
        checkedAt: now,
        message: e instanceof Error ? e.message : "수집 실패",
      };
      store.put("sources", s.id, status);
      outcomes.push(status);
    }
  }
  store.audit(
    "public_sync",
    JSON.stringify(outcomes.map((x) => ({ id: x.id, status: x.status }))),
  );
  return outcomes;
}

// General public and personal petition interfaces; web access cannot activate without recorded permission.
export class PetitionConnector {
  constructor(private store: Store) {}
  status() {
    return {
      mode: "permission_required",
      enabled: false,
      message:
        "국민신문고 사전 승낙 및 승인 범위의 연동 검증이 필요합니다. 보유 회신은 자료함에 올릴 수 있습니다.",
      terms: "https://www.epeople.go.kr/nep/gdnc/TermsConditions.npaid",
    };
  }
  async listOwn() {
    throw new Error("국민신문고 운영기관 승낙 및 실연동 설정 전입니다.");
  }
}
export const regionRegistry = {
  asOf: "2026-10-02",
  source: "https://www.law.go.kr",
  regions: regions.map(([code, name]) => ({
    code,
    name,
    pilot: ["경기도", "울산광역시", "인천광역시"].includes(name),
  })),
};

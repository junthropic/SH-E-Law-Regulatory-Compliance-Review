import { randomUUID } from "node:crypto";
import { diffWordsWithSpace } from "diff";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  comparisonInput,
  decisionInput,
  type ComparisonRecord,
} from "../shared/dossier.js";
import type { DocumentRecord, ReviewResult } from "../shared/types.js";
import { Store, sha, evidenceIdentity } from "./store.js";
import { normalize } from "./legal.js";
import { assessCase, factsHash } from "./case-assessment.js";
import { ingestDocument } from "./documents.js";

const hosts = new Set(["www.gg.go.kr", "www.hscity.go.kr", "www.law.go.kr"]);
export function officialFileUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    !hosts.has(u.hostname) ||
    u.port ||
    u.username ||
    u.password ||
    [...u.searchParams.keys()].some((k) =>
      /^(oc|key|apiKey|serviceKey|token|access_token|auth)$/i.test(k),
    )
  )
    throw new Error(
      "경기도청·화성시청·국가법령정보센터의 인증값 없는 HTTPS 첨부파일 주소를 입력하세요.",
    );
  u.hash = "";
  return u.href;
}
export async function downloadOfficial(
  store: Store,
  input: { url: string; name: string },
  fetcher: typeof fetch = fetch,
) {
  const url = officialFileUrl(input.url);
  if (!/\.(pdf|hwp|hwpx|docx|txt)$/i.test(input.name))
    throw new Error("저장 파일명에 PDF·HWP·HWPX·DOCX·TXT 확장자를 넣으세요.");
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (
    !response.ok ||
    !response.body ||
    /text\/html/.test(response.headers.get("content-type") || "")
  )
    throw new Error(
      "첨부파일을 받지 못했습니다. 게시글 주소가 아닌 파일 다운로드 주소를 확인하세요.",
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20 * 1024 * 1024)
        throw new Error("공식 첨부파일은 20MB 이하만 수집합니다.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const buffer = Buffer.concat(chunks);
  if (/^\s*(?:<!doctype html|<html)/i.test(buffer.toString("utf8", 0, 200)))
    throw new Error(
      "파일 대신 HTML 페이지를 받았습니다. 첨부파일 주소를 확인하세요.",
    );
  const doc = await ingestDocument(store, input.name, buffer);
  const origins = [...(doc.officialSources || [])];
  if (!origins.some((s) => s.url === url))
    origins.push({ url, fetchedAt: new Date().toISOString() });
  const updated = { ...doc, officialSources: origins.slice(-20) };
  store.put("documents", doc.id, updated);
  return updated;
}
const numbers = (text: string) =>
  [
    ...new Set(
      text.match(
        /\d[\d,]*(?:\.\d+)?\s*(?:%|㎏|㎥|㎡|mL|kL|kg|cm|mm|m²|m³|L|g|t|m|리터|톤|배|일|년|개월|개|도)?/gi,
      ) || [],
    ),
  ].sort();
const markers = (text: string) =>
  [
    ...new Set(
      text.match(
        /별표\s*\d+(?:의\d+)?|별지\s*(?:제\s*)?\d+\s*호|부\s*칙|경과조치|적용례|시행일|다만|준용|제외한다/g,
      ) || [],
    ),
  ].sort();
export function compareBasis(
  r: ReviewResult,
  doc: DocumentRecord,
  raw: unknown,
): ComparisonRecord {
  const input = comparisonInput.parse(raw),
    e = r.evidence.find((e) => e.id === input.evidenceId);
  if (!e || doc.id !== input.documentId)
    throw new Error("이번 검토의 근거와 자료를 선택하세요.");
  if (
    !normalize(e.text).includes(normalize(input.lawQuote)) ||
    !normalize(doc.text).includes(normalize(input.documentQuote))
  )
    throw new Error(
      "대조 발췌가 저장된 원문과 일치하지 않습니다. 원문에서 다시 선택하세요.",
    );
  if (input.sourceUrl) officialFileUrl(input.sourceUrl);
  const left = normalize(input.lawQuote),
    right = normalize(input.documentQuote);
  const changes = diffWordsWithSpace(input.lawQuote, input.documentQuote, {
    timeout: 1500,
    maxEditLength: 10000,
  });
  if (!changes)
    throw new Error(
      "대조 범위가 너무 다릅니다. 같은 조항·별표의 범위를 줄여 선택하세요.",
    );
  const numeric = { law: numbers(left), document: numbers(right) },
    flags = { law: markers(left), document: markers(right) };
  const checks: ComparisonRecord["checks"] = [
    {
      label: "선택 범위 문구",
      state: left === right ? "match" : "difference",
      detail:
        left === right
          ? "공백 정규화 후 선택 발췌가 일치합니다. 전체 문서 일치 판정은 아닙니다."
          : "선택 발췌에 차이가 있습니다. 개정 전·후 문구, 범위와 추출 오류를 대조하세요.",
    },
    {
      label: "수치·단위 후보",
      state:
        JSON.stringify(numeric.law) === JSON.stringify(numeric.document)
          ? "match"
          : "difference",
      detail:
        "문자에 나타난 숫자·단위 목록 비교입니다. 표의 행·열 관계나 계산의 정확성을 검증한 결과는 아닙니다.",
    },
    {
      label: "별표·부칙·예외 표지",
      state:
        JSON.stringify(flags.law) === JSON.stringify(flags.document)
          ? "match"
          : "difference",
      detail:
        "표현 목록을 비교합니다. 예외의 실제 적용 여부는 사람이 확인해야 합니다.",
    },
    ...(
      [
        ["공포일", input.publicationDate, e.promulgatedAt],
        ["시행일", input.effectiveDate, e.effectiveFrom],
      ] as const
    ).map(([label, value, expected]) => ({
      label,
      state:
        !value || !expected
          ? ("unconfirmed" as const)
          : value === expected
            ? ("match" as const)
            : ("difference" as const),
      detail: `원본을 보고 입력한 날짜 ${value || "미입력"} / 법령 메타데이터 ${expected || "미확인"}. 입력 날짜가 원본의 어떤 날짜인지 별도 확인하세요.`,
    })),
    {
      label: "원본·추출문",
      state: "unconfirmed",
      detail: doc.confirmed
        ? "사용자의 원본 대조 기록이 있습니다. 이번 선택 범위와 표·수치를 다시 확인하세요."
        : "원본과 추출문의 표·수치·누락 여부 확인이 필요합니다.",
    },
  ];
  return {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    evidenceHash: e.hash,
    evidenceIdentity: evidenceIdentity(e),
    documentHash: doc.hash,
    documentTextHash: sha(doc.text),
    documentName: doc.name,
    provenance: doc.officialSources?.some((s) => s.url === input.sourceUrl)
      ? "downloaded"
      : "user_provided",
    changes: changes.map(({ value, added, removed }) => ({
      value,
      added,
      removed,
    })),
    checks,
    numbers: numeric,
    markers: flags,
  };
}
export function attachComparisons(store: Store, r: ReviewResult) {
  const records = store.all<ReviewResult>("reviews");
  r.comparisons = [];
  for (const id of r.request.comparisonIds || []) {
    const parent = records.find(
      (old) =>
        old.request.region === r.request.region &&
        old.request.municipality === r.request.municipality &&
        old.request.asOf === r.request.asOf &&
        old.comparisons?.some((c) => c.id === id),
    );
    const c = parent?.comparisons?.find((c) => c.id === id),
      e = c && r.evidence.find((e) => e.id === c.evidenceId),
      d = c && store.document(c.documentId);
    if (
      !c ||
      !e ||
      !d ||
      evidenceIdentity(e) !== c.evidenceIdentity ||
      d.hash !== c.documentHash ||
      sha(d.text) !== c.documentTextHash
    ) {
      r.gaps.push(
        "이전 원본 대조의 근거·자료·지역·기준일이 변경되거나 삭제되어 다시 대조해야 합니다.",
      );
      continue;
    }
    r.comparisons.push(c);
    if (c.checks.some((x) => x.state === "difference"))
      r.gaps.push(
        c.documentName +
          ": 원본 대조에 차이가 있어 적용 버전·추출문·선택 범위를 검토해야 합니다.",
      );
    if (!c.review)
      r.gaps.push(
        c.documentName + ": 원본 대조의 검토자 확인 기록이 없습니다.",
      );
  }
}
export function registerDossier(app: FastifyInstance, store: Store, checkExport: (id: string) => unknown = () => undefined) {
  const review = (params: unknown) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const r = store.review(id);
    if (!r || r.status !== "completed")
      throw new Error("완료된 검토를 선택하세요.");
    return r;
  };
  app.post("/api/documents/official", async (req) => {
    const input = z
      .object({
        url: z.string().url().max(2000),
        name: z.string().min(5).max(180),
      })
      .parse(req.body);
    try {
      return await downloadOfficial(store, input);
    } catch (e) {
      throw new Error(
        e instanceof Error &&
          !/https?:|fetch|network|timeout|abort/i.test(e.message)
          ? e.message
          : "공식 첨부파일 수집 실패. 주소·응답·시간 제한을 확인하세요.",
      );
    }
  });
  app.get("/api/reviews/:id/dossier", async (req) => {
    const r = review(req.params);
    return {
      comparisons: r.comparisons || [],
      assessment: assessCase(r, r.caseAssessment?.decisions),
      documents: store
        .all<DocumentRecord>("documents")
        .filter((d) => d.origin !== "intake")
        .map((d) => ({
          id: d.id,
          name: d.name,
          confirmed: d.confirmed,
          warnings: d.warnings,
          officialSources: d.officialSources || [],
        })),
    };
  });
  app.get("/api/documents/:id/text", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      d = store.document(id);
    if (!d) throw new Error("자료 없음");
    return { text: d.text.slice(0, 100000), truncated: d.text.length > 100000 };
  });
  app.post("/api/reviews/:id/comparisons", async (req) => {
    const r = review(req.params),
      input = comparisonInput.parse(req.body),
      doc = store.document(input.documentId);
    if (!doc) throw new Error("자료를 찾지 못했습니다.");
    if ((r.comparisons?.length || 0) >= 100)
      throw new Error("한 검토의 대조 기록 100개 한도입니다.");
    const selected = [...new Set([...r.request.documentIds, doc.id])];
    if (selected.length > 20)
      throw new Error("한 검토에서 연결할 자료는 20개까지입니다.");
    const record = compareBasis(r, doc, input);
    r.comparisons = [...(r.comparisons || []), record];
    r.request.comparisonIds = [...(r.request.comparisonIds || []), record.id];
    r.request.documentIds = selected;
    r.needsReview = true;
    r.coverage.complete = false;
    r.gaps = [
      ...new Set([
        ...r.gaps,
        "원본 대조 기록이 추가됐습니다. 대조 결과와 사업장 사실을 반영해 재검토해야 합니다.",
      ]),
    ];
    r.issues = r.issues.map((i) =>
      i.category === "clear_risk"
        ? {
            ...i,
            category: "human_review" as const,
            conditions: [...i.conditions, "새 원본 대조 후 재검토 필요"],
          }
        : i,
    );
    store.saveReview(r);
    store.audit(
      "basis_comparison",
      JSON.stringify({ reviewId: r.id, comparisonId: record.id }),
    );
    return record;
  });
  app.post(
    "/api/reviews/:id/comparisons/:comparisonId/confirm",
    async (req) => {
      const r = review(req.params),
        { comparisonId } = z
          .object({ comparisonId: z.string().uuid() })
          .parse(req.params),
        record = r.comparisons?.find((c) => c.id === comparisonId);
      const input = z
        .object({
          reviewer: z.string().trim().min(2).max(100),
          note: z.string().trim().min(20).max(3000),
          originalChecked: z.literal(true),
        })
        .parse(req.body);
      const d = record && store.document(record.documentId),
        e = record && r.evidence.find((e) => e.id === record.evidenceId);
      if (
        !record ||
        !d ||
        !e ||
        sha(d.text) !== record.documentTextHash ||
        d.hash !== record.documentHash ||
        evidenceIdentity(e) !== record.evidenceIdentity
      )
        throw new Error(
          "대조 대상이 변경되거나 삭제되었습니다. 다시 대조하세요.",
        );
      if (record.review)
        throw new Error(
          "이미 확인 기록이 있습니다. 변경된 판단은 새 대조 기록으로 남기세요.",
        );
      record.review = {
        reviewer: input.reviewer,
        note: input.note,
        reviewedAt: new Date().toISOString(),
      };
      store.saveReview(r);
      store.audit(
        "comparison_reviewed",
        JSON.stringify({
          reviewId: r.id,
          comparisonId,
          reviewer: input.reviewer,
        }),
      );
      return record;
    },
  );
  app.post("/api/reviews/:id/conditions", async (req) => {
    const r = review(req.params),
      input = decisionInput.parse(req.body),
      assessment = assessCase(r, r.caseAssessment?.decisions),
      condition = assessment.conditions.find((c) => c.id === input.conditionId),
      e = r.evidence.find((e) => e.id === condition?.evidenceId);
    if (!condition || !e)
      throw new Error("검토 원문의 적용 조건 후보를 선택하세요.");
    if (input.decision !== "uncertain" && condition.missing.length)
      throw new Error(
        "연결된 사업장 사실을 먼저 보완해 새 검토를 실행하세요. 현재는 판단 보류로 기록할 수 있습니다.",
      );
    if (assessment.decisions.length >= 500)
      throw new Error("한 검토의 판단 기록 500개 한도입니다.");
    assessment.decisions.push({
      ...input,
      basisHash: e.hash,
      factsHash: factsHash(r),
      createdAt: new Date().toISOString(),
    });
    r.caseAssessment = assessment;
    r.needsReview = true;
    r.coverage.complete = false;
    r.gaps = [
      ...new Set([
        ...r.gaps,
        "검토자 적용 판단이 추가됐습니다. 판단 내용과 승인 규칙의 정합성을 재검토해야 합니다.",
      ]),
    ];
    r.issues = r.issues.map((i) =>
      i.category === "clear_risk"
        ? {
            ...i,
            category: "human_review" as const,
            conditions: [...i.conditions, "검토자 적용 판단 후 재검토 필요"],
          }
        : i,
    );
    store.saveReview(r);
    store.audit(
      "condition_reviewed",
      JSON.stringify({
        reviewId: r.id,
        conditionId: condition.id,
        reviewer: input.reviewer,
      }),
    );
    return assessment;
  });
  app.get("/api/reviews/:id/reviewer-packet", async (req, reply) => {
    const r = review(req.params);
    checkExport(r.id);
    reply.header(
      "Content-Disposition",
      `attachment; filename="reviewer-packet-${r.id}.json"`,
    );
    return {
      purpose: "검토자 인계 자료 — 승인된 규칙 아님",
      review: r,
      assessment: assessCase(r, r.caseAssessment?.decisions),
      approvalTemplate: {
        reviewId: r.id,
        reviewer: "",
        region: r.request.region,
        municipality: r.request.municipality,
        asOf: r.request.asOf,
        note: "",
        gazetteUrl: "",
        delegationChecked: false,
        exceptionsChecked: false,
        annexesChecked: false,
        historyChecked: false,
        evidenceHashes: r.evidence.map((e) => e.hash),
        rules: [],
      },
    };
  });
}

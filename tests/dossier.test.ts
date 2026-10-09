import { it, expect } from "vitest";
import { newReview } from "../server/reviews.js";
import { assessCase, factsHash } from "../server/case-assessment.js";
import {
  compareBasis,
  attachComparisons,
  officialFileUrl,
  downloadOfficial,
} from "../server/dossier.js";
import { buildVerification } from "../server/verification.js";
import { ingestDocument } from "../server/documents.js";
import { createApp } from "../server/app.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import { markdown } from "../server/exports.js";
import { sha } from "../server/store.js";
import { evidence, request, testStore } from "./helpers.js";
const law =
  "시험용 조문: 별표 1의 위험물 200 L 이상 저장 시설. 다만 기존 시설은 제외한다. 부칙 시행일은 별도로 확인한다.";
function sample() {
  const r = newReview({ ...request(), municipality: "화성시" });
  r.status = "completed";
  r.evidence = [evidence({ text: law, hash: sha(law), verified: false })];
  r.verification = buildVerification(r.evidence, r.request, false);
  return r;
}
const fullAnswers = {
  material: "시험 물질",
  concentration: "시험 농도 99%",
  quantity: "200리터",
  facility: "시험 실내 독립 저장실",
  activity: "시험 저장",
  permit: "허가 여부 미확인",
  dates: "2026-10-08 설치 예정",
};
it("수량 단위를 확인하고 허가 미확인을 무허가로 바꾸지 않는다", () => {
  const r = sample();
  r.request.answers = fullAnswers;
  let a = assessCase(r);
  expect(a.facts.find((f) => f.key === "quantity")?.state).toBe("confirmed");
  expect(a.facts.find((f) => f.key === "permit")?.state).toBe("missing");
  expect(a.facts.find((f) => f.key === "permit")?.value).toBe(
    "허가 여부 미확인",
  );
  r.request.answers = { ...fullAnswers, quantity: "200", dates: "다음달" };
  a = assessCase(r);
  expect(a.facts.find((f) => f.key === "quantity")?.state).toBe("incomplete");
  expect(a.facts.find((f) => f.key === "dates")?.state).toBe("incomplete");
});
it("예외의 필요한 사실을 연결하고 원문·사실·질문 변경 시 기존 판단을 제외한다", () => {
  const r = sample(),
    a = assessCase(r),
    c = a.conditions.find((c) => c.kind === "exception")!;
  expect(c.missing).toContain("facility");
  expect(c.missing).toContain("dates");
  const d = {
    conditionId: c.id,
    reviewer: "시험 검토자",
    note: "실제 승인 아닌 시험 기록입니다.",
    decision: "uncertain" as const,
    basisHash: r.evidence[0].hash,
    factsHash: factsHash(r),
    createdAt: new Date().toISOString(),
  };
  expect(assessCase(r, [d]).decisions).toHaveLength(1);
  r.request.prompt += " 추가 조건";
  expect(assessCase(r, [d]).decisions).toHaveLength(0);
  r.request.prompt = request().prompt;
  r.request.answers.quantity = "20 L";
  expect(assessCase(r, [d]).decisions).toHaveLength(0);
});
it("원문·선택 범위·수치·예외 표지·날짜 차이를 구분하고 위조 발췌를 거부한다", async () => {
  const { store, clean } = testStore();
  try {
    const r = sample(),
      text = law.replace("200 L", "500 kg").replace("다만", "또한");
    const d = await ingestDocument(store, "시험별표.txt", Buffer.from(text));
    const input = {
      evidenceId: r.evidence[0].id,
      documentId: d.id,
      kind: "annex",
      lawQuote: law,
      documentQuote: text,
      publicationDate: "2024-12-01",
      effectiveDate: "2026-01-01",
      sourceUrl: "https://www.gg.go.kr/test.txt",
    };
    const c = compareBasis(r, d, input);
    expect(c.provenance).toBe("user_provided");
    expect(c.checks.filter((x) => x.state === "difference")).toHaveLength(4);
    expect(c.numbers.law).toContain("200 L");
    expect(c.numbers.document).toContain("500 kg");
    expect(c.checks.find((x) => x.label === "공포일")?.state).toBe("match");
    expect(() =>
      compareBasis(r, d, {
        ...input,
        lawQuote: "저장된 원문에는 없는 조항입니다",
      }),
    ).toThrow("발췌");
    expect(r.evidence[0].verified).toBe(false);
  } finally {
    clean();
  }
});
it("공백 차이만 있으면 선택 범위만 일치로 표시한다", async () => {
  const { store, clean } = testStore();
  try {
    const r = sample(),
      text = law.replaceAll(" ", "\n");
    const d = await ingestDocument(store, "시험공보.txt", Buffer.from(text));
    const c = compareBasis(r, d, {
      evidenceId: r.evidence[0].id,
      documentId: d.id,
      kind: "gazette",
      lawQuote: law,
      documentQuote: text,
    });
    expect(c.checks[0].state).toBe("match");
    expect(c.checks.find((x) => x.label === "원본·추출문")?.state).toBe(
      "unconfirmed",
    );
  } finally {
    clean();
  }
});
it("공식 다운로드는 허용 HTTPS 출처만 받고 HTML·인증값·사설주소를 거부한다", async () => {
  const { store, clean } = testStore();
  try {
    for (const u of [
      "http://www.gg.go.kr/test.txt",
      "https://127.0.0.1/test.txt",
      "https://www.gg.go.kr.evil.example/test.txt",
      "https://www.gg.go.kr/test?serviceKey=secret",
    ])
      expect(() => officialFileUrl(u)).toThrow();
    const url = "https://www.gg.go.kr/test.txt";
    await expect(
      downloadOfficial(
        store,
        { url, name: "시험.txt" },
        async () => new Response("<html>로그인</html>") as any,
      ),
    ).rejects.toThrow("HTML");
    const d = await downloadOfficial(
      store,
      { url, name: "시험.txt" },
      async (_u, options) => {
        expect(options?.redirect).toBe("error");
        return new Response(law, { headers: { "content-type": "text/plain" } });
      },
    );
    expect(d.officialSources?.[0].url).toBe(url);
    const r = sample();
    expect(
      compareBasis(r, d, {
        evidenceId: r.evidence[0].id,
        documentId: d.id,
        kind: "gazette",
        lawQuote: law,
        documentQuote: law,
        sourceUrl: url,
      }).provenance,
    ).toBe("downloaded");
  } finally {
    clean();
  }
});
it("재검토는 동일 원본·기준일·지역 대조만 연결한다", async () => {
  const { store, clean } = testStore();
  try {
    const r = sample(),
      d = await ingestDocument(store, "시험.txt", Buffer.from(law));
    const c = compareBasis(r, d, {
      evidenceId: r.evidence[0].id,
      documentId: d.id,
      kind: "gazette",
      lawQuote: law,
      documentQuote: law,
    });
    r.comparisons = [c];
    store.saveReview(r);
    const n = structuredClone(r);
    n.request.comparisonIds = [c.id];
    attachComparisons(store, n);
    expect(n.comparisons).toHaveLength(1);
    expect(n.gaps.join()).toContain("확인 기록");
    n.request.asOf = "2025-01-01";
    attachComparisons(store, n);
    expect(n.comparisons).toHaveLength(0);
    n.request.asOf = r.request.asOf;
    store.put("documents", d.id, { ...d, text: law + " 추출 수정" });
    attachComparisons(store, n);
    expect(n.comparisons).toHaveLength(0);
  } finally {
    clean();
  }
});
it("대조·검토자 기록·추가 질문·인계·백업 복원까지 승인을 자동 생성하지 않는다", async () => {
  const { store, clean } = testStore(),
    next = testStore();
  const { app } = await createApp(store, true);
  try {
    const r = sample(),
      d = await ingestDocument(store, "시험.txt", Buffer.from(law));
    store.saveReview(r);
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1" },
    });
    const headers = {
      host: "127.0.0.1",
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const post = (path: string, payload: unknown) =>
      app.inject({
        method: "POST",
        url: `/api/reviews/${r.id}/${path}`,
        headers,
        payload: payload as any,
      });
    const added = await post("comparisons", {
      evidenceId: r.evidence[0].id,
      documentId: d.id,
      kind: "annex",
      lawQuote: law,
      documentQuote: law,
    });
    expect(added.statusCode).toBe(200);
    const id = added.json().id;
    expect(
      (
        await post(`comparisons/${id}/confirm`, {
          reviewer: "시험 검토자",
          note: "이것은 실제 전문가 승인이 아닌 시험 입력 기록입니다.",
          originalChecked: true,
        })
      ).statusCode,
    ).toBe(200);
    const data = (
      await app.inject({ url: `/api/reviews/${r.id}/dossier`, headers })
    ).json();
    const decision = {
      conditionId: data.assessment.conditions[0].id,
      reviewer: "시험 검토자",
      note: "사업장 사실을 확인하지 않아 판단을 보류하는 시험입니다.",
      decision: "applies",
    };
    expect((await post("conditions", decision)).statusCode).toBe(400);
    expect(
      (await post("conditions", { ...decision, decision: "uncertain" }))
        .statusCode,
    ).toBe(200);
    const packet = (
      await app.inject({ url: `/api/reviews/${r.id}/reviewer-packet`, headers })
    ).json();
    expect(packet.approvalTemplate.exceptionsChecked).toBe(false);
    expect(packet.approvalTemplate.rules).toEqual([]);
    expect(store.rules().every((x) => !x.approved)).toBe(true);
    const stored = store.review(r.id)!;
    expect(stored.coverage.complete).toBe(false);
    expect(stored.evidence[0].verified).toBe(false);
    expect(markdown(stored)).toContain("시험 검토자");
    expect(markdown(stored)).toContain("원본 대조 기록");
    restoreBackup(next.store, makeBackup(store));
    const restored = next.store.review(r.id)!;
    expect(restored.comparisons?.[0].id).toBe(id);
    expect(restored.verification?.basis[0].passages.length).toBeGreaterThan(0);
    expect(
      assessCase(restored, restored.caseAssessment?.decisions).decisions,
    ).toHaveLength(1);
    expect(restored.needsReview).toBe(true);
  } finally {
    await app.close();
    clean();
    next.clean();
  }
});
it("공백이 있는 부 칙도 실제 본문의 시행 특례 후보로 찾는다", () => {
  const r = sample();
  r.evidence[0].text =
    "시험 조례\n부 칙\n이 조례는 공포한 날부터 시행한다. 다만 제3조는 6개월 후부터 적용한다.";
  r.verification = buildVerification(r.evidence, r.request, false);
  expect(
    r.verification.basis[0].passages.some(
      (p) => p.kind === "supplement" && p.quote.includes("부 칙"),
    ),
  ).toBe(true);
});
it("검토 ID 확인서는 연결 원문의 승인을 해당 검토 범위에 보관한다", async () => {
  const { approveReviewBasis } = await import("../server/approval.js");
  const { saveLinkedBasis, attachLinkedBasis } =
    await import("../server/reference-collection.js");
  const { store, clean } = testStore();
  try {
    const r = sample();
    const national = r.evidence[0];
    store.saveEvidence(national);
    const local = evidence({
      kind: "ordinance",
      region: "경기도",
      sourceId: "test-linked-local",
      title: "시험용 연결 조례",
      text: "승인 경로 시험을 위한 가상의 조례입니다.",
      hash: sha("승인 경로 시험을 위한 가상의 조례입니다."),
      verified: false,
    });
    r.request.linkedEvidenceIds = [local.id];
    r.evidence.push(local);
    saveLinkedBasis(store, r.request, local);
    store.saveReview(r);
    const input = {
      reviewId: r.id,
      reviewer: "시험 검토자",
      region: r.request.region,
      municipality: r.request.municipality,
      asOf: r.request.asOf,
      note: "가상 원문과 가상 조건을 사용하는 격리된 승인 경로 테스트입니다. 실제 법률 승인이 아닙니다.",
      gazetteUrl: "https://www.gg.go.kr/test",
      delegationChecked: true,
      exceptionsChecked: true,
      annexesChecked: true,
      historyChecked: true,
      evidenceHashes: r.evidence.map((e) => e.hash),
      rules: [],
    };
    expect(() =>
      approveReviewBasis(store, { ...input, municipality: "다른시" }),
    ).toThrow("일치");
    approveReviewBasis(store, input);
    expect(store.all<any>("evidence").some((e) => e.id === local.id)).toBe(
      false,
    );
    expect(attachLinkedBasis(store, r.request, [])[0].verified).toBe(true);
  } finally {
    clean();
  }
});

import { it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  localFacts,
  groundedFacts,
  buildLookupPlan,
  runLookup,
  intakeBinding,
  intakeForReview,
  lookupLaw,
} from "../server/intake.js";
import { Vault } from "../server/vault.js";
import { createApp } from "../server/app.js";
import { ReviewRequestSchema, type DocumentRecord } from "../shared/types.js";
import type { IntakeDraft } from "../shared/intake.js";
import { testStore } from "./helpers.js";
const request = ReviewRequestSchema.parse({
  prompt:
    "경기도 화성시 공장 내 메탄올(CAS 67-56-1) 99% 500 L 저장공간을 신설하려 합니다. 기존 허가 여부는 미확인입니다.",
  region: "경기도",
  municipality: "화성시",
  asOf: "2026-10-07",
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("로컬 추출은 CAS·농도·수량을 구분하고 사실을 확정하지 않는다", () => {
  const facts = localFacts(request.prompt);
  expect(facts.find((f) => f.key === "cas")?.value).toBe("67-56-1");
  expect(facts.find((f) => f.key === "concentration")?.value).toBe("99%");
  expect(facts.find((f) => f.key === "quantity")?.value).toBe("500 L");
  expect(
    localFacts("500리터를 저장하고 2톤을 취급합니다.").find(
      (f) => f.key === "quantity",
    )?.value,
  ).toBe("500리터, 2톤");
  expect(facts.every((f) => !f.confirmed)).toBe(true);
  expect(facts.find((f) => f.key === "permit")?.value).toContain("미확인");
  expect(
    localFacts("CAS 67-56-1 아님.").find((f) => f.key === "cas")?.value,
  ).toContain("아님");
});
it("모델이 확정 상태·없는 CAS·변환 수량을 만들어도 수용하지 않는다", () => {
  expect(
    groundedFacts("메탄올 500 L", {
      facts: [
        {
          key: "material",
          value: "메탄올",
          quote: "메탄올 500 L",
          confirmed: true,
        },
      ],
    })[0].confirmed,
  ).toBe(false);
  expect(() =>
    groundedFacts("메탄올 500 L", {
      facts: [{ key: "cas", value: "67-56-1", quote: "메탄올 500 L" }],
    }),
  ).toThrow();
  expect(() =>
    groundedFacts("0.5 m3", {
      facts: [{ key: "quantity", value: "500 L", quote: "0.5 m3" }],
    }),
  ).toThrow();
});
it("미확인 CAS는 조회하지 않고 물질명만으로 번호를 추론하지 않는다", () => {
  const facts = localFacts(request.prompt);
  let plan = buildLookupPlan(request, facts);
  expect(
    plan.steps.some((s) => s.service === "fire" || s.service === "keco"),
  ).toBe(false);
  facts.find((f) => f.key === "material")!.confirmed = true;
  plan = buildLookupPlan(request, facts);
  expect(plan.steps.some((s) => s.service === "msds" && s.mode === "0")).toBe(
    true,
  );
  expect(plan.steps.some((s) => s.service === "fire")).toBe(false);
  for (const value of ["67-56-1인지 미확인", "67-56-1 아님"]) {
    facts.find((f) => f.key === "cas")!.value = value;
    facts.find((f) => f.key === "cas")!.confirmed = true;
    expect(
      buildLookupPlan(request, facts).steps.some((s) => s.service === "fire"),
    ).toBe(false);
  }
});
it("확인한 CAS와 지역으로 계획하고 호출량·성분 수를 제한한다", () => {
  const facts = localFacts(request.prompt).map((f) => ({
    ...f,
    confirmed: true,
  }));
  const plan = buildLookupPlan(request, facts);
  expect(plan.steps.find((s) => s.service === "fire")?.keyword).toBe("67-56-1");
  expect(plan.steps.some((s) => s.keyword === "경기도 위험물")).toBe(true);
  expect(plan.steps.some((s) => s.keyword === "화성시 위험물")).toBe(true);
  facts.find((f) => f.key === "cas")!.value = "67-56-1, 71-43-2, 64-17-5";
  const limited = buildLookupPlan(request, facts);
  expect(limited.steps.filter((s) => s.service === "fire")).toHaveLength(2);
  expect(limited.gaps.join()).toContain("앞의 2개");
  const generic = buildLookupPlan(
    { ...request, prompt: "사다리 작업의 추락 방지 조치를 검토해 주세요." },
    localFacts("사다리 작업"),
  );
  expect(
    generic.steps.some(
      (s) =>
        s.service === "fire" || s.service === "keco" || s.service === "msds",
    ),
  ).toBe(false);
});
it("단일 서비스 실패·미설정에도 다음 출처를 조회하고 기록을 보존한다", async () => {
  vi.stubEnv("LAW_OC", "");
  const { store, clean } = testStore();
  const vault = new Vault(store.dir, true);
  try {
    await vault.write("public-qna", "fixtureKey");
    await vault.write("public-smart", "fixtureKey");
    const plan = buildLookupPlan(request, localFacts(request.prompt));
    const draft: IntakeDraft = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      binding: intakeBinding(request),
      request,
      status: "running",
      method: "local",
      facts: localFacts(request.prompt),
      questions: ["추가 자료 필요"],
      warnings: [],
      steps: plan.steps,
    };
    const search = vi.fn(async (id: any) => {
      if (id === "qna") throw new Error("upstream secret");
      return { items: [], total: 0, page: 1, hasMore: false };
    });
    await runLookup(store, vault, draft, { search });
    expect(draft.status).toBe("completed");
    expect(draft.steps.some((s) => s.status === "failed")).toBe(true);
    expect(draft.steps.some((s) => s.status === "empty")).toBe(true);
    expect(draft.steps.some((s) => s.status === "skipped")).toBe(true);
    expect(search).toHaveBeenCalled();
    const doc = store.document(draft.reportId!)!;
    expect(doc.confirmed).toBe(false);
    expect(doc.text).not.toContain("upstream secret");
    expect(store.all("evidence")).toHaveLength(0);
    expect(intakeForReview(store, draft.id, request).documentIds).toContain(
      doc.id,
    );
    expect(() =>
      intakeForReview(store, draft.id, { ...request, municipality: "수원시" }),
    ).toThrow();
    expect(() =>
      intakeForReview(store, draft.id, { ...request, asOf: "2025-01-01" }),
    ).toThrow();
  } finally {
    clean();
  }
});
it("법규 목록은 후보와 공개 링크만 반환하고 OC를 제거한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          "<LawSearch><totalCnt>1</totalCnt><law><법령명한글>시험법</법령명한글><법령일련번호>123</법령일련번호><시행일자>20260101</시행일자><법령상세링크>/DRF/lawService.do?OC=secret&amp;target=law&amp;MST=123</법령상세링크></law></LawSearch>",
        ),
    ),
  );
  const step = buildLookupPlan(request, []).steps[0];
  const r = await lookupLaw("secret", step);
  expect(r.records[0].verified).toBe(false);
  expect(r.records[0].url).not.toContain("secret");
  expect(r.records[0].url).toContain("lsiSeq=123");
});
it("CAS 부분일치와 번호 없는 후보를 제외한 뒤 정확한 후보만 상세 조회한다", async () => {
  const { store, clean } = testStore();
  const vault = new Vault(store.dir, true);
  try {
    for (const id of ["msds", "fire", "keco"])
      await vault.write("public-" + id, "fixture");
    const facts = localFacts(request.prompt).map((f) => ({
      ...f,
      confirmed: true,
    }));
    const draft: IntakeDraft = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      binding: intakeBinding(request),
      request,
      status: "running",
      method: "local",
      facts,
      questions: [],
      warnings: [],
      steps: buildLookupPlan(request, facts).steps.filter((s) =>
        ["msds", "fire", "keco"].includes(s.service),
      ),
    };
    const record = (cas: string) => ({
      title: cas || "번호 누락",
      fields: { casNo: cas },
      hash: "fixture",
      canDetail: true,
      level: "list",
    });
    const detail = vi.fn(async (r: any) => ({ ...r, level: "detail" }));
    await runLookup(store, vault, draft, {
      search: (async (id: string) => ({
        items:
          id === "msds"
            ? [record("867-56-1"), record("67-56-1"), record("")]
            : [record("")],
        total: id === "msds" ? 3 : 1,
        page: 1,
        hasMore: false,
      })) as any,
      detail,
    });
    const msds = draft.steps.find((s) => s.service === "msds")!;
    expect(msds.count).toBe(1);
    expect(msds.excluded?.map((r) => r.cas)).toEqual(["867-56-1", ""]);
    expect(detail).toHaveBeenCalledOnce();
    expect(detail.mock.calls[0][0].fields.casNo).toBe("67-56-1");
    expect(draft.steps.find((s) => s.service === "fire")?.status).toBe(
      "skipped",
    );
    expect(draft.steps.find((s) => s.service === "keco")?.status).toBe(
      "skipped",
    );
    expect(draft.status).toBe("completed");
  } finally {
    clean();
  }
});
it("조회 계획은 명시적 전송 동의 후 한 번만 실행하고 검토 입력에 연결한다", async () => {
  vi.stubEnv("LAW_OC", "");
  const { store, clean } = testStore();
  const { app } = await createApp(store, true);
  try {
    const boot = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: `${boot.cookies[0].name}=${boot.cookies[0].value}`,
      "x-csrf-token": boot.json().csrf,
    };
    const post = (url: string, payload: any = {}) =>
      app.inject({ method: "POST", url, headers, payload });
    const draft = (await post("/api/intake", request)).json();
    const planned = (
      await post(`/api/intake/${draft.id}/plan`, {
        facts: draft.facts.map((f: any) => ({ ...f, confirmed: true })),
      })
    ).json();
    expect(planned.id).not.toBe(draft.id);
    expect(planned.facts.find((f: any) => f.key === "permit").confirmed).toBe(
      false,
    );
    expect(
      (await post(`/api/intake/${planned.id}/execute`, { consent: false }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post(`/api/intake/${planned.id}/execute`, { consent: true }))
        .statusCode,
    ).toBe(202);
    await vi.waitFor(() =>
      expect(
        store.get<IntakeDraft>("settings", "intake-" + planned.id)?.status,
      ).toBe("completed"),
    );
    expect(
      (await post(`/api/intake/${planned.id}/execute`, { consent: true }))
        .statusCode,
    ).toBe(400);
    const resolved = intakeForReview(store, planned.id, request);
    expect(resolved.answers.cas).toBe("67-56-1");
    expect(resolved.answers.permit).toBeUndefined();
    expect(store.all<DocumentRecord>("documents")).toHaveLength(1);
    const report = store.document(resolved.documentIds[0])!;
    expect(report.origin).toBe("intake");
    // Legacy reports have no marker; only the persisted draft link identifies them.
    delete report.origin;
    store.put("documents", report.id, report);
    const upload = { ...report, id: randomUUID() };
    store.put("documents", upload.id, upload);
    const documents = (
      await app.inject({ url: "/api/documents", headers })
    ).json();
    expect(
      documents.find((d: DocumentRecord) => d.id === report.id).origin,
    ).toBe("intake");
    expect(
      documents.find((d: DocumentRecord) => d.id === upload.id).origin,
    ).toBe("upload");
    expect(
      (
        await post("/api/reviews", {
          ...request,
          prompt: "별개의 작업을 검토하는 질문입니다.",
          intakeId: planned.id,
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
    clean();
  }
});

import { it, expect, vi } from "vitest";
import {
  collectReference,
  selectReferenceRow,
  attachLinkedBasis,
  saveLinkedBasis,
} from "../server/reference-collection.js";
import { LawConnector } from "../server/sources.js";
import { newReview } from "../server/reviews.js";
import { buildVerification } from "../server/verification.js";
import { createApp } from "../server/app.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import { evidence, request, testStore } from "./helpers.js";
const req = { ...request(), asOf: "2026-10-08", municipality: "화성시" };
const title = "가상연결법률";
const row = {
  법령명한글: title,
  법령일련번호: "123",
  법령ID: "1",
  시행일자: "20250101",
  공포일자: "20241201",
};
const body = (overrides = {}) =>
  JSON.stringify({
    법령: {
      기본정보: {
        법령명_한글: title,
        법령ID: "1",
        시행일자: "20250101",
        ...overrides,
      },
      조문: {
        조문내용:
          "제1조 이 문서는 연결 법령 수집을 시험하기 위한 가상의 원문입니다.",
      },
    },
  });
it("백업 복원 후 연결 원문은 당시 검토에서 복구하되 검증 승인은 재사용하지 않는다", () => {
  const { store, clean } = testStore();
  const next = testStore();
  try {
    const e = evidence();
    const r = newReview({ ...req, linkedEvidenceIds: [e.id] });
    r.status = "completed";
    r.evidence = [e];
    r.referenceCollection = {
      parentReviewId: crypto.randomUUID(),
      title: e.title,
      state: "collected",
      message: "시험",
      evidenceId: e.id,
    };
    store.saveReview(r);
    restoreBackup(next.store, makeBackup(store));
    const restored = next.store.review(r.id)!;
    expect(restored.referenceCollection?.evidenceId).toBe(e.id);
    const attached = attachLinkedBasis(next.store, restored.request, []);
    expect(attached[0].hash).toBe(e.hash);
    expect(attached[0].verified).toBe(false);
    expect(attached[0].annexesComplete).toBe(false);
  } finally {
    clean();
    next.clean();
  }
});
it("유사 제목을 제외하고 기준일 이전 최신 시행 버전을 선택한다", () => {
  const future = { ...row, 법령일련번호: "124", 시행일자: "20270101" };
  const older = { ...row, 법령일련번호: "122", 시행일자: "20240101" };
  expect(
    selectReferenceRow(
      [future, older, row, { ...row, 법령명한글: title + " 시행령" }],
      title,
      req,
      "eflaw",
    ),
  ).toEqual(row);
  expect(() => selectReferenceRow([future], title, req, "eflaw")).toThrow(
    "기준일",
  );
});
it("폐지 최신 버전·동명 다른 법규·동일 날짜 버전 충돌을 보류한다", () => {
  expect(() =>
    selectReferenceRow(
      [
        row,
        {
          ...row,
          법령일련번호: "124",
          시행일자: "20260101",
          제개정구분명: "폐지",
        },
      ],
      title,
      req,
      "eflaw",
    ),
  ).toThrow("폐지");
  expect(() =>
    selectReferenceRow(
      [row, { ...row, 법령일련번호: "124", 법령ID: "2" }],
      title,
      req,
      "eflaw",
    ),
  ).toThrow("식별자");
  expect(() =>
    selectReferenceRow(
      [row, { ...row, 법령일련번호: "124" }],
      title,
      req,
      "eflaw",
    ),
  ).toThrow("충돌");
});
it("시군구 조례는 시도 소관 정보까지 일치해야 연결한다", () => {
  const local = {
    자치법규명: "화성시 시험 조례",
    자치법규일련번호: "123",
    자치법규ID: "local1",
    시행일자: "20250101",
    지자체기관명: "경기도 화성시",
  };
  expect(selectReferenceRow([local], local.자치법규명, req, "ordin")).toEqual(
    local,
  );
  expect(() =>
    selectReferenceRow(
      [{ ...local, 지자체기관명: "" }],
      local.자치법규명,
      req,
      "ordin",
    ),
  ).toThrow();
  expect(() =>
    selectReferenceRow(
      [local],
      local.자치법규명,
      { ...req, municipality: "수원시" },
      "ordin",
    ),
  ).toThrow();
});
it("목록과 상세 일치를 검증하고 별표 누락을 승인하지 않는다", async () => {
  const { store, clean } = testStore();
  const connector = new LawConnector("synthetic");
  vi.spyOn(connector, "list").mockResolvedValue([row]);
  const detail = vi.spyOn(connector, "request").mockResolvedValue(body());
  vi.spyOn(connector, "attachmentText").mockResolvedValue({
    text: "시험 첨부 발췌",
    count: 1,
    failed: true,
    nextOffset: null,
  });
  try {
    const e = await collectReference(store, "synthetic", req, title, connector);
    expect(e.verified).toBe(false);
    expect(e.historyComplete).toBe(false);
    expect(e.annexesComplete).toBe(false);
    expect(e.url).toContain("lsiSeq=123");
    expect(e.url).not.toContain("synthetic");
    for (const mismatch of [
      { 법령명_한글: "다른법률" },
      { 시행일자: "20250102" },
      { 법령ID: "2" },
    ]) {
      detail.mockResolvedValue(body(mismatch));
      await expect(
        collectReference(store, "synthetic", req, title, connector),
      ).rejects.toThrow();
    }
    expect(store.all("evidence")).toHaveLength(0);
  } finally {
    clean();
  }
});
it("연결 원문은 해당 지역·시군구·기준일 검토에만 첨부한다", () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    saveLinkedBasis(store, req, e);
    const linked = { ...req, linkedEvidenceIds: [e.id] };
    expect(attachLinkedBasis(store, linked, [])).toEqual([e]);
    expect(attachLinkedBasis(store, linked, [e])).toHaveLength(1);
    expect(store.search("시험", "경기도", req.asOf)).toHaveLength(0);
    for (const mismatch of [
      { region: "울산광역시" },
      { municipality: "수원시" },
      { asOf: "2026-10-07" },
    ])
      expect(() =>
        attachLinkedBasis(store, { ...linked, ...mismatch }, []),
      ).toThrow("다릅니다");
  } finally {
    clean();
  }
});
it("실제 경로는 이전 검토를 보존하며 누락 참조만 새 검토에 수집한다", async () => {
  const { store, clean } = testStore();
  const { app, vault } = await createApp(store, true);
  const parent = newReview(req);
  parent.status = "completed";
  parent.evidence = [evidence({ text: `시험 연결은 「${title}」에 따른다.` })];
  parent.verification = buildVerification(parent.evidence, req, false);
  store.saveReview(parent);
  const before = JSON.stringify(store.review(parent.id));
  const list = vi
    .spyOn(LawConnector.prototype, "list")
    .mockResolvedValue([row]);
  vi.spyOn(LawConnector.prototype, "request").mockResolvedValue(body());
  vi.spyOn(LawConnector.prototype, "attachmentText").mockResolvedValue({
    text: "",
    count: 0,
    failed: false,
    nextOffset: null,
  });
  for (const source of store.sources())
    store.put("sources", source.id, {
      ...source,
      status: "ok",
      count: 1,
      lastSuccessAt: new Date().toISOString(),
    });
  await vault.write("law", { lawOc: "synthetic" });
  try {
    const b = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      cookie: `${b.cookies[0].name}=${b.cookies[0].value}`,
      "x-csrf-token": b.json().csrf,
    };
    const send = (value: string) =>
      app.inject({
        method: "POST",
        url: `/api/reviews/${parent.id}/resolve-reference`,
        headers,
        payload: { title: value, useAi: false },
      });
    expect((await send("임의 검색어 법률")).statusCode).toBe(400);
    expect(list).not.toHaveBeenCalled();
    const r = await send(title);
    expect(r.statusCode).toBe(202);
    await vi.waitFor(() =>
      expect(store.review(r.json().id)?.status).toBe("completed"),
    );
    const result = store.review(r.json().id)!;
    expect(result.referenceCollection?.state).toBe("collected");
    expect(result.evidence.some((e) => e.title === title)).toBe(true);
    expect(result.request.useAi).toBe(false);
    expect(result.request.linkedEvidenceIds).toHaveLength(1);
    expect(store.all("evidence")).toHaveLength(0);
    const diff = await app.inject({
      url: `/api/evidence/${result.request.linkedEvidenceIds![0]}/diff`,
      headers,
    });
    expect(diff.statusCode).toBe(200);
    expect(diff.json().label).toContain("이전 전문이 없습니다");
    expect(JSON.stringify(store.review(parent.id))).toBe(before);
  } finally {
    await app.close();
    vi.restoreAllMocks();
    clean();
  }
});

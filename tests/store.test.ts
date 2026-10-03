import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testStore, evidence, request } from "./helpers.js";
import { sha, atomicJson } from "../server/store.js";
import { join } from "node:path";
import { newReview } from "../server/reviews.js";
import { ingestDocument } from "../server/documents.js";
import { makeBackup, restoreBackup } from "../server/backup.js";
import { evidenceGaps } from "../server/legal.js";
it("폐지 시행일부터는 종전 법규를 현행 근거로 되살리지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    store.saveEvidence(e);
    store.saveEvidence({
      ...e,
      id: randomUUID(),
      version: "repeal",
      effectiveFrom: "2026-06-01",
      repealed: true,
    });
    expect(store.search("시험", "경기도", "2026-05-31")).toHaveLength(1);
    expect(store.search("시험", "경기도", "2026-06-01")).toHaveLength(0);
  } finally {
    clean();
  }
});
it("후속 버전의 적용기간 종료가 구 버전을 되살리지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const old = evidence();
    store.saveEvidence(old);
    store.saveEvidence({
      ...old,
      id: randomUUID(),
      version: "expired",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-02-01",
    });
    expect(store.search("시험", "경기도", "2026-02-02")).toHaveLength(0);
    expect(store.search("시험", "경기도", "2025-02-01")[0].version).toBe(
      old.version,
    );
  } finally {
    clean();
  }
});
it("동일 시행일의 상충 원문은 임의 선택하거나 검증 완료로 처리하지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const old = evidence();
    store.saveEvidence(old);
    store.saveEvidence({
      ...old,
      id: randomUUID(),
      text: "상충하는 시험 원문",
      hash: sha("상충하는 시험 원문"),
    });
    const found = store.search("시험", "경기도", "2026-01-01");
    expect(found).toHaveLength(2);
    expect(evidenceGaps(found, "경기도", "2026-01-01").join()).toContain(
      "서로 다른 원문",
    );
  } finally {
    clean();
  }
});
it("본문이 같아도 적용기간 변경은 과거 보고서의 재검토를 요구한다", () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    store.saveEvidence(e);
    const r = newReview(request());
    r.evidence = [e];
    store.saveReview(r);
    store.saveEvidence({
      ...e,
      id: randomUUID(),
      effectiveTo: "2026-01-01",
      verified: false,
    });
    expect(store.review(r.id)?.needsReview).toBe(true);
  } finally {
    clean();
  }
});
it("기준일에 유효한 최신 버전만 반환하고 이후 개정을 섞지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const a = evidence();
    store.saveEvidence(a);
    store.saveEvidence({
      ...a,
      id: randomUUID(),
      version: "v2",
      effectiveFrom: "2027-01-01",
      text: "2027년 가상 조문",
      hash: sha("2027년 가상 조문"),
    });
    expect(store.search("가상", "경기도", "2026-10-02")[0].version).toBe(
      "test-1",
    );
    expect(store.search("가상", "경기도", "2027-01-01")[0].version).toBe("v2");
  } finally {
    clean();
  }
});
it("법규 변경 시 과거 검토 원문은 보존하고 재검토 표시한다", () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    store.saveEvidence(e);
    const r = newReview(request());
    r.evidence = [e];
    store.saveReview(r);
    store.saveEvidence({
      ...e,
      id: randomUUID(),
      version: "new",
      text: "개정된 시험 원문 내용",
      hash: sha("개정된 시험 원문 내용"),
    });
    expect(store.review(r.id)?.needsReview).toBe(true);
    expect(store.review(r.id)?.evidence[0].text).toBe(e.text);
  } finally {
    clean();
  }
});
it("동일한 전문 수집은 중복하지 않고 검증 상태 유지", () => {
  const { store, clean } = testStore();
  try {
    const e = evidence();
    store.saveEvidence(e);
    store.saveEvidence({ ...e, id: randomUUID(), verified: false });
    expect(store.all("evidence")).toHaveLength(1);
    expect(store.search("시험", "경기도", "2026-10-02")[0].verified).toBe(true);
  } finally {
    clean();
  }
});
it("백업·복원은 원본을 보존하고 인증·승인은 포함하지 않는다", async () => {
  const a = testStore(),
    b = testStore();
  try {
    await ingestDocument(
      a.store,
      "시험.txt",
      Buffer.from("개인 회신 시험자료"),
    );
    a.store.put("settings", "oauth-host-id", "private-host");
    const backup = makeBackup(a.store);
    expect(JSON.stringify(backup)).not.toContain("private-host");
    restoreBackup(b.store, backup);
    expect(b.store.all<any>("documents")[0].text).toBe("개인 회신 시험자료");
    expect(b.store.all<any>("documents")[0].confirmed).toBe(false);
  } finally {
    a.clean();
    b.clean();
  }
});
it("잘못된 백업은 일부분도 적용하지 않는다", async () => {
  const a = testStore(),
    b = testStore();
  try {
    await ingestDocument(a.store, "시험.txt", Buffer.from("복원 무결성 자료"));
    const backup = makeBackup(a.store);
    backup.documents[0].hash = "0".repeat(64);
    expect(() => restoreBackup(b.store, backup)).toThrow();
    expect(b.store.all("documents")).toHaveLength(0);
  } finally {
    a.clean();
    b.clean();
  }
});
it("공개 데이터에 민원·부정확한 해시가 있으면 가져오지 않는다", () => {
  const { store, clean } = testStore();
  try {
    const path = join(store.dir, "public.json");
    atomicJson(path, {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      sources: [],
      evidence: [evidence(), evidence({ kind: "petition" })],
    });
    expect(() => store.importPublic(path)).toThrow();
    expect(store.all("evidence")).toHaveLength(0);
  } finally {
    clean();
  }
});

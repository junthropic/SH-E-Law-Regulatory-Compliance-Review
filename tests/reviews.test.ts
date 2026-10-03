import { it, expect, vi } from "vitest";
import { testStore, request, basis } from "./helpers.js";
import { newReview, runReview, recentSourceCheck } from "../server/reviews.js";
import { Vault } from "../server/vault.js";
import { ChatGPTAuth } from "../server/auth.js";
import type { SourceStatus } from "../shared/types.js";

function sources(at: string): SourceStatus[] {
  return ["전국", "경기도"].map((region, i) => ({
    id: i ? "ordin-41" : "national",
    name: "시험 출처",
    region,
    status: "ok",
    checkedAt: at,
    lastSuccessAt: at,
    count: 1,
    message: "시험",
    verified: false,
  }));
}

it("최근 수집 원문은 재수집하지 않고 실제 확인 시각을 보존한다", async () => {
  const { store, clean } = testStore();
  try {
    const at = new Date(Date.now() - 3600_000).toISOString();
    for (const s of sources(at)) store.put("sources", s.id, s);
    for (const e of basis()) store.saveEvidence(e);
    const vault = new Vault(store.dir, true);
    await vault.write("law", { lawOc: "TEST-ONLY" });
    const refresh = vi.fn(async () => sources(at));
    const review = newReview(request());
    await runReview(
      store,
      vault,
      new ChatGPTAuth(store, vault),
      review,
      refresh,
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(review.status).toBe("completed");
    expect(review.coverage.latestCheckedAt).toBe(at);
    expect(review.issues.every((i) => i.category !== "clear_risk")).toBe(true);
  } finally {
    clean();
  }
});

it("갱신 실패 이력이 있으면 이전 성공 시각이 최근이어도 다시 확인한다", async () => {
  const { store, clean } = testStore();
  try {
    const at = new Date(Date.now() - 60_000).toISOString();
    const states = sources(at);
    states[1].status = "failed";
    for (const s of states) store.put("sources", s.id, s);
    const vault = new Vault(store.dir, true);
    await vault.write("law", { lawOc: "TEST-ONLY" });
    const refresh = vi.fn(async () => states);
    const review = newReview(request());
    await runReview(
      store,
      vault,
      new ChatGPTAuth(store, vault),
      review,
      refresh,
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(review.coverage.latestCheckedAt).toBeNull();
    expect(review.gaps.some((s) => s.includes("최신 확인이 실패"))).toBe(true);
  } finally {
    clean();
  }
});

it("24시간 경계·미래 시각·지역 누락은 재사용하지 않는다", () => {
  const now = Date.now();
  expect(
    recentSourceCheck(
      sources(new Date(now - 86400_000).toISOString()),
      "경기도",
      now,
    ),
  ).toBeNull();
  expect(
    recentSourceCheck(sources(new Date(now + 1).toISOString()), "경기도", now),
  ).toBeNull();
  expect(
    recentSourceCheck(sources(new Date(now).toISOString()), "울산광역시", now),
  ).toBeNull();
  expect(
    recentSourceCheck(
      sources(new Date(now - 1000).toISOString()),
      "경기도",
      now,
    ),
  ).toBeTruthy();
});

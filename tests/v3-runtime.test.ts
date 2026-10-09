import { it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { testStore } from "./helpers.js";
import { writer } from "./v2-fixture.js";
import { DurableJobs, workOne, reuse304 } from "../server/jobs-v3.js";
import { PublicApiError } from "../server/public-api-transport.js";
import { convertPeriod, localDate } from "../server/periods-v3.js";
import { assessConsignee } from "../server/collection-service-v3.js";
import { SourceLifecycle } from "../server/source-lifecycle-v3.js";
import { sha } from "../server/store.js";
const input = {
  provider: "waste-companies",
  operation: "search",
  query: { keyword: "가상 업체", page: 1 },
  credentialRef: "synthetic-key-reference",
  schemaVersion: "v3-1",
  budgetMs: 10000,
};
const result = {
  service: "waste-companies",
  query: "가상 업체",
  page: 1,
  total: 0,
  items: [],
  hasMore: false,
  fetchedAt: new Date().toISOString(),
  warnings: [],
};
it("V3-J10: 검색 0건·일시 오류는 원천 삭제가 아니며 확인된 비공개 이력도 과거 근거를 보존한다", () => {
  const f = testStore();
  try {
    const history = new SourceLifecycle(f.store),
      p = { ...writer, roles: ["extraction_reviewer" as const] },
      base = {
        sourceId: "synthetic",
        reason: "기관 원천 상태를 가상으로 대조한 기록입니다.",
        snapshotHash: sha("old"),
        confirmed: true,
      };
    for (const kind of ["not_returned", "temporary_error"]) {
      expect(history.record(p, { ...base, kind }).tombstone).toBe(false);
    }
    expect(history.record(p, { ...base, kind: "deleted" }).tombstone).toBe(
      false,
    );
    expect(
      history.record(p, {
        ...base,
        kind: "private",
        officialUrl: "https://example.test/withdrawal",
      }),
    ).toMatchObject({
      tombstone: true,
      preservePriorEvidence: true,
      automaticLegalEffect: false,
    });
  } finally {
    f.clean();
  }
});
it("V3-P01: 날짜 포함·제외 왕복, 윤년과 변경 경계를 보존한다", () => {
  const p = {
    unit: "date" as const,
    timezone: "Asia/Seoul" as const,
    from: "2024-02-28",
    to: "2024-03-01",
    end: "known" as const,
    boundary: "half_open" as const,
  };
  const closed = convertPeriod(p, "closed");
  expect(closed.period?.to).toBe("2024-02-29");
  expect(convertPeriod(closed.period!, "half_open").period).toEqual(p);
  expect(
    convertPeriod({ ...p, from: "2024-03-01", to: "2024-03-02" }, "closed")
      .period?.from,
  ).toBe("2024-03-01");
  expect(() => convertPeriod({ ...p, to: p.from }, "closed")).toThrow();
  expect(() => convertPeriod({ ...p, from: "2024-02-30" }, "closed")).toThrow();
  expect(
    convertPeriod({ ...p, boundary: "closed", to: p.from }, "half_open").period
      ?.to,
  ).toBe("2024-02-29");
});
it("V3-P02: 열린 종료와 미확인 종료를 실제 종료일로 만들지 않는다", () => {
  const p = {
    unit: "date" as const,
    timezone: "Asia/Seoul" as const,
    from: "2024-01-01",
    to: null,
    end: "open" as const,
    boundary: "half_open" as const,
  };
  const r = convertPeriod(p, "closed", "2026-10-08");
  expect(r.assessmentWindow).toBe(true);
  expect(r.original.to).toBeNull();
  expect(r.period?.to).toBe("2026-10-08");
  expect(convertPeriod({ ...p, end: "unknown" }, "closed").state).toBe(
    "unmapped",
  );
});
it("V3-P03: 시각 경계에 하루를 더하지 않고 서울 자정을 구분한다", () => {
  expect(localDate("2026-10-07T15:00:00Z", "Asia/Seoul")).toBe("2026-10-08");
  expect(localDate("2026-10-07T15:00:00Z", "UTC")).toBe("2026-10-07");
  expect(
    convertPeriod(
      {
        unit: "instant",
        timezone: "Asia/Seoul",
        from: "2026-10-07T15:00:00Z",
        to: "2026-10-08T15:00:00Z",
        end: "known",
        boundary: "half_open",
      },
      "closed",
    ).state,
  ).toBe("unmapped");
  expect(() => localDate("2026-10-08T00:00:00", "Asia/Seoul")).toThrow();
});
it("V3-J01: 접수 반복은 동일 ID, 내용 충돌과 다른 영역 접근은 차단한다", () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store);
    const a = jobs.enqueue(writer, "one", input);
    expect(jobs.enqueue(writer, "one", input).id).toBe(a.id);
    expect(() =>
      jobs.enqueue(writer, "one", { ...input, query: { keyword: "다름" } }),
    ).toThrow(/충돌/);
    expect(() => jobs.get({ ...writer, tenant: "other" }, a.id)).toThrow();
    expect(() => jobs.get({ ...writer, synthetic: false }, a.id)).toThrow();
  } finally {
    f.clean();
  }
});
it("V3-J02: 만료된 worker와 취소 이후 응답은 저장하지 않는다", () => {
  const f = testStore();
  let now = 1000;
  try {
    const jobs = new DurableJobs(f.store, () => now),
      a = jobs.enqueue(writer, "one", input),
      old = jobs.claim("old", 100)!;
    now += 101;
    const current = jobs.claim("new", 100)!;
    expect(current.fence).toBeGreaterThan(old.fence);
    expect(() =>
      jobs.commit(old, {
        id: "old",
        parent: null,
        role: "list",
        state: "success",
        data: result,
      }),
    ).toThrow();
    jobs.commit(current, {
      id: "new",
      parent: null,
      role: "list",
      state: "success",
      data: result,
    });
    jobs.control(writer, a.id, "cancel");
    expect(() => jobs.finish(current)).toThrow();
    expect(jobs.units(writer, a.id)).toHaveLength(1);
    expect(jobs.get(writer, a.id).state).toBe("cancelled");
  } finally {
    f.clean();
  }
});
it("V3-J03: 원문·checkpoint는 함께 rollback되고 0건과 실패가 구분된다", () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store),
      a = jobs.enqueue(writer, "one", input),
      j = jobs.claim("worker")!;
    expect(() =>
      jobs.commit(
        j,
        {
          id: "p1",
          parent: null,
          role: "list",
          state: "success",
          data: result,
          nextPage: 2,
        },
        () => {
          throw Error("disk fault");
        },
      ),
    ).toThrow();
    expect(jobs.units(writer, a.id)).toHaveLength(0);
    expect(jobs.get(writer, a.id).cursor).toBe(1);
    jobs.commit(j, {
      id: "p1",
      parent: null,
      role: "list",
      state: "success",
      data: result,
    });
    jobs.fail(j, new PublicApiError("가상 시간초과", "timeout"));
    expect(jobs.get(writer, a.id).cardinality).toBe("empty");
    expect(jobs.get(writer, a.id).state).toBe("failed");
  } finally {
    f.clean();
  }
});
it("V3-J04: 공유 quota 차단은 다른 작업에도 적용되고 권한 없는 해제를 거절한다", () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store),
      a = jobs.enqueue(writer, "a", input),
      j = jobs.claim("one")!;
    expect(jobs.acquireQuota(j).allowed).toBe(true);
    jobs.releaseQuota(j, null);
    jobs.fail(
      j,
      new PublicApiError("한도", "rate_limit", false, Number.MAX_SAFE_INTEGER),
    );
    jobs.enqueue(writer, "b", input);
    const b = jobs.claim("two")!;
    expect(jobs.acquireQuota(b)).toMatchObject({
      allowed: false,
      waitUntil: null,
    });
    expect(() =>
      jobs.manualRelease(
        writer,
        jobs.quotaKey(j),
        "기관에서 확인한 가상 제한 해제 사유입니다.",
        "https://example.test/quota",
      ),
    ).toThrow();
    const r = jobs.manualRelease(
      { ...writer, roles: [...writer.roles, "collection_operator"] },
      jobs.quotaKey(j),
      "기관에서 확인한 가상 제한 해제 사유입니다.",
      "https://example.test/quota",
    );
    expect(r.connectionVerified).toBe(false);
    expect(jobs.get(writer, a.id).eligible).not.toBeNull();
  } finally {
    f.clean();
  }
});
it("V3-J05: 응답 없는 transport도 총 시간 예산으로 끝난다", async () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store),
      j = jobs.enqueue(writer, "budget", { ...input, budgetMs: 1000 });
    await workOne(
      jobs,
      "worker",
      async () => {
        await new Promise(() => {});
      },
      100,
    );
    expect(jobs.get(writer, j.id).state).toBe("failed");
    expect(jobs.get(writer, j.id).reason).toBe("timeout");
  } finally {
    f.clean();
  }
});
it("V3-J06: 304는 대응 원문과 query·validator가 있어야 재사용한다", () => {
  expect(() => reuse304(304, "q", "etag")).toThrow();
  expect(() =>
    reuse304(304, "q", "new", { queryHash: "q", validator: "old", data: [] }),
  ).toThrow();
  expect(
    reuse304(304, "q", "etag", {
      queryHash: "q",
      validator: "etag",
      data: [1],
    }),
  ).toEqual([1]);
});
function child(dir: string, mode: string) {
  const build = resolve(process.env.SHE_TEST_BUILD || "work/v3-build");
  const code = `import {Store} from ${JSON.stringify(pathToFileURL(join(build, "server/store.js")).href)};import {DurableJobs} from ${JSON.stringify(pathToFileURL(join(build, "server/jobs-v3.js")).href)};
  const s=new Store(process.argv[1]),jobs=new DurableJobs(s);await new Promise(r=>setTimeout(r,100));const j=jobs.claim('child-'+process.pid,1000);let quota=null;if(j&&process.argv[2]==='quota')quota=jobs.acquireQuota(j).allowed;if(j&&process.argv[2]==='crash'){jobs.commit(j,{id:'checkpoint',parent:null,role:'list',state:'success',data:{items:[],total:0,page:1,hasMore:false},nextPage:2});process.exit(41);}console.log(JSON.stringify({pid:process.pid,id:j?.id||null,quota}));s.close();`;
  return new Promise<any>((res, rej) => {
    const p = spawn(
      process.execPath,
      ["--input-type=module", "-e", code, dir, mode],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("error", rej);
    p.on("close", (n) =>
      n === 41
        ? res({ crashed: true })
        : n
          ? rej(Error(err))
          : res(JSON.parse(out.trim())),
    );
  });
}
it("V3-J07: 실제 두 독립 프로세스의 동시 claim은 한 worker만 획득한다", async () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store),
      j = jobs.enqueue(writer, "process", input);
    const settled = await Promise.allSettled([child(f.store.dir, "claim"), child(f.store.dir, "claim")]);
    const r = settled.map(x => { if (x.status === "rejected") throw x.reason; return x.value; });
    expect(r[0].pid).not.toBe(r[1].pid);
    expect(r.filter((x) => x.id === j.id)).toHaveLength(1);
  } finally {
    f.clean();
  }
});
it("V3-J08: 실제 두 프로세스는 다른 작업에서도 provider/key 호출 lease를 공유한다", async () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store);
    jobs.enqueue(writer, "a", input);
    jobs.enqueue(writer, "b", input);
    const r = await Promise.all([
      child(f.store.dir, "quota"),
      child(f.store.dir, "quota"),
    ]);
    expect(r.filter((x) => x.id)).toHaveLength(2);
    expect(r.filter((x) => x.quota)).toHaveLength(1);
  } finally {
    f.clean();
  }
});
it("V3-J09: 프로세스 비정상 종료 뒤 마지막 저장 checkpoint에서 재개한다", async () => {
  const f = testStore();
  try {
    const jobs = new DurableJobs(f.store),
      a = jobs.enqueue(writer, "crash", input);
    expect((await child(f.store.dir, "crash")).crashed).toBe(true);
    const restart = new DurableJobs(f.store, () => Date.now() + 1100),
      j = restart.claim("restarted")!;
    expect(j.id).toBe(a.id);
    expect(j.cursor).toBe(2);
    expect(restart.units(writer, j.id)).toHaveLength(1);
  } finally {
    f.clean();
  }
});
it.each([
  ["timeout", "success"],
  ["success", "error"],
  ["empty", "success"],
])("V3-S2: 수탁업체 조회 %s/%s는 위탁 가능으로 확정하지 않는다", (a, b) => {
  expect(
    assessConsignee({
      asOf: "2026-10-08",
      a07: { state: a },
      a08: { state: b, count: 0 },
    }),
  ).toMatchObject({ approved: false, category: "more_data" });
});
it("V3-S2: 동명 업체·다른 시설·과거 처분과 현재 효력을 구분한다", () => {
  const r = assessConsignee({
    asOf: "2026-10-08",
    businessId: "1",
    facility: "A",
    waste: "폐유",
    permit: {
      businessId: "1",
      facility: "A",
      wastes: ["폐산"],
      validTo: "2027-01-01",
      reviewed: true,
    },
    a07: { state: "success", businessId: "2", facility: "A" },
    a08: {
      state: "success",
      count: 1,
      businessId: "1",
      facility: "B",
      from: "2020-01-01",
      to: "2020-02-01",
      effectReviewed: false,
    },
  });
  expect(r.historicalSanction).toBe(true);
  expect(r.approved).toBe(false);
  expect(r.holds).toContain("동명 업체 또는 다른 시설 자료 대조");
  expect(r.holds).toContain("허가 효력·대상 폐기물·처리 범위 확인");
});

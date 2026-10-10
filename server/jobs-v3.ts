import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { CollectionJournal } from "./collection-journal-v2.js";
import { PublicApiError } from "./public-api-transport.js";
export const JobInput = z
  .object({
    provider: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
    operation: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
    query: z
      .object({
        keyword: z.string().max(100).optional(),
        mode: z.string().max(40).optional(),
        page: z.number().int().min(1).optional(),
        code: z.string().max(60).optional(),
        cas: z.string().max(40).optional(),
        filters: z
          .record(z.string().regex(/^[a-zA-Z0-9_]{1,40}$/), z.string().max(100))
          .optional(),
      })
      .strict(),
    credentialRef: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
    schemaVersion: z.literal("v3-1"),
    budgetMs: z.number().int().min(1000).max(600000).default(180000),
  })
  .strict();
export type JobState =
  | "queued"
  | "running"
  | "waiting_retry"
  | "waiting_quota"
  | "paused"
  | "cancelled"
  | "succeeded"
  | "failed";
export type Job = {
  id: string;
  tenant: string;
  synthetic: boolean;
  requester: string;
  input: z.infer<typeof JobInput>;
  state: JobState;
  fence: number;
  owner: string | null;
  leaseUntil: number;
  eligible: number | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  attempts: number;
  cursor: number;
  partial: boolean;
  cardinality: "unknown" | "empty" | "data";
  reason: string | null;
};
export type UnitResult = {
  id: string;
  parent: string | null;
  role: "list" | "detail" | "attachment";
  state: "success" | "error" | "not_supported" | "absent";
  data?: unknown;
  error?: string;
  nextPage?: number | null;
};
const unitSchema = z
  .object({
    id: z.string().max(200),
    parent: z.string().max(200).nullable(),
    role: z.enum(["list", "detail", "attachment"]),
    state: z.enum(["success", "error", "not_supported", "absent"]),
    data: z.unknown().optional(),
    error: z
      .string()
      .max(50)
      .regex(/^[a-z_]+$/)
      .optional(),
    nextPage: z.number().int().min(1).nullable().optional(),
  })
  .strict();
export class DurableJobs {
  constructor(
    readonly store: Store,
    readonly now = () => Date.now(),
  ) {
    store.db.exec(`PRAGMA busy_timeout=200;
      CREATE TABLE IF NOT EXISTS v3_jobs(id TEXT PRIMARY KEY,tenant TEXT,synthetic INTEGER,idem TEXT,input_hash TEXT,state TEXT,eligible INTEGER,lease_until INTEGER,fence INTEGER,body TEXT,UNIQUE(tenant,synthetic,idem));
      CREATE TABLE IF NOT EXISTS v3_job_units(job TEXT,id TEXT,hash TEXT,body TEXT,PRIMARY KEY(job,id,hash));
      CREATE TABLE IF NOT EXISTS v3_quota(id TEXT PRIMARY KEY,body TEXT);
      CREATE TABLE IF NOT EXISTS v3_job_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job TEXT,event TEXT,at INTEGER,body TEXT);`);
  }
  private transaction<T>(fn: () => T): T {
    for (let i = 0; ; i++) {
      let started = false;
      try {
        this.store.db.exec("BEGIN IMMEDIATE");
        started = true;
        const r = fn();
        this.store.db.exec("COMMIT");
        return r;
      } catch (e) {
        if (started) this.store.db.exec("ROLLBACK");
        if (i >= 3 || !/busy|locked/i.test(String(e))) throw e;
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(4)),
          0,
          0,
          10 * (i + 1),
        );
      }
    }
  }
  private read(id: string) {
    const r = this.store.db
      .prepare("SELECT body FROM v3_jobs WHERE id=?")
      .get(id) as { body: string } | undefined;
    return r ? (JSON.parse(r.body) as Job) : undefined;
  }
  private put(j: Job) {
    this.store.db
      .prepare(
        "UPDATE v3_jobs SET state=?,eligible=?,lease_until=?,fence=?,body=? WHERE id=?",
      )
      .run(j.state, j.eligible, j.leaseUntil, j.fence, JSON.stringify(j), j.id);
  }
  private event(id: string, event: string, body: unknown = {}) {
    this.store.db
      .prepare("INSERT INTO v3_job_events(job,event,at,body) VALUES(?,?,?,?)")
      .run(id, event, this.now(), JSON.stringify(body));
  }
  get(p: Principal, id: string) {
    assertPrincipal(p);
    const j = this.read(id);
    if (!j || j.tenant !== p.tenant || j.synthetic !== p.synthetic)
      throw new Error("작업 접근 권한 없음");
    return j;
  }
  enqueue(p: Principal, idem: string, input: unknown) {
    assertPrincipal(p);
    if (!p.roles.includes("writer") || !/^[-\w.]{1,120}$/.test(idem))
      throw new Error("작업 접수 권한·키 확인 필요");
    const parsed = JobInput.parse(input),
      inputHash = sha(JSON.stringify(parsed));
    return this.transaction(() => {
      const row = this.store.db
        .prepare(
          "SELECT id,input_hash FROM v3_jobs WHERE tenant=? AND synthetic=? AND idem=?",
        )
        .get(p.tenant, +p.synthetic, idem) as
        { id: string; input_hash: string } | undefined;
      if (row) {
        if (row.input_hash !== inputHash)
          throw new Error("동일 접수 키의 요청 내용 충돌");
        return this.get(p, row.id);
      }
      const j: Job = {
        id: randomUUID(),
        tenant: p.tenant,
        synthetic: p.synthetic,
        requester: p.id,
        input: parsed,
        state: "queued",
        fence: 0,
        owner: null,
        leaseUntil: 0,
        eligible: this.now(),
        createdAt: this.now(),
        startedAt: null,
        finishedAt: null,
        attempts: 0,
        cursor: parsed.query.page || 1,
        partial: false,
        cardinality: "unknown",
        reason: null,
      };
      this.store.db
        .prepare("INSERT INTO v3_jobs VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(
          j.id,
          j.tenant,
          +j.synthetic,
          idem,
          inputHash,
          j.state,
          j.eligible,
          0,
          0,
          JSON.stringify(j),
        );
      this.event(j.id, "accepted");
      return j;
    });
  }
  claim(owner: string, leaseMs = 70000) {
    if (!/^[-\w.]{1,100}$/.test(owner) || leaseMs < 10 || leaseMs > 180000)
      throw new Error("worker lease 확인 필요");
    return this.transaction(() => {
      const r = this.store.db
        .prepare(
          "SELECT id FROM v3_jobs WHERE (state IN ('queued','waiting_retry','waiting_quota') AND eligible IS NOT NULL AND eligible<=?) OR (state='running' AND lease_until<=?) ORDER BY eligible, id LIMIT 1",
        )
        .get(this.now(), this.now()) as { id: string } | undefined;
      if (!r) return null;
      const j = this.read(r.id)!;
      if (
        j.startedAt !== null &&
        this.now() - j.startedAt >= j.input.budgetMs
      ) {
        j.state = "failed";
        j.reason = "budget";
        j.finishedAt = this.now();
        this.put(j);
        return null;
      }
      j.state = "running";
      j.owner = owner;
      j.fence++;
      j.leaseUntil = this.now() + leaseMs;
      j.startedAt ??= this.now();
      j.attempts++;
      this.put(j);
      this.event(j.id, "claimed", { fence: j.fence, owner });
      return j;
    });
  }
  private current(j: Job) {
    const now = this.read(j.id);
    if (
      !now ||
      now.owner !== j.owner ||
      now.fence !== j.fence ||
      now.state !== "running" ||
      now.leaseUntil <= this.now()
    )
      throw new Error("만료·취소된 worker 결과 차단");
    return now;
  }
  heartbeat(j: Job, leaseMs = 70000) {
    return this.transaction(() => {
      const n = this.current(j);
      n.leaseUntil = this.now() + leaseMs;
      this.put(n);
      const key = this.quotaKey(j),
        row = this.store.db
          .prepare("SELECT body FROM v3_quota WHERE id=?")
          .get(key) as { body: string } | undefined;
      if (row) {
        const q = JSON.parse(row.body);
        if (q.owner === j.id && q.fence === j.fence)
          this.store.db
            .prepare("UPDATE v3_quota SET body=? WHERE id=?")
            .run(JSON.stringify({ ...q, leaseUntil: n.leaseUntil }), key);
      }
      return n;
    });
  }
  commit(j: Job, input: UnitResult, fault?: () => void) {
    const unit = unitSchema.parse(input);
    const json = JSON.stringify(unit);
    if (Buffer.byteLength(json) > 4_000_000)
      throw new Error("단위 원문 크기 한도");
    return this.transaction(() => {
      const n = this.current(j);
      if (
        unit.parent &&
        !this.store.db
          .prepare("SELECT 1 FROM v3_job_units WHERE job=? AND id=?")
          .get(j.id, unit.parent)
      )
        throw new Error("부모 수집 단위 없음");
      this.store.db
        .prepare("INSERT OR IGNORE INTO v3_job_units VALUES(?,?,?,?)")
        .run(j.id, unit.id, sha(json), json);
      fault?.();
      if (
        unit.role === "list" &&
        unit.state === "success" &&
        unit.data &&
        typeof unit.data === "object" &&
        "items" in unit.data
      ) {
        const result =
          unit.data as import("../shared/public-apis.js").PublicSearchResult;
        const journal = new CollectionJournal(this.store);
        journal.page(
          journal.start(
            j.input.provider + ":" + j.input.operation,
            JSON.stringify([j.tenant, j.synthetic, j.input.query]),
          ),
          result,
        );
        n.cardinality = result.items.length
          ? "data"
          : result.total === 0
            ? "empty"
            : "unknown";
      }
      n.partial = true;
      if (unit.nextPage) n.cursor = unit.nextPage;
      this.put(n);
      return n;
    });
  }
  finish(j: Job) {
    return this.transaction(() => {
      const n = this.current(j);
      n.state = "succeeded";
      n.finishedAt = this.now();
      n.leaseUntil = 0;
      this.put(n);
      this.event(n.id, "finished");
      return n;
    });
  }
  fail(j: Job, error: unknown) {
    return this.transaction(() => {
      const n = this.current(j),
        e =
          error instanceof PublicApiError
            ? error
            : new PublicApiError("수집 처리 오류", "format");
      n.reason = e.code;
      n.owner = null;
      n.leaseUntil = 0;
      if (e.code === "rate_limit") {
        n.state = "waiting_quota";
        n.eligible =
          e.retryAfterMs >= Number.MAX_SAFE_INTEGER
            ? null
            : this.now() + Math.max(60000, e.retryAfterMs);
      } else if (
        e.retryable &&
        n.attempts < 3 &&
        this.now() - (n.startedAt ?? this.now()) < n.input.budgetMs
      ) {
        n.state = "waiting_retry";
        n.eligible = this.now() + Math.min(30000, 1000 * 2 ** n.attempts);
      } else {
        n.state = "failed";
        n.finishedAt = this.now();
      }
      this.put(n);
      this.event(n.id, "failed_attempt", { code: e.code, state: n.state });
      return n;
    });
  }
  /** fail() was refused for a worker whose lease expired or was fenced out. Record it; job state is untouched. */
  failRejected(j: Job, error: unknown, rejection: unknown) {
    const now = this.read(j.id),
      expired =
        !!now && now.fence === j.fence && now.state === "running" && now.leaseUntil <= this.now();
    this.event(j.id, "fail_rejected", {
      fence: j.fence,
      owner: j.owner,
      code: error instanceof PublicApiError ? error.code : "format",
      reason: expired ? "만료 후 실패 기록 거부" : "실패 기록 거부",
      rejection: rejection instanceof Error ? rejection.message : String(rejection),
    });
  }
  control(p: Principal, id: string, action: "pause" | "resume" | "cancel") {
    return this.transaction(() => {
      const j = this.get(p, id);
      if (!p.roles.includes("writer") || j.requester !== p.id)
        throw new Error("작업 제어 권한 없음");
      if (["succeeded", "cancelled"].includes(j.state))
        throw new Error("종료 작업 상태 변경 불가");
      if (action === "resume" && j.state !== "paused" && j.state !== "failed")
        throw new Error("재개 가능한 상태 아님");
      j.fence++;
      j.owner = null;
      j.leaseUntil = 0;
      j.state =
        action === "pause"
          ? "paused"
          : action === "cancel"
            ? "cancelled"
            : "queued";
      j.eligible = action === "resume" ? this.now() : null;
      if (action === "resume") {
        j.startedAt = null;
        j.attempts = 0;
      }
      this.put(j);
      this.event(j.id, action, { actor: p.id });
      return j;
    });
  }
  units(p: Principal, id: string) {
    this.get(p, id);
    return (
      this.store.db
        .prepare("SELECT body FROM v3_job_units WHERE job=?")
        .all(id) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as UnitResult);
  }
  quotaKey(j: Job) {
    return sha(j.input.provider + ":" + j.input.credentialRef);
  }
  acquireQuota(j: Job) {
    return this.transaction(() => {
      this.current(j);
      const key = this.quotaKey(j);
      const row = this.store.db
        .prepare("SELECT body FROM v3_quota WHERE id=?")
        .get(key) as { body: string } | undefined;
      const old = row
        ? JSON.parse(row.body)
        : { blockedUntil: 0, leaseUntil: 0, next: 0 };
      if (
        old.blockedUntil === null ||
        old.blockedUntil > this.now() ||
        old.leaseUntil > this.now() ||
        old.next > this.now()
      )
        return {
          allowed: false,
          waitUntil:
            old.blockedUntil === null
              ? null
              : Math.max(old.blockedUntil, old.leaseUntil, old.next),
        };
      this.store.db
        .prepare(
          "INSERT INTO v3_quota VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        )
        .run(
          key,
          JSON.stringify({
            ...old,
            owner: j.id,
            fence: j.fence,
            leaseUntil: j.leaseUntil,
            next: this.now() + 2000,
          }),
        );
      return { allowed: true, waitUntil: 0 };
    });
  }
  releaseQuota(j: Job, limit?: number | null) {
    return this.transaction(() => {
      const key = this.quotaKey(j);
      const row = this.store.db
        .prepare("SELECT body FROM v3_quota WHERE id=?")
        .get(key) as { body: string } | undefined;
      if (!row) return;
      const q = JSON.parse(row.body);
      if (q.owner !== j.id || q.fence !== j.fence) return;
      this.store.db
        .prepare("UPDATE v3_quota SET body=? WHERE id=?")
        .run(
          JSON.stringify({
            ...q,
            owner: null,
            leaseUntil: 0,
            next: this.now() + 2000,
            blockedUntil: limit === undefined ? q.blockedUntil : limit,
          }),
          key,
        );
    });
  }
  manualRelease(
    p: Principal,
    quotaId: string,
    note: string,
    confirmation: string,
  ) {
    assertPrincipal(p);
    if (
      !p.roles.includes("collection_operator") ||
      note.length < 15 ||
      !/^https:\/\//.test(confirmation)
    )
      throw new Error("한도 해제 권한·기관 확인 근거 필요");
    const own = (
      this.store.db
        .prepare("SELECT body FROM v3_jobs WHERE tenant=? AND synthetic=?")
        .all(p.tenant, +p.synthetic) as { body: string }[]
    ).some((r) => this.quotaKey(JSON.parse(r.body)) === quotaId);
    if (!own) throw new Error("다른 영역의 호출 한도 해제 권한 없음");
    return this.transaction(() => {
      const row = this.store.db
        .prepare("SELECT body FROM v3_quota WHERE id=?")
        .get(quotaId) as { body: string } | undefined;
      if (!row) throw new Error("제한 상태 없음");
      const old = JSON.parse(row.body);
      if (old.leaseUntil > this.now())
        throw new Error("호출 실행 중 한도 해제 불가");
      this.store.db
        .prepare("UPDATE v3_quota SET body=? WHERE id=?")
        .run(
          JSON.stringify({ ...old, blockedUntil: 0, next: this.now() }),
          quotaId,
        );
      this.event(quotaId, "manual_release", {
        actor: p.id,
        note,
        confirmation,
        oldBlockedUntil: old.blockedUntil,
        newBlockedUntil: 0,
      });
      for (const r of this.store.db
        .prepare(
          "SELECT body FROM v3_jobs WHERE tenant=? AND state='waiting_quota'",
        )
        .all(p.tenant) as { body: string }[]) {
        const j = JSON.parse(r.body) as Job;
        if (j.synthetic === p.synthetic && this.quotaKey(j) === quotaId) {
          j.eligible = this.now();
          this.put(j);
        }
      }
      return { released: true, connectionVerified: false };
    });
  }
}
export async function workOne(
  jobs: DurableJobs,
  owner: string,
  handler: (
    job: Job,
    commit: (unit: UnitResult) => void,
    signal: AbortSignal,
  ) => Promise<void>,
  leaseMs = 70000,
) {
  const job = jobs.claim(owner, leaseMs);
  if (!job) return null;
  const quota = jobs.acquireQuota(job);
  if (!quota.allowed) {
    return jobs.fail(
      job,
      new PublicApiError(
        "공유 호출 제한",
        "rate_limit",
        false,
        quota.waitUntil === null
          ? Number.MAX_SAFE_INTEGER
          : Math.max(1, quota.waitUntil - jobs.now()),
      ),
    );
  }
  const controller = new AbortController(),
    remaining = Math.max(
      1,
      job.input.budgetMs - (jobs.now() - (job.startedAt ?? jobs.now())),
    );
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new PublicApiError("작업 시간 예산 초과", "timeout"));
    }, remaining);
  });
  const beat = setInterval(
    () => {
      try {
        jobs.heartbeat(job, leaseMs);
      } catch {
        controller.abort();
      }
    },
    Math.max(10, Math.floor(leaseMs / 3)),
  );
  let limit: number | null | undefined;
  try {
    await Promise.race([
      handler(
        job,
        (u) => {
          if (controller.signal.aborted) throw new Error("중단된 수집 결과");
          jobs.commit(job, u);
        },
        controller.signal,
      ),
      deadline,
    ]);
    return jobs.finish(job);
  } catch (error) {
    if (error instanceof PublicApiError && error.code === "rate_limit")
      limit =
        error.retryAfterMs >= Number.MAX_SAFE_INTEGER
          ? null
          : jobs.now() + Math.max(60000, error.retryAfterMs);
    try {
      return jobs.fail(job, error);
    } catch (rejection) {
      // The lease expired or the worker was fenced out, so this worker may no longer change the job.
      // Keep a trace of the refused failure; if even that write fails, still return null as before.
      try {
        jobs.failRejected(job, error, rejection);
      } catch {}
      return null;
    }
  } finally {
    clearInterval(beat);
    clearTimeout(timeout!);
    jobs.releaseQuota(job, limit);
  }
}
export function reuse304<T>(
  status: number,
  queryHash: string,
  validator: string,
  prior?: { queryHash: string; validator: string; data: T },
) {
  if (status !== 304) throw new Error("재검증 상태 아님");
  if (!prior || prior.queryHash !== queryHash || prior.validator !== validator)
    throw new Error("304 대응 원문·조건 없음");
  return prior.data;
}

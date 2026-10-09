import { Store, sha } from "./store.js";
import type { PublicSearchResult } from "../shared/public-apis.js";
export class CollectionJournal {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS v2_collection_jobs(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v2_collection_pages(job TEXT, page INTEGER, hash TEXT, body TEXT NOT NULL, PRIMARY KEY(job,page,hash));`);
  }
  start(service: string, queryIdentity: string) {
    const id = sha(service + ":" + queryIdentity);
    if (!this.store.get("v2_collection_jobs", id))
      this.store.put("v2_collection_jobs", id, {
        id,
        service,
        queryHash: sha(queryIdentity),
        schemaVersion: 2,
        state: "pending",
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastNonemptySuccessAt: null,
        sourceAsOf: null,
        snapshots: [],
        pages: [],
        failures: [],
        cardinality: "unknown",
        completeness: "not_evaluated",
        freshness: "unknown",
        cancelled: false,
      });
    return id;
  }
  failure(id: string, code: string) {
    const job = this.store.get<any>("v2_collection_jobs", id);
    if (!job) throw new Error("수집 작업 없음");
    this.store.put("v2_collection_jobs", id, {
      ...job,
      state: "failed",
      transport: ["format", "schema"].includes(code) ? "success" : code,
      parse: ["format", "schema"].includes(code) ? "error" : "not_run",
      cardinality: "unknown",
      completeness: job.pages.length ? "partial" : "incomplete",
      freshness: job.lastSuccessAt ? "stale" : "unknown",
      lastAttemptAt: new Date().toISOString(),
      failures: [...job.failures, { code, at: new Date().toISOString() }].slice(
        -100,
      ),
    });
  }
  page(id: string, result: PublicSearchResult, fault?: () => void) {
    const job = this.store.get<any>("v2_collection_jobs", id);
    if (!job || job.cancelled) throw new Error("작업 없음 또는 중단됨");
    if (
      !Number.isInteger(result.total) ||
      result.total < 0 ||
      !Number.isInteger(result.page) ||
      result.page < 1
    )
      throw new Error("수집 페이지 형식 오류");
    const identity = sha(
        JSON.stringify(result.items.map((i) => [i.service, i.hash])),
      ),
      at = new Date().toISOString();
    this.store.db.exec("SAVEPOINT collection_page");
    try {
      this.store.db
        .prepare("INSERT OR IGNORE INTO v2_collection_pages VALUES(?,?,?,?)")
        .run(id, result.page, identity, JSON.stringify(result));
      fault?.();
      const totalsChanged =
        job.total !== undefined && job.total !== result.total;
      const hashes = new Set<string>(job.itemHashes || []);
      let duplicates = 0;
      const replay = job.pages.includes(result.page);
      for (const item of result.items) {
        if (!replay && hashes.has(item.hash)) duplicates++;
        hashes.add(item.hash);
      }
      this.store.put("v2_collection_jobs", id, {
        ...job,
        state: "success",
        transport: "success",
        parse: "success",
        cardinality: result.items.length
          ? "data"
          : result.total === 0
            ? "empty"
            : "unknown",
        // Offset pagination alone does not establish a stable full-provider snapshot.
        completeness: "partial",
        freshness: "query_checked",
        lastAttemptAt: at,
        lastSuccessAt: at,
        lastNonemptySuccessAt: result.items.length
          ? at
          : job.lastNonemptySuccessAt,
        snapshots: [...new Set([...job.snapshots, identity])],
        pages: [...new Set([...job.pages, result.page])].sort(
          (a: number, b: number) => a - b,
        ),
        nextPage: result.hasMore ? result.page + 1 : null,
        total: result.total,
        sourceChanged: !!job.sourceChanged || totalsChanged,
        duplicates: (job.duplicates || 0) + duplicates,
        itemHashes: [...hashes],
        failures: job.failures,
      });
      this.store.db.exec("RELEASE collection_page");
    } catch (e) {
      this.store.db.exec(
        "ROLLBACK TO collection_page; RELEASE collection_page",
      );
      throw e;
    }
  }
  cancel(id: string, cancelled: boolean) {
    const job = this.store.get<any>("v2_collection_jobs", id);
    if (!job) throw new Error("수집 작업 없음");
    this.store.put("v2_collection_jobs", id, {
      ...job,
      cancelled,
      state: cancelled ? "cancelled" : "pending",
    });
  }
}

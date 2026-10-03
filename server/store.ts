import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import type {
  Evidence,
  ReviewResult,
  DocumentRecord,
  SourceStatus,
  Rule,
} from "../shared/types.js";
import { regions } from "../shared/types.js";
import { BundleSchema } from "./schemas.js";
import { publicBundlePath, readPublicBundle } from "./public-bundle.js";

export const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
// A text hash alone does not bind jurisdiction, legal version or effective dates.
export const evidenceIdentity = (e: Evidence) =>
  sha(
    JSON.stringify([
      e.sourceId,
      e.kind,
      e.title,
      e.region,
      e.article,
      e.hash,
      e.version,
      e.effectiveFrom,
      e.effectiveTo || "",
      !!e.repealed,
      e.promulgatedAt,
      e.url,
    ]),
  );
export function atomicJson(path: string, data: unknown) {
  writeFileSync(path + ".tmp", JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
export class Store {
  db: DatabaseSync;
  dir: string;
  constructor(dir = resolve(process.env.SHE_DATA_DIR || ".local")) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "originals"), { recursive: true });
    this.db = new DatabaseSync(join(dir, "private.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, sourceId TEXT, hash TEXT, body TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(id UNINDEXED,title,text,tokenize='trigram');
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT, action TEXT, detail TEXT);
      CREATE TABLE IF NOT EXISTS rules(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  get<T>(table: string, id: string): T | undefined {
    const r = this.db
      .prepare(
        `SELECT body FROM ${table} WHERE ${table === "settings" ? "key" : "id"}=?`,
      )
      .get(id) as { body: string } | undefined;
    return r ? JSON.parse(r.body) : undefined;
  }
  all<T>(table: string): T[] {
    return (
      this.db.prepare(`SELECT body FROM ${table}`).all() as { body: string }[]
    ).map((x) => JSON.parse(x.body));
  }
  put(table: string, id: string, body: unknown) {
    this.db
      .prepare(
        `INSERT INTO ${table}(${table === "settings" ? "key" : "id"},body) VALUES(?,?) ON CONFLICT(${table === "settings" ? "key" : "id"}) DO UPDATE SET body=excluded.body`,
      )
      .run(id, JSON.stringify(body));
  }
  delete(table: string, id: string) {
    this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  audit(action: string, detail: string) {
    this.db
      .prepare("INSERT INTO audit(at,action,detail) VALUES(?,?,?)")
      .run(new Date().toISOString(), action, detail);
  }
  review(id: string) {
    return this.get<ReviewResult>("reviews", id);
  }
  saveReview(r: ReviewResult) {
    r.updatedAt = new Date().toISOString();
    this.put("reviews", r.id, r);
  }
  document(id: string) {
    return this.get<DocumentRecord>("documents", id);
  }
  setting<T>(key: string, fallback: T): T {
    return this.get<T>("settings", key) ?? fallback;
  }
  saveEvidence(e: Evidence, preserveVerification = true) {
    const old = this.all<Evidence>("evidence").filter(
      (x) => x.sourceId === e.sourceId,
    );
    const unchanged = old.find(
      (x) => evidenceIdentity(x) === evidenceIdentity(e),
    );
    if (unchanged) {
      e.id = unchanged.id;
      if (preserveVerification) {
        e.verified = unchanged.verified;
        e.verificationNote = unchanged.verificationNote;
        e.annexesComplete = unchanged.annexesComplete;
        e.historyComplete = unchanged.historyComplete;
      }
    }
    this.db.exec("SAVEPOINT evidence_write");
    try {
      this.db
        .prepare(
          "INSERT INTO evidence(id,sourceId,hash,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,hash=excluded.hash",
        )
        .run(e.id, e.sourceId, e.hash, JSON.stringify(e));
      this.db.prepare("DELETE FROM evidence_fts WHERE id=?").run(e.id);
      this.db
        .prepare("INSERT INTO evidence_fts(id,title,text) VALUES(?,?,?)")
        .run(e.id, e.title, e.text);
      if (!unchanged && old.length)
        for (const r of this.all<ReviewResult>("reviews")) {
          if (
            r.evidence.some(
              (x) =>
                x.sourceId === e.sourceId &&
                evidenceIdentity(x) !== evidenceIdentity(e),
            )
          ) {
            r.needsReview = true;
            this.saveReview(r);
          }
        }
      this.db.exec("RELEASE evidence_write");
    } catch (err) {
      this.db.exec("ROLLBACK TO evidence_write; RELEASE evidence_write");
      throw err;
    }
  }
  search(query: string, region: string, asOf: string): Evidence[] {
    const terms = Array.from(
      new Set(
        (query.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
          (t) => t.length >= 3,
        ),
      ),
    ).slice(0, 25);
    let ranked: string[] = [];
    if (terms.length)
      try {
        ranked = (
          this.db
            .prepare(
              "SELECT id FROM evidence_fts WHERE evidence_fts MATCH ? ORDER BY rank LIMIT 100",
            )
            .all(
              terms.map((t) => '"' + t.replaceAll('"', "") + '"').join(" OR "),
            ) as { id: string }[]
        ).map((x) => x.id);
      } catch {}
    const all = this.all<Evidence>("evidence").filter(
      (e) =>
        (e.region === "전국" || e.region === region) &&
        e.effectiveFrom &&
        e.effectiveFrom <= asOf,
    );
    // A source without a known end date must not expose superseded snapshots as concurrent law.
    const latest = new Map<string, Evidence[]>();
    for (const e of all) {
      const old = latest.get(e.sourceId)?.[0];
      if (
        !old ||
        old.effectiveFrom < e.effectiveFrom ||
        (old.effectiveFrom === e.effectiveFrom &&
          old.promulgatedAt < e.promulgatedAt)
      )
        latest.set(e.sourceId, [e]);
      else if (
        old.effectiveFrom === e.effectiveFrom &&
        old.promulgatedAt === e.promulgatedAt
      )
        latest.get(e.sourceId)!.push(e);
    }
    // Select the latest legal version before checking expiry. Otherwise an expired
    // successor revives an older snapshot whose end date was never collected.
    return [...latest.values()]
      .flatMap((group) =>
        group.length > 1
          ? group
          : group.filter(
              (e) => !e.repealed && (!e.effectiveTo || e.effectiveTo >= asOf),
            ),
      )
      .sort((a, b) => {
        const ai = ranked.indexOf(a.id),
          bi = ranked.indexOf(b.id);
        return (ai < 0 ? 1000 : ai) - (bi < 0 ? 1000 : bi);
      });
  }
  sources(): SourceStatus[] {
    const stored = this.all<SourceStatus>("sources");
    return [
      { id: "national", name: "국가 법령·행정규칙", region: "전국" },
      ...regions.map(([id, name]) => ({
        id: "ordin-" + id,
        name: name + " 자치법규",
        region: name,
      })),
    ].map(
      (s) =>
        stored.find((x) => x.id === s.id) || {
          ...s,
          status: "pending",
          checkedAt: null,
          lastSuccessAt: null,
          count: 0,
          message: "API 연결 및 전문 수집 대기",
          verified: false,
        },
    );
  }
  rules(): Rule[] {
    return this.all<Rule>("rules");
  }
  importPublic(path: string) {
    path = publicBundlePath(path);
    if (!existsSync(path)) return;
    const d = BundleSchema.parse(readPublicBundle(path));
    for (const e of d.evidence) {
      const url = new URL(e.url);
      if (
        !["law", "ordinance", "gazette"].includes(e.kind) ||
        !/(^|\.)law\.go\.kr$/.test(url.hostname) ||
        url.username ||
        url.password ||
        sha(e.text) !== e.hash
      )
        throw new Error("공개 데이터 검증 실패");
    }
    this.db.exec("SAVEPOINT public_import");
    try {
      for (const e of d.evidence)
        this.saveEvidence({
          ...e,
          verified: false,
          verificationNote: "공개 데이터 수입: 현장 검증 별도",
        });
      for (const s of d.sources)
        this.put("sources", s.id, { ...s, verified: false });
      this.db.exec("RELEASE public_import");
    } catch (error) {
      this.db.exec("ROLLBACK TO public_import; RELEASE public_import");
      throw error;
    }
  }
  close() {
    if (this.db.isOpen) this.db.close();
  }
}

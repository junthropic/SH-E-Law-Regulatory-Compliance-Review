import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { Store, sha } from "./store.js";
import { DeadlinePolicy, calculateDeadline } from "./deadlines-v2.js";

export type Truth = "true" | "false" | "unknown" | "conflict";
export type Expression =
  { fact: string } | { all: Expression[] } | { any: Expression[] };
export const ExpressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    z.object({ fact: z.string().min(1) }).strict(),
    z.object({ all: z.array(ExpressionSchema).min(1).max(50) }).strict(),
    z.object({ any: z.array(ExpressionSchema).min(1).max(50) }).strict(),
  ]),
);
export function truthOf(e: Expression, facts: Record<string, Truth>): Truth {
  if ("fact" in e) return facts[e.fact] || "unknown";
  const all = "all" in e,
    values = (all ? e.all : e.any).map((x) => truthOf(x, facts));
  if (values.includes(all ? "false" : "true")) return all ? "false" : "true";
  if (values.includes("conflict")) return "conflict";
  if (values.includes("unknown")) return "unknown";
  return all ? "true" : "false";
}
const id = z.string().regex(/^[A-Za-z0-9_.-]{1,160}$/),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z
  .object({
    site: id,
    subject: id,
    place: id,
    periodFrom: z.string().date(),
    periodTo: z.string().date(),
  })
  .strict()
  .refine((v) => v.periodFrom <= v.periodTo, "대상 기간 확인 필요");
const ref = z
  .object({ id, version: z.number().int().positive(), hash })
  .strict();
export type Ref = z.infer<typeof ref>;
const evidence = z
  .object({
    kind: z.literal("evidence"),
    scope,
    originalHash: hash,
    originalRef: z.string().max(200),
    path: z.enum([
      "document",
      "agency_register",
      "electronic_record",
      "site_observation",
    ]),
    issuedAt: z.string().date().nullable(),
    receivedAt: z.string().date().nullable(),
    validFrom: z.string().date(),
    validTo: z.string().date().nullable(),
    collectedAt: z.string().datetime(),
    claims: z.record(z.string(), z.string()),
    limitations: z.array(z.string()),
    readable: z.boolean(),
    complete: z.boolean(),
    classification: z.enum(["public", "private", "personal", "trade_secret"]),
    externalAllowed: z.boolean(),
    retention: z.object({
      legalBasis: z.string().nullable(),
      internalPolicy: z.string(),
      deleteAfter: z.string().date().nullable(),
      hold: z.boolean(),
    }),
  })
  .strict();
const fact = z
  .object({
    kind: z.literal("fact"),
    scope,
    predicate: id,
    value: z.string().max(6000),
    truth: z.enum(["true", "false", "unknown", "conflict"]),
    unit: z.string().nullable(),
    normalizedUnit: z.string().nullable(),
    measurementBasis: z.string().nullable(),
    assertion: z.enum(["user", "model", "measurement", "calculation"]),
    userAttested: z.boolean(),
    evidence: z.array(ref),
    locations: z.array(
      z.object({
        evidenceId: id,
        page: z.number().int().positive().nullable(),
        locator: z.string(),
      }),
    ),
    recordedAt: z.string().datetime(),
    eventType: z.string().nullable(),
    eventDate: z.string().date().nullable(),
    formulaVersion: z.string().nullable(),
    extractionVersion: z.string().nullable(),
    conflicts: z.array(id),
  })
  .strict();
const policy = z
  .object({
    kind: z.literal("policy"),
    obligationId: id,
    label: z.string(),
    basisDate: z.string().date(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable(),
    basis: z.array(ref).min(1),
    author: id,
    domain: z.string(),
    applicability: ExpressionSchema,
    fulfillment: ExpressionSchema,
    nonfulfillment: ExpressionSchema,
    exceptions: ExpressionSchema,
    deadline: DeadlinePolicy.nullable(),
    immediate: z.boolean(),
    requirements: z.record(
      z.string(),
      z.object({
        label: z.string(),
        acceptedPaths: z.array(evidence.shape.path).min(1),
        alternatives: z.array(z.string()).min(1),
        insufficientAlone: z.array(z.string()),
        role: z.string(),
      }),
    ),
    unresolved: z.array(z.string()),
    sanction: z.enum([
      "direct",
      "discretionary",
      "unknown",
      "not_found_in_scope",
    ]),
  })
  .strict();
const source = z
  .object({
    kind: z.literal("source"),
    title: z.string(),
    url: z.string().url(),
    text: z.string().max(8_000_000),
    version: z.string(),
    textHash: hash,
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable(),
    sourceTag: z.enum([
      "normative",
      "administrative",
      "guide",
      "design",
      "unverified",
    ]),
    complete: z.boolean(),
    decisiveCellsChecked: z.boolean(),
    conflicts: z.array(z.string()),
    extractionVersion: z.string(),
  })
  .strict();
const decision = z
  .object({
    kind: z.literal("decision"),
    scope,
    asOf: z.string().date(),
    policy: ref,
    facts: z.record(z.string(), ref),
    author: id,
  })
  .strict();
const action = z
  .object({
    kind: z.literal("action"),
    decision: ref,
    owner: id,
    state: z.enum([
      "not_started",
      "in_progress",
      "claimed_complete",
      "verified",
      "reopened",
    ]),
    due: z.string().date().nullable(),
    dueKind: z.enum(["internal", "legal"]),
    resources: z.string(),
    temporaryControls: z.string(),
    completionEvidence: z.array(ref),
    historicalDecision: ref,
  })
  .strict();
export const EntityBody = z.discriminatedUnion("kind", [
  evidence,
  fact,
  policy,
  source,
  decision,
  action,
]);
export type Body = z.infer<typeof EntityBody>;
export type Entity = {
  id: string;
  tenant: string;
  synthetic: boolean;
  version: number;
  hash: string;
  body: Body;
  createdBy: string;
  createdAt: string;
};
export type Principal = {
  validFrom?: string;
  expiresAt?: string;
  revoked?: boolean;
  id: string;
  tenant: string;
  synthetic: boolean;
  roles: (
    | "writer"
    | "extraction_reviewer"
    | "rule_reviewer"
    | "case_reviewer"
    | "action_reviewer"
    | "collection_operator"
    | "backup_operator"
    | "egress_reviewer"
  )[];
};
export function assertPrincipal(p: Principal) {
  if (!p.id || !p.tenant || p.revoked ||
    (p.validFrom && (!Number.isFinite(Date.parse(p.validFrom)) || Date.parse(p.validFrom)>Date.now())) ||
    (p.expiresAt && (!Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt)<=Date.now())))
    throw new Error("만료·철회 또는 신원 권한 확인 필요");
}
export const entityRef = (e: Entity): Ref => ({
  id: e.id,
  version: e.version,
  hash: e.hash,
});
const refs = (b: Body): Ref[] =>
  b.kind === "fact"
    ? b.evidence
    : b.kind === "policy"
      ? b.basis
      : b.kind === "decision"
        ? [b.policy, ...Object.values(b.facts)]
        : b.kind === "action"
          ? [b.decision, b.historicalDecision, ...b.completionEvidence]
          : [];
const roleFor = (kind: Body["kind"]) =>
  kind === "source" || kind === "evidence" || kind === "fact"
    ? "extraction_reviewer"
    : kind === "policy"
      ? "rule_reviewer"
      : kind === "decision"
        ? "case_reviewer"
        : "action_reviewer";

/** Additive schema: no conversion of legacy booleans/approvals; instantiated only by v2 tooling. */
export class ComplianceRepository {
  constructor(readonly store: Store) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS v2_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v2_entities(tenant TEXT, id TEXT, version INTEGER, hash TEXT, body TEXT NOT NULL, PRIMARY KEY(tenant,id,version));
      CREATE TABLE IF NOT EXISTS v2_approvals(id TEXT PRIMARY KEY, tenant TEXT, target TEXT, version INTEGER, hash TEXT, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS v2_dependencies(tenant TEXT, target TEXT, version INTEGER, dependency TEXT, dependency_version INTEGER, PRIMARY KEY(tenant,target,version,dependency));
      CREATE TABLE IF NOT EXISTS v2_invalidations(tenant TEXT, target TEXT, version INTEGER, cause TEXT, at TEXT, PRIMARY KEY(tenant,target,version,cause));
      INSERT OR IGNORE INTO v2_migrations VALUES(2,datetime('now'));`);
    store.db.exec(`CREATE TABLE IF NOT EXISTS v3_review_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,target TEXT,version INTEGER,event TEXT,actor TEXT,body TEXT);
      INSERT OR IGNORE INTO v2_migrations VALUES(3,datetime('now'));`);
  }
  putOriginal(p: Principal, bytes: Buffer) {
    assertPrincipal(p);
    if (!p.roles.includes("writer") || bytes.length > 20_000_000)
      throw new Error("원본 저장 권한·크기 확인 필요");
    const directory = join(this.store.dir, "v2-originals", sha(p.tenant));
    mkdirSync(directory, { recursive: true });
    const digest = sha(bytes),
      path = join(directory, digest + ".bin");
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: 0o600 });
    if (sha(readFileSync(path)) !== digest) throw new Error("원본 무결성 오류");
    return { originalRef: digest + ".bin", originalHash: digest };
  }
  original(p: Principal, name: string, digest: string) {
    if (name !== hash.parse(digest) + ".bin") throw new Error("원본 경로 오류");
    const directory = join(this.store.dir, "v2-originals", sha(p.tenant)),
      path = join(directory, name);
    if (
      !realpathSync(path).startsWith(realpathSync(directory) + "\\") &&
      !realpathSync(path).startsWith(realpathSync(directory) + "/")
    )
      throw new Error("원본 경로 이탈");
    const bytes = readFileSync(path);
    if (sha(bytes) !== digest) throw new Error("원본 무결성 오류");
    return bytes;
  }
  get(p: Principal, target: string, version?: number): Entity {
    assertPrincipal(p);
    const row = this.store.db
      .prepare(
        `SELECT body FROM v2_entities WHERE tenant=? AND id=? ${version ? "AND version=?" : ""} ORDER BY version DESC LIMIT 1`,
      )
      .get(...(version ? [p.tenant, target, version] : [p.tenant, target])) as
      { body: string } | undefined;
    if (!row) throw new Error("자료 없음 또는 접근 권한 없음");
    const e = JSON.parse(row.body) as Entity;
    if (e.synthetic !== p.synthetic)
      throw new Error("가상·실제 자료 영역 불일치");
    return e;
  }
  resolve(p: Principal, r: Ref): Entity {
    const e = this.get(p, r.id, r.version);
    if (e.hash !== r.hash || this.get(p, r.id).version !== r.version)
      throw new Error("참조 자료 변경: 재검토 필요");
    return e;
  }
  save(
    p: Principal,
    target: string,
    expectedVersion: number,
    input: unknown,
  ): Entity {
    assertPrincipal(p);
    if (!p.roles.includes("writer")) throw new Error("작성 권한 없음");
    id.parse(target);
    const body = EntityBody.parse(input);
    if (body.kind === "action" && body.state === "verified")
      throw new Error("조치 종료는 별도 검토자 승인 필요");
    const deps = refs(body);
    deps.forEach((r) => this.resolve(p, r));
    if (
      (body.kind === "decision" && body.author !== p.id) ||
      (body.kind === "policy" && body.author !== p.id)
    )
      throw new Error("작성자 불일치");
    this.store.db.exec("SAVEPOINT v2_save");
    try {
      const last = this.store.db
        .prepare(
          "SELECT MAX(version) AS n FROM v2_entities WHERE tenant=? AND id=?",
        )
        .get(p.tenant, target) as { n: number | null };
      if ((last.n ?? 0) !== expectedVersion)
        throw new Error("버전 충돌: 최신 자료를 다시 확인하세요");
      const e: Entity = {
        id: target,
        tenant: p.tenant,
        synthetic: p.synthetic,
        version: expectedVersion + 1,
        hash: sha(JSON.stringify(body)),
        body,
        createdBy: p.id,
        createdAt: new Date().toISOString(),
      };
      this.store.db
        .prepare("INSERT INTO v2_entities VALUES(?,?,?,?,?)")
        .run(e.tenant, e.id, e.version, e.hash, JSON.stringify(e));
      for (const r of deps)
        this.store.db
          .prepare("INSERT OR IGNORE INTO v2_dependencies VALUES(?,?,?,?,?)")
          .run(p.tenant, e.id, e.version, r.id, r.version);
      if (expectedVersion) this.invalidate(p.tenant, target);
      this.store.db.exec("RELEASE v2_save");
      return e;
    } catch (e) {
      this.store.db.exec("ROLLBACK TO v2_save; RELEASE v2_save");
      throw e;
    }
  }
  private invalidate(tenant: string, dependency: string) {
    const pending = [dependency],
      seen = new Set<string>();
    while (pending.length) {
      const current = pending.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const rows = this.store.db
        .prepare(
          "SELECT target,version FROM v2_dependencies WHERE tenant=? AND dependency=?",
        )
        .all(tenant, current) as { target: string; version: number }[];
      for (const r of rows) {
        this.store.db
          .prepare("INSERT OR IGNORE INTO v2_invalidations VALUES(?,?,?,?,?)")
          .run(
            tenant,
            r.target,
            r.version,
            dependency,
            new Date().toISOString(),
          );
        pending.push(r.target);
      }
    }
  }
  flagMergeConflict(p:Principal, ref:Ref) {
    assertPrincipal(p);if(!p.roles.includes("writer"))throw Error("자료 보완 권한 없음");
    this.resolve(p,ref);
    this.store.db.prepare("INSERT OR IGNORE INTO v2_invalidations VALUES(?,?,?,?,?)").run(p.tenant,ref.id,ref.version,"manual-merge-v4",new Date().toISOString());
    this.invalidate(p.tenant,ref.id);
  }
  approved(p: Principal, e: Entity) {
    const event=this.store.db.prepare("SELECT event FROM v3_review_events WHERE tenant=? AND target=? AND version=? ORDER BY seq DESC LIMIT 1").get(p.tenant,e.id,e.version) as {event:string}|undefined;
    if(event && event.event!=="approved") return false;
    if (this.get(p, e.id).version !== e.version) return false;
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM v2_invalidations WHERE tenant=? AND target=? AND version=?",
        )
        .get(p.tenant, e.id, e.version)
    )
      return false;
    return !!this.store.db
      .prepare(
        "SELECT 1 FROM v2_approvals WHERE tenant=? AND target=? AND version=? AND hash=?",
      )
      .get(p.tenant, e.id, e.version, e.hash);
  }
  approve(
    p: Principal, target: string, version: number, digest: string, note: string,
  ) {
    this.store.db.exec("SAVEPOINT approval_v3");
    try {const result=this.approveWithinTransaction(p,target,version,digest,note);this.store.db.exec("RELEASE approval_v3");return result;}
    catch(e){this.store.db.exec("ROLLBACK TO approval_v3; RELEASE approval_v3");throw e;}
  }
  private approveWithinTransaction(
    p: Principal,
    target: string,
    version: number,
    digest: string,
    note: string,
  ) {
    const e = this.resolve(p, { id: target, version, hash: digest });
    if (
      !p.roles.includes(roleFor(e.body.kind)) ||
      e.createdBy === p.id ||
      note.trim().length < 15
    )
      throw new Error("독립 검토 권한·검토 범위 확인 필요");
    if (
      this.store.db
        .prepare(
          "SELECT 1 FROM v2_invalidations WHERE tenant=? AND target=? AND version=?",
        )
        .get(p.tenant, target, version)
    )
      throw new Error("변경 영향이 있는 자료는 새 버전으로 재검토하세요");
    const b = e.body;
    if (b.kind === "source" && sha(b.text) !== b.textHash)
      throw new Error("원문 내용 해시 불일치");
    if (b.kind === "evidence") {
      this.original(p, b.originalRef, b.originalHash);
      if (!b.readable || !b.complete)
        throw new Error("증빙 판독·완전성 확인 필요");
    }
    if (
      b.kind === "policy" &&
      (b.unresolved.length ||
        !b.basis.every((r) => this.approved(p, this.resolve(p, r))))
    )
      throw new Error("미확인 법적 요건 또는 근거 승인 누락");
    if (
      b.kind === "fact" &&
      (!b.evidence.length ||
        !b.evidence.every((r) =>
          this.evidenceSupports(p, this.resolve(p, r), b),
        ))
    )
      throw new Error("사실을 입증하는 동일 대상·기간 증빙 확인 필요");
    if (b.kind === "decision" && this.evaluate(p, e).holds.length)
      throw new Error("판정의 보류 조건 해소 필요");
    if (b.kind === "action") {
      const d = decision.parse(this.resolve(p, b.decision).body);
      if (
        b.state !== "claimed_complete" ||
        p.id === b.owner ||
        !b.completionEvidence.length ||
        !b.completionEvidence.every((r) => {
          const ee = this.resolve(p, r),
            eb = ee.body;
          return (
            eb.kind === "evidence" &&
            this.approved(p, ee) &&
            eb.scope.site === d.scope.site &&
            eb.scope.subject === d.scope.subject &&
            eb.scope.place === d.scope.place &&
            eb.claims["action_effect:" + e.id] === "confirmed"
          );
        })
      )
        throw new Error("조치 완료 주장·효과 증빙·독립 확인 필요");
    }
    const approval = {
      id: randomUUID(),
      target: entityRef(e),
      actor: p.id,
      role: roleFor(b.kind),
      note,
      synthetic: p.synthetic,
      at: new Date().toISOString(),
    };
    this.store.db
      .prepare("INSERT INTO v2_approvals VALUES(?,?,?,?,?,?)")
      .run(
        approval.id,
        p.tenant,
        e.id,
        e.version,
        e.hash,
        JSON.stringify(approval),
      );
    this.store.db.prepare("INSERT INTO v3_review_events(tenant,target,version,event,actor,body) VALUES(?,?,?,?,?,?)")
      .run(p.tenant,e.id,e.version,"approved",p.id,JSON.stringify(approval));
    return approval;
  }
  reviewEvent(p: Principal, target: Ref, event: "pending"|"rejected"|"changes_requested"|"revoked", note: string) {
    const e=this.resolve(p,target);
    if(!p.roles.includes(roleFor(e.body.kind)) || p.id===e.createdBy || note.trim().length<15) throw new Error("독립 검토 권한·사유 확인 필요");
    const body={target,event,note,actor:p.id,at:new Date().toISOString(),synthetic:p.synthetic};
    this.store.db.prepare("INSERT INTO v3_review_events(tenant,target,version,event,actor,body) VALUES(?,?,?,?,?,?)")
      .run(p.tenant,e.id,e.version,event,p.id,JSON.stringify(body));
    this.invalidate(p.tenant,e.id);
    return body;
  }
  backup(p: Principal) {
    assertPrincipal(p);
    const entities = (
      this.store.db
        .prepare(
          "SELECT body FROM v2_entities WHERE tenant=? ORDER BY id,version",
        )
        .all(p.tenant) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Entity).filter(e=>e.synthetic===p.synthetic);
    const originals: Record<string, string> = {};
    for (const e of entities)
      if (e.body.kind === "evidence")
        originals[e.body.originalHash] = this.original(
          p,
          e.body.originalRef,
          e.body.originalHash,
        ).toString("base64");
    const approvals = (
      this.store.db
        .prepare("SELECT body FROM v2_approvals WHERE tenant=?")
        .all(p.tenant) as { body: string }[]
    ).map((r) => JSON.parse(r.body)).filter(a=>a.synthetic===p.synthetic);
    return {
      schemaVersion: 2,
      tenant: p.tenant,
      synthetic: p.synthetic,
      encrypted: false,
      entities,
      approvals,
      originals,
      createdAt: new Date().toISOString(),
    };
  }
  restore(p: Principal, input: unknown) {
    assertPrincipal(p);
    if (!p.roles.includes("writer")) throw new Error("복원 권한 없음");
    const entitySchema = z
      .object({
        id,
        tenant: z.string(),
        synthetic: z.boolean(),
        version: z.number().int().positive(),
        hash,
        body: EntityBody,
        createdBy: id,
        createdAt: z.string().datetime(),
      })
      .strict();
    const approvalSchema = z
      .object({
        id: z.string().uuid(),
        target: ref,
        actor: id,
        role: z.string(),
        note: z.string(),
        synthetic: z.boolean(),
        at: z.string().datetime(),
      })
      .strict();
    const b = z
      .object({
        schemaVersion: z.literal(2),
        tenant: z.string(),
        synthetic: z.boolean(),
        encrypted: z.literal(false),
        entities: z.array(entitySchema).max(10000),
        approvals: z.array(approvalSchema).max(10000),
        originals: z.record(hash, z.string().max(28_000_000)),
        createdAt: z.string().datetime(),
      })
      .strict()
      .parse(input);
    if (
      b.tenant !== p.tenant ||
      b.synthetic !== p.synthetic ||
      this.store.db
        .prepare("SELECT 1 FROM v2_entities WHERE tenant=?")
        .get(p.tenant)
    )
      throw new Error(
        "복원 대상 영역은 비어 있고 동일 사업장·가상 구분이어야 합니다",
      );
    for (const [digest, data] of Object.entries(b.originals))
      if (sha(Buffer.from(data, "base64")) !== digest)
        throw new Error("백업 원본 무결성 오류");
    const lookup = new Map(b.entities.map((e) => [e.id + "@" + e.version, e]));
    if (lookup.size !== b.entities.length) throw new Error("중복 버전 오류");
    for (const e of b.entities) {
      if (
        e.tenant !== p.tenant ||
        e.synthetic !== p.synthetic ||
        sha(JSON.stringify(e.body)) !== e.hash
      )
        throw new Error("백업 대상·본문 무결성 오류");
      for (const r of refs(e.body))
        if (lookup.get(r.id + "@" + r.version)?.hash !== r.hash)
          throw new Error("백업 참조 누락");
      if (
        e.body.kind === "evidence" &&
        (!b.originals[e.body.originalHash] ||
          e.body.originalRef !== e.body.originalHash + ".bin")
      )
        throw new Error("백업 증빙 원본 누락");
    }
    for (const a of b.approvals)
      if (
        lookup.get(a.target.id + "@" + a.target.version)?.hash !==
          a.target.hash ||
        a.synthetic !== p.synthetic
      )
        throw new Error("승인 이력 참조 오류");
    this.store.db.exec("SAVEPOINT restore_v2");
    try {
      for (const data of Object.values(b.originals))
        this.putOriginal(p, Buffer.from(data, "base64"));
      for (const e of b.entities) {
        this.store.db
          .prepare("INSERT INTO v2_entities VALUES(?,?,?,?,?)")
          .run(e.tenant, e.id, e.version, e.hash, JSON.stringify(e));
        for (const r of refs(e.body))
          this.store.db
            .prepare("INSERT OR IGNORE INTO v2_dependencies VALUES(?,?,?,?,?)")
            .run(p.tenant, e.id, e.version, r.id, r.version);
        this.store.db
          .prepare("INSERT INTO v2_invalidations VALUES(?,?,?,?,?)")
          .run(
            p.tenant,
            e.id,
            e.version,
            "복원 후 최신성·적용 범위 재확인",
            new Date().toISOString(),
          );
      }
      for (const a of b.approvals)
        this.store.db
          .prepare("INSERT INTO v2_approvals VALUES(?,?,?,?,?,?)")
          .run(
            a.id,
            p.tenant,
            a.target.id,
            a.target.version,
            a.target.hash,
            JSON.stringify(a),
          );
      this.store.db.exec("RELEASE restore_v2");
    } catch (e) {
      this.store.db.exec("ROLLBACK TO restore_v2; RELEASE restore_v2");
      throw e;
    }
    return {
      restored: b.entities.length,
      originals: Object.keys(b.originals).length,
      currentApproval: false,
    };
  }
  private evidenceSupports(p: Principal, e: Entity, f: z.infer<typeof fact>) {
    const b = e.body;
    return (
      b.kind === "evidence" &&
      this.approved(p, e) &&
      b.readable &&
      b.complete &&
      b.scope.site === f.scope.site &&
      b.scope.subject === f.scope.subject &&
      b.scope.place === f.scope.place &&
      b.validFrom <= f.scope.periodFrom &&
      (!b.validTo || b.validTo >= f.scope.periodTo) &&
      b.scope.periodFrom <= f.scope.periodFrom &&
      b.scope.periodTo >= f.scope.periodTo &&
      b.claims[f.predicate] === f.value
    );
  }
  evaluate(p: Principal, e: Entity) {
    const d = decision.parse(e.body),
      pol = this.get(p, d.policy.id, d.policy.version),
      rule = policy.parse(pol.body);
    const values: Record<string, Truth> = {},
      holds: {
        code: string;
        missing: string;
        alternatives: string[];
        role: string;
      }[] = [];
    const hold = (
      code: string,
      missing: string,
      alternatives = ["해당 범위의 원문·증빙과 검토 기록 확인"],
      role = "case_reviewer",
    ) => holds.push({ code, missing, alternatives, role });
    if (
      pol.hash !== d.policy.hash ||
      this.get(p, pol.id).version !== pol.version
    )
      hold("POLICY_CHANGED", "규칙 버전 변경: 해당 판단 재검토 필요");
    const facts = new Map<string, z.infer<typeof fact>>();
    for (const [key, requirement] of Object.entries(rule.requirements)) {
      values[key] = "unknown";
      const r = d.facts[key];
      if (!r) continue;
      try {
        const entity = this.resolve(p, r),
          f = fact.parse(entity.body);
        facts.set(key, f);
        if (
          f.scope.site !== d.scope.site ||
          f.scope.subject !== d.scope.subject ||
          f.scope.place !== d.scope.place ||
          f.scope.periodFrom > d.scope.periodFrom ||
          f.scope.periodTo < d.scope.periodTo
        )
          continue;
        if (f.conflicts.length || f.truth === "conflict") {
          values[key] = "conflict";
          continue;
        }
        if (!this.approved(p, entity)) continue;
        const permitted = f.evidence.some((er) => {
          const ee = this.resolve(p, er);
          return (
            ee.body.kind === "evidence" &&
            requirement.acceptedPaths.includes(ee.body.path) &&
            this.evidenceSupports(p, ee, f)
          );
        });
        if (permitted) values[key] = f.truth;
      } catch {
        values[key] = "unknown";
      }
    }
    const applicability = truthOf(rule.applicability, values),
      fulfillment = truthOf(rule.fulfillment, values),
      nonfulfillment = truthOf(rule.nonfulfillment, values),
      exception = truthOf(rule.exceptions, values);
    if (!this.approved(p, pol) || rule.unresolved.length)
      hold("RULE_UNAPPROVED", "규칙 승인 또는 미확인 법적 요건");
    if (d.scope.periodFrom > d.asOf || d.scope.periodTo < d.asOf)
      hold("SCOPE_DATE", "검토 기간과 기준일 일치 확인");
    if (
      rule.effectiveFrom > d.asOf ||
      (rule.effectiveTo && rule.effectiveTo < d.asOf)
    )
      hold("RULE_DATE", "기준일 규칙 효력 확인");
    for (const r of rule.basis) {
      try {
        const s = this.resolve(p, r),
          b = source.parse(s.body);
        if (
          !this.approved(p, s) ||
          b.sourceTag !== "normative" ||
          !b.complete ||
          !b.decisiveCellsChecked ||
          b.conflicts.length ||
          b.effectiveFrom > d.asOf ||
          (b.effectiveTo && b.effectiveTo < d.asOf)
        )
          hold("BASIS_INCOMPLETE", b.title);
      } catch {
        hold("BASIS_CHANGED", "법령·추출 버전 변경 또는 원문 미확보");
      }
    }
    const anchor = rule.deadline
      ? facts.get(rule.deadline.anchorEvent)
      : undefined;
    const deadline = rule.immediate
      ? { state: "due" as const, due: d.asOf, reason: "검토된 즉시 의무" }
      : rule.deadline
        ? calculateDeadline(
            rule.deadline,
            anchor &&
              values[rule.deadline.anchorEvent] === "true" &&
              anchor.eventType &&
              anchor.eventDate
              ? { type: anchor.eventType, date: anchor.eventDate }
              : undefined,
            d.asOf,
          )
        : {
            state: "unknown" as const,
            due: null,
            reason: "기한 근거 확인 필요",
          };
    let outcome: "risk_candidate" | "fulfilled" | "out_of_scope" | "pending" =
      "pending";
    if (applicability === "false") outcome = "out_of_scope";
    else if (applicability === "true" && exception === "false") {
      if (fulfillment === "true" && nonfulfillment === "false")
        outcome = "fulfilled";
      else if (
        nonfulfillment === "true" &&
        fulfillment === "false" &&
        (deadline.state === "elapsed" || rule.immediate)
      )
        outcome = "risk_candidate";
    }
    if (outcome === "pending") {
      for (const [key, state] of Object.entries(values))
        if (state === "unknown" || state === "conflict") {
          const r = rule.requirements[key];
          hold(
            state === "conflict" ? "FACT_CONFLICT" : "FACT_MISSING",
            r.label,
            r.alternatives,
            r.role,
          );
        }
      if (deadline.state === "unknown")
        hold("DEADLINE_UNKNOWN", deadline.reason);
      if (!holds.length)
        hold("DECISION_REVIEW", "예외·이행 상충 또는 기한 진행 여부 검토");
    }
    const approved = this.approved(p, e);
    const category = holds.length
      ? "more_data"
      : !approved
        ? "human_review"
        : outcome === "risk_candidate"
          ? "clear_risk"
          : "human_review";
    return {
      synthetic: e.synthetic,
      scope: d.scope,
      applicability,
      fulfillment,
      nonfulfillment,
      exception,
      deadline,
      sanction: rule.sanction,
      outcome: holds.length ? "pending" : outcome,
      category,
      approval: approved ? "approved" : "pending",
      holds,
      labels: {
        clear_risk: "명확한 법률 리스크",
        human_review: "사람의 판단 필요",
        more_data: "추가 자료 필요",
      },
      trace: {
        policy: entityRef(pol),
        facts: d.facts,
        values,
        basis: rule.basis,
      },
    };
  }
}

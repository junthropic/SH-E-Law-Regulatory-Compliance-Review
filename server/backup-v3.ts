import { backup as sqliteBackup } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  unlinkSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { z } from "zod";
import { Store, sha } from "./store.js";
import {
  ComplianceRepository,
  assertPrincipal,
  type Principal,
} from "./compliance-v2.js";
import { DurableJobs } from "./jobs-v3.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import { EgressGate } from "./egress-v3.js";
import { SourceLifecycle } from "./source-lifecycle-v3.js";
import { restoreBackup } from "./backup.js";
const MAX = 64 * 1024 * 1024;
const extraTables = [
  "v2_invalidations",
  "v3_review_events",
  "v3_legacy_links",
  "v3_shadow",
  "v3_jobs",
  "v3_job_units",
  "v3_job_events",
  "v3_quota",
  "v3_egress",
  "v3_derivations",
  "v3_source_events",
] as const;
const Envelope = z
  .object({
    format: z.literal("she-backup-v3"),
    version: z.literal(3),
    encrypted: z.literal(true),
    algorithm: z.literal("aes-256-gcm"),
    keyId: z.string().regex(/^[\w.-]{1,100}$/),
    tenant: z.string(),
    synthetic: z.boolean(),
    createdAt: z.string().datetime(),
    nonce: z.string(),
    tag: z.string(),
    ciphertext: z.string().max(90_000_000),
  })
  .strict();
type Envelope = z.infer<typeof Envelope>;
const aad = (
  b: Pick<
    Envelope,
    | "format"
    | "version"
    | "encrypted"
    | "algorithm"
    | "keyId"
    | "tenant"
    | "synthetic"
    | "createdAt"
  >,
) =>
  Buffer.from(
    JSON.stringify({
      format: b.format,
      version: b.version,
      encrypted: b.encrypted,
      algorithm: b.algorithm,
      keyId: b.keyId,
      tenant: b.tenant,
      synthetic: b.synthetic,
      createdAt: b.createdAt,
    }),
  );
function access(p: Principal) {
  assertPrincipal(p);
  if (!p.roles.includes("backup_operator"))
    throw new Error("백업·복원 권한 필요");
}
function safeDelete(directory: string, root: string) {
  const r = relative(resolve(root), resolve(directory));
  if (!r || r.startsWith("..") || resolve(directory) === resolve(root))
    throw new Error("정리 경로 이탈");
  rmSync(directory, { recursive: true, force: true });
}
function init(store: Store) {
  new ComplianceRepository(store);
  new DurableJobs(store);
  new LegacyBridge(store);
  new EgressGate(store);
  new SourceLifecycle(store);
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS v3_restore_runs(id TEXT PRIMARY KEY,body TEXT)",
  );
}
export async function encryptedBackup(
  store: Store,
  p: Principal,
  key: Buffer,
  keyId: string,
) {
  access(p);
  if (key.length !== 32 || !/^[-\w.]{1,100}$/.test(keyId))
    throw new Error("별도 암호키·키 식별자 확인 필요");
  init(store);
  const root = join(store.dir, "v3-snapshots");
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, "snapshot-"));
  let snap: Store | undefined;
  try {
    await sqliteBackup(store.db, join(dir, "private.sqlite"));
    snap = new Store(dir);
    snap.dir = store.dir;
    const compliance = new ComplianceRepository(snap).backup(p);
    if (compliance.entities.some((e) => e.synthetic !== p.synthetic))
      throw new Error("백업 가상 영역 불일치");
    const extra: Record<string, Record<string, any>[]> = Object.fromEntries(
      extraTables.map((t) => [t, []]),
    );
    const entityIds = new Set(compliance.entities.map((e) => e.id));
    for (const t of extraTables) {
      if (["v3_job_units", "v3_job_events", "v3_quota"].includes(t)) continue;
      extra[t] = snap.db
        .prepare(`SELECT * FROM ${t} WHERE tenant=?`)
        .all(p.tenant) as Record<string, any>[];
      if (
        ["v3_jobs", "v3_egress", "v3_derivations", "v3_source_events"].includes(
          t,
        )
      )
        extra[t] = extra[t].filter((r) => !!r.synthetic === p.synthetic);
      if (t === "v3_shadow")
        extra[t] = extra[t].filter(
          (r) => JSON.parse(r.body).synthetic === p.synthetic,
        );
      if (["v3_review_events", "v2_invalidations"].includes(t))
        extra[t] = extra[t].filter((r) => entityIds.has(r.target));
      if (t === "v3_legacy_links")
        extra[t] = extra[t].filter((r) =>
          entityIds.has(JSON.parse(r.body).v2.id),
        );
    }
    const jobIds = new Set(extra.v3_jobs.map((r) => r.id));
    extra.v3_job_units = (
      snap.db.prepare("SELECT * FROM v3_job_units").all() as Record<
        string,
        any
      >[]
    ).filter((r) => jobIds.has(r.job));
    extra.v3_job_events = (
      snap.db.prepare("SELECT * FROM v3_job_events").all() as Record<
        string,
        any
      >[]
    ).filter((r) => jobIds.has(r.job));
    const quotas = new Set(
      extra.v3_jobs.map((r) => {
        const j = JSON.parse(r.body);
        return sha(j.input.provider + ":" + j.input.credentialRef);
      }),
    );
    extra.v3_quota = (
      snap.db.prepare("SELECT * FROM v3_quota").all() as Record<string, any>[]
    )
      .filter((r) => quotas.has(r.id))
      .map((r) => ({
        ...r,
        body: JSON.stringify({
          ...JSON.parse(r.body),
          owner: null,
          leaseUntil: 0,
        }),
      }));
    const reviewIds = new Set(extra.v3_shadow.map((r) => r.review));
    const reviews = snap.all<any>("reviews").filter((r) => reviewIds.has(r.id));
    const documentIds = new Set(reviews.flatMap((r) => r.request.documentIds));
    const documents = snap
      .all<any>("documents")
      .filter((d) => documentIds.has(d.id))
      .map((d) => {
        if (
          !/^[a-f0-9-]+$/.test(d.id) ||
          !/^\.(txt|pdf|hwp|hwpx|docx)$/.test(d.type)
        )
          throw new Error("원본 경로 확인 필요");
        const original = store.readOriginal(d.id + d.type);
        if (sha(original) !== d.hash) throw new Error("원본 무결성 오류");
        return { ...d, original: original.toString("base64") };
      });
    const evidenceIds = new Set(
      reviews.flatMap((r) => r.evidence.map((e: any) => e.id)),
    );
    const legacy = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      reviews,
      documents,
      evidence: snap.all<any>("evidence").filter((e) => evidenceIds.has(e.id)),
      sources: [],
      rules: [],
    };
    const annexes: Record<string, string> = {},
      missingOriginals: string[] = [];
    for (const e of [...legacy.evidence, ...reviews.flatMap((r) => r.evidence)])
      for (const a of e.attachments || []) {
        if (!a.originalRef) continue;
        if (
          !/^[a-f0-9]{64}\.bin$/.test(a.originalRef) ||
          a.originalRef !== a.originalHash + ".bin"
        )
          throw new Error("별표 원본 참조 오류");
        const path = join(store.dir, "legal-attachments", a.originalRef);
        if (!existsSync(path)) {
          missingOriginals.push(a.originalRef);
          continue;
        }
        const bytes = readFileSync(path);
        if (sha(bytes) !== a.originalHash)
          throw new Error("별표 원본 무결성 오류");
        annexes[a.originalRef] = bytes.toString("base64");
      }
    const payload = Buffer.from(
      JSON.stringify({
        schemaVersion: 3,
        tenant: p.tenant,
        synthetic: p.synthetic,
        compliance,
        extra,
        legacy,
        annexes,
        missingOriginals: [...new Set(missingOriginals)],
        excluded: [
          "API 키·OAuth·암호키",
          "연결되지 않은 legacy 자료·raw API 임시 응답",
          "계정 전체 호출 한도와 타 영역의 관리 해제 이력",
        ],
      }),
    );
    if (payload.length > MAX) throw new Error("백업 전체 크기 한도 초과");
    const header = {
      format: "she-backup-v3" as const,
      version: 3 as const,
      encrypted: true as const,
      algorithm: "aes-256-gcm" as const,
      keyId,
      tenant: p.tenant,
      synthetic: p.synthetic,
      createdAt: new Date().toISOString(),
    };
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(header));
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    return {
      ...header,
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };
  } finally {
    snap?.close();
    safeDelete(dir, root);
  }
}
export function decodeBackup(input: unknown, p: Principal, key: Buffer) {
  access(p);
  const b = Envelope.parse(input);
  if (b.tenant !== p.tenant || b.synthetic !== p.synthetic || key.length !== 32)
    throw new Error("복원 대상·키 권한 불일치");
  const nonce = Buffer.from(b.nonce, "base64"),
    tag = Buffer.from(b.tag, "base64"),
    bytes = Buffer.from(b.ciphertext, "base64");
  if (nonce.length !== 12 || tag.length !== 16 || bytes.length > MAX)
    throw new Error("백업 형식·크기 한도");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad(b));
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(bytes), decipher.final()]).toString(
        "utf8",
      ),
    );
  } catch {
    throw new Error("백업 인증 실패: 키·변조 여부 확인 필요");
  }
}
export function restoreEncrypted(
  store: Store,
  p: Principal,
  input: unknown,
  key: Buffer,
  fault?: (phase: string) => void,
) {
  access(p);
  const b = decodeBackup(input, p, key);
  init(store);
  if (
    b.schemaVersion !== 3 ||
    b.tenant !== p.tenant ||
    b.synthetic !== p.synthetic ||
    !Array.isArray(b.compliance?.entities) ||
    b.compliance.entities.length > 10000 ||
    Object.keys(b.compliance.originals || {}).length > 512
  )
    throw new Error("백업 객체 범위·크기 확인 필요");
  if (
    store.all("reviews").length ||
    store.all("documents").length ||
    (store.db.prepare("SELECT count(*) n FROM v2_entities").get() as any).n
  )
    throw new Error("빈 격리 저장소에서만 복원 가능");
  for (const [table, rows] of Object.entries(b.extra || {})) {
    if (
      !extraTables.includes(table as any) ||
      !Array.isArray(rows) ||
      rows.length > 10000
    )
      throw new Error("백업 테이블 형식 오류");
    for (const row of rows as any[]) {
      if (row.tenant !== undefined && row.tenant !== p.tenant)
        throw new Error("백업 자료 영역 불일치");
      if (row.synthetic !== undefined && !!row.synthetic !== p.synthetic)
        throw new Error("백업 가상 영역 불일치");
    }
  }
  const entities = new Map(
    b.compliance.entities.map((e: any) => [`${e.id}@${e.version}`, e.hash]),
  );
  const reference = (r: any) => {
    if (!r || entities.get(`${r.id}@${r.version}`) !== r.hash)
      throw new Error("복원 연결 참조 누락");
  };
  for (const row of b.extra.v3_legacy_links || [])
    reference(JSON.parse(row.body).v2);
  const reviewIds = new Set(b.legacy.reviews.map((r: any) => r.id));
  for (const row of b.extra.v3_shadow || []) {
    const t = JSON.parse(row.body);
    if (
      t.tenant !== p.tenant ||
      t.synthetic !== p.synthetic ||
      !reviewIds.has(t.reviewId)
    )
      throw new Error("평가 이력 영역·검토 연결 오류");
    for (const item of t.rows) reference(item.decision);
  }
  const jobIds = new Set((b.extra.v3_jobs || []).map((r: any) => r.id));
  for (const row of [
    ...(b.extra.v3_job_units || []),
    ...(b.extra.v3_job_events || []),
  ])
    if (!jobIds.has(row.job)) throw new Error("작업 이력 참조 누락");
  if (Object.keys(b.annexes || {}).length > 512)
    throw new Error("첨부 개수 한도");
  for (const [name, data] of Object.entries(b.annexes || {})) {
    if (
      !/^[a-f0-9]{64}\.bin$/.test(name) ||
      typeof data !== "string" ||
      sha(Buffer.from(data, "base64")) + ".bin" !== name
    )
      throw new Error("첨부 무결성 오류");
  }
  const root = join(store.dir, "v3-restore");
  mkdirSync(root, { recursive: true });
  const id = randomUUID(),
    stage = join(root, id);
  mkdirSync(stage);
  const originalDir = store.dir,
    created: string[] = [];
  const journal = () =>
    writeFileSync(
      join(stage, "journal.json"),
      JSON.stringify({ id, created }),
      { mode: 0o600 },
    );
  journal();
  let committed = false;
  store.db.exec("BEGIN IMMEDIATE");
  try {
    store.dir = stage;
    new ComplianceRepository(store).restore(
      { ...p, roles: [...p.roles, "writer"] },
      b.compliance,
    );
    fault?.("v2_imported");
    mkdirSync(join(stage, "originals"), { recursive: true });
    restoreBackup(store, b.legacy);
    fault?.("legacy_imported");
    mkdirSync(join(stage, "legal-attachments"), { recursive: true });
    for (const [name, data] of Object.entries(b.annexes || {}))
      writeFileSync(
        join(stage, "legal-attachments", name),
        Buffer.from(data as string, "base64"),
        { mode: 0o600 },
      );
    const restoreAnnexes = (e: any) => ({
      ...e,
      verified: false,
      annexesComplete: false,
      attachments: e.attachments?.map((a: any) =>
        b.annexes?.[a.originalRef]
          ? { ...a, note: "원본 복원됨: 적용 범위·판독 재확인 필요" }
          : {
              ...a,
              state: "missing",
              originalRef: undefined,
              note: "백업 원본 미확보: 재수집 필요",
            },
      ),
    });
    for (const e of b.legacy.evidence)
      store.saveEvidence(restoreAnnexes(e), false);
    for (const original of b.legacy.reviews) {
      const r = store.review(original.id)!;
      store.saveReview({
        ...r,
        evidence: original.evidence.map(restoreAnnexes),
        issues: r.issues.map((i) => ({
          ...i,
          category: i.category === "clear_risk" ? "more_data" : i.category,
          conditions: [
            ...i.conditions,
            "백업 복원 후 현재 적용 범위·승인 재확인 필요",
          ],
        })),
      });
    }
    for (const table of extraTables) {
      const columns = (
        store.db.prepare(`PRAGMA table_info(${table})`).all() as any[]
      )
        .map((x) => x.name)
        .filter((x) => x !== "seq");
      for (const original of b.extra[table] || []) {
        const row = { ...original };
        delete row.seq;
        if (Object.keys(row).some((k) => !columns.includes(k)))
          throw new Error("백업 열 형식 오류");
        if (table === "v3_jobs") {
          const j = JSON.parse(row.body);
          if (j.tenant !== p.tenant || j.synthetic !== p.synthetic)
            throw new Error("작업 영역 불일치");
          j.state = "paused";
          j.fence++;
          j.owner = null;
          j.leaseUntil = 0;
          j.eligible = null;
          row.state = j.state;
          row.fence = j.fence;
          row.lease_until = 0;
          row.eligible = null;
          row.body = JSON.stringify(j);
        }
        if (table === "v3_egress")
          row.body = JSON.stringify({
            ...JSON.parse(row.body),
            allowed: false,
            restored: true,
          });
        store.db
          .prepare(
            `INSERT OR IGNORE INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((k) => row[k] ?? null));
      }
    }
    const publish = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) publish(path);
        else {
          const rel = relative(stage, path),
            dest = join(originalDir, rel);
          if (rel.startsWith("..")) throw new Error("복원 경로 이탈");
          mkdirSync(dirname(dest), { recursive: true });
          if (existsSync(dest)) {
            if (sha(readFileSync(dest)) !== sha(readFileSync(path)))
              throw new Error("기존 원본 충돌");
            continue;
          }
          created.push(dest);
          journal();
          fault?.("before_publish");
          renameSync(path, dest);
        }
      }
    };
    publish(join(stage, "v2-originals"));
    publish(join(stage, "originals"));
    publish(join(stage, "legal-attachments"));
    fault?.("after_publish");
    store.put("v3_restore_runs", id, {
      id,
      state: "published",
      at: new Date().toISOString(),
      currentApproval: false,
    });
    store.db.exec("COMMIT");
    committed = true;
    store.dir = originalDir;
    safeDelete(stage, root);
    return {
      restoreId: id,
      state: "published",
      currentApproval: false,
      encrypted: true,
    };
  } catch (e) {
    store.dir = originalDir;
    if (!committed) {
      store.db.exec("ROLLBACK");
      for (const file of created) {
        if (existsSync(file)) unlinkSync(file);
      }
      safeDelete(stage, root);
    }
    throw e;
  } finally {
    store.dir = originalDir;
  }
}
export function recoverRestores(store: Store) {
  init(store);
  const root = join(store.dir, "v3-restore");
  if (!existsSync(root)) return [];
  const recovered: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[-a-f0-9]{36}$/.test(entry.name)) continue;
    const dir = join(root, entry.name),
      file = join(dir, "journal.json");
    if (!existsSync(file)) continue;
    const j = JSON.parse(readFileSync(file, "utf8"));
    if (j.id !== entry.name) throw new Error("복구 일지 불일치");
    if (!store.get("v3_restore_runs", j.id))
      for (const target of j.created) {
        const rel = relative(resolve(store.dir), resolve(target));
        if (
          rel.startsWith("..") ||
          !/^(v2-originals|originals|legal-attachments)[\\/]/.test(rel)
        )
          throw new Error("복구 정리 경로 이탈");
        const base = target.split(/[\\/]/).at(-1)!;
        const used =
          (
            store.db.prepare("SELECT body FROM v2_entities").all() as any[]
          ).some((r) => JSON.parse(r.body).body.originalRef === base) ||
          store.all<any>("documents").some((d) => d.id + d.type === base);
        const annexUsed = [
          ...store.all<any>("evidence"),
          ...store.all<any>("reviews").flatMap((r) => r.evidence),
        ].some((e) => e.attachments?.some((a: any) => a.originalRef === base));
        if (!used && !annexUsed && existsSync(target)) unlinkSync(target);
      }
    safeDelete(dir, root);
    recovered.push(j.id);
  }
  return recovered;
}

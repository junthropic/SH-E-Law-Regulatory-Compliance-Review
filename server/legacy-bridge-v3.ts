import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Store, sha } from "./store.js";
import {
  ComplianceRepository,
  entityRef,
  assertPrincipal,
  type Body,
  type Principal,
  type Entity,
} from "./compliance-v2.js";
import type {
  ReviewResult,
  LegalIssue,
  DocumentRecord,
} from "../shared/types.js";
import { candidatePolicy, selectedPolicies } from "./policies-v3.js";
import { convertPeriod } from "./periods-v3.js";
import { selectPolicies, v4Candidate, nextPolicies } from "./policies-v4.js";
import {selectTraining,trainingCandidate,trainingPolicies,type TrainingId} from "./training-v6.js";
import {selectSafetyManager,safetyManagerCandidate,safetyManagerPolicies,type SafetyManagerId} from "./safety-manager-v7.js";
export class LegacyBridge {
  readonly repo: ComplianceRepository;
  constructor(readonly store: Store, readonly version: "v3" | "v4" | "v6" | "v7" = "v3") {
    this.repo = new ComplianceRepository(store);
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS v3_legacy_links(tenant TEXT,legacy TEXT,kind TEXT,body TEXT,PRIMARY KEY(tenant,legacy,kind));
      CREATE TABLE IF NOT EXISTS v3_shadow(tenant TEXT,review TEXT,body TEXT,PRIMARY KEY(tenant,review));`);
    if(version!=="v3")store.db.exec(`CREATE TABLE IF NOT EXISTS v4_trace_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,review TEXT,body TEXT);
      CREATE TABLE IF NOT EXISTS v4_merge_conflicts(seq INTEGER PRIMARY KEY AUTOINCREMENT,tenant TEXT,synthetic INTEGER,target TEXT,body TEXT);`);
  }
  private map(
    p: Principal,
    legacy: string,
    kind: string,
    original: unknown,
    body: Body,
    metadata: unknown = {},
  ) {
    const target =
      "legacy-" + sha(p.tenant + ":" + kind + ":" + legacy).slice(0, 48);
    const old = this.store.db
      .prepare(
        "SELECT body FROM v3_legacy_links WHERE tenant=? AND legacy=? AND kind=?",
      )
      .get(p.tenant, legacy, kind) as { body: string } | undefined;
    const prior = old ? JSON.parse(old.body) : null,
      legacyHash = sha(JSON.stringify(original));
    let entity: Entity | undefined;
    try {
      entity = this.repo.get(p, target);
    } catch {}
    if (this.version!=="v3" && entity && prior?.v2 && (entity.version!==prior.v2.version || entity.hash!==prior.v2.hash)) {
      if(prior.legacyHash!==legacyHash)this.repo.flagMergeConflict(p,entityRef(entity));
      if(prior.legacyHash!==legacyHash)this.store.db.prepare("INSERT INTO v4_merge_conflicts(tenant,synthetic,target,body) VALUES(?,?,?,?)").run(p.tenant,+p.synthetic,target,JSON.stringify({expected:prior.v2,actual:entityRef(entity),incomingHash:legacyHash,reason:"사람이 수정한 자료는 자동 변환으로 덮어쓰지 않음",resolution:"pending"}));
      return entity;
    }
    if (
      !entity ||
      prior?.legacyHash !== legacyHash ||
      entity.hash !== sha(JSON.stringify(body))
    )
      entity = this.repo.save(p, target, entity?.version || 0, body);
    const link = {
      legacyId: legacy,
      legacyHash,
      legacy: original,
      v2: entityRef(entity),
      adapter: "legacy-v3.1",
      metadata,
      approvalMigrated: false,
    };
    this.store.db
      .prepare(
        "INSERT INTO v3_legacy_links VALUES(?,?,?,?) ON CONFLICT(tenant,legacy,kind) DO UPDATE SET body=excluded.body",
      )
      .run(p.tenant, legacy, kind, JSON.stringify(link));
    return entity;
  }
  attach(p: Principal, r: ReviewResult, mode: "shadow" | "project" = "shadow") {
    const scope = {
      site: "review-" + r.id,
      subject: "unidentified",
      place: "unidentified",
      periodFrom: r.request.asOf,
      periodTo: r.request.asOf,
    };
    const sources = r.evidence.map((e) =>
      this.map(
        p,
        e.id,
        "source",
        e,
        {
          kind: "source",
          title: e.title,
          url: e.url,
          text: e.text,
          version: e.version,
          textHash: sha(e.text),
          effectiveFrom: e.effectiveFrom,
          effectiveTo: e.effectiveTo || null,
          sourceTag: ["law", "ordinance", "gazette"].includes(e.kind)
            ? "normative"
            : "administrative",
          complete: e.complete,
          decisiveCellsChecked: false,
          conflicts: e.sourceConflicts || [],
          extractionVersion: "legacy-unapproved",
        },
        { legacyVerified: e.verified, remaining: "원문·별표의 새 검토 필요" },
      ),
    );
    if (!sources.length)
      sources.push(
        this.map(
          p,
          r.id,
          "missing_source",
          { missing: true },
          {
            kind: "source",
            title: "관련 원문 미확보",
            url: "https://example.invalid/missing",
            text: "",
            textHash: sha(""),
            version: "missing",
            effectiveFrom: r.request.asOf,
            effectiveTo: null,
            sourceTag: "unverified",
            complete: false,
            decisiveCellsChecked: false,
            conflicts: [],
            extractionVersion: "not_collected",
          },
        ),
      );
    const docs = new Map<string, Entity>();
    for (const id of r.request.documentIds) {
      const d = this.store.document(id);
      if (!d) continue;
      const bytes = this.store.readOriginal(d.id + d.type);
      if (sha(bytes) !== d.hash) throw new Error("연결 원본 해시 불일치");
      const original = this.repo.putOriginal(p, bytes);
      const e = this.map(
        p,
        r.id + ":" + id,
        "evidence",
        d,
        {
          kind: "evidence",
          scope,
          ...original,
          path: "document",
          issuedAt: null,
          receivedAt: null,
          validFrom: r.request.asOf,
          validTo: r.request.asOf,
          collectedAt: d.createdAt,
          claims: {},
          limitations: ["실제 대상·효력기간·입증 사실 미확인: 평가 창만 연결"],
          readable: !!d.text.trim(),
          complete: false,
          classification: "private",
          externalAllowed: false,
          retention: {
            legalBasis: null,
            internalPolicy: "보존 정책 검토 대기",
            deleteAfter: null,
            hold: true,
          },
        },
        { legacyConfirmed: d.confirmed, assessmentWindow: true },
      );
      docs.set(id, e);
    }
    const facts: Record<string, ReturnType<typeof entityRef>> = {};
    for (const f of r.facts) {
      let period: unknown = {
        state: "unmapped",
        reason: "사실 유효기간 미확인",
      };
      if (f.provenance?.validFrom) {
        try {
          period = convertPeriod(
            {
              unit: f.provenance.validFrom.includes("T") ? "instant" : "date",
              timezone: "Asia/Seoul",
              from: f.provenance.validFrom,
              to: f.provenance.validTo || null,
              end: f.provenance.validTo ? "known" : "unknown",
              boundary: "half_open",
            },
            "closed",
            r.request.asOf,
          );
        } catch {
          period = { state: "unmapped", reason: "기간 입력 오류" };
        }
      }
      const evidence = (f.provenance?.evidenceIds || []).flatMap((id) =>
        docs.has(id) ? [entityRef(docs.get(id)!)] : [],
      );
      const e = this.map(
        p,
        r.id + ":" + f.key,
        "fact",
        f,
        {
          kind: "fact",
          scope,
          predicate: /^[A-Za-z0-9_.-]{1,160}$/.test(f.key)
            ? f.key
            : "legacy-" + sha(f.key).slice(0, 16),
          value: f.value,
          truth: "unknown",
          unit: f.unit || null,
          normalizedUnit: null,
          measurementBasis: f.provenance?.measurementBasis || null,
          assertion:
            f.provenance?.assertionSource === "model" ? "model" : "user",
          userAttested: f.provenance?.userAttested || false,
          evidence,
          locations: [],
          recordedAt: f.provenance?.recordedAt || r.createdAt,
          eventType: null,
          eventDate: null,
          formulaVersion: null,
          extractionVersion: "legacy-v3.1",
          conflicts: [],
        },
        {
          period,
          unmapped: [
            "실제 사업장·시설·장소 동일성",
            "원문 위치·사건 일자의 객관 확인",
          ],
          legacyConfirmed: f.confirmed,
          legacyVerification: f.provenance?.verificationStatus,
        },
      );
      facts[f.key] = entityRef(e);
    }
    const text=r.request.prompt+" "+Object.values(r.request.answers).join(" ");
    const base=this.version!=="v3"?selectPolicies(text):undefined;
    const education=this.version==="v6"||this.version==="v7"?selectTraining(text):[];
    // v7: industrial-safety 안전관리자 (산업안전보건법 제17조). The hazmat topic also matches "안전관리자 선임",
    // so when this topic is chosen the hazmat (위험물안전관리법) candidates are left out instead of mixed in.
    const safety=this.version==="v7"?selectSafetyManager(text):[];
    const kept=safety.length&&base?base.policies.filter(s=>!selectedPolicies.some(h=>h.id===s.id)):base?.policies??[];
    const selection=base?{...base,policies:[...kept,...education,...safety],unclassified:base.unclassified&&!education.length&&!safety.length}:undefined;
    const rows = (selection?.policies || selectedPolicies).map((s) => {
      const pol = this.map(
        p,
        r.id + ":" + s.id,
        "policy",
        { basis: sources.map(entityRef), id: s.id },
        s.id.startsWith("training.")?trainingCandidate(s.id as TrainingId,sources.map(entityRef),p.id):s.id.startsWith("safety_manager.")?safetyManagerCandidate(s.id as SafetyManagerId,sources.map(entityRef),p.id):(this.version!=="v3"?v4Candidate:candidatePolicy)(s.id as Parameters<typeof v4Candidate>[0], sources.map(entityRef), p.id),
      );
      const decision = this.map(
        p,
        r.id + ":" + s.id,
        "decision",
        { facts, policy: entityRef(pol), asOf: r.request.asOf },
        {
          kind: "decision",
          scope,
          asOf: r.request.asOf,
          policy: entityRef(pol),
          facts,
          author: p.id,
        },
      );
      return {
        policy: s.id,
        decision: entityRef(decision),
        result: this.repo.evaluate(p, decision),
      };
    });
    const trace = {
      reviewId: r.id,
      asOf: r.request.asOf,
      tenant: p.tenant,
      synthetic: p.synthetic,
      mode,
      adapter: this.version==="v6"?"legacy-v6.1":this.version!=="v3"?"legacy-v4.1":"legacy-v3.1",
      selection,
      rows,
      legacyCategories: r.issues.map((i) => i.category),
      differenceReason:
        "기존 입력 확인은 입증 승인이 아니며 하위 의무·근거·기한을 독립 검토",
      freshness: "not_verified",
    };
    if(this.version!=="v3") {
      const previous=this.store.db.prepare("SELECT body FROM v3_shadow WHERE tenant=? AND review=?").get(p.tenant,r.id) as {body:string}|undefined;
      if(previous)this.store.db.prepare("INSERT INTO v4_trace_history(tenant,review,body) VALUES(?,?,?)").run(p.tenant,r.id,previous.body);
    }
    this.store.db
      .prepare(
        "INSERT INTO v3_shadow VALUES(?,?,?) ON CONFLICT(tenant,review) DO UPDATE SET body=excluded.body",
      )
      .run(p.tenant, r.id, JSON.stringify(trace));
    (r as ReviewResult & { v3Trace: unknown }).v3Trace = {
      reviewId: r.id,
      adapter: trace.adapter,
      asOf: trace.asOf,
      decisions: rows.map((x) => x.decision),
      synthetic: p.synthetic,
    };
    if (mode === "project")
      r.issues = rows.map((row) =>
        projectEvaluation(row.policy, row.decision, row.result),
      );
    if(mode==="project" && selection?.unclassified) r.issues=[{id:"unclassified-"+r.id,category:"more_data",title:"검토 업무 확인 필요",conclusion:"질문의 업무 유형을 특정하지 못했습니다. 적용 여부를 판단하지 않았습니다.",conditions:[],citations:[],exceptions:[],missing:["대상 업무·시설과 검토하려는 행위"],nextActions:["질문의 업무 범위를 보완하세요."],severity:"unspecified"}];
    return trace;
  }
  trace(p: Principal, id: string) {
    assertPrincipal(p);
    const row = this.store.db
      .prepare("SELECT body FROM v3_shadow WHERE tenant=? AND review=?")
      .get(p.tenant, id) as { body: string } | undefined;
    if (!row) throw new Error("평가 기록 없음 또는 접근 권한 없음");
    const t = JSON.parse(row.body);
    if (t.synthetic !== p.synthetic) throw new Error("자료 영역 불일치");
    return t;
  }
}
export function projectEvaluation(
  policyId: string,
  ref: ReturnType<typeof entityRef>,
  r: ReturnType<ComplianceRepository["evaluate"]>,
): LegalIssue {
  const descriptions = {
    pending: "필요한 근거·사실을 확인한 뒤 판단해야 합니다.",
    risk_candidate: "확정 조건의 검토와 독립 판단 승인이 필요합니다.",
    fulfilled: "해당 범위의 이행 확인 결과입니다. 승인 범위를 함께 확인하세요.",
    out_of_scope:
      "해당 의무의 비대상 검토 결과입니다. 다른 의무를 면제하지 않습니다.",
  };
  const category: LegalIssue["category"] =
    r.category === "clear_risk" && r.approval === "approved"
      ? "clear_risk"
      : r.category === "human_review"
        ? "human_review"
        : "more_data";
  return {
    id: ref.id,
    category,
    title:
      [...selectedPolicies,...nextPolicies,...trainingPolicies,...safetyManagerPolicies].find((p) => p.id === policyId)?.label || "의무별 검토",
    conclusion: descriptions[r.outcome],
    conditions: [
      `평가 기록 ${ref.id} · 버전 ${ref.version} · 기준일 ${r.scope.periodTo}`,
      `승인: ${r.approval === "approved" ? "승인됨" : "검토 필요"}`,
    ],
    citations: [],
    exceptions: [],
    missing: r.holds.map((h) => h.missing),
    nextActions: [...new Set(r.holds.flatMap((h) => h.alternatives))],
    severity: "unspecified",
    ruleId: policyId,
  };
}

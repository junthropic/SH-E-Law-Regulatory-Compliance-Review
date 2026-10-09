import { Store, sha } from "./store.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
export class EgressDenied extends Error {
  constructor() {
    super("외부 전송 범위·목적·동의 및 자료 허용 상태 확인 필요");
  }
}
export type EgressContext = { gate: EgressGate; principal: Principal };
export class EgressGate {
  constructor(readonly store: Store) {
    store.db.exec(
      "CREATE TABLE IF NOT EXISTS v3_egress(tenant TEXT,synthetic INTEGER,digest TEXT,purpose TEXT,provider TEXT,body TEXT,PRIMARY KEY(tenant,synthetic,digest,purpose,provider));CREATE TABLE IF NOT EXISTS v3_derivations(tenant TEXT,synthetic INTEGER,digest TEXT,body TEXT,PRIMARY KEY(tenant,synthetic,digest))",
    );
  }
  derived(p: Principal, digest: string, parents: string[]) {
    assertPrincipal(p);
    if (
      !p.roles.includes("writer") ||
      !parents.length ||
      parents.length > 100 ||
      [digest, ...parents].some((d) => !/^[a-f0-9]{64}$/.test(d))
    )
      throw new Error("파생자료 출처 권한·해시 확인 필요");
    const old = this.store.db
      .prepare(
        "SELECT body FROM v3_derivations WHERE tenant=? AND synthetic=? AND digest=?",
      )
      .get(p.tenant, +p.synthetic, digest) as { body: string } | undefined;
    const all = [
      ...new Set([...parents, ...(old ? JSON.parse(old.body).parents : [])]),
    ];
    this.store.db
      .prepare(
        "INSERT INTO v3_derivations VALUES(?,?,?,?) ON CONFLICT(tenant,synthetic,digest) DO UPDATE SET body=excluded.body",
      )
      .run(p.tenant, +p.synthetic, digest, JSON.stringify({ parents: all }));
  }
  decide(
    p: Principal,
    digest: string,
    purpose: string,
    provider: string,
    allowed: boolean,
    basis: string,
    expiresAt: string,
  ) {
    assertPrincipal(p);
    if (
      !p.roles.includes("egress_reviewer") ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      basis.trim().length < 15 ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    )
      throw new Error("전송 검토 권한·근거·기간 확인 필요");
    const b = {
      allowed,
      basis,
      actor: p.id,
      expiresAt,
      at: new Date().toISOString(),
    };
    this.store.db
      .prepare(
        "INSERT INTO v3_egress VALUES(?,?,?,?,?,?) ON CONFLICT(tenant,synthetic,digest,purpose,provider) DO UPDATE SET body=excluded.body",
      )
      .run(
        p.tenant,
        +p.synthetic,
        digest,
        purpose,
        provider,
        JSON.stringify(b),
      );
    this.store.audit(
      "egress_policy",
      JSON.stringify({ actor: p.id, digest, allowed, purpose, provider }),
    );
  }
  check(p: Principal, digests: string[], purpose: string, provider: string) {
    assertPrincipal(p);
    if (!digests.length) throw new EgressDenied();
    const pending = [...digests],
      seen = new Set<string>();
    const protectedRows = this.store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='v2_entities'",
      )
      .get()
      ? (this.store.db
          .prepare("SELECT body FROM v2_entities WHERE tenant=?")
          .all(p.tenant) as { body: string }[])
      : [];
    while (pending.length) {
      const digest = pending.pop()!;
      if (seen.has(digest)) continue;
      if (seen.size > 1000) throw new EgressDenied();
      seen.add(digest);
      if (
        protectedRows.some((row) => {
          const e = JSON.parse(row.body);
          return (
            e.synthetic === p.synthetic &&
            e.body.kind === "evidence" &&
            e.body.originalHash === digest &&
            e.body.externalAllowed !== true
          );
        })
      )
        throw new EgressDenied();
      const derivation = this.store.db
        .prepare(
          "SELECT body FROM v3_derivations WHERE tenant=? AND synthetic=? AND digest=?",
        )
        .get(p.tenant, +p.synthetic, digest) as { body: string } | undefined;
      if (derivation) pending.push(...JSON.parse(derivation.body).parents);
      const r = this.store.db
        .prepare(
          "SELECT body FROM v3_egress WHERE tenant=? AND synthetic=? AND digest=? AND purpose=? AND provider=?",
        )
        .get(p.tenant, +p.synthetic, digest, purpose, provider) as
        { body: string } | undefined;
      const b = r ? JSON.parse(r.body) : undefined;
      if (!b?.allowed || Date.parse(b.expiresAt) <= Date.now())
        throw new EgressDenied();
    }
  }
}
export const requestDigest = (request: {
  prompt: string;
  answers: Record<string, string>;
}) => sha(JSON.stringify({ prompt: request.prompt, answers: request.answers }));
export const queryDigest = (service: string, query: unknown) =>
  sha(JSON.stringify({ service, query }));
export function requireEgress(
  ctx: EgressContext | undefined,
  digests: string[],
  purpose: string,
  provider = "openai",
) {
  if (!ctx) throw new EgressDenied();
  ctx.gate.check(ctx.principal, digests, purpose, provider);
}

import { it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { testStore, request, evidence } from "./helpers.js";
import { fixture, writer, reviewer, scope } from "./v2-fixture.js";
import { createApp as bootApp } from "../server/app.js";
import { sha } from "../server/store.js";
import {
  ComplianceRepository,
  entityRef,
  type Principal,
} from "../server/compliance-v2.js";
import { newReview } from "../server/reviews.js";
import { LegacyBridge } from "../server/legacy-bridge-v3.js";
import { ingestDocument } from "../server/documents.js";
import {
  encryptedBackup,
  decodeBackup,
  restoreEncrypted,
  recoverRestores,
} from "../server/backup-v3.js";
import { EgressGate, requestDigest } from "../server/egress-v3.js";
import { analyze } from "../server/ai.js";
import { extractIntake } from "../server/intake.js";
import { ChatGPTAuth } from "../server/auth.js";
import { Vault } from "../server/vault.js";
import { markdown } from "../server/exports.js";
const valid = (p: Principal): Principal => ({
  ...p,
  validFrom: "2020-01-01T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
});
const createApp = async (...args: Parameters<typeof bootApp>) =>
  (await bootApp(...args)).app;
const pw = valid(writer),
  pr = valid(reviewer),
  pb = valid({ ...writer, roles: [...writer.roles, "backup_operator"] });
const grants = () =>
  new Map([
    [sha("writer-token"), pw],
    [sha("reviewer-token"), pr],
    [sha("backup-token"), pb],
    [sha("expired-token"), { ...pw, expiresAt: "2020-01-01T00:00:00Z" }],
    [sha("revoked-token"), { ...pw, revoked: true }],
    [sha("other-token"), { ...pw, tenant: "other" }],
    [sha("real-token"), { ...pw, synthetic: false }],
  ]);
async function session(app: Awaited<ReturnType<typeof createApp>>) {
  const r = await app.inject({
    url: "/api/bootstrap",
    headers: { host: "127.0.0.1:4999" },
  });
  return {
    host: "127.0.0.1:4999",
    cookie: r.cookies.map((c) => c.name + "=" + c.value).join("; "),
    "x-csrf-token": r.json().csrf,
  };
}
it("V3-H01: 전체 앱 HTTP에서 cookie·CSRF·업무 권한을 독립 확인한다", async () => {
  const f = fixture(),
    app = await createApp(f.store, true, grants());
  try {
    const h = await session(app),
      url = "/api/compliance-v2/entities/source",
      body = { expectedVersion: f.source.version, body: f.source.body };
    for (const token of [
      "forged",
      "expired-token",
      "revoked-token",
      "other-token",
      "real-token",
    ]) {
      expect(
        (
          await app.inject({
            url,
            headers: { ...h, authorization: "Bearer " + token },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect((await app.inject({ url, headers: { ...h } })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url,
          headers: { host: h.host, authorization: "Bearer writer-token" },
        })
      ).statusCode,
    ).toBe(401);
    for (const csrf of [undefined, "wrong"]) {
      const headers: Record<string, string> = {
        ...h,
        authorization: "Bearer writer-token",
      };
      if (csrf === undefined) delete headers["x-csrf-token"];
      else headers["x-csrf-token"] = csrf;
      expect(
        (await app.inject({ method: "POST", url, headers, payload: body }))
          .statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: {
            ...h,
            origin: "https://example.test",
            authorization: "Bearer writer-token",
          },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url,
          headers: { ...h, authorization: "Bearer writer-token" },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
    f.clean();
  }
});
it("V3-H02: HTTP 저장·자기 승인 차단·독립 승인·반려·철회·변경 이력을 보존한다", async () => {
  const f = testStore(),
    app = await createApp(f.store, true, grants());
  try {
    const h = await session(app),
      url = "/api/compliance-v2/entities/new-source";
    const body = {
      kind: "source",
      title: "가상 HTTP 근거",
      url: "https://example.test",
      version: "1",
      text: "모의 조문",
      textHash: sha("모의 조문"),
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
      sourceTag: "normative",
      complete: true,
      decisiveCellsChecked: true,
      conflicts: [],
      extractionVersion: "test",
    };
    const send = (
      path: string,
      payload: Record<string, unknown>,
      token = "writer-token",
    ) =>
      app.inject({
        method: "POST",
        url: path,
        headers: { ...h, authorization: "Bearer " + token },
        payload,
      });
    const saved = await send(url, { expectedVersion: 0, body });
    expect(saved.statusCode).toBe(200);
    const e = saved.json(),
      a = {
        version: e.version,
        hash: e.hash,
        note: "가상 원문을 해당 범위에서 확인한 모의 승인입니다.",
      };
    expect((await send(url + "/approve", a)).statusCode).toBe(403);
    expect((await send(url + "/approve", a, "reviewer-token")).statusCode).toBe(
      200,
    );
    for (const event of [
      "pending",
      "rejected",
      "changes_requested",
      "revoked",
    ]) {
      expect(
        (await send(url + "/events", { ...a, event }, "reviewer-token"))
          .statusCode,
      ).toBe(200);
      expect(new ComplianceRepository(f.store).approved(writer, e)).toBe(false);
    }
    const next = await send(url, {
      expectedVersion: 1,
      body: { ...body, version: "2" },
    });
    expect(next.statusCode).toBe(200);
    expect((await send(url + "/approve", a, "reviewer-token")).statusCode).toBe(
      409,
    );
    expect(
      (
        f.store.db
          .prepare("SELECT count(*) n FROM v3_review_events")
          .get() as any
      ).n,
    ).toBe(5);
  } finally {
    await app.close();
    f.clean();
  }
});
it("V3-H03: 권한 공급 없는 앱은 v2 관리 경로를 활성화하지 않는다", async () => {
  const f = testStore(),
    app = await createApp(f.store, true);
  try {
    const h = await session(app);
    expect(
      (await app.inject({ url: "/api/compliance-v2/entities/a", headers: h }))
        .statusCode,
    ).toBe(404);
  } finally {
    await app.close();
    f.clean();
  }
});
it("V3-L01/S1: legacy 확인 표시를 입증 승인으로 바꾸지 않고 문서·추적·export를 연결한다", async () => {
  const f = testStore();
  try {
    const d = await ingestDocument(
        f.store,
        "가상.txt",
        Buffer.from("가상 선임 기록, 객관 입증 검토 전"),
      ),
      r = newReview({ ...request(), documentIds: [d.id] });
    r.evidence = [evidence()];
    r.facts = [
      {
        key: "permit",
        label: "허가",
        value: "미확인",
        source: "사용자",
        confirmed: true,
      },
    ];
    const bridge = new LegacyBridge(f.store);
    const trace = bridge.attach(writer, r, "project");
    f.store.saveReview(r);
    expect(trace.rows).toHaveLength(6);
    expect(trace.rows.every((x) => x.result.category !== "clear_risk")).toBe(
      true,
    );
    expect(
      r.issues.every((i) => ["human_review", "more_data"].includes(i.category)),
    ).toBe(true);
    const first = JSON.stringify(trace.rows.map((x) => x.decision));
    const again = bridge.attach(writer, r, "project");
    expect(JSON.stringify(again.rows.map((x) => x.decision))).toBe(first);
    const rows = f.store.db
      .prepare("SELECT body FROM v3_legacy_links WHERE kind='fact'")
      .all() as any[];
    const link = JSON.parse(rows[0].body);
    expect(link.legacy.confirmed).toBe(true);
    expect(bridge.repo.get(writer, link.v2.id).body).toMatchObject({
      truth: "unknown",
    });
    expect(markdown(r)).toContain(trace.rows[0].decision.id);
    expect(markdown(r)).toContain("기준일");
    expect(() => bridge.trace({ ...writer, tenant: "other" }, r.id)).toThrow();
  } finally {
    f.clean();
  }
});
it("V3-L02: 기존 자연어 POST→저장→추적 HTTP까지 격리 연결된다", async () => {
  const f = testStore(),
    app = await createApp(f.store, true, grants(), {
      principal: pw,
      mode: "project",
    });
  try {
    const h = await session(app),
      res = await app.inject({
        method: "POST",
        url: "/api/reviews",
        headers: h,
        payload: request(),
      });
    expect(res.statusCode).toBe(202);
    const id = res.json().id;
    for (let i = 0; i < 100 && f.store.review(id)?.status === "running"; i++)
      await new Promise((r) => setTimeout(r, 20));
    const trace = await app.inject({
      url: `/api/management-v3/reviews/${id}/trace`,
      headers: { ...h, authorization: "Bearer writer-token" },
    });
    expect(trace.statusCode).toBe(200);
    expect(trace.json().rows).toHaveLength(6);
    const out = await app.inject({
      url: `/api/reviews/${id}/export?format=md`,
      headers: h,
    });
    expect(out.statusCode).toBe(200);
    expect(out.body).toContain(trace.json().rows[0].decision.id);
  } finally {
    await app.close();
    f.clean();
  }
});
it.each(["unknown", "false"])(
  "V3-E01: AI 분석·사실 추출의 전송 %s는 실제 fetch 0회",
  async (state) => {
    const f = testStore(),
      fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      const gate = new EgressGate(f.store),
        auth = new ChatGPTAuth(
          f.store,
          new Vault(f.store.dir, true),
          undefined,
          { gate, principal: writer },
        ),
        r = { ...request(), useAi: true, model: "synthetic" };
      if (state === "false")
        for (const purpose of ["review", "extract"])
          gate.decide(
            { ...writer, roles: ["egress_reviewer"] },
            requestDigest(r),
            purpose,
            "openai",
            false,
            "가상 시험의 외부 제공 금지 검토입니다.",
            "2099-01-01T00:00:00Z",
          );
      await expect(analyze(auth, r, [], [])).rejects.toThrow(/외부 전송/);
      await expect(extractIntake(auth, r)).rejects.toThrow(/외부 전송/);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      f.clean();
    }
  },
);
it("V3-E02: 질문 허용만으로 첨부 원문·다른 목적·다른 제공자 전송을 허용하지 않는다", () => {
  const f = testStore();
  try {
    const gate = new EgressGate(f.store),
      digest = sha("question");
    gate.decide(
      { ...writer, roles: ["egress_reviewer"] },
      digest,
      "review",
      "openai",
      true,
      "가상 질문에 한해 제공 범위를 확인한 기록입니다.",
      "2099-01-01T00:00:00Z",
    );
    expect(() =>
      gate.check(writer, [digest, sha("document")], "review", "openai"),
    ).toThrow();
    expect(() => gate.check(writer, [digest], "extract", "openai")).toThrow();
    expect(() => gate.check(writer, [digest], "review", "other")).toThrow();
    expect(() =>
      gate.check({ ...writer, tenant: "other" }, [digest], "review", "openai"),
    ).toThrow();
    expect(() =>
      gate.check(writer, [digest], "review", "openai"),
    ).not.toThrow();
  } finally {
    f.clean();
  }
});
it("V3-B01/S4: 암호 백업·복원은 원본·이력을 보존하고 현재 승인은 초기화한다", async () => {
  const f = fixture(),
    dest = testStore(),
    key = randomBytes(32);
  try {
    f.add("target", "true");
    f.add("fulfilled", "false");
    f.add("breach", "true");
    f.add("exception", "false");
    const d = f.decision();
    f.approve(d);
    const b = await encryptedBackup(f.store, pb, key, "synthetic-key");
    expect(JSON.stringify(b)).not.toContain("가상 증빙");
    expect(b.encrypted).toBe(true);
    expect(() => decodeBackup(b, { ...pb, tenant: "other" }, key)).toThrow();
    expect(() => decodeBackup(b, pb, randomBytes(32))).toThrow();
    expect(() =>
      decodeBackup({ ...b, createdAt: "2025-01-01T00:00:00Z" }, pb, key),
    ).toThrow();
    const out = restoreEncrypted(dest.store, pb, b, key);
    expect(out.currentApproval).toBe(false);
    const repo = new ComplianceRepository(dest.store);
    expect(repo.evaluate(writer, repo.get(writer, d.id)).category).not.toBe(
      "clear_risk",
    );
    expect(
      (
        dest.store.db
          .prepare("SELECT count(*) n FROM v2_approvals")
          .get() as any
      ).n,
    ).toBeGreaterThan(0);
    expect(recoverRestores(dest.store)).toEqual([]);
  } finally {
    f.clean();
    dest.clean();
  }
});
it.each(["v2_imported", "legacy_imported", "before_publish", "after_publish"])(
  "V3-B02: 복원 %s 실패 시 DB와 새 원본을 rollback하고 기존 원본은 유지한다",
  async (phase) => {
    const f = fixture(),
      dest = testStore(),
      key = randomBytes(32);
    try {
      f.add("target", "true");
      const b = await encryptedBackup(f.store, pb, key, "key");
      const keep = join(dest.store.dir, "originals", "unrelated.txt");
      writeFileSync(keep, "keep");
      expect(() =>
        restoreEncrypted(dest.store, pb, b, key, (p) => {
          if (p === phase) throw Error("synthetic disk fault");
        }),
      ).toThrow();
      expect(
        (
          dest.store.db
            .prepare("SELECT count(*) n FROM v2_entities")
            .get() as any
        ).n,
      ).toBe(0);
      expect(readFileSync(keep, "utf8")).toBe("keep");
      expect(recoverRestores(dest.store)).toEqual([]);
    } finally {
      f.clean();
      dest.clean();
    }
  },
);
it("V3-B03: 2MiB를 넘는 원본도 별도 HTTP 백업·복원 제한 내 왕복한다", async () => {
  const f = testStore(),
    dest = testStore(),
    key = randomBytes(32);
  const app = await createApp(f.store, true, grants(), {
      principal: pw,
      mode: "shadow",
      backupKey: { key, id: "test-key" },
    }),
    other = await createApp(dest.store, true, grants(), {
      principal: pw,
      mode: "shadow",
      backupKey: { key, id: "test-key" },
    });
  try {
    const d = await ingestDocument(
        f.store,
        "large.txt",
        Buffer.alloc(3 * 1024 * 1024, 65),
      ),
      r = newReview({ ...request(), documentIds: [d.id] });
    new LegacyBridge(f.store).attach(writer, r);
    f.store.saveReview(r);
    const h = await session(app),
      oh = await session(other),
      b = await app.inject({
        method: "POST",
        url: "/api/management-v3/backup",
        headers: { ...h, authorization: "Bearer backup-token" },
      });
    expect(b.statusCode).toBe(200);
    expect(b.body.length).toBeGreaterThan(2 * 1024 * 1024);
    const restored = await other.inject({
      method: "POST",
      url: "/api/management-v3/restore",
      headers: { ...oh, authorization: "Bearer backup-token" },
      payload: b.json(),
    });
    expect(restored.statusCode).toBe(200);
    expect(dest.store.document(d.id)?.confirmed).toBe(false);
    expect(
      sha(readFileSync(join(dest.store.dir, "originals", d.id + d.type))),
    ).toBe(d.hash);
  } finally {
    await app.close();
    await other.close();
    f.clean();
    dest.clean();
  }
});
it("V3-B04: 실제 복원 프로세스 중단 뒤 일지로 새 원본만 정리하고 재복원한다", async () => {
  const f = fixture(),
    dest = testStore(),
    key = Buffer.alloc(32, 7);
  try {
    f.add("target", "true");
    const b = await encryptedBackup(f.store, pb, key, "synthetic"),
      archive = join(f.store.dir, "encrypted.json");
    writeFileSync(archive, JSON.stringify(b));
    const keep = join(dest.store.dir, "originals", "unrelated.txt");
    writeFileSync(keep, "keep");
    const build = resolve(process.env.SHE_TEST_BUILD || "build");
    const code = `import{Store}from ${JSON.stringify(pathToFileURL(join(build, "server/store.js")).href)};import{restoreEncrypted}from ${JSON.stringify(pathToFileURL(join(build, "server/backup-v3.js")).href)};import{readFileSync}from'node:fs';const s=new Store(process.argv[1]);restoreEncrypted(s,${JSON.stringify(pb)},JSON.parse(readFileSync(process.argv[2],'utf8')),Buffer.alloc(32,7),phase=>{if(phase==='after_publish')process.exit(41)});`;
    const exit = await new Promise<number | null>((res, rej) => {
      const c = spawn(
        process.execPath,
        ["--input-type=module", "-e", code, dest.store.dir, archive],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      let error = "";
      c.stderr.on("data", (s) => (error += s));
      c.on("error", rej);
      c.on("exit", (n) => (n === 41 ? res(n) : rej(Error(error))));
    });
    expect(exit).toBe(41);
    expect(recoverRestores(dest.store)).toHaveLength(1);
    expect(
      (dest.store.db.prepare("SELECT count(*) n FROM v2_entities").get() as any)
        .n,
    ).toBe(0);
    expect(readFileSync(keep, "utf8")).toBe("keep");
    expect(restoreEncrypted(dest.store, pb, b, key).state).toBe("published");
  } finally {
    f.clean();
    dest.clean();
  }
});
it("V3-E03: 금지 원본의 요약·인코딩 파생자료는 허용 표시가 있어도 전송되지 않는다", () => {
  const f = fixture();
  try {
    f.add("target", "true");
    const gate = new EgressGate(f.store),
      ev = f.repo.get(writer, "e-target");
    if (ev.body.kind !== "evidence") throw Error();
    const digest = sha("요약 또는 base64 파생물");
    gate.derived(writer, digest, [ev.body.originalHash]);
    for (const d of [digest, ev.body.originalHash])
      gate.decide(
        { ...writer, roles: ["egress_reviewer"] },
        d,
        "review",
        "openai",
        true,
        "가상 시험에서 우회 시도만 확인하는 승인 입력입니다.",
        "2099-01-01T00:00:00Z",
      );
    expect(() => gate.check(writer, [digest], "review", "openai")).toThrow();
  } finally {
    f.clean();
  }
});
it("V3-H04: 자료 보완→정책→판정→조치까지 HTTP 역할별 승인 후 원문 변경은 관련 판단만 무효화한다", async () => {
  const seed = fixture(),
    f = testStore(),
    app = await createApp(f.store, true, grants());
  try {
    const h = await session(app);
    const post = async (
      path: string,
      payload: Record<string, unknown>,
      token = "writer-token",
    ) =>
      app.inject({
        method: "POST",
        url: "/api/compliance-v2" + path,
        headers: { ...h, authorization: "Bearer " + token },
        payload,
      });
    const save = async (id: string, body: unknown) => {
      const r = await post("/entities/" + id, { expectedVersion: 0, body });
      expect(r.statusCode, r.body).toBe(200);
      return r.json();
    };
    const approve = async (e: any) => {
      const r = await post(
        "/entities/" + e.id + "/approve",
        {
          version: e.version,
          hash: e.hash,
          note: "격리 가상 자료에 한해서 각 역할의 독립 검토를 수행합니다.",
        },
        "reviewer-token",
      );
      expect(r.statusCode, r.body).toBe(200);
    };
    const s = await save("source", seed.source.body);
    await approve(s);
    const policy = await save("policy", {
      ...seed.policy.body,
      basis: [entityRef(s)],
    });
    await approve(policy);
    const facts: Record<string, any> = {};
    for (const [key, value] of [
      ["target", "true"],
      ["fulfilled", "false"],
      ["breach", "true"],
      ["exception", "false"],
    ] as const) {
      seed.add(key, value);
      const original = await post("/originals", {
        data: Buffer.from("가상 증빙 " + key).toString("base64"),
      });
      expect(original.statusCode).toBe(200);
      const se = seed.repo.get(writer, "e-" + key);
      const ev = await save("e-" + key, {
        ...se.body,
        ...original.json<Record<string, string>>(),
      });
      await approve(ev);
      const sf = seed.repo.get(writer, key);
      const fact = await save(key, { ...sf.body, evidence: [entityRef(ev)] });
      await approve(fact);
      facts[key] = entityRef(fact);
    }
    const d = await save("decision", {
      kind: "decision",
      scope,
      asOf: scope.periodTo,
      policy: entityRef(policy),
      facts,
      author: writer.id,
    });
    await approve(d);
    const evaluation = await app.inject({
      url: "/api/compliance-v2/entities/decision/evaluation",
      headers: { ...h, authorization: "Bearer reviewer-token" },
    });
    expect(evaluation.json().category).toBe("clear_risk");
    const e = seed.repo.get(writer, "e-target"),
      actionProof = await save("effect-proof", {
        ...e.body,
        claims: { "action_effect:action": "confirmed" },
      });
    await approve(actionProof);
    const action = await save("action", {
      kind: "action",
      decision: entityRef(d),
      owner: writer.id,
      state: "claimed_complete",
      due: null,
      dueKind: "internal",
      resources: "가상",
      temporaryControls: "가상",
      completionEvidence: [entityRef(actionProof)],
      historicalDecision: entityRef(d),
    });
    await approve(action);
    const changed = await post("/entities/source", {
      expectedVersion: 1,
      body: { ...s.body, version: "2" },
    });
    expect(changed.statusCode).toBe(200);
    expect(new ComplianceRepository(f.store).approved(writer, d)).toBe(false);
    expect(new ComplianceRepository(f.store).approved(writer, action)).toBe(
      false,
    );
    expect(
      new ComplianceRepository(f.store).approved(writer, actionProof),
    ).toBe(true);
  } finally {
    await app.close();
    f.clean();
    seed.clean();
  }
});

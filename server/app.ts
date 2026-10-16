import { withPayloadExecution, type Execution } from "./egress-execution-v4.js";
import Fastify from "fastify";
import { presentReview } from "../shared/result-language.js";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { Store, sha } from "./store.js";
import { Vault } from "./vault.js";
import { ChatGPTAuth, same } from "./auth.js";
import {
  ReviewRequestSchema,
  type Evidence,
  type DocumentRecord,
  type ReviewResult,
} from "../shared/types.js";
import { newReview, runReview } from "./reviews.js";
import {
  collectReference,
  saveLinkedBasis,
  ReferenceCollectionError,
} from "./reference-collection.js";
import { buildVerification } from "./verification.js";
import { syncSources, PetitionConnector, regionRegistry } from "./sources.js";
import { ingestDocument } from "./documents.js";
import { versionDiff, quantityRatio } from "./legal.js";
import { markdown, csv } from "./exports.js";
import { makeBackup, restoreBackup } from "./backup.js";
import { approveReviewBasis, approvalContext } from "./approval.js";
import { queryMcp } from "./mcp.js";
import { PetitionCollector } from "./petitions.js";
import { updatePublicBundle } from "./bundles.js";
import { registerPublicApis } from "./public-apis.js";
import { registerIntake, intakeForReview } from "./intake.js";
import { registerDossier } from "./dossier.js";
import { registerComplianceV2 } from "./compliance-api-v2.js";
import type { Principal } from "./compliance-v2.js";
import { LegacyBridge } from "./legacy-bridge-v3.js";
import { checkReviewExport, previewOn } from "./export-check-v8.js";
import { EgressGate,EgressDenied } from "./egress-v3.js";
import { CollectionService } from "./collection-service-v3.js";
import { registerManagementV3 } from "./management-v3.js";
import { restrictToLoopback } from "./loopback-v8.js";
import { AiConsent } from "./ai-consent-v8.js";
import { registerSecurityV8 } from "./security-routes-v8.js";
import { deleteDocument } from "./retention-v8.js";
import { safeMessage } from "./redact-v8.js";
import { attachPreview, registerPreviewV8 } from "./preview-v8.js";
import { registerBetaV8, markCsv, markMarkdown, selfReviewOf } from "./beta-v8.js";
import { isInstalled, LEGACY_BACKUP_OFF_MESSAGE, MCP_OFF_MESSAGE, PETITION_OFF_MESSAGE, PUBLIC_UPDATE_OFF_MESSAGE } from "./installed-v8.js";

// F-01: the route pattern the router matched (e.g. "/api/reviews/:id"); for unmatched requests, the percent-decoded
// path. null when the path cannot be decoded. The raw req.url must not be used for security decisions.
function routedPath(req: { routeOptions?: { url?: string }; url: string }): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    return null;
  }
  // Unknown /api paths match the static wildcard route; the decoded path still marks them as /api.
  const route = req.routeOptions?.url;
  return route?.startsWith("/api/") ? route : decoded;
}
import { LAUNCH_HEADER, LAUNCH_REFUSED, launchTokenMatches } from "./launch-token-v8.js";

export async function createApp(store = new Store(), test = false, complianceGrants?: ReadonlyMap<string, Principal>, v3?: {adapter?:"v3"|"v4"|"v6";principal:Principal;mode:"shadow"|"project";collect?:boolean;backupKey?:{key:Buffer;id:string}}, enforcement?: () => Execution, launchToken?: string) {
  if(v3 && (!test || !v3.principal.synthetic))throw new Error("v3 연결은 명시된 격리 가상 환경에서만 실행합니다.");
  const bridge=v3?new LegacyBridge(store,v3.adapter||"v3"):undefined;
  // Default path: v8 preview switch (off = no-op, the review is unchanged).
  const finalize=v3&&bridge?(r:ReviewResult)=>{bridge.attach(v3.principal,r,v3.mode);}:(r:ReviewResult)=>{if(previewOn(store))attachPreview(r);};
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 60000,
  });
  restrictToLoopback(app);
  // No default users, approvals or production migration. Host must supply authenticated role grants.
  if (complianceGrants?.size) registerComplianceV2(app, store, complianceGrants);
  const memoryAuth = test || process.env.SHE_EPHEMERAL_AUTH === "1";
  const vault = new Vault(store.dir, memoryAuth);
  const collection=v3?new CollectionService(store,vault,180000,new EgressGate(store),job=>{
    const p=[...(complianceGrants?.values()||[])].find(p=>p.id===job.requester&&p.tenant===job.tenant&&p.synthetic===job.synthetic);
    if(!p)throw new Error("수집 요청자 업무 권한 확인 필요");return p;
  }):undefined;
  const auth = new ChatGPTAuth(store, vault, undefined, v3?{gate:new EgressGate(store),principal:v3.principal}:undefined);
  const sessions = new Map<string, string>();
  let syncing = false;
  const jobs = new Set<Promise<unknown>>();
  // Hold the lock for the operation, not for delivery of its HTTP response.
  const mutations = new Set<string>();
  const executing = new Set<string>();
  let closing = false;
  const origin = () => `http://127.0.0.1:${process.env.PORT || 4317}`;
  const petitions = new PetitionCollector(store, vault);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8 },
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    const host = req.headers.host || "";
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(host))
      return reply
        .code(403)
        .send({ error: "로컬 주소 127.0.0.1로 접속하세요." });
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin !== `http://${host}`)
      return reply
        .code(403)
        .send({ error: "다른 사이트의 요청은 허용하지 않습니다." });
    // F-01: decide on the path the router matched (it percent-decodes), never on the raw URL, so "/%61pi/…" cannot skip the gate.
    const path = routedPath(req);
    if (path === null) return reply.code(400).send({ error: "잘못된 주소입니다." });
    if (
      path.startsWith("/api/") &&
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply.code(403).send({ error: "교차 사이트 요청 차단" });
    if (path.startsWith("/api/") && path !== "/api/bootstrap") {
      const token = req.cookies.she_session;
      const csrf = token ? sessions.get(token) : undefined;
      if (!csrf)
        return reply.code(401).send({ error: "화면을 새로고침하세요." });
      if (
        !["GET", "HEAD"].includes(req.method) &&
        (!req.headers["x-csrf-token"] ||
          !same(String(req.headers["x-csrf-token"]), csrf))
      )
        return reply.code(403).send({ error: "요청 인증이 만료되었습니다." });
    }
  });
  app.addHook("preHandler", async (req, reply) => {
    const path = routedPath(req) ?? "";
    // These legacy paths lack a complete derivation/consent link. Keep them closed in the v3 pilot.
    if(v3&&req.method==="POST"&&(/^\/api\/intake\/[^/]+\/execute$/.test(path)||path==="/api/mcp/query"))throw new EgressDenied();
    const mutating =
      path.startsWith("/api/") && !["GET", "HEAD"].includes(req.method);
    if (closing && path.startsWith("/api/"))
      return reply.code(503).send({ error: "프로그램을 종료하고 있습니다." });
    if ((mutating || path === "/api/backup") && mutations.size)
      return reply
        .code(409)
        .send({ error: "다른 변경 작업이 끝난 뒤 다시 시도하세요." });
    if (mutating && jobs.size && !path.startsWith("/api/auth/"))
      return reply
        .code(409)
        .send({ error: "진행 중인 검토·갱신 작업이 끝난 뒤 다시 시도하세요." });
    if (mutating) mutations.add(req.id);
  });
  app.addHook("onResponse", async (req) => {
    mutations.delete(req.id);
  });
  app.addHook("onRequestAbort", async (req) => {
    if (!executing.has(req.id)) mutations.delete(req.id);
  });
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      !route.url.startsWith("/api/") ||
      methods.every((method) => ["GET", "HEAD"].includes(method))
    )
      return;
    const handler = route.handler;
    route.handler = async function (req, reply) {
      executing.add(req.id);
      try {
        return await (enforcement ? withPayloadExecution(enforcement(),async()=>handler.call(this, req, reply)) : handler.call(this, req, reply));
      } finally {
        executing.delete(req.id);
        mutations.delete(req.id);
      }
    };
  });
  app.setErrorHandler((err, req, reply) => {
    const message =
      err instanceof z.ZodError
        ? "입력 내용을 확인하세요: " +
          err.issues.map((i) => i.path.join(".") + " " + i.message).join(", ")
        : err instanceof Error
          ? safeMessage(err.message, store.dir)
          : "요청 실패";
    const code =
      err instanceof Error && "statusCode" in err
        ? Number(err.statusCode)
        : 400;
    reply.code(code >= 400 && code < 600 ? code : 400).send({ error: message });
  });
  if(v3&&collection&&complianceGrants?.size){
    registerManagementV3(app,store,complianceGrants,collection,v3.backupKey);
    if(v3.collect){app.addHook("onReady",async()=>{collection.start();});app.addHook("onClose",async()=>{await collection.stop();});}
  }
  const publicKeys = registerPublicApis(app, store, vault, memoryAuth,v3?.collect&&collection?(service,query)=>collection.facade(v3.principal,service,query):undefined);
  registerIntake(app, store, vault, auth, jobs);
  registerDossier(app, store, (id) => checkReviewExport(store, id, "reviewer-packet", enforcement?.()), (id) => {
    const selfReview = selfReviewOf(store, id);
    return selfReview ? { selfReview } : {};
  });
  const aiConsent = new AiConsent(store);
  registerSecurityV8(app, store, aiConsent);
  registerPreviewV8(app, store);
  app.get("/api/bootstrap", async (req, reply) => {
    let token = req.cookies.she_session;
    if (!token || !sessions.has(token)) {
      // H1: with a launch token (installed build) only the browser the launcher opened gets a new session.
      if (launchToken && !launchTokenMatches(launchToken, req.headers[LAUNCH_HEADER]))
        return reply.code(403).send({ error: LAUNCH_REFUSED });
      token = randomBytes(32).toString("base64url");
      if (sessions.size > 100) sessions.clear();
      sessions.set(token, randomBytes(32).toString("base64url"));
      reply.setCookie("she_session", token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
    }
    return {
      csrf: sessions.get(token),
      regions: regionRegistry,
      version: "0.1.0",
    };
  });
  app.get("/api/status", async () => {
    let lawConfigured = !!process.env.LAW_OC;
    let lawStorageError = "";
    if (!lawConfigured) {
      try {
        lawConfigured = !!(await vault.read<any>("law"))?.lawOc;
      } catch {
        lawStorageError =
          "저장된 법제처 인증정보를 읽지 못했습니다. 일반 사용자 세션에서 실행하거나 인증정보를 다시 저장하세요.";
      }
    }
    return {
      auth: await auth.status(),
      authStorage: memoryAuth ? "memory" : "windows-dpapi",
      lawConfigured,
      lawStorageError,
      sources: store.sources(),
      syncing,
      petition: petitions.status(),
      publicBundle: store.setting("public-bundle-status", null),
      rules: store.rules().length,
      notice: "현장·전국 법규 검증 전 개발 버전",
    };
  });
  app.post("/api/settings/law", async (req) => {
    const { lawOc } = z
      .object({ lawOc: z.string().trim().min(1).max(200) })
      .parse(req.body);
    await vault.write("law", { lawOc });
    return { saved: true };
  });
  app.post("/api/auth/chatgpt/start", async () => auth.start(origin()));
  app.post("/api/auth/chatgpt/cancel", async () => {
    auth.cancel();
    return { ok: true };
  });
  app.post("/api/auth/chatgpt/logout", async () => auth.logout());
  app.get("/api/auth/chatgpt/models", async () => auth.models());
  app.get("/auth/callback", async (req, reply) => {
    try {
      await auth.callback(req.query as Record<string, string>);
      return reply.redirect("/?connected=1");
    } catch (e) {
      return reply
        .code(400)
        .type("text/plain; charset=utf-8")
        .send(e instanceof Error ? safeMessage(e.message, store.dir) : "인증 실패");
    }
  });
  app.get("/api/reviews", async () =>
    store
      .all<ReviewResult>("reviews")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        title: r.request.prompt.slice(0, 90),
        region: r.request.region,
        createdAt: r.createdAt,
        status: r.status,
        needsReview: r.needsReview,
      })),
  );
  app.post("/api/reviews", async (req, reply) => {
    if ([...jobs].length >= 2)
      return reply
        .code(429)
        .send({ error: "진행 중인 검토가 끝난 뒤 다시 요청하세요." });
    let input = ReviewRequestSchema.parse(req.body);
    const preparation = z
      .object({ intakeId: z.string().uuid().optional() })
      .parse(req.body);
    if (preparation.intakeId)
      input = ReviewRequestSchema.parse(
        intakeForReview(store, preparation.intakeId, input),
      );
    const r = newReview(input);
    store.saveReview(r);
    const job = runReview(store, vault, auth, r, undefined, finalize);
    jobs.add(job);
    void job.then(
      () => jobs.delete(job),
      () => jobs.delete(job),
    );
    return reply.code(202).send({ id: r.id });
  });
  app.post("/api/reviews/:id/resolve-reference", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { title, useAi } = z
      .object({
        title: z.string().trim().min(2).max(150),
        useAi: z.boolean().default(false),
      })
      .parse(req.body);
    const parent = store.review(id);
    if (!parent || parent.status !== "completed")
      return reply
        .code(409)
        .send({ error: "완료된 검토에서 연결 원문을 선택하세요." });
    const references = (
      parent.verification ||
      buildVerification(parent.evidence, parent.request, false)
    ).basis.flatMap((b) => b.references);
    if (!references.some((r) => r.title === title && r.state === "missing"))
      return reply.code(400).send({
        error:
          "이 검토에서 누락된 것으로 확인된 연결 법규만 수집할 수 있습니다.",
      });
    if ((parent.request.linkedEvidenceIds?.length || 0) >= 30)
      return reply.code(400).send({
        error: "검토별 연결 원문 30개 한도입니다. 검토 범위를 나누세요.",
      });
    if (useAi && (!parent.request.useAi || !parent.request.model))
      return reply.code(400).send({
        error: "AI 분석을 사용했던 검토에서 재분석을 선택할 수 있습니다.",
      });
    const lock = "reference:" + id;
    if (jobs.size >= 2 || executing.has(lock))
      return reply
        .code(409)
        .send({ error: "진행 중인 원문 수집·검토가 끝난 뒤 다시 요청하세요." });
    executing.add(lock);
    let oc: string;
    try {
      oc =
        process.env.LAW_OC ||
        (await vault.read<{ lawOc: string }>("law"))?.lawOc ||
        "";
    } catch {
      executing.delete(lock);
      return reply
        .code(400)
        .send({ error: "저장된 법제처 인증정보를 읽지 못했습니다." });
    }
    if (!oc) {
      executing.delete(lock);
      return reply
        .code(400)
        .send({ error: "연결 설정에 법제처 OC를 저장하세요." });
    }
    const r = newReview(
      ReviewRequestSchema.parse({ ...parent.request, useAi }),
    );
    r.referenceCollection = {
      parentReviewId: id,
      title,
      state: "running",
      message: "공식 목록에서 제목·지역·기준일 버전을 확인하고 있습니다.",
    };
    r.progress = r.referenceCollection.message;
    store.saveReview(r);
    const job = (async () => {
      try {
        const evidence = await collectReference(store, oc, r.request, title);
        saveLinkedBasis(store, r.request, evidence);
        r.request.linkedEvidenceIds = [
          ...new Set([...(r.request.linkedEvidenceIds || []), evidence.id]),
        ];
        r.referenceCollection = {
          ...r.referenceCollection!,
          state: "collected",
          evidenceId: evidence.id,
          message:
            "제목·기준일 원문 후보를 확보했습니다. 별표·공보·예외 적용은 별도 대조 대상입니다.",
        };
        await runReview(store, vault, auth, r, undefined, finalize);
      } catch (error) {
        r.status = "failed";
        r.error =
          error instanceof ReferenceCollectionError
            ? error.message
            : "연결 원문 수집을 완료하지 못했습니다. 제목·지역·기준일 버전의 일치 여부, 법제처 응답 및 조회 한도를 확인하세요. 기존 검토는 보존되어 있습니다.";
        r.referenceCollection = {
          ...r.referenceCollection!,
          state: "failed",
          message: r.error,
        };
        r.progress = r.error;
        store.saveReview(r);
      } finally {
        executing.delete(lock);
      }
    })();
    jobs.add(job);
    void job.then(
      () => jobs.delete(job),
      () => jobs.delete(job),
    );
    return reply.code(202).send({ id: r.id });
  });
  app.get("/api/reviews/:id", async (req, reply) => {
    const r = store.review((req.params as any).id);
    return r ? presentReview(r) : reply.code(404).send({ error: "검토를 찾을 수 없습니다." });
  });
  app.get("/api/reviews/:id/events", async (req, reply) => {
    const id = (req.params as any).id;
    if (!store.review(id)) return reply.code(404).send({ error: "검토 없음" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    let timer: ReturnType<typeof setInterval> | undefined;
    const send = () => {
      const r = store.review(id);
      reply.raw.write("data: " + JSON.stringify(r ? presentReview(r) : r) + "\n\n");
      if (!r || r.status !== "running") {
        if (timer) clearInterval(timer);
        reply.raw.end();
      }
    };
    timer = setInterval(send, 1000);
    send();
    req.raw.on("close", () => {
      if (timer) clearInterval(timer);
    });
  });
  app.get("/api/reviews/:id/export", async (req, reply) => {
    const r = store.review((req.params as any).id);
    if (!r) return reply.code(404).send({ error: "검토 없음" });
    const format = (req.query as any).format;
    checkReviewExport(store,r.id,"export",enforcement?.());
    reply.header(
      "Content-Disposition",
      `attachment; filename="review-${r.id}.${format === "csv" ? "csv" : "md"}"`,
    );
    return reply
      .type(
        format === "csv"
          ? "text/csv; charset=utf-8"
          : "text/markdown; charset=utf-8",
      )
      .send(format === "csv" ? markCsv(store, r.id, csv(r)) : markMarkdown(store, r.id, markdown(r)));
  });
  app.get("/api/documents", async () =>
    store.all<DocumentRecord>("documents").map((d) => {
      // Older lookup reports predate origin metadata. Verify the saved link;
      // a user-uploaded file with a similar name must remain selectable.
      const match = /^자동조회-([a-f0-9-]{36})\.txt$/i.exec(d.name);
      const linked =
        match &&
        store.get<{ reportId?: string }>("settings", "intake-" + match[1])
          ?.reportId === d.id;
      return {
        ...d,
        origin: d.origin || (linked ? "intake" : "upload"),
        text: d.text.slice(0, 60000),
      };
    }),
  );
  app.post("/api/documents", async (req) => {
    const part = await req.file();
    if (!part) throw new Error("파일을 선택하세요.");
    const buffer = await part.toBuffer();
    if (part.file.truncated) throw new Error("파일 용량 초과");
    return ingestDocument(store, part.filename, buffer);
  });
  app.get("/api/documents/:id/original", async (req, reply) => {
    const d = store.document((req.params as any).id);
    if (!d) return reply.code(404).send({ error: "문서 없음" });
    return reply
      .type("application/octet-stream")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      )
      .send(store.readOriginal(d.id + d.type));
  });
  app.post("/api/documents/:id/confirm", async (req) => {
    const d = store.document((req.params as any).id);
    if (!d) throw new Error("문서 없음");
    const b = z
      .object({
        confirmed: z.boolean(),
        agency: z.string().max(150),
        responseDate: z.union([z.string().date(), z.literal("")]),
        region: z.string().max(100),
      })
      .parse(req.body);
    if (
      b.confirmed &&
      (!d.text.trim() || d.warnings.some((w) => w.includes("잘렸습니다")))
    )
      throw new Error(
        "텍스트가 비었거나 잘린 자료는 원문 확인 완료로 처리할 수 없습니다.",
      );
    store.put("documents", d.id, { ...d, ...b });
    return { ok: true };
  });
  app.delete("/api/documents/:id", async (req) => {
    deleteDocument(store, (req.params as any).id);
    return { ok: true };
  });
  app.get("/api/evidence", async () =>
    store.all<Evidence>("evidence").map((e) => ({ ...e, text: "" })),
  );
  const evidenceById = (id: string) =>
    store.get<Evidence>("evidence", id) ||
    store.setting<{ evidence: Evidence } | null>("linked-basis:" + id, null)
      ?.evidence ||
    store
      .all<ReviewResult>("reviews")
      .flatMap((r) => r.evidence)
      .find((e) => e.id === id);
  app.get(
    "/api/evidence/:id",
    async (req, reply) =>
      evidenceById((req.params as any).id) ||
      reply.code(404).send({ error: "근거 없음" }),
  );
  app.get("/api/evidence/:id/diff", async (req) => {
    const e = evidenceById((req.params as any).id);
    if (!e) throw new Error("근거 없음");
    const other = store
      .all<Evidence>("evidence")
      .filter((x) => x.sourceId === e.sourceId && x.id !== e.id)
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
    if (!other)
      return { label: "비교 가능한 이전 전문이 없습니다.", changes: [] };
    return versionDiff(other, e);
  });
  const startSync = async () => {
    if (syncing) throw new Error("이미 갱신 중입니다.");
    const oc = process.env.LAW_OC || (await vault.read<any>("law"))?.lawOc;
    if (!oc) throw new Error("법제처 OC를 먼저 저장하세요.");
    syncing = true;
    const job = syncSources(store, oc)
      .catch(() => {
        store.audit("public_sync_error", "예기치 않은 수집 작업 오류");
      })
      .finally(() => {
        syncing = false;
        jobs.delete(job);
      });
    jobs.add(job);
    return { started: true };
  };
  app.post("/api/sync", async () => startSync());
  registerBetaV8(app, {
    store, vault, memory: memoryAuth, keys: publicKeys,
    busy: () => jobs.size > 0 || syncing,
    syncing: () => syncing,
    startSync,
    schedule: !test,
  });
  app.post("/api/quantity-ratio", async (req) => {
    const b = z
      .object({
        groupConfirmed: z.boolean(),
        items: z
          .array(
            z.object({
              quantity: z.number(),
              unit: z.string(),
              designated: z.number(),
              designatedUnit: z.string(),
            }),
          )
          .max(100),
      })
      .parse(req.body);
    return {
      ratio: quantityRatio(b.items, b.groupConfirmed),
      note: "입력한 지정수량의 법적 적용 여부는 별도로 확인해야 합니다.",
    };
  });
  app.get("/api/backup", async (req, reply) => {
    // F-04: the plaintext JSON backup is off in the installed build; the encrypted /api/beta/backup stays.
    if (isInstalled()) return reply.code(403).send({ error: LEGACY_BACKUP_OFF_MESSAGE });
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 백업하세요.");
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="she-private-backup.json"',
      )
      .send(makeBackup(store));
  });
  app.post("/api/restore", { bodyLimit: 100 * 1024 * 1024 }, async (req, reply) => {
    if (isInstalled()) return reply.code(403).send({ error: LEGACY_BACKUP_OFF_MESSAGE });
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 복원하세요.");
    return restoreBackup(store, req.body);
  });
  app.get("/api/basis/context/:id", async req => approvalContext(store, (req.params as {id:string}).id));
  app.post("/api/basis/approve", async (req) => {
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 검증하세요.");
    return approveReviewBasis(store, req.body);
  });
  app.post("/api/public/update", async (_req, reply) => {
    // Installed build: law data comes from the user's own collection, never from the maker's repository.
    if (isInstalled()) return reply.code(403).send({ error: PUBLIC_UPDATE_OFF_MESSAGE });
    if (jobs.size || syncing) throw new Error("작업이 끝난 뒤 갱신하세요.");
    return updatePublicBundle(store);
  });
  app.post("/api/shutdown", async () => {
    if (jobs.size || syncing)
      throw new Error("진행 중인 작업이 끝난 뒤 종료하세요.");
    closing = true;
    setTimeout(() => {
      void app.close();
    }, 200);
    return { ok: true };
  });
  app.post("/api/petitions/connect", async (req, reply) => isInstalled() ? reply.code(403).send({ error: PETITION_OFF_MESSAGE }) : petitions.start(req.body));
  app.post("/api/petitions/collect", async (_req, reply) => isInstalled() ? reply.code(403).send({ error: PETITION_OFF_MESSAGE }) : petitions.collect());
  app.post("/api/petitions/disconnect", async () => {
    await petitions.close();
    vault.remove("epeople-session");
    return { ok: true };
  });
  app.post("/api/mcp/query", async (req, reply) => {
    if (isInstalled()) return reply.code(403).send({ error: MCP_OFF_MESSAGE });
    const b = z
      .object({
        tool: z.enum([
          "search_law",
          "search_ordinance",
          "get_ordinance",
          "get_law_text",
          "search_admin_rule",
          "get_admin_rule",
        ]),
        params: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    const oc = process.env.LAW_OC || (await vault.read<any>("law"))?.lawOc;
    if (!oc) throw new Error("법제처 OC 설정 필요");
    return queryMcp(oc, b.tool, b.params);
  });
  if (existsSync(resolve("dist/index.html"))) {
    await app.register(staticPlugin, {
      root: resolve("dist"),
      setHeaders(response, path) {
        if (path.endsWith("index.html"))
          response.header("Cache-Control", "no-store");
      },
    });
  }
  // v8 beta screens: a separate entry built from beta/ into dist-beta/. The frozen screens above are unchanged.
  const beta = existsSync(resolve("dist-beta/index.html"));
  if (beta)
    await app.register(staticPlugin, {
      root: resolve("dist-beta"),
      prefix: "/beta/",
      decorateReply: false,
      setHeaders(response, path) {
        if (path.endsWith("index.html")) response.header("Cache-Control", "no-store");
      },
    });
  if (existsSync(resolve("dist/index.html")))
    app.setNotFoundHandler((req, reply) =>
      (routedPath(req) ?? "").startsWith("/api/")
        ? reply.code(404).send({ error: "API 없음" })
        : beta && (req.url === "/beta" || req.url.startsWith("/beta/"))
          ? reply.sendFile("index.html", resolve("dist-beta"))
          : reply.sendFile("index.html"),
    );
  app.addHook("onClose", async () => {
    await petitions.close();
    await Promise.allSettled(jobs);
    store.close();
  });
  return { app, store, auth, vault, aiConsent };
}

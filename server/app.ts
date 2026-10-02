import Fastify from "fastify";
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
import { syncSources, PetitionConnector, regionRegistry } from "./sources.js";
import { ingestDocument, removeDocument } from "./documents.js";
import { versionDiff, quantityRatio } from "./legal.js";
import { markdown, csv } from "./exports.js";
import { makeBackup, restoreBackup } from "./backup.js";
import { approveReviewBasis } from "./approval.js";
import { queryMcp } from "./mcp.js";
import { PetitionCollector } from "./petitions.js";
import { updatePublicBundle } from "./bundles.js";

export async function createApp(store = new Store(), test = false) {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const memoryAuth = test || process.env.SHE_EPHEMERAL_AUTH === "1";
  const vault = new Vault(store.dir, memoryAuth);
  const auth = new ChatGPTAuth(store, vault);
  const sessions = new Map<string, string>();
  let syncing = false;
  const jobs = new Set<Promise<unknown>>();
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
    if (
      req.url.startsWith("/api/") &&
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply.code(403).send({ error: "교차 사이트 요청 차단" });
    if (req.url.startsWith("/api/") && !req.url.startsWith("/api/bootstrap")) {
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
  app.setErrorHandler((err, req, reply) => {
    const message =
      err instanceof z.ZodError
        ? "입력 내용을 확인하세요: " +
          err.issues.map((i) => i.path.join(".") + " " + i.message).join(", ")
        : err instanceof Error
          ? err.message
          : "요청 실패";
    const code =
      err instanceof Error && "statusCode" in err
        ? Number(err.statusCode)
        : 400;
    reply.code(code >= 400 && code < 600 ? code : 400).send({ error: message });
  });
  app.get("/api/bootstrap", async (req, reply) => {
    let token = req.cookies.she_session;
    if (!token || !sessions.has(token)) {
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
  app.get("/api/status", async () => ({
    auth: await auth.status(),
    authStorage: memoryAuth ? "memory" : "windows-dpapi",
    lawConfigured: !!(
      process.env.LAW_OC || (await vault.read<any>("law"))?.lawOc
    ),
    sources: store.sources(),
    syncing,
    petition: new PetitionConnector(store).status(),
    rules: store.rules().length,
    notice: "현장·전국 법규 검증 전 개발 버전",
  }));
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
  app.post("/api/auth/chatgpt/logout", async () => {
    auth.logout();
    return { ok: true };
  });
  app.get("/api/auth/chatgpt/models", async () => auth.models());
  app.get("/auth/callback", async (req, reply) => {
    try {
      await auth.callback(req.query as Record<string, string>);
      return reply.redirect("/?connected=1");
    } catch (e) {
      return reply
        .code(400)
        .type("text/plain; charset=utf-8")
        .send(e instanceof Error ? e.message : "인증 실패");
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
    const input = ReviewRequestSchema.parse(req.body);
    const r = newReview(input);
    store.saveReview(r);
    const job = runReview(store, vault, auth, r);
    jobs.add(job);
    void job.then(
      () => jobs.delete(job),
      () => jobs.delete(job),
    );
    return reply.code(202).send({ id: r.id });
  });
  app.get("/api/reviews/:id", async (req, reply) => {
    const r = store.review((req.params as any).id);
    return r || reply.code(404).send({ error: "검토를 찾을 수 없습니다." });
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
      reply.raw.write("data: " + JSON.stringify(r) + "\n\n");
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
      .send(format === "csv" ? csv(r) : markdown(r));
  });
  app.get("/api/documents", async () =>
    store
      .all<DocumentRecord>("documents")
      .map((d) => ({ ...d, text: d.text.slice(0, 60000) })),
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
      .send(readFileSync(join(store.dir, "originals", d.id + d.type)));
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
    removeDocument(store, (req.params as any).id);
    return { ok: true };
  });
  app.get("/api/evidence", async () =>
    store.all<Evidence>("evidence").map((e) => ({ ...e, text: "" })),
  );
  app.get(
    "/api/evidence/:id",
    async (req, reply) =>
      store.get<Evidence>("evidence", (req.params as any).id) ||
      reply.code(404).send({ error: "근거 없음" }),
  );
  app.get("/api/evidence/:id/diff", async (req) => {
    const e = store.get<Evidence>("evidence", (req.params as any).id);
    if (!e) throw new Error("근거 없음");
    const other = store
      .all<Evidence>("evidence")
      .filter((x) => x.sourceId === e.sourceId && x.id !== e.id)
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
    if (!other)
      return { label: "비교 가능한 이전 전문이 없습니다.", changes: [] };
    return versionDiff(other, e);
  });
  app.post("/api/sync", async () => {
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
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 백업하세요.");
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="she-private-backup.json"',
      )
      .send(makeBackup(store));
  });
  app.post("/api/restore", { bodyLimit: 100 * 1024 * 1024 }, async (req) => {
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 복원하세요.");
    return restoreBackup(store, req.body);
  });
  app.post("/api/basis/approve", async (req) => {
    if (jobs.size) throw new Error("진행 중인 작업이 끝난 뒤 검증하세요.");
    return approveReviewBasis(store, req.body);
  });
  app.post("/api/public/update", async () => {
    if (jobs.size || syncing) throw new Error("작업이 끝난 뒤 갱신하세요.");
    return updatePublicBundle(store);
  });
  app.post("/api/shutdown", async () => {
    if (jobs.size || syncing)
      throw new Error("진행 중인 작업이 끝난 뒤 종료하세요.");
    setTimeout(() => {
      void app.close();
    }, 200);
    return { ok: true };
  });
  app.post("/api/petitions/connect", async (req) => petitions.start(req.body));
  app.post("/api/petitions/collect", async () => petitions.collect());
  app.post("/api/petitions/disconnect", async () => {
    await petitions.close();
    vault.remove("epeople-session");
    return { ok: true };
  });
  app.post("/api/mcp/query", async (req) => {
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
    await app.register(staticPlugin, { root: resolve("dist") });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "API 없음" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => {
    await petitions.close();
    await Promise.allSettled(jobs);
    store.close();
  });
  return { app, store, auth, vault };
}

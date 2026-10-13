import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { createApp } from "../server/app.js";
import { ingestDocument } from "../server/documents.js";
import {
  AiPendingSchema, BackupFileSchema, BetaReviewSchema, CollectionSchema, FeedbackFileSchema, KeySaveSchema,
  KeysSchema, NoticeSchema, ProbeSchema, RestoreResultSchema, SelfReviewSchema,
} from "../server/beta-contract-v8.js";
import { testStore, request } from "./helpers.js";

// v8 stage 3: every response the /beta/ screens read is parsed with a strict schema. A field rename, a removed
// field or an unexpected extra field in these responses fails here before it can break a screen.
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic refusal", { status: 403 }))); });
afterEach(() => { vi.unstubAllGlobals(); });
const HOST = "127.0.0.1:4317";

// Existing endpoints the beta screens also read (fields the screens use).
const Existing = {
  bootstrap: z.object({ csrf: z.string(), version: z.string(), regions: z.object({ asOf: z.string(), regions: z.array(z.object({ code: z.string(), name: z.string(), pilot: z.boolean() })) }) }),
  reviews: z.array(z.object({ id: z.string().uuid(), title: z.string(), createdAt: z.string(), status: z.string() })),
  created: z.object({ id: z.string().uuid() }),
  documents: z.array(z.object({ id: z.string().uuid(), name: z.string(), origin: z.string() })),
  consent: z.object({ enabled: z.boolean(), notice: z.string(), grantedAt: z.string().optional(), revokedAt: z.string().optional() }),
  sendLog: z.array(z.object({ at: z.string(), host: z.string(), method: z.string(), bytes: z.number(), digest: z.string(), outcome: z.enum(["sent", "blocked"]) })),
  retention: z.object({ autoDeleteDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]), choices: z.array(z.union([z.number(), z.null()])), log: z.array(z.object({ at: z.string(), kind: z.string(), ref: z.string(), reason: z.string() })) }),
  preview: z.object({ safetyManagerV7: z.boolean(), label: z.string() }),
  deleteAll: z.object({ deleted: z.number() }),
  error: z.object({ error: z.string() }),
};

it("V8-C01: 베타 화면이 읽는 모든 API 응답이 고정된 형식과 일치한다", async () => {
  const t = testStore();
  const { app } = await createApp(t.store, true);
  try {
    const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    Existing.bootstrap.parse(b.json());
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    const get = async (url: string) => (await app.inject({ url, headers })).json();
    const post = async (url: string, payload: unknown = {}) => (await app.inject({ method: "POST", url, headers, payload: payload as object })).json();

    const doc = await ingestDocument(t.store, "synthetic.txt", Buffer.from("가상 사업장 상시근로자 120명(합성)"));
    Existing.documents.parse(await get("/api/documents"));
    const { id } = Existing.created.parse(await post("/api/reviews", { ...request(), documentIds: [doc.id] }));
    for (let i = 0; i < 300 && t.store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    Existing.reviews.parse(await get("/api/reviews"));
    BetaReviewSchema.parse(await get(`/api/beta/reviews/${id}`));
    SelfReviewSchema.parse(await post(`/api/beta/reviews/${id}/self-review`, { note: "합성 자료로 사실과 근거를 다시 확인했습니다.", checks: { facts: true, basis: true, limits: true } }));
    expect(BetaReviewSchema.parse(await get(`/api/beta/reviews/${id}`)).selfReview).not.toBeNull();
    // Preview on: labelled candidates still match the same review contract.
    Existing.preview.parse(await post("/api/preview", { safetyManagerV7: true }));
    const { id: on } = Existing.created.parse(await post("/api/reviews", { ...request(), prompt: "가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다." }));
    for (let i = 0; i < 300 && t.store.review(on)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
    expect(BetaReviewSchema.parse(await get(`/api/beta/reviews/${on}`)).preview.on).toBe(true);
    Existing.preview.parse(await get("/api/preview"));

    KeysSchema.parse(await get("/api/beta/keys"));
    const key = "k".repeat(24) + "Synthetic";
    KeySaveSchema.parse(await post("/api/beta/keys/data-go-kr", { key }));
    KeySaveSchema.parse(await post("/api/beta/keys/address", { key }));
    KeySaveSchema.parse(await post("/api/beta/keys/law", { lawOc: "synthetic-oc" }));
    ProbeSchema.parse(await post("/api/beta/keys/law/probe"));
    Existing.error.parse(await post("/api/public-apis/msds/probe")); // synthetic refusal → { error }
    CollectionSchema.parse(await get("/api/beta/collection"));
    CollectionSchema.omit({ lastRunDate: true, lastMessage: true, lawConfigured: true, syncing: true }).parse(await post("/api/beta/collection", { dailyAuto: true }));

    NoticeSchema.parse(await get("/api/beta/notice"));
    FeedbackFileSchema.parse(await post("/api/beta/feedback", { category: "기타", message: "합성 의견", includeEnvironment: true }));
    Existing.consent.parse(await get("/api/ai/consent"));
    Existing.consent.parse(await post("/api/ai/consent", { enabled: true }));
    Existing.sendLog.parse(await get("/api/ai/send-log"));
    AiPendingSchema.parse(await get("/api/ai/pending"));
    Existing.retention.parse(await get("/api/retention"));

    const backup = await app.inject({ url: "/api/beta/backup", headers });
    BackupFileSchema.parse(backup.json());
    // Includes the preview-on review: its candidate ids must pass the backup schema (UUID issue ids).
    expect(RestoreResultSchema.parse(await post("/api/beta/restore", { file: backup.body })).reviews).toBe(2);
    Existing.deleteAll.parse(await post("/api/documents/delete-all", { confirm: "전체 삭제" }));
  } finally {
    await app.close();
    t.clean();
  }
}, 60000);

it("V8-W01: /beta/는 별도 입구로 열리고 기존 화면 입구(/)는 그대로이며, 둘 다 같은 보안 헤더를 쓴다", async () => {
  const t = testStore();
  const { app } = await createApp(t.store, true);
  try {
    const headers = { host: HOST };
    const root = await app.inject({ url: "/", headers }), beta = await app.inject({ url: "/beta/", headers });
    const deep = await app.inject({ url: "/beta/keys", headers }), old = await app.inject({ url: "/history", headers });
    expect(root.body).toBe(readFileSync("dist/index.html", "utf8"));
    expect(old.body).toBe(root.body);
    expect(beta.body).toBe(readFileSync("dist-beta/index.html", "utf8"));
    expect(deep.body).toBe(beta.body);
    for (const r of [root, beta, deep]) {
      expect(r.statusCode).toBe(200);
      expect(r.headers["content-security-policy"]).toContain("script-src 'self'");
      expect(r.headers["cache-control"]).toBe("no-store");
    }
    const asset = /src="(\/beta\/assets\/[^"]+\.js)"/.exec(beta.body)![1];
    expect((await app.inject({ url: asset, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/nothing", headers })).statusCode).toBe(401);
  } finally {
    await app.close();
    t.clean();
  }
});

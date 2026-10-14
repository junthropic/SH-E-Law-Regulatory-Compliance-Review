import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { Store, PUBLIC_IMPORT_NOTE } from "./store.js";
import { Vault } from "./vault.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { presentReview } from "../shared/result-language.js";
import { koreaDate } from "../shared/dates.js";
import { LawConnector } from "./sources.js";
import { normalizeServiceKey } from "./public-apis.js";
import { makeBackup, restoreBackup } from "./backup.js";
import { previewOn } from "./export-check-v8.js";
import { PREVIEW_LABEL } from "./preview-v8.js";
import { AI_NOTICE } from "./ai-consent-v8.js";
import { retentionDays } from "./retention-v8.js";
import { maskSensitive, safeMessage } from "./redact-v8.js";
import { isInstalled, publicLawNotice, UNINSTALL_NOTICE } from "./installed-v8.js";

// Evidence imported unchanged from the bundled public law data is left out of the encrypted backup: it ships with the app,
// and with it a typical backup was ~340 MB, over the 200 MB restore limit. Reviews keep their own copy of the evidence they used.
export function betaBackup(store: Store) {
  const b = makeBackup(store);
  return { ...b, evidence: b.evidence.filter((e: any) => !(e.verified === false && e.verificationNote === PUBLIC_IMPORT_NOTE)) };
}
import type { Collection, KeyGroup, Keys, Notice, SelfReview, BetaReview, FeedbackFile } from "./beta-contract-v8.js";

// v8 stage 3 server side of the /beta/ screens. Everything here is local: keys go to the Windows-protected
// vault, reviews and settings to the encrypted store, and feedback/backup leave only as files the user saves.
export const BETA_LABEL = "베타 — 검토 후보, 법적 판단 아님";
export const SELF_REVIEW_LABEL = "자가 검토 — 독립 검토 아님" as const;
export const MISSING_LABEL = "미연결 — 수집 안 됨";
const LAW_CHECK = "beta-law-check", DAILY = "collection.dailyAuto", selfKey = (id: string) => `self-review:${id}`;

type KeyOps = {
  saveKey(id: string, raw: string, replace: boolean): Promise<"unchanged" | "saved" | "replaced" | "conflict">;
  removeKey(id: string): void;
};
export type BetaDeps = {
  store: Store;
  vault: Vault;
  memory: boolean;
  keys: KeyOps;
  busy: () => boolean;
  syncing: () => boolean;
  startSync: () => Promise<unknown>;
  schedule: boolean;
};

export function selfReviewOf(store: Store, reviewId: string): SelfReview | null {
  return store.setting<SelfReview | null>(selfKey(reviewId), null);
}
// Export marks. Without a self review the export is returned unchanged.
export function markMarkdown(store: Store, reviewId: string, body: string) {
  const s = selfReviewOf(store, reviewId);
  return s ? body.replace(/^(# [^\n]*\n)/, `$1\n> ${SELF_REVIEW_LABEL} · ${s.at.slice(0, 10)} · ${s.note}\n`) : body;
}
export function markCsv(store: Store, reviewId: string, body: string) {
  const s = selfReviewOf(store, reviewId);
  if (!s) return body;
  const cell = (v: string) => '"' + (/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replaceAll('"', '""') + '"';
  return body.replace(/\n?$/, "\n") + ["자가 검토", SELF_REVIEW_LABEL, s.note, "", "", ""].map(cell).join(",") + "\n";
}

const dataGoKr = connectionServices.filter((s) => s.credential === "data-go-kr");
const address = connectionServices.filter((s) => s.credential === "address");

async function lawOc(vault: Vault) {
  return process.env.LAW_OC || (await vault.read<{ lawOc?: string }>("law"))?.lawOc;
}

// One step of optional daily collection: at most one start per Korean calendar day.
export async function dailyCollectionTick(store: Store, startSync: () => Promise<unknown>, now = new Date()) {
  const s = store.setting<{ enabled?: boolean; lastRunDate?: string }>(DAILY, {});
  const today = koreaDate(now);
  if (!s.enabled || s.lastRunDate === today) return false;
  let lastMessage = "자동 수집 시작";
  try {
    await startSync();
  } catch (e) {
    lastMessage = safeMessage(e instanceof Error ? e.message : "자동 수집을 시작하지 못했습니다.", store.dir);
  }
  store.put("settings", DAILY, { ...s, lastRunDate: today, lastMessage });
  store.audit("collection_daily", lastMessage);
  return true;
}

export function registerBetaV8(app: FastifyInstance, d: BetaDeps) {
  const { store, vault } = d;
  const checkOf = (id: string) => store.setting<Record<string, string>>(`public-api-${id}`, {});
  async function serviceRows(list: typeof connectionServices) {
    const rows = [];
    for (const s of list)
      rows.push({
        id: s.id, code: s.code, name: s.name, url: s.url, purpose: s.purpose, group: s.group,
        configured: !!(await vault.read<string>(`public-${s.id}`).catch(() => undefined)),
        check: checkOf(s.id),
      });
    return rows;
  }

  app.get("/api/beta/keys", async (): Promise<Keys> => {
    let lawConfigured = false, storageError = "";
    try {
      lawConfigured = !!(await lawOc(vault));
    } catch {
      storageError = "보호 저장소를 읽을 수 없습니다. 저장한 Windows 사용자로 실행하세요.";
    }
    const dg = await serviceRows(dataGoKr), ad = await serviceRows(address);
    const group = (g: Omit<KeyGroup, "configured" | "configuredCount" | "total">): KeyGroup => {
      const n = g.id === "law" ? (lawConfigured ? 1 : 0) : g.services.filter((s) => s.configured).length;
      return { ...g, configured: n > 0, configuredCount: n, total: g.id === "law" ? 1 : g.services.length };
    };
    return {
      storage: d.memory ? "memory" : "windows-dpapi",
      missingLabel: MISSING_LABEL,
      groups: [
        group({ id: "law", name: "법제처 Open API 인증값(OC)", required: true,
          why: "법령·행정규칙 원문 수집과 갱신에 필요합니다. 없으면 법령 근거가 필요한 판정은 보류됩니다.",
          issuerUrl: "https://open.law.go.kr/LSO/openApi/guideList.do", storageError, check: store.setting(LAW_CHECK, {}), services: [] }),
        group({ id: "data-go-kr", name: "공공데이터포털 일반 인증키", required: false,
          why: "MSDS·화학물질·사고사례 등 공공자료 조회에 씁니다. 키 하나로 아래 서비스를 함께 쓰지만, 포털에서 서비스마다 활용 신청이 따로 필요합니다.",
          issuerUrl: "https://www.data.go.kr/", storageError: "", check: {}, services: dg }),
        group({ id: "address", name: "도로명주소 검색 API 승인키", required: false,
          why: "사업장 주소 표준화와 관할지역 선택을 돕습니다.",
          issuerUrl: address[0].url, storageError: "", check: {}, services: ad }),
      ],
    };
  });

  app.post("/api/beta/keys/law", async (req) => {
    const { lawOc: value } = z.object({ lawOc: z.string().trim().min(1).max(200) }).strict().parse(req.body);
    await vault.write("law", { lawOc: value });
    if ((await vault.read<{ lawOc?: string }>("law"))?.lawOc !== value) throw new Error("저장한 인증값 재읽기 검증에 실패했습니다.");
    store.put("settings", LAW_CHECK, {});
    store.audit("law_oc_saved", "법제처 OC 저장");
    return { saved: 1, replaced: 0, unchanged: 0 };
  });
  app.delete("/api/beta/keys/law", async () => {
    vault.remove("law");
    store.put("settings", LAW_CHECK, {});
    return { removed: 1 };
  });
  app.post("/api/beta/keys/law/probe", async () => {
    const oc = await lawOc(vault);
    if (!oc) return { ok: false, message: "법제처 OC를 먼저 저장하세요." };
    let result: { ok: boolean; message: string; count?: number };
    try {
      const xml = await new LawConnector(oc).request("lawSearch.do", { target: "law", query: "산업안전보건법", display: "1" });
      const total = /<totalCnt>\s*(\d+)\s*<\/totalCnt>/.exec(xml);
      result = total
        ? { ok: true, message: "법제처 목록 응답 확인 (본문 수집은 별도)", count: Number(total[1]) }
        : { ok: false, message: "법제처 응답에서 검색 결과를 확인하지 못했습니다. OC 값과 Open API 활용 신청을 확인하세요." };
    } catch (e) {
      result = { ok: false, message: safeMessage(e instanceof Error ? e.message : "법제처 연결 확인 실패", store.dir) };
    }
    store.put("settings", LAW_CHECK, { state: result.ok ? "ok" : "failed", checkedAt: new Date().toISOString(), message: result.message });
    return result;
  });

  // One key for a whole group. A different key already saved for any service needs explicit replace.
  for (const [group, list] of [["data-go-kr", dataGoKr], ["address", address]] as const) {
    app.post(`/api/beta/keys/${group}`, async (req, reply) => {
      const b = z.object({ key: z.string().min(8).max(1500), replace: z.boolean().default(false) }).strict().parse(req.body);
      const counts = { saved: 0, replaced: 0, unchanged: 0 };
      const key = normalizeServiceKey(b.key);
      if (!b.replace) {
        let conflicts = 0;
        for (const s of list) {
          const previous = await vault.read<string>(`public-${s.id}`);
          if (previous && previous !== key) conflicts++;
        }
        if (conflicts)
          return reply.code(409).send({ error: `다른 키가 저장된 서비스가 ${conflicts}개 있습니다. 확인한 뒤 교체를 승인하세요.` });
      }
      for (const s of list) {
        const r = await d.keys.saveKey(s.id, key, b.replace);
        if (r === "conflict") return reply.code(409).send({ error: "다른 키가 저장된 서비스가 있습니다. 확인한 뒤 교체를 승인하세요." });
        if (r === "unchanged") counts.unchanged++;
        else if (r === "replaced") counts.replaced++;
        else counts.saved++;
      }
      return counts;
    });
    app.delete(`/api/beta/keys/${group}`, async () => {
      for (const s of list) d.keys.removeKey(s.id);
      return { removed: list.length };
    });
  }

  app.get("/api/beta/collection", async (): Promise<Collection> => {
    const s = store.setting<{ enabled?: boolean; lastRunDate?: string; lastMessage?: string }>(DAILY, {});
    let lawConfigured = false;
    try {
      lawConfigured = !!(await lawOc(vault));
    } catch {}
    return { dailyAuto: !!s.enabled, lastRunDate: s.lastRunDate ?? null, lastMessage: s.lastMessage ?? "", lawConfigured, syncing: d.syncing() };
  });
  app.post("/api/beta/collection", async (req) => {
    const { dailyAuto } = z.object({ dailyAuto: z.boolean() }).strict().parse(req.body);
    store.put("settings", DAILY, { ...store.setting(DAILY, {}), enabled: dailyAuto });
    store.audit("collection_daily_switch", dailyAuto ? "켜짐" : "꺼짐");
    return { dailyAuto };
  });
  if (d.schedule) {
    const tick = () => void dailyCollectionTick(store, d.startSync).catch(() => {});
    const first = setTimeout(tick, 60_000), timer = setInterval(tick, 30 * 60_000);
    first.unref?.();
    timer.unref?.();
    app.addHook("onClose", async () => {
      clearTimeout(first);
      clearInterval(timer);
    });
  }

  const reviewId = (params: unknown) => z.object({ id: z.string().uuid() }).parse(params).id;
  app.get("/api/beta/reviews/:id", async (req, reply): Promise<BetaReview> => {
    const r = store.review(reviewId(req.params));
    if (!r) return reply.code(404).send({ error: "검토를 찾을 수 없습니다." });
    return {
      review: presentReview(r) as unknown as BetaReview["review"],
      selfReview: selfReviewOf(store, r.id),
      preview: { on: previewOn(store), label: PREVIEW_LABEL },
      betaLabel: BETA_LABEL,
    };
  });
  // Self review: allowed for a one-person install, always labelled, never counted as independent review.
  // The independent-review paths (author ≠ reviewer) are not touched.
  app.post("/api/beta/reviews/:id/self-review", async (req, reply) => {
    const id = reviewId(req.params);
    const b = z.object({
      note: z.string().trim().min(15).max(2000),
      checks: z.object({ facts: z.literal(true), basis: z.literal(true), limits: z.literal(true) }).strict(),
    }).strict().parse(req.body);
    const r = store.review(id);
    if (!r) return reply.code(404).send({ error: "검토를 찾을 수 없습니다." });
    if (r.status !== "completed") throw new Error("완료된 검토만 자가 검토할 수 있습니다.");
    const record: SelfReview = { reviewId: id, at: new Date().toISOString(), note: b.note, label: SELF_REVIEW_LABEL, independent: false };
    store.put("settings", selfKey(id), record);
    store.audit("self_review", id);
    return record;
  });

  app.get("/api/beta/notice", async (): Promise<Notice> => ({
    betaLabel: BETA_LABEL,
    ai: AI_NOTICE,
    autoDeleteDays: retentionDays(store),
    items: [
      { title: "접속 범위", text: "앱 화면과 서버는 이 PC(127.0.0.1)에서만 열립니다. 다른 PC에서는 접속할 수 없습니다.", proof: ["V8-N01", "V8-N02"] },
      { title: "저장 암호화", text: "Windows에서는 검토 기록·업로드 원본·설정을 Windows 사용자 보호(DPAPI)로 감싼 키로 암호화해 저장합니다.", proof: ["V8-E01", "V8-E02", "V8-E03", "V8-E04", "V8-E05"] },
      { title: "외부 통신", text: "법령·공공 API(법제처, 공공데이터포털, 도로명주소 등 허용 목록)와 사용자가 켠 AI 서비스 외에는 통신하지 않습니다. 제작자 서버로 자료나 사용 기록을 보내는 기능은 없습니다.", proof: ["V8-O01", "V8-O02"] },
      { title: "AI 분석", text: AI_NOTICE + " 기본은 꺼져 있고, 켜더라도 보낼 내용을 화면에서 확인해 승인한 건만 한 번 전송합니다. 전송 기록에는 시각·대상·크기만 남고 내용은 남지 않습니다.", proof: ["V8-A01", "V8-A02", "V8-A03"] },
      { title: "보존·삭제", text: "기본은 계속 보관합니다. 30·90·365일 자동 삭제를 고를 수 있고, 언제든 영구 삭제할 수 있습니다. 삭제 기록에는 본문이 남지 않습니다.", proof: ["V8-R01"] },
      { title: "오류 기록", text: "오류 메시지에는 본문·키·파일 경로를 넣지 않습니다.", proof: ["V8-L01", "V8-L02"] },
      { title: "암호화 백업", text: "이 화면의 백업 파일은 암호화되며, 만든 Windows 사용자 계정의 보호 키로 엽니다. 다른 사용자나 다른 PC에서의 복원은 확인하지 않았고 되지 않을 수 있습니다. 백업에는 인증키·설정·감사 기록이 들어가지 않습니다. 앱에 함께 들어 있는 공개 법령 초기 자료도 넣지 않습니다(검토 결과에 쓰인 근거 조문은 검토 기록과 함께 백업됩니다).", proof: ["V8-K01", "V8-K02", "V8-M05"] },
      { title: "기존 화면의 백업", text: "기존 화면(연결 설정)의 JSON 백업은 암호화되지 않은 파일입니다. 회사 자료는 이 화면의 암호화 백업을 쓰세요.", proof: ["V8-K03"] },
      { title: "공개 법령 자료 갱신 주기", text: publicLawNotice(store.setting<{ publishedAt?: string } | null>("public-bundle-status", null)?.publishedAt), proof: ["V8-M10", "V8-M01"] },
      // Installed (MSIX) build only: Windows removes the app's data folder on uninstall and cannot ask first.
      ...(isInstalled() ? [{ title: "앱 제거", text: UNINSTALL_NOTICE + " 같은 Windows 사용자로 다시 설치한 뒤 백업 가져오기로 복원되는 것을 설치 시험에서 확인했습니다.", proof: ["V8-M04"] }] : []),
    ],
  }));

  app.post("/api/beta/feedback", async (req): Promise<FeedbackFile> => {
    const b = z.object({
      category: z.enum(["오류", "개선 제안", "법령·판정 내용", "기타"]),
      message: z.string().trim().min(1).max(4000),
      includeEnvironment: z.boolean(),
    }).strict().parse(req.body);
    return {
      format: "she-feedback-v8",
      createdAt: new Date().toISOString(),
      category: b.category,
      message: maskSensitive(b.message, store.dir),
      environment: b.includeEnvironment
        ? { appVersion: "0.1.0", platform: process.platform, previewSwitch: previewOn(store), aiEnabled: !!store.setting<{ enabled?: boolean }>("ai-consent", {}).enabled }
        : null,
      notice: "이 파일은 자동으로 전송되지 않습니다. 직접 첨부해 보낼 때만 전달됩니다. 검토 내용·업로드 자료·인증키는 들어 있지 않습니다.",
    };
  });

  // Encrypted backup: a fresh AES-256-GCM key per file, wrapped by the vault (DPAPI current user on Windows).
  app.get("/api/beta/backup", async (_req, reply) => {
    if (d.busy()) return reply.code(409).send({ error: "진행 중인 작업이 끝난 뒤 백업하세요." });
    const key = randomBytes(32), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from("she-backup-v8"));
    // Compressed before encryption (law texts shrink several-fold); restore accepts compressed and uncompressed payloads.
    const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(betaBackup(store)), "utf8"))), c.final()]);
    const file = {
      format: "she-backup-v8" as const,
      createdAt: new Date().toISOString(),
      protection: d.memory ? "session-memory" as const : "windows-dpapi-current-user" as const,
      note: "SH·E 암호화 백업. 만든 Windows 사용자 계정에서 가져오기로 복원합니다.",
      wrappedKey: await vault.protect(key.toString("base64")),
      iv: iv.toString("base64"),
      tag: c.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    key.fill(0);
    store.audit("backup_export_v8", "암호화 백업 내보내기");
    return reply.header("Content-Disposition", `attachment; filename="she-backup-${koreaDate()}.json"`).send(file);
  });
  app.post("/api/beta/restore", { bodyLimit: 200 * 1024 * 1024 }, async (req, reply) => {
    if (d.busy()) return reply.code(409).send({ error: "진행 중인 작업이 끝난 뒤 복원하세요." });
    const { file } = z.object({ file: z.string().min(2) }).strict().parse(req.body);
    let parsed;
    try {
      parsed = z.object({
        format: z.literal("she-backup-v8"), createdAt: z.string(), protection: z.string(), note: z.string(),
        wrappedKey: z.string(), iv: z.string(), tag: z.string(), data: z.string(),
      }).strict().parse(JSON.parse(file));
    } catch {
      return reply.code(400).send({ error: "SH·E 암호화 백업 파일이 아닙니다." });
    }
    let key: Buffer;
    try {
      key = Buffer.from(await vault.unprotect(parsed.wrappedKey), "base64");
    } catch {
      return reply.code(400).send({ error: "이 백업은 만든 Windows 사용자 계정에서만 열 수 있습니다. 백업을 만든 PC와 사용자로 실행하세요." });
    }
    let plain: string;
    try {
      const dc = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
      dc.setAAD(Buffer.from("she-backup-v8"));
      dc.setAuthTag(Buffer.from(parsed.tag, "base64"));
      const bytes = Buffer.concat([dc.update(Buffer.from(parsed.data, "base64")), dc.final()]);
      plain = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }) : bytes).toString("utf8");
    } catch {
      return reply.code(400).send({ error: "백업 파일이 손상되었거나 변경되었습니다." });
    } finally {
      key.fill(0);
    }
    const backup = JSON.parse(plain) as { reviews: unknown[]; documents: unknown[] };
    restoreBackup(store, backup);
    store.audit("backup_restore_v8", "암호화 백업 가져오기");
    return { ok: true as const, reviews: backup.reviews.length, documents: backup.documents.length };
  });
}


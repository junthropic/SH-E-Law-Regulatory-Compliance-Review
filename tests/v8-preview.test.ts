import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { StorageCipher } from "../server/storage-crypto-v8.js";
import { PREVIEW_LABEL, previewArticle } from "../server/preview-v8.js";
import { PREVIEW_SWITCH } from "../server/export-check-v8.js";
import { safetyManagerPolicies } from "../server/safety-manager-v7.js";
import { testStore, request } from "./helpers.js";

// No real network: every outbound request gets a synthetic refusal.
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response("synthetic refusal", { status: 403 }))); });
afterEach(() => { vi.unstubAllGlobals(); });
const HOST = "127.0.0.1:4317";
const ASK = "가상 사업장 산업안전보건법 안전관리자 선임(인원) 검토를 요청합니다.";
async function run(store: Store, prompt = ASK) {
  const { app } = await createApp(store, true);
  const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
  const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
  const created = await app.inject({ method: "POST", url: "/api/reviews", headers, payload: { ...request(), prompt } });
  expect(created.statusCode).toBe(202);
  const id = created.json().id;
  for (let i = 0; i < 200 && store.review(id)?.status === "running"; i++) await new Promise((r) => setTimeout(r, 50));
  const md = (await app.inject({ url: `/api/reviews/${id}/export?format=markdown`, headers })).body;
  const csv = (await app.inject({ url: `/api/reviews/${id}/export?format=csv`, headers })).body;
  return { app, headers, id, review: store.review(id)!, md, csv };
}
// Ids (review and generated issue UUIDs) and clock values differ between two runs; everything else must be byte-identical.
const normalize = (s: string, id: string) =>
  s.split(id).join("<id>").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<t>").replace(/\d{4}\. ?\d{1,2}\. ?\d{1,2}\.? [^\n,|]*/g, "<t>");

it("V8-P01: 스위치가 없거나 꺼져 있으면 검토 결과·Markdown·CSV export가 바이트 단위로 같고 미리보기 표시가 없다", async () => {
  const a = testStore(), b = testStore();
  b.store.put("settings", PREVIEW_SWITCH, false);
  const x = await run(a.store), y = await run(b.store);
  try {
    const strip = (r: typeof x.review) => normalize(JSON.stringify({ ...r, id: "", createdAt: "", updatedAt: "" }), r.id);
    expect(strip(y.review)).toBe(strip(x.review));
    expect(normalize(y.md, y.id)).toBe(normalize(x.md, x.id));
    expect(normalize(y.csv, y.id)).toBe(normalize(x.csv, x.id));
    expect(x.md).not.toContain(PREVIEW_LABEL);
    expect(x.review.issues.some((i) => i.ruleId?.startsWith("safety_manager."))).toBe(false);
  } finally { await x.app.close(); await y.app.close(); a.clean(); b.clean(); }
}, 30000);

it("V8-P02: 스위치를 켜면 안전관리자 질문은 산업안전보건법 후보로 가고 위험물 후보가 섞이지 않으며, 모든 결과에 라벨·법률 기준일·근거 조문이 붙는다", async () => {
  const f = testStore();
  f.store.put("settings", PREVIEW_SWITCH, true);
  const x = await run(f.store);
  try {
    const issues = x.review.issues;
    expect(issues.map((i) => i.title)).toContain("안전관리자 선임(인원)");
    expect(issues.some((i) => i.title === "안전관리자 재선임" || /^hazmat/.test(i.ruleId ?? ""))).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
    for (const i of issues) {
      expect(i.conclusion.startsWith(`[${PREVIEW_LABEL}]`)).toBe(true);
      expect(i.conditions).toContain(PREVIEW_LABEL);
      expect(i.conditions).toContain("법률 기준일 2026-10-08");
      expect(i.conditions.some((c) => c.startsWith("근거 조문: "))).toBe(true);
      expect(i.category).not.toBe("clear_risk");
    }
    expect(issues.find((i) => i.ruleId === "safety_manager.appointment")!.conditions).toContain("근거 조문: " + previewArticle("safety_manager.appointment"));
    expect(x.md).toContain(PREVIEW_LABEL);
    expect(x.md).toContain("법률 기준일 2026-10-08");
  } finally { await x.app.close(); f.clean(); }
}, 30000);

it("V8-P03: 모든 안전관리자 의무와 교육 의무는 근거 조문이 정해져 있고, 기본 의무는 법률 이름을 붙인다", () => {
  for (const p of safetyManagerPolicies) expect(previewArticle(p.id)).toMatch(/^산업안전보건법/);
  for (const id of ["training.periodic", "training.recruitment", "training.work_change", "training.special", "training.supervisor"]) expect(previewArticle(id)).toMatch(/^산업안전보건법 제29조/);
  expect(previewArticle("hazmat_manager.replacement")).toBe("위험물안전관리법 제15조제2항");
  expect(previewArticle("hazmat_check.record_retention")).toMatch(/^위험물안전관리법 시행규칙/);
  expect(previewArticle("risk_assessment.evaluation")).toMatch(/^산업안전보건법 제36조/);
  expect(previewArticle("environment.waste_contractor")).toMatch(/^폐기물관리법/);
  expect(previewArticle("unknown.duty")).toContain("미확정");
});

it("V8-P04: 스위치를 켜도 암호화 저장은 유지되고 평가용 임시 공간은 디스크에 남지 않는다", async () => {
  const plain = testStore(); plain.store.close();
  const store = new Store(plain.store.dir, { cipher: new StorageCipher(randomBytes(32)) });
  store.put("settings", PREVIEW_SWITCH, true);
  const secret = "합성기밀V8" + randomUUID().replaceAll("-", "");
  const scratch = () => readdirSync(tmpdir()).filter((n) => n.startsWith("she-preview-")).length;
  const before = scratch();
  const x = await run(store, `${ASK} 메모 ${secret}`);
  try {
    expect(x.review.issues.length).toBeGreaterThan(0);
    const walk = (d: string, out: string[] = []): string[] => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
    expect(walk(store.dir).filter((p) => readFileSync(p).includes(Buffer.from(secret)))).toEqual([]);
    expect(scratch()).toBeLessThanOrEqual(before);
  } finally { await x.app.close(); plain.clean(); }
}, 30000);

it("V8-P05: 스위치는 기본 꺼짐이고 API로 켜고 끄며 변경을 감사 기록에 남긴다", async () => {
  const f = testStore();
  const { app } = await createApp(f.store, true);
  try {
    const b = await app.inject({ url: "/api/bootstrap", headers: { host: HOST } });
    const headers = { host: HOST, cookie: `${b.cookies[0].name}=${b.cookies[0].value}`, "x-csrf-token": b.json().csrf };
    expect((await app.inject({ url: "/api/preview", headers })).json()).toEqual({ safetyManagerV7: false, label: PREVIEW_LABEL });
    expect((await app.inject({ method: "POST", url: "/api/preview", headers, payload: { safetyManagerV7: true } })).json().safetyManagerV7).toBe(true);
    expect((await app.inject({ url: "/api/preview", headers })).json().safetyManagerV7).toBe(true);
    expect((await app.inject({ method: "POST", url: "/api/preview", headers, payload: { safetyManagerV7: "yes" } })).statusCode).toBe(400);
    expect((f.store.db.prepare("SELECT count(*) n FROM audit WHERE action='preview_switch'").get() as { n: number }).n).toBe(1);
  } finally { await app.close(); f.clean(); }
});

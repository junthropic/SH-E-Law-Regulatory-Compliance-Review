import { randomUUID } from "node:crypto";
import { Store, sha } from "./store.js";

// v8 AI transmission consent. AI is off by default. Turning it on records consent; every payload
// that carries company material must be previewed and approved once before it can leave the PC.
// The send log keeps when, where, size and a hash — never the content.
export const AI_NOTICE =
  "AI 분석을 켜면 입력 내용이 선택한 AI 서비스로 전송되며, 학습·보관 여부는 해당 서비스 정책을 따릅니다.";
const PREVIEW_TTL_MS = 10 * 60 * 1000;
type Consent = { enabled: boolean; grantedAt?: string; revokedAt?: string; notice: string };
type Preview = { id: string; digest: string; bytes: number; createdAt: number; approved: boolean };

export class AiConsent {
  private previews = new Map<string, Preview>();
  constructor(private store: Store, private now: () => number = Date.now) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS v8_ai_send_log(id INTEGER PRIMARY KEY, at TEXT NOT NULL, host TEXT NOT NULL,
      method TEXT NOT NULL, bytes INTEGER NOT NULL, digest TEXT NOT NULL, outcome TEXT NOT NULL)`);
  }
  status(): Consent {
    return { enabled: false, notice: AI_NOTICE, ...this.store.setting<Partial<Consent>>("ai-consent", {}) } as Consent;
  }
  enable() {
    const next = { ...this.status(), enabled: true, grantedAt: new Date(this.now()).toISOString(), notice: AI_NOTICE };
    this.store.put("settings", "ai-consent", next);
    this.store.audit("ai_consent", "AI 전송 동의");
    return next;
  }
  revoke() {
    const next = { ...this.status(), enabled: false, revokedAt: new Date(this.now()).toISOString() };
    this.store.put("settings", "ai-consent", next);
    this.previews.clear();
    this.store.audit("ai_consent", "AI 전송 동의 철회");
    return next;
  }
  // Shows exactly what would be sent. Nothing is approved yet.
  preview(payload: string) {
    if (!this.status().enabled) throw new Error("AI 분석이 꺼져 있습니다. 먼저 AI 전송에 동의하세요.");
    const p: Preview = { id: randomUUID(), digest: sha(payload), bytes: Buffer.byteLength(payload), createdAt: this.now(), approved: false };
    this.previews.set(p.id, p);
    return { previewId: p.id, bytes: p.bytes, payload, notice: AI_NOTICE };
  }
  approve(previewId: string) {
    const p = this.previews.get(previewId);
    if (!this.status().enabled || !p || this.now() - p.createdAt > PREVIEW_TTL_MS)
      throw new Error("미리보기가 없거나 만료되었습니다. 다시 미리보기 하세요.");
    p.approved = true;
    return { approved: true };
  }
  // Called by the egress guard for every request to an AI host.
  authorize(url: URL, method: string, body: string | undefined) {
    const enabled = this.status().enabled;
    let ok = false;
    if (!enabled || body?.startsWith("\u0000")) ok = false; // off, or a binary/raw-socket body that cannot be matched to a preview
    else if (body === undefined || url.hostname === "auth.openai.com") ok = true; // sign-in and model list carry no company material
    else {
      const digest = sha(body);
      const match = [...this.previews.values()].find((p) => p.approved && p.digest === digest && this.now() - p.createdAt <= PREVIEW_TTL_MS);
      if (match) { this.previews.delete(match.id); ok = true; } // one approval, one send
    }
    this.store.db.prepare("INSERT INTO v8_ai_send_log(at,host,method,bytes,digest,outcome) VALUES(?,?,?,?,?,?)")
      .run(new Date(this.now()).toISOString(), url.hostname, method, body ? Buffer.byteLength(body) : 0, body ? sha(body) : "", ok ? "sent" : "blocked");
    return ok;
  }
  log() {
    return this.store.db.prepare("SELECT at,host,method,bytes,digest,outcome FROM v8_ai_send_log ORDER BY id").all();
  }
}

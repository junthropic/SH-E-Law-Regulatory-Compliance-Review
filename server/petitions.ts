import { z } from "zod";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { Store } from "./store.js";
import { Vault } from "./vault.js";
import { ingestDocument } from "./documents.js";

const officialUrl = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      u.hostname === "www.epeople.go.kr" &&
      !u.username &&
      !u.password
    );
  });
export const PetitionConfigSchema = z.object({
  permissionReference: z.string().min(10),
  permissionExpiresAt: z.string().datetime(),
  approvedBy: z.string().min(2),
  permittedScope: z.enum(["public", "own"]),
  loginUrl: officialUrl,
  listUrl: officialUrl,
  selectorVersion: z.string().min(1),
  selectorsVerifiedAt: z.string().datetime(),
  selectors: z.object({
    loggedIn: z.string().min(1),
    items: z.string().min(1),
    next: z.string().min(1),
    title: z.string().min(1),
    question: z.string().min(1),
    answer: z.string().min(1),
    agency: z.string().min(1),
    responseDate: z.string().min(1),
  }),
  maxPages: z.number().int().min(1).max(20),
  delayMs: z.number().int().min(2000).max(30000),
});
export type PetitionConfig = z.infer<typeof PetitionConfigSchema>;
export type PetitionItem = {
  title: string;
  question: string;
  answer: string;
  agency: string;
  responseDate: string;
  url: string;
};
export interface PetitionDriver {
  open(config: PetitionConfig, state?: unknown): Promise<void>;
  loggedIn(): Promise<boolean>;
  items(): Promise<PetitionItem[]>;
  next(): Promise<boolean>;
  state(): Promise<unknown>;
  close(): Promise<void>;
}

/** Site selectors must be approved and verified after written permission; no guessed default selectors. */
export class EdgePetitionDriver implements PetitionDriver {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private config?: PetitionConfig;
  private listOpened = false;
  async open(config: PetitionConfig, state?: unknown) {
    this.config = config;
    this.browser = await chromium.launch({
      channel: "msedge",
      headless: false,
    });
    this.context = await this.browser.newContext({
      storageState: state as any,
    });
    // Restrict all browser requests to the specifically approved site. Additional SSO domains need a separately reviewed adapter.
    await this.context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return u.protocol === "https:" && u.hostname === "www.epeople.go.kr"
        ? route.continue()
        : route.abort();
    });
    this.page = await this.context.newPage();
    await this.page.goto(
      config.permittedScope === "own" ? config.loginUrl : config.listUrl,
      { waitUntil: "domcontentloaded", timeout: 20000 },
    );
  }
  async loggedIn() {
    if (!this.page || !this.config) return false;
    if (this.config.permittedScope === "public") return true;
    return this.page.locator(this.config.selectors.loggedIn).isVisible();
  }
  async items() {
    const p = this.page!,
      c = this.config!;
    if (!this.listOpened) {
      await p.goto(c.listUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      this.listOpened = true;
    }
    const links = await p
      .locator(c.selectors.items)
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href));
    if (links.length > 100)
      throw new Error("목록 선택자 또는 페이지 크기 재검증 필요");
    const rows: PetitionItem[] = [];
    for (const url of links) {
      officialUrl.parse(url);
      const detail = await this.context!.newPage();
      try {
        await detail.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        const value = async (k: keyof PetitionConfig["selectors"]) =>
          (
            await detail.locator(c.selectors[k]).innerText({ timeout: 10000 })
          ).trim();
        rows.push({
          title: await value("title"),
          question: await value("question"),
          answer: await value("answer"),
          agency: await value("agency"),
          responseDate: await value("responseDate"),
          url,
        });
      } finally {
        await detail.close();
      }
      await new Promise((r) => setTimeout(r, c.delayMs));
    }
    return rows;
  }
  async next() {
    const next = this.page!.locator(this.config!.selectors.next);
    if (
      !(await next.count()) ||
      !(await next.isVisible()) ||
      (await next.isDisabled())
    )
      return false;
    await next.click();
    await this.page!.waitForLoadState("domcontentloaded");
    return true;
  }
  async state() {
    return this.context!.storageState();
  }
  async close() {
    await this.browser?.close();
    this.browser = undefined;
    this.listOpened = false;
  }
}
export class PetitionCollector {
  private config?: PetitionConfig;
  private active = false;
  constructor(
    private store: Store,
    private vault: Vault,
    private driver: PetitionDriver = new EdgePetitionDriver(),
  ) {}
  async start(input: unknown) {
    if (this.active) throw new Error("이미 민원 연결 중입니다.");
    const c = PetitionConfigSchema.parse(input);
    if (Date.parse(c.permissionExpiresAt) <= Date.now())
      throw new Error("운영기관 승낙 유효기간이 만료되었습니다.");
    if (
      Date.now() - Date.parse(c.selectorsVerifiedAt) > 30 * 86400000 ||
      Date.parse(c.selectorsVerifiedAt) > Date.now() + 60000
    )
      throw new Error("사이트 구조를 다시 검증해야 합니다.");
    this.config = c;
    this.active = true;
    try {
      await this.driver.open(c, await this.vault.read("epeople-session"));
      this.store.audit("petition_session_start", c.permissionReference);
    } catch (e) {
      await this.close();
      throw e;
    }
    return {
      loginRequired: c.permittedScope === "own",
      message:
        "직접 로그인한 뒤 수집 버튼을 누르세요. 인증서·CAPTCHA를 자동 처리하지 않습니다.",
    };
  }
  async collect() {
    const c = this.config;
    if (!c || !this.active)
      throw new Error("승낙과 연결 설정을 먼저 확인하세요.");
    if (Date.parse(c.permissionExpiresAt) <= Date.now())
      throw new Error("운영기관 승낙이 만료되었습니다.");
    if (!(await this.driver.loggedIn()))
      throw new Error("본인 계정 로그인을 직접 완료하세요.");
    let imported = 0;
    const seen = new Set<string>();
    let truncated = false;
    try {
      for (let page = 0; page < c.maxPages; page++) {
        const rows = await this.driver.items();
        if (!rows.length && page === 0)
          throw new Error("목록 없음 또는 사이트 구조 변경: 재검증 필요");
        for (const row of rows) {
          officialUrl.parse(row.url);
          if (seen.has(row.url))
            throw new Error("같은 페이지가 반복됩니다. 선택자를 재검증하세요.");
          seen.add(row.url);
          if (!row.answer.trim()) throw new Error("회신 본문 누락");
          const text = `제목: ${row.title}\n기관: ${row.agency}\n회신일: ${row.responseDate}\n출처: ${row.url}\n\n질의\n${row.question}\n\n회신\n${row.answer}`;
          const doc = await ingestDocument(
            this.store,
            row.title.replace(/[<>:"/\\|?*]/g, "_").slice(0, 100) + ".txt",
            Buffer.from(text),
          );
          this.store.put("documents", doc.id, {
            ...doc,
            agency: row.agency.slice(0, 150),
            responseDate: /^\d{4}-\d{2}-\d{2}$/.test(row.responseDate)
              ? row.responseDate
              : "",
            confirmed: false,
          });
          imported++;
        }
        const hasNext = await this.driver.next();
        if (!hasNext) break;
        if (page === c.maxPages - 1) truncated = true;
        await new Promise((r) => setTimeout(r, c.delayMs));
      }
      await this.vault.write("epeople-session", await this.driver.state());
      this.store.audit(
        "petition_import",
        JSON.stringify({
          imported,
          truncated,
          permission: c.permissionReference,
        }),
      );
      return { imported, truncated };
    } finally {
      await this.close();
    }
  }
  async close() {
    this.active = false;
    this.config = undefined;
    await this.driver.close();
  }
}

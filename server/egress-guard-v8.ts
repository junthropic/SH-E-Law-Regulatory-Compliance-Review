import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

// v8 outbound allow-list for the installed app. Only these destinations may be contacted:
//  - public law and public-data APIs (the user's own keys),
//  - the AI service, and only for a payload the user previewed and approved (see ai-consent-v8.ts).
// Anything else, including the maker's own hosts, is refused before a connection is opened.
export const PUBLIC_EGRESS = [
  /(^|\.)law\.go\.kr$/,
  /^apis\.data\.go\.kr$/,
  /^www\.data\.go\.kr$/,
  /^business\.juso\.go\.kr$/,
  /^www\.epeople\.go\.kr$/,
  /^www\.moel\.go\.kr$/,
  /^www\.gg\.go\.kr$/,
  /^www\.hscity\.go\.kr$/,
];
export const AI_EGRESS = [/^api\.openai\.com$/, /^auth\.openai\.com$/];
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type EgressCategory = "loopback" | "public" | "ai" | "blocked";
export type EgressRecord = { at: string; host: string; method: string; category: EgressCategory; allowed: boolean };
export class EgressBlocked extends Error {
  constructor(host: string) {
    super("허용 목록에 없는 외부 주소로는 연결하지 않습니다: " + host);
    this.name = "EgressBlocked";
  }
}
export function classifyHost(host: string): EgressCategory {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (LOOPBACK.has(h)) return "loopback";
  if (PUBLIC_EGRESS.some((r) => r.test(h))) return "public";
  if (AI_EGRESS.some((r) => r.test(h))) return "ai";
  return "blocked";
}
// Decides whether an AI request may leave; the consent module supplies it.
export type AiAuthorizer = (url: URL, method: string, body: string | undefined) => boolean;

export class EgressGuard {
  readonly records: EgressRecord[] = [];
  private restore: (() => void)[] = [];
  constructor(private ai: AiAuthorizer = () => false) {}
  check(url: URL, method: string, body?: string) {
    const category = classifyHost(url.hostname);
    const allowed =
      category === "loopback" ||
      (category === "public" && url.protocol === "https:") ||
      (category === "ai" && url.protocol === "https:" && this.ai(url, method, body));
    this.records.push({ at: new Date().toISOString(), host: url.hostname, method, category, allowed });
    if (this.records.length > 1000) this.records.splice(0, this.records.length - 1000);
    if (!allowed) throw new EgressBlocked(url.hostname);
  }
  wrapFetch(original: typeof fetch): typeof fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const raw = init?.body ?? (input instanceof Request && input.body ? await input.clone().text() : undefined);
      this.check(url, method, typeof raw === "string" ? raw : raw === undefined || raw === null ? undefined : "\u0000binary");
      return original(input as never, init);
    }) as typeof fetch;
  }
  private wrapRequest(mod: typeof http | typeof https, name: "request" | "get", protocol: string) {
    const original = mod[name] as (...args: unknown[]) => http.ClientRequest;
    const guard = this;
    (mod as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      const first = args[0], options = (first instanceof URL || typeof first === "string" ? args[1] : first) as
        { hostname?: string; host?: string; method?: string; protocol?: string } | undefined;
      const url = first instanceof URL ? first : typeof first === "string" ? new URL(first)
        : new URL(`${options?.protocol || protocol}//${(options?.hostname || options?.host || "localhost").replace(/:\d+$/, "")}`);
      // Raw sockets never carry an approved AI payload: AI hosts are only reachable through fetch.
      guard.check(url, String(options?.method || (name === "get" ? "GET" : "GET")).toUpperCase(),
        classifyHost(url.hostname) === "ai" ? "\u0000raw" : undefined);
      return original.apply(this, args);
    };
    this.restore.push(() => { (mod as unknown as Record<string, unknown>)[name] = original; });
  }
  install() {
    const original = globalThis.fetch;
    globalThis.fetch = this.wrapFetch(original);
    this.restore.push(() => { globalThis.fetch = original; });
    this.wrapRequest(http, "request", "http:");
    this.wrapRequest(http, "get", "http:");
    this.wrapRequest(https, "request", "https:");
    this.wrapRequest(https, "get", "https:");
    syncBuiltinESMExports();
    return this;
  }
  uninstall() {
    for (const r of this.restore.splice(0).reverse()) r();
    syncBuiltinESMExports();
  }
}

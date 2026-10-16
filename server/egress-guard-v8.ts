import http from "node:http";
import https from "node:https";
import net from "node:net";
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
  // www.epeople.go.kr removed (2026-10-14): no server request goes there; 국민신문고 collection ran in a separate browser and is off in the installed build.
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

// The text the AI consent compares with an approved preview. A URLSearchParams body is sent as exactly its
// toString() (application/x-www-form-urlencoded), so it is read as that text (security review F-06: the OAuth token
// exchange, refresh and revoke send one). Streams, blobs and bytes stay unreadable ("\0binary") and are refused for AI.
export function bodyText(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") return raw;
  if (raw instanceof URLSearchParams) return raw.toString();
  return "\u0000binary";
}

// F-05: fetch follows redirects inside the guard, one hop at a time, so every Location is checked like the first URL
// (allow-list, https, and for AI hosts the consent with the body that hop would send). Same hop limit as the fetch standard.
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
// Request-body headers dropped when a redirect turns the request into a GET (fetch standard, HTTP-redirect fetch).
const BODY_HEADERS = ["content-encoding", "content-language", "content-location", "content-type", "content-length"];
// Credentials never travel to another origin on a redirect (as undici does).
const CROSS_ORIGIN_DROP = ["authorization", "proxy-authorization", "cookie", "host"];

type RequestOptions = { hostname?: unknown; host?: unknown; protocol?: unknown; method?: unknown; socketPath?: unknown };
// Node's own test for a URL-like first argument (lib/internal/url.js isURL).
function urlArgument(v: unknown): URL | undefined {
  if (typeof v === "string") return new URL(v);
  if (v instanceof URL) return v;
  const o = v as { href?: unknown; protocol?: unknown; auth?: unknown; path?: unknown } | null;
  if (o && typeof o === "object" && o.href && o.protocol && o.auth === undefined && o.path === undefined) return new URL(String(o.href));
  return undefined;
}
// The host Node will actually contact for http(s).request/get: the url argument merged with the options object
// (options win), then hostname || host || "localhost", the same order as Node's ClientRequest.
export function effectiveRequestTarget(args: unknown[], defaultProtocol: string) {
  const url = urlArgument(args[0]);
  const second = url ? args[1] : args[0];
  const options = (second && typeof second === "object" ? second : {}) as RequestOptions;
  const merged: RequestOptions = { ...(url ? { protocol: url.protocol, hostname: url.hostname.replace(/^\[|\]$/g, "") } : {}), ...options };
  const protocol = typeof merged.protocol === "string" && merged.protocol ? merged.protocol : defaultProtocol;
  // A local pipe (socketPath) never leaves the PC.
  const host = typeof merged.socketPath === "string" && merged.socketPath ? "localhost"
    : (typeof merged.hostname === "string" && merged.hostname) || (typeof merged.host === "string" && merged.host) || "localhost";
  // "name:port" in host is reduced to the name; an IPv6 literal keeps its colons.
  const bare = /^[^:]+:\d+$/.test(host) ? host.replace(/:\d+$/, "") : host.replace(/^\[|\]$/g, "");
  return { protocol, host: bare, method: String(merged.method || "GET").toUpperCase() };
}

export class EgressGuard {
  readonly records: EgressRecord[] = [];
  private restore: (() => void)[] = [];
  constructor(private ai: AiAuthorizer = () => false) {}
  private record(host: string, method: string, category: EgressCategory, allowed: boolean) {
    this.records.push({ at: new Date().toISOString(), host, method, category, allowed });
    if (this.records.length > 1000) this.records.splice(0, this.records.length - 1000);
  }
  check(url: URL, method: string, body?: string) {
    const category = classifyHost(url.hostname);
    const allowed =
      category === "loopback" ||
      (category === "public" && url.protocol === "https:") ||
      (category === "ai" && url.protocol === "https:" && this.ai(url, method, body));
    this.record(url.hostname, method, category, allowed);
    if (!allowed) throw new EgressBlocked(url.hostname);
  }
  wrapFetch(original: typeof fetch): typeof fetch {
    const guard = this;
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const isRequest = input instanceof Request;
      let url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      let method = (init?.method || (isRequest ? input.method : "GET")).toUpperCase();
      const raw = init?.body ?? (isRequest && input.body ? await input.clone().text() : undefined);
      let body = bodyText(raw);
      guard.check(url, method, body);
      const mode = init?.redirect ?? (isRequest ? input.redirect : "follow");
      // "error" (public APIs, OAuth) and "manual" (the caller handles the 3xx itself) pass through unchanged.
      if (mode !== "follow") return original(input as never, init);
      let response = await original(input as never, { ...init, redirect: "manual" });
      const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
      // Only a body given in init as text can be sent again on a 307/308; a Request's own body is not re-read.
      let replay = init?.body !== undefined && (typeof raw === "string" || raw instanceof URLSearchParams) ? raw : undefined;
      const { body: _body, headers: _headers, method: _method, ...rest } = init ?? {};
      for (let hop = 0; ; hop++) {
        const location = response.headers.get("location");
        if (!REDIRECTS.has(response.status) || location === null) return response;
        await response.body?.cancel().catch(() => undefined);
        if (hop >= MAX_REDIRECTS) throw new TypeError("fetch failed: redirect count exceeded");
        const next = new URL(location, url);
        if (next.protocol !== "https:" && next.protocol !== "http:") throw new TypeError("fetch failed: redirect to a non-HTTP address");
        if ((response.status === 303 && method !== "GET" && method !== "HEAD") || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          replay = undefined;
          body = undefined;
          for (const h of BODY_HEADERS) headers.delete(h);
        } else if (body !== undefined && replay === undefined) throw new TypeError("fetch failed: the request body cannot be sent again on a redirect");
        if (next.origin !== url.origin) for (const h of CROSS_ORIGIN_DROP) headers.delete(h);
        url = next;
        guard.check(url, method, body);
        response = await original(url.href as never, { ...rest, method, headers, ...(replay === undefined ? {} : { body: replay }), redirect: "manual" });
      }
    }) as typeof fetch;
  }
  private wrapRequest(mod: typeof http | typeof https, name: "request" | "get", protocol: string) {
    const original = mod[name] as (...args: unknown[]) => http.ClientRequest;
    const guard = this;
    (mod as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      // F-05: check the host Node will contact (url argument merged with options), not only the url argument.
      const target = effectiveRequestTarget(args, protocol);
      let url: URL;
      try {
        url = new URL(`${target.protocol}//${target.host.includes(":") ? `[${target.host}]` : target.host}`);
      } catch {
        guard.record(target.host, target.method, "blocked", false);
        throw new EgressBlocked(target.host);
      }
      // Raw sockets never carry an approved AI payload: AI hosts are only reachable through fetch.
      guard.check(url, target.method, classifyHost(url.hostname) === "ai" ? "\u0000raw" : undefined);
      return original.apply(this, args);
    };
    this.restore.push(() => { (mod as unknown as Record<string, unknown>)[name] = original; });
  }
  // F-05 backstop below fetch and http: every TCP or TLS connection this process opens (undici, http, https, http2,
  // net, tls all end in net.Socket.prototype.connect) must go to loopback or an allow-listed host name. There is no
  // body here, so AI payload consent stays with fetch above; this layer only refuses hosts outside the allow-list.
  // A local pipe (a path instead of a host) is not network traffic and passes.
  private wrapSocketConnect() {
    const original = net.Socket.prototype.connect as (...a: unknown[]) => net.Socket;
    const guard = this;
    net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
      let o = args[0];
      if (Array.isArray(o)) o = o[0]; // net.connect() passes its normalized arguments as an array
      let host: string | undefined;
      if (o && typeof o === "object") {
        const opts = o as { path?: unknown; host?: unknown };
        host = opts.path ? undefined : String(opts.host || "localhost");
      } else if (typeof o === "string" && Number.isNaN(Number(o))) host = undefined; // pipe name
      else host = typeof args[1] === "string" && args[1] ? args[1] : "localhost";
      if (host !== undefined && classifyHost(host.replace(/^\[|\]$/g, "")) === "blocked") {
        guard.record(host, "CONNECT", "blocked", false);
        const error = new EgressBlocked(host);
        process.nextTick(() => this.destroy(error));
        return this;
      }
      return original.apply(this, args);
    } as typeof net.Socket.prototype.connect;
    this.restore.push(() => { net.Socket.prototype.connect = original as typeof net.Socket.prototype.connect; });
  }
  install() {
    const original = globalThis.fetch;
    globalThis.fetch = this.wrapFetch(original);
    this.restore.push(() => { globalThis.fetch = original; });
    this.wrapRequest(http, "request", "http:");
    this.wrapRequest(http, "get", "http:");
    this.wrapRequest(https, "request", "https:");
    this.wrapRequest(https, "get", "https:");
    this.wrapSocketConnect();
    syncBuiltinESMExports();
    return this;
  }
  uninstall() {
    for (const r of this.restore.splice(0).reverse()) r();
    syncBuiltinESMExports();
  }
}

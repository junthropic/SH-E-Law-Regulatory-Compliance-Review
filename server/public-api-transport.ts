import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Store } from "./store.js";
import { beginCall } from "./transport-v4.js";
export class PublicApiError extends Error {
  transportExhausted = false;
  get retryDisposition() {
    return this.code === "rate_limit" ? "quota_wait" : this.transportExhausted ? "transport_exhausted" : this.retryable ? "transient_worker_eligible" : "automatic_retry_forbidden";
  }
  constructor(
    message: string,
    public code:
      | "input"
      | "authentication"
      | "rate_limit"
      | "upstream"
      | "timeout"
      | "network"
      | "format"
      | "size" = "input",
    public retryable = false,
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}
export const invalidResponse = () =>
  new PublicApiError(
    "공식 응답 형식이 예상과 다릅니다. 연결 성공으로 처리하지 않았습니다.",
    "format",
  );
// URL and provider text must never escape into logs or persisted status.
async function requestOnce(url: URL, timeoutMs = 20_000): Promise<any> {
  let raw: string;
  const call = await beginCall(url, timeoutMs, cancellationContext.getStore());
  const chunks: Uint8Array[] = [];
  let captured = false;
  let response: Response | undefined;
  const began = Date.now();
  let phase = "headers",
    phaseStarted = began;
  const measured = () => {
    const store = transportContext.getStore();
    if (store && (isA07(url) || isA08(url))) {
      const key = `transport-v2-phases:${isA07(url) ? "A07" : "A08"}`;
      const old = store.setting<object[]>(key, []);
      store.put(
        "settings",
        key,
        [
          ...old,
          {
            at: new Date().toISOString(),
            phase,
            elapsedMs: Date.now() - phaseStarted,
          },
        ].slice(-100),
      );
    }
    phaseStarted = Date.now();
  };
  try {
    cancellationContext.getStore()?.throwIfAborted();
    call?.start();
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...[cancellationContext.getStore(),call?.signal].filter((s):s is AbortSignal=>!!s)]),
      headers: { Accept: "application/json, application/xml, text/xml" },
    });
    measured();
    phase = "body";
    if (!response.ok) {
      call?.capture(Buffer.alloc(0), response, false, "http_error_body_not_read");
      captured = true;
      const retryAfter = response.headers.get("retry-after");
      const retryAfterMs = retryAfter
        ? /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0
        : 0;
      await response.body?.cancel();
      throw new PublicApiError(
        response.status === 429
          ? "공공 API 호출 한도에 도달했습니다. 기관의 제한 해제 후 다시 조회하세요."
          : [401, 403].includes(response.status)
            ? "공공 API 인증 또는 활용 승인 확인이 필요합니다."
            : `공공 API HTTP ${response.status}. 기관 서비스 상태와 요청 조건을 확인하세요.`,
        response.status === 429
          ? "rate_limit"
          : [401, 403].includes(response.status)
            ? "authentication"
            : "upstream",
        [500, 502, 503, 504].includes(response.status),
        retryAfterMs,
      );
    }
    if (!response.body) throw invalidResponse();
    const reader = response.body.getReader();
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4_000_000)
          throw new PublicApiError(
            "공공 API 응답 용량 한도(4MB)를 초과했습니다.",
            "size",
          );
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    call?.capture(Buffer.concat(chunks), response, true, "body_received");
    captured = true;
    raw = Buffer.concat(chunks)
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();
    measured();
    phase = "parse";
  } catch (e) {
    if (!captured) call?.capture(Buffer.concat(chunks), response, false, e instanceof PublicApiError ? e.code : "stream_interrupted");
    measured();
    if (call?.signal.aborted) throw new PublicApiError("전송 허용이 철회되었거나 전송 시간이 만료되었습니다.", "input", false);
    if (e instanceof PublicApiError) throw e;
    const timedOut =
      e instanceof Error && /TimeoutError|AbortError/.test(e.name);
    throw new PublicApiError(
      timedOut
        ? `공공 API ${timeoutMs / 1000}초 응답 시간 초과. 잠시 후 다시 시도하세요.`
        : "공공 API 통신 실패. 잠시 후 다시 시도하세요.",
      timedOut ? "timeout" : "network",
      true,
    );
  } finally { call?.release(); }
  let data: any;
  try {
    if (raw.startsWith("<")) {
      if (
        /<!DOCTYPE|<!ENTITY|<html(?:\s|>)/i.test(raw) ||
        XMLValidator.validate(raw) !== true
      )
        throw invalidResponse();
      data = new XMLParser({
        parseTagValue: false,
        processEntities: false,
      }).parse(raw);
    } else data = JSON.parse(raw);
  } catch {
    call?.parsed(raw, false);
    measured();
    throw invalidResponse();
  }
  measured();
  call?.parsed(raw, true);
  const gateway = data?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (isA07(url) || isA08(url)) {
    const code = String(
      gateway?.returnReasonCode ??
        gateway?.errCode ??
        data?.response?.header?.resultCode ??
        "",
    );
    const normalized = /^\d+$/.test(code) ? String(Number(code)) : code;
    if (["1", "5"].includes(normalized))
      throw new PublicApiError(
        "기관 서비스가 일시 오류 또는 응답 시간 초과를 반환했습니다.",
        "upstream",
        true,
      );
    if (["22", "23"].includes(normalized)) {
      // Provider reset time is unverified. Daily quota requires explicit release,
      // not an invented midnight reset. Persist the hold across restarts.
      throw new PublicApiError(
        "기관 호출 한도에 도달하여 추가 호출을 잠시 중단했습니다.",
        "rate_limit",
        false,
        normalized === "22" ? Number.MAX_SAFE_INTEGER : 60_000,
      );
    }
    if (["20", "29", "30", "31"].includes(normalized))
      throw new PublicApiError(
        "기관 인증·활용 승인 또는 접근 제한 확인이 필요하여 재시도하지 않았습니다.",
        "authentication",
      );
  }
  if (gateway)
    throw new PublicApiError(
      "공공데이터포털 인증·요청 오류. 해당 서비스 활용 승인과 일반 인증키를 확인하세요.",
      "authentication",
    );

  return data;
}

const isA07 = (url: URL) =>
  url.origin === "https://apis.data.go.kr" &&
  url.pathname === "/B552584/kecoapi/wstdspBzentyService/getWstdspBzentyInfo";
const isA08 = (url: URL) =>
  url.origin === "https://apis.data.go.kr" &&
  url.pathname === "/B552584/wstdspGrndsInfo/getlist";
export const a07Policy = Object.freeze({
  timeoutMs: 60_000,
  maxAttempts: 2,
  minIntervalMs: 2_000,
  retryDelayMs: 5_000,
  jitterMs: 2_000,
  failureCooldownMs: 300_000,
  failuresBeforeCooldown: 3,
  maxPending: 4,
});
type DurableState = {
  failures: number;
  blockedUntil: number;
  code?: PublicApiError["code"];
  circuit: "closed" | "open" | "half_open";
  nextStart: number;
};
export type TransportStateStorage = {
  read: (key: string) => DurableState | undefined;
  write: (key: string, state: DurableState) => void;
};

// One lane for both connection probes and searches. Secrets/URLs are never logged.
// Failed responses are not cached or returned as successful empty search results.
export function createA07Transport(
  attempt: (url: URL, timeoutMs: number) => Promise<any> = requestOnce,
  runtime = {
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    random: () => Math.random(),
  },
  storage?: TransportStateStorage,
) {
  let tail: Promise<unknown> = Promise.resolve(),
    pending = 0,
    nextStart = 0;
  const inFlight = new Map<string, Promise<any>>();
  const states = new Map<
    string,
    { failures: number; blockedUntil: number; error?: PublicApiError }
  >();
  const metrics: {
    at: string;
    durationMs: number;
    attempts: number;
    outcome: string;
    attemptResults: { durationMs: number; outcome: string }[];
  }[] = [];
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  function request(url: URL): Promise<any> {
    const identity = hash(url.href),
      credential = hash(url.searchParams.get("serviceKey") ?? "");
    const existing = inFlight.get(identity);
    if (existing) return existing;
    if (pending >= a07Policy.maxPending)
      return Promise.reject(
        new PublicApiError(
          "폐기물 처리업체 조회가 진행 중입니다. 기존 조회가 끝난 뒤 다시 시도하세요.",
          "rate_limit",
        ),
      );
    pending++;
    const queuedAt = runtime.now();
    const task = tail
      .then(async () => {
        let state = states.get(credential);
        if (!state) {
          // Bound memory for changing credentials; never discard active cooldowns.
          if (states.size >= 64) {
            for (const [key, old] of states)
              if (old.blockedUntil <= runtime.now()) states.delete(key);
            if (states.size >= 64)
              throw new PublicApiError(
                "호출 제한이 해제된 뒤 다시 시도하세요.",
                "rate_limit",
              );
          }
          const saved = storage?.read(credential);
          state = saved
            ? {
                failures: saved.failures,
                blockedUntil: saved.blockedUntil,
                error: saved.code
                  ? new PublicApiError(
                      "이전 호출 제한·장애 상태가 유지 중입니다. 재개 조건을 확인하세요.",
                      saved.code,
                    )
                  : undefined,
              }
            : { failures: 0, blockedUntil: 0 };
          nextStart = Math.max(nextStart, saved?.nextStart || 0);
          states.set(credential, state);
        }
        if (state.blockedUntil > runtime.now())
          throw (
            state.error ||
            new PublicApiError("호출 재개 시각 확인 필요", "rate_limit")
          );
        if (state.blockedUntil)
          storage?.write(credential, {
            ...state,
            code: state.error?.code,
            circuit: "half_open",
            nextStart,
          });
        if (runtime.now() - queuedAt > 180_000)
          throw new PublicApiError(
            "폐기물 처리업체 조회 대기 시간이 길어 추가 호출을 중단했습니다.",
            "timeout",
          );
        let attempts = 0,
          outcome = "success";
        const attemptResults: { durationMs: number; outcome: string }[] = [];
        try {
          for (;;) {
            await runtime.sleep(Math.max(0, nextStart - runtime.now()));
            // Includes queued time and retry delay. Do not begin an attempt without its full allowance.
            if (runtime.now() - queuedAt + a07Policy.timeoutMs > 180_000)
              throw new PublicApiError(
                "전체 수집 시간 예산을 초과하여 후속 호출을 보류했습니다.",
                "timeout",
              );
            attempts++;
            const attemptStart = runtime.now();
            try {
              const data = await attempt(url, a07Policy.timeoutMs);
              attemptResults.push({
                durationMs: runtime.now() - attemptStart,
                outcome: "success",
              });
              state.failures = 0;
              state.blockedUntil = 0;
              state.error = undefined;
              return data;
            } catch (error) {
              const e =
                error instanceof PublicApiError
                  ? error
                  : new PublicApiError("공공 API 통신 실패.", "network", true);
              attemptResults.push({
                durationMs: runtime.now() - attemptStart,
                outcome: e.code,
              });
              const delay = Math.max(
                e.retryAfterMs,
                a07Policy.retryDelayMs +
                  Math.floor(runtime.random() * a07Policy.jitterMs),
              );
              if (
                e.retryable &&
                !cancellationContext.getStore()?.aborted &&
                attempts < a07Policy.maxAttempts &&
                delay <= 30_000
              ) {
                nextStart = runtime.now() + delay;
                continue;
              }
              outcome = e.code;
              state.failures++;
              const cooldown =
                e.code === "rate_limit"
                  ? Math.max(60_000, e.retryAfterMs)
                  : e.code === "authentication" ||
                      state.failures >= a07Policy.failuresBeforeCooldown
                    ? a07Policy.failureCooldownMs
                    : e.retryAfterMs;
              state.blockedUntil =
                cooldown === Number.MAX_SAFE_INTEGER
                  ? Number.MAX_SAFE_INTEGER
                  : Math.min(Number.MAX_SAFE_INTEGER, runtime.now() + cooldown);
              state.error = e;
              e.transportExhausted = attempts >= a07Policy.maxAttempts;
              throw e;
            } finally {
              nextStart = Math.max(
                nextStart,
                runtime.now() + a07Policy.minIntervalMs,
              );
              storage?.write(credential, {
                failures: state.failures,
                blockedUntil: state.blockedUntil,
                code: state.error?.code,
                circuit: state.blockedUntil > runtime.now() ? "open" : "closed",
                nextStart,
              });
            }
          }
        } finally {
          metrics.push({
            at: new Date(runtime.now()).toISOString(),
            durationMs: runtime.now() - queuedAt,
            attempts,
            outcome,
            attemptResults,
          });
          if (metrics.length > 50) metrics.shift();
        }
      })
      .finally(() => {
        pending--;
        inFlight.delete(identity);
      });
    tail = task.catch(() => {});
    inFlight.set(identity, task);
    return task;
  }
  return {
    request,
    metrics: () =>
      metrics.map((m) => ({
        ...m,
        attemptResults: m.attemptResults.map((a) => ({ ...a })),
      })),
  };
}
const a07Transport = createA07Transport();
const a08Transport = createA07Transport();
const transportContext = new AsyncLocalStorage<Store>();
const cancellationContext = new AsyncLocalStorage<AbortSignal>();
export const withPublicApiCancellation=<T>(signal:AbortSignal,action:()=>Promise<T>)=>cancellationContext.run(signal,action);
const durableTransports = new WeakMap<
  Store,
  Map<string, ReturnType<typeof createA07Transport>>
>();
export const withPublicApiState = <T>(store: Store, action: () => Promise<T>) =>
  transportContext.run(store, action);
function durableTransport(store: Store, service: string) {
  let entries = durableTransports.get(store);
  if (!entries) {
    entries = new Map();
    durableTransports.set(store, entries);
  }
  let transport = entries.get(service);
  if (!transport) {
    transport = createA07Transport(requestOnce, undefined, {
      read: (key) =>
        store.setting<DurableState | undefined>(
          `transport-v2:${service}:${key}`,
          undefined,
        ),
      write: (key, state) =>
        store.put("settings", `transport-v2:${service}:${key}`, state),
    });
    entries.set(service, transport);
  }
  return transport;
}
export const a07TransportMetrics = () => a07Transport.metrics();
export function requestOfficial(url: URL): Promise<any> {
  const store = transportContext.getStore(),
    service = isA07(url) ? "A07" : isA08(url) ? "A08" : undefined;
  return service
    ? (store
        ? durableTransport(store, service)
        : service === "A07"
          ? a07Transport
          : a08Transport
      ).request(url)
    : requestOnce(url);
}

const obj = (v: any): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
// Never return gateway diagnostics or credential-bearing request URLs, including on HTTP 200 errors.
export function scrubPublicValue(value: unknown, key: string): any {
  if (typeof value === "string") {
    let s = value;
    for (const secret of [
      key,
      encodeURIComponent(key),
      encodeURIComponent(encodeURIComponent(key)),
    ])
      s = s.split(secret).join("[인증값 제거]");
    return s.replace(
      /((?:servicekey|api[_-]?key|access_token|authorization|confmkey|oc)\s*(?:=|%3D)\s*)[^\s&"<>]+/gi,
      "$1[인증값 제거]",
    );
  }
  if (Array.isArray(value)) return value.map((v) => scrubPublicValue(v, key));
  if (obj(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/^(servicekey|api[_-]?key|access_token|authorization|confmkey|oc)$/i.test(
              k,
            ),
        )
        .map(([k, v]) => [scrubPublicValue(k, key), scrubPublicValue(v, key)]),
    );
  return value;
}

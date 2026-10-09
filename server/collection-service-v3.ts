import { DurableJobs, workOne, type Job, type UnitResult } from "./jobs-v3.js";
import { Store, sha } from "./store.js";
import { Vault } from "./vault.js";
import {
  searchPublic,
  detailPublic,
  validatePublicQuery,
} from "./public-apis.js";
import {
  PublicApiError,
  withPublicApiState,
  withPublicApiCancellation,
} from "./public-api-transport.js";
import type { Principal } from "./compliance-v2.js";
import type {
  PublicQuery as Query,
  LookupServiceId,
  PublicSearchResult,
} from "../shared/public-apis.js";
import { connectionServices } from "../shared/connection-catalog.js";
import { EgressGate, queryDigest } from "./egress-v3.js";
export class CollectionService {
  readonly jobs: DurableJobs;
  private active = false;
  private loop?: Promise<void>;
  constructor(
    readonly store: Store,
    readonly vault: Vault,
    readonly budgetMs = 180000,
    readonly gate?: EgressGate,
    readonly principalForJob?: (job: Job) => Principal,
  ) {
    this.jobs = new DurableJobs(store);
  }
  async enqueue(p: Principal, service: string, query: Query, idem?: string) {
    if (!connectionServices.some((s) => s.id === service))
      throw new Error("서비스 확인 필요");
    const key = await this.vault.read<string>("public-" + service);
    if (!key)
      throw new PublicApiError("저장된 인증키 확인 필요", "authentication");
    const checked = validatePublicQuery(service as LookupServiceId, query);
    const normalized = {
      ...checked,
      filters: Object.fromEntries(Object.entries(checked.filters || {}).sort()),
    };
    this.gate?.check(p, [queryDigest(service, normalized)], "query", service);
    return this.jobs.enqueue(
      p,
      idem ||
        sha(
          JSON.stringify([
            service,
            normalized,
            Math.floor(Date.now() / 1800000),
          ]),
        ),
      {
        provider: service,
        operation: "search",
        query: normalized,
        credentialRef: "key-" + sha(key),
        schemaVersion: "v3-1",
        budgetMs: this.budgetMs,
      },
    );
  }
  async handle(
    job: Job,
    commit: (unit: UnitResult) => void,
    signal: AbortSignal,
  ) {
    const key = await this.vault.read<string>("public-" + job.input.provider);
    if (!key || job.input.credentialRef !== "key-" + sha(key))
      throw new PublicApiError(
        "수집 인증값 변경: 새 작업 필요",
        "authentication",
      );
    const p = {
      id: job.requester,
      tenant: job.tenant,
      synthetic: job.synthetic,
      roles: [],
    };
    const actor = this.principalForJob?.(job) || p;
    this.gate?.check(
      actor,
      [queryDigest(job.input.provider, job.input.query)],
      "query",
      job.input.provider,
    );
    let page = job.cursor;
    try {
      for (let pages = 0; pages < 100; pages++) {
        const q = {
          keyword: job.input.query.keyword || "",
          mode: job.input.query.mode || "search",
          page,
          filters: job.input.query.filters,
        };
        signal.throwIfAborted();
        const root = "page-" + page;
        const prior = this.jobs.units(p, job.id);
        const stored = prior.find(
          (u) => u.id === root && u.state === "success",
        );
        const result =
          (stored?.data as PublicSearchResult | undefined) ||
          (await withPublicApiCancellation(signal, () =>
            withPublicApiState(this.store, () =>
              searchPublic(job.input.provider as LookupServiceId, key, q),
            ),
          ));
        signal.throwIfAborted();
        if (!stored)
          commit({
            id: root,
            parent: null,
            role: "list",
            state: "success",
            data: result,
          });
        for (const item of result.items) {
          signal.throwIfAborted();
          const id = root + ":" + item.hash;
          if (
            prior.some(
              (u) =>
                u.id === id && ["success", "not_supported"].includes(u.state),
            )
          )
            continue;
          if (item.canDetail) {
            try {
              const detailKey =
                item.service === "accidents"
                  ? await this.vault.read<string>("public-accident-files")
                  : key;
              if (!detailKey)
                throw new PublicApiError(
                  "상세 인증 확인 필요",
                  "authentication",
                );
              const data = await withPublicApiCancellation(signal, () =>
                withPublicApiState(this.store, () =>
                  detailPublic(item, detailKey),
                ),
              );
              signal.throwIfAborted();
              commit({
                id,
                parent: root,
                role: "detail",
                state: data.level === "partial" ? "error" : "success",
                ...(data.level === "partial" ? { error: "partial" } : {}),
                data,
              });
            } catch (e) {
              signal.throwIfAborted();
              commit({
                id,
                parent: root,
                role: "detail",
                state: "error",
                error: e instanceof PublicApiError ? e.code : "upstream",
              });
            }
          } else
            commit({
              id,
              parent: root,
              role: "detail",
              state: "not_supported",
            });
          commit({
            id: id + ":attachment",
            parent: id,
            role: "attachment",
            state: ["accidents", "accident-files", "guide", "sif"].includes(
              item.service,
            )
              ? "error"
              : "not_supported",
            error: ["accidents", "accident-files", "guide", "sif"].includes(
              item.service,
            )
              ? "adapter_missing"
              : "support_unverified",
          });
        }
        // Advance only after all child units have durable outcomes. A restart reuses the saved page.
        commit({
          id: root + ":checkpoint",
          parent: root,
          role: "list",
          state: "success",
          nextPage: result.hasMore ? page + 1 : null,
        });
        if (!result.hasMore) return;
        page++;
      }
      throw new PublicApiError(
        "작업당 페이지 한도: 부분 원본 보존, 다음 작업 필요",
        "size",
      );
    } catch (e) {
      if (e instanceof PublicApiError)
        throw new PublicApiError(e.message, e.code, false, e.retryAfterMs);
      throw e;
    }
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.loop = (async () => {
      let faults = 0;
      while (this.active) {
        try {
          await workOne(this.jobs, "app-worker", this.handle.bind(this));
          faults = 0;
        } catch {
          if (++faults >= 3) {
            this.active = false;
            try {
              this.store.audit(
                "worker_paused",
                "DB 작업 오류 반복: 마지막 저장 상태에서 관리 재개 필요",
              );
            } catch {}
            break;
          }
        }
        if (this.active) await new Promise((r) => setTimeout(r, 100));
      }
    })();
  }
  async stop() {
    this.active = false;
    await this.loop;
  }
  async facade(
    p: Principal,
    service: string,
    q: Query,
    waitMs = 250,
  ): Promise<PublicSearchResult> {
    const job = await this.enqueue(p, service, q);
    const began = Date.now();
    do {
      const current = this.jobs.get(p, job.id),
        units = this.jobs.units(p, job.id);
      const list = units.find(
        (u) =>
          u.role === "list" &&
          u.state === "success" &&
          u.id === "page-" + q.page,
      );
      if (list) return list.data as PublicSearchResult;
      if (current.state === "failed" || current.state === "cancelled")
        throw new PublicApiError(
          "조회 작업이 완료되지 않았습니다. 관리 기록에서 실패·재개 상태를 확인하세요.",
          "upstream",
        );
      if (Date.now() - began >= waitMs) break;
      await new Promise((r) => setTimeout(r, 20));
    } while (true);
    throw new PublicApiError(
      "자료 조회가 진행 중이거나 호출 제한 대기 중입니다. 잠시 후 다시 조회하세요.",
      "timeout",
    );
  }
}
export function assessConsignee(input: {
  asOf: string;
  businessId?: string;
  facility?: string;
  waste?: string;
  permit?: {
    businessId: string;
    facility: string;
    wastes: string[];
    validTo: string;
    reviewed: boolean;
  };
  a07: { state: string; businessId?: string; facility?: string };
  a08: {
    state: string;
    count?: number;
    businessId?: string;
    facility?: string;
    from?: string;
    to?: string;
    effectReviewed?: boolean;
  };
}) {
  const holds: string[] = [];
  if (!input.businessId || !input.facility)
    holds.push("업체·처리시설 동일성 확인");
  if (input.a07.state !== "success")
    holds.push("처리업체 조회 실패·부분 범위 확인");
  if (input.a08.state !== "success")
    holds.push("처분 조회 실패·부분 범위 확인");
  for (const row of [input.a07, input.a08])
    if (
      (row.businessId && row.businessId !== input.businessId) ||
      (row.facility && row.facility !== input.facility)
    )
      holds.push("동명 업체 또는 다른 시설 자료 대조");
  const p = input.permit;
  if (
    !p ||
    !p.reviewed ||
    p.businessId !== input.businessId ||
    p.facility !== input.facility ||
    p.validTo < input.asOf ||
    !input.waste ||
    !p.wastes.includes(input.waste)
  )
    holds.push("허가 효력·대상 폐기물·처리 범위 확인");
  if (input.a08.count === 0) holds.push("조회 0건의 범위·처분 후속 변경 확인");
  if (
    (input.a08.count || 0) > 0 &&
    (!input.a08.effectReviewed || !input.a08.from || !input.a08.to)
  )
    holds.push("처분 기간·현재 효력 검토");
  return {
    category: holds.length ? "more_data" : "human_review",
    holds: [...new Set(holds)],
    approved: false,
    conclusion: "위탁 가능·불가능 확정 전 실무 검토 필요",
    historicalSanction: !!input.a08.to && input.a08.to < input.asOf,
  };
}

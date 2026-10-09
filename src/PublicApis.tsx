import {
  additionalSearchConfigs,
  initialSearchFilters,
  isAdditionalService,
} from "../shared/additional-search.js";
import { useEffect, useState, type ReactNode } from "react";
import {
  connectionServices,
  connectionGroups,
} from "../shared/connection-catalog.js";
import {
  publicServices,
  type PublicConnection,
  type PublicRecord,
  type PublicSearchResult,
  type PublicServiceId,
  type LookupServiceId,
} from "../shared/public-apis.js";
type Api = <T = any>(url: string, options?: RequestInit) => Promise<T>;
const post = (api: Api, url: string, body: unknown = {}) =>
  api(url, { method: "POST", body: JSON.stringify(body) });
const when = (value?: string) =>
  value ? new Date(value).toLocaleString("ko-KR") : "아직 체크 전";

export function PublicApiSettings({ api }: { api: Api }) {
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedbackService, setFeedbackService] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  function clearFeedback() {
    setFeedbackService("");
    setMessage("");
    setError("");
  }
  const visibleServices = connectionServices.filter(
    (s) =>
      (group === "all" || s.group === group) &&
      `${s.code} ${s.name} ${s.purpose}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  async function refresh() {
    try {
      const next = await api<PublicConnection[]>("/public-apis");
      setConnections(next);
      setLoadError(false);
    } catch (e) {
      setLoadError(true);
      throw e;
    }
  }
  useEffect(() => {
    void refresh().catch(() => setError("공공 API 설정을 읽지 못했습니다."));
  }, []);
  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setFeedbackService(id);
    setMessage("");
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
      await refresh().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card public-api-settings">
      <h2>공공데이터 API 연결</h2>
      <p className="muted">
        32개 서비스를 업무 분야별로 찾아 신청 링크·사용 목적·인증키를
        관리합니다. 공공데이터포털은 일반 인증키(Encoding·Decoding), 주소 검색은
        별도 승인키를 입력하세요. 32개 모두 저장된 키로 실제 API 연결을 확인할
        수 있습니다.
      </p>
      <div className="connection-filters">
        <label>
          업무 분야
          <select
            aria-label="업무 분야"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              clearFeedback();
            }}
          >
            <option value="all">전체 32개</option>
            {Object.entries(connectionGroups).map(([id, label]) => (
              <option key={id} value={id}>
                {label}{" "}
                {connectionServices.filter((s) => s.group === id).length}개
              </option>
            ))}
          </select>
        </label>
        <label>
          서비스 찾기
          <input
            type="search"
            aria-label="서비스 찾기"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              clearFeedback();
            }}
            placeholder="서비스명 또는 사용할 기능"
          />
        </label>
      </div>
      <p className="muted">
        {visibleServices.length}개 표시 ·{" "}
        {connections.length
          ? `키 등록 ${connections.filter((c) => c.configured).length}/32개`
          : loadError
            ? "저장 상태 확인 실패"
            : "저장 상태 확인 중…"}
      </p>
      {connections.some((c) => c.storage === "memory") && (
        <p className="notice">
          이 실행은 메모리 저장입니다. 종료하면 인증키가 사라집니다.
        </p>
      )}
      {loadError && (
        <div className="notice" role="alert">
          <p>
            저장 상태를 불러오지 못했습니다. 현재 화면에서 API 키 저장을 완료할
            수 없습니다.
          </p>
          <a href="http://127.0.0.1:4317/#settings">실제 앱의 연결 설정 열기</a>
          <button
            type="button"
            className="secondary"
            disabled={!!busy}
            onClick={() => void run("", async () => {})}
          >
            저장 상태 다시 확인
          </button>
        </div>
      )}
      <div className="public-key-list">
        {visibleServices.map((s) => {
          const c = connections.find((c) => c.id === s.id);
          return (
            <section className="public-key-row" key={s.id} data-service={s.id}>
              <div>
                <span className="muted">
                  {s.code} · {connectionGroups[s.group]}
                </span>
                <h3>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name} ↗
                  </a>
                </h3>
                <p>{s.purpose}</p>
                <p className="muted">
                  {!c
                    ? loadError
                      ? "저장 상태 확인 실패"
                      : "저장 상태 확인 중…"
                    : c.storageError ||
                      (c?.configured
                        ? `키 저장됨 · ${c.storage === "memory" ? "세션 한정" : "Windows 암호화 저장"}`
                        : "키 미등록")}{" "}
                  ·{" "}
                  {c?.state === "ok"
                    ? "응답 확인"
                    : c?.state === "failed"
                      ? "연결 확인 필요"
                      : "연결 미검증"}
                </p>
                <p className="muted">
                  {when(c?.checkedAt)}
                  {c?.message && ` · ${c.message}`}
                </p>
                <a href={s.url} target="_blank" rel="noreferrer">
                  API 키 신청 ↗
                </a>
                <p className="muted">
                  {s.credential === "address"
                    ? "주소기반산업지원서비스에서 도로명주소 검색 API를 선택해 승인키를 신청하세요."
                    : "공식 상세페이지에서 로그인 후 ‘활용신청’을 누르세요. 서비스별 승인이 필요합니다."}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!c || c.storageError || busy) return;
                  if (
                    c.configured &&
                    !window.confirm(
                      `${s.name}: 기존 API 키를 입력한 키로 교체할까요? 서비스별로 키는 1개만 저장됩니다. 같은 키라면 변경하지 않습니다.`,
                    )
                  )
                    return;
                  void run(s.id, async () => {
                    const result = await post(api, `/public-apis/${s.id}/key`, {
                      key: keys[s.id] || "",
                      replace: c.configured,
                    });
                    setConnections((values) =>
                      values.map((value) =>
                        value.id === s.id
                          ? {
                              ...value,
                              configured: true,
                              ...(result.unchanged
                                ? {}
                                : {
                                    state: undefined,
                                    checkedAt: undefined,
                                    message: undefined,
                                  }),
                            }
                          : value,
                      ),
                    );
                    setKeys((v) => ({ ...v, [s.id]: "" }));
                    setMessage(
                      result.unchanged
                        ? `${s.name}: 이미 저장된 API 키와 같습니다. 기존 키와 연결 체크 결과를 유지했습니다.`
                        : `${s.name}: API 키 ${result.replaced ? "교체" : "저장"}·재읽기 확인 완료${result.storage === "memory" ? " (세션 한정)" : ""}. API 연결 체크를 진행하세요.`,
                    );
                  });
                }}
              >
                <label htmlFor={`key-${s.id}`}>
                  {s.name} {s.credential === "address" ? "승인키" : "인증키"}
                </label>
                <input
                  id={`key-${s.id}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={keys[s.id] || ""}
                  onChange={(e) =>
                    setKeys((v) => ({ ...v, [s.id]: e.target.value }))
                  }
                  placeholder={
                    c?.configured
                      ? "키 변경 시 새 값 입력"
                      : s.credential === "address"
                        ? "도로명주소 검색 API 승인키 붙여넣기"
                        : "일반 인증키 붙여넣기"
                  }
                  disabled={!!busy || !c || !!c.storageError}
                  aria-describedby={
                    feedbackService === s.id
                      ? `key-feedback-${s.id}`
                      : undefined
                  }
                />
                {c?.configured && (
                  <p className="muted">
                    API 키가 저장되어 있습니다. 다른 키를 저장하면 확인 후 기존
                    키 1개를 교체합니다.
                  </p>
                )}
                <div className="public-actions">
                  <button
                    className="secondary"
                    type="submit"
                    disabled={
                      !!busy || !c || !!c.storageError || !keys[s.id]?.trim()
                    }
                  >
                    API 키 저장
                  </button>
                  {c?.configured && (
                    <button
                      className="secondary"
                      type="button"
                      disabled={!!busy || !!c.storageError}
                      onClick={() =>
                        void run(s.id, async () => {
                          const r = await post(
                            api,
                            `/public-apis/${s.id}/probe`,
                          );
                          setMessage(`${s.name}: ${r.message}`);
                        })
                      }
                    >
                      API 연결 체크
                    </button>
                  )}
                  <button
                    className="secondary"
                    type="button"
                    disabled={!!busy || !c?.configured}
                    onClick={() =>
                      void run(s.id, async () => {
                        await api(`/public-apis/${s.id}/key`, {
                          method: "DELETE",
                          body: JSON.stringify({}),
                        });
                        setMessage(`${s.name}: 저장한 키 삭제 완료`);
                      })
                    }
                  >
                    키 삭제
                  </button>
                </div>
                {busy === s.id && <span role="status">처리 중…</span>}
                {feedbackService === s.id && (
                  <div id={`key-feedback-${s.id}`}>
                    {message && (
                      <p role="status" className="notice">
                        {message}
                      </p>
                    )}
                    {error && (
                      <p role="alert" className="notice">
                        {error}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </section>
          );
        })}
      </div>
      {!visibleServices.length && (
        <p className="muted">
          일치하는 서비스가 없습니다. 검색어나 구분을 변경하세요.
        </p>
      )}
    </section>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="muted">미제공</span>;
  if (typeof value === "object")
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  const text = String(value);
  // Remote markup is always rendered as text. Links require explicit user navigation.
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      if (
        !u.username &&
        !u.password &&
        !/servicekey|token|api[_-]?key|인증값/i.test(text)
      )
        return (
          <a href={u.href} target="_blank" rel="noreferrer">
            원문 링크 열기 ↗
          </a>
        );
    } catch {}
  }
  return <span>{text}</span>;
}
export function PublicApiSearch({
  api,
  onImported,
  dangerousGoodsTools,
}: {
  api: Api;
  onImported: () => Promise<void>;
  dangerousGoodsTools?: ReactNode;
}) {
  const [service, setService] = useState<LookupServiceId>("qna");
  const [mode, setMode] = useState("1");
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PublicSearchResult | null>(null);
  const [selected, setSelected] = useState<PublicRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastQuery, setLastQuery] = useState<{
    service: LookupServiceId;
    filters: Record<string, string>;
    keyword: string;
    mode: string;
  } | null>(null);
  const config = publicServices.find((s) => s.id === service);
  const extra = isAdditionalService(service)
    ? additionalSearchConfigs[service]
    : undefined;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setBusy(false);
    }
  }
  async function search(page = 1, paging = false) {
    await run(async () => {
      const query = !paging ? { service, keyword, mode, filters } : lastQuery!;
      const r = await post(api, `/public-apis/${query.service}/search`, {
        keyword: query.keyword,
        mode: query.mode,
        filters: query.filters,
        page,
      });
      setLastQuery(query);
      setResult(r);
      setSelected(null);
    });
  }
  return (
    <>
      <div className="section-head">
        <div>
          <h1>공공자료 조회</h1>
          <p className="muted">
            검색 → 상세 확인 → 자료함에 저장 → 새 법규 검토에서 첨부
          </p>
        </div>
      </div>
      <section className="card public-search-form">
        <p className="muted">
          입력한 검색어·조회 조건과 인증키를 해당 공공 API에 전송합니다. 자연어
          업무 질문과 사업장 자료는 자동 전송하지 않습니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label>
            조회 서비스
            <select
              aria-label="조회 서비스"
              value={service}
              disabled={busy}
              onChange={(e) => {
                const id = e.target.value as LookupServiceId;
                setService(id);
                setMode(
                  isAdditionalService(id)
                    ? "search"
                    : publicServices.find((s) => s.id === id)!.modes[0][0],
                );
                setFilters(
                  isAdditionalService(id) ? initialSearchFilters(id) : {},
                );
                setKeyword("");
                setLastQuery(null);
                setResult(null);
                setSelected(null);
                setMessage("");
                setError("");
              }}
            >
              {Object.entries(connectionGroups).map(([groupId, label]) => (
                <optgroup key={groupId} label={label}>
                  {connectionServices
                    .filter((s) => s.group === groupId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className={`public-query${extra ? " public-query-additional" : ""}`}>
            {!extra && (
              <label>
                검색 구분
                <select
                  value={mode}
                  disabled={busy}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {config?.modes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {extra?.keywordLabel ?? "검색어"}
              <input
                value={keyword}
                disabled={busy || (service === "fire" && mode === "list")}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={extra?.placeholder ?? config?.placeholder}
                type={extra?.kind ?? "text"}
                required={extra?.required}
                maxLength={100}
              />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? "조회 중…" : "조회"}
            </button>
          </div>
          {extra && (
            <div className="connection-filters">
              {extra.fields.map((field) => (
                <label key={field.name}>
                  {field.label}
                  {field.required ? " *" : ""}
                  {field.options ? (
                    <select
                      aria-label={field.label}
                      value={filters[field.name] ?? ""}
                      disabled={busy}
                      required={field.required}
                      onChange={(e) =>
                        setFilters((v) => ({
                          ...v,
                          [field.name]: e.target.value,
                        }))
                      }
                    >
                      {field.options.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={field.label}
                      type={field.kind ?? "text"}
                      value={filters[field.name] ?? ""}
                      placeholder={field.placeholder}
                      disabled={busy}
                      required={field.required}
                      maxLength={200}
                      onChange={(e) =>
                        setFilters((v) => ({
                          ...v,
                          [field.name]: e.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          )}
        </form>
        <p className="notice">{extra?.note ?? config?.note}</p>
      </section>
      {service === "fire" ? dangerousGoodsTools : null}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {result && (
        <section className="card public-results">
          {result.scopeNote && <p className="notice">{result.scopeNote}</p>}
          <h2>
            조회 결과{" "}
            <span className="muted">
              {result.total.toLocaleString()}건 · {result.page}페이지
            </span>
          </h2>
          {!result.items.length && (
            <p>
              {result.filteredOut
                ? "현재 페이지에서 검색 조건에 맞는 자료를 확인하지 못했습니다. 다음 페이지를 확인하세요."
                : "이 검색 조건의 결과가 없습니다. 검색 결과 0건은 의무·위험이 없다는 뜻이 아닙니다."}
            </p>
          )}
          {result.items.map((item) => (
            <div className="public-result-row" key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">
                  {item.level === "detail" ? "상세 응답" : "목록 응답"} · 조회{" "}
                  {when(item.fetchedAt)}
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setSelected(item)}
              >
                내용 확인
              </button>
            </div>
          ))}
          <div className="public-actions">
            <button
              className="secondary"
              disabled={busy || result.page <= 1}
              onClick={() => void search(result.page - 1, true)}
            >
              이전 페이지
            </button>
            <button
              className="secondary"
              disabled={busy || !result.hasMore}
              onClick={() => void search(result.page + 1, true)}
            >
              다음 페이지
            </button>
          </div>
        </section>
      )}
      {selected && (
        <section className="card public-detail">
          <h2>{selected.title}</h2>
          <p className="muted">
            {selected.level === "partial"
              ? "일부 상세 누락"
              : selected.level === "detail"
                ? "상세 응답"
                : "목록 응답"}{" "}
            · {when(selected.fetchedAt)}
          </p>
          {selected.warnings.map((w, i) => (
            <p className="notice" key={i}>
              {w}
            </p>
          ))}
          <div className="public-actions">
            {selected.canDetail && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setSelected(
                      await post(
                        api,
                        `/public-api-records/${selected.id}/detail`,
                      ),
                    );
                  })
                }
              >
                {service === "accidents"
                  ? "첨부파일 목록 조회"
                  : service === "msds"
                    ? "MSDS 16항목 상세 조회"
                    : "상세 본문 조회"}
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await post(api, `/public-api-records/${selected.id}/import`);
                  await onImported();
                  setMessage(
                    "자료함에 저장했습니다. 원문을 대조한 뒤 새 법규 검토에서 이 자료를 선택하세요.",
                  );
                })
              }
            >
              자료함에 저장
            </button>
            <a href={selected.catalogUrl} target="_blank" rel="noreferrer">
              공식 서비스 안내 ↗
            </a>
          </div>
          {busy && (
            <p role="status">
              처리 중입니다. MSDS는 최대 16개 항목의 응답을 기다립니다.
            </p>
          )}
          <dl className="public-fields">
            {Object.entries(selected.fields).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>
                  <FieldValue value={value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

import {
  additionalSearchConfigs,
  isAdditionalService,
} from "../shared/additional-search.js";
import { useEffect, useState } from "react";
import {
  intakeFields,
  type IntakeDraft,
  type IntakeFact,
} from "../shared/intake.js";
import type { ReviewRequest } from "../shared/types.js";
type Api = <T = any>(url: string, options?: RequestInit) => Promise<T>;
const labels = {
  pending: "대기",
  running: "조회 중",
  ok: "후보 확보",
  empty: "0건",
  failed: "실패",
  skipped: "보류",
};
function CandidateList({ records }: { records: unknown[] }) {
  return (
    <ul className="intake-candidates">
      {records.map((value, index) => {
        const r = value as {
          title?: string;
          url?: string;
          catalogUrl?: string;
          effectiveFrom?: string;
        };
        let url = "";
        try {
          const candidate = new URL(r.url || r.catalogUrl || "");
          if (
            candidate.protocol === "https:" &&
            ["www.law.go.kr", "www.data.go.kr"].includes(candidate.hostname)
          )
            url = candidate.href;
        } catch {
          /* A missing official link is displayed as plain text. */
        }
        return (
          <li key={index}>
            <strong>{r.title || "제목 미제공"}</strong>
            {r.effectiveFrom && (
              <p className="muted">
                자료에 표시된 시행일: {r.effectiveFrom} · 기준일 적용 미검증
              </p>
            )}
            {url && (
              <a href={url} target="_blank" rel="noreferrer">
                {r.url ? "공식 법규 원문 열기" : "공식 API 안내 열기"} ↗
              </a>
            )}
            <details>
              <summary>보존한 원자료 보기</summary>
              <pre>{JSON.stringify(value, null, 2)}</pre>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
export function Intake({
  request,
  api,
  onReview,
  onBusy,
}: {
  request: ReviewRequest;
  api: Api;
  onReview: (id: string) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState<IntakeDraft | null>(null),
    [facts, setFacts] = useState<IntakeFact[]>([]);
  const [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const post = (url: string, body: unknown = {}) =>
    api(url, { method: "POST", body: JSON.stringify(body) });
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  useEffect(() => {
    if (draft?.status !== "running") return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    onBusy(true);
    const poll = async () => {
      try {
        const next = await api<IntakeDraft>("/intake/" + draft.id);
        if (!alive) return;
        setDraft(next);
        if (next.status === "running")
          timer = setTimeout(() => void poll(), 1800);
        else onBusy(false);
      } catch {
        if (alive) {
          setError(
            "조회 상태를 읽지 못했습니다. 연결이 돌아오면 다시 확인합니다.",
          );
          timer = setTimeout(() => void poll(), 4000);
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
      onBusy(false);
    };
  }, [draft?.id, draft?.status]);
  const running = busy || draft?.status === "running";
  function update(key: string, value: string, confirmed?: boolean) {
    setFacts((current) =>
      current.map((f) =>
        f.key === key
          ? {
              ...f,
              value,
              quote: f.value === value ? f.quote : "",
              confirmed: confirmed ?? false,
            }
          : f,
      ),
    );
    setConsent(false);
    if (draft)
      setDraft({ ...draft, status: "draft", steps: [], reportId: undefined });
  }
  return (
    <section className="card intake-panel" aria-label="질문 분석과 자동 조회">
      <h2>질문 분석과 자동 조회</h2>
      <button
        type="button"
        className="secondary"
        disabled={
          running ||
          request.prompt.length < 10 ||
          (request.useAi && !request.model)
        }
        onClick={() =>
          void run(async () => {
            const d = await post("/intake", request);
            setDraft(d);
            setFacts(d.facts);
            setConsent(false);
          })
        }
      >
        1. 질문에서 사실 추출
      </button>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {draft && (
        <>
          <p className="notice">
            추출값은 모두 미확인 상태로 시작합니다. 값을 수정하거나 ‘사실
            확인’을 선택하세요. 모름·미확인·예정인 내용은 확정하지 않습니다.
          </p>
          <p className="muted">
            소재지: {draft.request.region}{" "}
            {draft.request.municipality || "시·군·구 미입력"} · 기준일:{" "}
            {draft.request.asOf}
          </p>
          <div className="intake-facts">
            {facts.map((f) => {
              const label = intakeFields.find(([key]) => key === f.key)![1];
              return (
                <div key={f.key}>
                  <label>
                    {label}
                    <textarea
                      aria-label={`추출 ${label}`}
                      rows={2}
                      value={f.value}
                      disabled={running}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  </label>
                  <label className="intake-confirm">
                    <input
                      type="checkbox"
                      aria-label={`${label} 사실 확인`}
                      checked={f.confirmed}
                      disabled={running || !f.value.trim()}
                      onChange={(e) => update(f.key, f.value, e.target.checked)}
                    />
                    사실 확인
                  </label>
                  {f.quote && (
                    <details>
                      <summary>추출 근거 문장</summary>
                      <p>{f.quote}</p>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="secondary"
            disabled={running}
            onClick={() =>
              void run(async () => {
                const d = await post(`/intake/${draft.id}/plan`, { facts });
                setDraft(d);
                setFacts(d.facts);
                setConsent(false);
              })
            }
          >
            2. 확인한 정보로 조회 계획 만들기
          </button>
          <div className="intake-notes">
            {draft.warnings.map((w, i) => (
              <p className="notice" key={i}>
                {w}
              </p>
            ))}
          </div>
          {!!draft.questions.length && (
            <details open>
              <summary>추가 확인 질문 {draft.questions.length}개</summary>
              <ul>
                {draft.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </details>
          )}
          {!!draft.steps.length && (
            <>
              <h3>기관별 조회 계획·결과</h3>
              <p className="muted">
                검색어와 대상 기관을 확인하세요. 업무 질문 전체와 사업장
                상세정보는 공공 API로 보내지 않습니다. 법령 후보는 최대 5건,
                공공자료는 최대 3건씩 보존합니다. 제목·순위만으로 질문과의
                관련성을 확정하지 않습니다.
              </p>
              <ol className="intake-steps">
                {draft.steps.map((s) => (
                  <li key={s.id}>
                    <div>
                      <strong>{s.label}</strong>
                      <span className="badge">{labels[s.status]}</span>
                    </div>
                    <p>
                      검색어: <b>{s.keyword}</b>
                    </p>
                    <p className="muted">{s.reason}</p>
                    {s.filters && (
                      <p className="muted">
                        {Object.entries(s.filters)
                          .map(
                            ([key, value]) =>
                              `${isAdditionalService(s.service) ? (additionalSearchConfigs[s.service].fields.find((f) => f.name === key)?.label ?? key) : key}: ${value}`,
                          )
                          .join(" · ")}
                      </p>
                    )}
                    {s.total !== undefined && (
                      <p>
                        검색 {s.total}건 · 보존 {s.count || 0}건
                      </p>
                    )}
                    {s.message && <p className="notice">{s.message}</p>}
                    {s.fetchedAt && (
                      <small>
                        조회 {new Date(s.fetchedAt).toLocaleString("ko-KR")}
                      </small>
                    )}
                    {s.records && (
                      <details>
                        <summary>후보 자료·출처 확인</summary>
                        <CandidateList records={s.records} />
                      </details>
                    )}
                    {!!s.excluded?.length && (
                      <details>
                        <summary>
                          CAS 대조에서 제외한 후보 {s.excluded.length}건
                        </summary>
                        <ul>
                          {s.excluded.map((r, i) => (
                            <li key={i}>
                              {r.title} · CAS {r.cas || "미제공"}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {draft.status === "planned" && (
            <>
              <label className="intake-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                표시한 검색어를 대상 기관에 전송하고 조회 기록을 이 PC 자료함에
                저장하는 데 동의합니다.
              </label>
              <button
                type="button"
                className="primary"
                disabled={running || !consent || !draft.steps.length}
                onClick={() =>
                  void run(async () => {
                    await post(`/intake/${draft.id}/execute`, {
                      consent: true,
                    });
                    setDraft({ ...draft, status: "running" });
                  })
                }
              >
                3. 계획대로 자동 조회
              </button>
            </>
          )}
          {draft.status === "running" && (
            <p role="status">
              조회 중입니다. 출처별 실패·보류를 기록하고 다음 조회를 계속합니다.
            </p>
          )}
          {draft.status === "failed" && (
            <p role="alert" className="notice">
              {draft.error}
            </p>
          )}
          {draft.status === "completed" && (
            <>
              <p className="notice">
                조회 기록이 자료함에 저장되었습니다. 실패·0건·미확인 사실이 남아
                있을 수 있으며, 자료 탐색 완료는 법적 검증 완료를 의미하지
                않습니다.
              </p>
              <button
                type="button"
                className="primary"
                disabled={running}
                onClick={() => void run(() => onReview(draft.id))}
              >
                이 조회 자료로 검토 시작
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { api, focusTarget, koreaToday, upload, type Region } from "./api";
import type { BetaReview, SelfReview } from "../server/beta-contract-v8";
import { groupGaps, unique, viewIssue } from "./present";
import { Icon } from "./icons";

type Doc = { id: string; name: string; origin?: string; createdAt?: string };
type Row = { id: string; title: string; createdAt: string; status: string };
type Category = BetaReview["review"]["issues"][number]["category"];
// Status is told by text and a symbol, never by colour alone. 위반 가능성 is styled but not emitted while approvals are 0.
const CATEGORY: Record<Category, { text: string; mark: string; cls: string }> = {
  more_data: { text: "자료·사실 확인 필요", mark: "!", cls: "check" },
  human_review: { text: "사람 검토 필요", mark: "‖", cls: "hold" },
  clear_risk: { text: "위반 가능성", mark: "▲", cls: "risk" },
};
const CATEGORY_ORDER: Category[] = ["clear_risk", "more_data", "human_review"];
const CARD_TAG = "검토 후보 · 베타";

export function ReviewPage({ id, regions }: { id?: string; regions: Region[] }) {
  return id ? <Result id={id} /> : <NewReview regions={regions} />;
}

export function Status({ category }: { category: Category }) {
  const c = CATEGORY[category];
  return <span className={`beta-status ${c.cls}`}><span aria-hidden="true">{c.mark}</span>{c.text}</span>;
}

function NewReview({ regions }: { regions: Region[] }) {
  const [prompt, setPrompt] = useState("");
  const [region, setRegion] = useState("경기도");
  const [municipality, setMunicipality] = useState("");
  const [asOf, setAsOf] = useState(koreaToday());
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [docsError, setDocsError] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowsError, setRowsError] = useState("");
  const [ai, setAi] = useState<{ consent: boolean; models: { id: string; name: string }[] }>({ consent: false, models: [] });
  const [useAi, setUseAi] = useState(false);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const loadDocs = () => api<Doc[]>("/documents").then((d) => {
    setDocs(d.filter((x) => x.origin !== "intake"));
    setDocsError("");
  }, (e: Error) => setDocsError(e.message));
  useEffect(() => {
    void loadDocs();
    api<Row[]>("/reviews").then(setRows, (e: Error) => setRowsError(e.message));
    api<{ enabled: boolean }>("/ai/consent").then(async (c) => {
      const models = c.enabled ? await api<{ id: string; name: string }[]>("/auth/chatgpt/models").catch(() => []) : [];
      setAi({ consent: c.enabled, models: Array.isArray(models) ? models : [] });
    }, () => {});
  }, []);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/reviews", "POST", {
        prompt, region, municipality, asOf, documentIds: chosen, model: useAi ? model : "", useAi, answers: {},
      });
      location.hash = `#/review/${id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chars = prompt.trim().length;
  const why = chars < 10 ? `업무 상황을 10자 이상 적으면 시작할 수 있습니다. 지금 ${chars}자입니다.` : useAi && !model ? "AI 모델을 고르면 시작할 수 있습니다." : "";
  return (
    <>
      <h1 tabIndex={-1}>법률 조회</h1>
      <p className="beta-muted">원하시는 SH&E 업무에 필요한 법률 및 법령을 연관된 자료를 조회할 수 있습니다.</p>
      <div className="beta-columns">
      <section className="beta-card">
        <div className="beta-field">
          <label htmlFor="review-prompt">검토할 업무 상황</label>
          <textarea id="review-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} minLength={10} aria-describedby="prompt-help" placeholder="예: 상시근로자 120명 제조업 사업장의 안전관리자 선임 인원을 확인하고 싶습니다." />
          <small id="prompt-help" className="beta-hint">10자 이상 · 지금 <span className="num">{chars}</span>자</small>
        </div>
        <div className="beta-grid">
          <label className="beta-field">
            <span>시·도</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {regions.map((r) => <option key={r.code} value={r.name}>{r.name}</option>)}
            </select>
          </label>
          <label className="beta-field">
            <span>시·군·구</span>
            <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
          </label>
          <label className="beta-field">
            <span>기준일</span>
            <input type="date" className="num" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
        </div>
        <fieldset className="beta-fieldset">
          <legend>함께 볼 자료</legend>
          {docs === null && !docsError && <p className="beta-muted" role="status">자료 목록을 불러오는 중…</p>}
          {docsError && <p className="beta-error" role="alert">자료 목록을 불러오지 못했습니다. {docsError}</p>}
          {docs?.map((d) => (
            <label key={d.id} className="beta-check">
              <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))} />
              <span>{d.name}</span>
            </label>
          ))}
          {docs && !docs.length && <p className="beta-muted">업로드한 자료가 없습니다. ( ※ 법률조회 시 자료를 반드시 첨부할 필요는 없습니다.)</p>}
          <label className="beta-file">
            {uploading ? "올리는 중…" : "자료 올리기"}
            <input type="file" disabled={uploading} aria-describedby={uploadError ? "upload-error" : undefined} onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              setUploadError("");
              try {
                const d = await upload(f);
                await loadDocs();
                setChosen((c) => [...c, d.id]);
              } catch (err) {
                setUploadError((err as Error).message);
              } finally {
                setUploading(false);
              }
              e.target.value = "";
            }} />
          </label>
          {uploadError && <p id="upload-error" className="beta-error" role="alert">{uploadError}</p>}
        </fieldset>
        <fieldset className="beta-fieldset">
          <legend>AI 분석</legend>
          {ai.consent && ai.models.length ? (
            <>
              <label className="beta-check">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                <span>AI 분석 사용 (보내기 전에 보낼 내용을 보여주고 승인을 받습니다)</span>
              </label>
              {useAi && (
                <select aria-label="AI 모델" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">모델 선택</option>
                  {ai.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </>
          ) : (
            <p className="beta-muted">AI 분석의 경우 ChatGPT 연결을 통해 사용이 가능하며, 데이터·백업 화면에서 해당 내용이 AI에 전송되는 것에 대한 동의가 필요합니다. 회사 자료 및 내용을 업로드할 경우 절대적으로 보안이슈가 발생할 수 있으므로 반드시 유의해주세요.</p>
          )}
        </fieldset>
        <div className="beta-actions">
          <button className="primary" disabled={busy || !!why} aria-describedby={why ? "start-why" : undefined} onClick={submit}>{busy ? "처리 중…" : "검토 시작"}</button>
          {why && <p id="start-why" className="beta-hint">{why}</p>}
        </div>
        {error && <p className="beta-error" role="alert">{error}</p>}
      </section>
      <section className="beta-card beta-history">
      <h2><Icon name="history" />검토 기록</h2>
      {rows === null && !rowsError && <p className="beta-muted" role="status">검토 기록을 불러오는 중…</p>}
      {rowsError && <p className="beta-error" role="alert">검토 기록을 불러오지 못했습니다. {rowsError}</p>}
      {rows && (
        <ul className="beta-list">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`#/review/${r.id}`}>{r.title}</a>
              <span className="beta-muted num">{new Date(r.createdAt).toLocaleString("ko-KR")}</span>
            </li>
          ))}
          {!rows.length && <li className="beta-muted">아직 검토가 없습니다.</li>}
        </ul>
      )}
      </section>
      </div>
    </>
  );
}

// Result: the left list picks one part of the result; the right side shows only that part (user design 2026-10-15).
const panelId = (key: string) => (key.startsWith("issue:") ? "result-issue-" + key.slice(6) : "result-" + key);

function Result({ id }: { id: string }) {
  const [data, setData] = useState<BetaReview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const d = await api<BetaReview>(`/beta/reviews/${id}`);
        if (!live) return;
        setData(d);
        if (d.review.status === "running") timer = setTimeout(load, 1500);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);
  return (
    <div className="beta-result">
      <p className="beta-back"><a href="#/review">← 새 검토</a></p>
      <div className="beta-title-row">
        <h1 tabIndex={-1}>검토 후보</h1>
        {data && (
          <p className="beta-h1-note">
            (<strong>{data.preview.label}</strong> · 근거와 사실을 직접 확인해야 합니다. · {data.preview.on ? "안전관리자 미리보기 켜짐" : "미리보기 꺼짐 — 기본 검토 결과"}
            {data.selfReview && <> · <span className="beta-self">{data.selfReview.label}</span></>})
          </p>
        )}
      </div>
      {error && <p className="beta-error" role="alert">{error} 목록에서 다른 검토를 고르거나 새 검토를 시작하세요.</p>}
      {!data && !error && <p className="beta-muted" role="status">불러오는 중…</p>}
      {data && <ResultBody key={data.review.id} data={data} setData={setData} />}
    </div>
  );
}

function ResultBody({ data, setData }: { data: BetaReview; setData: (d: BetaReview) => void }) {
  const r = data.review;
  const label = data.preview.label;
  const gaps = groupGaps(r.gaps);
  const gapCount = gaps.reduce((n, g) => n + g.items.length, 0);
  const more: [string, string][] = [
    ["facts", "사실 보완"],
    ...(data.selfReview || r.status === "completed" ? [["self", "자가 검토"] as [string, string]] : []),
    ["export", "내보내기"],
  ];
  const keys = [...r.issues.map((i) => "issue:" + i.id), ...more.map(([k]) => k)];
  const [pick, setPick] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const current = keys.includes(pick) ? pick : keys[0];
  useEffect(() => {
    if (!moveTo) return;
    focusTarget(document.getElementById(moveTo)?.querySelector("h2, h3"));
    setMoveTo("");
  }, [moveTo]);
  // On a narrow screen the detail sits below the list, so it is brought into view.
  const show = (key: string, move = false) => {
    setPick(key);
    if (move || matchMedia("(max-width: 900px)").matches) setMoveTo(panelId(key));
  };
  const pickButton = (key: string, content: ReactNode) => (
    <button type="button" className="beta-pick" aria-current={current === key ? "true" : undefined} aria-controls={panelId(key)} onClick={() => show(key)}>{content}</button>
  );
  return (
    <>
      <section className="beta-card beta-request-card" aria-label="검토 요청">
        <p className="beta-request">{r.request.prompt}</p>
        <p className="beta-muted">{r.request.region} {r.request.municipality} · 기준일 <span className="num">{r.request.asOf}</span> · {r.status === "completed" ? "동기화 · 조회 완료" : `상태 ${r.status === "running" ? "진행 중" : "실패"}`}</p>
        {r.status === "running" && <p role="status">{r.progress || "검토 중입니다."}</p>}
        {r.error && <p className="beta-error">{r.error}</p>}
      </section>
      {r.status !== "running" && (
        <>
          <div className="beta-summary">
            <p>
              <span>판정 후보 <b className="num">{r.issues.length}</b>건</span>
              {CATEGORY_ORDER.map((c) => {
                const n = r.issues.filter((i) => i.category === c).length;
                return n ? <span key={c}><Status category={c} /> <b className="num">{n}</b></span> : null;
              })}
              <span>근거 확인 필요 <b className="num">{gapCount}</b>건</span>
            </p>
            <button className="primary" onClick={() => show("export", true)}>내보내기</button>
          </div>
          <div className="beta-split">
            <nav className="beta-picker" aria-label="결과 목록">
              <h2><Icon name="list" />판정 후보</h2>
              {r.issues.length ? (
                <ul className="beta-pick-list">
                  {r.issues.map((i) => <li key={i.id}>{pickButton("issue:" + i.id, <><Status category={i.category} /><span className="beta-pick-title">{i.title}</span></>)}</li>)}
                </ul>
              ) : (
                <p className="beta-empty">판정 후보가 없습니다. 아래 사실 보완과 근거 확인 목록을 보세요.</p>
              )}
              <ul className="beta-pick-list beta-pick-more">
                {more.map(([key, text]) => <li key={key}>{pickButton(key, text)}</li>)}
              </ul>
            </nav>
            <div className="beta-detail">
              {r.issues.map((i) => <IssueCard key={i.id} issue={i} label={label} hidden={current !== "issue:" + i.id} />)}
              <Facts data={data} gaps={gaps} gapCount={gapCount} hidden={current !== "facts"} />
              <SelfReviewBox id={r.id} done={data.selfReview} status={r.status} hidden={current !== "self"} onDone={(s) => setData({ ...data, selfReview: s })} />
              <section id="result-export" className="beta-card beta-section" hidden={current !== "export"}>
                <h2><Icon name="download" />내보내기</h2>
                <p className="beta-muted">내보낸 파일에는 화면과 같은 판정 후보{data.selfReview ? "와 자가 검토 표시" : ""}가 들어갑니다.</p>
                <div className="beta-row">
                  <a className="button" href={`/api/reviews/${r.id}/export?format=md`}>Markdown</a>
                  <a className="button" href={`/api/reviews/${r.id}/export?format=csv`}>CSV</a>
                  <a className="button" href={`/api/reviews/${r.id}/reviewer-packet`}>검토자 인계 자료</a>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function IssueCard({ issue: i, label, hidden }: { issue: BetaReview["review"]["issues"][number]; label: string; hidden: boolean }) {
  const v = viewIssue(i, label);
  const missing = unique(i.missing);
  return (
    <article id={"result-issue-" + i.id} className={`beta-issue ${CATEGORY[i.category].cls}`} hidden={hidden}>
      <div className="beta-issue-top">
        <div className="beta-issue-head">
          <Status category={i.category} />
          <span className="beta-tag">{CARD_TAG}</span>
        </div>
        <h3><Icon name="scale" />{i.title}</h3>
      </div>
      {(!!v.articles.length || v.lawDate || v.approval) && (
        <dl className="beta-basis">
          {!!v.articles.length && (
            <div><dt>근거 조문</dt><dd>{v.articles.map((a, n) => <span key={n} className="beta-cite">{a}</span>)}</dd></div>
          )}
          {v.lawDate && <div><dt>법률 기준일</dt><dd className="num">{v.lawDate}</dd></div>}
          {v.approval && <div><dt>승인</dt><dd>{v.approval}</dd></div>}
        </dl>
      )}
      <p className="beta-conclusion">{v.conclusion}</p>
      {!!v.conditions.length && (
        <>
          <h4>조건</h4>
          <ul>{v.conditions.map((c, n) => <li key={n}>{c}</li>)}</ul>
        </>
      )}
      {!!missing.length && (
        <details open className={`beta-fold${missing.length > 8 ? " beta-more" : ""}`}>
          <summary>추가로 확인할 것 <span className="beta-count num">{missing.length}</span></summary>
          <ul>{missing.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}
      {!!i.nextActions.length && (
        <>
          <h4>다음 조치</h4>
          <ul>{i.nextActions.map((c, n) => <li key={n}>{c}</li>)}</ul>
        </>
      )}
    </article>
  );
}

// Fact supplement: answers go into a new review; the earlier record stays as it was.
function Facts({ data, gaps, gapCount, hidden }: { data: BetaReview; gaps: ReturnType<typeof groupGaps>; gapCount: number; hidden: boolean }) {
  const r = data.review;
  const [answers, setAnswers] = useState<Record<string, string>>(r.request.answers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/reviews", "POST", { ...r.request, answers: { ...r.request.answers, ...answers } });
      location.hash = `#/review/${id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = Object.values(answers).some((v) => v.trim());
  return (
    <section id="result-facts" className="beta-card beta-section" hidden={hidden}>
      <h2><Icon name="edit" />사실 보완</h2>
      {!!r.facts.length && (
        <div className="beta-table-wrap">
          <table className="beta-table beta-stack">
            <caption>검토에 쓴 사실</caption>
            <colgroup><col className="c-label" /><col /><col className="c-state" /></colgroup>
            <thead><tr><th scope="col">사실</th><th scope="col">값</th><th scope="col">상태</th></tr></thead>
            <tbody>
              {r.facts.map((f) => (
                <tr key={f.key + f.value}>
                  <td data-label="사실">{f.label}</td>
                  <td data-label="값" className="num">{f.value}</td>
                  <td data-label="상태">{f.confirmed ? <span className="beta-status neutral">사용자 확인</span> : <span className="beta-status check"><span aria-hidden="true">!</span>추출·미확인</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!r.facts.length && <p className="beta-muted">검토에 쓴 사실이 없습니다.</p>}
      {!!r.questions.length && <h3>더 알려 주면 좋은 사실</h3>}
      {r.questions.map((q) => (
        <label key={q.key} className="beta-field">
          <span>{q.label}</span>
          <input value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
        </label>
      ))}
      {r.questions.length ? (
        <>
          <p className="beta-muted">답을 넣으면 새 검토가 만들어지고, 지금 기록은 그대로 남습니다.</p>
          <div className="beta-actions">
            <button disabled={busy || !ready} aria-describedby={!ready ? "facts-why" : undefined} onClick={submit}>{busy ? "처리 중…" : "보완해서 다시 검토"}</button>
            {!ready && <p id="facts-why" className="beta-hint">답을 하나 이상 넣으면 다시 검토할 수 있습니다.</p>}
          </div>
        </>
      ) : (
        <p className="beta-muted">추가로 물어볼 사실이 없습니다.</p>
      )}
      {error && <p className="beta-error" role="alert">{error}</p>}
      {!!gapCount && (
        <details className="beta-fold beta-gaps">
          <summary>근거 확인이 필요한 부분 <span className="beta-count num">{gapCount}</span></summary>
          {gaps.map((g) => (
            <div key={g.name} className="beta-gap-group">
              <h4>{g.name} <span className="beta-count num">{g.items.length}</span></h4>
              <ul>{g.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function SelfReviewBox({ id, done, status, hidden, onDone }: { id: string; done: SelfReview | null; status: string; hidden: boolean; onDone: (s: SelfReview) => void }) {
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState({ facts: false, basis: false, limits: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (done)
    return (
      <section id="result-self" className="beta-card beta-section" hidden={hidden}>
        <h2><Icon name="check" />{done.label}</h2>
        <p className="beta-muted"><span className="num">{new Date(done.at).toLocaleString("ko-KR")}</span> · 독립 검토로 인정되지 않습니다.</p>
        <p>{done.note}</p>
      </section>
    );
  if (status !== "completed") return null;
  const checked = [checks.facts, checks.basis, checks.limits].filter(Boolean).length;
  const chars = note.trim().length;
  const why = checked < 3 || chars < 15 ? `세 항목을 모두 확인하고 메모를 15자 이상 적으면 기록할 수 있습니다. 지금 ${checked}/3 확인 · ${chars}자입니다.` : "";
  return (
    <section id="result-self" className="beta-card beta-section" hidden={hidden}>
      <h2><Icon name="check" />자가 검토 — 독립 검토 아님</h2>
      <p className="beta-muted">혼자 쓰는 설치판에서는 작성자 본인이 검토를 기록할 수 있습니다. 결과·화면·내보내기에 항상 "자가 검토 — 독립 검토 아님"이 표시되고, 판정 단계는 바뀌지 않습니다.</p>
      <p className="beta-muted"><span className="num">{checked}/3</span> 확인</p>
      {([["facts", "입력한 사실과 자료를 다시 확인했습니다."], ["basis", "근거 조문과 기준일을 원문에서 확인했습니다."], ["limits", "이 결과가 법적 판단이 아닌 검토 후보임을 이해했습니다."]] as const).map(([k, label]) => (
        <label key={k} className="beta-check">
          <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
          <span>{label}</span>
        </label>
      ))}
      <div className="beta-field">
        <label htmlFor="self-note">검토 메모 (15자 이상)</label>
        <textarea id="self-note" rows={3} value={note} aria-invalid={error ? true : undefined} aria-describedby={error ? "self-help self-error" : "self-help"} onChange={(e) => setNote(e.target.value)} />
        <small id="self-help" className="beta-hint">지금 <span className="num">{chars}</span>자</small>
        {error && <span id="self-error" className="beta-error" role="alert">{error}</span>}
      </div>
      <div className="beta-actions">
        <button disabled={busy || !!why} aria-describedby={why ? "self-why" : undefined} onClick={async () => {
          setBusy(true);
          setError("");
          try {
            onDone(await api<SelfReview>(`/beta/reviews/${id}/self-review`, "POST", { note, checks }));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>{busy ? "처리 중…" : "자가 검토 기록"}</button>
        {why && <p id="self-why" className="beta-hint">{why}</p>}
      </div>
    </section>
  );
}

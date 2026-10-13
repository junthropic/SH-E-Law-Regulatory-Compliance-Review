import { useEffect, useState } from "react";
import { api, koreaToday, upload, type Region } from "./api";
import type { BetaReview, SelfReview } from "../server/beta-contract-v8";

type Doc = { id: string; name: string; origin?: string; createdAt?: string };
type Row = { id: string; title: string; createdAt: string; status: string };
const CATEGORY: Record<string, string> = { more_data: "자료·사실 확인 필요", human_review: "사람 검토 필요", clear_risk: "위반 가능성" };

export function ReviewPage({ id, regions }: { id?: string; regions: Region[] }) {
  return id ? <Result id={id} /> : <NewReview regions={regions} />;
}

function NewReview({ regions }: { regions: Region[] }) {
  const [prompt, setPrompt] = useState("");
  const [region, setRegion] = useState("경기도");
  const [municipality, setMunicipality] = useState("");
  const [asOf, setAsOf] = useState(koreaToday());
  const [docs, setDocs] = useState<Doc[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [ai, setAi] = useState<{ consent: boolean; models: { id: string; name: string }[] }>({ consent: false, models: [] });
  const [useAi, setUseAi] = useState(false);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadDocs = () => api<Doc[]>("/documents").then((d) => setDocs(d.filter((x) => x.origin !== "intake")));
  useEffect(() => {
    void loadDocs();
    api<Row[]>("/reviews").then(setRows, () => {});
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
  return (
    <>
      <h1>새 검토</h1>
      <p className="beta-muted">결과는 모두 검토 후보입니다. 법적 판단이 아니며, 근거와 사실을 직접 확인해야 합니다.</p>
      <section className="beta-card">
        <label className="beta-field">
          <span>검토할 업무 상황</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} minLength={10} placeholder="예: 상시근로자 120명 제조업 사업장의 안전관리자 선임 인원을 확인하고 싶습니다." />
        </label>
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
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
        </div>
        <fieldset className="beta-fieldset">
          <legend>함께 볼 자료</legend>
          {docs.map((d) => (
            <label key={d.id} className="beta-check">
              <input type="checkbox" checked={chosen.includes(d.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))} />
              {d.name}
            </label>
          ))}
          {!docs.length && <p className="beta-muted">올린 자료가 없습니다.</p>}
          <label className="beta-file">
            자료 올리기
            <input type="file" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const d = await upload(f);
                await loadDocs();
                setChosen((c) => [...c, d.id]);
              } catch (err) {
                setError((err as Error).message);
              }
              e.target.value = "";
            }} />
          </label>
        </fieldset>
        <fieldset className="beta-fieldset">
          <legend>AI 분석</legend>
          {ai.consent && ai.models.length ? (
            <>
              <label className="beta-check">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                AI 분석 사용 (보내기 전에 보낼 내용을 보여주고 승인을 받습니다)
              </label>
              {useAi && (
                <select aria-label="AI 모델" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="">모델 선택</option>
                  {ai.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </>
          ) : (
            <p className="beta-muted">AI 분석은 꺼져 있습니다. 쓰려면 데이터·백업 화면에서 AI 전송에 동의하고, 기존 화면의 연결 설정에서 ChatGPT를 연결하세요.</p>
          )}
        </fieldset>
        <button className="primary" disabled={busy || prompt.trim().length < 10 || (useAi && !model)} onClick={submit}>검토 시작</button>
        {error && <p className="beta-error" role="alert">{error}</p>}
      </section>
      <h2>검토 기록</h2>
      <ul className="beta-list">
        {rows.map((r) => (
          <li key={r.id}>
            <a href={`#/review/${r.id}`}>{r.title}</a>
            <span className="beta-muted"> · {new Date(r.createdAt).toLocaleString("ko-KR")}</span>
          </li>
        ))}
        {!rows.length && <li className="beta-muted">아직 검토가 없습니다.</li>}
      </ul>
    </>
  );
}

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
  if (error) return <p className="beta-error" role="alert">{error}</p>;
  if (!data) return <p className="beta-muted">불러오는 중…</p>;
  const r = data.review;
  return (
    <>
      <p><a href="#/review">← 새 검토</a></p>
      <h1>검토 후보</h1>
      <div className="beta-banner" role="note">
        <strong>{data.betaLabel}</strong>
        <span>{data.preview.on ? `안전관리자 미리보기 켜짐 — ${data.preview.label}` : "미리보기 꺼짐 — 기본 검토 결과"}</span>
        {data.selfReview && <span className="beta-self">{data.selfReview.label}</span>}
      </div>
      <section className="beta-card">
        <p className="beta-request">{r.request.prompt}</p>
        <p className="beta-muted">{r.request.region} {r.request.municipality} · 기준일 {r.request.asOf} · 상태 {r.status === "running" ? "진행 중" : r.status === "completed" ? "완료" : "실패"}</p>
        {r.status === "running" && <p role="status">{r.progress || "검토 중입니다."}</p>}
        {r.error && <p className="beta-error">{r.error}</p>}
      </section>
      {r.status !== "running" && (
        <>
          <h2>판정 후보</h2>
          {r.issues.map((i) => (
            <article key={i.id} className="beta-card beta-issue">
              <p className={`beta-chip ${i.category}`}>{CATEGORY[i.category]}</p>
              <h3>{i.title}</h3>
              <p>{i.conclusion}</p>
              {!!i.conditions.length && <ul>{i.conditions.map((c, n) => <li key={n}>{c}</li>)}</ul>}
              {!!i.missing.length && (
                <>
                  <h4>추가로 확인할 것</h4>
                  <ul>{i.missing.map((c, n) => <li key={n}>{c}</li>)}</ul>
                </>
              )}
              {!!i.nextActions.length && (
                <>
                  <h4>다음 조치</h4>
                  <ul>{i.nextActions.map((c, n) => <li key={n}>{c}</li>)}</ul>
                </>
              )}
            </article>
          ))}
          {!r.issues.length && <p className="beta-muted">판정 후보가 없습니다.</p>}
          <Facts data={data} />
          <SelfReviewBox id={r.id} done={data.selfReview} status={r.status} onDone={(s) => setData({ ...data, selfReview: s })} />
          <section className="beta-card">
            <h2>내보내기</h2>
            <p className="beta-muted">내보낸 파일에는 화면과 같은 판정 후보{data.selfReview ? "와 자가 검토 표시" : ""}가 들어갑니다.</p>
            <div className="beta-row">
              <a className="button" href={`/api/reviews/${r.id}/export?format=md`}>Markdown</a>
              <a className="button" href={`/api/reviews/${r.id}/export?format=csv`}>CSV</a>
              <a className="button" href={`/api/reviews/${r.id}/reviewer-packet`}>검토자 인계 자료</a>
            </div>
          </section>
        </>
      )}
    </>
  );
}

// Fact supplement: answers go into a new review; the earlier record stays as it was.
function Facts({ data }: { data: BetaReview }) {
  const r = data.review;
  const [answers, setAnswers] = useState<Record<string, string>>(r.request.answers);
  const [error, setError] = useState("");
  const submit = async () => {
    try {
      const { id } = await api<{ id: string }>("/reviews", "POST", { ...r.request, answers: { ...r.request.answers, ...answers } });
      location.hash = `#/review/${id}`;
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="beta-card">
      <h2>사실 보완</h2>
      {!!r.facts.length && (
        <div className="beta-table-wrap">
          <table className="beta-table">
            <thead><tr><th>사실</th><th>값</th><th>상태</th></tr></thead>
            <tbody>
              {r.facts.map((f) => (
                <tr key={f.key + f.value}><td>{f.label}</td><td>{f.value}</td><td>{f.confirmed ? "사용자 확인" : "추출·미확인"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.questions.map((q) => (
        <label key={q.key} className="beta-field">
          <span>{q.label}</span>
          <input value={answers[q.key] || ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
        </label>
      ))}
      {!!r.gaps.length && (
        <>
          <h3>근거 확인이 필요한 부분</h3>
          <ul>{r.gaps.map((g, n) => <li key={n}>{g}</li>)}</ul>
        </>
      )}
      {r.questions.length ? (
        <>
          <p className="beta-muted">답을 넣으면 새 검토가 만들어지고, 지금 기록은 그대로 남습니다.</p>
          <button className="primary" onClick={submit} disabled={!Object.values(answers).some((v) => v.trim())}>보완해서 다시 검토</button>
        </>
      ) : (
        <p className="beta-muted">추가로 물어볼 사실이 없습니다.</p>
      )}
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

function SelfReviewBox({ id, done, status, onDone }: { id: string; done: SelfReview | null; status: string; onDone: (s: SelfReview) => void }) {
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState({ facts: false, basis: false, limits: false });
  const [error, setError] = useState("");
  if (done)
    return (
      <section className="beta-card">
        <h2>{done.label}</h2>
        <p className="beta-muted">{new Date(done.at).toLocaleString("ko-KR")} · 독립 검토로 인정되지 않습니다.</p>
        <p>{done.note}</p>
      </section>
    );
  if (status !== "completed") return null;
  const ready = checks.facts && checks.basis && checks.limits && note.trim().length >= 15;
  return (
    <section className="beta-card">
      <h2>자가 검토 — 독립 검토 아님</h2>
      <p className="beta-muted">혼자 쓰는 설치판에서는 작성자 본인이 검토를 기록할 수 있습니다. 결과·화면·내보내기에 항상 "자가 검토 — 독립 검토 아님"이 표시되고, 판정 단계는 바뀌지 않습니다.</p>
      {([["facts", "입력한 사실과 자료를 다시 확인했습니다."], ["basis", "근거 조문과 기준일을 원문에서 확인했습니다."], ["limits", "이 결과가 법적 판단이 아닌 검토 후보임을 이해했습니다."]] as const).map(([k, label]) => (
        <label key={k} className="beta-check">
          <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} />
          {label}
        </label>
      ))}
      <label className="beta-field">
        <span>검토 메모 (15자 이상)</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="primary" disabled={!ready} onClick={async () => {
        try {
          onDone(await api<SelfReview>(`/beta/reviews/${id}/self-review`, "POST", { note, checks }));
        } catch (e) {
          setError((e as Error).message);
        }
      }}>자가 검토 기록</button>
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

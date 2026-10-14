import { useEffect, useState, type ReactNode } from "react";
import { api, koreaToday, saveFile } from "./api";
import type { Notice, RestoreResult } from "../server/beta-contract-v8";

type Consent = { enabled: boolean; grantedAt?: string; revokedAt?: string; notice: string };
type Retention = { autoDeleteDays: 30 | 90 | 365 | null; choices: (30 | 90 | 365 | null)[]; log: { at: string; kind: string; ref: string; reason: string }[] };
const days = (c: Retention["autoDeleteDays"]) => (c === null ? "자동 삭제 안 함 (계속 보관)" : `${c}일 지난 원본 삭제`);

// Loading and failure look the same in every box on this page.
function Box({ title, error, children }: { title: string; error: string; children?: ReactNode }) {
  return (
    <section className="beta-card">
      <h2>{title}</h2>
      {children ?? (error ? <p className="beta-error" role="alert">불러오지 못했습니다. {error}</p> : <p className="beta-muted" role="status">불러오는 중…</p>)}
    </section>
  );
}

export function DataPage() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Notice>("/beta/notice").then(setNotice, (e: Error) => setError(e.message));
  }, []);
  return (
    <>
      <h1 tabIndex={-1}>데이터 처리 안내</h1>
      {!notice && !error && <p className="beta-muted" role="status">안내를 불러오는 중…</p>}
      {error && <p className="beta-error" role="alert">안내를 불러오지 못했습니다. {error}</p>}
      {notice && (
        <section className="beta-card">
          <p><strong>{notice.betaLabel}</strong></p>
          <dl className="beta-notice">
            {notice.items.map((i) => (
              <div key={i.title}>
                <dt>{i.title}</dt>
                <dd>{i.text} <span className="beta-proof num">시험 {i.proof.join(", ")}</span></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Backup />
      <AiConsentBox />
      <PreviewBox />
      <RetentionBox />
    </>
  );
}

function Backup() {
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState("");
  return (
    <section className="beta-card">
      <h2>백업 내보내기·가져오기</h2>
      <p className="beta-muted">백업 파일은 암호화됩니다. 만든 Windows 사용자 계정에서 가져오기로 복원합니다. 인증키·설정·감사 기록은 백업에 들어가지 않으니 복원 뒤 키를 다시 저장하세요.</p>
      <div className="beta-row">
        <button className="primary" disabled={!!busy} onClick={async () => {
          setBusy("export");
          setMessage("");
          setFailed("");
          try {
            const r = await fetch("/api/beta/backup", { credentials: "same-origin" });
            const text = await r.text();
            if (!r.ok) throw new Error(JSON.parse(text).error || "백업하지 못했습니다.");
            saveFile(`she-backup-${koreaToday()}.json`, text);
            setMessage("암호화 백업 파일을 만들었습니다. 안전한 곳에 보관하세요.");
          } catch (e) {
            setFailed((e as Error).message);
          } finally {
            setBusy("");
          }
        }}>{busy === "export" ? "처리 중…" : "암호화 백업 내보내기"}</button>
        <label className="beta-file">
          {busy === "import" ? "처리 중…" : "백업 가져오기"}
          <input type="file" accept="application/json,.json" disabled={!!busy} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy("import");
            setMessage("");
            setFailed("");
            try {
              const r = await api<RestoreResult>("/beta/restore", "POST", { file: await f.text() });
              setMessage(`복원했습니다: 검토 ${r.reviews}건, 자료 ${r.documents}건. 복원한 자료는 다시 확인 전 상태로 표시됩니다.`);
            } catch (err) {
              setFailed((err as Error).message);
            } finally {
              setBusy("");
            }
          }} />
        </label>
      </div>
      {busy && <p className="beta-hint">작업이 끝날 때까지 다른 백업 작업은 기다립니다.</p>}
      {message && <p className="beta-saved" role="status">{message}</p>}
      {failed && <p className="beta-error" role="alert">{failed}</p>}
    </section>
  );
}

function AiConsentBox() {
  const [c, setC] = useState<Consent | null>(null);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const load = () => {
    api<Consent>("/ai/consent").then(setC, (e: Error) => setError(e.message));
    api<{ outcome: string }[]>("/ai/send-log").then((l) => setSent(l.filter((x) => x.outcome === "sent").length), () => {});
  };
  useEffect(load, []);
  if (!c) return <Box title="AI 분석 전송 동의" error={error} />;
  return (
    <section className="beta-card">
      <h2>AI 분석 전송 동의</h2>
      <p>{c.notice}</p>
      <p className="beta-muted">상태: {c.enabled ? <>동의함 (<span className="num">{new Date(c.grantedAt!).toLocaleString("ko-KR")}</span>)</> : "꺼짐"} · 지금까지 보낸 횟수 <span className="num">{sent}</span>회</p>
      <button disabled={busy} onClick={async () => {
        setBusy(true);
        setSaved("");
        setError("");
        try {
          const next = await api<Consent>("/ai/consent", "POST", { enabled: !c.enabled });
          setC(next);
          setSaved(next.enabled ? "저장됨 — AI 전송 동의함" : "저장됨 — AI 전송 동의 철회");
          load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}>{busy ? "처리 중…" : c.enabled ? "동의 철회" : "AI 전송에 동의"}</button>
      {saved && <p className="beta-saved" role="status">{saved}</p>}
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

function RetentionBox() {
  const [r, setR] = useState<Retention | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api<Retention>("/retention").then(setR, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (!r) return <Box title="보존·삭제" error={error} />;
  const ready = confirm === "전체 삭제";
  return (
    <>
      <section className="beta-card">
        <h2>보존·삭제</h2>
        <div className="beta-field">
          <label htmlFor="retention-days">업로드 원본 자동 삭제</label>
          <select id="retention-days" value={String(r.autoDeleteDays)} onChange={async (e) => {
            const v = e.target.value === "null" ? null : (Number(e.target.value) as 30 | 90 | 365);
            setSaved("");
            setError("");
            try {
              await api("/retention", "POST", { autoDeleteDays: v });
              setSaved("저장됨 — " + days(v));
            } catch (err) {
              setError((err as Error).message);
            }
            await load();
          }}>
            {r.choices.map((c) => <option key={String(c)} value={String(c)}>{days(c)}</option>)}
          </select>
        </div>
        {saved && <p className="beta-saved" role="status">{saved}</p>}
        {error && <p className="beta-error" role="alert">{error}</p>}
        <p className="beta-muted">원본을 지운 검토는 "원본 삭제됨 — 재검토 불가"로 표시됩니다.</p>
        <details className="beta-fold">
          <summary><span>삭제 기록 <span className="num">{r.log.length}</span>건 (본문 없음)</span></summary>
          {r.log.length ? <ul>{r.log.map((l, n) => <li key={n}><span className="num">{new Date(l.at).toLocaleString("ko-KR")}</span> · {l.kind} · {l.reason}</li>)}</ul> : <p className="beta-muted">삭제 기록이 없습니다.</p>}
        </details>
      </section>
      <section className="beta-card beta-danger-zone">
        <h2>영구 삭제</h2>
        <div className="beta-field">
          <label htmlFor="delete-all">업로드 자료 전체 영구 삭제 — 확인하려면 "전체 삭제"를 입력하세요</label>
          <input id="delete-all" value={confirm} aria-invalid={deleteError ? true : undefined} aria-describedby={deleteError ? "delete-error" : "delete-why"} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="beta-actions">
          <button className="danger" disabled={!ready || busy} onClick={async () => {
            setBusy(true);
            setDeleteError("");
            setMessage("");
            try {
              const res = await api<{ deleted: number }>("/documents/delete-all", "POST", { confirm });
              setConfirm("");
              setMessage(`자료 ${res.deleted}건을 영구 삭제했습니다.`);
              await load();
            } catch (e) {
              setDeleteError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>{busy ? "처리 중…" : "전체 영구 삭제"}</button>
          {!ready && <p id="delete-why" className="beta-hint">"전체 삭제"를 정확히 입력하면 삭제할 수 있습니다.</p>}
        </div>
        {deleteError && <p id="delete-error" className="beta-error" role="alert">{deleteError}</p>}
        {message && <p role="status">{message}</p>}
      </section>
    </>
  );
}

function PreviewBox() {
  const [p, setP] = useState<{ safetyManagerV7: boolean; label: string } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    api<{ safetyManagerV7: boolean; label: string }>("/preview").then(setP, (e: Error) => setError(e.message));
  }, []);
  if (!p) return <Box title="안전관리자 판정 미리보기" error={error} />;
  return (
    <section className="beta-card">
      <h2>안전관리자 판정 미리보기</h2>
      <p className="beta-muted">켜면 새 검토에 산업안전보건법 안전관리자 6개 의무 후보가 붙습니다. 모든 결과에 "{p.label}", 법률 기준일, 근거 조문이 표시됩니다. 끄면 기존 결과와 같습니다.</p>
      <label className="beta-check">
        <input type="checkbox" checked={p.safetyManagerV7} onChange={async (e) => {
          setSaved("");
          setError("");
          try {
            const next = await api<{ safetyManagerV7: boolean; label: string }>("/preview", "POST", { safetyManagerV7: e.target.checked });
            setP(next);
            setSaved(next.safetyManagerV7 ? "저장됨 — 미리보기 켜짐" : "저장됨 — 미리보기 꺼짐");
          } catch (err) {
            setError((err as Error).message);
          }
        }} />
        <span>미리보기 켜기</span>
      </label>
      {saved && <p className="beta-saved" role="status">{saved}</p>}
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

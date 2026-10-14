import { useEffect, useRef, useState } from "react";
import { api, boot, focusTarget, type Boot } from "./api";
import type { AiPending } from "../server/beta-contract-v8";
import { ReviewPage } from "./ReviewPage";
import { KeysPage } from "./KeysPage";
import { DataPage } from "./DataPage";

export const BETA_BADGE = "베타 — 검토 후보, 법적 판단 아님";
const PAGES = [
  ["review", "검토"],
  ["keys", "API 키 설정"],
  ["data", "데이터·백업"],
] as const;
type Page = (typeof PAGES)[number][0];

function route(): { page: Page; id?: string } {
  const [, page, id] = location.hash.split("/");
  return PAGES.some(([p]) => p === page) ? { page: page as Page, id } : { page: "review" };
}

export function App() {
  const [at, setAt] = useState(route);
  const [info, setInfo] = useState<Boot | null>(null);
  const [error, setError] = useState("");
  const moved = useRef(false);
  useEffect(() => {
    const on = () => {
      moved.current = true;
      setAt(route());
    };
    addEventListener("hashchange", on);
    boot().then(setInfo, (e: Error) => setError(e.message));
    return () => removeEventListener("hashchange", on);
  }, []);
  // After a route change the new page's h1 gets focus, so it is announced and Tab starts from the content.
  useEffect(() => {
    if (!moved.current || !info) return;
    moved.current = false;
    focusTarget(document.querySelector("#beta-main h1"));
  }, [at.page, at.id, info]);
  return (
    <div className="beta-shell">
      <a className="beta-skip" href="#beta-main" onClick={(e) => {
        e.preventDefault();
        focusTarget(document.querySelector("#beta-main h1") ?? document.getElementById("beta-main"));
      }}>본문 바로가기</a>
      <header className="beta-header">
        <div className="beta-brand">
          <strong>SH·E</strong>
          <span className="beta-badge" role="note">{BETA_BADGE}</span>
        </div>
        <nav aria-label="베타 메뉴">
          {PAGES.map(([p, label]) => (
            <a key={p} href={`#/${p}`} aria-current={at.page === p ? "page" : undefined}>
              {label}
            </a>
          ))}
          <a href="/" className="beta-old">기존 화면</a>
        </nav>
      </header>
      {info && <AiApprovals />}
      <main className="beta-main" id="beta-main" tabIndex={-1}>
        {!info && !error && <p className="beta-muted" role="status">화면을 준비하는 중…</p>}
        {error && <p className="beta-error" role="alert">{error}</p>}
        {info && at.page === "review" && <ReviewPage id={at.id} regions={info.regions.regions} />}
        {info && at.page === "keys" && <KeysPage />}
        {info && at.page === "data" && <DataPage />}
      </main>
    </div>
  );
}

// An AI send waits until the user sees exactly what would leave the PC and approves it once.
function AiApprovals() {
  const [pending, setPending] = useState<AiPending>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let live = true;
    const load = () => api<AiPending>("/ai/pending").then((p) => live && setPending(p), () => {});
    load();
    const t = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  if (!pending.length) return null;
  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    setError("");
    try {
      await api(`/ai/pending/${id}`, "POST", { approve });
      setPending((p) => p.filter((x) => x.previewId !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="beta-ai" aria-label="AI 전송 승인 대기">
      {pending.map((p) => (
        <div key={p.previewId} className="beta-card">
          <h2>AI 전송 승인 대기 — {p.purpose}</h2>
          <p>{p.notice}</p>
          <p className="beta-muted">
            보낼 크기 <span className="num">{p.bytes.toLocaleString()}</span>바이트 · <span className="num">{new Date(p.expiresAt).toLocaleTimeString("ko-KR")}</span>까지 승인하지 않으면 보내지 않습니다.
          </p>
          <details>
            <summary>보낼 내용 전체 보기</summary>
            <pre className="beta-pre">{p.payload}</pre>
          </details>
          <div className="beta-row">
            <button className="primary" disabled={!!busy} onClick={() => decide(p.previewId, true)}>{busy === p.previewId ? "처리 중…" : "이 내용 한 번 보내기"}</button>
            <button disabled={!!busy} onClick={() => decide(p.previewId, false)}>보내지 않기</button>
          </div>
        </div>
      ))}
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

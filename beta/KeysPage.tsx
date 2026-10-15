import { useEffect, useId, useState } from "react";
import { api, ApiError } from "./api";
import type { Collection, KeyGroup, Keys, KeySave, Probe } from "../server/beta-contract-v8";
import { Icon } from "./icons";

// Key values are typed here and sent once to the local server. The server never returns them.
export function KeysPage() {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const load = () => api<Keys>("/beta/keys").then((k) => {
    setKeys(k);
    setError("");
    setRev((r) => r + 1);
  }, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h1 tabIndex={-1}>API 키 설정</h1>
      <p className="beta-muted">
        각 회사가 직접 발급받은 키로 법령·공공자료를 수집합니다.<br />
        키는 이 PC의 Windows 사용자 보호 저장소에 암호화해 저장하고, 화면·기록·내보내기에 표시하지 않습니다.<br />
        키가 일부만 있어도 앱은 동작하며, 키가 없는 출처는 "{keys?.missingLabel ?? "미연결 — 수집 안 됨"}"으로 표시하고 그 근거가 필요한 판정은 보류합니다.
      </p>
      {keys?.storage === "memory" && <p className="beta-warn" role="note">지금은 세션 한정 저장소입니다. 앱을 끄면 저장한 키가 사라집니다.</p>}
      {!keys && !error && <p className="beta-muted" role="status">키 상태를 불러오는 중…</p>}
      {error && <p className="beta-error" role="alert">키 상태를 불러오지 못했습니다. {error}</p>}
      {keys?.groups.map((g) => <Group key={g.id} group={g} missing={keys.missingLabel} reload={load} />)}
      {keys && <CollectionBox rev={rev} />}
      <AiLinkBox />
    </>
  );
}

type State = { cls: "off" | "ok" | "err" | "check"; mark: string; text: string };
function state(configured: boolean, check: { state?: string; message?: string }, missing: string): State {
  if (!configured) return { cls: "off", mark: "–", text: missing };
  if (check.state === "ok") return { cls: "ok", mark: "✓", text: "연결 확인됨" };
  if (check.state === "failed") return { cls: "err", mark: "×", text: "연결 실패 — " + (check.message || "") };
  return { cls: "check", mark: "!", text: "저장됨 — 연결 확인 전" };
}
const Badge = ({ s }: { s: State }) => <span className={`beta-status ${s.cls}`}><span aria-hidden="true">{s.mark}</span>{s.text}</span>;

function Group({ group, missing, reload }: { group: KeyGroup; missing: string; reload: () => Promise<unknown> }) {
  const [value, setValue] = useState("");
  const [conflict, setConflict] = useState("");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [busy, setBusy] = useState("");
  const [checking, setChecking] = useState("");
  const path = `/beta/keys/${group.id}`;
  const input = useId();
  const save = async (replace: boolean) => {
    setMessage("");
    setFieldError("");
    setBusy("save");
    try {
      const r = await api<KeySave>(path, "POST", group.id === "law" ? { lawOc: value } : { key: value, replace });
      setValue("");
      setConflict("");
      setMessage(`저장됨 — 저장 ${r.saved} · 교체 ${r.replaced} · 같은 키 ${r.unchanged}`);
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(e.message);
      else setFieldError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    setMessage("");
    setFieldError("");
    setBusy("remove");
    try {
      await api(path, "DELETE");
      setMessage("삭제했습니다.");
      await reload();
    } catch (e) {
      setFieldError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const probe = async (target: string) => {
    setChecking(target);
    try {
      const r = target === "law" ? await api<Probe>("/beta/keys/law/probe", "POST") : await api<{ message: string }>(`/public-apis/${target}/probe`, "POST");
      setMessage(r.message);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setChecking("");
      await reload();
    }
  };
  const s: State = group.id === "law"
    ? state(group.configured, group.check, missing)
    : group.configured ? { cls: "ok", mark: "✓", text: `${group.configuredCount}/${group.total}개 서비스에 저장됨` } : { cls: "off", mark: "–", text: missing };
  const empty = !value.trim();
  return (
    <section className="beta-card">
      <div className="beta-card-head">
        <h2><Icon name="key" />{group.name}</h2>
        <span className="beta-tag">{group.required ? "필수" : "선택"}</span>
        <Badge s={s} />
      </div>
      <p>{group.why}</p>
      <p className="beta-muted">
        발급처: <a href={group.issuerUrl} target="_blank" rel="noreferrer noopener">{group.issuerUrl}<span className="beta-sr"> (새 창)</span></a>
      </p>
      <div className="beta-key-row">
        <div className="beta-field beta-grow">
          <label htmlFor={input}>{group.id === "law" ? "OC 값" : "인증키"}</label>
          <input id={input} type="password" autoComplete="off" spellCheck={false} value={value} aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? input + "-error" : undefined} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="beta-row">
          <button className="primary" disabled={empty || !!busy} aria-describedby={empty ? input + "-why" : undefined} onClick={() => save(false)}>{busy === "save" ? "처리 중…" : "저장"}</button>
          {group.configured && <button className="danger" disabled={!!busy} onClick={remove}>{busy === "remove" ? "처리 중…" : "삭제"}</button>}
          {group.id === "law" && group.configured && <button disabled={!!checking} onClick={() => probe("law")}>{checking === "law" ? "확인 중…" : "연결 확인"}</button>}
        </div>
      </div>
      {empty && !fieldError && <p id={input + "-why"} className="beta-hint">값을 입력하면 저장할 수 있습니다.</p>}
      {fieldError && <p id={input + "-error"} className="beta-error" role="alert">{fieldError}</p>}
      {conflict && (
        <div className="beta-warn" role="alert">
          <p>{conflict}</p>
          <button disabled={!!busy} onClick={() => save(true)}>기존 키를 이 키로 교체</button>
        </div>
      )}
      {message && <p className="beta-saved" role="status">{message}</p>}
      {!!group.services.length && (
        <details open={group.id === "address"} className="beta-fold">
          <summary>{group.id === "data-go-kr" ? `이 키로 쓰는 서비스 ${group.services.length}개 (서비스마다 포털에서 활용 신청 필요)` : "서비스"}</summary>
          <div className="beta-table-wrap">
            <table className="beta-table beta-stack">
              <thead><tr><th scope="col">번호</th><th scope="col">서비스</th><th scope="col">쓰는 곳</th><th scope="col">상태</th><th scope="col"><span className="beta-sr">작업</span></th></tr></thead>
              <tbody>
                {group.services.map((v) => (
                  <tr key={v.id}>
                    <td data-label="번호" className="num">{v.code}</td>
                    <td data-label="서비스"><a href={v.url} target="_blank" rel="noreferrer noopener">{v.name}<span className="beta-sr"> (새 창)</span></a></td>
                    <td data-label="쓰는 곳">{v.purpose}</td>
                    <td data-label="상태"><Badge s={state(v.configured, v.check, missing)} /></td>
                    <td data-label="작업">{v.configured && <button disabled={!!checking} onClick={() => probe(v.id)}>{checking === v.id ? "확인 중…" : "연결 확인"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

// Reloads whenever the key list reloads, so a newly saved OC enables collection right away.
function CollectionBox({ rev }: { rev: number }) {
  const [c, setC] = useState<Collection | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api<Collection>("/beta/collection").then((x) => {
    setC(x);
    setError("");
  }, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, [rev]);
  if (error && !c) return <section className="beta-card"><h2><Icon name="sync" />법령 수집</h2><p className="beta-error" role="alert">수집 설정을 불러오지 못했습니다. {error}</p></section>;
  if (!c) return <section className="beta-card"><h2><Icon name="sync" />법령 수집</h2><p className="beta-muted" role="status">불러오는 중…</p></section>;
  return (
    <section className="beta-card">
      <h2><Icon name="sync" />법령 수집</h2>
      <p className="beta-muted">수집은 이 앱 안에서 직접 합니다. GitHub 등 다른 곳의 수집 결과를 받아오지 않습니다.</p>
      <label className="beta-check">
        <input type="checkbox" checked={c.dailyAuto} onChange={async (e) => {
          setSaved("");
          setError("");
          try {
            await api("/beta/collection", "POST", { dailyAuto: e.target.checked });
            setSaved(e.target.checked ? "저장됨 — 자동 수집 켜짐" : "저장됨 — 자동 수집 꺼짐");
          } catch (err) {
            setError((err as Error).message);
          }
          await load();
        }} />
        <span>앱이 켜져 있을 때 하루 한 번 자동 수집</span>
      </label>
      {saved && <p className="beta-saved" role="status">{saved}</p>}
      {error && <p className="beta-error" role="alert">{error}</p>}
      <p className="beta-muted">최근 자동 수집: <span className="num">{c.lastRunDate ? `${c.lastRunDate} · ${c.lastMessage}` : "없음"}</span></p>
      <div className="beta-actions">
        <button disabled={!c.lawConfigured || c.syncing || busy} aria-describedby={!c.lawConfigured ? "collect-why" : undefined} onClick={async () => {
          setBusy(true);
          try {
            await api("/sync", "POST");
            setMessage("수집을 시작했습니다. 기존 화면의 법규·갱신 현황에서 진행을 볼 수 있습니다.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
          await load();
        }}>{c.syncing || busy ? "수집 중…" : "지금 수집"}</button>
        {!c.lawConfigured && <p id="collect-why" className="beta-hint">법제처 OC를 저장해야 수집할 수 있습니다.</p>}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

// AI 연동 (user design 2026-10-15): reuses the existing ChatGPT sign-in of the old screen (연결 설정). The server returns
// the OpenAI sign-in address; it opens in a new tab of the user's browser, and the status is read again when this tab
// is shown again. Nothing about sign-in, consent or the outbound allow-list changes here.
export const AI_LINK_TEXT = { on: "연동 완료", off: "아직 미연동된 상태입니다" } as const;
type Opener = (url: string, target: string, features: string) => unknown;

export async function startChatGpt(open: Opener = (u, t, f) => window.open(u, t, f)) {
  const { url } = await api<{ url: string }>("/auth/chatgpt/start", "POST");
  open(url, "_blank", "noopener,noreferrer");
}

export function AiLinkStatus({ connected }: { connected: boolean }) {
  return <span className={`beta-status ${connected ? "ok" : "off"}`}>{connected ? AI_LINK_TEXT.on : AI_LINK_TEXT.off}</span>;
}

function AiLinkBox() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = () => api<{ auth?: { connected?: boolean } }>("/status").then((s) => {
      setConnected(!!s.auth?.connected);
      setError("");
    }, (e: Error) => setError(e.message));
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return (
    <section className="beta-card">
      <h2><Icon name="chat" />AI 연동</h2>
      <div className="beta-row">
        <button className="primary" disabled={busy} onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await startChatGpt();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>ChatGPT 연결하기</button>
        {connected !== null && <AiLinkStatus connected={connected} />}
      </div>
      {error && <p className="beta-error" role="alert">{error}</p>}
    </section>
  );
}

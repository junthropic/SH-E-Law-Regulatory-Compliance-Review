import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Collection, KeyGroup, Keys, KeySave, Probe } from "../server/beta-contract-v8";

// Key values are typed here and sent once to the local server. The server never returns them.
export function KeysPage() {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [error, setError] = useState("");
  const [rev, setRev] = useState(0);
  const load = () => api<Keys>("/beta/keys").then((k) => {
    setKeys(k);
    setRev((r) => r + 1);
  }, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h1>API 키 설정</h1>
      <p className="beta-muted">
        각 회사가 직접 발급받은 키로 법령·공공자료를 수집합니다. 키는 이 PC의 Windows 사용자 보호 저장소에 암호화해 저장하고, 화면·기록·내보내기에 표시하지 않습니다.
        키가 일부만 있어도 앱은 동작하며, 키가 없는 출처는 "{keys?.missingLabel ?? "미연결 — 수집 안 됨"}"으로 표시하고 그 근거가 필요한 판정은 보류합니다.
      </p>
      {keys?.storage === "memory" && <p className="beta-warn" role="note">지금은 세션 한정 저장소입니다. 앱을 끄면 저장한 키가 사라집니다.</p>}
      {error && <p className="beta-error" role="alert">{error}</p>}
      {keys?.groups.map((g) => <Group key={g.id} group={g} missing={keys.missingLabel} reload={load} />)}
      <CollectionBox rev={rev} />
    </>
  );
}

function state(configured: boolean, check: { state?: string; message?: string }, missing: string) {
  if (!configured) return { cls: "off", text: missing };
  if (check.state === "ok") return { cls: "ok", text: "연결 확인됨" };
  if (check.state === "failed") return { cls: "fail", text: "연결 실패 — " + (check.message || "") };
  return { cls: "saved", text: "저장됨 — 연결 확인 전" };
}

function Group({ group, missing, reload }: { group: KeyGroup; missing: string; reload: () => Promise<unknown> }) {
  const [value, setValue] = useState("");
  const [conflict, setConflict] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState("");
  const path = `/beta/keys/${group.id}`;
  const save = async (replace: boolean) => {
    setMessage("");
    try {
      const r = await api<KeySave>(path, "POST", group.id === "law" ? { lawOc: value } : { key: value, replace });
      setValue("");
      setConflict("");
      setMessage(`저장 ${r.saved} · 교체 ${r.replaced} · 같은 키 ${r.unchanged}`);
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(e.message);
      else setMessage((e as Error).message);
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
  const s = state(group.configured, group.check, missing);
  return (
    <section className="beta-card">
      <div className="beta-row beta-between">
        <h2>{group.name}</h2>
        <span className={`beta-chip ${group.required ? "required" : "optional"}`}>{group.required ? "필수" : "선택"}</span>
      </div>
      <p>{group.why}</p>
      <p>
        발급처: <a href={group.issuerUrl} target="_blank" rel="noreferrer noopener">{group.issuerUrl}</a>
      </p>
      <p className={`beta-state ${group.id === "law" ? s.cls : group.configured ? "saved" : "off"}`}>
        {group.id === "law" ? s.text : group.configured ? `${group.configuredCount}/${group.total}개 서비스에 저장됨` : missing}
      </p>
      <div className="beta-row">
        <label className="beta-field beta-grow">
          <span>{group.id === "law" ? "OC 값" : "인증키"}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button className="primary" disabled={!value.trim()} onClick={() => save(false)}>저장</button>
        {group.configured && (
          <button onClick={async () => {
            await api(path, "DELETE");
            setMessage("삭제했습니다.");
            await reload();
          }}>삭제</button>
        )}
        {group.id === "law" && group.configured && <button disabled={!!checking} onClick={() => probe("law")}>연결 확인</button>}
      </div>
      {conflict && (
        <p className="beta-warn" role="alert">
          {conflict} <button onClick={() => save(true)}>기존 키를 이 키로 교체</button>
        </p>
      )}
      {message && <p className="beta-muted" role="status">{message}</p>}
      {!!group.services.length && (
        <details open={group.id === "address"}>
          <summary>{group.id === "data-go-kr" ? `이 키로 쓰는 서비스 ${group.services.length}개 (서비스마다 포털에서 활용 신청 필요)` : "서비스"}</summary>
          <div className="beta-table-wrap">
            <table className="beta-table">
              <thead><tr><th>번호</th><th>서비스</th><th>쓰는 곳</th><th>상태</th><th /></tr></thead>
              <tbody>
                {group.services.map((v) => {
                  const st = state(v.configured, v.check, missing);
                  return (
                    <tr key={v.id}>
                      <td>{v.code}</td>
                      <td><a href={v.url} target="_blank" rel="noreferrer noopener">{v.name}</a></td>
                      <td>{v.purpose}</td>
                      <td className={`beta-state ${st.cls}`}>{st.text}</td>
                      <td>{v.configured && <button disabled={!!checking} onClick={() => probe(v.id)}>{checking === v.id ? "확인 중" : "연결 확인"}</button>}</td>
                    </tr>
                  );
                })}
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
  const [message, setMessage] = useState("");
  const load = () => api<Collection>("/beta/collection").then(setC, () => {});
  useEffect(() => {
    void load();
  }, [rev]);
  if (!c) return null;
  return (
    <section className="beta-card">
      <h2>법령 수집</h2>
      <p className="beta-muted">수집은 이 앱 안에서 직접 합니다. GitHub 등 다른 곳의 수집 결과를 받아오지 않습니다.</p>
      <label className="beta-check">
        <input type="checkbox" checked={c.dailyAuto} onChange={async (e) => {
          await api("/beta/collection", "POST", { dailyAuto: e.target.checked });
          await load();
        }} />
        앱이 켜져 있을 때 하루 한 번 자동 수집
      </label>
      <p className="beta-muted">최근 자동 수집: {c.lastRunDate ? `${c.lastRunDate} · ${c.lastMessage}` : "없음"}</p>
      <button disabled={!c.lawConfigured || c.syncing} onClick={async () => {
        try {
          await api("/sync", "POST");
          setMessage("수집을 시작했습니다. 기존 화면의 법규·갱신 현황에서 진행을 볼 수 있습니다.");
        } catch (e) {
          setMessage((e as Error).message);
        }
        await load();
      }}>{c.syncing ? "수집 중" : "지금 수집"}</button>
      {!c.lawConfigured && <p className="beta-muted">법제처 OC를 저장해야 수집할 수 있습니다.</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

import { useEffect, useState } from "react";
import { api, koreaToday, saveFile } from "./api";
import type { Notice, RestoreResult } from "../server/beta-contract-v8";

type Consent = { enabled: boolean; grantedAt?: string; revokedAt?: string; notice: string };
type Retention = { autoDeleteDays: 30 | 90 | 365 | null; choices: (30 | 90 | 365 | null)[]; log: { at: string; kind: string; ref: string; reason: string }[] };

export function DataPage() {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    api<Notice>("/beta/notice").then(setNotice, () => {});
  }, []);
  return (
    <>
      <h1>데이터 처리 안내</h1>
      {notice && (
        <section className="beta-card">
          <p><strong>{notice.betaLabel}</strong></p>
          <dl className="beta-notice">
            {notice.items.map((i) => (
              <div key={i.title}>
                <dt>{i.title}</dt>
                <dd>{i.text} <span className="beta-proof">시험 {i.proof.join(", ")}</span></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <Backup />
      <AiConsentBox />
      <RetentionBox />
      <PreviewBox />
    </>
  );
}

function Backup() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="beta-card">
      <h2>백업 내보내기·가져오기</h2>
      <p className="beta-muted">백업 파일은 암호화됩니다. 만든 Windows 사용자 계정에서 가져오기로 복원합니다. 인증키·설정·감사 기록은 백업에 들어가지 않으니 복원 뒤 키를 다시 저장하세요.</p>
      <div className="beta-row">
        <button className="primary" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/beta/backup", { credentials: "same-origin" });
            const text = await r.text();
            if (!r.ok) throw new Error(JSON.parse(text).error || "백업하지 못했습니다.");
            saveFile(`she-backup-${koreaToday()}.json`, text);
            setMessage("암호화 백업 파일을 만들었습니다. 안전한 곳에 보관하세요.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>암호화 백업 내보내기</button>
        <label className="beta-file">
          백업 가져오기
          <input type="file" accept="application/json,.json" disabled={busy} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              const r = await api<RestoreResult>("/beta/restore", "POST", { file: await f.text() });
              setMessage(`복원했습니다: 검토 ${r.reviews}건, 자료 ${r.documents}건. 복원한 자료는 다시 확인 전 상태로 표시됩니다.`);
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }} />
        </label>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function AiConsentBox() {
  const [c, setC] = useState<Consent | null>(null);
  const [sent, setSent] = useState(0);
  const load = () => {
    api<Consent>("/ai/consent").then(setC, () => {});
    api<{ outcome: string }[]>("/ai/send-log").then((l) => setSent(l.filter((x) => x.outcome === "sent").length), () => {});
  };
  useEffect(load, []);
  if (!c) return null;
  return (
    <section className="beta-card">
      <h2>AI 분석 전송 동의</h2>
      <p>{c.notice}</p>
      <p className="beta-muted">상태: {c.enabled ? `동의함 (${new Date(c.grantedAt!).toLocaleString("ko-KR")})` : "꺼짐"} · 지금까지 보낸 횟수 {sent}회</p>
      <button className={c.enabled ? "" : "primary"} onClick={async () => {
        setC(await api<Consent>("/ai/consent", "POST", { enabled: !c.enabled }));
        load();
      }}>{c.enabled ? "동의 철회" : "AI 전송에 동의"}</button>
    </section>
  );
}

function RetentionBox() {
  const [r, setR] = useState<Retention | null>(null);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const load = () => api<Retention>("/retention").then(setR, () => {});
  useEffect(() => {
    void load();
  }, []);
  if (!r) return null;
  return (
    <section className="beta-card">
      <h2>보존·삭제</h2>
      <label className="beta-field">
        <span>업로드 원본 자동 삭제</span>
        <select value={String(r.autoDeleteDays)} onChange={async (e) => {
          const v = e.target.value === "null" ? null : Number(e.target.value);
          await api("/retention", "POST", { autoDeleteDays: v });
          await load();
        }}>
          {r.choices.map((c) => <option key={String(c)} value={String(c)}>{c === null ? "자동 삭제 안 함 (계속 보관)" : `${c}일 지난 원본 삭제`}</option>)}
        </select>
      </label>
      <p className="beta-muted">원본을 지운 검토는 "원본 삭제됨 — 재검토 불가"로 표시됩니다.</p>
      <label className="beta-field">
        <span>업로드 자료 전체 영구 삭제 — 확인하려면 "전체 삭제"를 입력하세요</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button className="danger" disabled={confirm !== "전체 삭제"} onClick={async () => {
        const res = await api<{ deleted: number }>("/documents/delete-all", "POST", { confirm });
        setConfirm("");
        setMessage(`자료 ${res.deleted}건을 영구 삭제했습니다.`);
        await load();
      }}>전체 영구 삭제</button>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>삭제 기록 {r.log.length}건 (본문 없음)</summary>
        <ul>{r.log.map((l, n) => <li key={n}>{new Date(l.at).toLocaleString("ko-KR")} · {l.kind} · {l.reason}</li>)}</ul>
      </details>
    </section>
  );
}

function PreviewBox() {
  const [p, setP] = useState<{ safetyManagerV7: boolean; label: string } | null>(null);
  useEffect(() => {
    api<{ safetyManagerV7: boolean; label: string }>("/preview").then(setP, () => {});
  }, []);
  if (!p) return null;
  return (
    <section className="beta-card">
      <h2>안전관리자 판정 미리보기</h2>
      <p className="beta-muted">켜면 새 검토에 산업안전보건법 안전관리자 6개 의무 후보가 붙습니다. 모든 결과에 "{p.label}", 법률 기준일, 근거 조문이 표시됩니다. 끄면 기존 결과와 같습니다.</p>
      <label className="beta-check">
        <input type="checkbox" checked={p.safetyManagerV7} onChange={async (e) => setP(await api("/preview", "POST", { safetyManagerV7: e.target.checked }))} />
        미리보기 켜기
      </label>
    </section>
  );
}

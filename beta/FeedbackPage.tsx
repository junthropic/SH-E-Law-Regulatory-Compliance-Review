import { useState } from "react";
import { api, koreaToday, saveFile } from "./api";
import type { FeedbackFile } from "../server/beta-contract-v8";

const CATEGORIES = ["오류", "개선 제안", "법령·판정 내용", "기타"] as const;

// Feedback becomes a file the user saves and sends themselves. The app sends nothing.
export function FeedbackPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("오류");
  const [message, setMessage] = useState("");
  const [env, setEnv] = useState(true);
  const [status, setStatus] = useState("");
  return (
    <>
      <h1>피드백 보내기</h1>
      <p className="beta-muted">이 앱은 피드백을 자동으로 보내지 않습니다. 파일로 저장한 뒤 직접 첨부해 보내 주세요. 회사 자료나 실명은 적지 마세요.</p>
      <section className="beta-card">
        <label className="beta-field">
          <span>종류</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="beta-field">
          <span>내용</span>
          <textarea rows={6} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="beta-check">
          <input type="checkbox" checked={env} onChange={(e) => setEnv(e.target.checked)} />
          앱 버전·운영체제 종류·미리보기/AI 설정 상태 포함 (검토 내용·자료·키는 들어가지 않습니다)
        </label>
        <button className="primary" disabled={!message.trim()} onClick={async () => {
          try {
            const f = await api<FeedbackFile>("/beta/feedback", "POST", { category, message, includeEnvironment: env });
            saveFile(`she-feedback-${koreaToday()}.json`, JSON.stringify(f, null, 2));
            setStatus("피드백 파일을 만들었습니다. 경로·키처럼 보이는 값은 가려졌습니다.");
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}>피드백 파일 만들기</button>
        {status && <p role="status">{status}</p>}
      </section>
    </>
  );
}

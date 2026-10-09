import { useState } from "react";

export function ReviewApproval({ api, post, action, refresh, reviews }: {
  api: (url: string) => Promise<any>; post: (url: string, body: unknown) => Promise<any>;
  action: (fn: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>;
  reviews: { id: string; title: string; status: string }[];
}) {
  const [context, setContext] = useState<any>(null);
  const [reviewId, setReviewId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [gazetteUrl, setGazetteUrl] = useState("");
  const [checks, setChecks] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const labels = { delegationChecked: "위임·준용 범위 확인", exceptionsChecked: "단서·예외 확인", annexesChecked: "별표·서식 원본 대조", historyChecked: "연혁·부칙·조문별 시행일 확인" };
  const setRule = (index: number, key: string, value: any) => setRules(rs => rs.map((r, i) => i === index ? { ...r, [key]: value } : r));
  return <details className="basis-item">
    <summary>검토 확인서 등록</summary>
    <p>완료된 검토를 선택하고 실제로 대조한 내용만 입력하세요. 사실의 진실성이나 전문가 자격을 앱이 인증하지 않습니다. 규칙을 추가하지 않으면 원문 확인만 등록됩니다.</p>
    <form onSubmit={e => { e.preventDefault(); void action(async () => {
      if (!context || context.reviewId !== reviewId) throw new Error("검토 원문 목록을 다시 불러오세요.");
      await post("/basis/approve", { ...context, reviewer, note, gazetteUrl,
        evidenceHashes: context.evidence.map((e: any) => e.hash),
        ...Object.fromEntries(Object.keys(labels).map(k => [k, checks.includes(k)])),
        rules: rules.map(r => ({ id: r.id, version: r.version, title: r.title, conclusion: r.conclusion,
          region: context.region, effectiveFrom: r.effectiveFrom, approved: false, reviewer: "",
          requiredFacts: r.requiredFacts.split(",").map((s: string) => s.trim()).filter(Boolean),
          exceptionFacts: r.exceptionFacts.split(",").map((s: string) => s.trim()).filter(Boolean),
          predicate: { fact: r.fact, operator: r.operator, value: r.value },
          evidenceHashes: Object.keys(r.quotes).filter(h => r.quotes[h].trim()),
          quotes: Object.fromEntries(Object.entries(r.quotes).filter(([, q]) => String(q).trim())),
        })),
      });
      setChecks([]); setMessage("검토 확인서를 등록했습니다. 사업장 적용 여부는 별도로 확인하세요.");
      await refresh();
    }); }}>
      <label>확인 대상 검토<select aria-label="확인 대상 검토" required value={reviewId} onChange={e => {
        setReviewId(e.target.value); setContext(null); setChecks([]); setRules([]); setMessage("");
      }}><option value="">완료된 검토 선택</option>{reviews.filter(r => r.status === "completed").map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
      <button type="button" className="secondary" disabled={!reviewId} onClick={() => void action(async () => {
        setContext(null); setChecks([]); setRules([]);
        setContext(await api("/basis/context/" + reviewId));
      })}>대상 원문 목록 불러오기</button>
      {context && <>
        <p>{context.region} {context.municipality} · 기준일 {context.asOf}</p>
        <ul>{context.evidence.map((e: any) => <li key={e.hash}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> · 버전 {e.version} · 시행 {e.effectiveFrom}</li>)}</ul>
        <label>검토자 이름<input required minLength={2} maxLength={100} value={reviewer} onChange={e => setReviewer(e.target.value)} /></label>
        <label>대조한 공식 공보 주소<input required type="url" value={gazetteUrl} onChange={e => setGazetteUrl(e.target.value)} placeholder="https://공식기관.go.kr/..." /></label>
        <label>원문 대조 내용과 판단 이유<textarea required minLength={30} maxLength={5000} value={note} onChange={e => setNote(e.target.value)} /></label>
        {Object.entries(labels).map(([key, label]) => <label key={key}><input type="checkbox" required checked={checks.includes(key)} onChange={e => setChecks(current => e.target.checked ? [...current, key] : current.filter(k => k !== key))} />{label}</label>)}
        <details><summary>검토한 판단 규칙 입력 (선택)</summary>
          <p>검토자가 확인한 조건·예외·정확한 원문 인용을 입력하세요. 등록된 규칙도 사실·근거 검증을 통과한 경우에만 명확한 리스크를 생성합니다.</p>
          {rules.map((r, index) => <fieldset key={index}><legend>규칙 {index + 1}</legend>
            {[["id", "규칙 ID"], ["version", "규칙 버전"], ["title", "규칙 제목"], ["effectiveFrom", "시행일"], ["fact", "판정할 사실 키"], ["value", "비교 값"], ["requiredFacts", "필수 사실 키 (쉼표 구분)"], ["exceptionFacts", "예외 사실 키 (쉼표 구분)"], ["conclusion", "조건 충족 시 판단"]].map(([key, label]) => <label key={key}>{label}<input required={key !== "exceptionFacts"} type={key === "effectiveFrom" ? "date" : "text"} value={r[key]} onChange={e => setRule(index, key, e.target.value)} /></label>)}
            <label>비교 연산<select value={r.operator} onChange={e => setRule(index, "operator", e.target.value)}>{[["eq", "일치"], ["gte", "이상"], ["gt", "초과"], ["lt", "미만"], ["lte", "이하"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {context.evidence.map((e: any) => <label key={e.hash}>{e.title} — 규칙 근거의 정확한 인용 (미사용 시 비움)<textarea value={r.quotes[e.hash] || ""} onChange={event => setRule(index, "quotes", { ...r.quotes, [e.hash]: event.target.value })} /></label>)}
            <button type="button" className="secondary" onClick={() => setRules(rs => rs.filter((_, i) => i !== index))}>이 규칙 제거</button>
          </fieldset>)}
          <button type="button" className="secondary" onClick={() => setRules(rs => [...rs, { id: "", version: "", title: "", effectiveFrom: "", fact: "", operator: "eq", value: "", requiredFacts: "", exceptionFacts: "", conclusion: "", quotes: {} }])}>판단 규칙 추가</button>
        </details>
        <button className="secondary" disabled={checks.length !== 4 || context.evidence.length < 2}>확인서 제출</button>
      </>}
    </form>
    {message && <p role="status">{message}</p>}
  </details>;
}

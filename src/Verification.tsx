import type { Evidence } from "../shared/types.js";
import { useState } from "react";
import {
  checkLabels,
  passageLabels,
  type BasisCheck,
  type VerificationReport,
} from "../shared/verification.js";

function Checks({ checks }: { checks: BasisCheck[] }) {
  return (
    <dl className="basis-checks">
      {checks.map((c) => (
        <div key={c.key}>
          <dt>
            {c.label} <span>{checkLabels[c.state]}</span>
          </dt>
          <dd>{c.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Verification({
  report,
  evidence,
  openEvidence,
  collectReference,
  aiAvailable = false,
  busy = false,
}: {
  report?: VerificationReport;
  evidence: Evidence[];
  openEvidence: (e: Evidence) => void;
  collectReference?: (title: string, useAi: boolean) => void;
  aiAvailable?: boolean;
  busy?: boolean;
}) {
  const [analyzeAgain, setAnalyzeAgain] = useState(false);
  if (!report) return null;
  const byId = new Map(evidence.map((e) => [e.id, e]));
  return (
    <section
      className="card basis-verification"
      aria-labelledby="basis-verification-title"
    >
      <h2 id="basis-verification-title">근거별 검증</h2>
      <p>
        기준일·원문 상태와 추가 대조할 내용을 정리했습니다. 문구 탐지는 예외
        적용 여부나 위반 판정이 아닙니다.
      </p>
      <Checks checks={report.checks} />
      {collectReference && (
        <div className="no-print">
          <p>
            ‘원문 수집·재검토’를 누르면 법제처에 해당 법규명을 조회하고 새
            검토를 만듭니다. 기존 결과는 보존됩니다.
          </p>
          {aiAvailable ? (
            <label>
              <input
                type="checkbox"
                checked={analyzeAgain}
                disabled={busy}
                onChange={(e) => setAnalyzeAgain(e.target.checked)}
              />
              추가 원문과 질문·선택 자료를 OpenAI로 보내 AI 재분석하기
            </label>
          ) : null}
          <p>
            {analyzeAgain
              ? "기존 검토의 모델로 추가 원문을 포함해 다시 분석합니다."
              : "원문 수집과 자료 검증을 실행합니다. AI 분석은 실행하지 않습니다."}
          </p>
        </div>
      )}
      {!report.basis.length && (
        <p>확보된 법령·조례 전문이 없어 근거별 검증을 진행하지 못했습니다.</p>
      )}
      {report.basis.map((b) => {
        const e = byId.get(b.evidenceId);
        if (!e) return null;
        return (
          <details key={b.evidenceId} className="basis-item">
            <summary>
              {e.title}{" "}
              <span>
                시행 {e.effectiveFrom || "미확인"} ·{" "}
                {b.checks.filter((c) => c.state !== "checked").length}개 대조
                항목
              </span>
            </summary>
            <button
              className="secondary"
              type="button"
              onClick={() => openEvidence(e)}
            >
              저장된 원문 보기
            </button>
            <p>
              버전 {e.version} · 수집{" "}
              {new Date(e.fetchedAt).toLocaleString("ko-KR")}
            </p>
            <Checks checks={b.checks} />
            {!!e.attachments?.length && <ul>{e.attachments.map((a, index) => <li key={index}>
              {a.title} — {a.state === "collected" ? "원본·추출문 확보 / 원본 대조 전" : a.state === "extraction_failed" ? "원본 확보 / 추출문 미확보" : "원본 미확보"}
              <br />버전 {a.version || "미확인"} · 시행 {a.effectiveFrom || "미확인"} · 수집 시도 {new Date(a.fetchedAt).toLocaleString("ko-KR")}
              {a.url && <> · <a href={a.url} target="_blank" rel="noreferrer">공식 출처</a></>}
              <br />{a.note}
            </li>)}</ul>}
            <h3>연결 법규</h3>
            <p>
              원문에 명시된 법규명으로 찾은 후보입니다. 약칭이나 “법·영” 참조는
              자동 확정하지 않습니다.
            </p>
            {b.references.length ? (
              <ul>
                {b.references.map((r) => (
                  <li key={r.title}>
                    {r.title} —{" "}
                    {r.state === "missing"
                      ? "연결 원문 필요"
                      : r.state === "ambiguous"
                        ? "버전 충돌 대조 필요"
                        : "원문 후보 연결됨 · 적용 조항 대조 필요"}
                    {r.evidenceIds.map((id) => {
                      const target = byId.get(id);
                      return target ? (
                        <button
                          className="secondary"
                          type="button"
                          key={id}
                          onClick={() => openEvidence(target)}
                        >
                          {target.title} 원문 보기
                        </button>
                      ) : null;
                    })}
                    {r.state === "missing" && collectReference ? (
                      <button
                        className="secondary no-print"
                        type="button"
                        disabled={busy}
                        onClick={() => collectReference(r.title, analyzeAgain)}
                      >
                        원문 수집·재검토 — {r.title}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                명시된 연결 법규 후보가 없습니다. 위임 규정이 없다는 뜻은
                아닙니다.
              </p>
            )}
            {b.referencesTotal > b.references.length && (
              <p>
                전체 {b.referencesTotal}개 중 {b.references.length}개만
                표시합니다. 나머지는 저장된 원문에서 대조하세요.
              </p>
            )}
            <h3>별표·부칙·예외 확인 위치</h3>
            <p>
              표현이 탐지된 위치 {b.passagesTotal}개 중 {b.passages.length}개를
              표시합니다. 문장이 잘린 발췌는 원문 앞뒤를 함께 확인하세요.
            </p>
            {b.passages.map((p, i) => (
              <div className="basis-passage" key={`${p.kind}-${p.offset}-${i}`}>
                <strong>{passageLabels[p.kind]}</strong>
                <blockquote>{p.quote}</blockquote>
              </div>
            ))}
            {!b.passages.length && (
              <p>
                탐지된 표현이 없습니다. 별표·부칙·예외가 없다는 확인은 아닙니다.
              </p>
            )}
          </details>
        );
      })}
      <small>
        이 검토를 실행한 시점의 기록입니다. 원문 변경 후에는 새 검토가
        필요합니다.
      </small>
    </section>
  );
}

import { useEffect, useState } from "react";
import type { ReviewResult, DocumentRecord } from "../shared/types.js";
import {
  comparisonLabels,
  decisionLabels,
  gazetteSites,
  type ComparisonInput,
  type ComparisonRecord,
  type CaseAssessment,
} from "../shared/dossier.js";
type Data = {
  comparisons: ComparisonRecord[];
  assessment: CaseAssessment;
  documents: Pick<
    DocumentRecord,
    "id" | "name" | "confirmed" | "officialSources" | "warnings"
  >[];
};
type Api = <T = any>(path: string, options?: RequestInit) => Promise<T>;
export function Dossier({
  review,
  api,
  post,
  onUpdated,
}: {
  review: ReviewResult;
  api: Api;
  post: (path: string, body?: unknown) => Promise<any>;
  onUpdated: () => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [evidenceId, setEvidence] = useState(review.evidence[0]?.id || ""),
    [documentId, setDocument] = useState(""),
    [kind, setKind] = useState<ComparisonInput["kind"]>("gazette");
  const [lawQuote, setLawQuote] = useState(""),
    [documentQuote, setDocumentQuote] = useState(""),
    [documentText, setDocumentText] = useState(""),
    [truncated, setTruncated] = useState(false);
  const [publicationDate, setPublication] = useState(""),
    [effectiveDate, setEffective] = useState(""),
    [sourceUrl, setSource] = useState(""),
    [fileName, setFileName] = useState("공보.pdf");
  const [reviewer, setReviewer] = useState(""),
    [note, setNote] = useState(""),
    [originalChecked, setOriginalChecked] = useState(false);
  const [conditionId, setCondition] = useState(""),
    [decision, setDecision] = useState<"applies" | "excluded" | "uncertain">(
      "uncertain",
    );
  const base = `/reviews/${review.id}`;
  useEffect(() => {
    let active = true;
    api<Data>(base + "/dossier")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [review.id]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setData(await api<Data>(base + "/dossier"));
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  const evidence = review.evidence.find((e) => e.id === evidenceId),
    condition = data?.assessment.conditions.find((c) => c.id === conditionId),
    currentDocument = data?.documents.find((d) => d.id === documentId);
  return (
    <section
      className="card basis-verification"
      aria-label="원본 대조와 사업장 적용 검토"
    >
      <h2>원본 대조와 사업장 적용 검토</h2>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <p>
        선택한 조항·별표의 차이와 사업장 사실을 연결합니다. 대조에 사용한 자료는
        다음 재검토의 선택 자료에 포함되며, AI 재검토 시 발췌가 전송됩니다. 자동
        비교와 검토자 기록은 법률 규칙 승인과 구분됩니다.
      </p>
      <details className="basis-item">
        <summary>공보·별표·부칙 원본 대조</summary>
        <p>
          {gazetteSites.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              {s.label} ↗　
            </a>
          ))}
        </p>
        <div className="field-grid">
          <label>
            공식 첨부파일 주소
            <input
              value={sourceUrl}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://… 파일 다운로드 주소"
            />
          </label>
          <label>
            저장할 파일명
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
          </label>
        </div>
        <button
          className="secondary"
          disabled={busy || !sourceUrl}
          onClick={() =>
            void run(async () => {
              const d = await post("/documents/official", {
                url: sourceUrl,
                name: fileName,
              });
              setDocument(d.id);
              setDocumentText(d.text.slice(0, 100000));
              setTruncated(d.text.length > 100000);
            })
          }
        >
          공식 파일 가져오기
        </button>
        <p>
          경기도청·화성시청·법령정보센터 첨부파일을 지원합니다. 다른 기관 파일은
          자료함에서 업로드한 뒤 선택할 수 있습니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await post(base + "/comparisons", {
                evidenceId,
                documentId,
                kind,
                lawQuote,
                documentQuote,
                publicationDate,
                effectiveDate,
                sourceUrl,
              });
            });
          }}
        >
          <div className="field-grid">
            <label>
              대조할 법령·조례
              <select
                value={evidenceId}
                onChange={(e) => {
                  setEvidence(e.target.value);
                  setLawQuote("");
                }}
              >
                {review.evidence.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · 시행 {e.effectiveFrom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              대조 자료
              <select
                value={documentId}
                onChange={(e) => {
                  setDocument(e.target.value);
                  setDocumentQuote("");
                  setDocumentText("");
                  setTruncated(false);
                  setSource(
                    data?.documents.find((d) => d.id === e.target.value)
                      ?.officialSources?.[0]?.url || "",
                  );
                }}
              >
                <option value="">자료 선택</option>
                {data?.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              대조 구분
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as ComparisonInput["kind"])
                }
              >
                {Object.entries(comparisonLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>법령 저장 원문에서 발췌 선택</summary>
            <pre className="document-text">
              {evidence?.text.slice(0, 100000)}
            </pre>
            {(evidence?.text.length || 0) > 100000 && (
              <p>
                원문 앞 100,000자만 표시합니다. 뒤쪽 별표·부칙은 근거별 검증의
                원문 보기에서 확인하세요.
              </p>
            )}
          </details>
          <button
            className="secondary"
            type="button"
            disabled={busy || !documentId}
            onClick={() =>
              void run(async () => {
                const d = await api<{ text: string; truncated: boolean }>(
                  `/documents/${documentId}/text`,
                );
                setDocumentText(d.text);
                setTruncated(d.truncated);
              })
            }
          >
            자료 추출문 보기
          </button>
          {documentId && (
            <a
              href={`/api/documents/${documentId}/original`}
              target="_blank"
              rel="noreferrer"
            >
              자료 원본 열기 ↗
            </a>
          )}
          {documentText && (
            <details open>
              <summary>{currentDocument?.name || "가져온 자료"} 추출문</summary>
              <pre className="document-text">{documentText}</pre>
              {currentDocument?.warnings?.length ? (
                <p>{[...new Set(currentDocument.warnings)].join(" / ")}</p>
              ) : null}
              {truncated && (
                <p>
                  앞 100,000자만 표시합니다. 원본에서 나머지 범위를 확인하세요.
                </p>
              )}
            </details>
          )}
          <div className="field-grid">
            <label>
              법령 대조 발췌
              <textarea
                required
                minLength={8}
                maxLength={20000}
                value={lawQuote}
                onChange={(e) => setLawQuote(e.target.value)}
                placeholder="같은 조항·별표에 해당하는 저장 원문을 붙여넣으세요."
              />
            </label>
            <label>
              공보·별표 대조 발췌
              <textarea
                required
                minLength={8}
                maxLength={20000}
                value={documentQuote}
                onChange={(e) => setDocumentQuote(e.target.value)}
              />
            </label>
          </div>
          <div className="field-grid">
            <label>
              원본에서 확인한 공포일
              <input
                type="date"
                value={publicationDate}
                onChange={(e) => setPublication(e.target.value)}
              />
            </label>
            <label>
              원본에서 확인한 시행일
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffective(e.target.value)}
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || !documentId || !evidenceId}
          >
            선택 범위 대조·저장
          </button>
        </form>
      </details>
      <details className="basis-item">
        <summary>사업장 사실과 조항·예외 연결</summary>
        <p>
          원문 표현으로 필요한 사실의 후보를 연결합니다. 실제 적용 여부는
          검토자가 원문과 사업장 상황을 대조해야 합니다.
        </p>
        <dl className="basis-checks">
          {data?.assessment.facts.map((f) => (
            <div key={f.key}>
              <dt>
                {f.label} ·{" "}
                {f.state === "confirmed"
                  ? "사용자 답변 확인 · 원본 입증 별도"
                  : f.state === "conflict" ? "입력 충돌 · 판단 보류" : f.state === "incomplete"
                    ? "형식 보완 필요"
                    : "미확인"}
              </dt>
              <dd>{f.value || "미입력"}</dd>
              {f.state !== "confirmed" && <dd>{f.question}</dd>}
            </div>
          ))}
        </dl>
        <p>
          보완할 사실은 결과의 추가 질문에 입력한 뒤 ‘답변 반영하여 재검토’를
          실행하세요.
        </p>
        <label>
          적용 조건 후보
          <select
            value={conditionId}
            onChange={(e) => {
              setCondition(e.target.value);
              setDecision("uncertain");
            }}
          >
            <option value="">조건 선택</option>
            {data?.assessment.conditions.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}.{" "}
                {review.evidence.find((e) => e.id === c.evidenceId)?.title} —{" "}
                {c.quote.slice(0, 55)}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <p>
            {data.assessment.totalConditions}개 후보 중{" "}
            {data.assessment.conditions.length}개 표시
          </p>
        )}
        {condition && (
          <>
            <blockquote>{condition.quote}</blockquote>
            <p>
              연결 사실:{" "}
              {condition.factKeys
                .map(
                  (k) =>
                    data?.assessment.facts.find((f) => f.key === k)?.label || k,
                )
                .join(", ")}
            </p>
            <p>
              미확인:{" "}
              {condition.missing.length
                ? condition.missing
                    .map(
                      (k) =>
                        data?.assessment.facts.find((f) => f.key === k)
                          ?.label || k,
                    )
                    .join(", ")
                : "연결된 필수 사실 입력됨 · 적용 판단은 별도"}
            </p>
            <label>
              검토자 판단
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as typeof decision)}
              >
                {Object.entries(decisionLabels).map(([id, label]) => (
                  <option
                    key={id}
                    value={id}
                    disabled={
                      id !== "uncertain" && condition.missing.length > 0
                    }
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={
                busy || reviewer.trim().length < 2 || note.trim().length < 15
              }
              onClick={() =>
                void run(async () => {
                  await post(base + "/conditions", {
                    conditionId,
                    reviewer,
                    note,
                    decision,
                  });
                })
              }
            >
              아래 검토자 정보로 판단 기록
            </button>
          </>
        )}
        {data?.assessment.decisions.map((d, i) => (
          <p key={i}>
            {decisionLabels[d.decision]} · {d.reviewer} · {d.note}
          </p>
        ))}
      </details>
      <details className="basis-item">
        <summary>
          대조 결과와 검토자 확인 기록 ({data?.comparisons.length || 0})
        </summary>
        {data?.comparisons.map((c) => (
          <article key={c.id} className="basis-item">
            <h3>
              {comparisonLabels[c.kind]} — {c.documentName}
            </h3>
            <p>
              {c.provenance === "downloaded"
                ? "앱이 공식 출처에서 파일 수집"
                : "사용자 제공 자료·출처"}{" "}
              · 선택한 발췌 범위 대조
            </p>
            <dl className="basis-checks">
              {c.checks.map((check) => (
                <div key={check.label}>
                  <dt>
                    {check.label} ·{" "}
                    {check.state === "match"
                      ? "선택 범위 일치"
                      : check.state === "difference"
                        ? "차이 있음"
                        : "추가 대조"}
                  </dt>
                  <dd>{check.detail}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>문구 차이 보기 (삭제·추가)</summary>
              <pre className="document-text">
                {c.changes.map((d, i) => (
                  <span
                    className={
                      d.added
                        ? "comparison-added"
                        : d.removed
                          ? "comparison-removed"
                          : ""
                    }
                    key={i}
                  >
                    {d.added ? "[추가] " : d.removed ? "[삭제] " : ""}
                    {d.value}
                  </span>
                ))}
              </pre>
              <p>법령 수치: {c.numbers.law.join(" / ") || "없음"}</p>
              <p>자료 수치: {c.numbers.document.join(" / ") || "없음"}</p>
            </details>
            {c.review ? (
              <p>
                검토자 기록: {c.review.reviewer} · {c.review.note} ·{" "}
                {new Date(c.review.reviewedAt).toLocaleString("ko-KR")}
              </p>
            ) : (
              <button
                className="secondary"
                disabled={
                  busy ||
                  !originalChecked ||
                  reviewer.trim().length < 2 ||
                  note.trim().length < 20
                }
                onClick={() =>
                  void run(async () => {
                    await post(base + `/comparisons/${c.id}/confirm`, {
                      reviewer,
                      note,
                      originalChecked,
                    });
                  })
                }
              >
                아래 검토자 정보로 원본 대조 기록
              </button>
            )}
          </article>
        ))}
        {!data?.comparisons.length && <p>아직 저장된 대조 결과가 없습니다.</p>}
      </details>
      <div className="field-grid">
        <label>
          검토자 이름
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          검토 근거·차이 해석·유의사항
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={3000}
            placeholder="확인한 원본·페이지·적용 조건과 판단 이유를 20자 이상 적어주세요."
          />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={originalChecked}
          onChange={(e) => setOriginalChecked(e.target.checked)}
        />
        원본의 선택 범위·표·수치·날짜를 직접 확인했습니다.
      </label>
      <p>
        확인 기록은 검토자가 입력한 판단입니다. 자동으로 전문 완전성이나 법률
        규칙을 승인하지 않습니다.
      </p>
      <a
        className="secondary"
        href={`/api/reviews/${review.id}/reviewer-packet`}
      >
        검토자 인계 자료 다운로드
      </a>
      <p>
        인계 자료의 확인서 초안을 실제 검토 내용으로 완성한 뒤 연결 설정의 ‘검토
        확인서 등록’으로 승인할 수 있습니다. 복잡한 예외를 단일 조건 규칙으로
        등록하지 마세요.
      </p>
    </section>
  );
}

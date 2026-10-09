import { jurisdictions } from "../shared/jurisdictions.js";
import { resultStateLabels } from "../shared/result-language.js";
import {
  DocumentMetadata,
  QuantityCalculator,
  McpSearch,
  AdvancedSettings,
} from "./Tools.js";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  BookOpen,
  Files,
  Settings2,
  RefreshCw,
  ShieldCheck,
  Search,
  Check,
  ChevronRight,
  MapPin,
  Clock3,
  AlertTriangle,
  Download,
  Upload,
  ExternalLink,
  LogOut,
  LoaderCircle,
  Scale,
} from "lucide-react";
import type {
  ReviewResult,
  DocumentRecord,
  Evidence,
  SourceStatus,
} from "../shared/types.js";
import { regions } from "../shared/types.js";
import { PublicApiSettings, PublicApiSearch } from "./PublicApis.js";
import { Verification } from "./Verification.js";
import { Dossier } from "./Dossier.js";
import {
  informationNotice,
  informationSections,
} from "../shared/information-notice.js";

let csrf = "";
async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch("/api" + url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "x-csrf-token": csrf,
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "요청 실패");
  return data;
}
const post = (url: string, data: unknown = {}) =>
  api(url, { method: "POST", body: JSON.stringify(data) });
type Page =
  | "new"
  | "history"
  | "documents"
  | "sources"
  | "settings"
  | "result"
  | "public";
const categories = {
  clear_risk: {
    label: "명확한 법률 리스크",
    short: "명확한 리스크",
    color: "red",
  },
  human_review: {
    label: "사람의 판단 필요",
    short: "해석·쟁점 검토",
    color: "amber",
  },
  more_data: {
    label: "추가 자료 필요",
    short: "추가 자료 확인",
    color: "blue",
  },
};
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("ko-KR") : "아직 확인 전";
export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.hash === "#settings" ? "settings" : "new",
  );
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const attachableDocs = docs.filter((d) => d.origin !== "intake");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [prompt, setPrompt] = useState("");
  const [region, setRegion] = useState("경기도");
  const [municipality, setMunicipality] = useState("");
  const [asOf, setAsOf] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(),
    ),
  );
  const [useAi, setUseAi] = useState(false);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [model, setModel] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [promptHelpOpen, setPromptHelpOpen] = useState(false);
  const [oc, setOc] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState<Evidence | null>(null);
  const [diff, setDiff] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  async function refresh() {
    const [s, h, d, e] = await Promise.all([
      api("/status"),
      api<any[]>("/reviews"),
      api<DocumentRecord[]>("/documents"),
      api<Evidence[]>("/evidence"),
    ]);
    setStatus(s);
    setHistory(h);
    setDocs(d);
    setEvidence(e);
  }
  useEffect(() => {
    let alive = true;
    api("/bootstrap")
      .then((b) => {
        csrf = b.csrf;
        return refresh();
      })
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!status?.syncing && !status?.auth?.pending) return;
    const t = setInterval(() => {
      api("/status")
        .then((s) => {
          setStatus(s);
          if (status?.syncing && !s.syncing)
            void refresh().catch((e) => setError(e.message));
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, [status?.syncing, status?.auth?.pending]);
  useEffect(() => {
    if (!result || result.status !== "running") return;
    const source = new EventSource("/api/reviews/" + result.id + "/events");
    source.onmessage = (event) => {
      const r = JSON.parse(event.data);
      setResult(r);
      if (r.status !== "running") {
        source.close();
        void refresh();
      }
    };
    source.onerror = () => {
      source.close();
      api<ReviewResult>("/reviews/" + result.id)
        .then(setResult)
        .catch((e) => setError(e.message));
    };
    return () => source.close();
  }, [result?.id, result?.status]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  async function action(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setBusy(false);
    }
  }
  async function openReview(id: string) {
    await action(async () => {
      setResult(await api("/reviews/" + id));
      setAnswers({});
      setPage("result");
    });
  }
  async function submit(e?: FormEvent, follow = false) {
    e?.preventDefault();
    await action(async () => {
      const request =
        follow && result
          ? {
              ...result.request,
              answers: { ...result.request.answers, ...answers },
            }
          : {
              prompt,
              region,
              municipality,
              asOf,
              documentIds: selectedDocs,
              useAi,
              model,
              answers: {},
            };
      const { id } = await post("/reviews", request);
      setResult(await api("/reviews/" + id));
      setPage("result");
      await refresh();
    });
  }
  async function loadModels() {
    await action(async () => {
      const m = await api<{ id: string; name: string }[]>(
        "/auth/chatgpt/models",
      );
      setModels(m);
      setToast(
        m.length
          ? "사용 가능한 모델을 불러왔습니다."
          : "이 계정에서 표시할 모델이 없습니다.",
      );
    });
  }
  async function upload(file: File) {
    await action(async () => {
      const form = new FormData();
      form.append("file", file);
      await api("/documents", { method: "POST", body: form });
      await refresh();
      setToast("자료가 로컬 자료함에 저장되었습니다.");
    });
  }
  function nav(p: Page) {
    setPage(p);
    setError("");
  }
  const pending =
    status?.sources?.filter((s: SourceStatus) => s.status === "ok").length || 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <aside className="sidebar no-print">
        <a className="brand" href="/" aria-label="SH E 홈">
          <span className="brand-mark">
            <Scale size={23} />
          </span>
          <span>
            SH<span className="dot">·</span>E <small>LAW CHECK</small>
          </span>
        </a>
        <button
          className={"nav-new " + (page === "new" ? "active" : "")}
          aria-current={page === "new" ? "page" : undefined}
          onClick={() => nav("new")}
        >
          <Plus size={18} />새 법규 검토
        </button>
        <nav aria-label="주 메뉴">
          {(
            [
              {
                id: "history",
                icon: Clock3,
                label: "검토 기록",
                count: history.length,
              },
              {
                id: "documents",
                icon: Files,
                label: "자료함",
                count: docs.length,
              },
              { id: "sources", icon: BookOpen, label: "법규·갱신 현황" },
              { id: "public", icon: Search, label: "공공자료 조회" },
              { id: "settings", icon: Settings2, label: "연결 설정" },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "selected" : ""}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => nav(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {"count" in n && <span className="nav-count">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label recent-label">최근 검토</div>
        <div className="recent">
          {history.slice(0, 4).map((h) => (
            <button
              key={h.id}
              title={h.title}
              onClick={() => void openReview(h.id)}
            >
              <span>{h.title}</span>
            </button>
          ))}
          {!history.length && (
            <p>
              첫 검토를 시작하면
              <br />
              여기에 기록됩니다.
            </p>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar no-print">
          <div>
            <button
              type="button"
              className="breadcrumb"
              onClick={() => nav("new")}
            >
              워크스페이스
            </button>
            <ChevronRight size={14} />
            <span>
              {
                {
                  new: "새 법규 검토",
                  history: "검토 기록",
                  documents: "자료함",
                  sources: "법규·갱신 현황",
                  public: "공공자료 조회",
                  settings: "연결 설정",
                  result: "검토 결과",
                }[page]
              }
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              {error}
              <button onClick={() => setError("")}>닫기</button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <Check size={16} />
              {toast}
            </div>
          )}
          {!ready ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              워크스페이스를 준비하고 있습니다.
            </div>
          ) : (
            <>
              {page === "new" && (
                <>
                  <div className="page-heading">
                    <h1>새 법규 검토</h1>
                    <p>
                      사업장 상황과 기준일을 입력하면 수집된 근거와 추가
                      확인사항을 정리합니다.
                    </p>
                    <p className="review-use-notice">본 자료조회와 별개로 업무에 있어 활용 및 참고는 본인의 판단이 반드시 필요합니다</p>
                  </div>
                  <div className="review-layout">
                    <section className="review-work" aria-label="검토 작성">
                      <form
                        className="composer card"
                        onSubmit={(e) => void submit(e)}
                      >
                        <fieldset className="intake-lock">
                          <div className="card-title review-prompt-title">
                            <h2>
                              <label htmlFor="review-prompt">
                                검토할 업무 상황
                              </label>
                            </h2>
                            <div
                              className="prompt-help"
                              onMouseEnter={() => setPromptHelpOpen(true)}
                              onMouseLeave={() => setPromptHelpOpen(false)}
                            >
                              <button
                                type="button"
                                className="prompt-help-button"
                                aria-label="업무 상황 입력 도움말"
                                aria-describedby={promptHelpOpen ? "prompt-help-text" : undefined}
                                aria-expanded={promptHelpOpen}
                                onFocus={() => setPromptHelpOpen(true)}
                                onBlur={() => setPromptHelpOpen(false)}
                                onClick={() => setPromptHelpOpen(true)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setPromptHelpOpen(false);
                                }}
                              >
                                ?
                              </button>
                              <div
                                id="prompt-help-text"
                                className="prompt-help-text"
                                role="tooltip"
                                hidden={!promptHelpOpen}
                              >
                                <p>업무 설명에서 사실 후보를 추출하고 필요한 서비스의 조회 계획을 만듭니다.</p>
                                <p>첨부파일 자동 추출·법적 적용 판단은 이 단계에 포함되지 않습니다.</p>
                                {useAi ? (
                                  <p>선택한 ChatGPT 모델에 질문을 전송하여 추출합니다.</p>
                                ) : (
                                  <>
                                    <p>현재는 로컬 패턴으로 사실 후보를 추출합니다.</p>
                                    <p>자유로운 문장 분석을 사용하려면 아래 AI 분석 설정에서 ChatGPT와 모델을 선택하세요.</p>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <textarea
                            id="review-prompt"
                            required
                            minLength={10}
                            maxLength={30000}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                              "사업장의 공정, 취급 물질과 수량, 저장 장소, 기존 허가 여부,\n변경하려는 사항 등을 자유롭게 설명해 주세요."
                            }
                          />
                          <div className="example-row">
                            <span>예시 입력</span>
                            <button
                              type="button"
                              onClick={() =>
                                setPrompt(
                                  "경기도 소재 제조업 사업장입니다. 공장 내부에 인화성 액체를 저장하는 공간을 추가하려고 합니다. 물질별 최대 저장량과 기존 허가사항은 별도로 확인 중입니다. 위험물 인허가와 소량위험물 조례에서 확인해야 할 사항, 예외조항 및 필요한 자료를 검토해 주세요.",
                                )
                              }
                            >
                              저장 장소 신설
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPrompt(
                                  "기존 위험물 취급시설에서 물질과 최대 취급량을 변경하려고 합니다. 기존 허가증과 SDS를 확인한 뒤 제공할 예정입니다. 변경허가·신고 여부와 해당 지역 조례, 경과조치 및 추가 확인사항을 검토해 주세요.",
                                )
                              }
                            >
                              물질·수량 변경
                            </button>
                          </div>
                          <div className="field-grid">
                            <label>
                              소재 시·도
                              <select
                                value={region}
                                onChange={(e) => {
                                  setRegion(e.target.value);
                                  setMunicipality("");
                                }}
                              >
                                {regions.map(([code, name]) => (
                                  <option key={code}>{name}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              시·군·구
                              <input
                                value={municipality}
                                onChange={(e) =>
                                  setMunicipality(e.target.value)
                                }
                                list="review-municipalities"
                                placeholder="시·군·구 선택 또는 직접 입력"
                              />
                              <datalist id="review-municipalities">
                                {(
                                  jurisdictions[region]?.municipalities || []
                                ).map((m) => (
                                  <option key={m.org} value={m.name} />
                                ))}
                              </datalist>
                            </label>
                            <label>
                              검토 기준일
                              <input
                                type="date"
                                required
                                value={asOf}
                                onChange={(e) => setAsOf(e.target.value)}
                              />
                            </label>
                          </div>
                          {attachableDocs.length > 0 && (
                            <div className="attachments">
                              {attachableDocs.map((d) => (
                                <label key={d.id}>
                                  <input
                                    type="checkbox"
                                    checked={selectedDocs.includes(d.id)}
                                    onChange={(e) =>
                                      setSelectedDocs(
                                        e.target.checked
                                          ? [...selectedDocs, d.id]
                                          : selectedDocs.filter(
                                              (id) => id !== d.id,
                                            ),
                                      )
                                    }
                                  />
                                  <Files size={14} />
                                  {d.name}
                                </label>
                              ))}
                            </div>
                          )}
                          <details className="ai-settings" open>
                            <summary>
                              AI 분석 설정 · {useAi ? "사용" : "사용 안 함"}
                            </summary>
                            <p className="ai-settings-help">
                              AI는 질문에서 사실을 추출하고 수집한 근거의 쟁점을
                              정리합니다. 법적 판단은 근거·적용 조건의 검증을
                              거쳐 표시합니다.
                            </p>
                            <div className="ai-choice">
                              <label>
                                <input
                                  type="checkbox"
                                  checked={useAi}
                                  onChange={(e) => setUseAi(e.target.checked)}
                                  disabled={!status?.auth?.planAuthorized}
                                />
                                질문·선택 자료의 전송에 동의하고 AI 분석 사용
                              </label>
                              <div className="model-choice">
                                  <select
                                    aria-label="ChatGPT 모델"
                                    required={useAi}
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                  >
                                    <option value="">모델 선택</option>
                                    {models.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => void loadModels()}
                                  >
                                    모델 불러오기
                                  </button>
                              </div>
                              {!useAi && (
                                <span>
                                  {status?.auth?.connected
                                    ? "ChatGPT 연결됨"
                                    : "연결 설정에서 ChatGPT 구독 계정을 연결하세요."}
                                </span>
                              )}
                            </div>
                            {useAi && (
                              <p className="disclosure">
                                질문·답변과 선택한 자료의 발췌를 OpenAI에
                                전송합니다. 전화번호·이메일·주민번호 패턴을
                                가리지만 모든 영업정보를 자동 제거하지는
                                않습니다.
                              </p>
                            )}
                          </details>
                          <details className="result-guide">
                            <summary>결과 분류와 검토 범위</summary>
                            <dl>
                              <div>
                                <dt>명확한 법률 리스크</dt>
                                <dd>
                                  확인된 사실·검증된 근거·승인된 규칙으로 확인한
                                  항목
                                </dd>
                              </div>
                              <div>
                                <dt>사람의 판단 필요</dt>
                                <dd>
                                  예외 적용이나 해석에 대해 검토자의 판단이 필요한
                                  항목
                                </dd>
                              </div>
                              <div>
                                <dt>추가 자료 필요</dt>
                                <dd>
                                  사실·원문·최신성 등 판단에 필요한 정보가 부족한
                                  항목
                                </dd>
                              </div>
                            </dl>
                            <p>
                              현재는 위험물 인허가 시범 범위입니다. 지역별 수집
                              상태와 미확인 근거는 검토 결과에서 확인하세요.
                            </p>
                          </details>
                          <div className="composer-footer">
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => nav("documents")}
                            >
                              <Upload size={16} />
                              자료 추가
                            </button>
                            <span>
                              {prompt.length.toLocaleString()} / 30,000
                            </span>
                            <button
                              type="submit"
                              className="primary"
                              disabled={
                                busy ||
                                prompt.length < 10 ||
                                (useAi && !model)
                              }
                            >
                              {busy ? (
                                <LoaderCircle className="spin" size={17} />
                              ) : (
                                <Search size={17} />
                              )}
                              검토 시작
                            </button>
                          </div>
                        </fieldset>
                      </form>

                    </section>
                    <aside
                      className="review-context"
                      aria-label="연결 및 검토 범위"
                    >
                      <h2>검토 준비</h2>
                      <dl className="connection-list">
                        <div>
                          <dt>법제처 OC</dt>
                          <dd>
                            {status?.lawConfigured
                              ? "인증값 저장됨"
                              : "설정 필요"}
                          </dd>
                        </div>
                        <div>
                          <dt>ChatGPT</dt>
                          <dd>
                            {status?.auth?.planAuthorized
                              ? "분석 사용 가능"
                              : status?.auth?.connected
                                ? "사용 권한 확인 필요"
                                : "연결 전"}
                          </dd>
                        </div>
                        <div>
                          <dt>수집 성공 출처</dt>
                          <dd>
                            {pending} / {status?.sources?.length || 18}
                          </dd>
                        </div>
                      </dl>
                      <p className="context-note">
                        인증값 저장과 수집 성공은 법률 검증 완료를 의미하지
                        않습니다.
                      </p>
                      <div className="context-actions">
                        <button
                          className="text-button"
                          onClick={() => nav("settings")}
                        >
                          연결 관리 <ChevronRight size={14} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => nav("sources")}
                        >
                          수집 현황 확인 <ChevronRight size={14} />
                        </button>
                      </div>
                      <section className="context-scope">
                        <h2>현재 검토 범위</h2>
                        <p className="scope-name">위험물 저장·취급 및 인허가</p>
                        <p>
                          시범 운영 중입니다. 적용 조례·별표·예외의 미확인
                          항목은 결과에 표시합니다.
                        </p>
                      </section>
                      <section className="context-scope">
                        <h2>함께 준비할 자료</h2>
                        <ul>
                          <li>제품 SDS와 최대 저장·취급량</li>
                          <li>저장 장소·구획 및 설비 정보</li>
                          <li>기존 허가·신고 문서</li>
                        </ul>
                        <button
                          className="text-button"
                          onClick={() => nav("documents")}
                        >
                          자료함 열기 <ChevronRight size={14} />
                        </button>
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {page === "history" && (
                <>
                  <SectionHead
                    title="검토 기록"
                    description="당시의 사실과 근거를 그대로 보관하고, 법규가 달라지면 재검토를 표시합니다."
                  />
                  <div className="card list-card">
                    {!history.length ? (
                      <Empty
                        text="아직 저장된 검토가 없습니다."
                        action={() => nav("new")}
                        label="첫 검토 시작"
                      />
                    ) : (
                      history.map((h) => (
                        <button
                          className="history-row"
                          key={h.id}
                          onClick={() => void openReview(h.id)}
                        >
                          <div className="record-icon">
                            <BookOpen size={20} />
                          </div>
                          <div>
                            <h3>{h.title}</h3>
                            <p>
                              {h.region} · {date(h.createdAt)}
                            </p>
                          </div>
                          <span className="badge">
                            {h.needsReview
                              ? "재검토 필요"
                              : h.status === "running"
                                ? "진행 중"
                                : h.status === "failed"
                                  ? "미완료"
                                  : "확인 결과"}
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
              {page === "result" && result && (
                <>
                  <SectionHead
                    title="검토 결과"
                    description={
                      result.request.region +
                      " " +
                      result.request.municipality +
                      " · 기준일 " +
                      result.request.asOf
                    }
                  />
                  <div className="result-toolbar no-print">
                    <button
                      className="secondary"
                      onClick={() => {
                        setPrompt(result.request.prompt);
                        setRegion(result.request.region);
                        setMunicipality(result.request.municipality);
                        setAsOf(result.request.asOf);
                        setSelectedDocs(
                          result.request.documentIds.filter((id) =>
                            docs.some((d) => d.id === id),
                          ),
                        );
                        setUseAi(result.request.useAi);
                        setModel(result.request.model);
                        setPage("new");
                      }}
                    >
                      새 검토로 이어가기
                    </button>
                    <a
                      className="secondary"
                      href={"/api/reviews/" + result.id + "/export?format=md"}
                    >
                      <Download size={15} />
                      검토 보고서 받기
                    </a>
                    <a
                      className="secondary"
                      href={"/api/reviews/" + result.id + "/export?format=csv"}
                    >
                      <Download size={15} />
                      검토 표 받기
                    </a>
                    <button
                      className="secondary"
                      onClick={() => window.print()}
                    >
                      <Download size={15} />
                      문서 저장 · 인쇄
                    </button>
                  </div>
                  <div
                    className={
                      "review-status " +
                      (result.status === "failed" ? "failed" : "")
                    }
                    role="status"
                  >
                    {result.status === "running" ? (
                      <LoaderCircle className="spin" size={19} />
                    ) : (
                      <ShieldCheck size={19} />
                    )}
                    <span>
                      {result.progress}
                      {result.error && <strong>{result.error}</strong>}
                    </span>
                    {result.needsReview && (
                      <span className="badge">법규 변경 · 재검토 필요</span>
                    )}
                  </div>
                  <div className="stat-grid">
                    {Object.entries(categories).map(([key, c]) => (
                      <button
                        key={key}
                        className={"stat " + c.color}
                        aria-pressed={filter === key}
                        onClick={() => setFilter(filter === key ? "all" : key)}
                      >
                        <span>{c.short}</span>
                        <strong>
                          {
                            result.issues.filter((i) => i.category === key)
                              .length
                          }
                          <small>건</small>
                        </strong>
                      </button>
                    ))}
                  </div>
                  <div className="card fact-box">
                    <h3>검토 요청과 확인한 사실</h3>
                    <p>{result.request.prompt}</p>
                    <div>
                      {result.facts.map((f, i) => (
                        <span className="fact" key={f.key + i}>
                          <b>{f.label}</b>
                          {f.value}
                          <small>
                            {f.confirmed ? "입력 확인" : "추출·미확인"}
                          </small>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="issues">
                    {result.issues
                      .filter((i) => filter === "all" || i.category === filter)
                      .map((i) => (
                        <article
                          className={
                            "card issue " + categories[i.category].color
                          }
                          key={i.id}
                        >
                          <div className="issue-top">
                            <span
                              className={
                                "badge " + categories[i.category].color
                              }
                            >
                              {categories[i.category].label}
                            </span>
                            <span>
                              심각도:{" "}
                              {i.severity === "unspecified"
                                ? "별도 판단"
                                : resultStateLabels[i.severity]}
                            </span>
                          </div>
                          <h2>{i.title}</h2>
                          <p>{i.conclusion}</p>
                          {i.conditions.length > 0 && (
                            <DetailList
                              title="적용 조건"
                              items={i.conditions}
                            />
                          )}{" "}
                          {i.citations.map((c, n) => {
                            const ev = result.evidence.find(
                              (e) => e.id === c.evidenceId,
                            );
                            return (
                              <button
                                key={n}
                                className="citation"
                                onClick={() => setShowEvidence(ev || null)}
                              >
                                <BookOpen size={17} />
                                <span>
                                  <b>{ev?.title}</b>
                                  <q>{c.quote}</q>
                                  <small>
                                    시행 {ev?.effectiveFrom} · {ev?.article}
                                  </small>
                                </span>
                                <ArrowUpRight size={16} />
                              </button>
                            );
                          })}
                          {i.exceptions.length > 0 && (
                            <DetailList
                              title="예외·단서"
                              items={i.exceptions}
                            />
                          )}
                          <DetailList title="추가 확인" items={i.missing} />
                          <DetailList title="다음 조치" items={i.nextActions} />
                        </article>
                      ))}
                  </div>
                  {result.questions.length > 0 &&
                    result.status !== "running" && (
                      <form
                        className="card questions no-print"
                        onSubmit={(e) => void submit(e, true)}
                      >
                        <h2>확인할 정보를 더해 주세요</h2>
                        <p>
                          답변을 반영한 새 검토를 만들며, 기존 기록은
                          보존됩니다.
                        </p>
                        {result.questions.map((q) => (
                          <label key={q.key}>
                            {q.label}
                            <textarea
                              value={answers[q.key] || ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.key]: e.target.value,
                                })
                              }
                              placeholder="모르는 항목은 비워 두세요."
                            />
                          </label>
                        ))}
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            !Object.values(answers).some((v) => v.trim())
                          }
                        >
                          답변 반영하여 재검토
                          <ArrowRight size={16} />
                        </button>
                      </form>
                    )}
                  {result.referenceCollection && (
                    <section
                      className="card basis-verification"
                      aria-label="연결 원문 수집 결과"
                    >
                      <h2>
                        연결 원문 수집 — {result.referenceCollection.title}
                      </h2>
                      <p>{result.referenceCollection.message}</p>
                      <button
                        className="secondary no-print"
                        onClick={() =>
                          void openReview(
                            result.referenceCollection!.parentReviewId,
                          )
                        }
                      >
                        이전 검토 보기
                      </button>
                    </section>
                  )}
                  <Verification
                    key={`verification-${result.id}`}
                    report={result.verification}
                    evidence={result.evidence}
                    openEvidence={setShowEvidence}
                    busy={busy}
                    aiAvailable={result.request.useAi && !!result.request.model}
                    collectReference={
                      result.status === "completed"
                        ? (title, useAi) =>
                            void action(async () => {
                              const { id } = await post(
                                `/reviews/${result.id}/resolve-reference`,
                                { title, useAi },
                              );
                              setResult(await api("/reviews/" + id));
                              setAnswers({});
                              await refresh();
                            })
                        : undefined
                    }
                  />
                  {result.status === "completed" && (
                    <Dossier
                      key={`dossier-${result.id}`}
                      review={result}
                      api={api}
                      post={post}
                      onUpdated={async () =>
                        setResult(await api("/reviews/" + result.id))
                      }
                    />
                  )}
                  <details className="card coverage-detail">
                    <summary>
                      검토 범위·최신성·버전 정보{" "}
                      <span>
                        {result.coverage.complete
                          ? "확인 완료"
                          : "미확인 항목 있음"}
                      </span>
                    </summary>
                    <DetailList title="미확인 범위" items={result.gaps} />
                    <p>
                      공식 버전 확인: {date(result.coverage.latestCheckedAt)}
                    </p>
                    <p>
                      모델: {result.model} · 규칙: {result.rulesVersion} · 검토
                      ID: {result.id}
                    </p>
                  </details>
                </>
              )}
              {page === "documents" && (
                <>
                  <SectionHead
                    title="자료함"
                    description="회신, 허가증, SDS 등 검토에 필요한 자료를 내 PC에 보관합니다."
                  />
                  <p>보유 회신 업로드: 아래 파일 선택으로 회신 원본을 보관하고 회신기관·회신일을 입력하세요. 이후 새 법규 검토에서 자료를 선택합니다. 과거 회신은 현재 사업장에 자동 적용되지 않습니다.</p>
                  <label className="upload-zone">
                    <Upload size={30} />
                    <strong>검토 자료를 추가하세요</strong>
                    <span>PDF · HWP · HWPX · DOCX · TXT / 파일당 20MB</span>
                    <input
                      type="file"
                      accept=".pdf,.hwp,.hwpx,.docx,.txt"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                        e.target.value = "";
                      }}
                    />
                    <span className="secondary">
                      {busy ? "추출 중…" : "파일 선택"}
                    </span>
                  </label>
                  <div className="document-list">
                    {docs.map((d) => (
                      <article className="card document" key={d.id}>
                        <div className="document-heading">
                          <Files size={22} />
                          <div>
                            <h3>{d.name}</h3>
                            <p>
                              {date(d.createdAt)} ·{" "}
                              {d.type.slice(1).toUpperCase()}
                            </p>
                          </div>
                          <span
                            className={
                              "badge " + (d.confirmed ? "green" : "amber")
                            }
                          >
                            {d.confirmed ? "추출문 확인됨" : "원본 대조 필요"}
                          </span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setExpanded(expanded === d.id ? null : d.id)
                            }
                          >
                            내용 보기
                          </button>
                        </div>
                        {expanded === d.id && (
                          <>
                            <div className="notice">
                              {d.warnings.map((w, i) => (
                                <p key={i}>{w}</p>
                              ))}
                            </div>
                            <pre className="document-text">
                              {d.text || "텍스트가 없습니다."}
                            </pre>
                            <DocumentMetadata
                              doc={d}
                              post={post}
                              action={action}
                              refresh={refresh}
                            />
                            <div className="document-actions">
                              <a
                                className="secondary"
                                href={"/api/documents/" + d.id + "/original"}
                              >
                                원본 받기
                              </a>
                              <button
                                className="secondary"
                                onClick={() =>
                                  void action(async () => {
                                    await post(
                                      "/documents/" + d.id + "/confirm",
                                      {
                                        confirmed: !d.confirmed,
                                        agency: d.agency,
                                        responseDate: d.responseDate,
                                        region: d.region,
                                      },
                                    );
                                    await refresh();
                                  })
                                }
                              >
                                {d.confirmed ? "확인 취소" : "원본과 대조 완료"}
                              </button>
                              <button
                                className="text-button danger"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "이 자료의 원본과 추출문을 삭제할까요? 기존 검토 기록의 발췌는 남습니다.",
                                    )
                                  )
                                    void action(async () => {
                                      await api("/documents/" + d.id, {
                                        method: "DELETE",
                                      });
                                      await refresh();
                                    });
                                }}
                              >
                                자료 삭제
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  {!docs.length && (
                    <p className="empty-note">
                      자료를 추가한 뒤 새 검토에서 사용할 파일을 선택할 수
                      있습니다.
                    </p>
                  )}
                </>
              )}
              {page === "sources" && (
                <>
                  <SectionHead
                    title="법규·갱신 현황"
                    description="수집 완료와 법률 검증 완료를 구분합니다. 확인되지 않은 지역도 숨기지 않습니다."
                  />
                  <div className="source-summary card">
                    <div>
                      <h2>
                        {pending}
                        <small> / 18 출처 수집 성공</small>
                      </h2>
                      <p>
                        전국 국가법령 1개 묶음 + 시·도 17개 · 별표·공보·예외
                        검증 별도
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={busy || status?.syncing}
                      onClick={() =>
                        void action(async () => {
                          await post("/sync");
                          await refresh();
                        })
                      }
                    >
                      <RefreshCw
                        size={17}
                        className={status?.syncing ? "spin" : ""}
                      />
                      {status?.syncing ? "갱신 중…" : "지금 갱신"}
                    </button>
                  </div>
                  <div className="regions-grid">
                    {status?.sources.map((s: SourceStatus) => (
                      <article className="card region-card" key={s.id}>
                        <div>
                          <MapPin size={16} />
                          <h3>{s.region}</h3>
                          <span className={"tiny-dot " + s.status} />
                        </div>
                        <span
                          className={
                            "badge " +
                            (s.status === "ok"
                              ? "green"
                              : s.status === "failed"
                                ? "red"
                                : "muted")
                          }
                        >
                          {s.status === "ok"
                            ? "원문 수집됨"
                            : s.status === "failed"
                              ? "수집 확인 필요"
                              : "연결 대기"}
                        </span>
                        <p>{s.message}</p>
                        <small>최근 성공: {date(s.lastSuccessAt)}</small>
                        <div className="region-bottom">
                          <span>{s.count}개 자료</span>
                          <span>
                            {s.verified ? "검증 완료" : "현장 검증 전"}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                  <McpSearch post={post} action={action} />
                  <h2 className="subheading">
                    보관된 법규 원문 <span>{evidence.length}</span>
                  </h2>
                  <div className="card list-card">
                    {evidence.length ? (
                      evidence.map((e) => (
                        <button
                          className="evidence-row"
                          key={e.id}
                          onClick={() => {
                            void action(async () => {
                              setShowEvidence(await api("/evidence/" + e.id));
                              setDiff(null);
                            });
                          }}
                        >
                          <BookOpen size={18} />
                          <div>
                            <b>{e.title}</b>
                            <p>
                              시행 {e.effectiveFrom || "미확인"} · 버전{" "}
                              {e.version} · {e.region}
                            </p>
                          </div>
                          <ArrowUpRight size={16} />
                        </button>
                      ))
                    ) : (
                      <Empty text="연결 후 수집한 법규 전문과 이력이 여기에 표시됩니다." />
                    )}
                  </div>
                </>
              )}
              {page === "public" && (
                <PublicApiSearch
                  api={api}
                  onImported={refresh}
                  dangerousGoodsTools={
                    <QuantityCalculator post={post} action={action} />
                  }
                />
              )}
              {page === "settings" && (
                <>
                  <SectionHead
                    title="연결 설정"
                    description={
                      status?.authStorage === "memory"
                        ? "인증정보는 세션 한정 메모리에, 업무자료는 로컬 DB에 보관합니다."
                        : "인증정보는 Windows 보호 저장소에, 업무자료는 로컬 DB에 보관합니다."
                    }
                  />
                  <PublicApiSettings api={api} />
                  <div className="settings-grid">
                    <section className="card settings-card">
                      <div className="integration-heading">
                        <h2>ChatGPT 구독 연결</h2>
                        <span
                          className={
                            "badge " +
                            (status?.auth?.connected ? "green" : "muted")
                          }
                        >
                          {status?.auth?.connected ? "연결됨" : "연결 전"}
                        </span>
                      </div>
                      <p>
                        내 ChatGPT 계정의 사용 권한과 한도로 분석합니다. API
                        유료 과금으로 자동 전환하지 않습니다.
                      </p>
                      {status?.auth?.storageError && (
                        <p role="alert">{status.auth.storageError}</p>
                      )}
                      {status?.auth?.connected && (
                        <p className="account-email">
                          {status.auth.email} ·{" "}
                          {status.auth.planAuthorized
                            ? "구독 사용 허용"
                            : "구독 권한 확인 필요"}
                        </p>
                      )}
                      <div className="setting-buttons">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const data = await post("/auth/chatgpt/start");
                              window.location.assign(data.url);
                            })
                          }
                        >
                          ChatGPT 연결
                          <ExternalLink size={15} />
                        </button>
                        {(status?.auth?.connected ||
                          status?.auth?.storageError) && (
                          <button
                            className="secondary"
                            onClick={() =>
                              void action(async () => {
                                const disconnected = await post(
                                  "/auth/chatgpt/logout",
                                );
                                await refresh();
                                setUseAi(false);
                                if (disconnected.remoteRevoked)
                                  setToast(disconnected.message);
                                else setError(disconnected.message);
                              })
                            }
                          >
                            <LogOut size={15} />
                            연결 해제
                          </button>
                        )}
                        {status?.auth?.pending && (
                          <button
                            className="text-button"
                            onClick={() =>
                              void action(async () => {
                                await post("/auth/chatgpt/cancel");
                                await refresh();
                              })
                            }
                          >
                            로그인 취소
                          </button>
                        )}
                      </div>
                      <small>
                        브라우저에서 로그인과 권한 부여를 마치면 연결 상태가
                        갱신됩니다.
                      </small>
                    </section>
                    <section className="card settings-card">
                      <div className="integration-heading">
                        <h2>국가법령정보 공동활용</h2>
                        <span
                          className={
                            "badge " +
                            (status?.lawConfigured ? "green" : "muted")
                          }
                        >
                          {status?.lawConfigured
                            ? "인증값 저장됨"
                            : "설정 필요"}
                        </span>
                      </div>
                      <p>
                        법제처에서 발급받은 OC 인증값으로 법령·조례·행정규칙
                        원문을 수집합니다.
                      </p>
                      {status?.lawStorageError && (
                        <p role="alert">{status.lawStorageError}</p>
                      )}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            await post("/settings/law", { lawOc: oc });
                            setOc("");
                            await refresh();
                            setToast(
                              status?.authStorage === "memory"
                                ? "OC 인증값을 현재 세션에 보관했습니다."
                                : "OC 인증값을 보호 저장소에 보관했습니다.",
                            );
                          });
                        }}
                      >
                        <label>
                          OC 인증값
                          <input
                            type="password"
                            autoComplete="off"
                            value={oc}
                            onChange={(e) => setOc(e.target.value)}
                            required
                            placeholder="발급받은 OC 입력"
                          />
                        </label>
                        <button
                          className="secondary"
                          disabled={busy || !oc.trim()}
                        >
                          안전하게 저장
                          <Check size={15} />
                        </button>
                      </form>
                      <a
                        className="inline-link"
                        target="_blank"
                        rel="noreferrer"
                        href="https://open.law.go.kr/LSO/openApi/guideList.do"
                      >
                        API 신청·제공 범위 확인
                        <ArrowUpRight size={13} />
                      </a>
                    </section>
                    <section className="card settings-card wide">
                      <div className="integration-heading">
                        <h2>국민신문고 · 본인 민원</h2>
                        <span className="badge amber">{status?.petition?.collecting ? "계정 수집 중" : status?.petition?.enabled ? "계정 연결 중" : "계정 자동수집 비활성"}</span>
                      </div>
                      <p>
                        공개 질의응답 API와 본인 계정 수집은 별개입니다. {status?.petition?.message}
                        보유한 회신은 자료함에서 파일을 올리고 회신기관·회신일을 기록해 검토 참고자료로 사용하세요.
                      </p>
                      <div className="setting-buttons">
                        <button
                          className="secondary"
                          onClick={() => nav("documents")}
                        >
                          <Upload size={15} />
                          자료함으로 이동 · 회신 업로드
                        </button>
                        <a
                          className="secondary"
                          href="https://www.epeople.go.kr/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          국민신문고 직접 열기
                          <ExternalLink size={14} />
                        </a>
                        <button className="secondary" disabled>
                          계정 자동수집 · 비활성
                        </button>
                      </div>
                      <a
                        className="inline-link"
                        href="https://www.epeople.go.kr/nep/gdnc/TermsConditions.npaid"
                        target="_blank"
                        rel="noreferrer"
                      >
                        이용약관 제12조 확인
                        <ArrowUpRight size={13} />
                      </a>
                    </section>
                    <AdvancedSettings
                      post={post}
                      action={action}
                      refresh={refresh}
                      api={api}
                      reviews={history}
                      publicBundle={status?.publicBundle || null}
                    />
                    <section className="card settings-card wide">
                      <div className="integration-heading">
                        <h2>백업과 복원</h2>
                        <span className="badge muted">로컬 자료</span>
                      </div>
                      <p>
                        포함: 질문·답변·검토 결과·원본 대조 기록, 저장 법규, 자료함 파일 원본과 추출문, 판단 규칙.
                        제외: API 키·로그인 토큰·세션, 운영 설정, 법규 수집 폴더의 별도 첨부 바이너리.
                        다운로드 파일은 암호화하지 않은 JSON이며 Base64는 암호화가 아닙니다.
                        로컬에 받은 파일을 복원할 수 있고, 복원 후 승인·확인 상태는 재검토가 필요합니다.
                      </p>
                      <div className="setting-buttons">
                        <a className="secondary" href="/api/backup">
                          <Download size={15} />
                          백업 다운로드
                        </a>
                        <label className="secondary file-button">
                          <Upload size={15} />
                          백업 복원
                          <input
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (
                                f &&
                                window.confirm(
                                  "백업을 로컬 자료에 병합합니다. 같은 ID의 기록은 백업 내용으로 복원됩니다. 계속할까요?",
                                )
                              )
                                void action(async () => {
                                  await post(
                                    "/restore",
                                    JSON.parse(await f.text()),
                                  );
                                  await refresh();
                                  setToast(
                                    "복원이 완료되었습니다. 근거를 재확인하세요.",
                                  );
                                });
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </section>
                    <section
                      className="card settings-card wide information-notice"
                      aria-labelledby="information-notice-title"
                    >
                      <h2 id="information-notice-title">
                        {informationNotice.title}
                      </h2>
                      <small>{informationNotice.version}</small>
                      <p>{informationNotice.introduction}</p>
                      <p>
                        질문·문서 원본·백업은 앱에서 별도 암호화하지 않습니다.
                        AI 분석을 선택하면 질문과 선택 자료의 발췌 등이
                        OpenAI로, 공공 API 조회 시 검색어 등이 해당 기관으로
                        전송됩니다.
                      </p>
                      <p>{informationNotice.scope}</p>
                      {informationSections.map((section) => (
                        <details key={section.title}>
                          <summary>{section.title}</summary>
                          <div className="information-notice-body">
                            {section.paragraphs.map((paragraph) => (
                              <p key={paragraph}>{paragraph}</p>
                            ))}
                            {section.table && (
                              <div
                                className="information-notice-table"
                                role="region"
                                aria-label={`${section.title} 상세 표`}
                                tabIndex={0}
                              >
                                <table>
                                  <thead>
                                    <tr>
                                      {section.table.headers.map((header) => (
                                        <th key={header} scope="col">
                                          {header}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {section.table.rows.map(
                                      ([label, ...cells]) => (
                                        <tr key={label}>
                                          <th scope="row">{label}</th>
                                          {cells.map((cell, index) => (
                                            <td key={index}>{cell}</td>
                                          ))}
                                        </tr>
                                      ),
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {section.items && (
                              <ul>
                                {section.items.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            )}
                            {section.sources && (
                              <ul
                                className="information-notice-sources"
                                aria-label="공식 출처"
                              >
                                {section.sources.map((source) => (
                                  <li key={source.url}>
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {source.label} (새 창)
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </details>
                      ))}
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {showEvidence && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setShowEvidence(null);
            setDiff(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="법규 원문"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>{showEvidence.title}</h2>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  setShowEvidence(null);
                  setDiff(null);
                }}
              >
                닫기
              </button>
            </div>
            <p>
              시행 {showEvidence.effectiveFrom || "미확인"} · 공포{" "}
              {showEvidence.promulgatedAt || "미확인"} · 수집{" "}
              {date(showEvidence.fetchedAt)}
            </p>
            <div className="setting-buttons">
              <a
                className="secondary"
                href={showEvidence.url}
                target="_blank"
                rel="noreferrer"
              >
                공식 출처
                <ExternalLink size={14} />
              </a>
              <button
                className="secondary"
                onClick={() =>
                  void action(async () =>
                    setDiff(
                      await api("/evidence/" + showEvidence.id + "/diff"),
                    ),
                  )
                }
              >
                이전 전문과 비교
              </button>
            </div>
            <p className="notice">{showEvidence.verificationNote}</p>
            {diff ? (
              <>
                <h3>{diff.label}</h3>
                <pre className="document-text">
                  {diff.changes.map((c: any, i: number) => (
                    <span
                      key={i}
                      className={
                        c.added ? "diff-added" : c.removed ? "diff-removed" : ""
                      }
                    >
                      {c.value}
                    </span>
                  ))}
                </pre>
              </>
            ) : (
              <pre className="document-text">{showEvidence.text}</pre>
            )}
            <small>원문 해시 {showEvidence.hash}</small>
          </section>
        </div>
      )}
    </div>
  );
}
function SectionHead({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={28} />
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          {label}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
function DetailList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="detail-list">
      <h4>{title}</h4>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

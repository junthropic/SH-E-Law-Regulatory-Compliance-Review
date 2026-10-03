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
  Link2,
  MapPin,
  Clock3,
  AlertTriangle,
  Download,
  Upload,
  ExternalLink,
  LogOut,
  LoaderCircle,
  Scale,
  PanelLeftClose,
} from "lucide-react";
import type {
  ReviewResult,
  DocumentRecord,
  Evidence,
  SourceStatus,
} from "../shared/types.js";
import { regions } from "../shared/types.js";

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
type Page = "new" | "history" | "documents" | "sources" | "settings" | "result";
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
  const [page, setPage] = useState<Page>("new");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
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
      <aside className="sidebar no-print">
        <a className="brand" href="/" aria-label="SH E 홈">
          <span className="brand-mark">
            <Scale size={23} />
          </span>
          <span>
            SH<span className="dot">·</span>E <small>LAW CHECK</small>
          </span>
        </a>
        <div className="workspace-label">
          PERSONAL WORKSPACE <span>LOCAL</span>
        </div>
        <button
          className={"nav-new " + (page === "new" ? "active" : "")}
          onClick={() => nav("new")}
        >
          <Plus size={18} />새 법규 검토
          <ArrowUpRight size={15} />
        </button>
        <div className="nav-label">워크스페이스</div>
        <nav>
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
              { id: "settings", icon: Settings2, label: "연결 설정" },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "selected" : ""}
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
            <button key={h.id} onClick={() => void openReview(h.id)}>
              <span className="tiny-dot" />
              {h.title}
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
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={18} />
            <div>
              내 PC에 보관
              <small>질문과 업무자료는 Git에 올라가지 않습니다.</small>
            </div>
          </div>
          <button onClick={() => nav("settings")} className="profile">
            <span className="avatar">나</span>
            <span>
              개인 워크스페이스
              <small>
                {status?.auth?.connected ? "ChatGPT 연결됨" : "ChatGPT 연결 전"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar no-print">
          <div>
            <span className="breadcrumb">워크스페이스</span>
            <ChevronRight size={14} />
            <span>
              {
                {
                  new: "새 법규 검토",
                  history: "검토 기록",
                  documents: "자료함",
                  sources: "법규·갱신 현황",
                  settings: "연결 설정",
                  result: "검토 결과",
                }[page]
              }
            </span>
          </div>
          <div className="top-meta">
            <span className="live-dot" />
            로컬 실행
            <span className="divider" />
            위험물 · 시범 버전
          </div>
        </header>
        <main>
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
                    <div className="eyebrow">
                      <span />
                      EVIDENCE FIRST, ALWAYS
                    </div>
                    <h1>
                      현장의 질문을,
                      <br />
                      <span>근거 있는 판단으로.</span>
                    </h1>
                    <p>
                      상황을 자세히 설명해 주세요. 적용 법령부터 지역 조례의
                      예외까지,
                      <br className="desktop" /> 확인한 근거와 사람이 판단할
                      쟁점을 함께 정리합니다.
                    </p>
                  </div>
                  <div className="scope-strip">
                    <span>
                      <MapPin size={16} />
                      전국 시·도 조회 지원
                    </span>
                    <span>
                      <ShieldCheck size={16} />
                      근거 원문 대조
                    </span>
                    <span>
                      <Clock3 size={16} />
                      검토 기준일 반영
                    </span>
                  </div>
                  <form
                    className="composer card"
                    onSubmit={(e) => void submit(e)}
                  >
                    <div className="card-title">
                      <span className="step">01</span>
                      <h2>어떤 상황을 검토할까요?</h2>
                      <span className="badge muted">위험물 인허가</span>
                    </div>
                    <textarea
                      aria-label="검토할 업무 상황"
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
                      <span>이렇게 시작해 보세요</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPrompt(
                            "경기도 소재 제조업 사업장입니다. 공장 내부에 인화성 액체를 저장하는 공간을 추가하려고 합니다. 물질별 최대 저장량과 기존 허가사항은 별도로 확인 중입니다. 위험물 인허가와 소량위험물 조례에서 확인해야 할 사항, 예외조항 및 필요한 자료를 검토해 주세요.",
                          )
                        }
                      >
                        <Plus size={13} />
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
                        <Plus size={13} />
                        물질·수량 변경
                      </button>
                    </div>
                    <div className="field-grid">
                      <label>
                        소재 시·도
                        <select
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
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
                          onChange={(e) => setMunicipality(e.target.value)}
                          placeholder="예: 화성시"
                        />
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
                    {docs.length > 0 && (
                      <div className="attachments">
                        {docs.map((d) => (
                          <label key={d.id}>
                            <input
                              type="checkbox"
                              checked={selectedDocs.includes(d.id)}
                              onChange={(e) =>
                                setSelectedDocs(
                                  e.target.checked
                                    ? [...selectedDocs, d.id]
                                    : selectedDocs.filter((id) => id !== d.id),
                                )
                              }
                            />
                            <Files size={14} />
                            {d.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="ai-choice">
                      <label>
                        <input
                          type="checkbox"
                          checked={useAi}
                          onChange={(e) => setUseAi(e.target.checked)}
                          disabled={!status?.auth?.planAuthorized}
                        />
                        ChatGPT로 법규 해석하기
                      </label>
                      {useAi ? (
                        <div className="model-choice">
                          <select
                            aria-label="ChatGPT 모델"
                            required
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
                      ) : (
                        <span>
                          {status?.auth?.connected
                            ? "선택하지 않으면 자료·사실 확인만 실행합니다."
                            : "연결 설정에서 ChatGPT 구독 계정을 연결하세요."}
                        </span>
                      )}
                    </div>
                    {useAi && (
                      <p className="disclosure">
                        질문·답변과 선택한 자료의 발췌를 OpenAI에 전송합니다.
                        전화번호·이메일·주민번호 패턴을 가리지만 모든 영업정보를
                        자동 제거하지는 않습니다.
                      </p>
                    )}
                    <div className="composer-footer">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => nav("documents")}
                      >
                        <Upload size={16} />
                        자료 추가
                      </button>
                      <span>{prompt.length.toLocaleString()} / 30,000</span>
                      <button
                        type="submit"
                        className="primary"
                        disabled={
                          busy || prompt.length < 10 || (useAi && !model)
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Search size={17} />
                        )}
                        검토 시작
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </form>
                  <QuantityCalculator post={post} action={action} />
                  <div className="below-title">
                    <h3>결론만큼 중요한, 판단의 근거</h3>
                    <span>세 가지 결과로 구분합니다</span>
                  </div>
                  <div className="principles">
                    {Object.entries(categories).map(([key, c], i) => (
                      <div className={"principle " + c.color} key={key}>
                        <div>
                          <span className="category-num">0{i + 1}</span>
                          <ArrowUpRight size={17} />
                        </div>
                        <h3>{c.label}</h3>
                        <p>
                          {
                            [
                              "확인된 사실과 검증된 규칙이 연결된 리스크를 보여줍니다.",
                              "예외 적용이나 해석이 갈리는 부분과 확인할 질문을 정리합니다.",
                              "빠진 사실·자료·최신성 확인 항목을 구체적으로 알려줍니다.",
                            ][i]
                          }
                        </p>
                      </div>
                    ))}
                  </div>
                  {!status?.lawConfigured && (
                    <div className="setup-nudge">
                      <Link2 size={19} />
                      <div>
                        <strong>공식 자료 연결을 준비해 주세요.</strong>
                        <p>
                          법제처 OC를 연결하면 실제 법령·조례를 수집합니다. 현재
                          수집·현장 검증 전 상태입니다.
                        </p>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => nav("settings")}
                      >
                        연결 설정
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {page === "history" && (
                <>
                  <SectionHead
                    eyebrow="REVIEW HISTORY"
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
                    eyebrow="REVIEW REPORT"
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
                      Markdown
                    </a>
                    <a
                      className="secondary"
                      href={"/api/reviews/" + result.id + "/export?format=csv"}
                    >
                      <Download size={15} />
                      CSV
                    </a>
                    <button
                      className="secondary"
                      onClick={() => window.print()}
                    >
                      <Download size={15} />
                      PDF 저장 · 인쇄
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
                                : i.severity}
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
                    eyebrow="PRIVATE DOCUMENTS"
                    title="자료함"
                    description="회신, 허가증, SDS 등 검토에 필요한 자료를 내 PC에 보관합니다."
                  />
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
                    eyebrow="LEGAL INTELLIGENCE"
                    title="법규·갱신 현황"
                    description="수집 완료와 법률 검증 완료를 구분합니다. 확인되지 않은 지역도 숨기지 않습니다."
                  />
                  <div className="source-summary card">
                    <div>
                      <span className="eyebrow">SOURCE COVERAGE</span>
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
              {page === "settings" && (
                <>
                  <SectionHead
                    eyebrow="CONNECTIONS & DATA"
                    title="연결 설정"
                    description={
                      status?.authStorage === "memory"
                        ? "인증정보는 세션 한정 메모리에, 업무자료는 로컬 DB에 보관합니다."
                        : "인증정보는 Windows 보호 저장소에, 업무자료는 로컬 DB에 보관합니다."
                    }
                  />
                  <div className="settings-grid">
                    <section className="card settings-card">
                      <div className="integration-icon">✳</div>
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
                          Continue with ChatGPT
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
                      <div className="integration-icon law">
                        <Scale size={24} />
                      </div>
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
                        <span className="badge amber">운영기관 승낙 대기</span>
                      </div>
                      <p>
                        공개 데이터의 승인된 제공 경로와 보유 회신 업로드를
                        사용합니다. 본인 계정 자동 접근·수집은 사전 승낙과 해당
                        범위의 실연동 검증 후 활성화합니다.
                      </p>
                      <div className="setting-buttons">
                        <button
                          className="secondary"
                          onClick={() => nav("documents")}
                        >
                          <Upload size={15} />
                          보유 회신 업로드
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
                    />
                    <section className="card settings-card wide">
                      <div className="integration-heading">
                        <h2>백업과 복원</h2>
                        <span className="badge muted">로컬 자료</span>
                      </div>
                      <p>
                        백업에는 개인 질문·자료 원본이 포함됩니다. 인증 토큰은
                        포함하지 않습니다. 복원한 검토는 재확인이 필요한 상태로
                        표시합니다.
                      </p>
                      <div className="setting-buttons">
                        <a className="secondary" href="/api/backup">
                          <Download size={15} />
                          비공개 백업 받기
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
                  </div>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>SH·E LAW CHECK</span>
            <span>
              검토 범위와 근거를 함께 확인하는 환경안전보건 워크스페이스
            </span>
            <span>v0.1.0</span>
          </footer>
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
                <span className="eyebrow">SOURCE DOCUMENT</span>
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
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <div className="eyebrow">{eyebrow}</div>
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

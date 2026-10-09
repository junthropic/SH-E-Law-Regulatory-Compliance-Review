import { ReviewApproval } from "./ReviewApproval.js";
import { useState } from "react";
import type { DocumentRecord } from "../shared/types.js";
type Post = (url: string, body?: unknown) => Promise<any>;
type Action = (fn: () => Promise<void>) => Promise<void>;

export function DocumentMetadata({
  doc,
  post,
  action,
  refresh,
}: {
  doc: DocumentRecord;
  post: Post;
  action: Action;
  refresh: () => Promise<void>;
}) {
  const [agency, setAgency] = useState(doc.agency),
    [responseDate, setDate] = useState(doc.responseDate),
    [region, setRegion] = useState(doc.region);
  return (
    <form
      className="metadata-form"
      onSubmit={(e) => {
        e.preventDefault();
        void action(async () => {
          await post("/documents/" + doc.id + "/confirm", {
            confirmed: doc.confirmed,
            agency,
            responseDate,
            region,
          });
          await refresh();
        });
      }}
    >
      <div className="field-grid">
        <label>
          회신·발급 기관
          <input
            value={agency}
            maxLength={150}
            onChange={(e) => setAgency(e.target.value)}
          />
        </label>
        <label>
          회신·발급일
          <input
            type="date"
            value={responseDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          적용 지역
          <input
            value={region}
            maxLength={100}
            onChange={(e) => setRegion(e.target.value)}
          />
        </label>
      </div>
      <button className="secondary">문서 정보 저장</button>
    </form>
  );
}
export function QuantityCalculator({
  post,
  action,
}: {
  post: Post;
  action: Action;
}) {
  const [items, setItems] = useState([
    { quantity: "", unit: "L", designated: "", designatedUnit: "L" },
  ]);
  const [confirmed, setConfirmed] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  function change(i: number, key: string, value: string) {
    setItems(items.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
    setRatio(null);
  }
  return (
    <details className="card extra-tools">
      <summary>지정수량 배수 계산</summary>
      <p>
        물질 분류와 지정수량을 확인한 뒤 입력하세요. 질량과 부피는 자동 환산하지
        않습니다. 입력값으로 계산하는 참고 도구이며, 조회 결과를 자동으로
        가져오거나 법규 검토에 계산 결과를 자동 반영하지 않습니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const r = await post("/quantity-ratio", {
              groupConfirmed: confirmed,
              items: items.map((i) => ({
                ...i,
                quantity: Number(i.quantity),
                designated: Number(i.designated),
              })),
            });
            setRatio(r.ratio);
          });
        }}
      >
        {items.map((item, i) => (
          <div className="quantity-row" key={i}>
            <label>
              물질 {i + 1} 수량
              <input
                type="number"
                min="0"
                step="any"
                required
                value={item.quantity}
                onChange={(e) => change(i, "quantity", e.target.value)}
              />
            </label>
            <label>
              수량 단위
              <select
                value={item.unit}
                onChange={(e) => change(i, "unit", e.target.value)}
              >
                {["L", "mL", "kL", "kg", "g", "t"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label>
              지정수량
              <input
                type="number"
                min="0.000001"
                step="any"
                required
                value={item.designated}
                onChange={(e) => change(i, "designated", e.target.value)}
              />
            </label>
            <label>
              지정수량 단위
              <select
                value={item.designatedUnit}
                onChange={(e) => change(i, "designatedUnit", e.target.value)}
              >
                {["L", "mL", "kL", "kg", "g", "t"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
              setRatio(null);
            }}
          />
          동일 저장·취급 단위로 합산할 대상임을 확인했습니다.
        </label>
        <div className="setting-buttons">
          <button
            type="button"
            className="secondary"
            disabled={items.length >= 20}
            onClick={() => {
              setItems([
                ...items,
                {
                  quantity: "",
                  unit: "L",
                  designated: "",
                  designatedUnit: "L",
                },
              ]);
              setRatio(null);
            }}
          >
            물질 추가
          </button>
          <button className="secondary" disabled={!confirmed}>
            배수 계산
          </button>
        </div>
        {ratio !== null && (
          <p role="status">
            입력 기준 합산 배수 <strong>{Number(ratio.toPrecision(12))}</strong>{" "}
            — 이 수치는 인허가 판단 결과가 아닙니다.
          </p>
        )}
      </form>
    </details>
  );
}
export function McpSearch({ post, action }: { post: Post; action: Action }) {
  const [query, setQuery] = useState("위험물"),
    [tool, setTool] = useState("search_ordinance"),
    [text, setText] = useState("");
  return (
    <details className="card extra-tools">
      <summary>Korean Law MCP로 관련 근거 탐색</summary>
      <p>
        탐색 결과는 요약될 수 있습니다. 저장·인용에는 공식 API의 전문을
        사용합니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const r = await post("/mcp/query", {
              tool,
              params: { query, display: 20 },
            });
            setText(
              r.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("\n"),
            );
          });
        }}
      >
        <div className="field-grid">
          <label>
            검색 대상
            <select value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="search_ordinance">자치법규</option>
              <option value="search_law">법령</option>
              <option value="search_admin_rule">행정규칙</option>
            </select>
          </label>
          <label>
            검색어
            <input
              required
              maxLength={100}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <button className="secondary">근거 탐색</button>
      </form>
      {text && <pre className="document-text">{text}</pre>}
    </details>
  );
}
export function AdvancedSettings({
  post,
  action,
  refresh, api, reviews, publicBundle,
}: {
  api: (url: string) => Promise<any>;
  reviews: {id: string; title: string; status: string}[];
  publicBundle: {importedAt: string; publishedAt: string; count: number} | null;
  post: Post;
  action: Action;
  refresh: () => Promise<void>;
}) {
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="card settings-card wide">
      <h2>검토자 확인과 승인된 연결</h2>
      <p>
        원문·공보·위임·별표를 검토한 확인서를 등록할 수 있습니다. 승인되지 않은
        규칙은 명확한 리스크를 생성하지 않습니다.
      </p>
      <div className="setting-buttons">
        <button
          className="secondary"
          onClick={() =>
            void action(async () => {
              await post("/public/update");
              await refresh();
              setMessage("공개 법규 자료를 업데이트했습니다.");
            })
          }
        >
          공개 법규 자료 업데이트
        </button>
      </div>
      <p>{publicBundle ? `최근 가져온 시각: ${new Date(publicBundle.importedAt).toLocaleString("ko-KR")} · 배포 자료 생성: ${new Date(publicBundle.publishedAt).toLocaleString("ko-KR")} · ${publicBundle.count}건` : "자료 업데이트 기록 없음"}</p>
      <p>저장소에 배포된 공개 법규를 가져옵니다. 각 법규의 실제 수집일·시행일과 기관의 최신 원문은 별도 확인합니다.</p>
      <ReviewApproval api={api} post={post} action={action} refresh={refresh} reviews={reviews} />
      <details>
        <summary>국민신문고 사전 승낙 후 연결</summary>
        <p>
          운영기관 승낙의 유효기간·허용 범위와 실제 사이트에서 검증한 선택자가
          들어 있는 설정 파일이 필요합니다. 초기에는 설정이 없어 작동하지
          않습니다. 연결 시 별도 Edge 브라우저에서 직접 로그인합니다.
        </p>
        <div className="setting-buttons">
          <label className="secondary file-button">
            승낙·연결 설정 등록
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void action(async () => {
                    const r = await post(
                      "/petitions/connect",
                      JSON.parse(await file.text()),
                    );
                    setConnected(true);
                    setMessage(r.message);
                  });
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="secondary"
            disabled={!connected}
            onClick={() =>
              void action(async () => {
                try {
                  const r = await post("/petitions/collect");
                  await refresh();
                  setMessage(
                    r.imported +
                      "개 저장" +
                      (r.truncated ? " · 페이지 한도로 일부 미수집" : ""),
                  );
                } finally {
                  setConnected(false);
                }
              })
            }
          >
            직접 로그인 완료 · 수집
          </button>
          <button
            className="secondary"
            onClick={() =>
              void action(async () => {
                await post("/petitions/disconnect");
                setConnected(false);
                setMessage("민원 연결과 저장된 세션을 삭제했습니다.");
              })
            }
          >
            연결 해제
          </button>
        </div>
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

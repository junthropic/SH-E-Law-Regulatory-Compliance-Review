import { reviewDomains } from "../shared/review-domains.js";
import type { Evidence, ReviewRequest } from "../shared/types.js";
import type {
  BasisCheck,
  BasisVerification,
  ReviewPassage,
  VerificationReport,
} from "../shared/verification.js";
import { koreaDate } from "../shared/dates.js";
import { applicable } from "./legal.js";

const compact = (s: string) => s.replace(/\s/g, "");
const legal = (e: Evidence) => e.kind === "law" || e.kind === "ordinance";
const patterns: [ReviewPassage["kind"], RegExp][] = [
  ["annex", /별표\s*\d*|별지\s*(?:제\s*)?\d*\s*(?:호)?\s*서식/g],
  ["supplement", /부\s*칙|경과조치|적용례|시행일|시행한다/g],
  [
    "exception",
    /다만|예외|제외한다|적용하지\s*아니|적용하지\s*않|그러하지\s*아니/g,
  ],
  ["delegation", /준용|위임|조례로\s*정|대통령령으로\s*정|부령으로\s*정/g],
];

// Matches are navigation aids, never a determination that an exception applies.
export function inspectBasis(
  e: Evidence,
  all: Evidence[],
  request: ReviewRequest,
  now: Date,
): BasisVerification {
  const check = (
    key: string,
    label: string,
    ok: boolean,
    yes: string,
    no: string,
    missing = false,
  ): BasisCheck => ({
    key,
    label,
    state: ok ? "checked" : missing ? "missing" : "review",
    detail: ok ? yes : no,
  });
  const today = koreaDate(now);
  const age = now.getTime() - Date.parse(e.fetchedAt);
  const titles = [
    ...new Set(
      [...e.text.matchAll(/「([^」\n]{2,150})」/g)]
        .map((m) => m[1].trim())
        .filter((t) =>
          /(?:법|법률|시행령|규칙|조례|규정|고시|기준|요령|지침)$/.test(t),
        ),
    ),
  ];
  const references = titles.slice(0, 100).map((title) => {
    const candidates = all.filter(
      (x) =>
        legal(x) &&
        compact(x.title) === compact(title) &&
        applicable(x, request.region, request.asOf),
    );
    return {
      title,
      evidenceIds: candidates.map((x) => x.id),
      state:
        candidates.length === 1
          ? ("candidate" as const)
          : candidates.length
            ? ("ambiguous" as const)
            : ("missing" as const),
    };
  });
  const passages: ReviewPassage[] = [];
  let passagesTotal = 0;
  for (const [kind, pattern] of patterns) {
    const seen = new Set<number>();
    let kept = 0;
    for (const match of e.text.matchAll(pattern)) {
      const lineStart = e.text.lastIndexOf("\n", match.index) + 1;
      const prefix = e.text.slice(
        lineStart,
        match.index + match[0].length + 80,
      );
      const field = /^(?:조문|부칙|별표)\/[^\n:]+:\s*/.exec(prefix);
      const contentStart = field ? lineStart + field[0].length : lineStart;
      // API field names (e.g. 부칙/부칙단위/시행일자) are not legal passages.
      if (match.index < contentStart) continue;
      // Long single-line legal texts retain a bounded excerpt around each match.
      const offset = Math.max(contentStart, match.index - 100);
      if (seen.has(offset)) continue;
      seen.add(offset);
      passagesTotal++;
      if (kept++ >= 15) continue;
      const lineEnd = e.text.indexOf("\n", match.index);
      passages.push({
        kind,
        offset,
        quote: e.text.slice(
          offset,
          Math.min(lineEnd < 0 ? e.text.length : lineEnd, match.index + 220),
        ),
      });
    }
  }
  const conflicts = all.filter((x) => x.sourceId === e.sourceId).length > 1;
  const checks = [
    ...(e.sourceConflicts?.length ? [{key:"source-conflict",label:"출처 간 정보 일치",state:"review" as const,detail:e.sourceConflicts.join(" / ")}] : []),
    check(
      "period",
      "기준일·시행 기간",
      applicable(e, request.region, request.asOf) &&
        request.asOf <= today &&
        !conflicts,
      `저장된 버전의 시행 기간에 기준일 ${request.asOf}이 포함됩니다. 조문별 시행 특례는 별도 대조합니다.`,
      conflicts
        ? "같은 법규의 적용 버전이 충돌합니다."
        : request.asOf > today
          ? "미래 기준일입니다. 추가 개정과 조문별 시행일을 확인해야 합니다."
          : "시행 기간 또는 지역이 맞지 않거나 시행일이 없습니다.",
    ),
    check(
      "body",
      "전문",
      e.complete,
      "전문 수집 상태가 확인됐습니다.",
      "전문 또는 연결 조문이 불완전합니다.",
      true,
    ),
    check(
      "annex",
      "별표·서식",
      e.annexesComplete,
      "별표 완전성 확인 기록이 있습니다.",
      "별표·서식 원본과 추출문의 표·수치를 대조해야 합니다.",
    ),
    check(
      "history",
      "연혁·부칙",
      e.historyComplete,
      "연혁 확인 기록이 있습니다. 경과조치의 사업장 적용 여부는 별도 확인합니다.",
      "기준일 연혁과 부칙의 시행일·적용례·경과조치 확인이 필요합니다.",
    ),
    check(
      "exceptions",
      "예외·위임",
      e.verified,
      "검토자 확인 기록이 있습니다. 이번 사업장의 조건과 다시 대조하세요.",
      "예외·위임 규정과 이번 사업장의 사실관계 대조가 필요합니다.",
    ),
    check(
      "freshness",
      "원문 갱신",
      Number.isFinite(age) && age >= 0 && age < 86400000,
      `원문 수집 시각: ${e.fetchedAt}`,
      "최근 24시간 내 원문 수집을 확인하지 못했습니다.",
    ),
  ];
  if (references.some((r) => r.state !== "candidate") || titles.length > 100)
    checks.push({
      key: "references",
      label: "연결 법규",
      state: "missing",
      detail:
        "인용 법규의 원문 누락·버전 충돌 또는 표시 한도가 있습니다. 연결 대상과 적용 조항을 확인하세요.",
    });
  else
    checks.push({
      key: "references",
      label: "연결 법규",
      state: "review",
      detail: references.length
        ? "제목이 일치하는 원문 후보를 연결했습니다. 인용 조항·위임 범위·기준일 버전을 대조하세요."
        : "명시된 법규명 연결을 찾지 못했습니다. 약칭·상대 참조·누락된 연결까지 없다는 뜻은 아닙니다.",
    });
  return {
    evidenceId: e.id,
    checks,
    references,
    referencesTotal: titles.length,
    passages: passages.sort((a, b) => a.offset - b.offset),
    passagesTotal,
  };
}

export function buildVerification(
  evidence: Evidence[],
  request: ReviewRequest,
  approved: boolean,
  now = new Date(),
): VerificationReport {
  const basis = evidence
    .filter(legal)
    .map((e) => inspectBasis(e, evidence, request, now));
  if (basis.length) for (const title of new Set(reviewDomains(request.prompt).flatMap(p => [...p.laws]))) {
    if (!evidence.some(e => e.title.replace(/\s/g, "") === title.replace(/\s/g, "")) &&
        !basis.some(b => b.references.some(ref => ref.title === title))) {
      basis[0].references.push({ title, evidenceIds: [], state: "missing" });
      basis[0].referencesTotal++;
    }
  }
  return {
    version: 1,
    checkedAt: now.toISOString(),
    basis,
    checks: [
      {
        key: "national",
        label: "국가 법령",
        state: evidence.some((e) => e.kind === "law") ? "checked" : "missing",
        detail:
          "검토 근거에 국가 법령이 포함되어 있는지 확인합니다. 관련 법령 전수 확보를 의미하지 않습니다.",
      },
      {
        key: "regional",
        label: "시·도 조례",
        state: evidence.some(
          (e) => e.kind === "ordinance" && e.region === request.region,
        )
          ? "checked"
          : "missing",
        detail: `${request.region} 조례 수집 여부입니다. 시·군·구 위임 범위는 별도 확인합니다.`,
      },
      {
        key: "local",
        label: "공보·시군구·위임 범위",
        state: approved ? "checked" : "review",
        detail: approved
          ? "이 지역·시군구·기준일·원문 전체와 일치하는 유효한 검토자 확인서가 있습니다."
          : `${request.region} ${request.municipality || "(시군구 미입력)"}: 공보 및 관련 시군구 규정과 일치하는 검토자 확인서가 필요합니다.`,
      },
    ],
  };
}

export function verificationGaps(
  report: VerificationReport,
  evidence: Evidence[],
): string[] {
  return report.basis.flatMap((b) => {
    const title = evidence.find((e) => e.id === b.evidenceId)?.title || "법규";
    const unresolved = b.references.filter((r) => r.state !== "candidate");
    return [
      ...(unresolved.length
        ? [
            `${title}: 연결 원문 확인 필요 — ${unresolved.map((r) => r.title).join(", ")}`,
          ]
        : []),
      ...(b.referencesTotal > b.references.length
        ? [`${title}: 연결 법규 표시 한도를 넘어 추가 원문 대조가 필요합니다.`]
        : []),
      ...b.checks
        .filter((c) => c.key === "period" && c.state !== "checked")
        .map((c) => `${title}: ${c.detail}`),
    ];
  });
}

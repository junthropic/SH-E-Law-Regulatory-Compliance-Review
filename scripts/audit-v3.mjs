// Read-only source/test audit. Writes v3 reports only; no .local or running-server access.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = resolve("."),
  out = "docs/implementation-v3",
  at = new Date().toISOString();
const read = (p) => JSON.parse(readFileSync(p, "utf8")),
  write = (p, x) =>
    writeFileSync(join(out, p), JSON.stringify(x, null, 2) + "\n");
const hash = (x) => createHash("sha256").update(x).digest("hex"),
  baseline = read(join(out, "baseline.json"));
const head = execFileSync(
  "git",
  ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"],
  { encoding: "utf8", windowsHide: true },
).trim();
const paths = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|css|mjs|py|json|html|svg)$/.test(e.name))
      paths.push(p.replaceAll("\\", "/"));
  }
}
for (const dir of [
  "server",
  "shared",
  "src",
  "tests",
  "scripts",
  "public",
  "data",
])
  if (existsSync(dir)) walk(dir);
paths.push(
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.server.json",
  "vite.config.ts",
  "vitest.config.ts",
  "index.html",
  "AGENTS.md",
);
const files = [...new Set(paths)]
    .sort()
    .map((path) => ({ path, hash: hash(readFileSync(path)) })),
  sourceDigest = hash(JSON.stringify(files));
const meta = {
  head,
  dirty: true,
  sourceDigest,
  at,
  scope: "격리 개발·가상 시험. 운영·실제 사업장·법적 승인 아님",
};
const old = new Map(baseline.files.map((f) => [f.path, f.hash]));
write("source-manifest.json", {
  ...meta,
  files,
  changedFromBaseline: files
    .filter((f) => old.has(f.path) && old.get(f.path) !== f.hash)
    .map((f) => f.path),
  addedSinceBaseline: files.filter((f) => !old.has(f.path)).map((f) => f.path),
  deletedFromBaseline: baseline.files
    .filter((f) => !existsSync(f.path))
    .map((f) => f.path),
});
const frozen = baseline.frozen.map((f) => ({
  ...f,
  actual: hash(readFileSync(f.path)),
  unchanged: hash(readFileSync(f.path)) === f.hash,
}));
const original12 = read("docs/implementation-v2/ui-freeze.json").files.map(
  (f) => ({
    ...f,
    actual: hash(readFileSync(f.path)),
    unchanged: hash(readFileSync(f.path)) === f.expected,
  }),
);
write("ui-freeze.json", {
  ...meta,
  extendedCount: frozen.length,
  changed: frozen.filter((f) => !f.unchanged).length,
  files: frozen,
  original12,
  operationalDistIncluded: true,
  uiTemplateEdits: 0,
});
if (frozen.some((f) => !f.unchanged) || original12.some((f) => !f.unchanged))
  throw Error("UI freeze mismatch");
const validation = read("work/v3-audit/isolated-validation.json");
const copied = files.map((f) => ({
  path: f.path,
  exists: existsSync(join(validation.directory, f.path)),
  matches:
    existsSync(join(validation.directory, f.path)) &&
    hash(readFileSync(join(validation.directory, f.path))) === f.hash,
}));
write("build-verification.json", {
  ...meta,
  isolatedDirectory: validation.directory,
  copiedFiles: copied,
  notCopiedOrChanged: copied.filter((f) => !f.matches),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  lockfileHash: hash(readFileSync("package-lock.json")),
  migrationVersions: [2, 3],
  productionBuildWritten: false,
});
const final = read("work/v3-audit/final-tests.json"),
  items = final.testResults.flatMap((s) =>
    s.assertionResults.map((t) => ({
      file: relative(root, s.name)
        .replaceAll("\\", "/")
        .replace(/^work\/v3-validation-[^/]+\//, ""),
      name: t.fullName,
      status: t.status,
      durationMs: t.duration,
    })),
  ),
  prior = read("docs/implementation-v2/test-inventory.json").final.items;
const names = new Set(items.map((t) => t.name)),
  priorNames = new Set(prior.map((t) => t.name));
write("test-inventory.json", {
  ...meta,
  countDefinition:
    "Vitest case 수. parameterized row 별도 계산; assertion 수와 법률 정확도 아님",
  baselineExecuted: read("work/v3-audit/baseline-validation.json"),
  priorCount: prior.length,
  finalCount: items.length,
  passed: items.filter((t) => t.status === "passed").length,
  deleted: prior.filter((t) => !names.has(t.name)),
  added: items.filter((t) => !priorNames.has(t.name)),
  items,
});
write("execution.json", {
  ...meta,
  validation,
  report: "work/v3-audit/final-tests.json",
  productionPortContacted: false,
  productionRestarted: false,
  productionDataRead: false,
  productionDataModified: false,
  realKeysRead: false,
  publicOfficialSourcesOnly: true,
  allPublicApisLiveChecked: false,
});
const acceptance = read("docs/implementation-v2/acceptance-map.json");
const groups = {
  periods: ["AC06", "AC07", "AC08", "V2-04", "V2-05"],
  http: ["AC12", "AC32", "AC33", "AC44", "AC45", "V2-07", "V2-08"],
  policies: [
    "AC18",
    "AC19",
    "AC21",
    "AC22",
    "AC23",
    "AC24",
    "AC25",
    "AC26",
    "AC28",
    "V2-12",
  ],
  workers: ["AC40", "V2-15", "V2-17", "V2-18"],
  backup: ["AC38", "AC39", "V2-19", "V2-20"],
};
const prefix = {
  periods: /V3-P/,
  http: /V3-H/,
  policies: /V3-C/,
  workers: /V3-[JF]/,
  backup: /V3-[BE]/,
};
const rows = [...acceptance.legacy, ...acceptance.additional].map((a) => {
  const matched = Object.keys(groups).filter((g) => groups[g].includes(a.id)),
    linked = items.filter(
      (t) =>
        matched.some((g) => prefix[g].test(t.name)) ||
        new RegExp(`\\b${a.id}\\b`).test(t.name),
    );
  return {
    id: a.id,
    original: a.original || a.description || a,
    previous: a,
    technical: linked.length
      ? "부분 구현·해당 연결 시험 실행"
      : "기존 상태 유지·이번 직접 연결 미검증",
    execution: linked,
    legalSourceReview: "관련 원문 부분 대조; 개별 인수 전체 법적 승인 미완료",
    practitionerReview: "미검증",
    workplaceScope: "가상만; 실제 사업장 정보 없음",
    deployment: "미수행·승인 필요",
    remaining: a.remaining || "전체 인수 조건·실무 증빙·독립 법적 검토",
    owner: "개발자 및 분야 검토자",
    releaseCondition: "항목별 전체 조건·객관 자료·독립 검토 근거 연결",
    sourceDigest,
    correction:
      a.id === "AC28"
        ? "승인 부재는 해당 예외가 법적으로 승인을 요구할 때만 적용"
        : a.id === "AC38"
          ? "UI 변경 금지; 기존 세 분류로 backend projection만 시험"
          : null,
  };
});
write("acceptance-map.json", {
  ...meta,
  originalCount: rows.length,
  rows,
  newCases: items
    .filter((t) => t.name.includes("V3-"))
    .map((t) => ({
      ...t,
      technical: "해당 시험 범위 검증",
      legalApproval: false,
      realSite: false,
      sourceDigest,
    })),
  preservedPriorStatuses: true,
  all72Complete: false,
});
const registry = read("docs/implementation-v2/api-registry.json");
const detail =
  /PolicyQnaItem|getMaterialInfo|getChemDetail|selectApiDiciDetail/;
const entries = registry.entries.map((s) => ({
  ...s,
  previousSnapshot: s.operations.map((o) => ({
    operation: o.operation,
    storedPriorStatus: o.storedPriorStatus,
    liveObservations: o.liveObservations,
  })),
  operations: s.operations.map((o) => ({
    ...o,
    currentLive: "이번 v3 실호출 미실행",
    role: /Disaster_attach/.test(o.operation)
      ? "attachment_metadata"
      : detail.test(o.operation)
        ? "detail"
        : o.operation === "DTarLandUseInfo"
          ? "linked_restriction"
          : "list_or_search",
    parent: /Disaster_attach/.test(o.operation)
      ? "A03 disaster record"
      : detail.test(o.operation)
        ? s.operations[0].operation
        : o.operation === "DTarLandUseInfo"
          ? "DTsearchLunCd code"
          : "search query",
    durableGraph: "v3 guarded pilot: 목록/상세/첨부 결과+checkpoint",
    rawPreservation:
      "현재 정규화 결과 snapshot; transport 원문 전체 보존 미연결",
    binaryAttachment:
      "개별 원본 내려받기·대조 미검증; not_supported는 adapter 범위, 기관 미지원 확정 아님",
    changeOperation: "지원 여부 미확인",
    fixtureEvidence: items
      .filter(
        (t) =>
          t.file.includes("public-api") ||
          t.file.includes("additional-api") ||
          t.file.includes("v3-collection") ||
          t.file.includes("collection-hardening"),
      )
      .map((t) => ({ file: t.file, name: t.name, status: t.status })),
    operationSpecificFixtureMapped: false,
    remaining: [
      "52개 operation별 독립 상세·첨부 fixture 1:1 매핑",
      "기관별 실제 계정 quota/reset/동시 호출 범위",
      "원본 응답·첨부 바이너리와 버전 연결",
      "현재 운영 활용 승인·약관 검토",
    ],
  })),
}));
write("api-registry.json", {
  ...meta,
  services: entries.length,
  operations: entries.reduce((n, s) => n + s.operations.length, 0),
  entries,
  preservedAll: true,
  all52Verified: false,
});
const policyBaseline = read("docs/implementation-v2/policy-candidates.json"),
  selected = [
    "hazmat_manager.replacement",
    "hazmat_manager.appointment_report",
    "hazmat_manager.deputy",
    "hazmat_manager.deputy_period",
    "hazmat_check.record_retention",
    "hazmat_check.result_submission",
  ];
const policies = policyBaseline.candidates.flatMap((g) =>
  g.duties.map((d) => ({
    id: g.group + "." + d,
    group: g.group,
    label: g.label,
    previousGroup: g,
    selected: selected.includes(g.group + "." + d),
    implementation: selected.includes(g.group + "." + d)
      ? "실행 predicate·필수 fact·후보 원문·보류·격리 시험 연결"
      : "기존 후보 유지; 실행 구현 미완료",
    officialSources:
      g.group === "hazmat_manager"
        ? ["hazmat-15"]
        : g.group === "hazmat_check"
          ? [
              "hazmat-18",
              "hazmat-order-16",
              "hazmat-rule-65",
              "hazmat-rule-68",
              "hazmat-2021",
            ]
          : [],
    automaticTests: items.filter((t) => t.name.includes(g.group + "." + d)),
    legalProfile: "실제 해석 승인 대기; 합성 profile만 시험",
    expertApproval: "없음",
    realSite: "미검증",
    enabled: false,
    remaining: selected.includes(g.group + "." + d)
      ? [
          "원문 범위·대상·별표·고시·예외의 독립 분야 검토",
          "실제 증빙과 권한자·기간 profile 승인",
          "예외 효과의 실제 policy 결합",
          "지자체 위임 및 현재 권한",
        ]
      : g.gaps,
  })),
);
write("policy-contracts.json", {
  ...meta,
  total: policies.length,
  selectedCount: policies.filter((x) => x.selected).length,
  remainingCount: policies.filter((x) => !x.selected).length,
  policies,
  activeRealRules: 0,
});
const allSources = read(join(out, "official-sources.json"));
for (const [id, url, scope] of [
  [
    "hazmat-2021",
    "https://www.law.go.kr/LSW/lsInfoR.do?lsiSeq=222461&efYd=20211021&chrClsCd=010202",
    "제18조 및 법률 제17518호 부칙 제1·3조 확인",
  ],
  [
    "hazmat-2021-18",
    "https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=222461&joNo=0018&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR",
    "껍데기 응답: 제18조 본문 없음. 수집 성공·원문 확보로 승격 금지",
  ],
]) {
  const path = join(out, "official", id + ".html");
  if (existsSync(path) && !allSources.some((s) => s.id === id))
    allSources.push({
      id,
      url,
      raw: path.replaceAll("\\", "/"),
      sha256: hash(readFileSync(path)),
      fetchedAt: statSync(path).mtime.toISOString(),
      scope,
      articleMarkerPresent: id === "hazmat-2021",
      legalApproval: false,
    });
}
write("official-sources.json", allSources);
write("metrics.json", {
  ...meta,
  testCaseCounts: {
    denominator: items.length,
    failed: items.filter((t) => t.status !== "passed").length,
  },
  legalAccuracy: null,
  independentGoldenCases: 0,
  legalFalseRisk: { denominator: 0, errors: null, rate: null },
  falseCompliance: { denominator: 0, errors: null, rate: null },
  falseOutOfScope: { denominator: 0, errors: null, rate: null },
  unnecessaryHold: { denominator: 0, errors: null, rate: null },
  qualifiedReviewerAgreement: null,
  liveLatencyP95: null,
  technicalOnly: {
    permissionTests: items.filter((t) => /V3-H/.test(t.name)),
    dateTests: items.filter((t) => /V3-[PC]/.test(t.name)),
    workerTests: items.filter((t) => /V3-[JF]/.test(t.name)),
    egressTests: items.filter((t) => /V3-E/.test(t.name)),
  },
  warning:
    "0개 독립 정답 분모는 산정 불가. 합성 설계 시험 성공을 법률 정확도 100%로 표현하지 않음",
});
write("current-status.json", {
  ...meta,
  stages: [
    {
      id: "V3-A",
      status: "격리 연결·HTTP·기간 시험 통과; 실제 권한 provision 미연결",
    },
    {
      id: "V3-B",
      status:
        "worker·façade·A07/A08 모의 시험 통과; 전체 operation 원문/첨부·실계정 quota 미완료",
    },
    {
      id: "V3-C",
      status:
        "6개 실행 후보·기간·예외 엔진 시험; 37개 후보와 법적 적용 검토 미완료",
    },
    {
      id: "V3-D",
      status:
        "AI/가상 공개검색 전송 차단·관리 암호백업 시험; legacy 화면 백업은 기존 평문 계약 유지",
    },
    {
      id: "V3-E",
      status:
        "S1/S3 기존 브라우저·S2/S4 HTTP/DB 가상 연결 시험; 실제 사업장·분야 전문가 인수 미검증",
    },
  ],
  liveA07A08: "이번 실행 안 함; v2 과거 표본을 현재 성공으로 재표시하지 않음",
  uiChanges: frozen.filter((f) => !f.unchanged).length,
  productionDeployments: 0,
  productionRestarts: 0,
  realLegalRulesEnabled: 0,
  original72Preserved: rows.length === 72,
  original43Preserved: policies.length === 43,
});
write("release-gate.json", {
  ...meta,
  released: false,
  productionServing: "이번 실행 확인·교체 안 함",
  blocks: [
    {
      id: "real-workplace",
      state: "자료 미제공",
      needed: "실제 대상·시설·물질·수량·기간·허가 및 증빙",
      owner: "사용자/사업장",
    },
    {
      id: "expert",
      state: "실제 법적 승인 없음",
      needed: "6개 의무의 원문·예외·기간·적용 범위 독립 승인",
      owner: "분야 검토자",
    },
    {
      id: "provision",
      state: "가상 principal만 시험",
      needed: "실사용 신원·권한·만료·철회 운영 정책",
      owner: "운영 관리자",
    },
    {
      id: "full-collection",
      state: "32/52 전체 상세·첨부/원문 대응 미완료",
      needed: "operation별 fixture+제한 표본+quota 증빙",
      owner: "개발자/기관",
    },
    {
      id: "deployment",
      state: "명시적으로 금지",
      needed: "별도 운영 배포·재시작 승인",
      owner: "사용자",
    },
  ],
  notScopeExcluded: [
    "미검증 인수항목",
    "나머지 37개 정책",
    "원문·첨부·부칙·위임 범위",
    "실제 사업장 적합성",
  ],
});
console.log(
  JSON.stringify({
    sourceDigest,
    testCases: items.length,
    uiChanges: frozen.filter((f) => !f.unchanged).length,
    acceptance: rows.length,
    policies: policies.length,
    operations: entries.reduce((n, s) => n + s.operations.length, 0),
  }),
);

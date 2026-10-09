import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, relative, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve("."),
  out = resolve("docs/implementation-v2");
mkdirSync(out, { recursive: true });
const load = (path) =>
  import(pathToFileURL(resolve("work/v2-build", path)).href);
const { connectionServices } = await load("shared/connection-catalog.js");
const { publicServices } = await load("shared/public-apis.js");
const { additionalProbeSpecs } = await load("server/public-api-probes.js");
const { additionalSearchConfigs } = await load("shared/additional-search.js");
const { policyCandidates, verifiedSourceChecks } = await load(
  "server/evidence-policies-v2.js",
);
const digest = (x) => createHash("sha256").update(x).digest("hex");
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else
      files.push({
        path: relative(root, p).replaceAll("\\", "/"),
        hash: digest(readFileSync(p)),
      });
  }
}
for (const dir of ["server", "shared", "src", "scripts", "tests"])
  walk(resolve(dir));
for (const p of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.server.json",
  "vitest.config.ts",
])
  if (existsSync(p)) files.push({ path: p, hash: digest(readFileSync(p)) });
files.sort((a, b) => a.path.localeCompare(b.path));
const head = execFileSync(
  "git",
  ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "rev-parse", "HEAD"],
  { encoding: "utf8", windowsHide: true },
).trim();
const identity = {
  head,
  dirty: true,
  sourceDigest: digest(JSON.stringify(files)),
  at: new Date().toISOString(),
  files,
};
const write = (name, data) =>
  writeFileSync(join(out, name), JSON.stringify(data, null, 2) + "\n");
const readReport = (p) =>
  existsSync(p)
    ? JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""))
    : null;
const liveRuns = ["work/v2-audit/live.json", "work/v2-audit/live-phases.json"]
  .map((path) => ({ path, data: readReport(path) }))
  .filter((x) => x.data);
const serving = readReport("work/v2-audit/serving-observation.json");
write("source-manifest.json", identity);
const bases = {
  qna: "1140100/CivilPolicyQnaService",
  fire: "1661000/materialInfoSvc",
  msds: "B552468/msdschem1",
  smart: "B552468/srch",
  keco: "B552584/kecoapi/ncissbstn",
  guide: "B552468/koshaguide",
};
const operations = {
  qna: ["PolicyQnaList", "PolicyQnaItem"],
  fire: ["getMaterialList", "getMaterialInfo"],
  msds: [
    "getChemList001",
    ...Array.from(
      { length: 16 },
      (_, i) => `getChemDetail${String(i + 1).padStart(2, "0")}1`,
    ),
  ],
  smart: ["smartSearch"],
  keco: ["chemSbstnList"],
  guide: ["getKoshaGuide"],
};
const registry = connectionServices.map((s) => {
  const spec = additionalProbeSpecs[s.id],
    config = additionalSearchConfigs[s.id];
  const urls = spec
    ? [spec.endpoint]
    : operations[s.id].map(
        (op) => `https://apis.data.go.kr/${bases[s.id]}/${op}`,
      );
  if (s.id === "land-use")
    urls.push(spec.endpoint.replace("/DTsearchLunCd", "/DTarLandUseInfo"));
  if (s.id === "grievance")
    urls.push(
      spec.endpoint.replace("selectApiDiciList", "selectApiDiciDetail"),
    );
  return {
    ...s,
    credentialReference: `Windows DPAPI public-${s.id} (value excluded)`,
    agency:
      publicServices.find((p) => p.id === s.id)?.agency || s.name.split("_")[0],
    inputs: config || publicServices.find((p) => p.id === s.id)?.modes,
    operations: urls.map((endpoint) => ({
      endpoint,
      protocol: new URL(endpoint).protocol,
      operation: new URL(endpoint).pathname.split("/").at(-1),
      keyParameter:
        spec?.keyParam || (s.id === "fire" ? "ServiceKey" : "serviceKey"),
      adapter: spec
        ? "server/additional-apis.ts + server/public-api-probes.ts"
        : "server/public-apis.ts",
      currentLive: liveRuns.some((r) => r.data.apis.some((a) => a.id === s.id))
        ? "표본 실행: 아래 성공·실패를 함께 확인; 전수·무장애 보장 아님"
        : "이번 실행 미검증",
      liveObservations: liveRuns.flatMap((r) =>
        r.data.apis
          .filter((a) => a.id === s.id)
          .map((a) => ({ ...a, evidence: r.path })),
      ),
      storedPriorStatus:
        serving?.connections.find((c) => c.id === s.id) || null,
      fixtureCoverage: "개별 시험 추적표 확인",
      quota: "계정별 한도·초기화 시각 미확인",
      sourceLag: "서비스별 별도 원문 확인 필요",
      successSchema: "adapter의 서비스별 code·payload 구조 검사",
      emptySchema: "성공 의미 확인 후 빈 목록; 통신 실패와 구분",
      paginationGuarantee: "안정 스냅샷 전수 보장 없음",
      timeoutMs: ["A07", "A08"].includes(s.code) ? 60000 : 20000,
      retryMax: ["A07", "A08"].includes(s.code) ? 2 : 1,
      persistence: ["A07", "A08"].includes(s.code)
        ? "키 해시별 제한 상태; 로컬 앱 경로 연결"
        : "서비스별 별도 확인",
      illegalInferences: [
        "0건을 비대상·무허가로 추론",
        "목록 성공을 전체 원본 검증으로 추론",
      ],
    })),
  };
});
write("api-registry.json", {
  ...identity,
  files: undefined,
  services: registry.length,
  operations: registry.reduce((n, s) => n + s.operations.length, 0),
  entries: registry,
});
write("policy-candidates.json", {
  version: 2,
  productionEnabled: false,
  candidates: policyCandidates,
  sourceChecks: verifiedSourceChecks,
});
const baseline = readReport("work/v2-audit/baseline-tests.json"),
  final = readReport("work/v2-audit/final-tests.json");
const assertions = (r) =>
  (r?.testResults || []).flatMap((f) =>
    f.assertionResults.map((t) => ({
      file: relative(root, f.name).replaceAll("\\", "/"),
      name: t.fullName,
      status: t.status,
      durationMs: t.duration,
    })),
  );
write("test-inventory.json", {
  ...identity,
  files: undefined,
  countDefinition:
    "Vitest test cases; parameterized rows count separately. Not assertion count.",
  baseline: {
    sourceDigest: null,
    scope:
      "이번 작업 수정 전 실행. 수정 전 전체 파일 digest 미보존; 최종 digest에 귀속하지 않음.",
    tests: baseline?.numTotalTests,
    passed: baseline?.numPassedTests,
    files: baseline?.testResults.length,
    items: assertions(baseline),
  },
  final: {
    sourceDigest: identity.sourceDigest,
    tests: final?.numTotalTests,
    passed: final?.numPassedTests,
    failed: final?.numFailedTests,
    files: final?.testResults.length,
    items: assertions(final),
  },
});
const old = readFileSync(
  "docs/specifications/EHS_전체답변_상세구현명세_통합.md",
  "utf8",
)
  .split("## 17. 인수 테스트: 최소 제안 세트")[1]
  .split("## 18.")[0];
const extra = readFileSync(
  "docs/specifications/EHS_실무보강_조사와_실행프롬프트_v2.md",
  "utf8",
)
  .split("### 8.2. 추가 권고 시나리오 24건")[1]
  .split("## 9.")[0];
const items = (text, prefix) =>
  [...text.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => {
    const id = prefix + String(m[1]).padStart(2, "0"),
      linked = assertions(final).filter((t) =>
        new RegExp("(?:^|\\s)" + id + "(?:[ :]|$)").test(t.name),
      );
    return {
      id,
      original: m[2].trim(),
      version: 2,
      status: linked.length ? "부분검증" : "미검증",
      execution: linked,
      legalReview: "미검증",
      scope: "가상·개발 시험; 법적·현장 인수 전체 완료 아님",
      remaining: "원문 버전·실무 검토·전체 경계 조건 매핑 확인",
    };
  });
write("acceptance-map.json", {
  ...identity,
  files: undefined,
  legacy: items(old, "AC"),
  additional: items(extra, "V2-"),
  warning:
    "기존 48개와 추가 24개를 보존. 시험명 연결은 전체 인수 충족을 의미하지 않음.",
});
write("release-gate.json", {
  ...identity,
  files: undefined,
  productionDeployment: "범위제외: 사용자 별도 승인 없음",
  uiChanges: 0,
  realWorkplace: "차단: 실제 자료 없음",
  approvedLegalRules: 0,
  qualifiedReview: "차단: 실제 권한자·분야 검토 미제공",
  mandatoryAcceptanceComplete: false,
  releaseAllowed: false,
});
const validation = readReport("work/v2-audit/isolated-validation.json");
const checkPassed = validation?.steps.some(
  (s) => s.command === "npm run check" && s.code === 0,
);
const e2ePassed =
  validation?.steps.filter(
    (s) => s.command.startsWith("npm run test:e2e") && s.code === 0,
  ).length === 6;
const testsPassed =
  final?.success === true &&
  final?.numFailedTests === 0 &&
  final?.numFailedTestSuites === 0;
const uiExpected = readReport("work/ui-freeze-20261008.json");
const ui = Object.entries(uiExpected).map(([path, expected]) => ({
  path,
  expected,
  actual: digest(readFileSync(path)),
  unchanged: expected === digest(readFileSync(path)),
}));
write("ui-freeze.json", {
  checkedAt: identity.at,
  count: ui.length,
  changed: ui.filter((x) => !x.unchanged).length,
  files: ui,
});
write("live-observations.json", {
  runs: liveRuns.map((r) => ({ evidence: r.path, ...r.data })),
  serving,
  warning:
    "저장된 과거 성공과 이번 live 호출을 구분. 후속 A07 제한 시간 초과, A08 재시도 성공. 장기 장애율 산정 불가.",
});
const stages = [
  [
    "명세",
    "부분완료",
    "주 지시·참고자료 채택과 계약 명세",
    "업무별 수치·예외·권한 운영 계약 확정",
    "개발자·법률/실무 검토자",
    "README.md",
  ],
  [
    "코드",
    "부분완료",
    "v2 모델·게이트·기한·승인·수집 일지·영속 제한",
    "README의 미구현 목록 및 기존 검토 흐름 연결",
    "개발자",
    "source-manifest.json",
  ],
  [
    "빌드·정적검사",
    checkPassed ? "완료" : "미완료",
    "동일 소스 격리 복사본 npm run check",
    "운영 빌드로 배포하지 않음",
    "개발자",
    "execution.json",
  ],
  [
    "단위·통합",
    testsPassed ? "완료" : "미완료",
    `${final?.numPassedTests}/${final?.numTotalTests}개 시험`,
    "기존 48개 인수 전체 충족과 별개",
    "개발자",
    "test-inventory.json",
  ],
  [
    "장애·복구",
    "부분완료",
    "한도 영속·저장 실패 rollback·재개·손상 복원 차단",
    "전체 operation·실제 프로세스 강제 종료·다중 프로세스 시험",
    "개발자",
    "test-inventory.json",
  ],
  [
    "E2E",
    e2ePassed ? "완료" : "미완료",
    "격리 DB·모의 API의 기존 6개 E2E",
    "기관 실제 응답과 신규 v2 역할의 전체 HTTP 흐름은 별도",
    "개발자",
    "execution.json",
  ],
  [
    "가상 인수",
    "부분완료",
    "설계 golden 9개 및 P0 관련 시험",
    "48개+24개 인수 전체, 독립 holdout",
    "개발자·실무 검토자",
    "acceptance-map.json",
  ],
  [
    "실무자 검토",
    "차단",
    "운영 승인 0건",
    "분야별 실제 검토자와 검토 기록",
    "사업장 담당자·법률/실무 검토자",
    "release-gate.json",
  ],
  [
    "실제 사업장",
    "차단",
    "화성시 선택은 실제 사업장 입증이 아님",
    "대상 사업장·시설·기간·자료 제공",
    "사업장 담당자",
    "README.md",
  ],
  [
    "운영 배포",
    "범위제외",
    "사용자 지시: 승인 없는 운영 배포 금지",
    "필수 검증 후 별도 배포 승인",
    "사용자·운영 담당자",
    "release-gate.json",
  ],
  [
    "serving 확인",
    "부분완료",
    "기존 HTTP200·등록32·frontend asset 관측",
    "backend 빌드 ID 식별 경로 없음; 이번 변경 미배포",
    "개발자",
    "live-observations.json",
  ],
];
write("current-status.json", {
  head,
  sourceDigest: identity.sourceDigest,
  at: identity.at,
  statusVocabulary: [
    "완료",
    "부분완료",
    "미완료",
    "미검증",
    "차단",
    "범위제외",
  ],
  scope:
    "완료는 대상 칼럼에 적힌 범위에 한함. 도메인/API 정상 상태와 별개인 작업 상태.",
  stages: stages.map(([name, status, target, remaining, owner, evidence]) => ({
    name,
    status,
    target,
    remaining,
    owner,
    evidence,
    checkedAt: identity.at,
    head,
    buildId: identity.sourceDigest,
  })),
});
write("execution.json", {
  head,
  sourceDigest: identity.sourceDigest,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    operatingDataUsedForTests: false,
    liveCredentialReads:
      "저장된 DPAPI 값을 메모리에서 읽어 표본 조회. 값 기록·변경 없음",
  },
  validation,
  baselineReport: "work/v2-audit/baseline-tests.json",
  finalReport: "work/v2-audit/final-tests.json",
  failedIterations: [
    {
      target: "일일 quota 보류 저장 시험",
      reason:
        "두 시각을 더해 무기한 표식으로 환산할 때 밀리초 차이로 정수 상한을 넘길 수 있었음",
      resolution: "무기한 보류는 상대 시간 합산 대신 명시적 상한 표식으로 저장",
      evidence: "work/v2-audit/v2-validation-3bXg2e-check.log",
    },
    {
      target: "루트 JSON 시험 보고서 수집",
      reason:
        "기본 테스트 검색이 work의 격리 복사본까지 포함했고 sandbox 임시 모듈 경로 ENOENT 발생",
      resolution:
        "시험 검색을 tests/**/*.test.ts로 한정하고 격리 환경에서 재실행",
      evidence: "work/v2-audit/root-report-failed.json",
    },
    {
      target: "격리 node_modules junction",
      reason: "sandbox EPERM",
      resolution: "승인된 숨김 실행으로 격리 복사본 생성",
    },
    {
      target: "intake E2E",
      reason:
        "이미 제거된 사실 추출 버튼·AI 설정 기본 펼침 상태에 대한 옛 가정",
      resolution: "화면 변경 없이 현재 UI와 API 흐름에 맞게 시험 수정",
    },
    {
      target: "public API E2E",
      reason: "통신 오류를 timeout으로 모의·이전 20초 문구 가정",
      resolution: "TimeoutError를 모의하고 A08의 60초 정책 검증",
    },
  ],
  productionDeployment: false,
  finalSuiteIncludesAllFailuresRetested:
    checkPassed && e2ePassed && testsPassed,
});
const golden = existsSync("work/v2-audit/golden")
  ? readdirSync("work/v2-audit/golden")
      .filter((x) => /^G\d+\.json$/.test(x))
      .map((x) => readReport("work/v2-audit/golden/" + x))
  : [];
write("metrics.json", {
  head,
  sourceDigest: identity.sourceDigest,
  dataset: "v2-design-1",
  synthetic: true,
  independentLegalReview: false,
  caseCount: golden.length,
  outcomeMismatches: golden.filter((x) => x.actual !== x.expected).length,
  prematureClearRisk: golden.filter(
    (x) => x.categoryBeforeApproval === "clear_risk",
  ).length,
  definitions:
    "9개 개발 설계 사례의 결과·승인 전 확정 리스크만 측정. 실제 정확도나 독립 검증률 아님.",
  realWorkplaceAccuracy: null,
  independentFalsePositiveRate: null,
  independentFalseNegativeRate: null,
  groundedCitationAccuracy: null,
  qualifiedReviewerAgreement: null,
  latencyP95: null,
  unmeasuredReason: "독립 정답·실무 검토·대표 표본 및 장기 운영 측정 없음",
  cases: golden,
});
console.log(
  JSON.stringify({
    head,
    sourceDigest: identity.sourceDigest,
    services: registry.length,
    operations: registry.reduce((n, s) => n + s.operations.length, 0),
    baseline: baseline?.numTotalTests,
    final: final?.numTotalTests,
    legacy: items(old, "AC").length,
    additional: items(extra, "V2-").length,
  }),
);

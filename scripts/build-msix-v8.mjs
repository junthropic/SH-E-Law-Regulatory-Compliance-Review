#!/usr/bin/env node
// v8 stage 4: builds the MSIX package (Microsoft Store desktop app, full trust).
// Usage:
//   node scripts/build-msix-v8.mjs --test-identity [--sign-test] [--out .local/msix]   local / CI install test
//   node scripts/build-msix-v8.mjs --store [--out .local/msix]                         Store upload (unsigned; the Store signs)
// Package layout:  SHELaw.exe (launcher) · Assets/ · THIRD_PARTY_NOTICES.txt · app/{node/node.exe, server/*.js, server/vendor/*.js, dist/, dist-beta/, data/public/, node_modules/pdfjs-dist}
// The server is bundled with rolldown, so dev dependencies, tests, docs and unused library files never enter the package.
// Off in the installed build (SHE_INSTALLED=1), so not shipped: korean-law-mcp (/api/mcp/query), playwright-core (국민신문고 collection).
// The test certificate's private key is created in memory and written only to the --cert-dir (default .local/msix-cert, git-ignored);
// its password is random, passed to signtool, and never printed.
import { build } from "rolldown";
import { builtinModules, createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const store = args.includes("--store"), testIdentity = args.includes("--test-identity"), signTest = args.includes("--sign-test");
if (store === testIdentity) fail("--store 또는 --test-identity 중 하나를 지정하세요.");
if (store && signTest) fail("Store 업로드용 패키지는 서명하지 않습니다(Store가 서명).");
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, opt("--out", ".local/msix"));
const certDir = resolve(root, opt("--cert-dir", ".local/msix-cert"));
const stage = join(out, "stage");
const app = join(stage, "app");
const require = createRequire(join(root, "package.json"));

function fail(message) { console.error("build-msix: " + message); process.exit(1); }
function run(cmd, cmdArgs, options = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (r.status !== 0) fail(`${cmd.split(/[\\/]/).pop()} 실패 (${r.status}): ${(r.stderr || r.stdout || "").slice(-2000)}`);
  return r.stdout;
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function walk(dir, list = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, list) : list.push(p); } return list; }
const fileVersion = (exe) => run("powershell.exe", ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${exe}').VersionInfo.FileVersion`]).trim();

// --- identity -------------------------------------------------------------------------------
const identity = JSON.parse(readFileSync(join(root, "packaging/msix/identity.json"), "utf8"));
if (store && [identity.identityName, identity.publisher].some((v) => /TODO/.test(v)))
  fail("packaging/msix/identity.json 의 Partner Center 값(identityName, publisher)이 아직 TODO입니다.");
if (testIdentity) Object.assign(identity, { identityName: "SHELaw.Beta.LocalTest", publisher: "CN=SHELaw Local Test" });
if (!/^[-.A-Za-z0-9]{3,50}$/.test(identity.identityName)) fail("identityName 형식 오류");
if (!/^\d+\.\d+\.\d+\.0$/.test(identity.version)) fail("version 은 a.b.c.0 형식이어야 합니다(Store 규칙).");

// --- Windows SDK tools ----------------------------------------------------------------------
const kits = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
const sdk = existsSync(kits) ? readdirSync(kits).filter((v) => /^10\.\d+\.\d+\.\d+$/.test(v) && existsSync(join(kits, v, "x64", "makeappx.exe")))
  .sort((a, b) => a.split(".").map(Number).reduce((d, x, i) => d || x - Number(b.split(".")[i]), 0)).at(-1) : undefined;
if (!sdk) fail("Windows SDK(makeappx.exe)를 찾지 못했습니다.");
const tool = (name) => join(kits, sdk, "x64", name);
const csc = join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!existsSync(csc)) fail(".NET Framework C# 컴파일러(csc.exe)를 찾지 못했습니다.");

// --- app build ------------------------------------------------------------------------------
if (!args.includes("--skip-build")) {
  run("npm run build", [], { shell: true });
}
for (const f of ["build/server/index.js", "dist/index.html", "dist-beta/index.html", "data/public/bundle.json.gz"])
  if (!existsSync(join(root, f))) fail(f + " 가 없습니다.");
rmSync(stage, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

// Server bundle. Externals: node built-ins; pdfjs-dist (shipped as files, it loads its own worker/fonts); optional OCR/image
// engines kordoc tries and skips when absent; korean-law-mcp (MCP is off in the installed build); playwright-core
// (국민신문고 collection is off in the installed build and loads it only on demand).
// Every npm module goes to app/server/vendor/<package>.js and our code stays in app/server/*.js, so third-party text is
// identifiable by path (package scan exceptions apply only there). The isolated parser may read app/server/vendor/.
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => "node:" + m)]);
const shipped = ["pdfjs-dist"];
const absent = ["korean-law-mcp", "playwright-core", "sharp", "onnxruntime-node", "@huggingface/transformers", "@hyzyla/pdfium", "puppeteer-core"];
const isExternal = (id) => builtins.has(id) || [...shipped, ...absent].some((e) => id === e || id.startsWith(e + "/"));
const npmPackage = (id) => { const parts = id.split(/[\\/]/); const i = parts.lastIndexOf("node_modules"); if (i < 0) return null;
  return parts[i + 1]?.startsWith("@") ? parts[i + 1] + "+" + parts[i + 2] : parts[i + 1]; };
const bundle = await build({
  cwd: root,
  input: { index: "build/server/index.js", "parse-worker": "build/server/parse-worker.js", "parser-worker-v5": "build/server/parser-worker-v5.js" },
  platform: "node",
  external: isExternal,
  output: {
    dir: join(app, "server"), format: "esm", entryFileNames: "[name].js", comments: { legal: false },
    // Chunks made only of npm modules (or the bundler runtime), e.g. kordoc's lazily loaded parts, also go to vendor/.
    chunkFileNames: (c) => c.name.startsWith("vendor/") || (c.facadeModuleId && npmPackage(c.facadeModuleId)) || (c.moduleIds.length && c.moduleIds.every((m) => npmPackage(m) || m.startsWith("\0"))) ? (c.name.startsWith("vendor/") ? "[name].js" : "vendor/[name].js") : "[name].js",
    codeSplitting: { groups: [{ debugName: "vendor-by-package", name: (id) => { const pkg = npmPackage(id); return pkg ? "vendor/" + pkg.replace(/^@/, "").replace("+", "__") : /rolldown[\\/:]runtime|^\0/.test(id) ? "vendor/rolldown-runtime" : null; } }] },
  },
  logLevel: "warn",
});
for (const w of ["parse-worker.js", "parser-worker-v5.js"]) {
  const own = [...readFileSync(join(app, "server", w), "utf8").matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith("vendor/"));
  if (own.length) fail(w + " 가 vendor 밖 파일을 가져옵니다(격리 파서는 읽을 수 없음): " + own.join(", "));
}
// rolldown marks each module with a "//#region node_modules/..." comment; those build-time paths are not needed at run time.
const MAKER_URL = /https:\/\/raw\.githubusercontent\.com\/[^/"'`\s]+\/SH-E-Law-Check\/[^"'`\s]*/g;
let makerUrls = 0;
for (const f of walk(join(app, "server")).filter((f) => f.endsWith(".js"))) {
  // The maker-repository update URL (bundles.ts) is unreachable in the installed build (/api/public/update answers 403); drop it.
  const text = readFileSync(f, "utf8").replace(/^\/\/#(?:region .*|endregion)\r?\n/gm, "");
  makerUrls += (text.match(MAKER_URL) ?? []).length;
  writeFileSync(f, text.replace(MAKER_URL, "https://invalid.invalid/removed-in-installed-build"));
}
if (makerUrls !== 1) fail("제작자 저장소 주소를 정확히 1곳에서 지우지 못했습니다: " + makerUrls);
writeFileSync(join(app, "package.json"), JSON.stringify({ private: true, type: "module" }) + "\n");

// Front-end builds and the initial public law bundle (package-time snapshot; updates come from the in-app collection).
cpSync(join(root, "dist"), join(app, "dist"), { recursive: true });
cpSync(join(root, "dist-beta"), join(app, "dist-beta"), { recursive: true, filter: (s) => !s.endsWith("build-info.json") });
mkdirSync(join(app, "data", "public"), { recursive: true });
cpSync(join(root, "data/public/bundle.json.gz"), join(app, "data/public/bundle.json.gz"));

// Shipped external libraries: runtime files only.
const pdfjs = join(dirname(require.resolve("kordoc")), "..", "node_modules", "pdfjs-dist");
const pdfjsRoot = existsSync(pdfjs) ? pdfjs : dirname(require.resolve("pdfjs-dist/package.json"));
const keepPdf = (s) => { const r = relative(pdfjsRoot, s).split(sep).join("/");
  return r === "" || r === "package.json" || r === "LICENSE" || r === "legacy" || r === "legacy/build" || /^legacy\/build\/pdf(\.worker)?\.mjs$/.test(r) || /^(cmaps|standard_fonts)(\/|$)/.test(r); };
cpSync(pdfjsRoot, join(app, "node_modules", "pdfjs-dist"), { recursive: true, filter: keepPdf });
// kordoc loads cfb (old binary .hwp) with a runtime require the bundler cannot follow: ship it and its dependencies
// (package.json, license, main file only).
const runtimeRequired = [];
const shipCjs = (name, from) => {
  const dir = dirname(createRequire(from).resolve(name + "/package.json"));
  if (runtimeRequired.includes(dir)) return;
  runtimeRequired.push(dir);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const main = createRequire(join(dir, "package.json")).resolve("./" + (pkg.main || "index.js").replace(/^\.\//, ""));
  for (const f of [join(dir, "package.json"), main, ...readdirSync(dir).filter((n) => /^licen[cs]e/i.test(n)).map((n) => join(dir, n))])
    cpSync(f, join(app, "node_modules", name, relative(dir, f)));
  for (const dep of Object.keys(pkg.dependencies ?? {})) shipCjs(dep, join(dir, "package.json"));
};
shipCjs("cfb", require.resolve("kordoc"));

// Node runtime (the version that builds is the version that ships; recorded below).
mkdirSync(join(app, "node"), { recursive: true });
cpSync(process.execPath, join(app, "node", "node.exe"));
const nodeLicense = join(dirname(process.execPath), "LICENSE");
if (!existsSync(nodeLicense) && store) fail("Node LICENSE 파일이 없습니다. 공식 Node 배포본(zip, setup-node)으로 빌드하세요.");

// Third-party notices: every npm package that ended up in the bundle, the shipped libraries, and Node.
const packages = new Map();
const packageRoot = (file) => { const parts = file.split(/[\\/]/); const i = parts.lastIndexOf("node_modules"); if (i < 0) return null;
  return parts.slice(0, i + (parts[i + 1]?.startsWith("@") ? 3 : 2)).join(sep); };
for (const chunk of bundle.output) for (const id of chunk.moduleIds ?? []) { const p = packageRoot(id); if (p && !packages.has(p)) packages.set(p, true); }
const licenseText = (dir) => { const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n)); return f ? readFileSync(join(dir, f), "utf8").trim() : null; };
const notices = [];
for (const dir of [...[...packages.keys()].sort(), pdfjsRoot, ...runtimeRequired]) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (notices.some((n) => n.name === pkg.name && n.version === pkg.version)) continue;
  notices.push({ name: pkg.name, version: pkg.version, license: typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "UNKNOWN"), text: licenseText(dir) });
}
// Fonts bundled into dist-beta/ by the beta build (beta/beta.css @font-face): the license text ships with the package.
notices.push({ name: "Pretendard (font: Regular, SemiBold, Bold woff2)", version: "1.3.9", license: "OFL-1.1", text: readFileSync(join(root, "beta/fonts/LICENSE-Pretendard.txt"), "utf8").trim() });
notices.push({ name: "Node.js", version: process.version.slice(1), license: "MIT and others (see text)", text: existsSync(nodeLicense) ? readFileSync(nodeLicense, "utf8").trim() : null });
const noticeFile = ["SH·E 법령조회 베타에 포함된 외부 소프트웨어와 라이선스", "",
  ...notices.flatMap((n) => [`==== ${n.name} ${n.version} (${n.license}) ====`, n.text ?? "(패키지에 라이선스 파일 없음 — package.json 의 license 항목 참조)", ""])].join("\n");
writeFileSync(join(stage, "THIRD_PARTY_NOTICES.txt"), noticeFile);

// Launcher (C# 5, in-box .NET Framework compiler) and visual assets.
run(csc, ["-nologo", "-codepage:65001", "-target:winexe", "-platform:anycpu", "-optimize+",
  "-win32icon:" + join(root, "packaging/msix/Assets/app.ico"), "-win32manifest:" + join(root, "packaging/msix/launcher/app.manifest"),
  "-r:System.Windows.Forms.dll", "-r:System.Drawing.dll", "-out:" + join(stage, "SHELaw.exe"), join(root, "packaging/msix/launcher/Launcher.cs")]);
mkdirSync(join(stage, "Assets"), { recursive: true });
for (const f of readdirSync(join(root, "packaging/msix/Assets")).filter((f) => f.endsWith(".png")))
  cpSync(join(root, "packaging/msix/Assets", f), join(stage, "Assets", f));

// Manifest.
const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const description = "검토 후보 — 법적 판단 아님, 베타. 환경안전보건 법령 검토를 돕는 PC용 프로그램입니다.";
const manifest = readFileSync(join(root, "packaging/msix/AppxManifest.template.xml"), "utf8")
  .replace(/{{(\w+)}}/g, (_, k) => { const v = k === "description" ? description : identity[k]; if (v === undefined) fail("manifest 값 없음: " + k); return xml(v); });
writeFileSync(join(stage, "AppxManifest.xml"), manifest);

// Resource index (tile scale/plate variants) and the package.
run(tool("makepri.exe"), ["createconfig", "/cf", join(out, "priconfig.xml"), "/dq", "ko-KR", "/o"]);
run(tool("makepri.exe"), ["new", "/pr", stage, "/cf", join(out, "priconfig.xml"), "/of", join(stage, "resources.pri"), "/o"]);
const name = `SHELaw-Beta_${identity.version}_x64${store ? "_store" : "_test"}.msix`;
const msix = join(out, name);
rmSync(msix, { force: true });
run(tool("makeappx.exe"), ["pack", "/d", stage, "/p", msix, "/o", "/h", "SHA256"]);

// Optional test signature (self-signed; trusted only where the test explicitly trusts it).
let signed = false;
if (signTest) {
  mkdirSync(certDir, { recursive: true });
  const pfx = join(certDir, "test-signing.pfx"), cer = join(certDir, "test-signing.cer"), password = randomBytes(24).toString("base64url");
  const ps = `$ErrorActionPreference='Stop'
$rsa=[System.Security.Cryptography.RSA]::Create(3072)
$req=New-Object System.Security.Cryptography.X509Certificates.CertificateRequest($env:SUBJECT,$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension($false,$false,0,$true)))
$req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature,$true)))
$eku=New-Object System.Security.Cryptography.OidCollection; [void]$eku.Add((New-Object System.Security.Cryptography.Oid('1.3.6.1.5.5.7.3.3')))
$req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension($eku,$false)))
$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1),[DateTimeOffset]::UtcNow.AddDays(30))
[IO.File]::WriteAllBytes($env:PFX,$cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$env:PFX_PASSWORD))
[IO.File]::WriteAllBytes($env:CER,$cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))`;
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { env: { ...process.env, SUBJECT: identity.publisher, PFX: pfx, CER: cer, PFX_PASSWORD: password } });
  run(tool("signtool.exe"), ["sign", "/fd", "SHA256", "/f", pfx, "/p", password, msix]);
  signed = true;
}

// Build record (tools, versions, sizes, hashes). No user paths: locations are relative to the output folder.
const files = walk(stage);
const info = {
  format: "she-msix-build-v8",
  builtAt: new Date().toISOString(),
  kind: store ? "store" : "test",
  identity: { name: identity.identityName, publisher: identity.publisher, version: identity.version, displayName: identity.displayName, publisherDisplayName: identity.publisherDisplayName },
  package: { file: name, bytes: statSync(msix).size, sha256: sha256(readFileSync(msix)), signed: signed ? "self-signed test certificate" : "unsigned" },
  stage: { files: files.length, bytes: files.reduce((s, f) => s + statSync(f).size, 0) },
  tools: {
    windowsSdk: sdk,
    makeappx: fileVersion(tool("makeappx.exe")),
    makepri: fileVersion(tool("makepri.exe")),
    ...(signed ? { signtool: fileVersion(tool("signtool.exe")) } : {}),
    csc: fileVersion(csc),
    node: process.version,
    rolldown: require("rolldown/package.json").version,
  },
  bundledPackages: notices.map((n) => `${n.name}@${n.version}`),
};
writeFileSync(join(out, "msix-build.json"), JSON.stringify(info, null, 2) + "\n");
console.log(JSON.stringify({ package: name, bytes: info.package.bytes, signed: info.package.signed, files: info.stage.files, node: process.version, sdk }));

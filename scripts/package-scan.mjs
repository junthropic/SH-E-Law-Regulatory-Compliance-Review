#!/usr/bin/env node
// Package / repository scanner (v8 stage 0). Reports WHERE a finding is and WHAT kind it is; matched values are never printed.
// Usage:
//   node scripts/package-scan.mjs <folder | file.msix | file.appx | file.zip> [--package] [--json out.json]
//   node scripts/package-scan.mjs --git-tracked [--json out.json]      (files tracked at the current commit)
//   node scripts/package-scan.mjs --git-history [--json out.json]      (every blob reachable from any ref)
// --package additionally fails on files that must not ship (forbidden folders, dev scripts, private keys).
// Names to look for come from SHE_SCAN_NAMES (comma separated) or .local/package-scan-names.txt (git-ignored); never from this file.
// --allow <exceptions.json> (v8 stage 4): third-party text that ships with the package (license notices, library code) is
// reviewed once and recorded by file, kind and the SHA-256 of the matched text. Only exact matches are accepted; a new or
// changed match fails. Names, the current Windows user's path, forbidden folders/files and dev scripts can never be excepted.
//   --write-allow <draft.json> writes every exceptable finding of this scan as a draft for review (reason "UNREVIEWED").
// .gz files are decompressed and their content is scanned.
import {readFileSync,readdirSync,statSync,existsSync,writeFileSync} from "node:fs";
import {join,relative,sep} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {userInfo} from "node:os";
import {gunzipSync} from "node:zlib";
import AdmZip from "adm-zip";

const KEY_PATTERNS=[
  ["key:openai",/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ["key:anthropic",/sk-ant-[A-Za-z0-9_-]{20,}/g],
  ["key:github",/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["key:aws",/\bAKIA[0-9A-Z]{16}\b/g],
  ["key:google",/\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["key:jwt",/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["key:private-key-block",/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  // data.go.kr style service keys: long base64 with +,/ or %2B/%2F and = padding
  ["key:base64-service-key",/(?<![A-Za-z0-9+/%])[A-Za-z0-9+/]{40,}(?:%2B|%2F|[+/])[A-Za-z0-9+/%]{10,}={0,2}(?![A-Za-z0-9+/%])/g],
  // .env style: NAME containing KEY/TOKEN/SECRET/OC/PASSWORD = value (e.g. 64-char hex public-data keys, LAW_OC)
  ["key:env-assignment",/^[ \t]*(?:export[ \t]+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|_OC|PASSWORD|PASSWD)[A-Z0-9_]*[ \t]*=[ \t]*["']?(?!TODO|your|<|\$\{)[^\s"'#]{8,}/gm],
  ["key:assignment",/\b(?:api[_-]?key|service[_-]?key|secret|access[_-]?token|client[_-]?secret|LAW_OC|OPENAI_API_KEY)\b\s*[:=]\s*["']?(?!TODO|your|<|\$\{|process\.env|example|sample|fixture|synthetic|test)[A-Za-z0-9+/=_%.-]{12,}/gi],
];
const EMAIL=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_ALLOW=[/^noreply@anthropic\.com$/i,/@users\.noreply\.github\.com$/i,/@example\.(com|org|net)$/i,/^TODO_/i,/@(?:[^@]*\.)?(test|invalid|localhost|example)$/i]; // RFC 2606 reserved names
const USER_PATH=/(?:[A-Za-z]:[\\/]+Users[\\/]+|\/home\/|\/Users\/)([^\\/\s"'`<>:*?|]+)/g;
const USER_PATH_ALLOW=new Set(["<user>","USER","user","runner","Public","Default","%USERNAME%","username","…","..."]);
const FORBIDDEN_DIRS=[".git",".local","work","docs","tests","coverage","playwright-report","test-results","backups","private",".github"];
const FORBIDDEN_FILE=[/^\.env(\..*)?$/i,/\.(pfx|p12|key|pem)$/i,/\.(sqlite|db)(-wal|-shm)?$/i,/\.dpapi$/i];
const DEV_SCRIPT=/^scripts[\\/].*\.(mjs|ts|py)$/;

function names(){const env=(process.env.SHE_SCAN_NAMES||"").split(",").map(s=>s.trim()).filter(Boolean);
  const file=".local/package-scan-names.txt";return [...env,...(existsSync(file)?readFileSync(file,"utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[])];}
const valueHash=v=>createHash("sha256").update(v).digest("hex");
const currentUser=(()=>{try{return userInfo().username.toLowerCase();}catch{return "";}})();
function scanText(rel,text,findings,nameList){
  const lineOf=i=>text.slice(0,i).split("\n").length,add=(kind,i,v,extra={})=>findings.push({file:rel,kind,line:lineOf(i),valueSha256:valueHash(v),...extra});
  for(const [kind,re] of KEY_PATTERNS)for(const m of text.matchAll(re))add(kind,m.index,m[0]);
  for(const m of text.matchAll(EMAIL))if(!EMAIL_ALLOW.some(a=>a.test(m[0])))add("email",m.index,m[0]);
  // The current user's path and names are reported without a value hash (a short value's hash could be guessed back).
  // The current user's own folder is reported even when its name is on the allow list (e.g. a CI account named "runner").
  for(const m of text.matchAll(USER_PATH)){if(currentUser&&m[1].toLowerCase()===currentUser)findings.push({file:rel,kind:"user-path",line:lineOf(m.index),currentUser:true});else if(!USER_PATH_ALLOW.has(m[1]))add("user-path",m.index,m[0]);}
  for(const n of nameList){let i=-1;while((i=text.indexOf(n,i+1))!==-1)findings.push({file:rel,kind:"name",line:lineOf(i)});}
}
function scanEntry(rel,buf,findings,nameList,pkg){
  const norm=rel.split(/[\\/]/);
  if(pkg){
    if(norm.some(s=>FORBIDDEN_DIRS.includes(s)))findings.push({file:rel,kind:"forbidden-folder",line:0});
    if(FORBIDDEN_FILE.some(r=>r.test(norm.at(-1))))findings.push({file:rel,kind:"forbidden-file",line:0});
    if(DEV_SCRIPT.test(rel))findings.push({file:rel,kind:"dev-script",line:0});
  }
  if(buf.length>50_000_000)return; // very large binaries: names/paths only
  if(/\.gz$/i.test(rel)){try{buf=gunzipSync(buf,{maxOutputLength:512_000_000});}catch{findings.push({file:rel,kind:"unreadable-archive",line:0});return;}}
  scanText(rel,buf.toString("utf8"),findings,nameList);
  if(buf.includes(0))scanText(rel,buf.toString("utf16le"),findings,nameList); // UTF-16 strings in binaries/manifests
}
function walk(dir,base=dir,out=[]){for(const n of readdirSync(dir)){const p=join(dir,n),s=statSync(p);
  if(s.isDirectory()){if(n==="node_modules"&&!process.argv.includes("--package"))continue;walk(p,base,out);}else out.push(relative(base,p));}return out;}
export function scan(target,{pkg=false,nameList=names()}={}){
  const findings=[];
  if(/\.(msix|appx|zip|msixbundle)$/i.test(target)){
    for(const e of new AdmZip(target).getEntries())if(!e.isDirectory){const data=e.getData();
      if(/\.(msix|appx)$/i.test(e.entryName)){const inner=new AdmZip(data);for(const x of inner.getEntries())if(!x.isDirectory)scanEntry(e.entryName+"!/"+x.entryName,x.getData(),findings,nameList,pkg);}
      else scanEntry(e.entryName,data,findings,nameList,pkg);}
  } else for(const rel of walk(target))scanEntry(rel.split(sep).join("/"),readFileSync(join(target,rel)),findings,nameList,pkg);
  return findings;
}
export function scanHistory({nameList=names()}={}){
  const findings=[],git=(args,opts={})=>spawnSync("git",args,{encoding:"buffer",maxBuffer:1<<30,...opts});
  const objects=git(["rev-list","--all","--objects"]).stdout.toString().split("\n").filter(Boolean).map(l=>{const i=l.indexOf(" ");return i<0?null:{sha:l.slice(0,i),path:l.slice(i+1)};}).filter(Boolean);
  const seen=new Set();
  for(const o of objects){if(seen.has(o.sha))continue;seen.add(o.sha);
    const type=git(["cat-file","-t",o.sha]).stdout.toString().trim();if(type!=="blob")continue;
    const size=Number(git(["cat-file","-s",o.sha]).stdout.toString());if(size>50_000_000)continue;
    const before=findings.length;scanEntry(o.path,git(["cat-file","-p",o.sha]).stdout,findings,nameList,false);
    for(const f of findings.slice(before))f.blob=o.sha.slice(0,10);}
  // commit metadata (author/committer identities and messages)
  const log=git(["log","--all","--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01"]).stdout.toString();
  for(const rec of log.split("\x01")){const [h,a,c,body]=rec.trim().split("\x00");if(!h)continue;scanText("commit "+h.slice(0,10)+" metadata",[a,c,body].join("\n"),findings,nameList);}
  return findings;
}
const NEVER_EXCEPT=new Set(["name","forbidden-folder","forbidden-file","dev-script","unreadable-archive"]);
export const exceptable=f=>!NEVER_EXCEPT.has(f.kind)&&!f.currentUser&&!!f.valueSha256;
const exceptionKey=f=>[f.file,f.kind,f.valueSha256].join("|");
// Accepted = exact file+kind+value match within the recorded count; everything else blocks.
export function applyExceptions(findings,exceptions){
  const left=new Map();for(const e of exceptions.entries)left.set(exceptionKey(e),(left.get(exceptionKey(e))||0)+(e.count||1));
  const accepted=[],blocking=[];
  for(const f of findings){const k=exceptionKey(f);if(exceptable(f)&&left.get(k)>0){left.set(k,left.get(k)-1);accepted.push(f);}else blocking.push(f);}
  return {accepted,blocking};
}
export function draftExceptions(findings){
  const m=new Map();
  for(const f of findings.filter(exceptable)){const k=exceptionKey(f),e=m.get(k);if(e)e.count++;else m.set(k,{file:f.file,kind:f.kind,valueSha256:f.valueSha256,count:1,reason:"UNREVIEWED"});}
  return {format:"she-package-scan-exceptions-v1",entries:[...m.values()]};
}
export function summarize(findings){const byKind={},byFile={};for(const f of findings){byKind[f.kind]=(byKind[f.kind]||0)+1;const k=f.file;byFile[k]??={};byFile[k][f.kind]=(byFile[k][f.kind]||0)+1;}return {total:findings.length,byKind,files:Object.keys(byFile).length,byFile};}

if(import.meta.url===`file://${process.argv[1].replace(/\\/g,"/").replace(/^([A-Za-z]):/,"/$1:")}`||process.argv[1]?.endsWith("package-scan.mjs")){
  const args=process.argv.slice(2),valueOf=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
  const out=valueOf("--json"),allowFile=valueOf("--allow"),draftFile=valueOf("--write-allow");
  const target=args.find((a,i)=>!a.startsWith("--")&&!["--json","--allow","--write-allow"].includes(args[i-1]));
  const tracked=()=>{const f=[];for(const rel of spawnSync("git",["ls-files","-z"],{encoding:"utf8",maxBuffer:1<<28}).stdout.split("\0").filter(Boolean))if(existsSync(rel))scanEntry(rel,readFileSync(rel),f,names(),false);return f;};
  const findings=args.includes("--git-history")?scanHistory():args.includes("--git-tracked")?tracked():scan(target??".",{pkg:args.includes("--package")});
  if(draftFile)writeFileSync(draftFile,JSON.stringify(draftExceptions(findings),null,2)+"\n");
  const exceptions=allowFile?JSON.parse(readFileSync(allowFile,"utf8")):{entries:[]};
  if(exceptions.entries.some(e=>!e.reason||e.reason==="UNREVIEWED")){console.error("package-scan: 검토되지 않은 예외 항목이 있습니다.");process.exit(2);}
  const {accepted,blocking}=applyExceptions(findings,exceptions),summary=summarize(blocking);
  if(out)writeFileSync(out,JSON.stringify({generatedAt:new Date().toISOString(),target:args.includes("--git-history")?"git-history":target,summary,...(allowFile?{accepted:summarize(accepted)}:{}),findings:blocking},null,2));
  console.log(JSON.stringify({total:summary.total,byKind:summary.byKind,files:summary.files,...(allowFile?{accepted:accepted.length}:{})}));
  process.exitCode=blocking.length?1:0;
}

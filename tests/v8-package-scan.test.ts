import {it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import AdmZip from "adm-zip";
// @ts-expect-error plain ESM script without type declarations
import {scan,summarize} from "../scripts/package-scan.mjs";
// Synthetic values only, assembled at runtime so no key-like literal is stored in the repository.
const fakeOpenAi="sk-"+"Zq9".repeat(10),fakeService="A".repeat(44)+"%2B"+"b".repeat(12)+"==";
const fakeMail="beta.user"+"@"+"corp-mail.kr",fakePath="C:"+"\\Users\\"+"hong"+"\\Documents\\x.txt",fakeName="홍길동";
const dir=()=>mkdtempSync(join(tmpdir(),"v8-scan-"));

it("V8-S01: 키 패턴·이메일·사용자 경로·이름을 위치와 종류로만 보고하고 값은 내보내지 않는다",()=>{
  const d=dir();
  try{writeFileSync(join(d,"a.txt"),`token ${fakeOpenAi}\nkey=${fakeService}\nmail ${fakeMail}\npath ${fakePath}\n작성자 ${fakeName}\n`);
    const found=scan(d,{nameList:[fakeName]}),kinds=new Set(found.map((f:any)=>f.kind));
    for(const k of ["key:openai","key:base64-service-key","email","user-path","name"])expect(kinds.has(k)).toBe(true);
    const printed=JSON.stringify({found,summary:summarize(found)});
    for(const secret of [fakeOpenAi,fakeService,fakeMail,"hong",fakeName])expect(printed.includes(secret)).toBe(false);
    expect(found.find((f:any)=>f.kind==="email").line).toBe(3);
  }finally{rmSync(d,{recursive:true,force:true});}
});
it("V8-S06: .env 형식의 키 대입(64자리 hex 공공데이터 키·LAW_OC)을 찾고 자리표시·sha256 해시 단독은 키로 보지 않는다",()=>{
  const d=dir(),hex=Array.from({length:64},(_,i)=>"0123456789abcdef"[(i*7)%16]).join("");
  try{writeFileSync(join(d,"keys.env"),`SHE_API_KEY_QNA=${hex}\nLAW_OC=${"q".repeat(5)}${"7".repeat(6)}\nSHE_API_KEY_FIRE=TODO_FILL\n`);
    writeFileSync(join(d,"hash.json"),JSON.stringify({sha256:hex}));
    const found=scan(d,{nameList:[]});
    expect(found.filter((f:any)=>f.kind==="key:env-assignment").map((f:any)=>f.file+":"+f.line)).toEqual(["keys.env:1","keys.env:2"]);
    expect(found.some((f:any)=>f.file==="hash.json")).toBe(false);
    expect(JSON.stringify(found).includes(hex)).toBe(false);
  }finally{rmSync(d,{recursive:true,force:true});}
});
it("V8-S07: 명령행은 지정한 대상만 검사하고 값 없이 요약·종료 코드를 낸다",()=>{
  const clean=dir(),dirty=dir();
  try{writeFileSync(join(clean,"a.txt"),"nothing here");writeFileSync(join(dirty,"b.txt"),"k "+fakeOpenAi);
    const run=(...a:string[])=>spawnSync(process.execPath,["scripts/package-scan.mjs",...a],{encoding:"utf8"});
    const ok=run(clean);expect(ok.status).toBe(0);expect(JSON.parse(ok.stdout).total).toBe(0);
    const bad=run(dirty,"--json",join(dirty,"out.json"));expect(bad.status).toBe(1);expect(JSON.parse(bad.stdout).byKind["key:openai"]).toBe(1);
    expect(bad.stdout.includes(fakeOpenAi)).toBe(false);
  }finally{rmSync(clean,{recursive:true,force:true});rmSync(dirty,{recursive:true,force:true});}
});
it("V8-S02: 허용 목록(noreply·example·자리표시)은 이메일로 세지 않는다",()=>{
  const d=dir();
  try{writeFileSync(join(d,"ok.txt"),"noreply@anthropic.com 1+a@users.noreply.github.com someone@example.com a@files.example.test TODO_SUPPORT_EMAIL C:\\Users\\<user>\\x");
    expect(scan(d,{nameList:[]})).toEqual([]);
  }finally{rmSync(d,{recursive:true,force:true});}
});
it("V8-S03: 패키지 모드는 금지 폴더·.env·인증서 개인 키·개발 스크립트·DB를 실패로 본다",()=>{
  const d=dir();
  try{for(const sub of ["docs","tests",".local","work","scripts","app"])mkdirSync(join(d,sub),{recursive:true});
    for(const f of ["docs/a.md","tests/a.test.ts",".local/x.txt","work/y.json","scripts/dev.mjs",".env.local","app/signing.pfx","app/private.sqlite"])writeFileSync(join(d,f),"x");
    writeFileSync(join(d,"app","index.js"),"console.log(1)");
    const kinds=scan(d,{pkg:true,nameList:[]}).map((f:any)=>f.file+":"+f.kind);
    for(const k of ["docs/a.md:forbidden-folder","tests/a.test.ts:forbidden-folder",".local/x.txt:forbidden-folder","work/y.json:forbidden-folder","scripts/dev.mjs:dev-script",".env.local:forbidden-file","app/signing.pfx:forbidden-file","app/private.sqlite:forbidden-file"])expect(kinds).toContain(k);
    expect(kinds.some((k:string)=>k.startsWith("app/index.js"))).toBe(false);
  }finally{rmSync(d,{recursive:true,force:true});}
});
it("V8-S04: MSIX(zip) 내부를 풀어 검사하고, 깨끗한 패키지는 통과한다",()=>{
  const d=dir();
  try{const bad=new AdmZip();bad.addFile("AppxManifest.xml",Buffer.from("<Identity Name=\"TODO_PARTNER_CENTER_NAME\"/>"));bad.addFile("app/config.json",Buffer.from(JSON.stringify({k:fakeOpenAi})));bad.addFile("docs/readme.md",Buffer.from("x"));bad.writeZip(join(d,"bad.msix"));
    const found=scan(join(d,"bad.msix"),{pkg:true,nameList:[]}).map((f:any)=>f.file+":"+f.kind);
    expect(found).toContain("app/config.json:key:openai");expect(found).toContain("docs/readme.md:forbidden-folder");
    const good=new AdmZip();good.addFile("AppxManifest.xml",Buffer.from("<Identity Name=\"TODO_PARTNER_CENTER_NAME\"/>"));good.addFile("app/server.js",Buffer.from("export {}"));good.writeZip(join(d,"good.msix"));
    expect(scan(join(d,"good.msix"),{pkg:true,nameList:[]})).toEqual([]);
  }finally{rmSync(d,{recursive:true,force:true});}
});
it("V8-S05: UTF-16 문자열(바이너리·매니페스트)의 이름·경로도 찾는다",()=>{
  const d=dir();
  try{writeFileSync(join(d,"bin.dat"),Buffer.concat([Buffer.from([0,1,2,0]),Buffer.from(fakePath+" "+fakeName,"utf16le")]));
    const kinds=new Set(scan(d,{nameList:[fakeName]}).map((f:any)=>f.kind));
    expect(kinds.has("user-path")).toBe(true);expect(kinds.has("name")).toBe(true);
  }finally{rmSync(d,{recursive:true,force:true});}
});

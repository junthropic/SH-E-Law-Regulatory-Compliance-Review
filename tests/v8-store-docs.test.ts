import { it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_EGRESS, PUBLIC_EGRESS, classifyHost } from "../server/egress-guard-v8.js";
import { UNINSTALL_NOTICE } from "../server/installed-v8.js";
import { PREVIEW_LABEL } from "../server/preview-v8.js";

// v8 stage 5: Store submission materials may state only what the app does (tested elsewhere); these tests keep them in step with the code.
const DIR = "docs/implementation-v8/stage5-store";
const read = (name: string) => readFileSync(join(DIR, name), "utf8");
const identity = JSON.parse(readFileSync("packaging/msix/identity.json", "utf8"));
const TEXT_DOCS = readdirSync(DIR).filter((n) => /\.(md|html)$/.test(n));
const hosts = (s: string) => new Set(s.match(/\b[a-z0-9.-]+\.(?:go\.kr|openai\.com)\b/g) ?? []);

it("V8-D01: 처리방침(MD·HTML)과 IT 요청 문안의 외부 주소는 실제 허용 목록과 같고, 허용 목록의 모든 항목을 적었다", () => {
  const md = hosts(read("privacy-policy.md"));
  for (const doc of [read("privacy-policy.html"), read("beta-guide.md")]) expect([...hosts(doc)].sort()).toEqual([...md].sort());
  for (const h of md) expect(classifyHost(h), h).not.toBe("blocked");
  for (const re of [...PUBLIC_EGRESS, ...AI_EGRESS]) expect([...md].some((h) => re.test(h)), String(re)).toBe(true);
  expect(md.has("www.epeople.go.kr")).toBe(false);
});

it("V8-D02: 제출 자료에 메일 주소·PC 경로가 없고 문의처는 자리표시로 둔다", () => {
  for (const name of TEXT_DOCS) {
    const s = read(name);
    expect(s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g), name).toBeNull();
    expect(/[A-Za-z]:\\Users\\/i.test(s), name).toBe(false);
  }
  for (const name of ["privacy-policy.md", "privacy-policy.html", "beta-guide.md"]) expect(read(name)).toContain("TODO_SUPPORT_EMAIL");
});

it("V8-D03: 상세 설명 첫 줄은 베타 라벨이고, 증명하지 않은 보안·학습 보장 표현을 쓰지 않는다", () => {
  const listing = read("store-listing.md");
  const description = listing.split("## 3. 상세 설명")[1].split(/\r?\n/).find((l) => l.startsWith("> "));
  expect(description).toBe(`> ${PREVIEW_LABEL}`);
  expect(listing.split("## 2. 짧은 설명")[1]).toContain(PREVIEW_LABEL);
  const banned = [/국제\s*보안\s*인증/, /ISO\s*\d/, /다중화/, /학습\s*미사용/, /학습에\s*(사용|이용)하지\s*않/, /보장합니다/, /100\s*%/, /완벽/];
  const prose = (name: string) => read(name).replace(/<style>[\s\S]*?<\/style>/, ""); // CSS "width:100%" is not a claim
  for (const name of TEXT_DOCS) for (const re of banned) expect(re.test(prose(name)), `${name} ${re}`).toBe(false);
});

it("V8-D04: 앱 이름·버전·제거 안내가 패키지·앱 문구와 같다", () => {
  expect(read("store-listing.md")).toContain(`| 1 | ${identity.displayName} |`);
  for (const name of ["privacy-policy.md", "privacy-policy.html", "beta-guide.md"]) {
    expect(read(name)).toContain(UNINSTALL_NOTICE);
    expect(read(name)).toContain(identity.displayName);
  }
  expect(read("privacy-policy.md")).toContain(`대상 버전: ${identity.version}`);
  expect(read("privacy-policy.html")).toContain(`대상 버전: ${identity.version}`);
});

it("V8-D05: Store 스크린샷은 4~6장, 모두 1920×1080 PNG", () => {
  const shots = readdirSync(join(DIR, "screenshots")).filter((n) => n.endsWith(".png"));
  expect(shots.length).toBeGreaterThanOrEqual(4);
  expect(shots.length).toBeLessThanOrEqual(6);
  for (const n of shots) {
    const b = readFileSync(join(DIR, "screenshots", n));
    expect(b.subarray(1, 4).toString("latin1"), n).toBe("PNG");
    expect([b.readUInt32BE(16), b.readUInt32BE(20)], n).toEqual([1920, 1080]);
  }
});

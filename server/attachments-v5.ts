import { lookup } from "node:dns/promises";
import { attachmentURL, pinnedDownload, publicIPv4 } from "./attachments-v4.js";
import { assertPrincipal, type Principal } from "./compliance-v2.js";
import { ProtectedPayloads } from "./protected-payload-v4.js";
import { parseProtected } from "./extraction-v5.js";
import { sha } from "./store.js";

export const officialAttachments = {
  form5: { url: "https://www.law.go.kr/LSW/flDownload.do?flSeq=169879609&bylClsCd=110202", mime: "application/pdf", representation: "official-pdf-representation", master: "HWP 원본과 별도 표현본" },
  notice: { url: "https://www.moel.go.kr/common/downloadFile.do?file_seq=20241202005&bbs_seq=20241201150&bbs_id=19&file_ext=hwpx", mime: "application/octet-stream", representation: "official-hwpx", master: "고용노동부고시 제2024-76호 본문" },
} as const;
export type OfficialAttachmentId = keyof typeof officialAttachments;
export function discoverOfficial(id: OfficialAttachmentId, html: string) {
  const candidate = officialAttachments[id], u = new URL(candidate.url);
  const decoded = html.replaceAll("&amp;", "&");
  // Links must actually appear in provider markup. No execution of provider scripts.
  const links = [...decoded.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(m => { try { return new URL(m[1], u.origin).href; } catch { return ""; } });
  const publishedPdf = id === "form5" && /id="pdfFlSeq"[^>]*value="169879609"/.test(decoded) && decoded.includes("/LSW/flDownload.do?flSeq=");
  if (!publishedPdf && !links.some(s => s === u.href)) throw Error("공식 페이지에서 해당 첨부 연결을 확인하지 못했습니다.");
  return { id, url: u.href, discoveryHash: sha(html), representation: candidate.representation };
}
export async function collectOfficial(p: Principal, vault: ProtectedPayloads, discovered: ReturnType<typeof discoverOfficial>,
  deps = { resolve: async (host: string) => (await lookup(host, { all: true })).map(r => r.address), download: pinnedDownload }) {
  assertPrincipal(p); if (!p.roles.includes("writer")) throw Error("원문 수집 권한 필요");
  const definition = officialAttachments[discovered.id];
  if (!definition || discovered.url !== definition.url || !/^[a-f0-9]{64}$/.test(discovered.discoveryHash)) throw Error("첨부 허용 범위 불일치");
  const u = new URL(definition.url), policy = { host: u.hostname, pathPrefix: u.pathname, maxBytes: 20_000_000, timeoutMs: 60000 };
  attachmentURL(u.href, policy);
  const ips = await deps.resolve(u.hostname); if (!ips.length || ips.some(ip => !publicIPv4(ip))) throw Error("원문 DNS 주소 차단");
  const r = await deps.download(u, ips[0], policy);
  const signature = discovered.id === "form5" ? r.bytes.subarray(0,5).toString() === "%PDF-" : r.bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));
  if (r.status !== 200 || r.peer !== ips[0] || r.bytes.length > policy.maxBytes || !signature || ![definition.mime, ...(discovered.id === "notice" ? ["application/hwp+zip", "application/vnd.hancom.hwpx"] : [])].includes(r.type as any)) throw Error("원문 응답·형식·연결 불일치");
  assertPrincipal(p);
  const ref = vault.put(p,"attachment",r.bytes,7*86400000), extraction = await parseProtected(p,vault,ref);
  return { ...discovered, ref, hash: sha(r.bytes), bytes: r.bytes.length, collectedAt: new Date().toISOString(), sourceVersion: discovered.id === "notice" ? "2024-76" : "MST290881/flSeq169879609", effectiveFrom: discovered.id === "notice" ? "2025-01-02" : null, extraction, legalApproval: false, socketObservation: deps.download === pinnedDownload ? "government-pinned-socket" : "injected-transport" };
}

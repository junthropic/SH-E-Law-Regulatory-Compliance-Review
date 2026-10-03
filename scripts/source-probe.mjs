// Manual diagnostic: public API/attachment availability, no document text or credentials in logs.
const oc = process.env.LAW_OC;
if (!oc) throw new Error("LAW_OC required");
async function api(endpoint, parameters) {
  const u = new URL("https://www.law.go.kr/DRF/" + endpoint);
  u.search = new URLSearchParams({ OC: oc, type: "JSON", ...parameters });
  const started = Date.now();
  const r = await fetch(u, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const data = await r.json();
  console.log(
    JSON.stringify({
      stage: endpoint,
      milliseconds: Date.now() - started,
      status: r.status,
    }),
  );
  return data;
}
try {
  const list = await api("lawSearch.do", {
    target: "eflaw",
    query: "위험물안전관리법 시행규칙",
    display: "1",
    nw: "3",
  });
  const rows = list.LawSearch?.law;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.법령일련번호) throw new Error("Unexpected list response");
  const raw = await api("lawService.do", {
    target: "eflaw",
    MST: String(row.법령일련번호),
    efYd: String(row.시행일자),
  });
  const links = new Set();
  function visit(value, key = "") {
    if (
      typeof value === "string" &&
      /링크|link|url/i.test(key) &&
      (/별표|첨부|파일/i.test(key) ||
        /\.hwp|\.pdf|flDownload|flSeq/i.test(value))
    ) {
      const u = new URL(value, "https://www.law.go.kr");
      if (u.protocol === "http:") u.protocol = "https:";
      if (
        u.hostname === "www.law.go.kr" &&
        u.protocol === "https:" &&
        !u.username &&
        !u.password
      ) {
        for (const name of [...u.searchParams.keys()])
          if (/^(OC|apiKey|token|key)$/i.test(name))
            u.searchParams.delete(name);
        links.add(u.href);
      }
    } else if (value && typeof value === "object")
      for (const [name, child] of Object.entries(value)) visit(child, name);
  }
  visit(raw);
  console.log(JSON.stringify({ attachmentLinks: links.size }));
  for (const [index, url] of [...links].slice(0, 3).entries()) {
    const started = Date.now();
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      const reader = r.body?.getReader();
      const first = await reader?.read();
      await reader?.cancel();
      console.log(
        JSON.stringify({
          attachment: index + 1,
          status: r.status,
          milliseconds: Date.now() - started,
          firstBytes: first?.value?.length || 0,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          attachment: index + 1,
          milliseconds: Date.now() - started,
          errorType: error.name,
        }),
      );
    }
  }
} catch (error) {
  console.log(JSON.stringify({ stage: "probe", errorType: error.name }));
  process.exitCode = 1;
}

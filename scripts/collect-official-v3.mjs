// Limited public, credential-free source capture. Never imports sources into the running app.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "docs/implementation-v3/official";
mkdirSync(root, { recursive: true });
const rows = [
  ...["0155", "0157", "0159", "0160", "0161"].map((article) => ({
    id: "civil-" + article,
    seq: "284415",
    article,
  })),
  { id: "administrative-6", seq: "269955", article: "0006" },
  { id: "hazmat-15", seq: "259933", article: "0015" },
  { id: "hazmat-18", seq: "259933", article: "0018" },
  { id: "hazmat-rule-65", seq: "287841", article: "0065" },
  { id: "hazmat-rule-68", seq: "287841", article: "0068" },
  { id: "hazmat-order-16", seq: "287381", article: "0016" },
  { id: "waste-17", seq: "284397", article: "0017" },
];
const output = [];
for (const row of rows) {
  const url = `https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=${row.seq}&joNo=${row.article}&joBrNo=00&docCls=jo&urlMode=lsScJoRltInfoR`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const raw = Buffer.from(await response.arrayBuffer()),
      html = raw.toString("utf8");
    const text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    writeFileSync(`${root}/${row.id}.html`, raw);
    writeFileSync(`${root}/${row.id}.txt`, text);
    output.push({
      ...row,
      url,
      status: response.status,
      bytes: raw.length,
      sha256: createHash("sha256").update(raw).digest("hex"),
      fetchedAt: new Date().toISOString(),
      articleMarkerPresent: text.includes("제" + Number(row.article) + "조"),
      legalApproval: false,
      raw: `${root}/${row.id}.html`,
      text: `${root}/${row.id}.txt`,
    });
  } catch (e) {
    output.push({
      ...row,
      url,
      fetchedAt: new Date().toISOString(),
      error: e.name,
      legalApproval: false,
    });
  }
  writeFileSync(
    "docs/implementation-v3/official-sources.json",
    JSON.stringify(output, null, 2),
  );
  console.log(
    JSON.stringify({
      id: row.id,
      status: output.at(-1).status || output.at(-1).error,
      marker: output.at(-1).articleMarkerPresent,
    }),
  );
}

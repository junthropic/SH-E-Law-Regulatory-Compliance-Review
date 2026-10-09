// Limited public, credential-free source capture. Never imports sources into the running app.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "docs/implementation-v4/official";
mkdirSync(root, { recursive: true });
const rows = [
 {id:'osha-36',seq:'283449',article:'0036'},
 ...['00','02','03','04'].map(branch=>({id:'osha-rule-37-'+branch,seq:'288431',article:'0037',branch})),
 {id:'waste-18',seq:'284397',article:'0018'},
 {id:'waste-rule-16-12',seq:'290881',article:'0016',branch:'12'}
];const output = [];
for (const row of rows) {
  const url = `https://www.law.go.kr/LSW/lsSideInfoP.do?lsiSeq=${row.seq}&joNo=${row.article}&joBrNo=${row.branch||"00"}&docCls=jo&urlMode=lsScJoRltInfoR`;
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
    "docs/implementation-v4/official-sources.json",
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

// Display-only reshaping of a review result. The server data and every export stay exactly as they are;
// this only decides where each existing string is shown on the result screen. Nothing is dropped except the
// plain label line and the label prefix, which the card tag already shows (tests/v8-beta-present.test.ts).

export type IssueView = {
  conclusion: string;
  lawDate: string;
  articles: string[];
  approval: string;
  tech: string[];
  conditions: string[];
};

const LAW_DATE = "법률 기준일 ";
const ARTICLES = "근거 조문: ";
const RECORD = "평가 기록 ";
const APPROVAL = "승인: ";

export function viewIssue(issue: { conclusion: string; conditions: string[] }, label: string): IssueView {
  const prefix = `[${label}]`;
  const conclusion = issue.conclusion.startsWith(prefix) ? issue.conclusion.slice(prefix.length).trimStart() : issue.conclusion;
  const v: IssueView = { conclusion, lawDate: "", articles: [], approval: "", tech: [], conditions: [] };
  for (const c of issue.conditions) {
    if (c === label) continue;
    if (c.startsWith(LAW_DATE) && !v.lawDate) v.lawDate = c.slice(LAW_DATE.length);
    else if (c.startsWith(ARTICLES) && !v.articles.length) v.articles = c.slice(ARTICLES.length).split(/,\s+/).filter(Boolean);
    else if (c.startsWith(APPROVAL) && !v.approval) v.approval = c.slice(APPROVAL.length);
    else if (c.startsWith(RECORD)) v.tech.push(c);
    else v.conditions.push(c);
  }
  return v;
}

// Same text listed more than once (several sources name the same law) is shown once.
export const unique = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

export type GapGroup = { name: string; items: string[] };
export const COMMON_GAPS = "공통";

// "법령명: 확인할 내용" lines are grouped under the law name; lines without such a prefix go under "공통".
export function groupGaps(gaps: string[]): GapGroup[] {
  const groups = new Map<string, string[]>();
  for (const g of unique(gaps)) {
    const m = /^([^:.]{1,80}): (.+)$/s.exec(g);
    const [name, item] = m ? [m[1], m[2]] : [COMMON_GAPS, g];
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  const all = [...groups].map(([name, items]) => ({ name, items }));
  return [...all.filter((g) => g.name === COMMON_GAPS), ...all.filter((g) => g.name !== COMMON_GAPS)];
}

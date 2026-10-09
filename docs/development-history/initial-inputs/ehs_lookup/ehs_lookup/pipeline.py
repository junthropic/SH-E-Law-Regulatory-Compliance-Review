"""법 조항 -> 위임(하위법령·고시·조례) -> 해석례 -> 민원 Q&A 추적 파이프라인 (조회 전용).

STEP 1  법령 식별           law(lawSearch)                          -> 법령ID/MST/소관부처
STEP 2  조문 원문·예외문구   eflaw(lawService, JO)                   -> 조문 텍스트, '다만/제외/불구하고' 등 추출
STEP 3  위임 관계           lsDelegated                             -> 시행령·시행규칙 조문, 행정규칙(고시), 자치법규
STEP 4  위임 조례 조문       lnkLsOrdJo(법령ID+JO) -> ordin(MST)     -> 시·도(시·군·구) 조례 해당 조문 원문·예외문구
        (+ STEP 3에서 나온 시행령/시행규칙 조문에 대해서도 동일하게 조례 연계 조회)
STEP 5  해석례              {부처}CgmExpc + expc(법제처)            -> 질의요지/회답/이유/관련법령
STEP 6  민원 Q&A            권익위 PolicyQnaList/Item (+ 국민신문고 원문 CSV, 노동포털 질의회시 CSV)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .law_api import MINISTRY_TARGET, LawAPI, find_exceptions, jo_codes
from .local_qna import LocalQnA
from .qna_api import CivilQnaAPI

STOP = {"관한", "대한", "등의", "경우", "기준", "사항", "방법", "절차", "그밖의", "미만", "이상", "이하", "초과",
        "설치", "관리", "운영", "제한", "의무", "신고", "허가", "특례", "적용", "범위"}


def _jo_sort_key(s: str):
    m = re.match(r"제(\d+)조(?:의(\d+))?", s or "")
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (9999, 0)


def law_core(name: str) -> str:
    """'위험물안전관리법 시행령' -> '위험물', '산업안전보건법' -> '산업안전보건'"""
    s = re.sub(r"\s*(시행령|시행규칙)$", "", name)
    s = re.sub(r"(안전관리법|관리법|에 관한 법률|법)$", "", s)
    return s or name


def title_keywords(title: str) -> list[str]:
    toks = re.findall(r"[가-힣A-Za-z0-9]{2,}", re.sub(r"[ㆍ·]", " ", title))
    out = []
    for t in toks:
        t = re.sub(r"(인|의|을|를|에|은|는|및|과|와)$", "", t)
        if len(t) >= 2 and t not in STOP and t not in out:
            out.append(t)
    return out


@dataclass
class TraceConfig:
    oc: str = "test"                       # law.go.kr OC
    data_go_kr_key: str | None = None      # data.go.kr serviceKey (권익위 Q&A)
    epeople_csv: str | None = None         # 국민신문고 원문 CSV 경로
    moel_csv: str | None = None            # 노동포털 질의회시 CSV 경로
    max_ordinances: int = 17               # 본문까지 가져올 조례 수
    max_interpretations: int = 8
    max_qna: int = 8
    follow_lower_laws: bool = True         # 시행령/시행규칙 위임조문에 대해서도 조례 연계 조회


@dataclass
class TraceResult:
    query: dict
    law: dict = field(default_factory=dict)
    article: dict = field(default_factory=dict)
    delegations: list = field(default_factory=list)
    lower_articles: list = field(default_factory=list)
    ordinances: list = field(default_factory=list)
    ordinance_index: list = field(default_factory=list)
    interpretations: list = field(default_factory=list)
    qna: list = field(default_factory=list)
    notes: list = field(default_factory=list)


def _match_region(name: str, region: str | None) -> bool:
    if not region:
        return True
    r = region.replace("특별시", "").replace("광역시", "").replace("특별자치도", "").replace("특별자치시", "").replace("도", "")[:2]
    return name.startswith(region) or name.startswith(r)


def trace(law_name: str, jo: str | int, region: str | None = None, keywords: list[str] | None = None,
          cfg: TraceConfig | None = None) -> TraceResult:
    cfg = cfg or TraceConfig()
    api = LawAPI(cfg.oc)
    res = TraceResult(query={"law": law_name, "jo": str(jo), "region": region, "keywords": keywords})

    # STEP 1
    law = api.find_law(law_name)
    if not law:
        res.notes.append(f"법령을 찾지 못함: {law_name}")
        return res
    res.law = law.__dict__

    # STEP 2
    art = api.article(law.law_id, jo)
    art.pop("raw", None)
    res.article = art
    kws = keywords or title_keywords(art.get("title", ""))[:3]
    res.query["keywords"] = kws

    # STEP 3
    res.delegations = api.delegations(law.law_id, jo)
    lower_targets = []
    if cfg.follow_lower_laws:
        for d in res.delegations:
            if d["구분"] in ("시행령", "시행규칙") and d.get("대상조문"):
                lower = api.find_law(d["대상"])
                if not lower:
                    continue
                for a in d["대상조문"][:3]:
                    no = re.match(r"제(\d+)조(?:의(\d+))?", a)
                    if not no:
                        continue
                    jo_s = no.group(1) + (f"의{no.group(2)}" if no.group(2) else "")
                    la = api.article(lower.law_id, jo_s)
                    la.pop("raw", None)
                    res.lower_articles.append({"law": lower.name, "law_id": lower.law_id,
                                               "jo": f"제{no.group(1)}조" + (f"의{no.group(2)}" if no.group(2) else ""), **la})
                    lower_targets.append((lower, jo_s))

    # STEP 4  (법 조문 + 하위법령 조문 -> 연계 조례 조문)
    links = [(law.name, x) for x in api.linked_ordinance_articles(law.law_id, jo)]
    for lw, jo_s in lower_targets:
        lbl = re.sub(r"(\d+)의(\d+)", r"\1조의\2", jo_s) if "의" in jo_s else f"{jo_s}조"
        links += [(f"{lw.name} 제{lbl}", x) for x in api.linked_ordinance_articles(lw.law_id, jo_s)]
    by_ord: dict[str, dict] = {}
    for src, x in links:
        name = x.get("자치법규명", "")
        e = by_ord.setdefault(x.get("자치법규일련번호"), {"name": name, "mst": x.get("자치법규일련번호"),
                                                     "effective": x.get("시행일자"), "articles": set(), "from": set()})
        e["articles"].add(x.get("자치법규조번호"))
        e["from"].add(src)
    res.ordinance_index = sorted(({**v, "articles": sorted(v["articles"], key=_jo_sort_key), "from": sorted(v["from"])} for v in by_ord.values()),
                                 key=lambda v: v["name"])
    targets = [o for o in res.ordinance_index if _match_region(o["name"], region)][: cfg.max_ordinances]
    if region and not targets:
        res.notes.append(f"'{region}' 연계 조례를 찾지 못함 (연계 데이터 미등록 가능). ordin 검색으로 보완 필요")
    for o in targets:
        body = api.ordinance(o["mst"])
        arts = []
        for a in o["articles"]:
            try:
                key, _, _ = jo_codes(a)
            except ValueError:
                continue
            t = body["articles"].get(key)
            if t:
                arts.append({"jo": a, "title": t["title"], "text": t["text"], "exceptions": find_exceptions(t["text"])})
        res.ordinances.append({"name": o["name"], "mst": o["mst"], "effective": o["effective"],
                               "link": f"https://www.law.go.kr/자치법규/{o['name'].replace(' ', '')}",
                               "articles": arts})

    # STEP 5  해석례 (소관부처 1차 해석 + 법제처)
    short = law.name.replace(" 시행령", "").replace(" 시행규칙", "")
    core = law_core(law.name)
    jo_label = f"제{str(jo).replace('제', '').replace('조', '')}조"
    target = MINISTRY_TARGET.get(law.ministry)
    found = []
    if target:
        # 부처 해석은 '관련법령' 필드가 비어있는 경우가 많아 본문 키워드로 수집 후 연관도 필터
        # 제목 검색(정확) -> 본문 검색(넓게) 순. 목록은 가나다순이라 아래에서 연관도 재정렬
        for q, body in [(kws[0], False), (kws[0], True), (core, False)] + [(k, False) for k in kws[1:2]]:
            if not q:
                continue
            for x in api.interpretations_ministry(target, q, body=body, display=40):
                found.append(("부처", target, x))
    for x in api.interpretations_moleg(short, body=True, display=50):
        if any(k in x.get("안건명", "") for k in kws) or jo_label in x.get("안건명", ""):
            found.append(("법제처", "expc", x))
    seen, scored = set(), []
    for src, tgt, x in found:
        sid = x.get("법령해석일련번호") or x.get("법령해석례일련번호")
        if not sid or sid in seen:
            continue
        if len(seen) >= 45:          # 상세 호출 상한(트래픽 보호)
            break
        seen.add(sid)
        d = api.interpretation_ministry(tgt, sid) if src == "부처" else api.interpretation_moleg(sid)
        blob = " ".join(str(d.get(k, "")) for k in ("안건명", "질의요지", "회답", "이유", "관련법령"))
        head = f"{d.get('안건명', '')} {d.get('질의요지', '')}"
        if kws[0] not in blob and not (core in head and any(k in blob for k in kws)):
            continue                                  # 1순위 키워드가 없고 제목/질의에 법령 핵심어도 없으면 제외
        score = 3 * (short in blob) + 2 * (core in blob) + 3 * (f"{short} {jo_label}" in blob or f"{short}」 {jo_label}" in blob) \
            + 2 * sum(k in blob for k in kws) + 4 * (kws[0] in head)
        scored.append((score, {"source": "법제처 법령해석례" if src == "법제처" else f"{law.ministry} 법령해석",
                               "id": sid, "title": d.get("안건명", ""), "date": d.get("해석일자") or d.get("등록일시", ""),
                               "question": d.get("질의요지", ""), "answer": d.get("회답", ""), "reason": d.get("이유", ""),
                               "related_law": d.get("관련법령", ""),
                               "link": f"https://www.law.go.kr/DRF/lawService.do?OC={cfg.oc}&target={tgt}&ID={sid}&type=HTML"}))
        if len(scored) >= cfg.max_interpretations * 3:
            break
    scored.sort(key=lambda s: -s[0])
    res.interpretations = [s[1] for s in scored[: cfg.max_interpretations]]

    # STEP 6  민원 Q&A
    qna = CivilQnaAPI(cfg.data_go_kr_key)
    if qna.enabled:
        for d in qna.search_with_detail(" ".join(kws[:1]), law_name=short, top=cfg.max_qna):
            res.qna.append({"source": "국민신문고 민원·정책 Q&A(권익위 API)", "title": d.get("qnaTitl"), "question": d.get("qstnCntnCl"),
                            "answer": d.get("ansCntnCl"), "org": d.get("ancName"), "dept": d.get("deptName"),
                            "law": d.get("fullName") or d.get("lwrdNm"), "date": d.get("regDate"), "law_match": d.get("_law_match")})
    else:
        res.notes.append("권익위 Q&A API 미사용(DATA_GO_KR_KEY 없음) -> 로컬 CSV만 검색")
    any_terms = [short, core] + kws[1:]
    for path, src, org in ((cfg.epeople_csv, "국민신문고 민원질의응답 원문(CSV)", ""),
                           (cfg.moel_csv, "노동포털 질의회시(CSV)", "고용노동부")):
        if path and Path(path).exists():
            res.qna += LocalQnA(path, src, org).search(all_terms=kws[:1], any_terms=any_terms, top=cfg.max_qna)
    return res


def to_markdown(r: TraceResult, max_chars: int = 600) -> str:
    cut = lambda s: (s or "").strip()[:max_chars] + ("…" if s and len(s.strip()) > max_chars else "")  # noqa: E731
    L = r.law
    md = [f"# {r.query['law']} {r.query['jo']}조 추적 결과", ""]
    md += [f"- 조회조건: 지역={r.query.get('region') or '전국'}, 키워드={', '.join(r.query.get('keywords') or [])}",
           f"- 법령: {L.get('name')} (법령ID {L.get('law_id')}, 시행 {L.get('ef_date')}, 소관 {L.get('ministry')})", ""]
    a = r.article
    md += [f"## 1. 법 조문: {a.get('title', '')}", "", cut(a.get("text")), ""]
    if a.get("exceptions"):
        md += ["**예외·단서 문구**", *[f"- {e}" for e in a["exceptions"]], ""]
    md += ["## 2. 위임 관계 (lsDelegated)", ""]
    for d in r.delegations:
        tgt = d["대상"] if isinstance(d["대상"], str) else f"{len(d['대상'])}개 조례 ({', '.join(d['대상'][:5])}…)"
        md.append(f"- [{d['구분']}] {tgt} {' '.join(d.get('대상조문', []))}")
    for la in r.lower_articles:
        md += ["", f"### {la['law']} {la['jo']} {la.get('title', '')}", cut(la.get("text"))]
        if la.get("exceptions"):
            md += ["**예외·단서**", *[f"- {e}" for e in la["exceptions"]]]
    md += ["", f"## 3. 위임 조례 (연계 조례 {len(r.ordinance_index)}건, 본문 조회 {len(r.ordinances)}건)", ""]
    md += [f"- {o['name']} (시행 {o['effective']}) 조문: {', '.join(o['articles'])} ← {', '.join(o['from'])}" for o in r.ordinance_index]
    for o in r.ordinances:
        md += ["", f"### {o['name']} (시행 {o['effective']})", o["link"]]
        for x in o["articles"]:
            md += ["", f"**{x['jo']} {x['title']}**", cut(x["text"])]
            if x["exceptions"]:
                md += ["예외·단서:", *[f"- {e}" for e in x["exceptions"]]]
    md += ["", f"## 4. 해석례 ({len(r.interpretations)}건)", ""]
    for i in r.interpretations:
        md += [f"### [{i['source']}] {i['title']}", f"- 일자: {i['date']} / 관련법령: {i['related_law']}", f"- 링크: {i['link']}",
               f"- 질의: {cut(i['question'])}", f"- 회답: {cut(i['answer'])}", ""]
    md += [f"## 5. 민원 Q&A ({len(r.qna)}건)", ""]
    for q in r.qna:
        md += [f"### [{q['source']}] {q['title']}", f"- 기관: {q.get('org', '')} / 일자: {q.get('date', '')}" + (f" / 관련법령: {q['law']}" if q.get("law") else ""),
               f"- 질의: {cut(q.get('question'))}", f"- 답변: {cut(q.get('answer'))}", ""]
    if r.notes:
        md += ["## 참고", *[f"- {n}" for n in r.notes]]
    return "\n".join(md)

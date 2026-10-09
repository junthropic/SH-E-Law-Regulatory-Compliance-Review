"""국가법령정보 공동활용 Open API (law.go.kr DRF) client — 조회 전용.

가이드: https://open.law.go.kr/LSO/openApi/guideList.do
- OC: open.law.go.kr 에서 신청한 인증값(이메일 ID). 개발 테스트는 OC=test 로도 호출됨.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .http import as_list, first_list, get_json

BASE = "http://www.law.go.kr/DRF"
WEB = "https://www.law.go.kr"

# 소관부처명 -> 중앙부처 1차 해석 target
MINISTRY_TARGET = {
    "고용노동부": "moelCgmExpc",
    "기후에너지환경부": "meCgmExpc",
    "환경부": "meCgmExpc",
    "소방청": "nfaCgmExpc",
    "행정안전부": "moisCgmExpc",
    "국토교통부": "molitCgmExpc",
    "산업통상부": "motieCgmExpc",
    "산업통상자원부": "motieCgmExpc",
    "해양수산부": "mofCgmExpc",
    "보건복지부": "mohwCgmExpc",
    "질병관리청": "kdcaCgmExpc",
    "식품의약품안전처": "mfdsCgmExpc",
    "법제처": "molegCgmExpc",
}

# 광역 지자체 기관코드 (ordin 검색 org 파라미터)
SIDO_CODE = {
    "서울": "6110000", "부산": "6260000", "대구": "6270000", "인천": "6280000",
    "광주": "6290000", "대전": "6300000", "울산": "6310000", "세종": "5690000",
    "경기": "6410000", "강원": "6530000", "충북": "6430000", "충남": "6440000",
    "전북": "6540000", "전남": "6460000", "경북": "6470000", "경남": "6480000",
    "제주": "6500000",
}

EXCEPTION_PAT = re.compile(
    r"[^.。]*?(다만|예외로 한다|제외한다|제외하고|적용하지 아니|에도 불구하고|그러하지 아니하다|특례|면제|경우에는 그러하지)[^.。]*[.。]?"
)


def jo_codes(jo: str | int):
    """'5의2' -> ('000502', '0005', '02')  (eflaw JO, lnk JO, lnk JOBR)"""
    s = str(jo).replace("제", "").replace("조", "").strip()
    m = re.match(r"(\d+)(?:의(\d+))?", s)
    if not m:
        raise ValueError(f"조문번호 형식 오류: {jo}")
    n, br = int(m.group(1)), int(m.group(2) or 0)
    return f"{n:04d}{br:02d}", f"{n:04d}", (f"{br:02d}" if br else None)


def find_exceptions(text: str) -> list[str]:
    out = []
    for m in EXCEPTION_PAT.finditer(text or ""):
        s = m.group(0).strip()
        if len(s) > 8 and s not in out:
            out.append(s)
    return out


def _flatten_article(unit: dict) -> str:
    """조문단위(항/호/목 포함)를 하나의 텍스트로."""
    parts = [unit.get("조문내용", "")]
    for h in as_list(unit.get("항")):
        if isinstance(h, dict):
            parts.append(h.get("항내용", ""))
            for ho in as_list(h.get("호")):
                if isinstance(ho, dict):
                    parts.append(ho.get("호내용", ""))
                    for mok in as_list(ho.get("목")):
                        if isinstance(mok, dict):
                            mc = mok.get("목내용", "")
                            parts.append("\n".join(mc) if isinstance(mc, list) else mc)
    return "\n".join(p if isinstance(p, str) else " ".join(map(str, p)) for p in parts if p)


@dataclass
class LawRef:
    name: str
    law_id: str
    mst: str
    ef_date: str
    ministry: str
    kind: str


class LawAPI:
    def __init__(self, oc: str = "test"):
        self.oc = oc

    # ---------- low level ----------
    def search(self, target: str, **params) -> dict:
        return get_json(f"{BASE}/lawSearch.do", {"OC": self.oc, "target": target, "type": "JSON", **params})

    def service(self, target: str, **params) -> dict:
        return get_json(f"{BASE}/lawService.do", {"OC": self.oc, "target": target, "type": "JSON", **params})

    # ---------- 법령 ----------
    def find_law(self, name: str) -> LawRef | None:
        r = self.search("law", query=name, display=20)
        for x in first_list(r, ("law",)):
            if x.get("법령명한글") == name or x.get("법령약칭명") == name:
                return LawRef(x["법령명한글"], x["법령ID"], x["법령일련번호"], x["시행일자"], x.get("소관부처명", ""), x.get("법령구분명", ""))
        lst = first_list(r, ("law",))
        if lst:
            x = lst[0]
            return LawRef(x["법령명한글"], x["법령ID"], x["법령일련번호"], x["시행일자"], x.get("소관부처명", ""), x.get("법령구분명", ""))
        return None

    def article(self, law_id: str, jo: str | int) -> dict:
        """현행(시행일) 법령 특정 조문. 반환: {title, text, exceptions, raw}"""
        jo6, _, _ = jo_codes(jo)
        r = self.service("eflaw", ID=law_id, JO=jo6)
        law = r.get("법령", {})
        units = as_list((law.get("조문") or {}).get("조문단위"))
        units = [u for u in units if isinstance(u, dict) and u.get("조문여부") == "조문"] or units
        if not units:
            return {"title": "", "text": "", "exceptions": [], "raw": r}
        u = units[0]
        text = _flatten_article(u)
        return {"title": u.get("조문제목", ""), "text": text, "exceptions": find_exceptions(text),
                "effective": u.get("조문시행일자", ""), "raw": u}

    def delegations(self, law_id: str, jo: str | int | None = None) -> list[dict]:
        """위임법령 조회(lsDelegated): 법 조문 -> 시행령/시행규칙/행정규칙(고시)/자치법규(조례)."""
        r = self.service("lsDelegated", ID=law_id)
        rows = as_list(((r.get("lsDelegated") or {}).get("법령") or {}).get("위임조문정보"))
        want = None
        if jo is not None:
            _, j4, br = jo_codes(jo)
            want = (str(int(j4)), str(int(br)) if br else None)
        out = []
        for row in rows:
            info = row.get("조정보", {})
            key = (str(info.get("조문번호", "")), str(info.get("조문가지번호") or "") or None)
            if want and (key[0] != want[0] or key[1] != want[1]):   # 제17조 조회 시 제17조의2 등 가지조문 제외
                continue
            label = f"제{key[0]}조" + (f"의{key[1]}" if key[1] else "")
            for d in as_list(row.get("위임정보")):
                kinds = as_list(d.get("위임구분"))
                titles = as_list(d.get("위임법령제목"))
                arts = as_list(d.get("위임법령조문정보"))
                for i, t in enumerate(titles):
                    kind = kinds[i] if i < len(kinds) else (kinds[0] if kinds else "")
                    # 제목이 여러 개(인용법령 묶음)면 조문-대상 대응이 불명확하므로 조문 목록을 붙이지 않음
                    tarts = arts if len(titles) == 1 else []
                    out.append({"법조문": label, "구분": kind, "대상": t,
                                "대상조문": sorted({f"제{a.get('위임법령조문번호')}조" + (f"의{a['위임법령조문가지번호']}" if a.get("위임법령조문가지번호") else "") + f"({a.get('위임법령조문제목','')})" for a in tarts if a.get("위임법령조문번호") not in (None, "0")})})
                for t, s in zip(as_list(d.get("위임행정규칙제목")), as_list(d.get("위임행정규칙일련번호"))):
                    out.append({"법조문": label, "구분": "행정규칙(고시 등)", "대상": t, "일련번호": s})
                ords = as_list(d.get("위임자치법규조문정보"))
                if ords:
                    out.append({"법조문": label, "구분": "자치법규(조례)",
                                "대상": sorted({o.get("위임자치법규제목", "") for o in ords}),
                                "건수": len({o.get("위임자치법규일련번호") for o in ords})})
        return out

    # ---------- 자치법규 ----------
    def linked_ordinance_articles(self, law_id: str, jo: str | int | None = None, max_pages: int = 5) -> list[dict]:
        """법령 조문 -> 연계 조례 조문 (lnkLsOrdJo). 시·도/시·군·구 전부."""
        params = {"knd": law_id, "display": 100}
        if jo is not None:
            _, j4, br = jo_codes(jo)
            params["JO"] = j4
            if br:
                params["JOBR"] = br
        out = []
        for page in range(1, max_pages + 1):
            r = self.search("lnkLsOrdJo", page=page, **params)
            lst = first_list(r, ("law",))
            out += lst
            root = next(iter(r.values()), {}) if r else {}
            total = int(root.get("totalCnt", 0) or 0) if isinstance(root, dict) else 0
            if len(out) >= total or not lst:
                break
        return out

    def ordinance(self, mst: str) -> dict:
        """자치법규 본문 (조문 dict: '000200' -> {title, text})."""
        r = self.service("ordin", MST=mst)
        svc = r.get("LawService", {})
        info = svc.get("자치법규기본정보", {})
        arts = {}
        for a in as_list((svc.get("조문") or {}).get("조")):
            no = as_list(a.get("조문번호"))[0] if a.get("조문번호") else ""
            arts[no] = {"title": a.get("조제목", ""), "text": (a.get("조내용", "") or "").replace("&#8729;", "·")}
        return {"info": info, "articles": arts, "byl": as_list((svc.get("별표") or {}).get("별표단위"))}

    def search_ordinance(self, query: str, sido: str | None = None, body: bool = False, display: int = 50) -> list[dict]:
        p = {"query": query, "display": display, "search": 2 if body else 1}
        if sido:
            p["org"] = SIDO_CODE.get(sido[:2], sido)
        return first_list(self.search("ordin", **p), ("law",))

    def ordinance_annex(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("ordinbyl", query=query, display=display), ("ordinbyl",))

    # ---------- 행정규칙 / 별표 ----------
    def search_admrul(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("admrul", query=query, display=display), ("admrul",))

    def law_annex(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("licbyl", query=query, display=display), ("licbyl",))

    # ---------- 해석례 ----------
    def interpretations_moleg(self, query: str, body: bool = True, display: int = 20) -> list[dict]:
        """법제처 법령해석례(expc)."""
        r = self.search("expc", query=query, search=2 if body else 1, display=display, sort="ddes")
        return first_list(r, ("expc",))

    def interpretation_moleg(self, id_: str) -> dict:
        return self.service("expc", ID=id_).get("ExpcService", {})

    def interpretations_ministry(self, ministry_or_target: str, query: str, body: bool = True, display: int = 20) -> list[dict]:
        target = MINISTRY_TARGET.get(ministry_or_target, ministry_or_target)
        r = self.search(target, query=query, search=2 if body else 1, display=display)
        return first_list(r, ("cgmExpc",))

    def interpretation_ministry(self, ministry_or_target: str, id_: str) -> dict:
        target = MINISTRY_TARGET.get(ministry_or_target, ministry_or_target)
        return self.service(target, ID=id_).get("CgmExpcService", {})

    # ---------- 판례 / 행정심판 / 지능형 검색 ----------
    def search_prec(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("prec", query=query, search=2, display=display), ("prec",))

    def search_decc(self, query: str, display: int = 20) -> list[dict]:
        return first_list(self.search("decc", query=query, search=2, display=display), ("decc",))

    def ai_search(self, query: str, scope: int = 0, display: int = 10) -> list[dict]:
        """scope 0:법령조문 1:법령 별표·서식 2:행정규칙 조문 3:행정규칙 별표·서식"""
        r = self.search("aiSearch", query=query, search=scope, display=display)
        root = r.get("aiSearch", {})
        for k in ("법령조문", "법령별표서식", "행정규칙조문", "행정규칙별표서식"):
            if k in root:
                return as_list(root[k])
        return []

    @staticmethod
    def web_link(path: str) -> str:
        return path if path.startswith("http") else f"{WEB}{path}"

"""국민신문고 민원·정책 Q&A 조회.

1) 국민권익위원회_민원정책 질의응답조회서비스 (data.go.kr 15074671)
   - PolicyQnaList : 목록 (keyword, searchType 1제목/2내용, type 1민원/2정책/3전체, regFrom/regTo)
   - PolicyQnaItem : 상세 (faqNo, dutySctnNm) -> 질의/답변 원문 + 관련 법령명(lwrdNm)/조문(fullName)
   serviceKey 는 data.go.kr 활용신청 후 발급(개발계정 자동승인, 일 10,000건).
2) 국민권익위원회_국민신문고 민원질의응답 원문데이터 (data.go.kr 15164540, CSV 2만여건) -> local_qna.py
"""
from __future__ import annotations

import html
import re
import urllib.parse

from .http import get_json

BASE = "http://apis.data.go.kr/1140100/CivilPolicyQnaService"


def _clean(s: str) -> str:
    s = html.unescape(html.unescape(s or ""))
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    return re.sub(r"<[^>]+>", "", s).strip()


class CivilQnaAPI:
    def __init__(self, service_key: str | None):
        # 포털의 'Decoding' 키를 넣으면 여기서 인코딩, 'Encoding' 키면 그대로 사용
        self.key = service_key
        if service_key and "%" not in service_key:
            self.key = urllib.parse.quote(service_key, safe="")

    @property
    def enabled(self) -> bool:
        return bool(self.key)

    def _get(self, op: str, params: dict) -> dict:
        url = f"{BASE}/{op}?serviceKey={self.key}"
        return get_json(url, params)

    def search(self, keyword: str, in_body: bool = True, kind: int = 3, page: int = 1, size: int = 20,
               reg_from: str | None = None, reg_to: str | None = None) -> dict:
        if not self.enabled:
            return {"resultList": [], "skipped": "DATA_GO_KR_KEY 미설정"}
        return self._get("PolicyQnaList", {
            "firstIndex": page, "recordCountPerPage": size, "type": kind,
            "keyword": keyword, "searchType": 2 if in_body else 1,
            "regFrom": reg_from, "regTo": reg_to,
        })

    def item(self, faq_no: str, duty: str = "tqapttn") -> dict:
        if not self.enabled:
            return {}
        d = self._get("PolicyQnaItem", {"faqNo": faq_no, "dutySctnNm": duty}).get("resultData", {}) or {}
        for k in ("qstnCntnCl", "ansCntnCl", "subjectCont"):
            if k in d:
                d[k] = _clean(d[k])
        return d

    def search_with_detail(self, keyword: str, law_name: str | None = None, top: int = 10) -> list[dict]:
        """목록 -> 상세까지. law_name 주면 상세의 관련법령(lwrdNm/fullName)이 일치하는 것을 앞으로 정렬."""
        lst = self.search(keyword, size=max(top * 2, 20)).get("resultList", []) or []
        out = []
        for x in lst[: top * 2]:
            d = self.item(x.get("faqNo"), x.get("dutySctnNm", "tqapttn"))
            if d:
                d["_law_match"] = bool(law_name and law_name in (d.get("lwrdNm", "") + d.get("fullName", "")))
                out.append(d)
        out.sort(key=lambda d: not d.get("_law_match"))
        return out[:top]

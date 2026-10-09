"""로컬 파일데이터 검색 (API 키 불필요).

- 국민신문고 민원질의응답 원문데이터 (data.go.kr 15164540, UTF-8 CSV)
  컬럼: 제목, 질문내용, 신청일자, 답변내용, 처리일자, 기관명, 부서명, 업무구분
- 고용노동부 노동포털 질의회시 AI친화 학습데이터 (data.go.kr 15167750, CP949 CSV)
  컬럼: 연번, 회시일, 질의제목, 질의, 회시, 문서번호 (파일마다 상이할 수 있어 자동 감지)

download_file() 로 포털에서 직접 내려받을 수 있음(로그인 불필요).
"""
from __future__ import annotations

import csv
import io
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

PORTAL = "https://www.data.go.kr"
DATASETS = {
    "epeople_qna": "15164540",   # 국민신문고 민원질의응답 원문
    "moel_qnr": "15167750",      # 노동포털 질의회시
}


def download_file(public_data_pk: str, out_path: str | Path) -> Path:
    """data.go.kr 파일데이터 다운로드 (로그인 불필요한 '다운로드' 타입)."""
    ua = {"User-Agent": "Mozilla/5.0"}
    page = urllib.request.urlopen(urllib.request.Request(f"{PORTAL}/data/{public_data_pk}/fileData.do", headers=ua)).read().decode("utf-8", "replace")
    m = re.search(r"fn_fileDataDown\('\d+',\s*'([^']+)'", page)
    if not m:
        raise RuntimeError("다운로드형 파일이 아님(링크형일 수 있음)")
    meta_url = f"{PORTAL}/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk={public_data_pk}&publicDataDetailPk={urllib.parse.quote(m.group(1))}"
    meta = json.loads(urllib.request.urlopen(urllib.request.Request(meta_url, headers=ua)).read())
    url = f"{PORTAL}/cmm/cmm/fileDownload.do?atchFileId={meta['atchFileId']}&fileDetailSn={meta['fileDetailSn']}"
    data = urllib.request.urlopen(urllib.request.Request(url, headers=ua)).read()
    out = Path(out_path)
    out.write_bytes(data)
    return out



def _read_csv(path: Path) -> list[dict]:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp949"):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        txt = raw.decode("utf-8", "replace")
    return list(csv.DictReader(io.StringIO(txt)))


class LocalQnA:
    def __init__(self, path: str | Path, source: str, default_org: str = ""):
        self.path = Path(path)
        self.source = source
        self.default_org = default_org
        self.rows = _read_csv(self.path) if self.path.exists() else []
        cols = list(self.rows[0].keys()) if self.rows else []
        self.title_col = next((c for c in cols if "제목" in c), cols[0] if cols else "")
        self.q_col = next((c for c in cols if c in ("질문내용", "질의") or "질의내용" in c), "")
        self.a_col = next((c for c in cols if c in ("답변내용", "회시") or "답변" in c), "")
        self.org_col = next((c for c in cols if "기관" in c), "")
        self.date_col = next((c for c in cols if "일자" in c or c.endswith("일")), "")

    def search(self, all_terms: list[str], any_terms: list[str] | None = None, top: int = 10) -> list[dict]:
        """all_terms 모두 포함 + any_terms 중 하나 이상 포함. 제목 매칭 가중."""
        res = []
        for r in self.rows:
            blob = " ".join(str(r.get(c, "")) for c in (self.title_col, self.q_col, self.a_col))
            if not all(t in blob for t in all_terms):
                continue
            if any_terms and not any(t in blob for t in any_terms):
                continue
            score = sum(blob.count(t) for t in all_terms + (any_terms or [])) + 5 * sum(t in r.get(self.title_col, "") for t in all_terms)
            res.append((score, r))
        res.sort(key=lambda x: -x[0])
        return [{"source": self.source, "title": r.get(self.title_col, ""), "question": r.get(self.q_col, ""),
                 "answer": r.get(self.a_col, ""), "org": r.get(self.org_col, "") or self.default_org,
                 "date": r.get(self.date_col, "")}
                for _, r in res[:top]]

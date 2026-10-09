"""사용 예:
  python run_trace.py --law 위험물안전관리법 --jo 4 --region 경기도
  python run_trace.py --law 산업안전보건법 --jo 114 --kw 물질안전보건자료
환경변수: LAW_OC (law.go.kr OC, 기본 test), DATA_GO_KR_KEY (권익위 Q&A API)
데이터 파일: data/epeople_qna.csv, data/moel_qnr.csv (없으면 --download 로 자동 수집)
"""
import argparse
import json
import os
from pathlib import Path

from ehs_lookup import TraceConfig, download_file, to_markdown, trace
from ehs_lookup.local_qna import DATASETS

HERE = Path(__file__).parent
DATA = HERE / "data"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--law", required=True)
    p.add_argument("--jo", required=True, help="조번호 예: 4, 5의2")
    p.add_argument("--region", help="예: 경기도, 서울특별시")
    p.add_argument("--kw", nargs="*", help="검색 키워드(미입력 시 조문제목에서 추출)")
    p.add_argument("--download", action="store_true", help="국민신문고/노동포털 CSV 내려받기")
    p.add_argument("--out", default=str(HERE / "out"))
    p.add_argument("--data", default=str(DATA), help="CSV 파일 폴더")
    a = p.parse_args()

    data = Path(a.data)
    data.mkdir(exist_ok=True)
    files = {"epeople_qna": data / "epeople_qna.csv", "moel_qnr": data / "moel_qnr.csv"}
    if a.download:
        for k, f in files.items():
            if not f.exists():
                print("download", k, download_file(DATASETS[k], f))

    cfg = TraceConfig(oc=os.getenv("LAW_OC", "test"), data_go_kr_key=os.getenv("DATA_GO_KR_KEY"),
                      epeople_csv=str(files["epeople_qna"]), moel_csv=str(files["moel_qnr"]))
    r = trace(a.law, a.jo, region=a.region, keywords=a.kw, cfg=cfg)
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    stem = f"{a.law}_제{a.jo}조" + (f"_{a.region}" if a.region else "")
    (out / f"{stem}.json").write_text(json.dumps(r.__dict__, ensure_ascii=False, indent=1, default=list), encoding="utf-8")
    (out / f"{stem}.md").write_text(to_markdown(r), encoding="utf-8")
    print("saved:", out / f"{stem}.md")


if __name__ == "__main__":
    main()

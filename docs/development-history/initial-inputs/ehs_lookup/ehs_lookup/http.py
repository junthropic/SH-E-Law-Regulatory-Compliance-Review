"""Minimal HTTP helper (stdlib only).

- EHS_CACHE_DIR 를 지정하면 응답을 파일로 캐시(sha1(url).txt) -> 반복 조회·호출량 절감
- EHS_RECORD_MISSES 를 지정하면 네트워크 실패 URL을 해당 파일에 기록하고 빈 응답으로 진행(오프라인 검증용)
"""
import hashlib
import json
import os
import time
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (ehs-lookup/0.1)"


def get_text(url: str, params: dict | None = None, timeout: int = 20, retries: int = 2) -> str:
    if params:
        q = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")}, safe=":/")
        url = f"{url}{'&' if '?' in url else '?'}{q}"
    cache_dir = os.getenv("EHS_CACHE_DIR")
    cpath = None
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        cpath = os.path.join(cache_dir, hashlib.sha1(url.encode("utf-8")).hexdigest() + ".txt")
        if os.path.exists(cpath):
            with open(cpath, encoding="utf-8") as f:
                return f.read()
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            txt = None
            for enc in ("utf-8", "cp949"):
                try:
                    txt = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            txt = txt if txt is not None else raw.decode("utf-8", errors="replace")
            if cpath:
                with open(cpath, "w", encoding="utf-8") as f:
                    f.write(txt)
            return txt
        except Exception as e:  # noqa: BLE001
            last = e
            if os.getenv("EHS_RECORD_MISSES"):
                break
            time.sleep(0.6 * (i + 1))
    miss = os.getenv("EHS_RECORD_MISSES")
    if miss:
        with open(miss, "a", encoding="utf-8") as f:
            f.write(url + "\n")
        return "{}"
    raise RuntimeError(f"GET failed: {url} ({last})")


def get_json(url: str, params: dict | None = None, **kw) -> dict:
    txt = get_text(url, params, **kw)
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return {"_raw": txt[:2000]}


def as_list(x):
    """law.go.kr returns a dict when there is exactly one hit, a list otherwise."""
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


def first_list(obj: dict, keys: tuple[str, ...]):
    """Return the first list-ish value under any of `keys` inside the response root."""
    if not isinstance(obj, dict):
        return []
    root = next(iter(obj.values()), {}) if len(obj) == 1 else obj
    if not isinstance(root, dict):
        return []
    for k in keys:
        if k in root:
            return as_list(root[k])
    return []

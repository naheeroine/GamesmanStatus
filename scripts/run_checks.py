"""Run all probes from checks.yaml in parallel with a pooled HTTP session and write data/status.json."""
from pathlib import Path
from typing import Dict, Any, List
import time, json, yaml, certifi, requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from concurrent.futures import ThreadPoolExecutor, as_completed

SCHEMA_VERSION = 1  # allows safe evolution later

# -------- helpers --------
def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def is_2xx(code: int) -> bool:
    return 200 <= code < 300

def make_session(pool_size: int) -> requests.Session:
    s = requests.Session()
    s.verify = certifi.where()
    s.headers.update({"User-Agent": "GamesmanStatus/1.0 (+github)"})
    adapter = HTTPAdapter(
        pool_connections=pool_size,
        pool_maxsize=pool_size,
        max_retries=Retry(total=2, backoff_factor=0.3, status_forcelist=[502, 503, 504]),
    )
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s

def fetch(session: requests.Session, url: str, timeout_s: float) -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        r = session.get(url, timeout=timeout_s)
        return {
            "ok": is_2xx(r.status_code),
            "status": r.status_code,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "text": r.text,
            "content": r.content,
            "headers": dict(r.headers),
        }
    except Exception as e:
        return {
            "ok": False,
            "status": 0,
            "latency_ms": int((time.perf_counter() - start) * 1000),
            "error": str(e),
        }

def check_expectations(resp: Dict[str, Any], exp: Dict[str, Any]):
    """Return (ok: bool, info: str) where info is 'ok'/'degraded'/reason."""
    # Exact status code, if provided
    want_status = exp.get("status")
    if want_status is not None and resp.get("status") != want_status:
        return False, f"expected {want_status}, got {resp.get('status')}"

    # Text must contain (case-insensitive)
    must = exp.get("must_contain")
    if isinstance(must, str):
        if must.lower() not in (resp.get("text") or "").lower():
            return False, f'missing text "{must}"'
    elif must is not None:
        return False, "invalid must_contain"

    # JSON checks
    need_keys_any = exp.get("json_keys_any")
    health_field = exp.get("health_status_field")
    data = None
    if need_keys_any or health_field:
        try:
            data = json.loads(resp.get("text") or "")
        except Exception:
            return False, "invalid JSON"

    if need_keys_any:
        if not any(k in data for k in need_keys_any):
            return False, "required JSON key missing"

    if health_field:
        v = str(data.get(health_field, "")).lower()
        if v in ("ok", "healthy", "green"):
            return True, "ok"
        if v in ("degraded", "yellow", "warn", "warning"):
            return True, "degraded"
        return False, f'health status "{v}"'

    return True, "ok"

def eval_probe(session: requests.Session, probe: Dict[str, Any],
               default_timeout_ms: int, default_degraded_ms: int) -> Dict[str, Any]:
    url = probe["url"]
    name = probe.get("name", url)
    exp = probe.get("expect", {})

    timeout_ms = int(probe.get("timeout_ms", default_timeout_ms))
    degraded_ms = int(probe.get("degraded_latency_ms", default_degraded_ms))
    timeout_s = max(0.1, timeout_ms / 1000)

    r = fetch(session, url, timeout_s)
    ts = now_iso()

    if not r["ok"]:
        note = r.get("error") or f"HTTP {r.get('status')}"
        return {"name": name, "url": url, "state": "down", "latency_ms": r["latency_ms"], "last_checked": ts, "note": note}

    ok, info = check_expectations(r, exp)
    if not ok:
        return {"name": name, "url": url, "state": "down", "latency_ms": r["latency_ms"], "last_checked": ts, "note": info}

    state = "operational" if info != "degraded" else "degraded"
    if state == "operational" and r["latency_ms"] > degraded_ms:
        state, info = "degraded", "slow response"

    out = {"name": name, "url": url, "state": state, "latency_ms": r["latency_ms"], "last_checked": ts}
    if info and info not in ("ok", "healthy"):
        out["note"] = info
    return out

# -------- main --------
def main():
    cfg = yaml.safe_load(Path("checks.yaml").read_text())
    checks: List[Dict[str, Any]] = cfg.get("checks", [])
    sched = cfg.get("schedule", {})
    default_timeout_ms = sched.get("timeout_ms", 3000)
    default_degraded_ms = sched.get("degraded_latency_ms", 2000)

    # pool/concurrency sizing
    workers = min(20, max(2, len(checks) or 1))
    session = make_session(workers)

    # preserve YAML order by storing results by index
    results: List[Dict[str, Any]] = [None] * len(checks)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        fut_to_idx = {
            ex.submit(eval_probe, session, p, default_timeout_ms, default_degraded_ms): i
            for i, p in enumerate(checks)
        }
        for fut in as_completed(fut_to_idx):
            i = fut_to_idx[fut]
            try:
                results[i] = fut.result()
            except Exception as e:
                p = checks[i]
                results[i] = {
                    "name": p.get("name", p.get("url")),
                    "url": p.get("url"),
                    "state": "down",
                    "latency_ms": None,
                    "last_checked": now_iso(),
                    "note": f"internal error: {e}",
                }

    states = [c["state"] for c in results]
    if any(s in ("down", "outage", "fail") for s in states):
        summary = "Major outage"
    elif any(s == "degraded" for s in states):
        summary = "Partial degradation"
    else:
        summary = "All systems operational"

    out = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": now_iso(),
        "summary": summary,
        "components": results,
    }
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/status.json").write_text(json.dumps(out, indent=2))
    print("Wrote data/status.json")

if __name__ == "__main__":
    main()
    # print for local visibility (useful in CI logs too)
    print(Path("data/status.json").read_text())

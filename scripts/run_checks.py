"""Read checks.yaml, run each probe, and write data/status.json (operational/degraded/down + latency)."""
from pathlib import Path
import time, json, requests, certifi, yaml

def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def fetch(url: str, timeout_s: float):
    start = time.time()
    try:
        r = requests.get(url, timeout=timeout_s, verify=certifi.where())
        latency_ms = int((time.time() - start) * 1000)
        return {"ok": r.ok, "status": r.status_code, "latency_ms": latency_ms, "text": r.text, "content": r.content, "headers": r.headers}
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        return {"ok": False, "status": 0, "latency_ms": latency_ms, "error": str(e)}

def check_expectations(resp, exp):
    # Status code
    want_status = exp.get("status")
    if want_status is not None and resp.get("status") != want_status:
        return False, f"expected {want_status}, got {resp.get('status')}"

    # HTML/text contains
    must_contain = exp.get("must_contain")
    if must_contain:
        if not isinstance(must_contain, str):  # guard
            return False, "invalid must_contain"
        if must_contain not in (resp.get("text") or ""):
            return False, f'missing text "{must_contain}"'

    # JSON validators
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
        if v == "ok" or v == "healthy" or v == "green":
            return True, "ok"  # handled below
        if v == "degraded" or v == "yellow":
            return True, "degraded"
        return False, f'health status "{v}"'
    return True, "ok"

def eval_probe(p, timeout_ms, degraded_ms):
    url = p["url"]
    name = p.get("name", url)
    exp = p.get("expect", {})
    timeout_s = max(0.1, timeout_ms / 1000)

    r = fetch(url, timeout_s)
    ts = now_iso()

    # Network/HTTP failure
    if not r["ok"]:
        note = r.get("error") or f"HTTP {r.get('status')}"
        return {"name": name, "state": "down", "latency_ms": r["latency_ms"], "last_checked": ts, "note": note}

    # Content/JSON expectations
    ok, info = check_expectations(r, exp)
    if not ok:
        return {"name": name, "state": "down", "latency_ms": r["latency_ms"], "last_checked": ts, "note": info}

    # If this is a /health style check and it reported degraded, propagate it
    state = "operational" if info != "degraded" else "degraded"

    # Latency-based degradation for non-/health checks
    if state == "operational" and r["latency_ms"] > degraded_ms:
        state, info = "degraded", "slow response"

    out = {"name": name, "state": state, "latency_ms": r["latency_ms"], "last_checked": ts}
    if info and info not in ("ok", "healthy"):
        out["note"] = info
    return out

def main():
    cfg = yaml.safe_load(Path("checks.yaml").read_text())
    sched = cfg.get("schedule", {})
    timeout_ms = sched.get("timeout_ms", 3000)
    degraded_ms = sched.get("degraded_latency_ms", 2000)

    comps = [eval_probe(p, timeout_ms, degraded_ms) for p in cfg["checks"]]
    states = [c["state"] for c in comps]
    if any(s in ("down", "outage", "fail") for s in states):
        summary = "Major outage"
    elif any(s == "degraded" for s in states):
        summary = "Partial degradation"
    else:
        summary = "All systems operational"

    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/status.json").write_text(json.dumps({
        "generated_at": now_iso(),
        "summary": summary,
        "components": comps
    }, indent=2))
    print("Wrote data/status.json")

if __name__ == "__main__":
    main()
    print(Path("data/status.json").read_text())
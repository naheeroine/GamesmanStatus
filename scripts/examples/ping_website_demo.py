"""Ping the GamesmanUni homepage (and UWAPI meta) and write status.json with operational/degraded/down + latency."""
import time, urllib.request, urllib.error, json, ssl, certifi
from pathlib import Path

# --- Probes ---
WEBSITE_URL = "https://nyc.cs.berkeley.edu/uni/games"
UWAPI_URL   = "https://nyc.cs.berkeley.edu/universal/v1/4squaretictactoe/regular/"

TIMEOUT_SECONDS = 3
DEGRADED_MS = 2000
CTX = ssl.create_default_context(cafile=certifi.where())

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def fetch(url):
    start = time.time()
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS, context=CTX) as r:
            body = r.read()
            status = r.status
    except Exception as e:
        return {"ok": False, "latency_ms": int((time.time()-start)*1000), "error": str(e)}
    return {"ok": 200 <= status < 300, "status": status, "body": body, "latency_ms": int((time.time()-start)*1000)}

def probe_website():
    r = fetch(WEBSITE_URL)
    ts = now_iso()
    if not r["ok"]:
        return {"name":"Website (GamesmanUni)","state":"down","latency_ms":r["latency_ms"],"last_checked":ts,"note":r.get("error","")}
    contains = b"Games" in r["body"]
    if not contains:
        return {"name":"Website (GamesmanUni)","state":"down","latency_ms":r["latency_ms"],"last_checked":ts,"note":'missing "Games"'}
    state = "operational" if r["latency_ms"] <= DEGRADED_MS else "degraded"
    note = "slow response" if state == "degraded" else ""
    out = {"name":"Website (GamesmanUni)","state":state,"latency_ms":r["latency_ms"],"last_checked":ts}
    if note: out["note"]=note
    return out

def probe_uwapi_meta():
    r = fetch(UWAPI_URL)
    ts = now_iso()
    if not r["ok"]:
        return {"name":"UWAPI (4SquareTicTacToe meta)","state":"down","latency_ms":r["latency_ms"],"last_checked":ts,"note":r.get("error","")}
    # must be valid JSON and include id or startPosition
    try:
        data = json.loads(r["body"])
    except Exception:
        return {"name":"UWAPI (4SquareTicTacToe meta)","state":"down","latency_ms":r["latency_ms"],"last_checked":ts,"note":"invalid JSON"}
    if not any(k in data for k in ("id","startPosition")):
        return {"name":"UWAPI (4SquareTicTacToe meta)","state":"down","latency_ms":r["latency_ms"],"last_checked":ts,"note":"missing id/startPosition"}
    state = "operational" if r["latency_ms"] <= DEGRADED_MS else "degraded"
    note = "slow response" if state == "degraded" else ""
    out = {"name":"UWAPI","state":state,"latency_ms":r["latency_ms"],"last_checked":ts}
    if note: out["note"]=note
    return out

def main():
    comps = [probe_website(), probe_uwapi_meta()]
    states = [c["state"] for c in comps]
    if any(s == "down" for s in states):
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
    print(json.dumps({"summary": summary, "components": comps}, indent=2))

if __name__ == "__main__":
    main()

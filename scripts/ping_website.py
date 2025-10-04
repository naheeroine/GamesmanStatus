import time, urllib.request, urllib.error, json
from pathlib import Path

URL = "https://nyc.cs.berkeley.edu/uni/games"
TIMEOUT_SECONDS = 3
DEGRADED_MS = 2000

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def main():
    start = time.time()
    state = "down"
    latency_ms = None
    note = ""

    try:
        with urllib.request.urlopen(URL, timeout=TIMEOUT_SECONDS) as r:
            body = r.read()
            latency_ms = int((time.time() - start) * 1000)
            ok = 200 <= r.status < 300
            contains = b"Games" in body  # simple content check

            if ok and contains:
                state = "operational" if latency_ms <= DEGRADED_MS else "degraded"
                if state == "degraded":
                    note = "slow response"
            else:
                note = f"status={r.status}, contains={contains}"
    except Exception as e:
        latency_ms = int((time.time() - start) * 1000)
        note = str(e)

    comp = {
        "name": "Website (GamesmanUni)",
        "state": state,
        "latency_ms": latency_ms,
        "last_checked": now_iso(),
    }
    if note:
        comp["note"] = note

    summary = "All systems operational" if state == "operational" else \
              ("Partial degradation" if state == "degraded" else "Major outage")

    out = {
        "generated_at": now_iso(),
        "summary": summary,
        "components": [comp]
    }

    Path("data").mkdir(parents=True, exist_ok=True)
    Path("data/status.json").write_text(json.dumps(out, indent=2))
    print("Wrote data/status.json")
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()

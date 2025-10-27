# Public API (v1)

## GET /v1/summary
Returns overall status and grouped components.

**Response fields**
- overall_status: `"ok" | "degraded" | "down"`  
- generated_at: ISO timestamp  
- groups: [
  {
    id, name,
    components: [
      {
        id, name,
        current_status,
        uptime_7d,     // percent 0–100  
        p95_latency_ms, // last 24 h  
        bars: [{ t, status, p95 }] // 24 hourly buckets  
      }
    ]
  }
]

## GET /v1/history?component=ID&days=N
- If N ≤ 7 → hourly buckets  
- If N > 7 → daily buckets

**Response**
```json
{
  "component": {"id":"game-ttt","name":"Tic-Tac-Toe"},
  "from":"2025-10-20T00:00:00Z",
  "to":"2025-10-27T00:00:00Z",
  "buckets":[
    {"window_start":"2025-10-26T00:00:00Z","ok":24,"degraded":0,"down":0,"p95_latency_ms":600,"sample_count":24}
  ]
}

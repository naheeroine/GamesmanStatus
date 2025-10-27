
---

### `docs/ARCHITECTURE.md`
```markdown
# Architecture (v1)

- One container runs:  
  - Background scheduler (5-min loop ± 20 s jitter)  
  - HTTP API server (/v1/summary, /v1/history, /healthz)

- DB: SQLite file (local)  
  Tables: probes, results_raw, metrics_hourly, metrics_daily

- Status computation:  
  - Probe → OK if assert passes and p95 ≤ SLA  
  - Degraded if assert passes but p95 > SLA  
  - Down otherwise  
  - Component/overall status = worst of children

- Rollups: nightly (00:15) raw → hourly; daily for long-term  
- Health: `/healthz` = OK if last scheduler write ≤ 12 min ago

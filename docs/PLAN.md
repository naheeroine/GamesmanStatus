# GamesmanStatus v1 — Plan

## Goal
Independent monitor that probes a few safe GamesmanUni URLs every 5 minutes, computes uptime/latency, and shows an OpenAI-style status page.

## Core features
- Probes (4): API root (JSON), homepage (HTML), one game JSON, one puzzle JSON  
- Scheduler: every 5 min ± jitter; nightly rollups  
- Assertions: HTML marker for SPA; JSON keys for API  
- DB: raw results + hourly/daily aggregates (SQLite for v1)  
- API: `/v1/summary`, `/v1/history?component=…`  
- Dashboard: banner + grouped components + hourly bars + 7-day uptime  
- Status rules: OK / Degraded / Down (alerts optional, off in v1)

## Architecture
Single container (backend API + background scheduler).  
DB = **SQLite**. Host later on Render/Fly/Cloud Run. Self-check `/healthz`.

## SLAs / thresholds
- JSON p95 SLA **800 ms**  
- HTML p95 SLA **1500 ms**  
- Timeout **5 s** (≈ 2 s connect)  
- Degraded = assert passes but p95 > SLA  
- Down = assert fails or request errors/timeout

## Scheduler & ops
- Frequency: every **5 min** with **± 20 s jitter**  
- Retries: **0** (real availability)  
- Rollups: hourly + daily  
- Retention: raw 14 d | hourly 90 d | daily 365 d

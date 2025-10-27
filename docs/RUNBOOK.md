# Runbook (v1)

## Local setup
- Requirements: Git, SQLite (installed), runtime (TBD later)
- Clone repo and edit config as needed
- Start: `python app.py` or `npm start` (once implemented)
- Verify:  
  - GET /healthz  
  - GET /v1/summary

## Deploy (later)
- Target: Render / Fly.io / Cloud Run (any one)  
- Container boots → scheduler loop starts  
- DB file mounted or persistent volume  
- Public API available at `/v1/*`  
- Dashboard served from same service or separate frontend

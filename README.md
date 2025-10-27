# GamesmanStatus

Independent uptime/latency monitor for **GamesmanUni**.  
Probes a few safe URLs every 5 minutes, stores raw results and rollups,  
and serves a simple status API and dashboard.

- **Plan:** [docs/PLAN.md](docs/PLAN.md)
- **Probes:** [docs/PROBES.md](docs/PROBES.md)
- **API contract:** [docs/API.md](docs/API.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Runbook:** [docs/RUNBOOK.md](docs/RUNBOOK.md)

v1 scope: responsiveness only (reachability + basic response structure).  
No gameplay-logic checks. No code changes to GamesmanUni.

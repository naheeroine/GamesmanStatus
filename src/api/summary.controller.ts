/**
 * /v1/summary route – returns current status + p95 latency per probe.
 */
import { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

type LatestRow = { probe_id: string; ts: number };
type LastRow = { http_code: number | null; ok: 0 | 1; latency_ms: number; error: string | null };
type LatencyRow = { latency_ms: number };

export async function registerSummaryRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get("/v1/summary", async () => {
    const now = Date.now();

    // latest sample per probe
    const latestStmt = db.prepare<[], LatestRow>(`
      SELECT probe_id, MAX(ts) as ts
      FROM results_raw
      GROUP BY probe_id
    `);
    const latest = latestStmt.all(); // LatestRow[]

    const probeSummaries = latest.map((row) => {
      const { probe_id, ts } = row;

      const lastStmt = db.prepare<[string, number], LastRow>(`
        SELECT http_code, ok, latency_ms, error
        FROM results_raw
        WHERE probe_id = ? AND ts = ?
        LIMIT 1
      `);
      const last = lastStmt.get(probe_id, ts); // LastRow | undefined

      // last 24h p95
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const latStmt = db.prepare<[string, number], LatencyRow>(`
        SELECT latency_ms
        FROM results_raw
        WHERE probe_id = ? AND ts >= ?
        ORDER BY latency_ms
      `);
      const latRows = latStmt.all(probe_id, oneDayAgo); // LatencyRow[]
      const latencies = latRows.map(r => r.latency_ms);

      let p95: number | null = null;
      if (latencies.length > 0) {
        const idx = Math.max(0, Math.floor(latencies.length * 0.95) - 1);
        p95 = latencies[idx];
      }

      const currentStatus =
        last?.ok === 1
          ? "ok"
          : last?.http_code != null
          ? "down"
          : "error";

      return {
        id: probe_id,
        current_status: currentStatus as "ok" | "down" | "error",
        http_code: last?.http_code ?? null,
        p95_latency_ms: p95,
        last_ts: ts,
        error: last?.error ?? null
      };
    });

    const overall_status =
      probeSummaries.every(p => p.current_status === "ok") ? "ok" : "degraded";

    return {
      overall_status,
      generated_at: new Date(now).toISOString(),
      probes: probeSummaries
    };
  });
}

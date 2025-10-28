/**
 * /v1/history?component=<probe_id>&days=<N>
 * Returns buckets with ok/down counts and p95 latency.
 *
 * v1 rules:
 * - Buckets: hourly if days <= 7, else daily
 * - Status in buckets derived from raw rows (ok=1 => ok; else down)
 */
import { FastifyInstance } from "fastify";
import { getDb } from "../db/client.js";

type Row = { ts: number; ok: 0 | 1; latency_ms: number };

function p95(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
  return sorted[idx];
}

export async function registerHistoryRoutes(app: FastifyInstance) {
  const db = getDb();

  app.get("/v1/history", async (req, reply) => {
    const q = req.query as Partial<{ component: string; days: string }>;
    const component = q.component?.trim();
    const days = Math.max(1, Math.min(60, Number(q.days ?? 1))); // clamp 1..60

    if (!component) {
      return reply.status(400).send({ error: "missing required query param: component" });
    }

    const now = Date.now();
    const fromTs = now - days * 24 * 60 * 60 * 1000;
    const bucketMs = days <= 7 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // hourly vs daily

    const stmt = db.prepare<[string, number], Row>(`
      SELECT ts, ok, latency_ms
      FROM results_raw
      WHERE probe_id = ? AND ts >= ?
      ORDER BY ts
    `);
    const rows = stmt.all(component, fromTs);

    // bucketize
    const buckets = new Map<number, { ok: number; down: number; latencies: number[] }>();
    for (const r of rows) {
      const bucketStart = Math.floor(r.ts / bucketMs) * bucketMs;
      const b = buckets.get(bucketStart) ?? { ok: 0, down: 0, latencies: [] };
      if (r.ok === 1) b.ok += 1; else b.down += 1;
      b.latencies.push(r.latency_ms);
      buckets.set(bucketStart, b);
    }

    const result = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([window_start, agg]) => ({
        window_start,
        ok: agg.ok,
        down: agg.down,
        p95_latency_ms: p95(agg.latencies),
        sample_count: agg.latencies.length
      }));

    return {
      component,
      from: new Date(fromTs).toISOString(),
      to: new Date(now).toISOString(),
      bucket: bucketMs === 3_600_000 ? "hour" : "day",
      buckets: result
    };
  });
}

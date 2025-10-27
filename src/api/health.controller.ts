import type { FastifyInstance } from "fastify";

export type HealthDeps = {
  /** epoch ms when the server booted */
  startedAt: number;
  /** returns epoch ms of the last scheduler heartbeat (for now: server start) */
  getHeartbeat: () => number;
};

/**
 * Registers GET /healthz.
 * v1 returns simple liveness plus timestamps you can wire to the scheduler later.
 */
export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps) {
  app.get("/healthz", async () => {
    const now = Date.now();
    return {
      status: "ok",
      now_iso: new Date(now).toISOString(),
      started_at_iso: new Date(deps.startedAt).toISOString(),
      scheduler_heartbeat_ms: deps.getHeartbeat(), // will update once scheduler exists
      uptime_ms: now - deps.startedAt
    };
  });
}

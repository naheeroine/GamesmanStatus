/**
 * GamesmanStatus – bootstrap
 * Starts Fastify, exposes /healthz, and starts a simple heartbeat scheduler.
 */
import "dotenv/config";
import Fastify from "fastify";
import { registerHealthRoutes } from "./api/health.controller.js";
import { startScheduler } from "./scheduler/index.js";

const app = Fastify({ logger: true });

// heartbeat (will be updated by the scheduler)
const startedAt = Date.now();
let lastHeartbeat = startedAt;
const getHeartbeat = () => lastHeartbeat;
const setHeartbeat = () => { lastHeartbeat = Date.now(); };

// register routes
registerHealthRoutes(app, { startedAt, getHeartbeat });

// server config
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

// start server + scheduler
async function main() {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT }, "GamesmanStatus API up");

    // start the background scheduler (5 min ± 20s)
    const cancel = startScheduler({
      onTick: async () => {
        // v1 heartbeat only; probes come next
        setHeartbeat();
      },
      intervalMs: 10_000,
      jitterSeconds: 20,
      log: (msg, meta) => app.log.info(meta ?? {}, msg)
    });

    // graceful shutdown
    const shutdown = async () => {
      cancel();
      await app.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

main();

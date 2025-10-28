/**
 * GamesmanStatus – bootstrap
 * Starts Fastify, exposes /healthz, loads probes.json,
 * runs all probes on a schedule, and writes results to SQLite (results_raw).
 */
import "dotenv/config";
import Fastify from "fastify";
import { registerHealthRoutes } from "./api/health.controller.js";
import { startScheduler } from "./scheduler/index.js";
import { runProbe } from "./probe/runner.js";
import { loadProbes, type ProbeDef } from "./config/probes.js";
import { getDb, ensureSchema, insertResults, type RawResultRow } from "./db/client.js";
import { registerSummaryRoutes } from "./api/summary.controller.js";
import { registerHistoryRoutes } from "./api/history.controller.js";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";


const app = Fastify({ logger: true });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Serve UI at /
app.register(fastifyStatic, {
  root: join(__dirname, "../public"),
  prefix: "/",                 // open http://localhost:8080/
  index: ["index.html"],
});

// heartbeat (will be updated by the scheduler)
const startedAt = Date.now();
let lastHeartbeat = startedAt;
const getHeartbeat = () => lastHeartbeat;
const setHeartbeat = () => { lastHeartbeat = Date.now(); };

// register routes
registerHealthRoutes(app, { startedAt, getHeartbeat });
registerSummaryRoutes(app);
registerHistoryRoutes(app);



// server config
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

// config
const PROBES_FILE = process.env.PROBES_FILE ?? "./probes.json";
// dev cadence: 10s; prod: set 5 * 60 * 1000
const intervalMs = 10_000;
const jitterSeconds = 20;

async function main() {
  try {
    // DB init
    const db = getDb();
    ensureSchema(db);

    // load probes at boot
    let probes: ProbeDef[] = [];
    try {
      probes = await loadProbes(PROBES_FILE);
      app.log.info({ count: probes.length, file: PROBES_FILE }, "loaded probes");
    } catch (e) {
      app.log.error({ err: (e as Error).message, file: PROBES_FILE }, "failed to load probes.json");
      process.exit(1);
    }

    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT }, "GamesmanStatus API up");

    // background scheduler: update heartbeat + run all probes in parallel + persist
    const cancel = startScheduler({
      onTick: async () => {
        setHeartbeat();
        const started = Date.now();

        // run probes concurrently
        const settled = await Promise.allSettled(
          probes.map(async (p) => {
            const r = await runProbe(p.url, 5000);
            app.log.info(
              { id: p.id, url: p.url, ok: r.ok, httpCode: r.httpCode, latencyMs: r.latencyMs, error: r.error },
              `probe ${p.id}`
            );
            // shape for DB
            const row: RawResultRow = {
              ts: Date.now(),
              probe_id: p.id,
              http_code: r.httpCode ?? null,
              ok: r.ok ? 1 : 0,
              latency_ms: r.latencyMs,
              error: r.error ?? null
            };
            return row;
          })
        );

        // build rows to insert (ignore rejections, though there shouldn't be any)
        const rows: RawResultRow[] = [];
        for (const s of settled) {
          if (s.status === "fulfilled") rows.push(s.value);
          else {
            // extremely rare path: if our runProbe throws before returning
            rows.push({
              ts: Date.now(),
              probe_id: "unknown",
              http_code: null,
              ok: 0,
              latency_ms: 0,
              error: s.reason ? String(s.reason) : "unknown-error"
            });
          }
        }

        const inserted = insertResults(db, rows);
        app.log.info({ ok: rows.filter(r => r.ok === 1).length, total: rows.length, inserted, tookMs: Date.now() - started }, "all probes completed");
      },
      intervalMs,
      jitterSeconds,
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

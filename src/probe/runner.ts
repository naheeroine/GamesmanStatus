/**
 * Simple probe runner – v1 logs latency and status for one URL.
 * Later this will evolve to read probes.json and store results.
 */
import { performance } from "node:perf_hooks";
import { request } from "undici";

export type ProbeResult = {
  url: string;
  ok: boolean;
  httpCode?: number;
  latencyMs: number;
  error?: string;
};

export async function runProbe(url: string, timeoutMs = 5000): Promise<ProbeResult> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { statusCode } = await request(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);
    return {
      url,
      ok: statusCode === 200,
      httpCode: statusCode,
      latencyMs
    };
  } catch (err) {
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - start);
    return {
      url,
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Minimal scheduler that updates a heartbeat on a 5-minute cadence with jitter.
 * No probes yet — just a tick to prove the background loop works.
 */
export type StartSchedulerOptions = {
  /** called on each tick; use it to update heartbeat */
  onTick: () => void | Promise<void>;
  /** base interval in ms (e.g., 5 * 60 * 1000) */
  intervalMs: number;
  /** ± jitter in seconds applied to each interval (e.g., 20) */
  jitterSeconds: number;
  /** optional logger */
  log?: (msg: string, meta?: Record<string, unknown>) => void;
};

export function startScheduler(opts: StartSchedulerOptions): () => void {
  const { onTick, intervalMs, jitterSeconds, log = () => {} } = opts;

  let timer: NodeJS.Timeout | null = null;
  let running = true;

  const nextDelayMs = () => {
    const j = (Math.random() * 2 - 1) * jitterSeconds * 1000; // [-j,+j] sec
    return Math.max(1_000, intervalMs + j);
  };

  const loop = async () => {
    if (!running) return;
    try {
      await onTick();
      log("scheduler tick completed", { at: new Date().toISOString() });
    } catch (err) {
      log("scheduler tick error", { err: (err as Error).message });
    }
    if (!running) return;
    timer = setTimeout(loop, nextDelayMs());
  };

  // kick off
  timer = setTimeout(loop, nextDelayMs());

  // return a cancel function
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
  };
}

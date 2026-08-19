// Periodic server-load / observability sampling into ops_series. Every process
// (primary + each worker) samples its own CPU %, memory and role-specific counters.
// Best-effort: sampling never throws into the runtime.
import { recordOps, pruneOps } from './store.js';

const OPS_EVERY_MS = 5000;
const PRUNE_EVERY = Math.round((60 * 60 * 1000) / OPS_EVERY_MS);  // ~hourly
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;                          // 7-day retention

/** Start emitting an ops sample every ~5s for this process. `worker` is 0 for the
 *  primary, else the cluster worker id. `extra()` adds role-specific gauges. When
 *  `prune` is set (primary only) old rows are trimmed hourly so the table is bounded. */
export function startOpsSampler(worker: number, extra: () => Record<string, number>, prune = false): void {
  let lastCpu = process.cpuUsage();
  let lastTs = Date.now();
  let n = 0;
  const timer = setInterval(() => {
    try {
      const now = Date.now();
      const cpu = process.cpuUsage(lastCpu);                       // delta since last sample
      const elapsedUs = Math.max(1, (now - lastTs) * 1000);
      const cpuPct = Math.round(((cpu.user + cpu.system) / elapsedUs) * 100);
      lastCpu = process.cpuUsage(); lastTs = now;
      const mem = process.memoryUsage();
      recordOps(worker, {
        rss_mb: Math.round(mem.rss / 1048576),
        heap_mb: Math.round(mem.heapUsed / 1048576),
        cpu_pct: cpuPct,
        uptime_s: Math.round(process.uptime()),
        ...extra(),
      });
      if (prune && ++n % PRUNE_EVERY === 0) pruneOps(KEEP_MS);
    } catch { /* best effort */ }
  }, OPS_EVERY_MS);
  timer.unref?.();
}

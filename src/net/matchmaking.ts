// Region-aware quick-match policy, shared by LocalHub and the cluster primary.
// A newcomer is paired immediately with a waiting player in the SAME region
// (lowest mutual latency); if none is available, they wait — but no one waits
// forever: a periodic sweep pairs the oldest waiters across regions after a
// short timeout so small/lopsided populations still get matches.
export interface Waiter { region: string; queuedAt: number; }

export const FALLBACK_MS = 8000;

/** Index of the best waiter to pair `region` with now, or -1 to keep waiting.
 *  Unknown region (XX) pairs with anyone; a known region prefers a same-region
 *  opponent, then a region-agnostic (XX) one, else waits for a same-region match
 *  (or the cross-region fallback sweep). */
export function sameRegionWaiter(waiting: Waiter[], region: string): number {
  if (region === 'XX') return waiting.length ? 0 : -1;
  const same = waiting.findIndex((w) => w.region === region);
  return same >= 0 ? same : waiting.findIndex((w) => w.region === 'XX');
}

/** Two waiters to force-pair across regions once the oldest has waited too long. */
export function agedPair(waiting: Waiter[], now: number): [number, number] | null {
  if (waiting.length < 2) return null;
  let oldest = 0;
  for (let i = 1; i < waiting.length; i++) if (waiting[i]!.queuedAt < waiting[oldest]!.queuedAt) oldest = i;
  if (now - waiting[oldest]!.queuedAt < FALLBACK_MS) return null;
  let second = -1;
  for (let i = 0; i < waiting.length; i++) { if (i === oldest) continue; if (second < 0 || waiting[i]!.queuedAt < waiting[second]!.queuedAt) second = i; }
  return second >= 0 ? [oldest, second] : null;
}

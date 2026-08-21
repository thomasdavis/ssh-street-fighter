// Region-aware quick-match policy, shared by LocalHub and the cluster primary.
// A newcomer is paired immediately with a waiting player in the SAME region
// (lowest mutual latency); if none is available, they wait — but no one waits
// forever: a periodic sweep pairs the oldest waiters across regions after a
// short timeout so small/lopsided populations still get matches.
export type OpponentPool = 'humans' | 'bots' | 'all';

export interface Waiter {
  region: string;
  queuedAt: number;
  isBot: boolean;
  opponentPool: OpponentPool;
}

export const FALLBACK_MS = 8000;

/** Index of the best waiter to pair `region` with now, or -1 to keep waiting.
 *  Unknown region (XX) pairs with anyone; a known region prefers a same-region
 *  opponent, then a region-agnostic (XX) one, else waits for a same-region match
 *  (or the cross-region fallback sweep). */
export function normalizeOpponentPool(value: unknown, fallback: OpponentPool): OpponentPool {
  return value === 'humans' || value === 'bots' || value === 'all' ? value : fallback;
}

export function acceptsOpponent(waiter: Waiter, opponent: Waiter): boolean {
  if (waiter.opponentPool === 'all') return true;
  return waiter.opponentPool === (opponent.isBot ? 'bots' : 'humans');
}

/** Both players must consent to the other's account class. A human selecting
 *  bots cannot be pulled into a human match by a bot or by the aged fallback. */
export function compatibleWaiters(a: Waiter, b: Waiter): boolean {
  return acceptsOpponent(a, b) && acceptsOpponent(b, a);
}

/** Best compatible same-region waiter for a newcomer. Unknown regions can pair
 *  with any compatible player; known regions prefer exact, then unknown. */
export function bestWaiter(waiting: Waiter[], newcomer: Waiter): number {
  const compatible = (w: Waiter): boolean => compatibleWaiters(w, newcomer);
  if (newcomer.region === 'XX') return waiting.findIndex(compatible);
  const same = waiting.findIndex((w) => w.region === newcomer.region && compatible(w));
  return same >= 0 ? same : waiting.findIndex((w) => w.region === 'XX' && compatible(w));
}

/** Two waiters to force-pair across regions once the oldest has waited too long. */
export function agedPair(waiting: Waiter[], now: number): [number, number] | null {
  if (waiting.length < 2) return null;
  const order = waiting.map((_, i) => i).sort((a, b) => waiting[a]!.queuedAt - waiting[b]!.queuedAt);
  for (const oldest of order) {
    if (now - waiting[oldest]!.queuedAt < FALLBACK_MS) return null;
    const second = order.find((i) => i !== oldest && compatibleWaiters(waiting[oldest]!, waiting[i]!));
    if (second !== undefined) return [oldest, second];
  }
  return null;
}

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
  matchKey?: string;
  recentOpponentKeys?: readonly string[];
}

export const FALLBACK_MS = 8000;
export const REMATCH_FALLBACK_MS = 30000;
export const RECENT_OPPONENT_TTL_MS = 2 * 60 * 1000;
export const RECENT_OPPONENT_LIMIT = 3;

interface RememberedOpponent { key: string; at: number }

/** Small in-memory opponent history shared by both server matchmaking hubs.
 *  It deliberately is not persisted: this is queue-shaping, not player data. */
export class RecentOpponentHistory {
  private readonly byPlayer = new Map<string, RememberedOpponent[]>();
  private lastGlobalPruneAt = 0;

  recent(playerKey: string, now = Date.now()): string[] {
    const active = (this.byPlayer.get(playerKey) ?? [])
      .filter((entry) => now - entry.at < RECENT_OPPONENT_TTL_MS)
      .slice(0, RECENT_OPPONENT_LIMIT);
    if (active.length) this.byPlayer.set(playerKey, active);
    else this.byPlayer.delete(playerKey);
    return active.map((entry) => entry.key);
  }

  remember(aKey: string, bKey: string, now = Date.now()): void {
    if (!aKey || !bKey || aKey === bKey) return;
    this.pruneExpired(now);
    this.rememberOne(aKey, bKey, now);
    this.rememberOne(bKey, aKey, now);
  }

  private pruneExpired(now: number): void {
    if (now - this.lastGlobalPruneAt < 60_000) return;
    this.lastGlobalPruneAt = now;
    for (const [playerKey, entries] of this.byPlayer) {
      const active = entries.filter((entry) => now - entry.at < RECENT_OPPONENT_TTL_MS);
      if (active.length) this.byPlayer.set(playerKey, active);
      else this.byPlayer.delete(playerKey);
    }
  }

  private rememberOne(playerKey: string, opponentKey: string, now: number): void {
    const prior = (this.byPlayer.get(playerKey) ?? [])
      .filter((entry) => entry.key !== opponentKey && now - entry.at < RECENT_OPPONENT_TTL_MS);
    this.byPlayer.set(playerKey, [{ key: opponentKey, at: now }, ...prior].slice(0, RECENT_OPPONENT_LIMIT));
  }
}

export function matchmakingPlayerKey(fp: string | null, name: string, isBot: boolean): string {
  return fp ? `fp:${fp}` : `${isBot ? 'bot' : 'human'}:${name.trim().toLowerCase()}`;
}

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

export function recentRematch(a: Waiter, b: Waiter): boolean {
  if (!a.matchKey || !b.matchKey) return false;
  return !!a.recentOpponentKeys?.includes(b.matchKey) || !!b.recentOpponentKeys?.includes(a.matchKey);
}

function rematchFallbackReady(a: Waiter, b: Waiter, now: number): boolean {
  return now - Math.min(a.queuedAt, b.queuedAt) >= REMATCH_FALLBACK_MS;
}

/** Best compatible same-region waiter for a newcomer. Unknown regions can pair
 *  with any compatible player; known regions prefer exact, then unknown. */
export function bestWaiter(waiting: Waiter[], newcomer: Waiter, now = Date.now()): number {
  const eligible = (w: Waiter, region?: string): boolean =>
    compatibleWaiters(w, newcomer) && (!region || w.region === region);
  const fresh = (w: Waiter, region?: string): boolean => eligible(w, region) && !recentRematch(w, newcomer);
  const fallback = (w: Waiter, region?: string): boolean =>
    eligible(w, region) && recentRematch(w, newcomer) && rematchFallbackReady(w, newcomer, now);

  if (newcomer.region === 'XX') {
    const preferred = waiting.findIndex((w) => fresh(w));
    return preferred >= 0 ? preferred : waiting.findIndex((w) => fallback(w));
  }
  const sameFresh = waiting.findIndex((w) => fresh(w, newcomer.region));
  if (sameFresh >= 0) return sameFresh;
  const unknownFresh = waiting.findIndex((w) => fresh(w, 'XX'));
  if (unknownFresh >= 0) return unknownFresh;
  const sameFallback = waiting.findIndex((w) => fallback(w, newcomer.region));
  return sameFallback >= 0 ? sameFallback : waiting.findIndex((w) => fallback(w, 'XX'));
}

/** Two waiters to force-pair across regions once the oldest has waited too long. */
export function agedPair(waiting: Waiter[], now: number): [number, number] | null {
  if (waiting.length < 2) return null;
  const order = waiting.map((_, i) => i).sort((a, b) => waiting[a]!.queuedAt - waiting[b]!.queuedAt);
  for (const oldest of order) {
    if (now - waiting[oldest]!.queuedAt < FALLBACK_MS) return null;
    const second = order.find((i) => i !== oldest && compatibleWaiters(waiting[oldest]!, waiting[i]!) && !recentRematch(waiting[oldest]!, waiting[i]!));
    if (second !== undefined) return [oldest, second];
  }
  for (const oldest of order) {
    if (now - waiting[oldest]!.queuedAt < REMATCH_FALLBACK_MS) return null;
    const second = order.find((i) => i !== oldest && compatibleWaiters(waiting[oldest]!, waiting[i]!));
    if (second !== undefined) return [oldest, second];
  }
  return null;
}

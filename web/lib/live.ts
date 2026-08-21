import 'server-only';
import { onlineNow } from './ringside';

// The primary exposes in-memory coordinator state (live matches, queue) on the
// loopback Ringside API. Online count comes from the DB (accurate even if the
// primary is momentarily busy); the live match list comes from the API.
const API = process.env.SF_API_URL ?? 'http://127.0.0.1:8080';

export interface LiveMatch {
  mid: string; stage: string; round: number; phase: string;
  a: { name: string; char: string; hp: number; wins: number; bot: boolean };
  b: { name: string; char: string; hp: number; wins: number; bot: boolean };
}
export interface LiveState { online: number; queued: number; queuedHumans: number; queuedBots: number; activeMatches: number; matches: LiveMatch[]; }

export async function getLive(): Promise<LiveState> {
  const online = onlineNow();
  try {
    const res = await fetch(`${API}/api/live`, { cache: 'no-store', signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const d = await res.json() as { queued?: number; queue?: { humans?: number; bots?: number }; matches?: number; live?: LiveMatch[] };
      return {
        online, queued: d.queued ?? 0, queuedHumans: d.queue?.humans ?? 0, queuedBots: d.queue?.bots ?? 0,
        activeMatches: d.matches ?? 0, matches: d.live ?? [],
      };
    }
  } catch { /* primary unreachable — counts from DB still work */ }
  return { online, queued: 0, queuedHumans: 0, queuedBots: 0, activeMatches: 0, matches: [] };
}

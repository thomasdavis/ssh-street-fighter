// IPC contract between cluster workers and the primary. Workers own connections
// and rendering; the primary owns the global matchmaking queue and runs every
// versus simulation, relaying state down and collecting inputs up. This is what
// makes quick-match work across workers: two players on different worker
// processes are paired by the one primary and play a match it simulates.
import type { Inputs, Match } from '../game/types.js';
import type { MatchResult } from '../net/session.js';

// worker -> primary
export type W2P =
  | { t: 'queue'; sid: number; cid: string; name: string; fp: string | null; cursor: number; elo: number }
  | { t: 'dequeue'; sid: number }
  | { t: 'input'; mid: string; sid: number; input: Inputs }
  | { t: 'leaveMatch'; mid: string; sid: number };

// primary -> worker (worker routes to a local session by `sid`)
export type P2W =
  | { t: 'matchStart'; sid: number; mid: string; role: 'a' | 'b'; yourCursor: number; oppName: string; oppCursor: number; stage: string }
  | { t: 'state'; sid: number; mid: string; m: Match }
  | { t: 'matchEnd'; sid: number; mid: string; result: MatchResult };

export function clearEdges(i: Inputs): void { i.jump = false; i.punch = false; i.kick = false; }

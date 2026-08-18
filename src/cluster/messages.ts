// IPC contract between cluster workers and the primary. Workers own connections
// and rendering; the primary owns the global matchmaking queue and runs every
// versus simulation, relaying state down and collecting inputs up. This is what
// makes quick-match work across workers: two players on different worker
// processes are paired by the one primary and play a match it simulates.
import type { Inputs, Match } from '../game/types.js';
import type { MatchResult } from '../net/session.js';
import type { RosterEntry, ChatLine, ChallengePeer } from '../net/hub.js';

// worker -> primary
export type W2P =
  | { t: 'queue'; sid: number; cid: string; name: string; fp: string | null; cursor: number; elo: number }
  | { t: 'dequeue'; sid: number }
  | { t: 'input'; mid: string; sid: number; input: Inputs; seq: number }
  | { t: 'leaveMatch'; mid: string; sid: number }
  | { t: 'loungeJoin'; sid: number; cid: string; name: string; fp: string | null; cursor: number; elo: number }
  | { t: 'loungeLeave'; sid: number }
  | { t: 'chat'; sid: number; text: string }
  | { t: 'challenge'; sid: number; targetId: string }
  | { t: 'respondChallenge'; sid: number; accept: boolean }
  | { t: 'cancelChallenge'; sid: number };

// primary -> worker (worker routes to a local session by `sid`)
export type P2W =
  | { t: 'matchStart'; sid: number; mid: string; role: 'a' | 'b'; yourCursor: number; oppName: string; oppCursor: number; stage: string }
  | { t: 'state'; sid: number; mid: string; m: Match; ack: number } // ack = last input seq the primary applied for this player
  | { t: 'matchEnd'; sid: number; mid: string; result: MatchResult }
  | { t: 'lounge'; sid: number; roster: RosterEntry[]; chat: ChatLine[] }
  | { t: 'notice'; sid: number; notice: string }
  | { t: 'challengeState'; sid: number; incoming: ChallengePeer | null; outgoing: ChallengePeer | null };

export function clearEdges(i: Inputs): void { i.jump = false; i.punch = false; i.kick = false; }

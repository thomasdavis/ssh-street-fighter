// The Hub is the single seam for EVERY interaction that spans sessions —
// matchmaking, the lounge roster, chat, and challenges. A Session never touches
// another Session (or a global queue) directly; it calls the Hub, and reads back
// plain-data caches the Hub fills in (loungeRoster / loungeChat / incoming /
// outgoing / loungeNotice). Because those are plain data (ids + names, never
// Session references), the exact same Session and screen code works whether the
// peer is in this process or on another worker.
//
// There are two implementations behind this one interface:
//   • LocalHub   — single process: operates on local sessions directly.
//   • ClusterHub — a cluster worker: forwards to the primary coordinator and
//                  applies the updates it pushes back.
//
// >>> To add a new cross-session feature, add a method here and implement it in
//     BOTH hubs (+ the primary coordinator for the cluster path). TypeScript
//     won't let a hub compile without it, so a feature can't silently work in
//     single-process while breaking across workers. <<<
import type { Session } from './session.js';
import { LocalHub } from './local-hub.js';
import { ClusterHub } from '../cluster/cluster-hub.js';

export interface RosterEntry { id: string; name: string; cursor: number; elo: number | null; }
export interface ChatLine { username: string; message: string; }
export interface ChallengePeer { id: string; name: string; }

export interface Hub {
  register(s: Session): void;
  unregister(s: Session): void;

  // quick match
  queue(s: Session): void;
  cancelQueue(s: Session): void;

  // in-fight relay (cluster only — the primary simulates the match; local sims
  // in-process so these are no-ops there)
  relayInput(s: Session): void;
  leaveMatch(s: Session): void;

  // lounge
  enterLounge(s: Session): void;
  leaveLounge(s: Session): void;
  sendChat(s: Session, text: string): void;
  challenge(s: Session, targetId: string): void;
  acceptChallenge(s: Session): void;
  declineChallenge(s: Session): void;
  cancelChallenge(s: Session): void;
}

let instance: Hub | null = null;
/** The process-wide hub (created once). Cluster worker → ClusterHub, else LocalHub. */
export function hub(): Hub {
  if (!instance) {
    const clustered = (parseInt(process.env.SF_WORKERS ?? '1', 10) || 1) > 1 && typeof process.send === 'function';
    instance = clustered ? new ClusterHub() : new LocalHub();
  }
  return instance;
}

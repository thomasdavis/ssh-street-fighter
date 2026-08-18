// Runs in each cluster WORKER. Forwards a session's matchmaking actions and
// fight inputs up to the primary, and routes the primary's match messages back
// down to the right local session (by its worker-local sid).
import type { Session } from '../net/session.js';
import type { Inputs } from '../game/types.js';
import type { P2W, W2P } from './messages.js';

export class WorkerLink {
  private sessions = new Map<number, Session>();

  constructor() {
    process.on('message', (m: P2W) => {
      if (!m || typeof m !== 'object' || !('t' in m)) return;
      const s = this.sessions.get(m.sid);
      if (!s) return;
      if (m.t === 'matchStart') s.startRemoteVersus(m.mid, m.role, m.yourCursor, m.oppName, m.oppCursor, m.stage);
      else if (m.t === 'state') s.applyRemoteState(m.mid, m.m);
      else if (m.t === 'matchEnd') s.endRemoteVersus(m.mid, m.result);
    });
  }

  register(s: Session): void { this.sessions.set(s.sid, s); }
  unregister(s: Session): void { this.sessions.delete(s.sid); }

  private send(msg: W2P): void { try { process.send?.(msg); } catch { /* primary gone */ } }
  queue(s: Session): void { this.send({ t: 'queue', sid: s.sid, cid: s.connectionId, name: s.displayName, fp: s.fp, cursor: s.cursor, elo: s.player?.elo ?? 1200 }); }
  dequeue(s: Session): void { this.send({ t: 'dequeue', sid: s.sid }); }
  input(mid: string, sid: number, input: Inputs): void { this.send({ t: 'input', mid, sid, input }); }
  leaveMatch(mid: string, sid: number): void { this.send({ t: 'leaveMatch', mid, sid }); }
}

/** A link only exists in a cluster worker (SF_WORKERS>1 and an IPC channel). */
export function makeWorkerLink(): WorkerLink | null {
  const workers = parseInt(process.env.SF_WORKERS ?? '1', 10) || 1;
  if (workers <= 1 || typeof process.send !== 'function') return null;
  return new WorkerLink();
}

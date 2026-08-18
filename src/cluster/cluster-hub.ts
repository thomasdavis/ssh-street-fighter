// Cluster worker hub: forwards every cross-session action to the primary
// coordinator and applies the updates it pushes back to the right local session
// (routed by worker-local sid). This is the only place a worker talks to the
// primary, so all cross-worker behaviour funnels through here.
import type { Session } from '../net/session.js';
import type { Hub } from '../net/hub.js';
import type { P2W, W2P } from './messages.js';

export class ClusterHub implements Hub {
  private sessions = new Map<number, Session>();

  constructor() {
    process.on('message', (m: P2W) => {
      if (!m || typeof m !== 'object' || !('t' in m)) return;
      const s = this.sessions.get(m.sid); if (!s) return;
      switch (m.t) {
        case 'matchStart': s.startRemoteVersus(m.mid, m.role, m.yourCursor, m.oppName, m.oppCursor, m.stage); break;
        case 'state': s.applyRemoteState(m.mid, m.m); break;
        case 'matchEnd': s.endRemoteVersus(m.mid, m.result); break;
        case 'lounge': s.loungeRoster = m.roster; s.loungeChat = m.chat; s.prevFrame = null; break;
        case 'notice': s.loungeNotice = m.notice; s.prevFrame = null; break;
        case 'challengeState': s.incoming = m.incoming; s.outgoing = m.outgoing; s.prevFrame = null; break;
      }
    });
  }

  private send(msg: W2P): void { try { process.send?.(msg); } catch { /* primary gone */ } }

  register(s: Session): void { this.sessions.set(s.sid, s); }
  unregister(s: Session): void { this.sessions.delete(s.sid); }

  queue(s: Session): void { this.send({ t: 'queue', sid: s.sid, cid: s.connectionId, name: s.displayName, fp: s.fp, cursor: s.cursor, elo: s.player?.elo ?? 1200 }); s.goTo('lobbyWait'); }
  cancelQueue(s: Session): void { this.send({ t: 'dequeue', sid: s.sid }); }

  relayInput(s: Session): void { this.send({ t: 'input', mid: s.remoteMid, sid: s.sid, input: s.fightInput.snapshot() }); }
  leaveMatch(s: Session): void { this.send({ t: 'leaveMatch', mid: s.remoteMid, sid: s.sid }); }

  enterLounge(s: Session): void { this.send({ t: 'loungeJoin', sid: s.sid, cid: s.connectionId, name: s.displayName, fp: s.fp, cursor: s.cursor, elo: s.player?.elo ?? 1200 }); }
  leaveLounge(s: Session): void { this.send({ t: 'loungeLeave', sid: s.sid }); }
  sendChat(s: Session, text: string): void { this.send({ t: 'chat', sid: s.sid, text }); }
  challenge(s: Session, targetId: string): void { this.send({ t: 'challenge', sid: s.sid, targetId }); }
  acceptChallenge(s: Session): void { this.send({ t: 'respondChallenge', sid: s.sid, accept: true }); }
  declineChallenge(s: Session): void { this.send({ t: 'respondChallenge', sid: s.sid, accept: false }); }
  cancelChallenge(s: Session): void { this.send({ t: 'cancelChallenge', sid: s.sid }); }
}

// Runs in the cluster PRIMARY. Holds the one global matchmaking queue and every
// active versus match. It steps each match's simulation at TICK_HZ, relays the
// state to both players' workers a few times a second, applies inputs streamed
// up from the workers, and records results to the DB. Workers just render what
// they're sent and forward their player's input. Players are keyed globally by
// "workerId:sid" (sids are only unique within a worker).
//
// The logic lives in MatchCoordinator (decoupled from the cluster module so it
// can be unit-tested with fake workers); runCoordinator() wires it to cluster.
import cluster from 'cluster';
import { makeFighter, makeMatch, stepMatch, TICK_HZ } from '../game/engine.js';
import { emptyInputs, type Inputs, type Match } from '../game/types.js';
import { characterAt } from '../game/roster.js';
import * as db from '../db/db.js';
import { clearEdges, type P2W, type W2P } from './messages.js';
import type { MatchResult } from '../net/session.js';

const RELAY_HZ = 12;

/** Minimal shape of a cluster worker the coordinator needs (real Worker fits). */
export interface WorkerRef { id: number; send: (msg: P2W) => void; }

interface Player { worker: WorkerRef; sid: number; gid: string; name: string; fp: string | null; cursor: number; elo: number; }
interface ActiveMatch { mid: string; a: Player; b: Player; match: Match; pendA: Inputs; pendB: Inputs; relayAccum: number; }

const gidOf = (workerId: number, sid: number) => `${workerId}:${sid}`;

export class MatchCoordinator {
  private seq = 0;
  private players = new Map<string, Player>();
  private matches = new Map<string, ActiveMatch>();
  private gidToMid = new Map<string, string>();
  private waiting: Player | null = null;

  private send(p: Player, msg: P2W): void { try { p.worker.send(msg); } catch { /* worker gone */ } }

  handle(worker: WorkerRef, m: W2P): void {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'queue') this.onQueue(worker, m);
    else if (m.t === 'dequeue') this.onDequeue(gidOf(worker.id, m.sid));
    else if (m.t === 'input') this.onInput(worker, m);
    else if (m.t === 'leaveMatch') this.forfeit(gidOf(worker.id, m.sid));
  }

  handleExit(workerId: number): void {
    if (this.waiting && this.waiting.worker.id === workerId) this.waiting = null;
    for (const p of [...this.players.values()]) if (p.worker.id === workerId) {
      if (this.gidToMid.has(p.gid)) this.forfeit(p.gid); else this.players.delete(p.gid);
    }
  }

  private onQueue(worker: WorkerRef, m: Extract<W2P, { t: 'queue' }>): void {
    const gid = gidOf(worker.id, m.sid);
    const p: Player = { worker, sid: m.sid, gid, name: m.name, fp: m.fp, cursor: m.cursor, elo: m.elo };
    this.players.set(gid, p);
    if (this.waiting && this.waiting.gid !== gid) { const a = this.waiting; this.waiting = null; this.pair(a, p); }
    else this.waiting = p;
  }

  private onDequeue(gid: string): void {
    if (this.waiting && this.waiting.gid === gid) this.waiting = null;
    if (!this.gidToMid.has(gid)) this.players.delete(gid);
  }

  private pair(a: Player, b: Player): void {
    const ca = characterAt(a.cursor), cb = characterAt(b.cursor);
    const match = makeMatch(makeFighter('a', ca.name, 'a', ca.palette), makeFighter('b', cb.name, 'b', cb.palette));
    const mid = `m${++this.seq}`;
    this.matches.set(mid, { mid, a, b, match, pendA: emptyInputs(), pendB: emptyInputs(), relayAccum: 0 });
    this.gidToMid.set(a.gid, mid); this.gidToMid.set(b.gid, mid);
    this.send(a, { t: 'matchStart', sid: a.sid, mid, role: 'a', yourCursor: a.cursor, oppName: cb.name, oppCursor: b.cursor, stage: match.stage });
    this.send(b, { t: 'matchStart', sid: b.sid, mid, role: 'b', yourCursor: b.cursor, oppName: ca.name, oppCursor: a.cursor, stage: match.stage });
  }

  private sideOf(am: ActiveMatch, gid: string): 'a' | 'b' | null {
    return am.a.gid === gid ? 'a' : am.b.gid === gid ? 'b' : null;
  }

  private onInput(worker: WorkerRef, m: Extract<W2P, { t: 'input' }>): void {
    const am = this.matches.get(m.mid); if (!am) return;
    const side = this.sideOf(am, gidOf(worker.id, m.sid)); if (!side) return;
    const dst = side === 'a' ? am.pendA : am.pendB;
    dst.moveX = m.input.moveX; dst.down = m.input.down; dst.motion = m.input.motion || dst.motion;
    dst.jump ||= m.input.jump; dst.punch ||= m.input.punch; dst.kick ||= m.input.kick;
  }

  /** Advance every match one simulation tick; call at TICK_HZ. */
  tick(): void {
    for (const am of this.matches.values()) {
      stepMatch(am.match, am.pendA, am.pendB);
      clearEdges(am.pendA); clearEdges(am.pendB);
      am.relayAccum += RELAY_HZ;
      if (am.relayAccum >= TICK_HZ) {
        am.relayAccum -= TICK_HZ;
        this.send(am.a, { t: 'state', sid: am.a.sid, mid: am.mid, m: am.match });
        this.send(am.b, { t: 'state', sid: am.b.sid, mid: am.mid, m: am.match });
      }
      if (am.match.phase === 'match-over' && am.match.phaseTimer <= 0) this.finish(am);
    }
  }

  private finish(am: ActiveMatch): void {
    const m = am.match;
    const aWon = m.a.wins > m.b.wins;
    const winP = aWon ? am.a : am.b, loseP = aWon ? am.b : am.a;
    const winF = aWon ? m.a : m.b, loseF = aWon ? m.b : m.a;
    const rating = db.recordMatch(winP.fp, loseP.fp, winP.name, loseP.name, winF.name, loseF.name, winF.wins);
    const result = (won: boolean): MatchResult => ({
      winner: winP.name, loser: loseP.name, youWon: won, winnerChar: winF.name,
      rating: rating ? (won
        ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta }
        : { before: rating.loserBefore, after: rating.loserAfter, delta: -rating.delta }) : undefined,
    });
    this.send(winP, { t: 'matchEnd', sid: winP.sid, mid: am.mid, result: result(true) });
    this.send(loseP, { t: 'matchEnd', sid: loseP.sid, mid: am.mid, result: result(false) });
    this.cleanup(am);
  }

  private forfeit(leaverGid: string): void {
    const mid = this.gidToMid.get(leaverGid); if (!mid) return;
    const am = this.matches.get(mid); if (!am) { this.gidToMid.delete(leaverGid); return; }
    const leaver = am.a.gid === leaverGid ? am.a : am.b;
    const other = am.a.gid === leaverGid ? am.b : am.a;
    const otherF = am.a.gid === leaverGid ? am.match.b : am.match.a;
    const rating = db.recordMatch(other.fp, leaver.fp, other.name, leaver.name, 'n/a', 'n/a', 2);
    this.send(other, {
      t: 'matchEnd', sid: other.sid, mid,
      result: { winner: other.name, loser: leaver.name, youWon: true, winnerChar: otherF.name,
        rating: rating ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta } : undefined },
    });
    this.cleanup(am);
  }

  private cleanup(am: ActiveMatch): void {
    this.matches.delete(am.mid);
    this.gidToMid.delete(am.a.gid); this.gidToMid.delete(am.b.gid);
    this.players.delete(am.a.gid); this.players.delete(am.b.gid);
  }

  // introspection for tests
  get activeMatches(): number { return this.matches.size; }
  get queued(): number { return this.waiting ? 1 : 0; }
}

/** Wire a MatchCoordinator to the live cluster (primary only). */
export function runCoordinator(): void {
  const coord = new MatchCoordinator();
  const attach = (w: import('cluster').Worker): void => {
    w.on('message', (m: W2P) => coord.handle(w, m));
    w.on('exit', () => coord.handleExit(w.id));
  };
  for (const id in cluster.workers) attach(cluster.workers[id]!);
  cluster.on('fork', attach);
  setInterval(() => coord.tick(), Math.round(1000 / TICK_HZ));
}

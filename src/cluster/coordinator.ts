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
import { randomInt } from 'crypto';
import { makeFighter, makeMatch, stepMatch, TICK_HZ } from '../game/engine.js';
import { emptyInputs, type Inputs, type Match } from '../game/types.js';
import { characterAt } from '../game/roster.js';
import * as db from '../db/db.js';
import { MatchRecorder, ENGINE_VERSION } from '../telemetry/recorder.js';
import { liveRender } from '../telemetry/replay-sim.js';
import { startOpsSampler } from '../telemetry/ops.js';
import { clearEdges, type P2W, type W2P } from './messages.js';
import type { MatchResult } from '../net/session.js';
import type { RosterEntry, ChatLine, ChallengePeer } from '../net/hub.js';
import { sameRegionWaiter, agedPair } from '../net/matchmaking.js';

// How often the primary ships match state to the workers. Relaying every sim
// tick (30Hz) minimises how stale the opponent's state is when a worker renders;
// SF_RELAY_HZ can lower it to trade freshness for primary IPC under extreme load.
const RELAY_HZ = Math.min(TICK_HZ, Math.max(1, parseInt(process.env.SF_RELAY_HZ ?? '30', 10) || 30));

/** Minimal shape of a cluster worker the coordinator needs (real Worker fits). */
export interface WorkerRef { id: number; send: (msg: P2W) => void; }

/** Exact coordinator coalescing semantics for inputs received before a tick. */
export function mergeCoordinatorInput(destination: Inputs, incoming: Inputs): void {
  destination.moveX = incoming.moveX;
  destination.down = incoming.down;
  destination.motion = incoming.motion || destination.motion;
  destination.jump ||= incoming.jump;
  destination.punch ||= incoming.punch;
  destination.kick ||= incoming.kick;
  destination.throw ||= incoming.throw;
}

interface Player { worker: WorkerRef; sid: number; gid: string; name: string; fp: string | null; cursor: number; elo: number; region: string; queuedAt: number; isBot: boolean; }
interface LoungeMember extends Player { cid: string; incoming: string | null; outgoing: string | null; } // incoming/outgoing = peer gid
interface ActiveMatch { mid: string; a: Player; b: Player; match: Match; pendA: Inputs; pendB: Inputs; relayAccum: number; ackA: number; ackB: number; rec: MatchRecorder | null; }

const gidOf = (workerId: number, sid: number) => `${workerId}:${sid}`;

export class MatchCoordinator {
  private seq = 0;
  private players = new Map<string, Player>();
  private matches = new Map<string, ActiveMatch>();
  private gidToMid = new Map<string, string>();
  private waiting: Player[] = [];
  private lounge = new Map<string, LoungeMember>();   // gid -> member
  private cidToGid = new Map<string, string>();        // connectionId -> gid (lounge)

  private send(p: Player, msg: P2W): void { try { p.worker.send(msg); } catch { /* worker gone */ } }

  handle(worker: WorkerRef, m: W2P): void {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'queue': return this.onQueue(worker, m);
      case 'dequeue': return this.onDequeue(gidOf(worker.id, m.sid));
      case 'input': return this.onInput(worker, m);
      case 'leaveMatch': return void this.forfeit(gidOf(worker.id, m.sid));
      case 'loungeJoin': return this.onLoungeJoin(worker, m);
      case 'loungeLeave': return this.onLoungeLeave(gidOf(worker.id, m.sid));
      case 'chat': return this.onChat(gidOf(worker.id, m.sid), m.text);
      case 'challenge': return this.onChallenge(gidOf(worker.id, m.sid), m.targetId);
      case 'respondChallenge': return this.onRespond(gidOf(worker.id, m.sid), m.accept);
      case 'cancelChallenge': return this.onCancelChallenge(gidOf(worker.id, m.sid));
    }
  }

  handleExit(workerId: number): void {
    this.waiting = this.waiting.filter((w) => w.worker.id !== workerId);
    for (const p of [...this.players.values()]) if (p.worker.id === workerId) {
      if (this.gidToMid.has(p.gid)) this.forfeit(p.gid); else this.players.delete(p.gid);
    }
    for (const mem of [...this.lounge.values()]) if (mem.worker.id === workerId) this.onLoungeLeave(mem.gid);
  }

  private onQueue(worker: WorkerRef, m: Extract<W2P, { t: 'queue' }>): void {
    const gid = gidOf(worker.id, m.sid);
    // Idempotent: ignore a duplicate queue for a player already waiting or already
    // in a match. Without this, a re-queued player's own entry is a valid "waiter"
    // and they get paired with themselves.
    if (this.gidToMid.has(gid) || this.waiting.some((w) => w.gid === gid)) return;
    const p: Player = { worker, sid: m.sid, gid, name: m.name, fp: m.fp, cursor: m.cursor, elo: m.elo, region: m.region, queuedAt: Date.now(), isBot: !!m.isBot };
    this.players.set(gid, p);
    const idx = sameRegionWaiter(this.waiting, p.region);   // prefer a same-region opponent
    if (idx >= 0) this.pair(this.waiting.splice(idx, 1)[0]!, p);
    else this.waiting.push(p);
  }

  private onDequeue(gid: string): void {
    const i = this.waiting.findIndex((w) => w.gid === gid);
    if (i >= 0) this.waiting.splice(i, 1);
    if (!this.gidToMid.has(gid)) this.players.delete(gid);
  }

  private pair(a: Player, b: Player): void {
    if (a.gid === b.gid) { this.waiting.push(a); return; }   // never pair a player with themselves
    const ca = characterAt(a.cursor), cb = characterAt(b.cursor);
    const match = makeMatch(makeFighter('a', ca.name, 'a', ca.palette), makeFighter('b', cb.name, 'b', cb.palette));
    const mid = `m${Date.now().toString(36)}${++this.seq}`;
    // Capture the whole match (replay log + box score). Never lets recording break play.
    let rec: MatchRecorder | null = null;
    try {
      rec = new MatchRecorder(mid, {
        mode: 'versus', stage: match.stage, seed: randomInt(2 ** 31), region: a.region, engineVersion: ENGINE_VERSION,
        sides: { a: { fp: a.fp, name: a.name, char: ca.name, isBot: a.isBot }, b: { fp: b.fp, name: b.name, char: cb.name, isBot: b.isBot } },
      });
    } catch { rec = null; }
    this.matches.set(mid, { mid, a, b, match, pendA: emptyInputs(), pendB: emptyInputs(), relayAccum: 0, ackA: 0, ackB: 0, rec });
    this.gidToMid.set(a.gid, mid); this.gidToMid.set(b.gid, mid);
    this.send(a, { t: 'matchStart', sid: a.sid, mid, role: 'a', yourCursor: a.cursor, oppName: b.name, oppCursor: b.cursor, stage: match.stage });
    this.send(b, { t: 'matchStart', sid: b.sid, mid, role: 'b', yourCursor: b.cursor, oppName: a.name, oppCursor: a.cursor, stage: match.stage });
  }

  private sideOf(am: ActiveMatch, gid: string): 'a' | 'b' | null {
    return am.a.gid === gid ? 'a' : am.b.gid === gid ? 'b' : null;
  }

  private onInput(worker: WorkerRef, m: Extract<W2P, { t: 'input' }>): void {
    const am = this.matches.get(m.mid); if (!am) return;
    const side = this.sideOf(am, gidOf(worker.id, m.sid)); if (!side) return;
    const dst = side === 'a' ? am.pendA : am.pendB;
    mergeCoordinatorInput(dst, m.input);
    if (side === 'a') am.ackA = m.seq; else am.ackB = m.seq; // for client-side prediction reconciliation
  }

  /** Advance every match one simulation tick; call at TICK_HZ. */
  tick(): void {
    // Fallback matchmaking sweep: pair the oldest waiters across regions once
    // they've waited past the timeout (so lopsided populations still match).
    const aged = agedPair(this.waiting, Date.now());
    if (aged) { const [i, j] = aged; const [lo, hi] = i < j ? [i, j] : [j, i]; const b = this.waiting.splice(hi, 1)[0]!; const a = this.waiting.splice(lo, 1)[0]!; this.pair(a, b); }
    for (const am of this.matches.values()) {
      stepMatch(am.match, am.pendA, am.pendB);
      am.rec?.frame(am.match, am.pendA, am.pendB);   // record BEFORE edges are cleared
      clearEdges(am.pendA); clearEdges(am.pendB);
      am.relayAccum += RELAY_HZ;
      if (am.relayAccum >= TICK_HZ) {
        am.relayAccum -= TICK_HZ;
        this.send(am.a, { t: 'state', sid: am.a.sid, mid: am.mid, m: am.match, ack: am.ackA });
        this.send(am.b, { t: 'state', sid: am.b.sid, mid: am.mid, m: am.match, ack: am.ackB });
      }
      if (am.match.phase === 'match-over' && am.match.phaseTimer <= 0) this.finish(am);
    }
  }

  private finish(am: ActiveMatch): void {
    if (!this.detach(am)) return;
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
    const elo = rating ? {
      aBefore: aWon ? rating.winnerBefore : rating.loserBefore, aAfter: aWon ? rating.winnerAfter : rating.loserAfter,
      bBefore: aWon ? rating.loserBefore : rating.winnerBefore, bAfter: aWon ? rating.loserAfter : rating.winnerAfter,
    } : undefined;
    am.rec?.finish(m, { winner: aWon ? 'a' : 'b', elo });
    this.send(winP, { t: 'matchEnd', sid: winP.sid, mid: am.mid, result: result(true) });
    this.send(loseP, { t: 'matchEnd', sid: loseP.sid, mid: am.mid, result: result(false) });
  }

  private forfeit(leaverGid: string): void {
    const mid = this.gidToMid.get(leaverGid); if (!mid) return;
    const am = this.matches.get(mid); if (!am) { this.gidToMid.delete(leaverGid); return; }
    if (!this.detach(am)) return;
    const leaverIsA = am.a.gid === leaverGid;
    const leaver = leaverIsA ? am.a : am.b;
    const other = leaverIsA ? am.b : am.a;
    const otherF = leaverIsA ? am.match.b : am.match.a;
    const rating = db.recordMatch(other.fp, leaver.fp, other.name, leaver.name, 'n/a', 'n/a', 2);
    const winnerSide = leaverIsA ? 'b' : 'a';
    const elo = rating ? {
      aBefore: leaverIsA ? rating.loserBefore : rating.winnerBefore, aAfter: leaverIsA ? rating.loserAfter : rating.winnerAfter,
      bBefore: leaverIsA ? rating.winnerBefore : rating.loserBefore, bAfter: leaverIsA ? rating.winnerAfter : rating.loserAfter,
    } : undefined;
    am.rec?.finish(am.match, { winner: winnerSide, endReason: 'forfeit', elo });
    this.send(other, {
      t: 'matchEnd', sid: other.sid, mid,
      result: { winner: other.name, loser: leaver.name, youWon: true, winnerChar: otherF.name,
        rating: rating ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta } : undefined },
    });
  }

  private detach(am: ActiveMatch): boolean {
    if (this.matches.get(am.mid) !== am) return false;
    this.matches.delete(am.mid);
    this.gidToMid.delete(am.a.gid); this.gidToMid.delete(am.b.gid);
    this.players.delete(am.a.gid); this.players.delete(am.b.gid);
    return true;
  }

  // ---- lounge (global presence + chat + challenges) ----
  private roster(excludeGid: string): RosterEntry[] {
    return [...this.lounge.values()].filter((m) => m.gid !== excludeGid)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ id: m.cid, name: m.name, cursor: m.cursor, elo: m.elo }));
  }
  private chatLines(): ChatLine[] { return db.chatHistory(100).map((m) => ({ username: m.username, message: m.message })); }
  private broadcastLounge(): void {
    const chat = this.chatLines();
    for (const m of this.lounge.values()) m.worker.send({ t: 'lounge', sid: m.sid, roster: this.roster(m.gid), chat });
  }
  private notice(m: LoungeMember, text: string): void { m.worker.send({ t: 'notice', sid: m.sid, notice: text }); }
  private peer(gid: string | null): ChallengePeer | null { const p = gid ? this.lounge.get(gid) : null; return p ? { id: p.cid, name: p.name } : null; }
  private pushChallenge(m: LoungeMember): void { m.worker.send({ t: 'challengeState', sid: m.sid, incoming: this.peer(m.incoming), outgoing: this.peer(m.outgoing) }); }

  private onLoungeJoin(worker: WorkerRef, m: Extract<W2P, { t: 'loungeJoin' }>): void {
    const gid = gidOf(worker.id, m.sid);
    const mem: LoungeMember = { worker, sid: m.sid, gid, cid: m.cid, name: m.name, fp: m.fp, cursor: m.cursor, elo: m.elo, region: 'XX', queuedAt: 0, isBot: false, incoming: null, outgoing: null };
    this.lounge.set(gid, mem); this.cidToGid.set(m.cid, gid);
    this.notice(mem, 'TAB SWITCHES BETWEEN CHAT AND PLAYERS');
    this.broadcastLounge();
  }
  private onLoungeLeave(gid: string): void {
    const mem = this.lounge.get(gid); if (!mem) return;
    this.clearChallengeOf(mem);
    this.lounge.delete(gid); this.cidToGid.delete(mem.cid);
    this.broadcastLounge();
  }
  private onChat(gid: string, text: string): void {
    const mem = this.lounge.get(gid); if (!mem) return;
    db.addChatMessage(mem.name, text);
    this.notice(mem, 'MESSAGE SENT');
    this.broadcastLounge();
  }
  private onChallenge(gid: string, targetCid: string): void {
    const from = this.lounge.get(gid); if (!from) return;
    const to = this.lounge.get(this.cidToGid.get(targetCid) ?? '');
    if (!to) { this.notice(from, 'PLAYER IS NO LONGER AVAILABLE'); return; }
    if (from.incoming || from.outgoing) { this.notice(from, 'FINISH YOUR CURRENT CHALLENGE FIRST'); return; }
    if (to.incoming || to.outgoing) { this.notice(from, `${to.name} IS ALREADY BUSY`); return; }
    from.outgoing = to.gid; to.incoming = from.gid;
    this.notice(from, `CHALLENGE SENT TO ${to.name}`); this.notice(to, `${from.name} CHALLENGED YOU`);
    this.pushChallenge(from); this.pushChallenge(to);
  }
  private onRespond(gid: string, accept: boolean): void {
    const to = this.lounge.get(gid); if (!to || !to.incoming) return;
    const from = this.lounge.get(to.incoming);
    to.incoming = null; if (from) from.outgoing = null;
    if (accept && from) {
      this.lounge.delete(from.gid); this.cidToGid.delete(from.cid);
      this.lounge.delete(to.gid); this.cidToGid.delete(to.cid);
      this.pair(from, to);           // both leave the lounge into a versus match
      this.broadcastLounge();
    } else {
      if (from) { this.notice(from, `${to.name} DECLINED YOUR CHALLENGE`); this.pushChallenge(from); }
      this.notice(to, from ? `DECLINED ${from.name}` : 'CHALLENGE EXPIRED');
      this.pushChallenge(to);
    }
  }
  private onCancelChallenge(gid: string): void {
    const from = this.lounge.get(gid); if (!from) return;
    if (!from.outgoing) { this.notice(from, 'NO OUTGOING CHALLENGE'); return; }
    const to = this.lounge.get(from.outgoing); from.outgoing = null;
    if (to && to.incoming === from.gid) { to.incoming = null; this.notice(to, `${from.name} CANCELLED THE CHALLENGE`); this.pushChallenge(to); }
    this.notice(from, to ? `CANCELLED CHALLENGE TO ${to.name}` : 'CANCELLED');
    this.pushChallenge(from);
  }
  private clearChallengeOf(mem: LoungeMember): void {
    if (mem.incoming) { const f = this.lounge.get(mem.incoming); if (f && f.outgoing === mem.gid) { f.outgoing = null; this.notice(f, `${mem.name} LEFT THE LOUNGE`); this.pushChallenge(f); } }
    if (mem.outgoing) { const t = this.lounge.get(mem.outgoing); if (t && t.incoming === mem.gid) { t.incoming = null; this.notice(t, `${mem.name} CANCELLED THE CHALLENGE`); this.pushChallenge(t); } }
    mem.incoming = null; mem.outgoing = null;
  }

  // introspection for tests
  get activeMatches(): number { return this.matches.size; }
  get queued(): number { return this.waiting.length; }
  get loungeSize(): number { return this.lounge.size; }
  get playerCount(): number { return this.players.size; }

  /** Lightweight snapshot of every live versus match for the Ringside API. */
  liveMatchList(): Array<{ mid: string; stage: string; round: number; phase: string; a: { name: string; char: string; hp: number; wins: number; bot: boolean }; b: { name: string; char: string; hp: number; wins: number; bot: boolean } }> {
    return [...this.matches.values()].map((am) => ({
      mid: am.mid, stage: am.match.stage, round: am.match.round, phase: am.match.phase,
      a: { name: am.a.name, char: am.match.a.name, hp: am.match.a.hp, wins: am.match.a.wins, bot: am.a.isBot },
      b: { name: am.b.name, char: am.match.b.name, hp: am.match.b.hp, wins: am.match.b.wins, bot: am.b.isBot },
    }));
  }

  /** Full per-frame render payload for one live match (web spectator), or null. */
  renderMatch(mid: string): object | null {
    const am = this.matches.get(mid);
    return am ? liveRender(am.match, am.a.name, am.b.name) : null;
  }
}

/** Wire a MatchCoordinator to the live cluster (primary only). Returns it so the
 *  primary can also expose it to the Ringside API (read) and bot server (play). */
export function runCoordinator(): MatchCoordinator {
  const coord = new MatchCoordinator();
  // Attach EXACTLY ONCE per worker. The workers are forked before this runs, so
  // they're already in cluster.workers AND their deferred 'fork' events still
  // fire after we register the listener below — without this guard every worker
  // gets its 'message' handler attached twice, doubling every W2P message (which
  // makes a queuing player pair with themselves, corrupts input, etc.).
  const attached = new Set<number>();
  const attach = (w: import('cluster').Worker): void => {
    if (attached.has(w.id)) return;
    attached.add(w.id);
    w.on('message', (m: W2P) => coord.handle(w, m));
    w.on('exit', () => { attached.delete(w.id); coord.handleExit(w.id); });
  };
  for (const id in cluster.workers) attach(cluster.workers[id]!);
  cluster.on('fork', attach);
  setInterval(() => coord.tick(), Math.round(1000 / TICK_HZ));
  // Primary observability: matchmaking + match load, plus hourly retention prune.
  startOpsSampler(0, () => ({ matches: coord.activeMatches, queued: coord.queued, lounge: coord.loungeSize, players: coord.playerCount }), true);
  return coord;
}

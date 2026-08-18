// Single-process hub: pairs quick-match, runs the lounge, and routes challenges
// entirely in memory. Populates each session's plain-data caches (loungeRoster /
// loungeChat / incoming / outgoing) so the lounge screen never touches another
// Session object.
import type { Session } from './session.js';
import type { Hub, RosterEntry, ChatLine } from './hub.js';
import { MATCH_IDS } from './match-ids.js';
import { makeFighter, makeMatch } from '../game/engine.js';
import { characterAt } from '../game/roster.js';
import * as db from '../db/db.js';
import { actorRef, eventId, track } from '../telemetry/discord.js';
import { sameRegionWaiter, agedPair } from './matchmaking.js';

interface Waiting { s: Session; region: string; queuedAt: number; }

export class LocalHub implements Hub {
  private waiting: Waiting[] = [];
  private members = new Set<Session>();

  constructor() { setInterval(() => this.sweepQueue(), 2000); } // region-fallback sweep

  register(): void { /* nothing to do in-process */ }
  unregister(s: Session): void { this.cancelQueue(s); if (this.members.has(s) || s.incoming || s.outgoing) this.leaveLounge(s); }

  // ---- quick match (prefer same region, fall back across regions after a wait) ----
  queue(s: Session): void {
    const idx = sameRegionWaiter(this.waiting, s.region);
    const w = idx >= 0 ? this.waiting[idx] : undefined;
    if (w && w.s.alive && w.s !== s) { this.waiting.splice(idx, 1); this.pair(w.s, s, 'quick_match'); }
    else { this.waiting.push({ s, region: s.region, queuedAt: Date.now() }); s.goTo('lobbyWait'); }
  }
  cancelQueue(s: Session): void { const i = this.waiting.findIndex((w) => w.s === s); if (i >= 0) this.waiting.splice(i, 1); }
  private sweepQueue(): void {
    this.waiting = this.waiting.filter((w) => w.s.alive);
    const aged = agedPair(this.waiting, Date.now());
    if (!aged) return;
    const [i, j] = aged; const [lo, hi] = i < j ? [i, j] : [j, i];
    const b = this.waiting.splice(hi, 1)[0]!.s, a = this.waiting.splice(lo, 1)[0]!.s;
    if (a.alive && b.alive) this.pair(a, b, 'quick_match');
  }

  relayInput(): void { /* local sims in-process, nothing to relay or predict */ }
  leaveMatch(): void { /* local forfeit is handled by Session.leaveFight/close */ }

  private pair(a: Session, b: Session, source: 'quick_match' | 'direct_challenge'): void {
    const ca = characterAt(a.cursor), cb = characterAt(b.cursor);
    const match = makeMatch(makeFighter('a', ca.name, 'a', ca.palette), makeFighter('b', cb.name, 'b', cb.palette));
    const matchId = eventId('match'); MATCH_IDS.set(match, matchId);
    track('match_started', {
      match_id: matchId, source, stage: match.stage,
      player_a: a.displayName, actor_a: actorRef(a.fp, a.connectionId), fighter_a: ca.name, elo_a: a.player?.elo,
      player_b: b.displayName, actor_b: actorRef(b.fp, b.connectionId), fighter_b: cb.name, elo_b: b.player?.elo,
      rated: !!(a.fp && b.fp && a.fp !== b.fp),
    });
    a.startVersus(match, 'a', b, true);
    b.startVersus(match, 'b', a, false);
  }

  // ---- lounge ----
  enterLounge(s: Session): void { this.members.add(s); s.loungeNotice = 'TAB SWITCHES BETWEEN CHAT AND PLAYERS'; this.refresh(); }
  leaveLounge(s: Session): void { this.members.delete(s); this.clearChallengeOf(s); this.refresh(); }

  sendChat(s: Session, text: string): void { db.addChatMessage(s.displayName, text); s.loungeNotice = 'MESSAGE SENT'; this.refresh(); }

  challenge(s: Session, targetId: string): void {
    const to = this.find(targetId);
    if (!to || !to.alive || !this.members.has(to)) { s.loungeNotice = 'PLAYER IS NO LONGER AVAILABLE'; return; }
    if (s.incoming || s.outgoing) { s.loungeNotice = 'FINISH YOUR CURRENT CHALLENGE FIRST'; return; }
    if (to.incoming || to.outgoing) { s.loungeNotice = `${to.displayName} IS ALREADY BUSY`; return; }
    s.outgoing = { id: to.connectionId, name: to.displayName };
    to.incoming = { id: s.connectionId, name: s.displayName };
    s.loungeNotice = `CHALLENGE SENT TO ${to.displayName}`;
    to.loungeNotice = `${s.displayName} CHALLENGED YOU`;
    track('challenge_sent', { challenger: s.displayName, challenged: to.displayName });
    s.prevFrame = null; to.prevFrame = null;
  }
  acceptChallenge(s: Session): void {
    const from = s.incoming ? this.find(s.incoming.id) : null;
    if (!from || !from.alive || from.outgoing?.id !== s.connectionId) { s.incoming = null; s.loungeNotice = 'CHALLENGE EXPIRED'; return; }
    from.outgoing = null; s.incoming = null;
    this.members.delete(from); this.members.delete(s);
    track('challenge_accepted', { challenger: from.displayName, challenged: s.displayName });
    this.pair(from, s, 'direct_challenge');
    this.refresh();
  }
  declineChallenge(s: Session): void {
    const from = s.incoming ? this.find(s.incoming.id) : null;
    s.incoming = null;
    if (from) { if (from.outgoing?.id === s.connectionId) from.outgoing = null; from.loungeNotice = `${s.displayName} DECLINED YOUR CHALLENGE`; from.prevFrame = null; }
    s.loungeNotice = from ? `DECLINED ${from.displayName}` : 'NO CHALLENGE TO DECLINE';
    s.prevFrame = null;
  }
  cancelChallenge(s: Session): void {
    const to = s.outgoing ? this.find(s.outgoing.id) : null;
    s.outgoing = null;
    if (to) { if (to.incoming?.id === s.connectionId) to.incoming = null; to.loungeNotice = `${s.displayName} CANCELLED THE CHALLENGE`; to.prevFrame = null; }
    s.loungeNotice = to ? `CANCELLED CHALLENGE TO ${to.displayName}` : 'NO OUTGOING CHALLENGE';
    s.prevFrame = null;
  }

  // ---- helpers ----
  private find(id: string): Session | null { for (const m of this.members) if (m.connectionId === id) return m; return null; }
  private clearChallengeOf(s: Session): void {
    if (s.incoming) { const f = this.find(s.incoming.id); if (f?.outgoing?.id === s.connectionId) { f.outgoing = null; f.loungeNotice = `${s.displayName} LEFT THE LOUNGE`; } }
    if (s.outgoing) { const t = this.find(s.outgoing.id); if (t?.incoming?.id === s.connectionId) { t.incoming = null; t.loungeNotice = `${s.displayName} CANCELLED THE CHALLENGE`; } }
    s.incoming = null; s.outgoing = null;
  }
  private refresh(): void {
    const chat: ChatLine[] = db.chatHistory(100).map((m) => ({ username: m.username, message: m.message }));
    for (const m of this.members) {
      const roster: RosterEntry[] = [...this.members]
        .filter((x) => x !== m && x.alive)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((x) => ({ id: x.connectionId, name: x.displayName, cursor: x.cursor, elo: x.player?.elo ?? null }));
      m.loungeRoster = roster;
      m.loungeChat = chat;
      m.prevFrame = null;
    }
  }
}

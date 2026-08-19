// Records one live match into a replayable input log + keyframes and a diff-derived
// box score / event timeline. Fed one call per sim frame (after stepMatch); flushed
// to the Ringside store at match end. Never throws into the game loop.
import type { Match, Inputs, Fighter } from '../game/types.js';
import { captureMatch, captureEvents, captureReplay, type MatchRecord, type MatchEvent, type SideRec } from './store.js';

/** Bumped whenever a sim change would make older replays re-simulate differently.
 *  sf-2: TESTIMONY beam nerf. sf-3: throw mechanic (F) — close-range unblockable grab. */
export const ENGINE_VERSION = 'sf-3';

const SPECIALS = new Set(['hadouken', 'shoryuken', 'hurricane']);
const KEYFRAME_EVERY = 300;        // 10s at 30 Hz — seek points for the replayer
const COMBO_WINDOW = 24;           // frames within which consecutive hits chain
const MAX_REPLAY_FRAMES = 27000;   // ~15 min cap so an idle practice session can't bloat the BLOB

export interface SideMeta { fp: string | null; name: string; char: string; isBot: boolean; }
export interface RecorderMeta {
  mode: 'versus' | 'practice'; stage: string; seed: number; region: string | null; engineVersion: string;
  sides: { a: SideMeta; b: SideMeta };
}
interface Acc { dmgDealt: number; dmgTaken: number; hits: number; blocks: number; specials: number; maxCombo: number; combo: number; lastHitF: number; }
const acc = (): Acc => ({ dmgDealt: 0, dmgTaken: 0, hits: 0, blocks: 0, specials: 0, maxCombo: 0, combo: 0, lastHitF: -999 });

function pack(inp: Inputs, motions: Map<string, number>): [number, number] {
  let flags = (inp.moveX + 1) & 3;
  if (inp.jump) flags |= 1 << 2;
  if (inp.down) flags |= 1 << 3;
  if (inp.punch) flags |= 1 << 4;
  if (inp.kick) flags |= 1 << 5;
  if (inp.throw) flags |= 1 << 6;
  let mi = motions.get(inp.motion);
  if (mi === undefined) { mi = motions.size; motions.set(inp.motion, mi); }
  return [flags, Math.min(mi, 255)];
}

export class MatchRecorder {
  private f = 0;
  private bytes: number[] = [];
  private motions = new Map<string, number>([['', 0]]);
  private keyframes: object[] = [];
  private events: MatchEvent[] = [];
  private a = acc(); private b = acc();
  private prev = { aHp: 0, bHp: 0, aAtk: 'none', bAtk: 'none', aWins: 0, bWins: 0, seeded: false };

  constructor(public readonly id: string, private readonly meta: RecorderMeta) {}

  /** Call once per sim tick, right after stepMatch. */
  frame(m: Match, inA: Inputs, inB: Inputs): void {
    try {
      if (this.f < MAX_REPLAY_FRAMES) {
        const [af, am] = pack(inA, this.motions);
        const [bf, bm] = pack(inB, this.motions);
        this.bytes.push(af, am, bf, bm);
      }
      const p = this.prev;
      if (!p.seeded) { p.aHp = m.a.hp; p.bHp = m.b.hp; p.seeded = true; }

      this.side(m.a, m.b, this.a, this.b, 'a', p.aHp, p.bAtk);   // a's damage to b, a's specials
      this.side(m.b, m.a, this.b, this.a, 'b', p.bHp, p.aAtk);

      if (m.a.wins > p.aWins || m.b.wins > p.bWins) {
        const w = m.a.wins > p.aWins ? 'a' : 'b';
        this.events.push({ frame: this.f, type: 'round', data: { winner: w, aWins: m.a.wins, bWins: m.b.wins } });
      }
      if (this.f % KEYFRAME_EVERY === 0 && this.f < MAX_REPLAY_FRAMES) this.keyframes.push(this.snap(m));

      p.aHp = m.a.hp; p.bHp = m.b.hp; p.aAtk = m.a.attack; p.bAtk = m.b.attack; p.aWins = m.a.wins; p.bWins = m.b.wins;
      this.f++;
    } catch { /* recording must never break the match */ }
  }

  // Attacker `atk` vs defender `def`; `defPrevHp` is the defender's hp last frame.
  private side(atk: Fighter, def: Fighter, atkAcc: Acc, defAcc: Acc, who: 'a' | 'b', defPrevHp: number, _prevDefAtk: string): void {
    if (def.hp < defPrevHp) {
      const dmg = defPrevHp - def.hp;
      atkAcc.dmgDealt += dmg; defAcc.dmgTaken += dmg; atkAcc.hits++;
      atkAcc.combo = (this.f - atkAcc.lastHitF <= COMBO_WINDOW) ? atkAcc.combo + 1 : 1;
      atkAcc.lastHitF = this.f;
      if (atkAcc.combo > atkAcc.maxCombo) atkAcc.maxCombo = atkAcc.combo;
      this.events.push({ frame: this.f, type: 'hit', data: { by: who, dmg, combo: atkAcc.combo } });
      if (def.hp <= 0) this.events.push({ frame: this.f, type: 'ko', data: { by: who } });
    }
    // rising edge into a special = one special performed
    const wasSpecial = who === 'a' ? this.prev.aAtk : this.prev.bAtk;
    if (SPECIALS.has(atk.attack) && atk.attack !== wasSpecial) {
      atkAcc.specials++;
      this.events.push({ frame: this.f, type: 'special', data: { by: who, kind: atk.attack } });
    }
  }

  private snap(m: Match): object {
    const s = (f: Fighter) => ({ x: Math.round(f.x), y: Math.round(f.y), hp: f.hp, wins: f.wins, facing: f.facing });
    return { f: this.f, round: m.round, phase: m.phase, a: s(m.a), b: s(m.b) };
  }

  /** End the match: assemble the box score + replay and write it all. Best-effort.
   *  `opts.winner`/`opts.endReason` override the diff-derived result (used for
   *  forfeits, where round wins don't reflect who actually won). */
  finish(m: Match, opts?: { winner?: 'a' | 'b'; endReason?: string; elo?: { aBefore: number; aAfter: number; bBefore: number; bAfter: number } }): void {
    if (this.f < 30) return;   // <1s: never really started (early disconnect) — don't store noise
    try {
      const elo = opts?.elo;
      const winner: 'a' | 'b' | 'draw' = opts?.winner ?? (m.a.wins > m.b.wins ? 'a' : m.b.wins > m.a.wins ? 'b' : 'draw');
      const endReason = opts?.endReason ?? (Math.min(m.a.hp, m.b.hp) <= 0 ? 'ko' : 'time');
      const mk = (meta: SideMeta, self: Acc, wins: number, won: boolean, delta: number): SideRec => ({
        fp: meta.fp, name: meta.name, char: meta.char, isBot: meta.isBot, won, roundsWon: wins,
        damageDealt: Math.round(self.dmgDealt), damageTaken: Math.round(self.dmgTaken),
        hits: self.hits, blocks: self.blocks, specials: self.specials, maxCombo: self.maxCombo, eloDelta: delta,
      });
      const now = Date.now();
      const rec: MatchRecord = {
        id: this.id, mode: this.meta.mode, stage: this.meta.stage, seed: this.meta.seed,
        region: this.meta.region, engineVersion: this.meta.engineVersion,
        winner, endReason, durationFrames: this.f,
        aEloBefore: elo?.aBefore ?? null, aEloAfter: elo?.aAfter ?? null,
        bEloBefore: elo?.bBefore ?? null, bEloAfter: elo?.bAfter ?? null,
        startedAt: now - Math.round((this.f / 30) * 1000), endedAt: now,
        a: mk(this.meta.sides.a, this.a, m.a.wins, winner === 'a', elo ? elo.aAfter - elo.aBefore : 0),
        b: mk(this.meta.sides.b, this.b, m.b.wins, winner === 'b', elo ? elo.bAfter - elo.bBefore : 0),
      };
      captureMatch(rec);
      captureEvents(this.id, this.events);
      const header = { motions: [...this.motions.keys()], sides: this.meta.sides, stage: this.meta.stage, seed: this.meta.seed, format: 'flags8+motion8/side' };
      captureReplay(this.id, header, Buffer.from(this.bytes), this.keyframes, this.bytes.length / 4);
    } catch (e) { console.error('[ringside] recorder.finish failed:', (e as Error).message); }
  }
}

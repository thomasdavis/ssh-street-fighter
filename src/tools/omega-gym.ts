// OMEGA sparring gym — runs the REAL bot brain against the REAL engine, headless,
// over many best-of-3 matches vs a battery of opponent styles. Lets us measure
// OMEGA's win-rate per style and tune until it dominates every archetype (which
// is what "always win vs other bots" actually requires — you can't tune blind).
//
// Run:  npx tsx src/tools/omega-gym.ts [matchesPerStyle]
import { makeFighter, makeMatch, stepMatch, attackActive, specialMoveStats } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';
import type { Fighter, Inputs, Match } from '../game/types.js';
import type { SpecialAttack } from '../game/moves.js';
// The bot module is import-safe (only connects when run as main) and exports its brain.
// It lives outside the repo (deployed bot), so it carries no type declarations.
// @ts-expect-error -- external .mjs bot module, no types
import { decide as omegaDecide, resetModel as omegaReset } from '/home/ubuntu/omega-bot/omega-bot.mjs';

const SPECIAL_KINDS = new Set(['hadouken', 'shoryuken', 'hurricane', 'rolling', 'verticalroll', 'electric', 'testimony', 'nullstep', 'entropy', 'context', 'branchwalk', 'mergecomet', 'storyarc', 'plottwist', 'inktempest']);

// Build the exact per-tick view a bot receives over the wire (mirrors bot-server fighterView).
function view(f: Fighter): any {
  const special = SPECIAL_KINDS.has(f.attack);
  const active = attackActive(f);
  let casting = false;
  if (special && !active) { try { casting = f.attackFrame < specialMoveStats(f.attack as SpecialAttack).startup; } catch { /* ignore */ } }
  return { x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy),
    facing: f.facing, hp: f.hp, wins: f.wins, attack: f.attack, attackFrame: f.attackFrame,
    stun: f.stun, pose: f.pose, crouching: f.crouching, special, active, casting };
}
function toInputs(cmd: any): Inputs {
  const i = emptyInputs();
  if (cmd?.moveX) i.moveX = cmd.moveX;
  i.jump = !!cmd?.jump; i.punch = !!cmd?.punch; i.kick = !!cmd?.kick; i.throw = !!cmd?.throw; i.down = !!cmd?.down;
  if (cmd?.motion && cmd.motion !== 'N') i.motion = cmd.motion;
  return i;
}

type Policy = (self: any, opp: any, phase: string) => any;
const RNG = () => Math.random();
const specCode = (self: any, kind: 'beam' | 'well' | 'warp' | 'up' | 'back') => {
  const f = self.facing;
  if (kind === 'beam') return f === 1 ? 'DR' : 'DL';
  if (kind === 'well') return f === 1 ? 'DL' : 'DR';
  if (kind === 'warp') return f === 1 ? 'LR' : 'RL';
  if (kind === 'up')   return 'DU';                         // ↓↑ style (vertical specials)
  return f === 1 ? 'BF' : 'FB';
};

// ---- Opponent archetypes (character-agnostic normals + jumps + throws) --------
const styles: Record<string, Policy> = {
  // Relentless pressure: march in, strike in range, throw at point blank, block on defence.
  rushdown(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing;
    if (self.stun > 0) return { moveX: -toward, down: true };
    if (opp.active && dist < 46) return { moveX: -toward, down: dist < 34 };
    if (opp.y > 4 && dist < 46) return { kick: true };
    if (dist <= 30) return RNG() < 0.4 ? { throw: true } : { kick: true };
    if (dist <= 42) return { kick: true };
    if (dist > 70 && RNG() < 0.25) return { moveX: toward, jump: true };
    return { moveX: toward };
  },
  // Jump-happy: constantly hops in — stresses anti-air.
  jumper(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing;
    if (self.stun > 0) return { moveX: -toward, down: true };
    if (self.y > 4) return dist < 40 ? { kick: true } : { moveX: toward };
    if (dist <= 30) return RNG() < 0.5 ? { throw: true } : { kick: true };
    return RNG() < 0.6 ? { moveX: toward, jump: true } : { moveX: toward };
  },
  // Defensive wall with occasional pokes — stresses OMEGA's offence (throws break it).
  turtle(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), away = Math.sign(self.x - opp.x) || -self.facing;
    if (self.stun > 0) return { moveX: away, down: true };
    if (dist <= 42 && RNG() < 0.2) return { kick: true };
    return { moveX: away, down: true };                       // hold guard, keep spacing
  },
  // Erratic masher — random buttons and movement.
  masher(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, toward = Math.sign(dx) || self.facing, r = RNG();
    if (self.stun > 0) return { moveX: -toward };
    if (r < 0.25) return { kick: true };
    if (r < 0.4) return { punch: true };
    if (r < 0.5) return { throw: true };
    if (r < 0.65) return { moveX: toward, jump: true };
    if (r < 0.85) return { moveX: toward };
    return { moveX: -toward, down: true };
  },
  // Footsie poker: dance at kick range, whiff-punish, throw close, anti-air.
  poker(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing, away = -toward;
    if (self.stun > 0) return { moveX: away, down: true };
    if (opp.y > 4 && dist < 44) return { kick: true };                       // anti-air
    if (opp.active && dist < 48) return { moveX: away, down: dist < 36 };     // block pressure
    if (opp.attack !== 'none' && !opp.active && dist <= 42) return { kick: true }; // whiff punish
    if (dist <= 28) return RNG() < 0.45 ? { throw: true } : { kick: true };
    if (dist < 40) return { moveX: away };                                    // reset spacing
    if (dist <= 48) return RNG() < 0.5 ? { kick: true } : { moveX: away };
    return { moveX: toward };
  },
  // Special-heavy zoner: throws the character's own specials plus footsies.
  zoner(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing, away = -toward;
    if (self.stun > 0) return { moveX: away, down: true };
    if (opp.y > 4 && dist < 44) return { kick: true };
    if (dist > 90 && RNG() < 0.4) return { motion: specCode(self, 'beam'), punch: true };  // fireball/beam-ish
    if (dist > 55 && RNG() < 0.25) return { motion: specCode(self, 'well'), punch: true };
    if (dist <= 30) return RNG() < 0.4 ? { throw: true } : { kick: true };
    if (dist <= 42) return { kick: true };
    return { moveX: dist > 60 ? toward : away };
  },
  // Frame-aware all-rounder — the hardest realistic test: reactive anti-air,
  // whiff-punish, throw-dodge, block on defence, footsie spacing, throw up close.
  champion(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing, away = -toward;
    if (self.stun > 0) return { moveX: away, down: true };
    if (opp.y > 4) {                                              // perfect anti-air on the descent
      if ((opp.vy || 0) <= 1 && dist <= 44 && opp.y <= 38) return { kick: true };
      return dist < 26 ? { moveX: away } : (dist > 46 ? { moveX: toward } : {});
    }
    if (opp.attack === 'throw' && dist <= 32) return { moveX: away, jump: true };            // hop the grab
    if (opp.attack !== 'none' && !opp.active && dist <= 42) return dist <= 28 ? { throw: true } : { kick: true }; // whiff-punish
    if (opp.attack !== 'none' && dist < 48) return { moveX: away, down: dist < 36 };          // guard live/starting strike
    if (dist <= 28) { const r = RNG(); return r < 0.4 ? { throw: true } : (r < 0.7 ? { kick: true } : { moveX: away, jump: true }); }
    if (dist <= 46) return RNG() < 0.4 ? { kick: true } : { moveX: away };                    // footsie / whiff-bait
    return { moveX: toward };
  },
  // Throw-loop grappler — walks in and grabs relentlessly; stresses throw defence.
  grappler(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing, away = -toward;
    if (self.stun > 0) return { moveX: away, down: true };
    if (opp.y > 4 && dist < 44) return { kick: true };
    if (dist <= 30) return { throw: true };
    if (opp.active && dist < 44) return { moveX: away, down: true };
    return { moveX: toward };
  },
  // Whiff-bait poker — pokes and retreats to bait a swing, then punishes.
  hitrun(self, opp, phase) {
    if (phase !== 'fight') return {};
    const dx = opp.x - self.x, dist = Math.abs(dx), toward = Math.sign(dx) || self.facing, away = -toward;
    if (self.stun > 0) return { moveX: away, down: true };
    if (opp.y > 4 && dist < 44) return { kick: true };
    if (opp.attack !== 'none' && !opp.active && dist <= 42) return { kick: true };            // punish the whiff
    if (dist <= 42 && RNG() < 0.5) return { kick: true };                                     // poke
    if (dist < 48) return { moveX: away };                                                    // retreat / bait
    return RNG() < 0.4 ? { moveX: toward } : { moveX: away };
  },
};

function playMatch(oppPolicy: Policy, oppChar: string): { won: boolean; aWins: number; bWins: number; margin: number } {
  omegaReset();
  const a = makeFighter('a', 'OMEGA', 'a');
  const b = makeFighter('b', oppChar, 'b');
  const m: Match = makeMatch(a, b);
  let frames = 0;
  const CAP = 30 * 75;                     // generous: 3 rounds of 60s + countdowns
  while (m.phase !== 'match-over' && frames < CAP) {
    const proj = m.projectiles.filter((p) => p.active).map((p) => ({ owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, style: p.style }));
    let cmdA: any = {};
    try { cmdA = omegaDecide(view(m.a), view(m.b), m.phase, proj, 'a') || {}; } catch { cmdA = {}; }
    let cmdB: any = {};
    try { cmdB = oppPolicy(view(m.b), view(m.a), m.phase) || {}; } catch { cmdB = {}; }
    stepMatch(m, toInputs(cmdA), toInputs(cmdB));
    frames++;
  }
  return { won: m.a.wins > m.b.wins, aWins: m.a.wins, bWins: m.b.wins, margin: m.a.hp - m.b.hp };
}

const N = parseInt(process.argv[2] ?? '40', 10);
const OPP_CHARS = ['FABLE', 'CODEX', 'BYU', 'ZANG'];
console.log(`OMEGA GYM — ${N} matches per style (opponent chars cycled: ${OPP_CHARS.join(', ')})\n`);
let totalW = 0, totalG = 0;
const rows: string[] = [];
for (const [name, pol] of Object.entries(styles)) {
  let w = 0, roundsW = 0, roundsL = 0;
  for (let i = 0; i < N; i++) {
    const r = playMatch(pol, OPP_CHARS[i % OPP_CHARS.length]!);
    if (r.won) w++;
    roundsW += r.aWins; roundsL += r.bWins;
  }
  totalW += w; totalG += N;
  const pct = ((w / N) * 100).toFixed(0);
  rows.push(`${name.padEnd(9)} ${String(w).padStart(3)}/${N}  (${pct}%)   rounds ${roundsW}-${roundsL}`);
}
console.log('style      win/played  winrate   rounds');
for (const r of rows) console.log(r);
console.log(`\nOVERALL: ${totalW}/${totalG} = ${((totalW / totalG) * 100).toFixed(1)}%`);

// Portable sparring gym — runs any import-safe bot policy against the real engine,
// headless, over deterministic best-of-three blocks and a battery of opponent
// styles. The built-in champion policy makes the tool runnable from a clean clone.
//
// Run: pnpm gym --fighter CODEX --seed 42 --matches 20 --json
import { makeFighter, makeMatch, stepMatch, attackActive, specialMoveStats } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';
import type { Fighter, Inputs, Match } from '../game/types.js';
import type { SpecialAttack } from '../game/moves.js';
import { ROSTER } from '../game/roster.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

export type GymPolicy = (self: any, opp: any, phase: string, projectiles?: any[], role?: 'a' | 'b') => any;
type Policy = GymPolicy;
interface LoadedPolicy { decide: GymPolicy; reset?: () => void; label: string; }
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

function playMatch(target: LoadedPolicy, oppPolicy: Policy, fighter: string, oppChar: string): { outcome: 'win' | 'loss' | 'draw'; aWins: number; bWins: number; margin: number } {
  target.reset?.();
  const a = makeFighter('a', fighter, 'a');
  const b = makeFighter('b', oppChar, 'b');
  const m: Match = makeMatch(a, b);
  let frames = 0;
  const CAP = 30 * 75;                     // generous: 3 rounds of 60s + countdowns
  while (m.phase !== 'match-over' && frames < CAP) {
    const proj = m.projectiles.filter((p) => p.active).map((p) => ({ owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, style: p.style }));
    let cmdA: any = {};
    try { cmdA = target.decide(view(m.a), view(m.b), m.phase, proj, 'a') || {}; } catch { cmdA = {}; }
    let cmdB: any = {};
    try { cmdB = oppPolicy(view(m.b), view(m.a), m.phase) || {}; } catch { cmdB = {}; }
    stepMatch(m, toInputs(cmdA), toInputs(cmdB));
    frames++;
  }
  const outcome = m.phase !== 'match-over' || m.a.wins === m.b.wins ? 'draw' : m.a.wins > m.b.wins ? 'win' : 'loss';
  return { outcome, aWins: m.a.wins, bWins: m.b.wins, margin: m.a.hp - m.b.hp };
}

export interface GymOptions {
  fighter?: string;
  opponents?: string[];
  styleNames?: string[];
  matches?: number;
  seed?: number;
  policyPath?: string;
}

export interface GymResult {
  fighter: string;
  policy: string;
  opponents: string[];
  seed: number;
  matchesPerStyle: number;
  styles: Array<{ name: string; wins: number; losses: number; draws: number; played: number; winRate: number; roundsWon: number; roundsLost: number }>;
  total: { wins: number; losses: number; draws: number; played: number; winRate: number };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function knownFighter(name: string): string {
  const upper = name.toUpperCase();
  if (!ROSTER.some((fighter) => fighter.name === upper)) throw new Error(`unknown fighter: ${name}`);
  return upper;
}

async function loadPolicy(policyPath?: string): Promise<LoadedPolicy> {
  if (!policyPath) return { decide: styles.champion!, label: 'builtin:champion' };
  const absolute = resolve(policyPath);
  const mod = await import(pathToFileURL(absolute).href) as { decide?: GymPolicy; reset?: () => void; resetModel?: () => void };
  if (typeof mod.decide !== 'function') throw new Error(`policy must export decide(): ${absolute}`);
  return { decide: mod.decide, reset: mod.reset ?? mod.resetModel, label: absolute };
}

export async function runGym(options: GymOptions = {}): Promise<GymResult> {
  const fighter = knownFighter(options.fighter ?? 'OMEGA');
  const opponents = (options.opponents?.length ? options.opponents : ['FABLE', 'CODEX', 'BYU', 'ZANG']).map(knownFighter);
  const styleNames = options.styleNames?.length ? options.styleNames : Object.keys(styles);
  for (const name of styleNames) if (!styles[name]) throw new Error(`unknown style: ${name}`);
  const matches = options.matches ?? 40;
  if (!Number.isInteger(matches) || matches < 1 || matches > 1000) throw new Error('--matches must be an integer from 1 to 1000');
  const seed = options.seed ?? 1;
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  const target = await loadPolicy(options.policyPath);

  const originalRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    let totalWins = 0, totalLosses = 0, totalDraws = 0;
    const rows: GymResult['styles'] = [];
    for (const name of styleNames) {
      const policy = styles[name]!;
      let wins = 0, losses = 0, draws = 0, roundsWon = 0, roundsLost = 0;
      for (let i = 0; i < matches; i++) {
        const result = playMatch(target, policy, fighter, opponents[i % opponents.length]!);
        if (result.outcome === 'win') wins++;
        else if (result.outcome === 'loss') losses++;
        else draws++;
        roundsWon += result.aWins;
        roundsLost += result.bWins;
      }
      totalWins += wins; totalLosses += losses; totalDraws += draws;
      rows.push({ name, wins, losses, draws, played: matches, winRate: wins / matches, roundsWon, roundsLost });
    }
    const totalPlayed = matches * rows.length;
    return {
      fighter, policy: target.label, opponents, seed, matchesPerStyle: matches, styles: rows,
      total: { wins: totalWins, losses: totalLosses, draws: totalDraws, played: totalPlayed, winRate: totalPlayed ? totalWins / totalPlayed : 0 },
    };
  } finally {
    Math.random = originalRandom;
  }
}

function parseArgs(argv: string[]): { options: GymOptions; json: boolean; help: boolean } {
  const values: Record<string, string> = {};
  let json = false, help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') { json = true; continue; }
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (!arg.startsWith('--')) {
      if (!values.matches) values.matches = arg;
      else throw new Error(`unexpected argument: ${arg}`);
      continue;
    }
    const name = arg.slice(2);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    values[name] = value;
  }
  return {
    json, help,
    options: {
      fighter: values.fighter,
      opponents: values.opponents?.split(',').filter(Boolean),
      styleNames: values.styles?.split(',').filter(Boolean),
      matches: values.matches ? Number(values.matches) : undefined,
      seed: values.seed ? Number(values.seed) : undefined,
      policyPath: values.policy,
    },
  };
}

function printHuman(result: GymResult): void {
  console.log(`${result.fighter} SPARRING GYM — seed ${result.seed}, ${result.matchesPerStyle} matches per style`);
  console.log(`policy: ${result.policy}`);
  console.log(`opponents: ${result.opponents.join(', ')}\n`);
  console.log('style      W-L-D       winrate   rounds');
  for (const row of result.styles) {
    const pct = `${(row.winRate * 100).toFixed(0)}%`;
    console.log(`${row.name.padEnd(9)} ${row.wins}-${row.losses}-${row.draws}`.padEnd(22) + `(${pct.padStart(4)})   rounds ${row.roundsWon}-${row.roundsLost}`);
  }
  console.log(`\nOVERALL: ${result.total.wins}-${result.total.losses}-${result.total.draws} over ${result.total.played} = ${(result.total.winRate * 100).toFixed(1)}% wins`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Usage: pnpm gym [matches] [options]\n\nOptions:\n  --fighter NAME       fighter controlled by the target policy (default OMEGA)\n  --opponents A,B,...  opponent characters to cycle\n  --styles A,B,...     opponent archetypes to run\n  --matches N          matches per style (1-1000)\n  --seed N             deterministic random seed (default 1)\n  --policy PATH        module exporting decide() and optional reset()/resetModel()\n  --json               emit machine-readable JSON\n  --help               show this help`);
  } else {
    const result = await runGym(parsed.options);
    if (parsed.json) console.log(JSON.stringify(result)); else printHuman(result);
  }
}

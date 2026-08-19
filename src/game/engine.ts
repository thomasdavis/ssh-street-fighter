import type { AttackKind, Fighter, FighterPalette, Inputs, Match } from './types.js';
import { RED_PALETTE, BLUE_PALETTE } from './sprites.js';
import { STAGES } from './stage-set.js';
import { matchingSpecialMove, specialMoveForAttack, type SpecialAttack } from './moves.js';

export const WORLD_W = 240;
export const WORLD_H = 160;
export const GROUND_Y = 150;
export const STAGE_LEFT = 22;
export const STAGE_RIGHT = WORLD_W - 22;
export const TICK_HZ = 30;

// --- movement / physics tuning ---
const WALK_SPEED = 2.3;
const GROUND_ACCEL = 0.7;    // how fast ground velocity eases toward target
const GROUND_FRICTION = 0.6; // deceleration when no input
const AIR_ACCEL = 0.32;      // air control per tick
const AIR_MAX = 2.9;         // max horizontal air speed
const JUMP_V = 7.6;
const GRAVITY = 0.62;
const JUMP_CLEAR = 14;       // above this height fighters pass over each other
const BODY_HALF = 10;        // half body width for separation

// --- attacks: startup -> active -> recovery (frames @30Hz) ---
export interface AttackSpec { startup: number; active: number; recovery: number; dmg: number; range: number; reach: number; kb: number; chip: number; }
export const ATTACKS: Record<'punch' | 'kick', AttackSpec> = {
  punch: { startup: 3, active: 3, recovery: 7, dmg: 8, range: 30, reach: 22, kb: 2.2, chip: 2 },
  kick: { startup: 6, active: 4, recovery: 11, dmg: 13, range: 42, reach: 30, kb: 3.6, chip: 3 },
};
function attackTotal(k: AttackKind): number {
  if (k === 'hadouken') return HAD.total;
  if (k === 'shoryuken') return SHORYU.total;
  if (k === 'hurricane') return HURRI.total;
  if (k === 'electric') return ELECTRIC.total;
  if (k === 'rolling') return ROLLING.total;
  if (k === 'verticalroll') return VERTICAL_ROLL.total;
  if (k === 'testimony') return TESTIMONY.total;
  if (k === 'nullstep') return NULL_STEP.total;
  if (k === 'entropy') return ENTROPY.total;
  if (k === 'context') return CONTEXT.total;
  if (k === 'branchwalk') return BRANCHWALK.total;
  if (k === 'mergecomet') return MERGE_COMET.total;
  if (k === 'throw') return THROW.total;
  if (k === 'storyarc') return STORY_ARC.total;
  if (k === 'plottwist') return PLOT_TWIST.total;
  if (k === 'inktempest') return INK_TEMPEST.total;
  if (k === 'punch' || k === 'kick') { const a = ATTACKS[k]; return a.startup + a.active + a.recovery; }
  return 0;
}
export function attackActive(f: Fighter): boolean {
  if (f.attack === 'punch' || f.attack === 'kick') { const a = ATTACKS[f.attack]; return f.attackFrame >= a.startup && f.attackFrame < a.startup + a.active; }
  if (f.attack === 'shoryuken') return f.attackFrame >= SHORYU.startup && f.attackFrame < SHORYU.startup + SHORYU.active;
  if (f.attack === 'hurricane') return f.attackFrame >= HURRI.startup && f.attackFrame < HURRI.startup + HURRI.active;
  if (f.attack === 'electric') return f.attackFrame >= ELECTRIC.startup && f.attackFrame < ELECTRIC.startup + ELECTRIC.active;
  if (f.attack === 'rolling') return f.attackFrame >= ROLLING.startup && f.attackFrame < ROLLING.startup + ROLLING.active;
  if (f.attack === 'verticalroll') return f.attackFrame >= VERTICAL_ROLL.startup && f.attackFrame < VERTICAL_ROLL.startup + VERTICAL_ROLL.active;
  if (f.attack === 'testimony') return f.attackFrame >= TESTIMONY.startup && f.attackFrame < TESTIMONY.startup + TESTIMONY.active;
  if (f.attack === 'nullstep') return f.attackFrame >= NULL_STEP.startup && f.attackFrame < NULL_STEP.startup + NULL_STEP.active;
  if (f.attack === 'entropy') return f.attackFrame >= ENTROPY.startup && f.attackFrame < ENTROPY.startup + ENTROPY.active;
  if (f.attack === 'context') return f.attackFrame >= CONTEXT.startup && f.attackFrame < CONTEXT.startup + CONTEXT.active;
  if (f.attack === 'branchwalk') return f.attackFrame >= BRANCHWALK.startup && f.attackFrame < BRANCHWALK.startup + BRANCHWALK.active;
  if (f.attack === 'mergecomet') return f.attackFrame >= MERGE_COMET.startup && f.attackFrame < MERGE_COMET.startup + MERGE_COMET.active;
  if (f.attack === 'throw') return f.attackFrame >= THROW.startup && f.attackFrame < THROW.startup + THROW.active;
  if (f.attack === 'storyarc') return f.attackFrame >= STORY_ARC.startup && f.attackFrame < STORY_ARC.startup + STORY_ARC.active;
  if (f.attack === 'plottwist') return f.attackFrame >= PLOT_TWIST.startup && f.attackFrame < PLOT_TWIST.startup + PLOT_TWIST.active;
  if (f.attack === 'inktempest') return f.attackFrame >= INK_TEMPEST.startup && f.attackFrame < INK_TEMPEST.startup + INK_TEMPEST.active;
  return false; // hadouken has no melee hitbox
}

// --- special moves ---
export const HAD = { startup: 8, spawn: 11, total: 32 };                       // Hadouken (↓→ + punch): projectile
const SHORYU = { startup: 3, active: 13, recovery: 12, total: 28, dmg: 16, range: 34, kb: 4, chip: 4, vert: 66, jumpV: 8.6, vx: 1.5 }; // Shoryuken (→↓→ + punch): rising uppercut
const HURRI = { startup: 4, active: 22, recovery: 8, total: 34, dmg: 5, range: 36, kb: 1.5, chip: 1, vert: 46, jumpV: 5.6, vx: 2.6, hitEvery: 7 }; // Hurricane (↓← + kick): spinning kick
const ELECTRIC = { startup: 3, active: 21, recovery: 7, total: 31, dmg: 4, range: 31, kb: 1.2, chip: 1, vert: 52, hitEvery: 6 }; // Electric Thunder (↓↑ + punch): close multi-hit field
const ROLLING = { startup: 4, active: 18, recovery: 9, total: 31, dmg: 14, range: 29, kb: 4.8, chip: 3, vert: 44, jumpV: 3.6, vx: 5.2 }; // Rolling Attack (back→forward + punch)
const VERTICAL_ROLL = { startup: 4, active: 16, recovery: 15, total: 35, dmg: 14, range: 28, kb: 3.6, chip: 3, vert: 68, jumpV: 10.2, vx: 0.7 }; // Vertical Roll (↓↑ + kick)
export const TESTIMONY = { startup: 10, active: 5, recovery: 26, total: 41, dmg: 13, range: 176, kb: 5.2, chip: 4, vert: 26 }; // screen-length beam (low: jump it; punishable on whiff)
export const NULL_STEP = { startup: 6, shift: 6, active: 4, recovery: 17, total: 27, dmg: 13, range: 31, kb: 3.2, chip: 2, vert: 48 }; // phase-through cross-up
export const ENTROPY = { startup: 8, active: 18, recovery: 12, total: 38, dmg: 4, range: 96, kb: 0.8, chip: 1, vert: 56, hitEvery: 6, wellOffset: 42, pull: 1.2 }; // pull + three pulses
export const CONTEXT = { startup: 5, active: 9, recovery: 30, total: 44, dmg: 9, range: 27, kb: 2.4, chip: 2, vert: 44, jumpV: 10.8, vx: 0.8 }; // ultra-high evasive rise
export const BRANCHWALK = { startup: 7, active: 8, recovery: 18, total: 33, dmg: 10, range: 29, kb: 2.8, chip: 2, vert: 48, jumpV: 5.4, vx: 3.7 }; // committing forward glide
export const MERGE_COMET = { startup: 10, active: 7, recovery: 15, total: 32, dmg: 9, maxDmg: 12, range: 32, maxRange: 38, kb: 3.2, maxKb: 4.4, chip: 2, maxChip: 3, vert: 54, jumpV: 7.2, riseVx: 0.8, diveV: -6.4, fullWeightV: -9.5, diveVx: 3.5 }; // Weight of Evidence: velocity-compounding gravity dive
export const THROW = { startup: 3, active: 3, recovery: 14, total: 20, dmg: 14, range: 30, kb: 6.5, vert: 22 }; // close-range UNBLOCKABLE grab (beats guard; whiff is punishable)
export const STORY_ARC = { startup: 6, active: 10, recovery: 26, total: 42, dmg: 10, range: 28, kb: 2.6, chip: 2, vert: 46, jumpV: 9.8, vx: 1.7 }; // soaring evasive flight arc
export const PLOT_TWIST = { startup: 9, active: 5, recovery: 16, total: 30, dmg: 12, range: 30, kb: 3.4, chip: 2, vert: 40, backVx: 2.2, lungeVx: 5.2 }; // backstep feint into a lunge
export const INK_TEMPEST = { startup: 5, active: 18, recovery: 10, total: 33, dmg: 4, range: 34, kb: 1.0, chip: 1, vert: 50, hitEvery: 6 }; // close forward flurry, three pulses
const FIRE_SPEED = 3.4, FIRE_R = 11, FIGHTER_WORLD_H = 56, FIRE_DMG = 12, FIRE_CHIP = 3;
const EARLY_UP_GRACE_Y = 26;

export interface SpecialMoveStats {
  startup: number;
  active: number;
  recovery: number;
  damagePerHit: number;
  maxHits: number;
  maxDamage: number;
  chipPerHit: number;
  range: number;
  impact: string;
}

/** Public combat numbers used by tests and character profiles. */
export function specialMoveStats(attack: SpecialAttack): SpecialMoveStats {
  if (attack === 'hadouken') return { startup: HAD.spawn, active: 1, recovery: HAD.total - HAD.spawn, damagePerHit: FIRE_DMG, maxHits: 1, maxDamage: FIRE_DMG, chipPerHit: FIRE_CHIP, range: STAGE_RIGHT - STAGE_LEFT, impact: 'Traveling projectile' };
  if (attack === 'shoryuken') return { startup: SHORYU.startup, active: SHORYU.active, recovery: SHORYU.recovery, damagePerHit: SHORYU.dmg, maxHits: 1, maxDamage: SHORYU.dmg, chipPerHit: SHORYU.chip, range: SHORYU.range, impact: 'Rising launcher' };
  if (attack === 'hurricane') { const hits = Math.ceil(HURRI.active / HURRI.hitEvery); return { startup: HURRI.startup, active: HURRI.active, recovery: HURRI.recovery, damagePerHit: HURRI.dmg, maxHits: hits, maxDamage: HURRI.dmg * hits, chipPerHit: HURRI.chip, range: HURRI.range, impact: 'Traveling multi-hit' }; }
  if (attack === 'electric') { const hits = Math.ceil(ELECTRIC.active / ELECTRIC.hitEvery); return { startup: ELECTRIC.startup, active: ELECTRIC.active, recovery: ELECTRIC.recovery, damagePerHit: ELECTRIC.dmg, maxHits: hits, maxDamage: ELECTRIC.dmg * hits, chipPerHit: ELECTRIC.chip, range: ELECTRIC.range, impact: 'Close multi-hit field' }; }
  if (attack === 'rolling') return { startup: ROLLING.startup, active: ROLLING.active, recovery: ROLLING.recovery, damagePerHit: ROLLING.dmg, maxHits: 1, maxDamage: ROLLING.dmg, chipPerHit: ROLLING.chip, range: ROLLING.range, impact: 'Horizontal rush' };
  if (attack === 'verticalroll') return { startup: VERTICAL_ROLL.startup, active: VERTICAL_ROLL.active, recovery: VERTICAL_ROLL.recovery, damagePerHit: VERTICAL_ROLL.dmg, maxHits: 1, maxDamage: VERTICAL_ROLL.dmg, chipPerHit: VERTICAL_ROLL.chip, range: VERTICAL_ROLL.range, impact: 'Vertical launcher' };
  if (attack === 'testimony') return { startup: TESTIMONY.startup, active: TESTIMONY.active, recovery: TESTIMONY.recovery, damagePerHit: TESTIMONY.dmg, maxHits: 1, maxDamage: TESTIMONY.dmg, chipPerHit: TESTIMONY.chip, range: TESTIMONY.range, impact: 'Instant screen beam' };
  if (attack === 'nullstep') return { startup: NULL_STEP.startup, active: NULL_STEP.active, recovery: NULL_STEP.recovery, damagePerHit: NULL_STEP.dmg, maxHits: 1, maxDamage: NULL_STEP.dmg, chipPerHit: NULL_STEP.chip, range: NULL_STEP.range, impact: 'Phase-through cross-up' };
  if (attack === 'context') return { startup: CONTEXT.startup, active: CONTEXT.active, recovery: CONTEXT.recovery, damagePerHit: CONTEXT.dmg, maxHits: 1, maxDamage: CONTEXT.dmg, chipPerHit: CONTEXT.chip, range: CONTEXT.range, impact: 'Ultra-high evasive ascent' };
  if (attack === 'branchwalk') return { startup: BRANCHWALK.startup, active: BRANCHWALK.active, recovery: BRANCHWALK.recovery, damagePerHit: BRANCHWALK.dmg, maxHits: 1, maxDamage: BRANCHWALK.dmg, chipPerHit: BRANCHWALK.chip, range: BRANCHWALK.range, impact: 'Committing aerial glide' };
  if (attack === 'mergecomet') return { startup: MERGE_COMET.startup, active: MERGE_COMET.active, recovery: MERGE_COMET.recovery, damagePerHit: MERGE_COMET.dmg, maxHits: 1, maxDamage: MERGE_COMET.maxDmg, chipPerHit: MERGE_COMET.maxChip, range: MERGE_COMET.maxRange, impact: 'Velocity-weighted gravity dive' };
  if (attack === 'storyarc') return { startup: STORY_ARC.startup, active: STORY_ARC.active, recovery: STORY_ARC.recovery, damagePerHit: STORY_ARC.dmg, maxHits: 1, maxDamage: STORY_ARC.dmg, chipPerHit: STORY_ARC.chip, range: STORY_ARC.range, impact: 'Soaring evasive arc' };
  if (attack === 'plottwist') return { startup: PLOT_TWIST.startup, active: PLOT_TWIST.active, recovery: PLOT_TWIST.recovery, damagePerHit: PLOT_TWIST.dmg, maxHits: 1, maxDamage: PLOT_TWIST.dmg, chipPerHit: PLOT_TWIST.chip, range: PLOT_TWIST.range, impact: 'Backstep feint lunge' };
  if (attack === 'inktempest') { const hits = Math.ceil(INK_TEMPEST.active / INK_TEMPEST.hitEvery); return { startup: INK_TEMPEST.startup, active: INK_TEMPEST.active, recovery: INK_TEMPEST.recovery, damagePerHit: INK_TEMPEST.dmg, maxHits: hits, maxDamage: INK_TEMPEST.dmg * hits, chipPerHit: INK_TEMPEST.chip, range: INK_TEMPEST.range, impact: 'Close multi-hit flurry' }; }
  const hits = Math.ceil(ENTROPY.active / ENTROPY.hitEvery);
  return { startup: ENTROPY.startup, active: ENTROPY.active, recovery: ENTROPY.recovery, damagePerHit: ENTROPY.dmg, maxHits: hits, maxDamage: ENTROPY.dmg * hits, chipPerHit: ENTROPY.chip, range: ENTROPY.range, impact: 'Pulling gravity field' };
}

interface MeleeSpec { dmg: number; range: number; kb: number; chip: number; vert: number; omni?: boolean }
function weightOfEvidenceFactor(f: Fighter): number {
  if (f.attack !== 'mergecomet') return 0;
  const gainedFallSpeed = Math.max(0, -f.vy - Math.abs(MERGE_COMET.diveV));
  const fullWeightGain = Math.abs(MERGE_COMET.fullWeightV) - Math.abs(MERGE_COMET.diveV);
  return Math.min(1, gainedFallSpeed / fullWeightGain);
}
function meleeSpec(f: Fighter): MeleeSpec | null {
  const k = f.attack;
  if (k === 'punch' || k === 'kick') { const a = ATTACKS[k]; return { dmg: a.dmg, range: a.range, kb: a.kb, chip: a.chip, vert: 34 }; }
  if (k === 'shoryuken') return { dmg: SHORYU.dmg, range: SHORYU.range, kb: SHORYU.kb, chip: SHORYU.chip, vert: SHORYU.vert };
  if (k === 'hurricane') return { dmg: HURRI.dmg, range: HURRI.range, kb: HURRI.kb, chip: HURRI.chip, vert: HURRI.vert };
  if (k === 'electric') return { dmg: ELECTRIC.dmg, range: ELECTRIC.range, kb: ELECTRIC.kb, chip: ELECTRIC.chip, vert: ELECTRIC.vert, omni: true };
  if (k === 'rolling') return { dmg: ROLLING.dmg, range: ROLLING.range, kb: ROLLING.kb, chip: ROLLING.chip, vert: ROLLING.vert };
  if (k === 'verticalroll') return { dmg: VERTICAL_ROLL.dmg, range: VERTICAL_ROLL.range, kb: VERTICAL_ROLL.kb, chip: VERTICAL_ROLL.chip, vert: VERTICAL_ROLL.vert };
  if (k === 'testimony') return { dmg: TESTIMONY.dmg, range: TESTIMONY.range, kb: TESTIMONY.kb, chip: TESTIMONY.chip, vert: TESTIMONY.vert };
  if (k === 'nullstep') return { dmg: NULL_STEP.dmg, range: NULL_STEP.range, kb: NULL_STEP.kb, chip: NULL_STEP.chip, vert: NULL_STEP.vert };
  if (k === 'entropy') return { dmg: ENTROPY.dmg, range: ENTROPY.range, kb: ENTROPY.kb, chip: ENTROPY.chip, vert: ENTROPY.vert };
  if (k === 'context') return { dmg: CONTEXT.dmg, range: CONTEXT.range, kb: CONTEXT.kb, chip: CONTEXT.chip, vert: CONTEXT.vert };
  if (k === 'branchwalk') return { dmg: BRANCHWALK.dmg, range: BRANCHWALK.range, kb: BRANCHWALK.kb, chip: BRANCHWALK.chip, vert: BRANCHWALK.vert };
  if (k === 'mergecomet') {
    const weight = weightOfEvidenceFactor(f);
    return {
      dmg: Math.round(MERGE_COMET.dmg + (MERGE_COMET.maxDmg - MERGE_COMET.dmg) * weight),
      range: MERGE_COMET.range + (MERGE_COMET.maxRange - MERGE_COMET.range) * weight,
      kb: MERGE_COMET.kb + (MERGE_COMET.maxKb - MERGE_COMET.kb) * weight,
      chip: Math.round(MERGE_COMET.chip + (MERGE_COMET.maxChip - MERGE_COMET.chip) * weight),
      vert: MERGE_COMET.vert,
    };
  }
  if (k === 'throw') return { dmg: THROW.dmg, range: THROW.range, kb: THROW.kb, chip: 0, vert: THROW.vert };
  if (k === 'storyarc') return { dmg: STORY_ARC.dmg, range: STORY_ARC.range, kb: STORY_ARC.kb, chip: STORY_ARC.chip, vert: STORY_ARC.vert };
  if (k === 'plottwist') return { dmg: PLOT_TWIST.dmg, range: PLOT_TWIST.range, kb: PLOT_TWIST.kb, chip: PLOT_TWIST.chip, vert: PLOT_TWIST.vert };
  if (k === 'inktempest') return { dmg: INK_TEMPEST.dmg, range: INK_TEMPEST.range, kb: INK_TEMPEST.kb, chip: INK_TEMPEST.chip, vert: INK_TEMPEST.vert };
  return null;
}

/** 0..1 limb extension for animation (windup -> strike -> recover). */
export function attackExtension(f: Fighter): number {
  if (f.attack === 'none') return 0;
  if (f.attack === 'hadouken') {
    if (f.attackFrame < HAD.startup) return 0.4 * (f.attackFrame / HAD.startup);
    if (f.attackFrame < HAD.spawn + 3) return 1;
    return 1 - 0.7 * ((f.attackFrame - HAD.spawn - 3) / Math.max(1, HAD.total - HAD.spawn - 3));
  }
  if (f.attack === 'shoryuken') return f.attackFrame < SHORYU.startup ? f.attackFrame / SHORYU.startup : 1;
  if (f.attack === 'hurricane') return (f.attackFrame % 8) / 8; // spin phase
  if (f.attack === 'electric') return (Math.sin(f.attackFrame * 1.7) + 1) / 2; // alternating charge frames
  if (f.attack === 'rolling' || f.attack === 'verticalroll') return (f.attackFrame % 12) / 12;
  if (f.attack === 'testimony') return f.attackFrame < TESTIMONY.startup ? f.attackFrame / TESTIMONY.startup : 1;
  if (f.attack === 'nullstep') return Math.min(1, f.attackFrame / NULL_STEP.shift);
  if (f.attack === 'entropy') return (Math.sin(f.attackFrame * 1.1) + 1) / 2;
  if (f.attack === 'context') return Math.min(1, f.attackFrame / CONTEXT.startup);
  if (f.attack === 'branchwalk') return Math.min(1, f.attackFrame / BRANCHWALK.startup);
  if (f.attack === 'mergecomet') return Math.min(1, f.attackFrame / MERGE_COMET.startup);
  if (f.attack === 'throw') return f.attackFrame < THROW.startup ? f.attackFrame / THROW.startup : 1;
  if (f.attack === 'storyarc') return Math.min(1, f.attackFrame / STORY_ARC.startup);
  if (f.attack === 'plottwist') return f.attackFrame < PLOT_TWIST.startup ? 0.3 * (f.attackFrame / PLOT_TWIST.startup) : 1;
  if (f.attack === 'inktempest') return (Math.sin(f.attackFrame * 1.5) + 1) / 2;
  const a = ATTACKS[f.attack];
  if (f.attackFrame < a.startup) return 0.35 * (f.attackFrame / Math.max(1, a.startup));
  if (f.attackFrame < a.startup + a.active) return 1;
  const r = (f.attackFrame - a.startup - a.active) / Math.max(1, a.recovery);
  return 1 - 0.75 * r;
}

const HIT_STUN = 12;
const BLOCK_STUN = 7;
const ROUND_SECONDS = 60;
const WINS_TO_TAKE_MATCH = 2;

export function makeFighter(id: string, name: string, side: 'a' | 'b', palette?: FighterPalette): Fighter {
  const isA = side === 'a';
  return {
    id,
    name: name.slice(0, 12) || (isA ? 'BYU' : 'MEN'),
    palette: palette ?? (isA ? RED_PALETTE : BLUE_PALETTE),
    x: isA ? WORLD_W * 0.34 : WORLD_W * 0.66,
    y: 0, vx: 0, vy: 0,
    facing: isA ? 1 : -1,
    hp: 100, wins: 0,
    attack: 'none', attackFrame: 0, attackHit: false, attackCrouch: false,
    stun: 0, crouching: false, blocking: false,
    animT: 0, walkPhase: 0, pose: 'idle',
  };
}

export function makeMatch(a: Fighter, b: Fighter): Match {
  return { a, b, phase: 'countdown', phaseTimer: TICK_HZ * 3, roundTime: ROUND_SECONDS, round: 1, message: 'ROUND 1', frame: 0, stage: STAGES.pick(), projectiles: [], hitStop: 0, sparks: [] };
}

function resetRound(m: Match): void {
  for (const [f, side] of [[m.a, 'a'], [m.b, 'b']] as const) {
    f.hp = 100; f.y = 0; f.vx = 0; f.vy = 0; f.attack = 'none'; f.attackFrame = 0; f.attackCrouch = false;
    f.stun = 0; f.crouching = false; f.blocking = false; f.pose = 'idle';
    f.x = side === 'a' ? WORLD_W * 0.34 : WORLD_W * 0.66;
    f.facing = side === 'a' ? 1 : -1;
  }
  m.roundTime = ROUND_SECONDS;
  m.projectiles = [];
  m.hitStop = 0; m.sparks = [];
}

const approach = (v: number, target: number, rate: number): number => {
  if (v < target) return Math.min(target, v + rate);
  if (v > target) return Math.max(target, v - rate);
  return v;
};

function derivePose(f: Fighter): void {
  if (f.hp <= 0) { f.pose = 'ko'; return; }
  if (f.stun > 0) { f.pose = 'hit'; return; }
  if (f.attack === 'hadouken') { f.pose = 'hadouken'; return; }
  if (f.attack === 'shoryuken') { f.pose = 'shoryuken'; return; }
  if (f.attack === 'hurricane') { f.pose = 'hurricane'; return; }
  if (f.attack === 'electric') { f.pose = 'electric'; return; }
  if (f.attack === 'rolling') { f.pose = 'rolling'; return; }
  if (f.attack === 'verticalroll') { f.pose = 'verticalroll'; return; }
  if (f.attack === 'testimony') { f.pose = 'testimony'; return; }
  if (f.attack === 'nullstep') { f.pose = 'nullstep'; return; }
  if (f.attack === 'entropy') { f.pose = 'entropy'; return; }
  if (f.attack === 'context') { f.pose = 'context'; return; }
  if (f.attack === 'branchwalk') { f.pose = 'branchwalk'; return; }
  if (f.attack === 'mergecomet') { f.pose = 'mergecomet'; return; }
  if (f.attack === 'throw') { f.pose = 'throw'; return; }
  if (f.attack === 'storyarc') { f.pose = 'storyarc'; return; }
  if (f.attack === 'plottwist') { f.pose = 'plottwist'; return; }
  if (f.attack === 'inktempest') { f.pose = 'inktempest'; return; }
  if (f.attack === 'punch') { f.pose = f.attackCrouch ? 'crouchpunch' : 'punch'; return; }
  if (f.attack === 'kick') { f.pose = f.attackCrouch ? 'crouchkick' : 'kick'; return; }
  const airborne = f.y > 0.5;
  if (airborne) { f.pose = f.vy >= 0 ? 'jump' : 'fall'; return; }
  if (f.crouching) { f.pose = f.blocking ? 'crouchblock' : 'crouch'; return; }
  if (f.blocking) { f.pose = 'block'; return; }
  if (Math.abs(f.vx) > 0.3) { f.pose = 'walk'; return; }
  f.pose = 'idle';
}

function stepFighter(f: Fighter, other: Fighter, inp: Inputs, live: boolean): void {
  f.animT += 1;
  const grounded = f.y <= 0.0001 && f.vy <= 0;

  // advance timers
  if (f.stun > 0) f.stun--;
  if (f.attack !== 'none') {
    f.attackFrame++;
    if (f.attackFrame >= attackTotal(f.attack)) { f.attack = 'none'; f.attackFrame = 0; }
  }

  // face the opponent whenever free (locks during an attack)
  if (live && f.attack === 'none' && f.stun <= 0) {
    const dir = other.x === f.x ? f.facing : (other.x > f.x ? 1 : -1);
    f.facing = dir as 1 | -1;
  }

  const free = f.attack === 'none' && f.stun <= 0;
  // Directional states, SF-style: crouch = holding down; block = holding the
  // direction AWAY from the opponent. Crouch persists through a crouch attack.
  if (live) {
    const holdCrouch = inp.down && grounded && free;
    const back = inp.moveX !== 0 && inp.moveX === -f.facing;
    f.crouching = holdCrouch || (f.attack !== 'none' && f.attackCrouch && grounded);
    f.blocking = back && grounded && free;
  }

  // Context Ascent may be revised into Weight of Evidence only after its apex.
  // The original rise is still a full commitment: no cancel while ascending,
  // and the one-frame seal cast remains visible before the gravity dive turns active.
  if (live && f.stun <= 0 && f.attack === 'context' && f.vy < 0 && f.y > JUMP_CLEAR) {
    const special = matchingSpecialMove(f.name, inp, f.facing);
    if (special?.attack === 'mergecomet') startAttack(f, 'mergecomet', true);
  }

  const busy = f.stun > 0 || f.attack !== 'none';

  // -------- control (special-move motions checked most-specific first) --------
  if (live && !busy) {
    const special = matchingSpecialMove(f.name, inp, f.facing);
    const earlyAirStart = special?.earlyAirStart && f.y <= EARLY_UP_GRACE_Y && f.vy > 0;
    if (special && (grounded || earlyAirStart)) { startAttack(f, special.attack); }
    else if (inp.throw && grounded) { startAttack(f, 'throw'); }
    else if (inp.punch) { startAttack(f, 'punch'); }
    else if (inp.kick) { startAttack(f, 'kick'); }
    else if (inp.jump && grounded && !inp.down) {
      f.vy = JUMP_V; f.y = Math.max(f.y, 0.001);
      if (inp.moveX !== 0) f.vx = inp.moveX * WALK_SPEED; // diagonal leap
    }
  }

  // recompute after control so airborne specials keep their launch velocity
  const busy2 = f.stun > 0 || f.attack !== 'none';
  // hurricane kick hits repeatedly as it spins through
  if (f.attack === 'hurricane' && f.attackFrame > HURRI.startup && (f.attackFrame - HURRI.startup) % HURRI.hitEvery === 0) f.attackHit = false;
  // Electric Thunder pulses several times while the field is active.
  if (f.attack === 'electric' && f.attackFrame > ELECTRIC.startup && (f.attackFrame - ELECTRIC.startup) % ELECTRIC.hitEvery === 0) f.attackHit = false;
  // Entropy Well deals three discrete implosion pulses while continuously pulling.
  if (f.attack === 'entropy' && f.attackFrame > ENTROPY.startup && (f.attackFrame - ENTROPY.startup) % ENTROPY.hitEvery === 0) f.attackHit = false;
  // Null Step crosses through once, flips to face the rival, and attacks from behind.
  if (f.attack === 'nullstep' && f.attackFrame === NULL_STEP.shift) {
    const oldFacing = f.facing;
    f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, other.x + oldFacing * 17));
    f.facing = (oldFacing * -1) as 1 | -1;
    f.vx = 0;
  }
  // Entropy Well is anchored in front of Omega and drags the rival toward its core.
  if (f.attack === 'entropy' && attackActive(f)) {
    const wellX = f.x + f.facing * ENTROPY.wellOffset;
    const delta = wellX - other.x;
    if (Math.abs(delta) <= ENTROPY.range && Math.abs(f.y - other.y) <= ENTROPY.vert) {
      other.vx += Math.max(-ENTROPY.pull, Math.min(ENTROPY.pull, delta * 0.045));
    }
  }
  // Weight of Evidence pauses on a readable seal, then commits to one diagonal descent.
  if (f.attack === 'mergecomet' && f.attackFrame === MERGE_COMET.startup) {
    f.vy = MERGE_COMET.diveV;
    f.vx = f.facing * MERGE_COMET.diveVx;
  }
  // Ink Tempest sustains a close flurry that strikes in three discrete pulses.
  if (f.attack === 'inktempest' && f.attackFrame > INK_TEMPEST.startup && (f.attackFrame - INK_TEMPEST.startup) % INK_TEMPEST.hitEvery === 0) f.attackHit = false;
  // Plot Twist retreats through its readable feint, then converts it into one lunge.
  if (f.attack === 'plottwist') {
    if (f.attackFrame < PLOT_TWIST.startup) f.vx = -f.facing * PLOT_TWIST.backVx;
    else if (f.attackFrame === PLOT_TWIST.startup) f.vx = f.facing * PLOT_TWIST.lungeVx;
  }

  // horizontal movement — allowed while blocking (walk-back) but not crouching
  const canGroundMove = grounded && !busy2 && !f.crouching;
  if (f.y > 0.0001 || f.vy > 0) {
    // airborne: air control (but NOT during a special — it owns its velocity)
    if (live && !busy2) f.vx = Math.max(-AIR_MAX, Math.min(AIR_MAX, f.vx + inp.moveX * AIR_ACCEL));
  } else if (canGroundMove) {
    const target = inp.moveX * WALK_SPEED;
    f.vx = inp.moveX !== 0 ? approach(f.vx, target, GROUND_ACCEL) : approach(f.vx, 0, GROUND_FRICTION);
    if (inp.moveX !== 0) f.walkPhase += 0.45;
  } else if (grounded) {
    f.vx = approach(f.vx, 0, GROUND_FRICTION);
  }

  // integrate
  f.x += f.vx;
  if (f.y > 0.0001 || f.vy !== 0) {
    f.y += f.vy;
    f.vy -= GRAVITY;
    if (f.y <= 0) { f.y = 0; f.vy = 0; }
  }

  // stage bounds
  if (f.x < STAGE_LEFT) { f.x = STAGE_LEFT; if (f.vx < 0) f.vx = 0; }
  if (f.x > STAGE_RIGHT) { f.x = STAGE_RIGHT; if (f.vx > 0) f.vx = 0; }

  derivePose(f);
}

function startAttack(f: Fighter, kind: AttackKind, contextDescent = false): void {
  f.attack = kind; f.attackFrame = 0; f.attackHit = false;
  f.attackCrouch = (kind === 'punch' || kind === 'kick') ? f.crouching : false;
  // airborne specials launch the fighter
  if (kind === 'shoryuken') { f.vy = SHORYU.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * SHORYU.vx; f.crouching = false; }
  if (kind === 'hurricane') { f.vy = HURRI.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * HURRI.vx; f.crouching = false; }
  if (kind === 'electric') { f.y = 0; f.vy = 0; f.vx = 0; f.crouching = false; }
  if (kind === 'rolling') { f.vy = ROLLING.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * ROLLING.vx; f.crouching = false; }
  if (kind === 'verticalroll') { f.vy = VERTICAL_ROLL.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * VERTICAL_ROLL.vx; f.crouching = false; }
  if (kind === 'testimony' || kind === 'nullstep' || kind === 'entropy') { f.y = 0; f.vy = 0; f.vx = 0; f.crouching = false; }
  if (kind === 'context') { f.vy = CONTEXT.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * CONTEXT.vx; f.crouching = false; }
  if (kind === 'branchwalk') { f.vy = BRANCHWALK.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * BRANCHWALK.vx; f.crouching = false; }
  if (kind === 'mergecomet') {
    f.y = Math.max(f.y, 0.001); f.vx = f.facing * MERGE_COMET.riseVx; f.crouching = false;
    if (contextDescent) {
      f.attackFrame = MERGE_COMET.startup - 1;
      f.vy = Math.min(f.vy, -1.5);
    } else f.vy = MERGE_COMET.jumpV;
  }
  if (kind === 'storyarc') { f.vy = STORY_ARC.jumpV; f.y = Math.max(f.y, 0.001); f.vx = f.facing * STORY_ARC.vx; f.crouching = false; }
  if (kind === 'plottwist' || kind === 'inktempest') { f.y = 0; f.vy = 0; f.vx = 0; f.crouching = false; }
}

/** Push grounded, overlapping fighters apart. Airborne fighters pass over. */
function separate(a: Fighter, b: Fighter): void {
  if (a.y > JUMP_CLEAR || b.y > JUMP_CLEAR) return; // let jumpers cross
  const dx = b.x - a.x;
  const overlap = 2 * BODY_HALF - Math.abs(dx);
  if (overlap <= 0) return;
  const push = overlap / 2;
  const s = dx >= 0 ? 1 : -1;
  a.x -= s * push; b.x += s * push;
  a.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, a.x));
  b.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, b.x));
}

interface HitFx { x: number; y: number; heavy: boolean; blocked: boolean; }

function resolveHit(att: Fighter, def: Fighter): HitFx | null {
  if (!attackActive(att) || att.attackHit) return null;
  const spec = meleeSpec(att);
  if (!spec) return null;
  const dx = def.x - att.x;
  // must be on the side the attacker faces, within reach, at similar height
  if (!spec.omni && Math.sign(dx) !== att.facing && dx !== 0) return null;
  if (Math.abs(dx) > spec.range) return null;
  if (Math.abs(att.y - def.y) > spec.vert) return null;
  att.attackHit = true;

  if (att.attack === 'throw') {
    // UNBLOCKABLE grab: ignores guard, tosses a grounded target away in a short arc
    def.hp = Math.max(0, def.hp - spec.dmg);
    def.stun = HIT_STUN + 6;
    def.attack = 'none'; def.attackFrame = 0;
    def.vx = att.facing * spec.kb; def.vy = 3.4; def.y = Math.max(def.y, 0.001);
    att.vx = -att.facing * 1.0; // thrower recoils slightly
    return { x: (att.x + def.x) / 2, y: Math.max(att.y, def.y) + 16, heavy: true, blocked: false };
  }

  const guarding = def.blocking && def.stun <= 0 && def.facing === -att.facing && def.y <= JUMP_CLEAR;
  if (guarding) {
    def.hp = Math.max(0, def.hp - spec.chip);
    def.stun = Math.max(def.stun, BLOCK_STUN);
    def.vx += att.facing * 1.4;
  } else {
    def.hp = Math.max(0, def.hp - spec.dmg);
    def.stun = HIT_STUN;
    def.attack = 'none'; def.attackFrame = 0;
    def.vx = att.facing * spec.kb;
    if (att.attack === 'kick' && def.y <= 0.001) def.vy = 1.6;
    if (att.attack === 'shoryuken') { def.vy = 5.5; def.y = Math.max(def.y, 0.001); } // launch up
    if (att.attack === 'rolling') { def.vy = 3.2; def.y = Math.max(def.y, 0.001); }
    if (att.attack === 'verticalroll') { def.vy = 6.2; def.y = Math.max(def.y, 0.001); }
    if (att.attack === 'context') { def.vy = 4.8; def.y = Math.max(def.y, 0.001); }
    if (att.attack === 'branchwalk') { def.vy = 2.4; def.y = Math.max(def.y, 0.001); }
    if (att.attack === 'storyarc') { def.vy = 3.6; def.y = Math.max(def.y, 0.001); }
  }
  // contact point between the fighters, ~chest height above the ground
  return { x: (att.x + def.x) / 2, y: Math.max(att.y, def.y) + 18, heavy: !guarding && spec.dmg >= 8, blocked: guarding };
}

/** Trigger impact feel: a brief freeze + a uniquely-shaped spark, scaled by weight. */
function applyHitFx(m: Match, fx: HitFx): void {
  m.hitStop = Math.max(m.hitStop, fx.blocked ? 2 : fx.heavy ? 5 : 3);
  // deterministic seed (both players compute the same) but different every hit
  const seed = ((m.frame * 2654435761) ^ (Math.round(fx.x) * 40503) ^ (m.sparks.length * 97)) >>> 0;
  m.sparks.push({ x: fx.x, y: fx.y, t: fx.heavy ? 7 : 5, heavy: fx.heavy, seed });
  if (m.sparks.length > 12) m.sparks.shift();
}

function stepSparks(m: Match): void {
  if (!m.sparks.length) return;
  for (const s of m.sparks) s.t--;
  m.sparks = m.sparks.filter((s) => s.t > 0);
}

function spawnFireball(m: Match, f: Fighter, owner: 'a' | 'b'): void {
  const style = specialMoveForAttack(f.name, 'hadouken')?.projectile ?? 'blue';
  m.projectiles.push({ owner, x: f.x + f.facing * 16, y: 30, vx: f.facing * FIRE_SPEED, active: true, hit: false, frame: 0, facing: f.facing, style });
}

function stepProjectiles(m: Match): void {
  for (const p of m.projectiles) {
    if (!p.active) continue;
    p.frame++; p.x += p.vx;
    if (p.x < STAGE_LEFT - 24 || p.x > STAGE_RIGHT + 24) { p.active = false; continue; }
    const def = p.owner === 'a' ? m.b : m.a;
    if (p.hit || def.hp <= 0) continue;
    const withinX = Math.abs(def.x - p.x) < FIRE_R + BODY_HALF;
    const withinY = p.y >= def.y - 6 && p.y <= def.y + FIGHTER_WORLD_H; // jump over it
    if (withinX && withinY) {
      p.hit = true; p.active = false;
      const guarding = def.blocking && def.stun <= 0 && def.facing === -p.facing && def.y <= JUMP_CLEAR;
      if (guarding) { def.hp = Math.max(0, def.hp - FIRE_CHIP); def.stun = Math.max(def.stun, BLOCK_STUN); def.vx += p.facing * 1.4; }
      else { def.hp = Math.max(0, def.hp - FIRE_DMG); def.stun = HIT_STUN; def.attack = 'none'; def.attackFrame = 0; def.vx = p.facing * 3.4; }
    }
  }
  // opposing fireballs meeting cancel out
  const act = m.projectiles.filter((p) => p.active);
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    if (act[i]!.owner !== act[j]!.owner && Math.abs(act[i]!.x - act[j]!.x) < FIRE_R * 2) { act[i]!.active = false; act[j]!.active = false; }
  }
  m.projectiles = m.projectiles.filter((p) => p.active);
}

export function stepMatch(m: Match, inA: Inputs, inB: Inputs): void {
  m.frame++;

  if (m.phase === 'countdown') {
    m.a.facing = m.a.x <= m.b.x ? 1 : -1; m.b.facing = m.b.x < m.a.x ? -1 : 1;
    m.a.animT++; m.b.animT++;
    m.phaseTimer--;
    m.message = m.phaseTimer > TICK_HZ ? `ROUND ${m.round}` : 'FIGHT!';
    if (m.phaseTimer <= 0) { m.phase = 'fight'; m.message = ''; }
    return;
  }

  if (m.phase === 'round-over' || m.phase === 'match-over') {
    stepFighter(m.a, m.b, inA, false);
    stepFighter(m.b, m.a, inB, false);
    separate(m.a, m.b);
    m.phaseTimer--;
    if (m.phaseTimer <= 0 && m.phase === 'round-over') {
      m.round++; resetRound(m); m.phase = 'countdown'; m.phaseTimer = TICK_HZ * 2;
    }
    return;
  }

  // FIGHT
  // Hit-stop: on impact both fighters freeze for a few frames so the hit "pops".
  // Everything holds (only the visual shake + sparks decay).
  if (m.hitStop > 0) { m.hitStop--; stepSparks(m); return; }
  stepFighter(m.a, m.b, inA, true);
  stepFighter(m.b, m.a, inB, true);
  separate(m.a, m.b);
  const fxA = resolveHit(m.a, m.b);
  const fxB = resolveHit(m.b, m.a);
  if (fxA) applyHitFx(m, fxA);
  if (fxB) applyHitFx(m, fxB);
  stepSparks(m);
  // spawn hadouken fireballs on the throw frame, then advance projectiles
  if (m.a.attack === 'hadouken' && m.a.attackFrame === HAD.spawn) spawnFireball(m, m.a, 'a');
  if (m.b.attack === 'hadouken' && m.b.attackFrame === HAD.spawn) spawnFireball(m, m.b, 'b');
  stepProjectiles(m);

  if (m.frame % TICK_HZ === 0 && m.roundTime > 0) m.roundTime--;

  const aDead = m.a.hp <= 0, bDead = m.b.hp <= 0, timeUp = m.roundTime <= 0;
  if (aDead || bDead || timeUp) {
    let winner: Fighter | null = null;
    if (aDead && !bDead) winner = m.b;
    else if (bDead && !aDead) winner = m.a;
    else if (timeUp) winner = m.a.hp === m.b.hp ? null : (m.a.hp > m.b.hp ? m.a : m.b);
    if (winner) winner.wins++;
    if (aDead) m.a.pose = 'ko';
    if (bDead) m.b.pose = 'ko';
    if (winner && winner.wins >= WINS_TO_TAKE_MATCH) {
      m.phase = 'match-over'; m.phaseTimer = TICK_HZ * 8; m.message = `${winner.name} WINS!`;
    } else {
      m.phase = 'round-over'; m.phaseTimer = TICK_HZ * 3; m.message = winner ? `${winner.name} WINS ROUND` : 'DRAW';
    }
  }
}

/**
 * Client-side prediction: advance ONLY one fighter (the local player) using its
 * own input against the frozen authoritative opponent. A cluster worker calls
 * this to show the local player's movement/attacks with zero round-trip; the
 * authoritative state (which arrives a few ms later) then corrects it. Uses the
 * exact same physics as the server (stepFighter), so predictions match. Only the
 * local fighter moves — the opponent, hits, hp and projectiles stay authoritative,
 * so there is never any opponent rubber-banding.
 */
export function predictLocal(m: Match, side: 'a' | 'b', inp: Inputs): void {
  if (m.phase !== 'fight' || m.hitStop > 0) return; // frozen during hit-stop, like the server
  const me = side === 'a' ? m.a : m.b;
  const other = side === 'a' ? m.b : m.a;
  stepFighter(me, other, inp, true);
  // one-sided separation: keep `me` out of the (frozen) opponent, don't move them
  if (me.y <= JUMP_CLEAR && other.y <= JUMP_CLEAR) {
    const dx = other.x - me.x;
    const overlap = 2 * BODY_HALF - Math.abs(dx);
    if (overlap > 0) me.x -= (dx >= 0 ? 1 : -1) * overlap;
    me.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, me.x));
  }
}

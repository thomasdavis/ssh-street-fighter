import type { AttackKind, Inputs } from './types.js';

export type AttackButton = 'punch' | 'kick';
type RelativeDirection = 'F' | 'D' | 'B' | 'U';
type SpecialAttack = Exclude<AttackKind, 'none' | 'punch' | 'kick'>;

export interface SpecialMoveDefinition {
  attack: SpecialAttack;
  name: string;
  shortName: string;
  motion: readonly RelativeDirection[];
  button: AttackButton;
  // Down-to-up motions naturally emit a jump one terminal tick before the
  // attack key. Give those moves a tiny hop-cancel window so SSH packet timing
  // cannot turn a valid charge-style input into an ordinary jump.
  earlyAirStart?: boolean;
  effect?: 'electric' | 'wind' | 'flame' | 'crimson';
  projectile?: 'blue' | 'fire' | 'sonic' | 'crimson';
}

// Ordered most-specific first: the engine uses this same list for recognition,
// while the help overlay uses it for display. Adding a move updates both.
const MOVE_SETS: Readonly<Record<string, readonly SpecialMoveDefinition[]>> = {
  BYU: [
    { attack: 'shoryuken', name: 'DRAGON PUNCH', shortName: 'DRAGON', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'HADOUKEN', shortName: 'HADOUKEN', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'hurricane', name: 'HURRICANE KICK', shortName: 'HURRICANE', motion: ['D', 'B'], button: 'kick' },
  ],
  MEN: [
    { attack: 'shoryuken', name: 'BLAZING UPPERCUT', shortName: 'BLAZE', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'FIREBALL', shortName: 'FIREBALL', motion: ['D', 'F'], button: 'punch', projectile: 'fire' },
    { attack: 'hurricane', name: 'TORNADO KICK', shortName: 'TORNADO', motion: ['D', 'B'], button: 'kick' },
  ],
  BLANKO: [
    { attack: 'rolling', name: 'ROLLING ATTACK', shortName: 'ROLL', motion: ['B', 'F'], button: 'punch' },
    { attack: 'verticalroll', name: 'VERTICAL ROLL', shortName: 'UP ROLL', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
    { attack: 'electric', name: 'ELECTRIC THUNDER', shortName: 'ELECTRIC', motion: ['D', 'U'], button: 'punch', earlyAirStart: true, effect: 'electric' },
  ],
  CHONG: [
    { attack: 'hadouken', name: 'KIKOKEN', shortName: 'KIKOKEN', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'electric', name: 'LIGHTNING LEGS', shortName: 'LIGHTNING', motion: ['D', 'F'], button: 'kick' },
    { attack: 'hurricane', name: 'SPINNING BIRD KICK', shortName: 'BIRD KICK', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
  ],
  GYLE: [
    { attack: 'hadouken', name: 'SONIC BOOM', shortName: 'SONIC', motion: ['B', 'F'], button: 'punch', projectile: 'sonic' },
    { attack: 'shoryuken', name: 'FLASH KICK', shortName: 'FLASH', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
    { attack: 'electric', name: 'SONIC CYCLONE', shortName: 'CYCLONE', motion: ['D', 'B'], button: 'punch', effect: 'wind' },
  ],
  ZANG: [
    { attack: 'verticalroll', name: 'CYCLONE DRIVER', shortName: 'DRIVER', motion: ['F', 'D', 'B'], button: 'punch' },
    { attack: 'electric', name: 'DOUBLE LARIAT', shortName: 'LARIAT', motion: ['B', 'F'], button: 'punch' },
    { attack: 'hurricane', name: 'FLYING PRESS', shortName: 'PRESS', motion: ['D', 'B'], button: 'kick' },
  ],
  DHAL: [
    { attack: 'hadouken', name: 'YOGA FIRE', shortName: 'FIRE', motion: ['D', 'F'], button: 'punch', projectile: 'fire' },
    { attack: 'electric', name: 'YOGA FLAME', shortName: 'FLAME', motion: ['D', 'B'], button: 'punch', effect: 'flame' },
    { attack: 'hurricane', name: 'DRILL KICK', shortName: 'DRILL', motion: ['D', 'F'], button: 'kick' },
  ],
  HONDO: [
    { attack: 'rolling', name: 'SUMO HEADBUTT', shortName: 'HEADBUTT', motion: ['B', 'F'], button: 'punch' },
    { attack: 'electric', name: 'HUNDRED HAND', shortName: 'HANDS', motion: ['D', 'F'], button: 'punch' },
    { attack: 'shoryuken', name: 'SUMO SMASH', shortName: 'SMASH', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
  ],
  KIRA: [
    { attack: 'shoryuken', name: 'ZERO ASCENT', shortName: 'ASCENT', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'PHASE NEEDLE', shortName: 'NEEDLE', motion: ['D', 'F'], button: 'punch', projectile: 'sonic' },
    { attack: 'electric', name: 'RIFT COUNTER', shortName: 'COUNTER', motion: ['D', 'B'], button: 'kick', effect: 'electric' },
  ],
  MAKO: [
    { attack: 'hadouken', name: 'MOON TIDE', shortName: 'MOON TIDE', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'electric', name: 'GINGA RUSH', shortName: 'GINGA', motion: ['D', 'F'], button: 'kick', effect: 'wind' },
    { attack: 'hurricane', name: 'AXE WHEEL', shortName: 'AXE WHEEL', motion: ['D', 'B'], button: 'kick' },
  ],
  OMEGA: [
    { attack: 'shoryuken', name: 'TERMINAL RISE', shortName: 'TERMINAL', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'RED VERDICT', shortName: 'VERDICT', motion: ['D', 'F'], button: 'punch', projectile: 'crimson' },
    { attack: 'electric', name: 'FAULT CASCADE', shortName: 'CASCADE', motion: ['D', 'B'], button: 'kick', effect: 'crimson' },
  ],
};

export const BUTTON_KEY: Readonly<Record<AttackButton, string>> = { punch: 'W', kick: 'E' };

export function specialMovesFor(character: string): readonly SpecialMoveDefinition[] {
  return MOVE_SETS[character.toUpperCase()] ?? [];
}

export function specialMoveForAttack(character: string, attack: SpecialAttack): SpecialMoveDefinition | null {
  return specialMovesFor(character).find((move) => move.attack === attack) ?? null;
}

function directionCode(token: RelativeDirection, facing: 1 | -1): string {
  if (token === 'D') return 'D';
  if (token === 'U') return 'U';
  if (token === 'F') return facing === 1 ? 'R' : 'L';
  return facing === 1 ? 'L' : 'R';
}

export function specialMoveMotionCode(move: SpecialMoveDefinition, facing: 1 | -1): string {
  return move.motion.map((d) => directionCode(d, facing)).join('');
}

function directionGlyph(token: RelativeDirection, facing: 1 | -1): string {
  if (token === 'D') return '↓';
  if (token === 'U') return '↑';
  if (token === 'F') return facing === 1 ? '→' : '←';
  return facing === 1 ? '←' : '→';
}

export function specialMoveInput(
  move: SpecialMoveDefinition,
  facing: 1 | -1,
  compact = false,
  buttonKeys: Readonly<Record<AttackButton, string>> = BUTTON_KEY,
): string {
  const separator = compact ? '' : ' ';
  return `${move.motion.map((d) => directionGlyph(d, facing)).join(separator)} + ${buttonKeys[move.button]}`;
}

/** Resolve the first matching move, preserving punch-over-kick input priority. */
export function matchingSpecialMove(character: string, inputs: Inputs, facing: 1 | -1): SpecialMoveDefinition | null {
  const button: AttackButton | null = inputs.punch ? 'punch' : (inputs.kick ? 'kick' : null);
  if (!button) return null;
  return specialMovesFor(character).find((move) =>
    move.button === button && inputs.motion.endsWith(specialMoveMotionCode(move, facing))
  ) ?? null;
}

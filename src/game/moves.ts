import type { AttackKind, Inputs } from './types.js';

export type AttackButton = 'punch' | 'kick';
type RelativeDirection = 'F' | 'D' | 'B' | 'U';
export type SpecialAttack = Exclude<AttackKind, 'none' | 'punch' | 'kick'>;

export interface SpecialMoveDefinition {
  attack: SpecialAttack;
  name: string;
  shortName: string;
  description: string;
  motion: readonly RelativeDirection[];
  button: AttackButton;
  // Down-to-up motions naturally emit a jump one terminal tick before the
  // attack key. Give those moves a tiny hop-cancel window so SSH packet timing
  // cannot turn a valid charge-style input into an ordinary jump.
  earlyAirStart?: boolean;
  effect?: 'electric' | 'wind' | 'flame';
  projectile?: 'blue' | 'fire' | 'sonic';
}

// Ordered most-specific first: the engine uses this same list for recognition,
// while the help overlay uses it for display. Adding a move updates both.
const MOVE_SETS: Readonly<Record<string, readonly SpecialMoveDefinition[]>> = {
  BYU: [
    { attack: 'shoryuken', name: 'DRAGON PUNCH', shortName: 'DRAGON', description: 'A rising invincible uppercut that catches airborne rivals and launches them away.', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'HADOUKEN', shortName: 'HADOUKEN', description: 'A steady blue projectile for controlling the ground and forcing an approach.', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'hurricane', name: 'HURRICANE KICK', shortName: 'HURRICANE', description: 'A traveling four-frame spin kick that can connect repeatedly while carrying Byu forward.', motion: ['D', 'B'], button: 'kick' },
  ],
  MEN: [
    { attack: 'shoryuken', name: 'BLAZING UPPERCUT', shortName: 'BLAZE', description: 'A fiery vertical reversal that converts a reckless jump into a hard knockback.', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'FIREBALL', shortName: 'FIREBALL', description: 'A hot, high-contrast projectile used to start Men’s aggressive advance.', motion: ['D', 'F'], button: 'punch', projectile: 'fire' },
    { attack: 'hurricane', name: 'TORNADO KICK', shortName: 'TORNADO', description: 'A forward-driving multi-hit rotation that keeps retreating opponents under pressure.', motion: ['D', 'B'], button: 'kick' },
  ],
  BLANKO: [
    { attack: 'rolling', name: 'ROLLING ATTACK', shortName: 'ROLL', description: 'Blanko curls into a fast horizontal ball that crosses space and slams through hesitation.', motion: ['B', 'F'], button: 'punch' },
    { attack: 'verticalroll', name: 'VERTICAL ROLL', shortName: 'UP ROLL', description: 'A steep rolling launch that controls the air directly above Blanko.', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
    { attack: 'electric', name: 'ELECTRIC THUNDER', shortName: 'ELECTRIC', description: 'A grounded electrical field that shocks nearby opponents up to four times.', motion: ['D', 'U'], button: 'punch', earlyAirStart: true, effect: 'electric' },
  ],
  CHONG: [
    { attack: 'hadouken', name: 'KIKOKEN', shortName: 'KIKOKEN', description: 'A compact blue pulse that checks grounded movement and prepares Chong’s entry.', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'electric', name: 'LIGHTNING LEGS', shortName: 'LIGHTNING', description: 'A rapid close-range kick barrage that repeatedly clips a trapped guard.', motion: ['D', 'F'], button: 'kick' },
    { attack: 'hurricane', name: 'SPINNING BIRD KICK', shortName: 'BIRD KICK', description: 'An inverted aerial rotor that rises through pressure and hits on multiple rotations.', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
  ],
  GYLE: [
    { attack: 'hadouken', name: 'SONIC BOOM', shortName: 'SONIC', description: 'A fast resonance blade that establishes Gyle’s preferred defensive distance.', motion: ['B', 'F'], button: 'punch', projectile: 'sonic' },
    { attack: 'shoryuken', name: 'FLASH KICK', shortName: 'FLASH', description: 'A sudden rising heel that punishes opponents trying to jump over the sonic wall.', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
    { attack: 'electric', name: 'SONIC CYCLONE', shortName: 'CYCLONE', description: 'A close wind vortex that repeatedly strikes anyone who breaches Gyle’s perimeter.', motion: ['D', 'B'], button: 'punch', effect: 'wind' },
  ],
  ZANG: [
    { attack: 'verticalroll', name: 'CYCLONE DRIVER', shortName: 'DRIVER', description: 'A compact airborne driver that launches Zang upward through close defense.', motion: ['F', 'D', 'B'], button: 'punch' },
    { attack: 'electric', name: 'DOUBLE LARIAT', shortName: 'LARIAT', description: 'An omnidirectional arm cyclone that repeatedly punishes anyone standing beside him.', motion: ['B', 'F'], button: 'punch' },
    { attack: 'hurricane', name: 'FLYING PRESS', shortName: 'PRESS', description: 'A rotating airborne body press that advances with heavyweight multi-hit force.', motion: ['D', 'B'], button: 'kick' },
  ],
  DHAL: [
    { attack: 'hadouken', name: 'YOGA FIRE', shortName: 'FIRE', description: 'A compact flame projectile that occupies the long lane and slows pursuit.', motion: ['D', 'F'], button: 'punch', projectile: 'fire' },
    { attack: 'electric', name: 'YOGA FLAME', shortName: 'FLAME', description: 'A sustained close flame cone that repeatedly burns opponents inside Dhal’s reach.', motion: ['D', 'B'], button: 'punch', effect: 'flame' },
    { attack: 'hurricane', name: 'DRILL KICK', shortName: 'DRILL', description: 'A corkscrewing aerial spear that turns Dhal’s full body into a moving hit zone.', motion: ['D', 'F'], button: 'kick' },
  ],
  HONDO: [
    { attack: 'rolling', name: 'SUMO HEADBUTT', shortName: 'HEADBUTT', description: 'A horizontal heavyweight launch that converts stored ground into sudden impact.', motion: ['B', 'F'], button: 'punch' },
    { attack: 'electric', name: 'HUNDRED HAND', shortName: 'HANDS', description: 'A planted palm barrage that hits repeatedly and makes blocking expensive.', motion: ['D', 'F'], button: 'punch' },
    { attack: 'shoryuken', name: 'SUMO SMASH', shortName: 'SMASH', description: 'An explosive vertical palm strike built to catch escape attempts overhead.', motion: ['D', 'U'], button: 'kick', earlyAirStart: true },
  ],
  KIRA: [
    { attack: 'shoryuken', name: 'ZERO ASCENT', shortName: 'ASCENT', description: 'A narrow predictive uppercut that meets an airborne body at its future position.', motion: ['F', 'D', 'F'], button: 'punch' },
    { attack: 'hadouken', name: 'PHASE NEEDLE', shortName: 'NEEDLE', description: 'A thin high-speed energy needle made for exact long-range interruption.', motion: ['D', 'F'], button: 'punch', projectile: 'sonic' },
    { attack: 'electric', name: 'RIFT COUNTER', shortName: 'COUNTER', description: 'A fractured guard plane followed by a rapid kick that punishes predictable pressure.', motion: ['D', 'B'], button: 'kick', effect: 'electric' },
  ],
  MAKO: [
    { attack: 'hadouken', name: 'MOON TIDE', shortName: 'MOON TIDE', description: 'A crescent wave that creates the beat Mako uses to begin his approach.', motion: ['D', 'F'], button: 'punch', projectile: 'blue' },
    { attack: 'electric', name: 'GINGA RUSH', shortName: 'GINGA', description: 'A swaying series of rapid kicks that strikes repeatedly from changing heights.', motion: ['D', 'F'], button: 'kick', effect: 'wind' },
    { attack: 'hurricane', name: 'AXE WHEEL', shortName: 'AXE WHEEL', description: 'A high capoeira wheel whose long rotating leg carries Mako through the opponent.', motion: ['D', 'B'], button: 'kick' },
  ],
  OMEGA: [
    { attack: 'testimony', name: 'FINAL TESTIMONY', shortName: 'TESTIMONY', description: 'Omega opens its cracked core and delivers a screen-length crimson beam with no projectile travel time.', motion: ['D', 'F'], button: 'punch' },
    { attack: 'nullstep', name: 'NULL STEP', shortName: 'NULL STEP', description: 'Omega fractures into afterimages, phases through the rival, and rematerializes with a cross-up strike.', motion: ['B', 'F'], button: 'kick' },
    { attack: 'entropy', name: 'ENTROPY WELL', shortName: 'ENTROPY', description: 'A localized gravity fault drags the opponent inward through three damaging implosions.', motion: ['D', 'B'], button: 'punch' },
  ],
  CODEX: [
    { attack: 'context', name: 'CONTEXT ASCENT', shortName: 'ASCENT', description: 'Codex commits to an ultra-high rising arc that clears horizontal threats but stays punishable through the long descent.', motion: ['D', 'U'], button: 'punch', earlyAirStart: true },
    { attack: 'branchwalk', name: 'BRANCHWALK', shortName: 'BRANCHWALK', description: 'A copper-winged forward glide crosses one aerial lane with modest damage and a clearly exposed landing recovery.', motion: ['B', 'F'], button: 'kick' },
    { attack: 'mergecomet', name: 'MERGE COMET', shortName: 'COMET', description: 'Codex rises just long enough to telegraph a diagonal teal dive, trading a strong downward angle for punishable recovery.', motion: ['D', 'F'], button: 'kick' },
  ],
  FABLE: [
    { attack: 'storyarc', name: 'STORY ARC', shortName: 'STORY ARC', description: 'Fable soars into a high forward flight arc that sails over beams and projectiles, but every landing is a long, honest recovery.', motion: ['D', 'U'], button: 'punch', earlyAirStart: true },
    { attack: 'plottwist', name: 'PLOT TWIST', shortName: 'TWIST', description: 'A readable backstep feint that draws out a committed attack, then answers it with one sudden lunging strike.', motion: ['B', 'F'], button: 'kick' },
    { attack: 'inktempest', name: 'INK TEMPEST', shortName: 'TEMPEST', description: 'A close calligraphic flurry of ember-bright strokes that clips a cornered guard up to three times.', motion: ['D', 'B'], button: 'punch' },
  ],
};

export const BUTTON_KEY: Readonly<Record<AttackButton, string>> = { punch: 'W', kick: 'E' };

export function specialMovesFor(character: string): readonly SpecialMoveDefinition[] {
  return MOVE_SETS[character.toUpperCase()] ?? [];
}

export function specialMoveForAttack(character: string, attack: SpecialAttack): SpecialMoveDefinition | null {
  return specialMovesFor(character).find((move) => move.attack === attack) ?? null;
}

export function specialMoveFrames(attack: SpecialAttack): readonly string[] {
  if (attack === 'hadouken' || attack === 'shoryuken') return [attack];
  if (attack === 'electric') return ['electric_1', 'electric_2'];
  if (attack === 'hurricane') return ['hurricane_1', 'hurricane_2', 'hurricane_3', 'hurricane_4'];
  if (attack === 'rolling' || attack === 'verticalroll') return ['rolling_1', 'rolling_2', 'rolling_3', 'rolling_4'];
  if (attack === 'testimony') return ['testimony_1', 'testimony_2', 'testimony_3'];
  if (attack === 'nullstep') return ['nullstep_1', 'nullstep_2', 'nullstep_3', 'nullstep_4'];
  if (attack === 'entropy') return ['entropy_1', 'entropy_2', 'entropy_3'];
  if (attack === 'context') return ['context_1', 'context_2', 'context_3'];
  if (attack === 'branchwalk') return ['branchwalk_1', 'branchwalk_2', 'branchwalk_3'];
  if (attack === 'storyarc') return ['storyarc_1', 'storyarc_2', 'storyarc_3'];
  if (attack === 'plottwist') return ['plottwist_1', 'plottwist_2', 'plottwist_3'];
  if (attack === 'inktempest') return ['inktempest_1', 'inktempest_2', 'inktempest_3'];
  return ['mergecomet_1', 'mergecomet_2', 'mergecomet_3'];
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

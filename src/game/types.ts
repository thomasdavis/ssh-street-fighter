import type { RGB } from '../render/pixel.js';

export type Pose = 'idle' | 'walk' | 'crouch' | 'jump' | 'fall' | 'punch' | 'kick'
  | 'crouchpunch' | 'crouchkick' | 'hit' | 'ko' | 'victory' | 'block' | 'crouchblock' | 'throw' | 'thrown'
  | 'hadouken' | 'shoryuken' | 'hurricane'
  | 'electric' | 'rolling' | 'verticalroll'
  | 'testimony' | 'nullstep' | 'entropy'
  | 'context' | 'branchwalk' | 'mergecomet'
  | 'storyarc' | 'plottwist' | 'inktempest'
  | 'construct' | 'nova' | 'volley' | 'boomerang' | 'armor' | 'phase' | 'lasso' | 'reflect' | 'blink' | 'jumpkick';
export type AttackKind = 'none' | 'punch' | 'kick' | 'throw' | 'hadouken' | 'shoryuken' | 'hurricane'
  | 'electric' | 'rolling' | 'verticalroll'
  | 'testimony' | 'nullstep' | 'entropy'
  | 'context' | 'branchwalk' | 'mergecomet'
  | 'storyarc' | 'plottwist' | 'inktempest'
  | 'construct' | 'nova' | 'volley' | 'boomerang' | 'armor' | 'phase' | 'lasso' | 'reflect' | 'blink' | 'jumpkick';

export interface FighterPalette {
  skin: RGB; gi: RGB; giDark: RGB; hair: RGB; belt: RGB;
}

export interface Fighter {
  id: string;
  name: string;
  palette: FighterPalette;

  // kinematics
  x: number;          // world x of center
  y: number;          // height above ground (0 = standing); >0 airborne
  vx: number;         // horizontal velocity
  vy: number;         // vertical velocity (+ = up)
  facing: 1 | -1;

  // combat state
  hp: number;
  wins: number;
  attack: AttackKind;
  attackFrame: number;   // frames elapsed in current attack
  attackHit: boolean;    // current attack already connected
  attackCrouch: boolean; // attack was started while crouching (low attack)
  stun: number;          // hit/block stun frames remaining
  thrownT: number;       // frames remaining being thrown (tumbling to the other side)
  phaseT: number;        // intangibility frames (phase dash / nova reversal) — attacks pass through
  armorT: number;        // super-armor frames (armored strike) — hits land but never flinch
  victoryT: number;      // frames remaining celebrating a round/match win (victory pose)
  crouching: boolean;    // derived: holding down
  blocking: boolean;     // derived: holding back (away from opponent)

  // animation
  animT: number;         // free-running timer for idle/breathing
  walkPhase: number;     // advances while walking
  pose: Pose;            // derived each tick (for rendering)
}

export interface Inputs {
  moveX: number;    // -1 / 0 / 1 (held ← / →)
  down: boolean;    // held ↓ (crouch)
  jump: boolean;    // edge (↑)
  punch: boolean;   // edge (W)
  kick: boolean;    // edge (E)
  throw: boolean;   // edge (F) — close-range unblockable grab
  motion: string;   // recent directional buffer (e.g. "DR") for special moves
}

export function emptyInputs(): Inputs {
  return { moveX: 0, down: false, jump: false, punch: false, kick: false, throw: false, motion: '' };
}

export interface Projectile {
  owner: 'a' | 'b';
  x: number; y: number;   // world position (y = height above ground)
  vx: number;
  active: boolean;
  hit: boolean;           // already connected
  frame: number;          // animation timer
  facing: 1 | -1;
  style: 'blue' | 'fire' | 'sonic' | 'boomerang' | 'construct' | 'mote' | 'rope';
  life?: number;          // frames remaining (construct turret; motes)
  fireT?: number;         // construct: frames until it spits the next mote
  returning?: boolean;    // boomerang: currently arcing back to its owner
  x0?: number;            // boomerang: launch origin x (to measure how far it has flown out)
}

export type MatchPhase = 'countdown' | 'fight' | 'round-over' | 'match-over';

/** Transient impact flash at a hit's contact point (feel/juice, purely visual).
 *  `seed` is set once at spawn so the burst looks the same to both players but
 *  different from every other hit. */
export interface Spark { x: number; y: number; t: number; heavy: boolean; seed: number; }

export interface Match {
  a: Fighter;
  b: Fighter;
  phase: MatchPhase;
  phaseTimer: number;
  roundTime: number;
  round: number;
  message: string;
  frame: number;
  stage: string;          // chosen arena background id
  projectiles: Projectile[];
  hitStop: number;        // frames both fighters freeze on impact (game-feel)
  sparks: Spark[];        // impact flashes
}

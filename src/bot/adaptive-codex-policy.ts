import {
  ATTACKS,
  THROW,
  attackActive,
  specialMoveStats,
} from '../game/engine.js';
import {
  specialMoveForAttack,
  specialMoveMotionCode,
  type SpecialAttack,
} from '../game/moves.js';
import { emptyInputs, type AttackKind, type Fighter, type Inputs, type MatchPhase } from '../game/types.js';

export interface FighterObservation {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hp: number;
  wins: number;
  attack: AttackKind;
  attackFrame: number;
  stun: number;
  crouching: boolean;
  special?: boolean;
  active?: boolean;
  casting?: boolean;
}

export interface ProjectileObservation {
  owner?: 'a' | 'b';
  x: number;
  y: number;
  vx: number;
}

export interface CombatObservation {
  frame: number;
  phase: MatchPhase;
  round: number;
  roundTime: number;
  you: FighterObservation;
  opp: FighterObservation;
  projectiles: readonly ProjectileObservation[];
}

export interface AdaptivePolicyConfig {
  targetSpacing: number;
  contextClosingDistance: number;
  contextCooldown: number;
  evidenceLeadFrames: number;
  evidenceMaxDistance: number;
  branchwalkMinRecovery: number;
  pokeWhenBehind: boolean;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptivePolicyConfig = {
  // Selected for FABLE conversion on sf-5, with overall and worst-matchup
  // performance as guardrails, then confirmed on disjoint mirrored holdouts.
  targetSpacing: 34,
  contextClosingDistance: 50,
  contextCooldown: 46,
  evidenceLeadFrames: 4,
  evidenceMaxDistance: 34,
  branchwalkMinRecovery: 0,
  pokeWhenBehind: true,
};

const SPECIAL_ATTACKS = new Set<AttackKind>([
  'hadouken', 'shoryuken', 'hurricane', 'electric', 'rolling', 'verticalroll',
  'testimony', 'nullstep', 'entropy', 'context', 'branchwalk', 'mergecomet',
  'storyarc', 'plottwist', 'inktempest', 'construct', 'nova', 'volley',
  'boomerang', 'armor', 'lasso', 'phase', 'reflect', 'blink',
]);

const CONTEXT_REACTIONS = new Set<AttackKind>([
  'hadouken', 'testimony', 'rolling', 'electric', 'inktempest', 'plottwist',
]);

interface AttackPhase {
  active: boolean;
  casting: boolean;
  recovering: boolean;
  remaining: number;
}

function timing(attack: AttackKind): { startup: number; active: number; total: number } {
  if (attack === 'none') return { startup: 0, active: 0, total: 0 };
  if (attack === 'punch' || attack === 'kick') {
    const spec = ATTACKS[attack];
    return { startup: spec.startup, active: spec.active, total: spec.startup + spec.active + spec.recovery };
  }
  if (attack === 'throw') return { startup: THROW.startup, active: THROW.active, total: THROW.total };
  const stats = specialMoveStats(attack as SpecialAttack);
  return { startup: stats.startup, active: stats.active, total: stats.startup + stats.active + stats.recovery };
}

function phaseOf(fighter: FighterObservation): AttackPhase {
  if (fighter.attack === 'none') return { active: false, casting: false, recovering: false, remaining: 0 };
  const frames = timing(fighter.attack);
  const active = fighter.active ?? (
    fighter.attackFrame >= frames.startup && fighter.attackFrame < frames.startup + frames.active
  );
  const casting = fighter.casting ?? (
    SPECIAL_ATTACKS.has(fighter.attack) && fighter.attackFrame < frames.startup
  );
  return {
    active,
    casting,
    recovering: !active && !casting && fighter.attackFrame >= frames.startup + frames.active,
    remaining: Math.max(0, frames.total - fighter.attackFrame),
  };
}

function relativeSpecial(character: string, attack: AttackKind, facing: 1 | -1): Inputs | null {
  if (!SPECIAL_ATTACKS.has(attack)) return null;
  const move = specialMoveForAttack(character, attack as SpecialAttack);
  if (!move) return null;
  const input = emptyInputs();
  input.motion = specialMoveMotionCode(move, facing);
  input[move.button] = true;
  return input;
}

export function observationFromFighters(
  frame: number,
  phase: MatchPhase,
  round: number,
  roundTime: number,
  you: Fighter,
  opp: Fighter,
  projectiles: readonly ProjectileObservation[],
): CombatObservation {
  const view = (fighter: Fighter): FighterObservation => ({
    x: fighter.x,
    y: fighter.y,
    vx: fighter.vx,
    vy: fighter.vy,
    facing: fighter.facing,
    hp: fighter.hp,
    wins: fighter.wins,
    attack: fighter.attack,
    attackFrame: fighter.attackFrame,
    stun: fighter.stun,
    crouching: fighter.crouching,
    special: SPECIAL_ATTACKS.has(fighter.attack),
    active: attackActive(fighter),
    casting: SPECIAL_ATTACKS.has(fighter.attack) && fighter.attackFrame < timing(fighter.attack).startup,
  });
  return { frame, phase, round, roundTime, you: view(you), opp: view(opp), projectiles };
}

export class AdaptiveCodexPolicy {
  readonly actions = new Map<string, number>();
  private lastActionFrame = -999;
  private lastContextFrame = -999;
  private lastPokeFrame = -999;
  private lastFrame = -1;

  constructor(readonly config: AdaptivePolicyConfig = DEFAULT_ADAPTIVE_CONFIG) {}

  reset(): void {
    this.actions.clear();
    this.lastActionFrame = -999;
    this.lastContextFrame = -999;
    this.lastPokeFrame = -999;
    this.lastFrame = -1;
  }

  decide(state: CombatObservation): Inputs {
    if (state.frame < this.lastFrame) this.reset();
    this.lastFrame = state.frame;
    const input = emptyInputs();
    if (state.phase !== 'fight') return input;

    const { you, opp } = state;
    const dx = opp.x - you.x;
    const distance = Math.abs(dx);
    const toward = Math.sign(dx) || you.facing;
    const away = -toward;
    const grounded = you.y <= 0.5 && you.vy <= 0;
    const free = you.attack === 'none' && you.stun <= 0;
    const ahead = you.hp > opp.hp + 4;
    const opponentPhase = phaseOf(opp);
    const opponentClosing = Math.abs(opp.vx) > 0.2 && Math.sign(you.x - opp.x) === Math.sign(opp.vx);
    const incoming = state.projectiles.some((projectile) =>
      Math.abs(projectile.x - you.x) < 82 &&
      Math.sign(you.x - projectile.x) === Math.sign(projectile.vx)
    );
    const ready = state.frame - this.lastActionFrame > 7;

    const record = (name: string): void => {
      this.actions.set(name, (this.actions.get(name) ?? 0) + 1);
    };
    const special = (attack: AttackKind): Inputs | null => {
      const result = relativeSpecial('CODEX', attack, you.facing);
      if (!result) return null;
      this.lastActionFrame = state.frame;
      if (attack === 'context') this.lastContextFrame = state.frame;
      record(attack);
      return result;
    };

    // Weight of Evidence is a conversion, not a default landing animation. Predict
    // the opponent's short-term lane and commit only while they are already busy.
    if (you.attack === 'context' && you.vy < 0 && you.y > 14) {
      const projectedDx = dx + (opp.vx - you.vx) * this.config.evidenceLeadFrames;
      if (
        projectedDx * you.facing > 0 &&
        Math.abs(projectedDx) <= this.config.evidenceMaxDistance &&
        (opponentPhase.active || opponentPhase.recovering || opp.stun > 0)
      ) return special('mergecomet') ?? input;
    }

    if (!free) return input;

    // Block live hitboxes before selecting an offensive rollout.
    if (opponentPhase.active && distance < 68 && grounded) {
      input.moveX = away;
      record('guard');
      return input;
    }

    // React to observable commitments. Story Arc is deliberately excluded: it is
    // safer to keep the ground and punish its landing than to chase it upward.
    if (grounded && ready && (
      incoming ||
      (opp.attack === 'throw' && distance < 42) ||
      (opponentPhase.casting && CONTEXT_REACTIONS.has(opp.attack) && distance < 108) ||
      (opp.y > 22 && distance < 52 && opponentPhase.active)
    )) return special('context') ?? input;

    if (
      grounded && ready && this.config.contextClosingDistance > 0 &&
      distance < this.config.contextClosingDistance && opponentClosing &&
      opp.attack === 'none' && state.frame - this.lastContextFrame >= this.config.contextCooldown
    ) return special('context') ?? input;

    // Punish only when the chosen move can become active before recovery ends.
    if (opponentPhase.recovering && ready) {
      if (distance <= 29 && opp.y <= 3) {
        input.throw = true;
        this.lastActionFrame = state.frame;
        record('throw');
        return input;
      }
      if (distance <= 40 && opponentPhase.remaining >= ATTACKS.kick.startup) {
        input.kick = true;
        this.lastActionFrame = state.frame;
        record('kick-punish');
        return input;
      }
      if (
        this.config.branchwalkMinRecovery > 0 &&
        distance >= 42 && distance <= 72 &&
        opponentPhase.remaining >= this.config.branchwalkMinRecovery
      ) return special('branchwalk') ?? input;
      if (distance < 72) {
        input.moveX = toward;
        return input;
      }
    }

    // At point blank, throw is the shortest honest answer to passive guard. If the
    // opponent attacks, the active-phase branch above changes this into defense.
    if (distance <= 28 && opp.y <= 3 && ready) {
      input.throw = true;
      this.lastActionFrame = state.frame;
      record('throw');
      return input;
    }

    // A bounded poke prevents a losing policy from retreating forever, while a
    // life lead keeps the controller from donating recovery frames.
    if (
      this.config.pokeWhenBehind && !ahead && !opponentClosing &&
      distance >= 29 && distance <= 39 && state.frame - this.lastPokeFrame >= 24
    ) {
      input.kick = true;
      this.lastPokeFrame = state.frame;
      this.lastActionFrame = state.frame;
      record('kick-poke');
      return input;
    }

    const low = this.config.targetSpacing - 4;
    const high = this.config.targetSpacing + 4;
    if (distance < low || (ahead && distance < high + 12)) input.moveX = away;
    else if (distance > high) input.moveX = toward;
    return input;
  }
}

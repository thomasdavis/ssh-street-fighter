// Runtime-only frozen packaging for the independently selected legacy policy.
// This module is self-contained: it imports no opponent generator, search,
// evaluator, observed-seed, or historical development module.
import type { Inputs } from '../game/types.js';
import { specialMoveStats } from '../game/engine.js';
import {
  APPROVED_THRESHOLD_CONFIG, distance, hashConfig, incomingProjectile,
  move, mulberry32, neutral, special, toward, type PolicyContext,
} from './xenon-matchup.js';
import { FROZEN_LEGACY_RUNTIME_SOURCE_HASH } from './xenon-legacy-runtime-provenance.js';

export const LEGACY_CHARACTERS = [
  'BYU', 'MEN', 'BLANKO', 'CHONG', 'GYLE', 'ZANG',
  'DHAL', 'HONDO', 'KIRA', 'MAKO', 'CODEX',
] as const;
export type LegacyCharacter = typeof LEGACY_CHARACTERS[number];

export interface LegacyConditionProfile {
  antiAirRisk: number;
  phaseBias: number;
  preferredSpacing: number;
}

export const LEGACY_CONDITION_PROFILES: Readonly<Record<LegacyCharacter, LegacyConditionProfile>> = {
  BYU: { antiAirRisk: 1, phaseBias: 2, preferredSpacing: 58 },
  MEN: { antiAirRisk: 1, phaseBias: 1, preferredSpacing: 48 },
  BLANKO: { antiAirRisk: 1, phaseBias: -2, preferredSpacing: 52 },
  CHONG: { antiAirRisk: 0, phaseBias: 0, preferredSpacing: 44 },
  GYLE: { antiAirRisk: 1, phaseBias: 3, preferredSpacing: 70 },
  ZANG: { antiAirRisk: 0, phaseBias: -4, preferredSpacing: 54 },
  DHAL: { antiAirRisk: 0, phaseBias: 4, preferredSpacing: 76 },
  HONDO: { antiAirRisk: 1, phaseBias: -2, preferredSpacing: 52 },
  KIRA: { antiAirRisk: 1, phaseBias: 3, preferredSpacing: 68 },
  MAKO: { antiAirRisk: 0, phaseBias: -1, preferredSpacing: 48 },
  CODEX: { antiAirRisk: 0, phaseBias: 2, preferredSpacing: 66 },
};

export interface LegacyConditionedConfig {
  phaseBandMin: number;
  phaseBandMax: number;
  landingLeadFrames: number;
  antiAirAvoidDistance: number;
  threatPhaseDistance: number;
  latencyReachPerFrame: number;
  gylePhaseRetreatFrames: number;
  gylePhaseRetreatDistance: number;
  gyleElectricAvoidDistance: number;
}

export interface LegacyActuationPolicyState {
  confirmedPhaseAgeFrames: number | null;
}

export const FROZEN_LEGACY_CONDITIONED_CONFIG: Readonly<LegacyConditionedConfig> = {
  phaseBandMin: 56,
  phaseBandMax: 84,
  landingLeadFrames: 4,
  antiAirAvoidDistance: 62,
  threatPhaseDistance: 68,
  latencyReachPerFrame: 2,
  gylePhaseRetreatFrames: 54,
  gylePhaseRetreatDistance: 64,
  gyleElectricAvoidDistance: 44,
};

export const FROZEN_LEGACY_CONDITIONED_CONFIG_HASH =
  '242127c0a28e761f5b4867425db13cc385b2ae57cfab808cdb6b29ae331321d2';
export const FROZEN_LEGACY_POLICY_ID = 'xenon-legacy-conditioned-83xxx-v6';
export const FROZEN_LEGACY_POLICY_VERSION = 'xenon-legacy-conditioned/v1';
export const FROZEN_LEGACY_POLICY_HASH = hashConfig({
  version: FROZEN_LEGACY_POLICY_VERSION,
  policyId: FROZEN_LEGACY_POLICY_ID,
  configHash: FROZEN_LEGACY_CONDITIONED_CONFIG_HASH,
});

if (hashConfig(FROZEN_LEGACY_CONDITIONED_CONFIG) !== FROZEN_LEGACY_CONDITIONED_CONFIG_HASH)
  throw new Error('frozen legacy runtime config hash drifted');

function willLandWithin(context: PolicyContext, frames: number): boolean {
  if (context.self.y <= 3) return true;
  let y = context.self.y;
  let vy = context.self.vy;
  for (let frame = 0; frame < frames; frame++) {
    y += vy;
    vy -= 0.62;
    if (y <= 0) return true;
  }
  return false;
}

export function frozenLegacyRuntimeDecision(
  context: PolicyContext,
  targetDelay: number,
  character: LegacyCharacter,
  random: () => number,
  actuation: LegacyActuationPolicyState = { confirmedPhaseAgeFrames: null },
): Inputs {
  const config = FROZEN_LEGACY_CONDITIONED_CONFIG;
  const profile = LEGACY_CONDITION_PROFILES[character];
  if (!profile) throw new Error(`missing explicit legacy condition for ${character}`);
  if (context.phase !== 'fight' || context.self.stun > 0 || context.self.attack !== 'none') return neutral();
  const dist = distance(context);
  const dir = toward(context);
  const away = -dir as 1 | -1;
  const opponentCommitted = context.opponent.attack !== 'none';
  const opponentAntiAirVisible = (context.opponent.y <= 3 && opponentCommitted)
    || context.opponent.attack === 'shoryuken' || context.opponent.attack === 'verticalroll';

  if (context.self.y > 0 || context.self.vy !== 0) {
    const landingSoon = willLandWithin(context, targetDelay + config.landingLeadFrames);
    const danger = opponentAntiAirVisible
      && dist <= config.antiAirAvoidDistance + profile.antiAirRisk * 6;
    if (danger || landingSoon) return move(away, { down: landingSoon });
    return move(dist > profile.preferredSpacing ? dir : away);
  }

  if (incomingProjectile(context, APPROVED_THRESHOLD_CONFIG.projectileReflectDistance))
    return special('XENON', 'reflect', context.self.facing);

  if (character === 'GYLE') {
    const electric = specialMoveStats('electric');
    const projectedAttackFrame = context.opponent.attackFrame + targetDelay;
    const electricThreat = context.opponent.attack === 'electric'
      && projectedAttackFrame < electric.startup + electric.active
      && dist <= config.gyleElectricAvoidDistance + targetDelay * config.latencyReachPerFrame;
    const postPhaseRetreat = targetDelay > 0 && actuation.confirmedPhaseAgeFrames !== null
      && actuation.confirmedPhaseAgeFrames < config.gylePhaseRetreatFrames
      && dist <= config.gylePhaseRetreatDistance + targetDelay * config.latencyReachPerFrame;
    if (electricThreat || postPhaseRetreat) return move(away);
  }

  const latencyReach = targetDelay * config.latencyReachPerFrame;
  if (opponentCommitted && context.opponent.attackFrame <= 8
      && dist <= config.threatPhaseDistance + latencyReach)
    return special('XENON', 'phase', context.self.facing);

  if (opponentAntiAirVisible && dist <= config.antiAirAvoidDistance + latencyReach)
    return move(away, { down: true });

  const phaseMin = config.phaseBandMin + profile.phaseBias;
  const phaseMax = config.phaseBandMax + profile.phaseBias + latencyReach;
  if (dist >= phaseMin && dist <= phaseMax)
    return special('XENON', 'phase', context.self.facing);
  if (dist > phaseMax) return special('XENON', 'blink', context.self.facing);
  if (character === 'ZANG' && dist <= 50) return move(away);
  if (dist <= 27) return random() < APPROVED_THRESHOLD_CONFIG.closeThrowChance
    ? move(0, { throw: true }) : move(0, { kick: true });
  if (dist <= 44) return move(0, { kick: true });
  if (opponentCommitted && dist < 56) return move(away, { down: true });
  return dist > profile.preferredSpacing ? move(dir) : move(away, { down: dist < profile.preferredSpacing - 8 });
}

export interface FrozenLegacyRuntimePolicy {
  readonly policyId: typeof FROZEN_LEGACY_POLICY_ID;
  readonly policyHash: string;
  readonly configHash: string;
  readonly sourceHash: string;
  readonly config: Readonly<LegacyConditionedConfig>;
  decide(context: PolicyContext, actuation?: LegacyActuationPolicyState): Inputs;
}

export function createFrozenLegacyRuntimePolicy(options: {
  character: LegacyCharacter;
  actionDelay: number;
  targetSeed: number;
}): FrozenLegacyRuntimePolicy {
  if (!(LEGACY_CHARACTERS as readonly string[]).includes(options.character))
    throw new Error(`missing explicit legacy opponent condition for ${options.character}`);
  if (!Number.isInteger(options.actionDelay) || options.actionDelay < 0 || options.actionDelay > 30)
    throw new Error('actionDelay must be an integer from 0 to 30');
  if (!Number.isInteger(options.targetSeed)) throw new Error('targetSeed must be an integer');
  const random = mulberry32(options.targetSeed);
  return {
    policyId: FROZEN_LEGACY_POLICY_ID,
    policyHash: FROZEN_LEGACY_POLICY_HASH,
    configHash: FROZEN_LEGACY_CONDITIONED_CONFIG_HASH,
    sourceHash: FROZEN_LEGACY_RUNTIME_SOURCE_HASH,
    config: FROZEN_LEGACY_CONDITIONED_CONFIG,
    decide(context, actuation = { confirmedPhaseAgeFrames: null }) {
      return frozenLegacyRuntimeDecision(context, options.actionDelay, options.character, random, actuation);
    },
  };
}

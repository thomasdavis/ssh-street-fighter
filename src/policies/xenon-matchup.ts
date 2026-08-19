// Import-safe, pure frozen XENON matchup policy shared by the offline lab and
// the bounded live runner. It consumes only fields present on the deployed bot
// wire and has no networking, filesystem, clock, or engine-state dependencies.
import { createHash } from 'node:crypto';
import { emptyInputs, type AttackKind, type Inputs, type MatchPhase, type Projectile } from '../game/types.js';
import { specialMoveForAttack, specialMoveMotionCode } from '../game/moves.js';
import type { SpecialAttack } from '../game/moves.js';

export type Side = 'a' | 'b';
export const MATCHUP_OPPONENTS = ['OMEGA', 'MNEME', 'AJAX', 'FABLE'] as const;
export type OpponentName = typeof MATCHUP_OPPONENTS[number];

export interface WireFighterObservation {
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
}

export interface WireProjectileObservation {
  owner: Side;
  x: number;
  y: number;
  vx: number;
  style: Projectile['style'];
}

export interface RelativeProjectileObservation extends Omit<WireProjectileObservation, 'owner'> {
  owner: 'self' | 'opponent';
}

export interface PolicyContext {
  self: WireFighterObservation;
  opponent: WireFighterObservation;
  projectiles: RelativeProjectileObservation[];
  phase: MatchPhase;
  frame: number;
  side: Side;
}

export interface XenonConfig {
  projectileReflectDistance: number;
  phaseThreatDistance: number;
  phaseNeutralDistance: number;
  blinkDistance: number;
  closeThrowChance: number;
  jumpKickChance: number;
}

export interface LatencyXenonConfig {
  positionLeadFrames: number;
  projectileLeadFrames: number;
  projectileReactionPadding: number;
  attackCommitUntilFrame: number;
  closingCommitment: 'phase' | 'guard';
}

export interface MatchupXenonConfig {
  opponentConditions: {
    OMEGA: 'approved-threshold-fallback';
    AJAX: 'approved-threshold-fallback';
    FABLE: 'early-phase-envelope-v1';
    MNEME: 'spacing-phase-v1';
  };
  fablePhaseDistance: number;
  fableLatencyReachPerFrame: number;
  mnemePhaseDistance: number;
  mnemeMinSpacing: number;
  mnemeCommitUntilFrame: number;
}

export type LatencyFighterObservation = Pick<WireFighterObservation,
  'x' | 'y' | 'vx' | 'facing' | 'attack' | 'attackFrame' | 'stun'>;
export type LatencyProjectileObservation = Pick<RelativeProjectileObservation, 'owner' | 'x' | 'y' | 'vx' | 'style'>;
export interface LatencyPolicyContext {
  self: LatencyFighterObservation;
  opponent: LatencyFighterObservation;
  projectiles: LatencyProjectileObservation[];
  phase: MatchPhase;
}

export interface LatencyFeatures {
  executionHorizon: number;
  projectileHorizon: number;
  currentDistance: number;
  futureDistance: number;
  selfFutureX: number;
  opponentFutureX: number;
  predictedAttackFrame: number | null;
  projectileArrivalFrames: number | null;
  projectileThreat: boolean;
  closing: boolean;
}

export const APPROVED_THRESHOLD_CONFIG: XenonConfig = {
  projectileReflectDistance: 68,
  phaseThreatDistance: 68,
  phaseNeutralDistance: 76,
  blinkDistance: 72,
  closeThrowChance: 0.5,
  jumpKickChance: 0.12,
};

export const MATCHUP_CONDITIONS: MatchupXenonConfig['opponentConditions'] = {
  OMEGA: 'approved-threshold-fallback', AJAX: 'approved-threshold-fallback',
  FABLE: 'early-phase-envelope-v1', MNEME: 'spacing-phase-v1',
};

const MATCHUP_PREDICTION: LatencyXenonConfig = {
  positionLeadFrames: 0, projectileLeadFrames: 0, projectileReactionPadding: 0,
  attackCommitUntilFrame: 18, closingCommitment: 'guard',
};

export const FROZEN_XENON_POLICY_ID = 'xenon-matchup-search-064';
export const FROZEN_XENON_POLICY_VERSION = 'xenon-matchup-policy/v1';
export const APPROVED_CROSS_POLICY_SOURCE_HASH = '0ca16d112b292090e19d5606b47aa612a961862b6175fd5833c727690c80bc79';
export const FROZEN_XENON_MATCHUP_CONFIG: MatchupXenonConfig = {
  opponentConditions: { ...MATCHUP_CONDITIONS },
  fablePhaseDistance: 76,
  fableLatencyReachPerFrame: 3,
  mnemePhaseDistance: 76,
  mnemeMinSpacing: 42,
  mnemeCommitUntilFrame: 12,
};

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashConfig(config: object): string {
  return sha256(stable(config));
}

export const FROZEN_XENON_CONFIG_HASH = hashConfig(FROZEN_XENON_MATCHUP_CONFIG);
export function matchupPolicyHash(policyId: string, config: MatchupXenonConfig): string {
  return sha256(stable({
    version: FROZEN_XENON_POLICY_VERSION,
    policyId,
    configHash: hashConfig(config),
  }));
}
export const FROZEN_XENON_POLICY_HASH = matchupPolicyHash(FROZEN_XENON_POLICY_ID, FROZEN_XENON_MATCHUP_CONFIG);

export function matchupLaunchHash(configHash: string, configuredOpponent: OpponentName): string {
  return hashConfig({ policyConfigHash: configHash, configuredOpponent });
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adapt the deployed bot payload to a seat-relative policy context. */
export function adaptBotWireContext(
  you: WireFighterObservation,
  opponent: WireFighterObservation,
  projectiles: readonly WireProjectileObservation[],
  phase: MatchPhase,
  frame: number,
  side: Side,
): PolicyContext {
  return {
    self: { ...you }, opponent: { ...opponent }, phase, frame, side,
    projectiles: projectiles.map((projectile) => ({
      ...projectile, owner: projectile.owner === side ? 'self' : 'opponent',
    })),
  };
}

export function neutral(): Inputs {
  return emptyInputs();
}

export function move(moveX = 0, extras: Partial<Inputs> = {}): Inputs {
  return { ...emptyInputs(), moveX, ...extras };
}

export function special(character: string, attack: SpecialAttack, facing: 1 | -1): Inputs {
  const definition = specialMoveForAttack(character, attack);
  if (!definition) throw new Error(`${character} has no canonical ${attack} move`);
  return {
    ...emptyInputs(),
    motion: specialMoveMotionCode(definition, facing),
    punch: definition.button === 'punch',
    kick: definition.button === 'kick',
  };
}

export function distance(context: PolicyContext): number {
  return Math.abs(context.opponent.x - context.self.x);
}

export function toward(context: PolicyContext): 1 | -1 {
  return context.opponent.x >= context.self.x ? 1 : -1;
}

export function incomingProjectile(context: PolicyContext, maximumDistance: number): boolean {
  return context.projectiles.some((projectile) => {
    if (projectile.owner !== 'opponent' || projectile.style === 'construct' || projectile.style === 'rope') return false;
    const delta = context.self.x - projectile.x;
    return Math.abs(delta) <= maximumDistance && Math.sign(delta) === Math.sign(projectile.vx);
  });
}

export function canAct(context: PolicyContext): boolean {
  return context.phase === 'fight' && context.self.stun <= 0 && context.self.attack === 'none';
}

export function thresholdXenonDecision(context: PolicyContext, config: XenonConfig, random: () => number): Inputs {
  if (!canAct(context)) return neutral();
  const dist = distance(context);
  const dir = toward(context);
  const away = -dir;
  const opponentCommitted = context.opponent.attack !== 'none';

  if (incomingProjectile(context, config.projectileReflectDistance))
    return special('XENON', 'reflect', context.self.facing);
  if (opponentCommitted && context.opponent.attackFrame <= 8 && dist <= config.phaseThreatDistance)
    return special('XENON', 'phase', context.self.facing);
  if (context.self.y > 3) return dist <= 48 ? move(dir, { kick: true }) : move(dir);
  if (dist >= config.blinkDistance) return special('XENON', 'blink', context.self.facing);
  if (dist >= config.phaseNeutralDistance) return special('XENON', 'phase', context.self.facing);
  if (dist <= 27) return random() < config.closeThrowChance ? move(0, { throw: true }) : move(0, { kick: true });
  if (dist <= 44) return move(0, { kick: true });
  if (random() < config.jumpKickChance) return move(dir, { jump: true });
  if (opponentCommitted && dist < 56) return move(away, { down: true });
  return move(dir);
}

const boundedHorizon = (frames: number): number => Math.max(0, Math.min(12, frames));
const predictX = (fighter: LatencyFighterObservation, frames: number): number =>
  fighter.x + Math.max(-8, Math.min(8, fighter.vx)) * frames;

/** Short-horizon projection using only fields emitted by the live protocol. */
export function predictLatencyFeatures(
  context: LatencyPolicyContext,
  targetActionDelay: number,
  config: LatencyXenonConfig,
): LatencyFeatures {
  const executionHorizon = targetActionDelay === 0 ? 0 : boundedHorizon(targetActionDelay + config.positionLeadFrames);
  const projectileHorizon = targetActionDelay === 0 ? 0 : boundedHorizon(targetActionDelay + config.projectileLeadFrames);
  const selfFutureX = predictX(context.self, executionHorizon);
  const opponentFutureX = predictX(context.opponent, executionHorizon);
  const currentDistance = Math.abs(context.opponent.x - context.self.x);
  const futureDistance = Math.abs(opponentFutureX - selfFutureX);
  const predictedAttackFrame = context.opponent.attack === 'none'
    ? null
    : context.opponent.attackFrame + executionHorizon;
  let projectileArrivalFrames: number | null = null;
  for (const projectile of context.projectiles) {
    if (projectile.owner !== 'opponent' || projectile.style === 'construct' || projectile.style === 'rope') continue;
    const relativeVelocity = projectile.vx - context.self.vx;
    if (Math.abs(relativeVelocity) < 1e-9) continue;
    const arrival = (context.self.x - projectile.x) / relativeVelocity;
    if (arrival >= 0 && (projectileArrivalFrames === null || arrival < projectileArrivalFrames)) projectileArrivalFrames = arrival;
  }
  const projectileThreat = projectileArrivalFrames !== null
    && projectileArrivalFrames <= projectileHorizon + config.projectileReactionPadding;
  return {
    executionHorizon, projectileHorizon, currentDistance, futureDistance,
    selfFutureX, opponentFutureX, predictedAttackFrame, projectileArrivalFrames, projectileThreat,
    closing: futureDistance < currentDistance,
  };
}

export function validateOpponentCondition(
  configuredOpponent: OpponentName | undefined,
  actualOpponent: OpponentName | undefined,
): asserts configuredOpponent is OpponentName {
  if (!configuredOpponent || !MATCHUP_OPPONENTS.includes(configuredOpponent))
    throw new Error('matchup-aware XENON requires an explicit supported opponent character at launch');
  if (!actualOpponent || configuredOpponent !== actualOpponent)
    throw new Error(`matchup-aware opponent condition mismatch: configured=${configuredOpponent}, actual=${actualOpponent ?? 'missing'}`);
}

export function matchupXenonDecision(
  context: LatencyPolicyContext,
  targetActionDelay: number,
  config: MatchupXenonConfig,
  configuredOpponent: OpponentName | undefined,
  actualOpponent: OpponentName | undefined,
  random: () => number,
): Inputs {
  validateOpponentCondition(configuredOpponent, actualOpponent);
  if (config.opponentConditions[configuredOpponent] !== MATCHUP_CONDITIONS[configuredOpponent])
    throw new Error(`invalid matchup rule for ${configuredOpponent}`);
  if (configuredOpponent === 'OMEGA' || configuredOpponent === 'AJAX')
    return thresholdXenonDecision(context as PolicyContext, APPROVED_THRESHOLD_CONFIG, random);
  if (context.phase !== 'fight' || context.self.stun > 0 || context.self.attack !== 'none') return neutral();

  const predicted = predictLatencyFeatures(context, targetActionDelay, MATCHUP_PREDICTION);
  const dir: 1 | -1 = predicted.opponentFutureX >= predicted.selfFutureX ? 1 : -1;
  const away = -dir;
  const facing: 1 | -1 = dir;

  if (context.self.y > 3) return predicted.futureDistance <= 48 ? move(dir, { kick: true }) : move(dir);

  if (configuredOpponent === 'FABLE') {
    const reachableEnvelope = config.fablePhaseDistance
      + targetActionDelay * config.fableLatencyReachPerFrame;
    if (Math.min(predicted.currentDistance, predicted.futureDistance) <= reachableEnvelope)
      return special('XENON', 'phase', facing);
    return thresholdXenonDecision(context as PolicyContext, APPROVED_THRESHOLD_CONFIG, random);
  }

  if (context.opponent.attack === 'nova') return move(away, { down: true });
  const mnemeProjectile = context.projectiles.some((projectile) =>
    projectile.owner === 'opponent'
      && (projectile.style === 'construct' || projectile.style === 'mote'));
  const mnemeCast = context.opponent.attack === 'construct' || context.opponent.attack === 'volley';
  const earlyCommitment = context.opponent.attack !== 'none'
    && predicted.predictedAttackFrame !== null
    && predicted.predictedAttackFrame <= config.mnemeCommitUntilFrame;
  if ((mnemeProjectile || mnemeCast || earlyCommitment)
      && Math.min(predicted.currentDistance, predicted.futureDistance) <= config.mnemePhaseDistance)
    return special('XENON', 'phase', facing);
  if (predicted.futureDistance <= 32) return move(0, { kick: true });
  if (predicted.futureDistance < config.mnemeMinSpacing) return move(away, { down: true });
  if (predicted.futureDistance > config.mnemeMinSpacing + 16) return move(dir);
  return neutral();
}

export interface FrozenMatchupPolicy {
  readonly policyId: typeof FROZEN_XENON_POLICY_ID;
  readonly policyHash: string;
  readonly configHash: string;
  readonly launchHash: string;
  decide(context: PolicyContext): Inputs;
}

export function createFrozenXenonMatchupPolicy(options: {
  configuredOpponent: OpponentName;
  actualOpponent: OpponentName;
  actionDelay: number;
  seed: number;
}): FrozenMatchupPolicy {
  validateOpponentCondition(options.configuredOpponent, options.actualOpponent);
  if (!Number.isInteger(options.actionDelay) || options.actionDelay < 0 || options.actionDelay > 30)
    throw new Error('actionDelay must be an integer from 0 to 30');
  if (!Number.isInteger(options.seed)) throw new Error('policy seed must be an integer');
  const random = mulberry32(options.seed);
  return {
    policyId: FROZEN_XENON_POLICY_ID,
    policyHash: FROZEN_XENON_POLICY_HASH,
    configHash: FROZEN_XENON_CONFIG_HASH,
    launchHash: matchupLaunchHash(FROZEN_XENON_CONFIG_HASH, options.configuredOpponent),
    decide(context) {
      return matchupXenonDecision(
        context, options.actionDelay, FROZEN_XENON_MATCHUP_CONFIG,
        options.configuredOpponent, options.actualOpponent, random,
      );
    },
  };
}

if (FROZEN_XENON_CONFIG_HASH !== '13d8f026905089e5645323d5cee1cca9c57fdcd1baab52f882f35b0ac4e68dfe')
  throw new Error(`frozen XENON config hash drifted: ${FROZEN_XENON_CONFIG_HASH}`);

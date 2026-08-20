// Pure, import-safe dispatch for the bounded XENON runner. The opponent and
// profile are explicit launch inputs; there is no runtime search or inference.
import type { Inputs } from '../game/types.js';
import {
  createFrozenLegacyRuntimePolicy,
  FROZEN_LEGACY_CONDITIONED_CONFIG_HASH,
  LEGACY_CHARACTERS, type LegacyActuationPolicyState, type LegacyCharacter,
} from './xenon-legacy-runtime.js';
import { FROZEN_LEGACY_RUNTIME_SOURCE_HASH } from './xenon-legacy-runtime-provenance.js';
import {
  APPROVED_CROSS_POLICY_SOURCE_HASH,
  createFrozenXenonMatchupPolicy,
  FROZEN_XENON_CONFIG_HASH,
  FROZEN_XENON_MATCHUP_CONFIG,
  FROZEN_XENON_POLICY_ID,
  hashConfig,
  MATCHUP_OPPONENTS,
  matchupLaunchHash,
  type OpponentName,
  type PolicyContext,
} from './xenon-matchup.js';
import type { ActuationSafetyProfile } from './xenon-actuation.js';

export const UNIVERSAL_OPPONENTS = [...LEGACY_CHARACTERS, ...MATCHUP_OPPONENTS] as const;
export type UniversalOpponent = typeof UNIVERSAL_OPPONENTS[number];
export type UniversalPolicyProfile = 'new-wave' | 'legacy';

export { FROZEN_LEGACY_POLICY_HASH, FROZEN_LEGACY_POLICY_ID } from './xenon-legacy-runtime.js';
export { FROZEN_LEGACY_RUNTIME_SOURCE_HASH as FROZEN_LEGACY_POLICY_SOURCE_HASH } from './xenon-legacy-runtime-provenance.js';

export interface UniversalPolicyOptions {
  configuredOpponent: UniversalOpponent;
  actualOpponent: UniversalOpponent;
  profile: UniversalPolicyProfile;
  actionDelay: number;
  observationAgeFrames?: number;
  targetSeed: number;
}

export interface UniversalPolicyBinding {
  readonly profile: UniversalPolicyProfile;
  readonly configuredOpponent: UniversalOpponent;
  readonly actualOpponent: UniversalOpponent;
  readonly actionDelay: number;
  readonly observationAgeFrames: number;
  readonly targetSeed: number;
  readonly actuatorProfile: ActuationSafetyProfile;
  readonly policyId: string;
  readonly policyHash: string;
  readonly configHash: string;
  readonly sourceHash: string;
  readonly delegateLaunchHash: string;
  readonly launchHash: string;
  readonly config: object;
  decide(context: PolicyContext, actuation?: LegacyActuationPolicyState): Inputs;
}

export function expectedProfile(opponent: UniversalOpponent): UniversalPolicyProfile {
  return (MATCHUP_OPPONENTS as readonly string[]).includes(opponent) ? 'new-wave' : 'legacy';
}

export function isUniversalOpponent(value: string): value is UniversalOpponent {
  return (UNIVERSAL_OPPONENTS as readonly string[]).includes(value);
}

export function universalLaunchHash(fields: {
  profile: UniversalPolicyProfile;
  configuredOpponent: UniversalOpponent;
  actualOpponent: UniversalOpponent;
  actionDelay: number;
  observationAgeFrames: number;
  targetSeed: number;
  policyHash: string;
  configHash: string;
  sourceHash: string;
  delegateLaunchHash: string;
}): string {
  return hashConfig({ schema: 'xenon-universal-launch/v1', ...fields });
}

function validateOptions(options: UniversalPolicyOptions): void {
  if (!isUniversalOpponent(options.configuredOpponent) || !isUniversalOpponent(options.actualOpponent))
    throw new Error('configured and actual opponent must be exact pinned non-XENON characters');
  if (options.configuredOpponent !== options.actualOpponent)
    throw new Error(`configured opponent ${options.configuredOpponent} does not match actual ${options.actualOpponent}`);
  const expected = expectedProfile(options.configuredOpponent);
  if (options.profile !== expected)
    throw new Error(`${options.configuredOpponent} requires exact ${expected} profile`);
  if (!Number.isInteger(options.actionDelay) || options.actionDelay < 0 || options.actionDelay > 30)
    throw new Error('actionDelay must be an integer from 0 to 30');
  const observationAge = options.observationAgeFrames ?? 0;
  if (!Number.isInteger(observationAge) || observationAge < 0 || observationAge > 30)
    throw new Error('observationAgeFrames must be an integer from 0 to 30');
  if (!Number.isInteger(options.targetSeed)) throw new Error('targetSeed must be an integer');
}

export function createUniversalXenonPolicy(options: UniversalPolicyOptions): UniversalPolicyBinding {
  validateOptions(options);
  const observationAgeFrames = options.observationAgeFrames ?? 0;
  if (options.profile === 'new-wave') {
    const opponent = options.configuredOpponent as OpponentName;
    const delegate = createFrozenXenonMatchupPolicy({
      configuredOpponent: opponent,
      actualOpponent: options.actualOpponent as OpponentName,
      actionDelay: options.actionDelay,
      seed: options.targetSeed,
    });
    const fields = {
      profile: options.profile,
      configuredOpponent: options.configuredOpponent,
      actualOpponent: options.actualOpponent,
      actionDelay: options.actionDelay,
      observationAgeFrames,
      targetSeed: options.targetSeed,
      policyHash: delegate.policyHash,
      configHash: delegate.configHash,
      sourceHash: APPROVED_CROSS_POLICY_SOURCE_HASH,
      delegateLaunchHash: delegate.launchHash,
    } as const;
    if (delegate.configHash !== FROZEN_XENON_CONFIG_HASH
        || delegate.launchHash !== matchupLaunchHash(FROZEN_XENON_CONFIG_HASH, opponent))
      throw new Error('new-wave frozen delegate hash drifted');
    return {
      ...fields,
      actuatorProfile: 'frozen',
      policyId: FROZEN_XENON_POLICY_ID,
      launchHash: universalLaunchHash(fields),
      config: FROZEN_XENON_MATCHUP_CONFIG,
      decide: (context) => delegate.decide(context),
    };
  }

  const character = options.configuredOpponent as LegacyCharacter;
  if (!(LEGACY_CHARACTERS as readonly string[]).includes(character))
    throw new Error(`missing explicit legacy opponent condition for ${character}`);
  const delegate = createFrozenLegacyRuntimePolicy({
    character, actionDelay: options.actionDelay, targetSeed: options.targetSeed,
  });
  const delegateLaunchHash = hashConfig({
    policyConfigHash: FROZEN_LEGACY_CONDITIONED_CONFIG_HASH,
    configuredOpponent: character,
  });
  const fields = {
    profile: options.profile,
    configuredOpponent: options.configuredOpponent,
    actualOpponent: options.actualOpponent,
    actionDelay: options.actionDelay,
    observationAgeFrames,
    targetSeed: options.targetSeed,
    policyHash: delegate.policyHash,
    configHash: delegate.configHash,
    sourceHash: FROZEN_LEGACY_RUNTIME_SOURCE_HASH,
    delegateLaunchHash,
  } as const;
  return {
    ...fields,
    actuatorProfile: 'legacy-delay',
    policyId: delegate.policyId,
    launchHash: universalLaunchHash(fields),
    config: delegate.config,
    decide: (context, actuation) => delegate.decide(context, actuation),
  };
}

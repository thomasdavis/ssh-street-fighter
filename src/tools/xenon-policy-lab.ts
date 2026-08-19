// Offline-only policy search/evaluation for XENON. This drives the exact game
// engine directly: it never imports networking, matchmaking, database, or live
// bot-server code.
//
// The lab deliberately observes raw `attack` + `attackFrame`. Convenience
// `special`/`active`/`casting` flags have drifted from the canonical move table
// before and are not part of this experiment's evidence.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { makeFighter, makeMatch, stepMatch, TICK_HZ } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';
import type { AttackKind, Fighter, Inputs, Match, MatchPhase, Projectile } from '../game/types.js';
import { specialMoveForAttack, specialMoveMotionCode } from '../game/moves.js';
import type { SpecialAttack } from '../game/moves.js';
import { ENGINE_VERSION } from '../telemetry/recorder.js';

export const ENGINE_COMMIT = '991acfe56ed096775dca728e2382fe56158d0a79';
export const LAB_SCHEMA = 'xenon-policy-lab/v1';
export const EXPECTED_MECHANICS_HASH = 'fdabc4c313f571c022c2d377dff123bb4ffa74ed334610faa6a6c70c74d5eea4';
const EXPECTED_ENGINE_VERSION = 'sf-6';
const MECHANICS_FILES = ['game/engine.ts', 'game/moves.ts', 'game/types.ts'] as const;
const POLICY_SOURCE_VERSION = 'xenon-policy-lab-policies/v1';
const DEFAULT_TRAIN_SEEDS = [101, 211, 307];
const DEFAULT_HELD_OUT_SEEDS = [401, 503, 607];
const DEFAULT_DELAY_SCENARIOS: DelayScenario[] = [
  { targetDelay: 0, opponentDelay: 0 }, { targetDelay: 2, opponentDelay: 0 },
  { targetDelay: 5, opponentDelay: 0 }, { targetDelay: 0, opponentDelay: 2 },
  { targetDelay: 2, opponentDelay: 2 }, { targetDelay: 5, opponentDelay: 2 },
];
const DEFAULT_OPPONENTS = ['OMEGA', 'MNEME', 'AJAX', 'FABLE'] as const;
// Three full 60-second rounds plus countdown/inter-round ceremony fit below this
// cap. Reaching it is an error, never a draw silently folded into evaluation.
const MAX_MATCH_FRAMES = TICK_HZ * 210;

type Side = 'a' | 'b';
type Split = 'train' | 'held-out';
type Outcome = 'win' | 'loss';
type OpponentName = typeof DEFAULT_OPPONENTS[number];

export interface DelayScenario { targetDelay: number; opponentDelay: number; }

export interface RawFighterObservation {
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
  blocking: boolean;
  crouching: boolean;
  phaseT: number;
  armorT: number;
}

export interface ProjectileObservation {
  owner: 'self' | 'opponent';
  x: number;
  y: number;
  vx: number;
  style: Projectile['style'];
  frame: number;
  returning: boolean;
}

interface PolicyContext {
  self: RawFighterObservation;
  opponent: RawFighterObservation;
  projectiles: ProjectileObservation[];
  phase: MatchPhase;
  frame: number;
  side: Side;
}

interface PolicyInstance {
  decide(context: PolicyContext): Inputs;
}

interface PolicyDefinition {
  id: string;
  character: string;
  family: string;
  config: object;
  sourceHash: string;
  configHash: string;
  create(seed: number): PolicyInstance;
}

export interface XenonConfig {
  projectileReflectDistance: number;
  phaseThreatDistance: number;
  phaseNeutralDistance: number;
  blinkDistance: number;
  closeThrowChance: number;
  jumpKickChance: number;
}

export interface RoundTerminal {
  round: number;
  reason: 'ko' | 'time' | 'double-ko';
  winner: Side | 'draw';
}

export interface MatchResult {
  id: string;
  split: Split;
  scenarioSeed: number;
  streamRootSeed: number;
  matchSeed: number;
  targetPolicySeed: number;
  opponentPolicySeed: number;
  executorSide: Side;
  executor: 'XENON';
  opponent: OpponentName;
  opponentPolicy: string;
  opponentFamily: string;
  opponentConfigHash: string;
  targetPolicy: string;
  targetConfigHash: string;
  delayScenario: DelayScenario;
  seatDelays: { a: number; b: number };
  stage: string;
  frames: number;
  rounds: { executor: number; opponent: number };
  winner: 'executor' | 'opponent';
  outcome: Outcome;
  terminal: 'ko' | 'time' | 'double-ko' | 'frame-cap';
  koTerminal: boolean;
  cleanKoWin: boolean;
  roundTerminals: RoundTerminal[];
}

export interface Aggregate {
  played: number;
  wins: number;
  losses: number;
  koTerminals: number;
  cleanKoWins: number;
  timeoutWins: number;
  timeoutLosses: number;
  winRate: number;
  cleanKoWinRate: number;
  roundsWon: number;
  roundsLost: number;
  koRoundsWon: number;
  koRoundsLost: number;
}

export interface CandidateScore {
  played: number;
  primaryCleanKoWins: number;
  timeoutPenalty: number;
  koRoundMargin: number;
}

export interface RobustCandidateScore {
  worstCellCleanKoWins: number;
  worstScenarioCleanKoWins: number;
  totalCleanKoWins: number;
  totalTimeoutPenalty: number;
  worstCellKoRoundMargin: number;
  worstScenarioKoRoundMargin: number;
  totalKoRoundMargin: number;
  byCell: Array<{ scenario: DelayScenario; opponent: OpponentName; evidence: CandidateScore }>;
  byScenario: Array<{ scenario: DelayScenario; evidence: CandidateScore }>;
}

export interface CandidateSummary extends Aggregate {
  rank?: number;
  score: RobustCandidateScore;
  policyId: string;
  config: XenonConfig;
  configHash: string;
}

export interface EvaluationBlock {
  policyId: string;
  policySourceHash: string;
  config: object;
  configHash: string;
  train: Aggregate;
  heldOut: Aggregate;
  byScenario: Array<{ scenario: DelayScenario; train: Aggregate; heldOut: Aggregate }>;
  matches: MatchResult[];
}

export interface PolicyLabOptions {
  seed?: number;
  trainSeeds?: number[];
  heldOutSeeds?: number[];
  delayScenarios?: DelayScenario[];
  candidateLimit?: number;
  includeSearchMatches?: boolean;
}

export interface PolicyLabResult {
  schema: typeof LAB_SCHEMA;
  engine: {
    version: string;
    expectedBaseCommit: string;
    mechanicsHash: string;
    expectedMechanicsHash: string;
    mechanicsFiles: string[];
    mechanicsValidated: true;
    validationScope: string;
    deploymentScope: string;
    networkAccess: false;
  };
  run: {
    seed: number;
    trainSeeds: number[];
    heldOutSeeds: number[];
    delayScenarios: DelayScenario[];
    opponents: OpponentName[];
    sideAssignments: Side[];
    candidateCount: number;
  };
  opponentEnsemble: Array<{
    split: Split;
    character: OpponentName;
    policyId: string;
    family: string;
    sourceHash: string;
    config: object;
    configHash: string;
  }>;
  search: {
    selectedPolicyId: string;
    selectedConfig: XenonConfig;
    selectedConfigHash: string;
    scoring: {
      ordering: string[];
      note: string;
    };
    candidates: CandidateSummary[];
    matches?: MatchResult[];
  };
  evaluation: {
    searched: EvaluationBlock;
    frozenBaselines: EvaluationBlock[];
  };
  limitations: string[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashConfig(config: object): string {
  return hash(stable(config));
}

function computeMechanicsHash(): string {
  const toolsDirectory = fileURLToPath(new URL('.', import.meta.url));
  const digest = createHash('sha256');
  for (const relative of MECHANICS_FILES) {
    const sourcePath = resolve(toolsDirectory, '..', relative);
    digest.update(`src/${relative}`).update('\0').update(readFileSync(sourcePath)).update('\0');
  }
  return digest.digest('hex');
}

/** Fail closed if the mechanics snapshot is not the reviewed sf-6 base. */
export function validateMechanicsSnapshot(actualHash: string, engineVersion = ENGINE_VERSION): void {
  if (engineVersion !== EXPECTED_ENGINE_VERSION)
    throw new Error(`engine version mismatch: expected ${EXPECTED_ENGINE_VERSION}, got ${engineVersion}`);
  if (actualHash !== EXPECTED_MECHANICS_HASH)
    throw new Error(`mechanics snapshot mismatch: expected ${EXPECTED_MECHANICS_HASH}, got ${actualHash}`);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveSeed(...parts: Array<number | string>): number {
  const digest = createHash('sha256').update(parts.join('|')).digest();
  return digest.readUInt32LE(0);
}

function raw(fighter: Fighter): RawFighterObservation {
  return {
    x: fighter.x, y: fighter.y, vx: fighter.vx, vy: fighter.vy,
    facing: fighter.facing, hp: fighter.hp, wins: fighter.wins,
    attack: fighter.attack, attackFrame: fighter.attackFrame, stun: fighter.stun,
    blocking: fighter.blocking, crouching: fighter.crouching,
    phaseT: fighter.phaseT, armorT: fighter.armorT,
  };
}

function projectileView(projectiles: Projectile[], side: Side): ProjectileObservation[] {
  return projectiles.filter((p) => p.active).map((p) => ({
    owner: p.owner === side ? 'self' : 'opponent',
    x: p.x, y: p.y, vx: p.vx, style: p.style, frame: p.frame,
    returning: !!p.returning,
  }));
}

function neutral(): Inputs {
  return emptyInputs();
}

function move(moveX = 0, extras: Partial<Inputs> = {}): Inputs {
  return { ...emptyInputs(), moveX, ...extras };
}

function special(character: string, attack: SpecialAttack, facing: 1 | -1): Inputs {
  const definition = specialMoveForAttack(character, attack);
  if (!definition) throw new Error(`${character} has no canonical ${attack} move`);
  return {
    ...emptyInputs(),
    motion: specialMoveMotionCode(definition, facing),
    punch: definition.button === 'punch',
    kick: definition.button === 'kick',
  };
}

function distance(context: PolicyContext): number {
  return Math.abs(context.opponent.x - context.self.x);
}

function toward(context: PolicyContext): 1 | -1 {
  return (context.opponent.x >= context.self.x ? 1 : -1);
}

function incomingProjectile(context: PolicyContext, maximumDistance: number): boolean {
  return context.projectiles.some((p) => {
    if (p.owner !== 'opponent' || p.style === 'construct' || p.style === 'rope') return false;
    const delta = context.self.x - p.x;
    return Math.abs(delta) <= maximumDistance && Math.sign(delta) === Math.sign(p.vx);
  });
}

function canAct(context: PolicyContext): boolean {
  return context.phase === 'fight' && context.self.stun <= 0 && context.self.attack === 'none';
}

function makeDefinition(
  id: string,
  character: string,
  family: string,
  config: object,
  factory: (random: () => number) => PolicyInstance,
): PolicyDefinition {
  const sourceHash = hash(`${POLICY_SOURCE_VERSION}|${id}|${factory.toString()}`);
  return {
    id, character, family, config, sourceHash, configHash: hashConfig(config),
    create(seed: number) { return factory(mulberry32(seed)); },
  };
}

function opponentPolicy(character: OpponentName, split: Split): PolicyDefinition {
  const heldOut = split === 'held-out';
  const family = heldOut ? 'pressure-counter-v1' : 'canonical-specialist-v1';
  const config = heldOut
    ? { pressureDistance: 46, projectileReaction: 82, jumpChance: 0.18, specialCadence: 0.62 }
    : { pressureDistance: 38, projectileReaction: 64, jumpChance: 0.08, specialCadence: 0.78 };

  return makeDefinition(`${character.toLowerCase()}-${family}`, character, family, config, (random) => ({
    decide(context) {
      if (!canAct(context)) return neutral();
      const dist = distance(context);
      const dir = toward(context);
      const away = -dir;
      const threatened = context.opponent.attack !== 'none'
        && context.opponent.attackFrame <= (heldOut ? 8 : 6)
        && dist <= (heldOut ? 58 : 48);
      const projectile = incomingProjectile(context, config.projectileReaction);

      if (character === 'OMEGA') {
        if (projectile || (threatened && dist < 52)) return special('OMEGA', 'nullstep', context.self.facing);
        if (dist > (heldOut ? 104 : 84)) return special('OMEGA', 'testimony', context.self.facing);
        if (dist > 42) return special('OMEGA', 'entropy', context.self.facing);
      } else if (character === 'MNEME') {
        const constructs = context.projectiles.filter((p) => p.owner === 'self' && p.style === 'construct').length;
        if (projectile || threatened) return special('MNEME', 'nova', context.self.facing);
        if (constructs < (heldOut ? 1 : 2) && dist > (heldOut ? 44 : 58)) return special('MNEME', 'construct', context.self.facing);
        if (dist > 50) return special('MNEME', 'volley', context.self.facing);
      } else if (character === 'AJAX') {
        if (projectile || threatened) return special('AJAX', 'armor', context.self.facing);
        if (dist > (heldOut ? 76 : 92)) return special('AJAX', 'boomerang', context.self.facing);
        if (dist > 42) return special('AJAX', 'lasso', context.self.facing);
      } else {
        if (projectile || (context.opponent.y > 5 && dist < 64)) return special('FABLE', 'storyarc', context.self.facing);
        if (threatened) return special('FABLE', 'plottwist', context.self.facing);
        if (dist < 38) return special('FABLE', 'inktempest', context.self.facing);
        if (heldOut && dist > 74) return special('FABLE', 'storyarc', context.self.facing);
      }

      // Family separation is behavioral, not merely a label/config change.
      if (heldOut) {
        if (context.self.y > 3 && dist < 48) return move(dir, { kick: true });
        if (dist <= 28) return random() < 0.48 ? move(0, { throw: true }) : move(0, { kick: true });
        if (threatened) return move(away, { down: true });
        if (dist > 58 && random() < config.jumpChance) return move(dir, { jump: true });
        return move(dist > config.pressureDistance ? dir : away, dist <= 44 ? { kick: true } : {});
      }
      if (dist <= 28) return random() < 0.34 ? move(0, { throw: true }) : move(0, { kick: true });
      if (threatened) return move(away, { down: true });
      return move(dist > config.pressureDistance ? dir : away, dist <= 42 ? { kick: true } : {});
    },
  }));
}

function xenonPolicy(id: string, family: string, config: XenonConfig): PolicyDefinition {
  return makeDefinition(id, 'XENON', family, config, (random) => ({
    decide(context) {
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
    },
  }));
}

function normalsBaseline(): PolicyDefinition {
  const config = { spacing: 42, throwChance: 0.35, jumpChance: 0.08, specials: false };
  return makeDefinition('xenon-frozen-normals-v1', 'XENON', 'frozen-baseline', config, (random) => ({
    decide(context) {
      if (!canAct(context)) return neutral();
      const dist = distance(context), dir = toward(context), away = -dir;
      if (context.self.y > 3) return dist < 46 ? move(dir, { kick: true }) : move(dir);
      if (context.opponent.attack !== 'none' && dist < 48) return move(away, { down: true });
      if (dist <= 28) return random() < config.throwChance ? move(0, { throw: true }) : move(0, { kick: true });
      if (dist <= config.spacing) return move(0, { kick: true });
      return random() < config.jumpChance ? move(dir, { jump: true }) : move(dir);
    },
  }));
}

function frozenXenonBaseline(): PolicyDefinition {
  return xenonPolicy('xenon-frozen-hand-v1', 'frozen-baseline', {
    projectileReflectDistance: 58,
    phaseThreatDistance: 48,
    phaseNeutralDistance: 82,
    blinkDistance: 126,
    closeThrowChance: 0.32,
    jumpKickChance: 0.06,
  });
}

function candidateConfigs(limit: number): XenonConfig[] {
  const configs: XenonConfig[] = [];
  for (const projectileReflectDistance of [44, 68, 92])
    for (const phaseThreatDistance of [42, 54, 68])
      for (const phaseNeutralDistance of [54, 76, 98])
        for (const blinkDistance of [72, 108, 144])
          for (const closeThrowChance of [0.2, 0.5])
            for (const jumpKickChance of [0.03, 0.12])
              configs.push({ projectileReflectDistance, phaseThreatDistance, phaseNeutralDistance, blinkDistance, closeThrowChance, jumpKickChance });
  // Evenly span the deterministic grid when bounded, rather than selecting only
  // the lexicographically earliest corner.
  if (limit >= configs.length) return configs;
  const selected: XenonConfig[] = [];
  for (let i = 0; i < limit; i++) selected.push(configs[Math.floor(i * configs.length / limit)]!);
  return selected;
}

class InputDelay {
  private readonly queue: Inputs[] = [];
  constructor(private readonly frames: number) {}
  push(input: Inputs): Inputs {
    this.queue.push({ ...input });
    return this.queue.length > this.frames ? this.queue.shift()! : neutral();
  }
}

export function delaysBySeat(scenario: DelayScenario, executorSide: Side): { a: number; b: number } {
  return executorSide === 'a'
    ? { a: scenario.targetDelay, b: scenario.opponentDelay }
    : { a: scenario.opponentDelay, b: scenario.targetDelay };
}

function playMatch(
  target: PolicyDefinition,
  opponent: PolicyDefinition,
  split: Split,
  executorSide: Side,
  runSeed: number,
  seed: number,
  delayScenario: DelayScenario,
): MatchResult {
  // Common-random-number design: every candidate and both seat assignments see
  // the same stochastic streams for a given split/opponent/scenario. Candidate
  // config and executor side affect result identity only, never RNG. Explicit
  // role labels keep engine, target, and opponent streams disjoint.
  const streamRootSeed = deriveSeed(runSeed, split, opponent.id, seed, 'common-random-numbers-v1');
  const matchSeed = deriveSeed(streamRootSeed, 'engine-stream');
  const targetPolicySeed = deriveSeed(streamRootSeed, 'target-policy-stream');
  const opponentPolicySeed = deriveSeed(streamRootSeed, 'opponent-policy-stream');
  const targetInstance = target.create(targetPolicySeed);
  const opponentInstance = opponent.create(opponentPolicySeed);
  const aCharacter = executorSide === 'a' ? 'XENON' : opponent.character;
  const bCharacter = executorSide === 'b' ? 'XENON' : opponent.character;
  const match = makeMatch(makeFighter('a', aCharacter, 'a'), makeFighter('b', bCharacter, 'b'));
  match.stage = 'dojo'; // stages are cosmetic; pin one to eliminate OS-CSPRNG provenance noise.
  const seatDelays = delaysBySeat(delayScenario, executorSide);
  const delayA = new InputDelay(seatDelays.a);
  const delayB = new InputDelay(seatDelays.b);
  const roundTerminals: RoundTerminal[] = [];
  let previousPhase: MatchPhase = match.phase;

  for (let frame = 0; frame < MAX_MATCH_FRAMES && match.phase !== 'match-over'; frame++) {
    const contextA: PolicyContext = {
      self: raw(match.a), opponent: raw(match.b), projectiles: projectileView(match.projectiles, 'a'),
      phase: match.phase, frame: match.frame, side: 'a',
    };
    const contextB: PolicyContext = {
      self: raw(match.b), opponent: raw(match.a), projectiles: projectileView(match.projectiles, 'b'),
      phase: match.phase, frame: match.frame, side: 'b',
    };
    const intendedA = executorSide === 'a' ? targetInstance.decide(contextA) : opponentInstance.decide(contextA);
    const intendedB = executorSide === 'b' ? targetInstance.decide(contextB) : opponentInstance.decide(contextB);
    stepMatch(match, delayA.push(intendedA), delayB.push(intendedB));

    const currentPhase = match.phase as MatchPhase; // stepMatch mutates through the shared Match object.
    if (previousPhase === 'fight' && (currentPhase === 'round-over' || currentPhase === 'match-over')) {
      const aDead = match.a.hp <= 0, bDead = match.b.hp <= 0;
      const reason = aDead && bDead ? 'double-ko' : (aDead || bDead ? 'ko' : 'time');
      const winner: Side | 'draw' = match.a.wins > (roundTerminals.filter((r) => r.winner === 'a').length)
        ? 'a'
        : match.b.wins > (roundTerminals.filter((r) => r.winner === 'b').length) ? 'b' : 'draw';
      roundTerminals.push({ round: match.round, reason, winner });
    }
    previousPhase = currentPhase;
  }

  if (match.phase !== 'match-over' || match.a.wins === match.b.wins)
    throw new Error(`non-terminal offline match ${opponent.id}/${executorSide}/${seed}: phase=${match.phase} ${match.a.wins}-${match.b.wins}`);

  const winnerSide: Side = match.a.wins > match.b.wins ? 'a' : 'b';
  const executorWins = executorSide === winnerSide;
  const last = roundTerminals.at(-1);
  const terminal = last?.reason ?? 'frame-cap';
  return {
    id: hash(`${matchSeed}|${target.id}|${target.configHash}|${opponent.id}|${executorSide}|${delayScenario.targetDelay}:${delayScenario.opponentDelay}`).slice(0, 16), split,
    scenarioSeed: seed, streamRootSeed, matchSeed, targetPolicySeed, opponentPolicySeed,
    executorSide, executor: 'XENON', opponent: opponent.character as OpponentName,
    opponentPolicy: opponent.id, opponentFamily: opponent.family, opponentConfigHash: opponent.configHash,
    targetPolicy: target.id, targetConfigHash: target.configHash, delayScenario: { ...delayScenario }, seatDelays, stage: match.stage,
    frames: match.frame,
    rounds: { executor: executorSide === 'a' ? match.a.wins : match.b.wins, opponent: executorSide === 'a' ? match.b.wins : match.a.wins },
    winner: executorWins ? 'executor' : 'opponent', outcome: executorWins ? 'win' : 'loss',
    // Only a KO earns the clean-KO metric. Time remains an authoritative result,
    // but is not promoted to equivalent combat evidence.
    terminal, koTerminal: terminal === 'ko', cleanKoWin: executorWins && terminal === 'ko', roundTerminals,
  };
}

function aggregate(matches: MatchResult[]): Aggregate {
  const wins = matches.filter((m) => m.outcome === 'win').length;
  const roundsWon = matches.reduce((sum, m) => sum + m.rounds.executor, 0);
  const roundsLost = matches.reduce((sum, m) => sum + m.rounds.opponent, 0);
  const koTerminals = matches.filter((m) => m.koTerminal).length;
  const cleanKoWins = matches.filter((m) => m.cleanKoWin).length;
  const timeoutWins = matches.filter((m) => m.terminal === 'time' && m.outcome === 'win').length;
  const timeoutLosses = matches.filter((m) => m.terminal === 'time' && m.outcome === 'loss').length;
  const koMatches = matches.filter((m) => m.terminal === 'ko');
  const koRoundsWon = koMatches.reduce((sum, m) => sum + m.rounds.executor, 0);
  const koRoundsLost = koMatches.reduce((sum, m) => sum + m.rounds.opponent, 0);
  return {
    played: matches.length, wins, losses: matches.length - wins,
    koTerminals, cleanKoWins, timeoutWins, timeoutLosses,
    winRate: matches.length ? wins / matches.length : 0,
    cleanKoWinRate: matches.length ? cleanKoWins / matches.length : 0,
    roundsWon, roundsLost, koRoundsWon, koRoundsLost,
  };
}

function scenarios(
  target: PolicyDefinition,
  split: Split,
  seeds: number[],
  runSeed: number,
  delayScenarios: DelayScenario[],
  ensemble: Map<string, PolicyDefinition>,
): MatchResult[] {
  const results: MatchResult[] = [];
  for (const delayScenario of delayScenarios) for (const opponentName of DEFAULT_OPPONENTS) {
    const opponent = ensemble.get(`${split}:${opponentName}`)!;
    for (const seed of seeds) for (const side of ['a', 'b'] as const)
      results.push(playMatch(target, opponent, split, side, runSeed, seed, delayScenario));
  }
  return results;
}

export function score(matches: readonly MatchResult[]): CandidateScore {
  const koMatches = matches.filter((match) => match.terminal === 'ko');
  return {
    played: matches.length,
    // Challenge objective: only executor wins ending in KO are primary evidence.
    primaryCleanKoWins: koMatches.filter((match) => match.outcome === 'win').length,
    // Every timeout is a penalty, including a timeout win. It contributes no
    // clean-KO or round-margin credit.
    timeoutPenalty: matches.filter((match) => match.terminal === 'time').length,
    koRoundMargin: koMatches.reduce((margin, match) => margin + match.rounds.executor - match.rounds.opponent, 0),
  };
}

const scenarioKey = (scenario: DelayScenario): string => `${scenario.targetDelay}:${scenario.opponentDelay}`;

export function robustScore(matches: readonly MatchResult[], delayScenarios: readonly DelayScenario[]): RobustCandidateScore {
  const byScenario = delayScenarios.map((scenario) => ({
    scenario: { ...scenario },
    evidence: score(matches.filter((match) => scenarioKey(match.delayScenario) === scenarioKey(scenario))),
  }));
  const byCell = delayScenarios.flatMap((scenario) => DEFAULT_OPPONENTS.map((opponent) => ({
    scenario: { ...scenario },
    opponent,
    evidence: score(matches.filter((match) =>
      scenarioKey(match.delayScenario) === scenarioKey(scenario) && match.opponent === opponent)),
  })));
  return {
    worstCellCleanKoWins: Math.min(...byCell.map((row) => row.evidence.primaryCleanKoWins)),
    worstScenarioCleanKoWins: Math.min(...byScenario.map((row) => row.evidence.primaryCleanKoWins)),
    totalCleanKoWins: byScenario.reduce((sum, row) => sum + row.evidence.primaryCleanKoWins, 0),
    totalTimeoutPenalty: byScenario.reduce((sum, row) => sum + row.evidence.timeoutPenalty, 0),
    worstCellKoRoundMargin: Math.min(...byCell.map((row) => row.evidence.koRoundMargin)),
    worstScenarioKoRoundMargin: Math.min(...byScenario.map((row) => row.evidence.koRoundMargin)),
    totalKoRoundMargin: byScenario.reduce((sum, row) => sum + row.evidence.koRoundMargin, 0),
    byCell,
    byScenario,
  };
}

export function compareRobustScore(a: RobustCandidateScore, b: RobustCandidateScore): number {
  return b.worstCellCleanKoWins - a.worstCellCleanKoWins
    || b.worstScenarioCleanKoWins - a.worstScenarioCleanKoWins
    || b.totalCleanKoWins - a.totalCleanKoWins
    || a.totalTimeoutPenalty - b.totalTimeoutPenalty
    || b.worstCellKoRoundMargin - a.worstCellKoRoundMargin
    || b.worstScenarioKoRoundMargin - a.worstScenarioKoRoundMargin
    || b.totalKoRoundMargin - a.totalKoRoundMargin;
}

function validateOptions(options: PolicyLabOptions): Required<PolicyLabOptions> {
  const seed = options.seed ?? 1;
  const trainSeeds = options.trainSeeds ?? DEFAULT_TRAIN_SEEDS;
  const heldOutSeeds = options.heldOutSeeds ?? DEFAULT_HELD_OUT_SEEDS;
  const delayScenarios = options.delayScenarios ?? DEFAULT_DELAY_SCENARIOS;
  const candidateLimit = options.candidateLimit ?? 48;
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  if (!trainSeeds.length || !heldOutSeeds.length || [...trainSeeds, ...heldOutSeeds].some((s) => !Number.isInteger(s)))
    throw new Error('train and held-out seeds must be non-empty integer lists');
  if (trainSeeds.some((s) => heldOutSeeds.includes(s))) throw new Error('train and held-out seeds must be disjoint');
  if (!delayScenarios.length || delayScenarios.some(({ targetDelay, opponentDelay }) =>
    !Number.isInteger(targetDelay) || targetDelay < 0 || targetDelay > 30
    || !Number.isInteger(opponentDelay) || opponentDelay < 0 || opponentDelay > 30))
    throw new Error('delayScenarios must contain target/opponent integer delays from 0 to 30');
  if (new Set(delayScenarios.map(scenarioKey)).size !== delayScenarios.length) throw new Error('delayScenarios must be unique');
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 324) throw new Error('candidateLimit must be an integer from 1 to 324');
  return { seed, trainSeeds, heldOutSeeds, delayScenarios: delayScenarios.map((scenario) => ({ ...scenario })), candidateLimit, includeSearchMatches: options.includeSearchMatches ?? false };
}

export async function runPolicyLab(options: PolicyLabOptions = {}): Promise<PolicyLabResult> {
  const checked = validateOptions(options);
  const mechanicsHash = computeMechanicsHash();
  validateMechanicsSnapshot(mechanicsHash);
  const ensemble = new Map<string, PolicyDefinition>();
  for (const split of ['train', 'held-out'] as const) for (const character of DEFAULT_OPPONENTS)
    ensemble.set(`${split}:${character}`, opponentPolicy(character, split));

  const candidateRows: CandidateSummary[] = [];
  const searchMatches: MatchResult[] = [];
  for (const [index, config] of candidateConfigs(checked.candidateLimit).entries()) {
    const target = xenonPolicy(`xenon-search-${index.toString().padStart(3, '0')}`, 'searched-grid-v1', config);
    const matches = scenarios(target, 'train', checked.trainSeeds, checked.seed, checked.delayScenarios, ensemble);
    const totals = aggregate(matches);
    candidateRows.push({ ...totals, score: robustScore(matches, checked.delayScenarios), policyId: target.id, config, configHash: target.configHash });
    if (checked.includeSearchMatches) searchMatches.push(...matches);
  }
  candidateRows.sort((a, b) => compareRobustScore(a.score, b.score) || a.configHash.localeCompare(b.configHash));
  candidateRows.forEach((row, index) => { row.rank = index + 1; });
  const selected = candidateRows[0]!;
  const selectedPolicy = xenonPolicy(selected.policyId, 'searched-grid-v1', selected.config);

  const evaluate = (policy: PolicyDefinition): EvaluationBlock => {
    const matches = [
      ...scenarios(policy, 'train', checked.trainSeeds, checked.seed, checked.delayScenarios, ensemble),
      ...scenarios(policy, 'held-out', checked.heldOutSeeds, checked.seed, checked.delayScenarios, ensemble),
    ];
    return {
      policyId: policy.id, policySourceHash: policy.sourceHash, config: policy.config, configHash: policy.configHash,
      train: aggregate(matches.filter((m) => m.split === 'train')),
      heldOut: aggregate(matches.filter((m) => m.split === 'held-out')),
      byScenario: checked.delayScenarios.map((scenario) => ({
        scenario: { ...scenario },
        train: aggregate(matches.filter((m) => m.split === 'train' && scenarioKey(m.delayScenario) === scenarioKey(scenario))),
        heldOut: aggregate(matches.filter((m) => m.split === 'held-out' && scenarioKey(m.delayScenario) === scenarioKey(scenario))),
      })),
      matches,
    };
  };

  const thisFile = fileURLToPath(import.meta.url);
  const opponentEnsemble = [...ensemble.entries()].map(([key, policy]) => ({
    split: key.startsWith('train:') ? 'train' as const : 'held-out' as const,
    character: policy.character as OpponentName, policyId: policy.id, family: policy.family,
    sourceHash: policy.sourceHash, config: policy.config, configHash: policy.configHash,
  }));

  return {
    schema: LAB_SCHEMA,
    engine: {
      version: ENGINE_VERSION, expectedBaseCommit: ENGINE_COMMIT,
      mechanicsHash, expectedMechanicsHash: EXPECTED_MECHANICS_HASH,
      mechanicsFiles: MECHANICS_FILES.map((file) => `src/${file}`), mechanicsValidated: true,
      validationScope: 'Exact mechanics snapshot only; stage art/selection and sprites are excluded because the lab pins the cosmetic stage and does not render.',
      deploymentScope: 'Pinned to deployed live snapshot 991acfe; undeployed main 9fd5609 (UNCLOSE) is explicitly excluded.',
      networkAccess: false,
    },
    run: {
      seed: checked.seed, trainSeeds: [...checked.trainSeeds], heldOutSeeds: [...checked.heldOutSeeds],
      delayScenarios: checked.delayScenarios.map((scenario) => ({ ...scenario })), opponents: [...DEFAULT_OPPONENTS], sideAssignments: ['a', 'b'],
      candidateCount: candidateRows.length,
    },
    opponentEnsemble,
    search: {
      selectedPolicyId: selected.policyId, selectedConfig: selected.config, selectedConfigHash: selected.configHash,
      scoring: {
        ordering: ['worst (delay scenario, opponent) cleanKoWins descending', 'worst-scenario cleanKoWins descending', 'total cleanKoWins descending', 'total timeoutPenalty ascending', 'worst (delay scenario, opponent) KO-terminal round margin descending', 'worst-scenario KO-terminal round margin descending', 'total KO-terminal round margin descending', 'configHash ascending'],
        note: 'One config is frozen across all asymmetric target/opponent delay scenarios. Every fighter-delay cell has equal search exposure (reported as played) and is protected by the primary minimax floor. Timeout wins receive zero clean-KO or round-margin credit and one penalty.',
      },
      candidates: candidateRows,
      ...(checked.includeSearchMatches ? { matches: searchMatches } : {}),
    },
    evaluation: {
      searched: evaluate(selectedPolicy),
      frozenBaselines: [evaluate(frozenXenonBaseline()), evaluate(normalsBaseline())],
    },
    limitations: [
      'Offline exact-engine outcomes do not establish live-network robustness or human-matchup strength.',
      'Stages are pinned to dojo because stage art has no engine effect and live stage selection uses OS randomness.',
      'The adversarial policies are fixed, mechanics-grounded heuristics; held-out families and seeds reduce but do not eliminate policy overfitting.',
      `Policy source artifact SHA-256: ${hash(readFileSync(thisFile))}.`,
    ],
  };
}

function parseSeedList(value: string | undefined): number[] | undefined {
  return value?.split(',').filter(Boolean).map(Number);
}

function parseDelayScenarios(value: string | undefined): DelayScenario[] | undefined {
  return value?.split(',').filter(Boolean).map((entry) => {
    const parts = entry.split(':');
    if (parts.length !== 2 || parts.some((part) => part === '')) throw new Error(`invalid delay scenario: ${entry}`);
    return { targetDelay: Number(parts[0]), opponentDelay: Number(parts[1]) };
  });
}

function parseArgs(argv: string[]): PolicyLabOptions & { pretty: boolean; help: boolean } {
  const valueOptions = new Set(['seed', 'train-seeds', 'held-out-seeds', 'delay-scenarios', 'candidates']);
  const values: Record<string, string> = {};
  let pretty = false, help = false, includeSearchMatches = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--pretty') { pretty = true; continue; }
    if (arg === '--include-search-matches') { includeSearchMatches = true; continue; }
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    if (arg === '--input-delays') throw new Error('--input-delays was removed; use --delay-scenarios T:O,...');
    const name = arg.slice(2);
    if (!valueOptions.has(name)) throw new Error(`unknown option: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    values[name] = value;
  }
  return {
    seed: values.seed ? Number(values.seed) : undefined,
    trainSeeds: parseSeedList(values['train-seeds']), heldOutSeeds: parseSeedList(values['held-out-seeds']),
    delayScenarios: parseDelayScenarios(values['delay-scenarios']),
    candidateLimit: values.candidates ? Number(values.candidates) : undefined,
    includeSearchMatches, pretty, help,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Usage: pnpm policy:xenon [options]\n\nOptions:\n  --seed N                    run provenance seed\n  --train-seeds A,B,C         deterministic search/eval seeds\n  --held-out-seeds A,B,C      disjoint evaluation-only seeds\n  --delay-scenarios T:O,...   unique target:opponent delays, each 0-30\n  --candidates N              bounded grid candidates (1-324)\n  --include-search-matches    include every search match in JSON\n  --pretty                    pretty-print JSON\n  --help                      show this help`);
  } else {
    const result = await runPolicyLab(parsed);
    console.log(JSON.stringify(result, null, parsed.pretty ? 2 : 0));
  }
}

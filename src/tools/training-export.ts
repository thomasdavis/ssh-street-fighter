// Exact-engine offline trajectory export for ai-model and other policy learners.
// Emits two perspective-specific JSONL episodes per simulated match. No SSH,
// credentials, matchmaking, or live server are involved.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { attackActive, makeFighter, makeMatch, specialMoveStats, stepMatch } from '../game/engine.js';
import { emptyInputs, type Fighter, type Inputs, type Match } from '../game/types.js';
import { specialMoveForAttack, type SpecialAttack } from '../game/moves.js';
import {
  gymFighterView, gymInputs, gymStyles, knownGymFighter, loadGymPolicy,
  seededGymRandom, type GymPolicy,
} from './omega-gym.js';

const ENGINE_VERSION = 'sf-5';
const CAP = 30 * 75;

export interface SimTrainingExportOptions {
  fighter?: string;
  opponents?: string[];
  styleNames?: string[];
  matches?: number;
  seed?: number;
  policyPath?: string;
  stage?: string;
  sourceCommit?: string; // tests may pin a fixture without requiring git
  sourceDirty?: boolean;
}

export interface SimTrainingExportSummary {
  schemaVersion: number;
  engineVersion: string;
  engineCommit: string;
  fighter: string;
  opponents: string[];
  styles: string[];
  matches: number;
  episodes: number;
  frames: number;
  wins: number;
  losses: number;
  draws: number;
  capped: number;
}

type EpisodeSink = (episode: Record<string, unknown>) => void;

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceState(options: SimTrainingExportOptions): { commit: string; dirty: boolean } {
  if (options.sourceCommit) return { commit: options.sourceCommit, dirty: !!options.sourceDirty };
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
  return { commit, dirty };
}

function inputRecord(input: Inputs): Record<string, unknown> {
  return {
    move_x: Math.sign(input.moveX), down: input.down, jump: input.jump,
    punch: input.punch, kick: input.kick, throw: input.throw, motion: input.motion,
  };
}

function fighterRecord(fighter: Fighter): Record<string, unknown> {
  const special = fighter.attack !== 'none' && fighter.attack !== 'punch'
    && fighter.attack !== 'kick' && fighter.attack !== 'throw'
    && specialMoveForAttack(fighter.name, fighter.attack as SpecialAttack) !== null;
  const active = attackActive(fighter);
  let casting = false;
  if (special && !active) {
    try { casting = fighter.attackFrame < specialMoveStats(fighter.attack as SpecialAttack).startup; }
    catch { /* an unknown future move is still recorded by attack/pose */ }
  }
  return {
    x: fighter.x, y: fighter.y, vx: fighter.vx, vy: fighter.vy,
    facing: fighter.facing, hp: fighter.hp, wins: fighter.wins,
    attack: fighter.attack, attack_frame: fighter.attackFrame, stun: fighter.stun,
    pose: fighter.pose, crouching: fighter.crouching, blocking: fighter.blocking,
    phase_t: fighter.phaseT, armor_t: fighter.armorT,
    special, active, casting,
  };
}

function observationRecord(match: Match, side: 'a' | 'b'): Record<string, unknown> {
  const self = side === 'a' ? match.a : match.b;
  const opponent = side === 'a' ? match.b : match.a;
  return {
    frame: match.frame, phase: match.phase, round: match.round,
    self_fighter: fighterRecord(self), opponent: fighterRecord(opponent),
    round_time: match.roundTime, hit_stop: match.hitStop, ack: match.frame,
    projectiles: match.projectiles.filter((projectile) => projectile.active).map((projectile) => ({
      owner: projectile.owner === side ? 'self' : 'opponent',
      x: projectile.x, y: projectile.y, vx: projectile.vx, style: projectile.style,
    })),
  };
}

function controllerHash(label: string, commit: string, policyPath?: string): string {
  if (policyPath) return sha256(readFileSync(resolve(policyPath)));
  return sha256(`${label}@${commit}`);
}

function matchId(seed: number, ordinal: number, fighter: string,
                 opponent: string, style: string): string {
  return `sim-${seed}-${ordinal}-${fighter}-${opponent}-${style}`.toLowerCase();
}

function terminal(match: Match, capped: boolean): { reason: string; winner: 'a' | 'b' | 'draw' } {
  if (capped || match.a.wins === match.b.wins) return { reason: capped ? 'cap' : 'draw', winner: 'draw' };
  return {
    reason: Math.min(match.a.hp, match.b.hp) <= 0 ? 'ko' : 'time',
    winner: match.a.wins > match.b.wins ? 'a' : 'b',
  };
}

function metaRecord(args: {
  sourceCommit: string; trajectoryHash: string; seed: number; ordinal: number;
  match: Match; side: 'a' | 'b'; fighter: string; opponent: string; style: string;
  targetLabel: string; targetHash: string; styleHash: string; reason: string;
  winner: 'a' | 'b' | 'draw';
}): Record<string, unknown> {
  const selfIsTarget = args.side === 'a';
  return {
    schema_version: 2, source: 'simulator-gym', engine_version: ENGINE_VERSION,
    engine_commit: args.sourceCommit,
    match_id: matchId(args.seed, args.ordinal, args.fighter, args.opponent, args.style),
    replay_sha256: args.trajectoryHash, seed: args.seed, stage: args.match.stage,
    side: args.side, self_char: selfIsTarget ? args.fighter : args.opponent,
    opponent_char: selfIsTarget ? args.opponent : args.fighter,
    self_policy_family: selfIsTarget ? args.targetLabel : `gym:${args.style}`,
    self_policy_version: args.sourceCommit,
    self_policy_hash: selfIsTarget ? args.targetHash : args.styleHash,
    opponent_policy_family: selfIsTarget ? `gym:${args.style}` : args.targetLabel,
    opponent_policy_version: args.sourceCommit,
    opponent_policy_hash: selfIsTarget ? args.styleHash : args.targetHash,
    terminal_reason: args.reason, winner: args.winner,
    opponent_handle: selfIsTarget ? `sim:${args.style}` : `sim:${args.targetLabel}`,
  };
}

function playAndExport(args: {
  target: { decide: GymPolicy; reset?: () => void; label: string };
  targetLabel: string;
  targetHash: string; opponentPolicy: GymPolicy; style: string; styleHash: string;
  fighter: string; opponent: string; seed: number; ordinal: number; sourceCommit: string; stage: string;
}, sink: EpisodeSink): { outcome: 'win' | 'loss' | 'draw'; frames: number; capped: boolean } {
  args.target.reset?.();
  const match = makeMatch(makeFighter('a', args.fighter, 'a'), makeFighter('b', args.opponent, 'b'));
  // makeMatch uses an OS-random cosmetic arena. Override it before the first
  // observation so a seeded export is byte-reproducible and provenance is exact.
  match.stage = args.stage;
  const observationsA = [observationRecord(match, 'a')];
  const observationsB = [observationRecord(match, 'b')];
  // Index zero is a sentinel so action[t+1] is exactly the input that drives
  // observation[t] -> observation[t+1], matching ai-model's dataset contract.
  const actionsA = [inputRecord(emptyInputs())];
  const actionsB = [inputRecord(emptyInputs())];
  let frames = 0;
  while (match.phase !== 'match-over' && frames < CAP) {
    const projectiles = match.projectiles.filter((projectile) => projectile.active).map((projectile) => ({
      owner: projectile.owner, x: Math.round(projectile.x), y: Math.round(projectile.y),
      vx: projectile.vx, style: projectile.style,
    }));
    let commandA: unknown = {};
    try { commandA = args.target.decide(gymFighterView(match.a), gymFighterView(match.b), match.phase, projectiles, 'a') || {}; }
    catch { commandA = {}; }
    let commandB: unknown = {};
    try { commandB = args.opponentPolicy(gymFighterView(match.b), gymFighterView(match.a), match.phase) || {}; }
    catch { commandB = {}; }
    const inputA = gymInputs(commandA);
    const inputB = gymInputs(commandB);
    stepMatch(match, inputA, inputB);
    actionsA.push(inputRecord(inputA)); actionsB.push(inputRecord(inputB));
    observationsA.push(observationRecord(match, 'a')); observationsB.push(observationRecord(match, 'b'));
    frames++;
  }
  const capped = match.phase !== 'match-over';
  const ended = terminal(match, capped);
  const trajectoryHash = sha256(JSON.stringify({ observationsA, observationsB, actionsA, actionsB }));
  for (const side of ['a', 'b'] as const) {
    sink({
      meta: metaRecord({ ...args, match, side, trajectoryHash, reason: ended.reason, winner: ended.winner }),
      observations: side === 'a' ? observationsA : observationsB,
      actions: side === 'a' ? actionsA : actionsB,
    });
  }
  const outcome = ended.winner === 'draw' ? 'draw' : ended.winner === 'a' ? 'win' : 'loss';
  return { outcome, frames, capped };
}

export async function exportSimTrainingData(options: SimTrainingExportOptions, sink: EpisodeSink): Promise<SimTrainingExportSummary> {
  const fighter = knownGymFighter(options.fighter ?? 'CODEX');
  const opponents = (options.opponents?.length ? options.opponents : ['FABLE', 'OMEGA']).map(knownGymFighter);
  const styleNames = options.styleNames?.length ? options.styleNames : Object.keys(gymStyles);
  for (const style of styleNames) if (!gymStyles[style]) throw new Error(`unknown style: ${style}`);
  const matches = options.matches ?? 10;
  if (!Number.isInteger(matches) || matches < 1 || matches > 1000) throw new Error('--matches must be an integer from 1 to 1000');
  const seed = options.seed ?? 1;
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  const stage = options.stage ?? 'dojo';
  if (!/^[a-z0-9_-]+$/i.test(stage)) throw new Error('--stage must be a simple stage identifier');
  const source = sourceState(options);
  const engineCommit = `${source.commit}${source.dirty ? '+dirty' : ''}`;
  const target = await loadGymPolicy(options.policyPath);
  const targetLabel = options.policyPath ? `external:${basename(options.policyPath)}` : target.label;
  const targetHash = controllerHash(targetLabel, engineCommit, options.policyPath);

  const originalRandom = Math.random;
  Math.random = seededGymRandom(seed);
  let ordinal = 0, frames = 0, wins = 0, losses = 0, draws = 0, capped = 0;
  try {
    for (const style of styleNames) {
      const opponentPolicy = gymStyles[style]!;
      const styleHash = sha256(`gym:${style}@${engineCommit}`);
      for (let index = 0; index < matches; index++) {
        const opponent = opponents[index % opponents.length]!;
        const result = playAndExport({ target, targetLabel, targetHash, opponentPolicy, style, styleHash,
          fighter, opponent, seed, ordinal: ordinal++, sourceCommit: engineCommit, stage }, sink);
        frames += result.frames;
        if (result.outcome === 'win') wins++; else if (result.outcome === 'loss') losses++; else draws++;
        if (result.capped) capped++;
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return { schemaVersion: 2, engineVersion: ENGINE_VERSION, engineCommit, fighter,
    opponents, styles: styleNames, matches: ordinal, episodes: ordinal * 2,
    frames, wins, losses, draws, capped };
}

function parseArgs(argv: string[]): { options: SimTrainingExportOptions; output: string; help: boolean } {
  const values: Record<string, string> = {};
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    values[arg.slice(2)] = value;
  }
  return {
    help, output: values.output ?? 'training-data/sshfighter-sim.jsonl',
    options: {
      fighter: values.fighter,
      opponents: values.opponents?.split(',').filter(Boolean),
      styleNames: values.styles?.split(',').filter(Boolean),
      matches: values.matches ? Number(values.matches) : undefined,
      seed: values.seed ? Number(values.seed) : undefined,
      policyPath: values.policy,
      stage: values.stage,
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log('Usage: pnpm export:sim-training --output PATH [--fighter CODEX] [--opponents FABLE,OMEGA] [--styles rushdown,turtle] [--matches 10] [--seed 1] [--stage dojo] [--policy PATH]');
  } else {
    const output = resolve(parsed.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, '');
    const summary = await exportSimTrainingData(parsed.options, (episode) => {
      appendFileSync(output, `${JSON.stringify(episode)}\n`);
    });
    console.log(JSON.stringify({ output, ...summary }));
  }
}

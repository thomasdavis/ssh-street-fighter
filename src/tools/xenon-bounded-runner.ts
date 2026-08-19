#!/usr/bin/env node
// One-match, direct-Lounge XENON runner. Importing this module is side-effect
// free; network and SSH creation occur only through executeRunner().
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, statSync, writeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { type MatchPhase } from '../game/types.js';
import { createXenonActuator } from '../policies/xenon-actuation.js';
import {
  adaptBotWireContext,
  APPROVED_CROSS_POLICY_SOURCE_HASH as SHARED_APPROVED_POLICY_SOURCE_HASH,
  sha256, stable,
  type Side, type WireFighterObservation, type WireProjectileObservation,
} from '../policies/xenon-matchup.js';
import {
  createUniversalXenonPolicy, expectedProfile, isUniversalOpponent, UNIVERSAL_OPPONENTS,
  FROZEN_LEGACY_POLICY_SOURCE_HASH,
  type UniversalOpponent, type UniversalPolicyBinding, type UniversalPolicyProfile,
} from '../policies/xenon-universal.js';
import {
  APPROVED_CROSS_COMMIT, APPROVED_CROSS_POLICY_SOURCE_HASH,
  EXPECTED_RUNNER_IMPLEMENTATION_HASH, FROZEN_TARGET_COMMIT,
  RUNNER_IMPLEMENTATION_FILES, RUNNER_SOURCE_BASE_COMMIT,
  TARGET_DEPLOYMENT_PROFILE, TARGET_ENGINE_COMMIT,
} from '../policies/xenon-runner-provenance.js';
export {
  APPROVED_CROSS_COMMIT, APPROVED_CROSS_POLICY_SOURCE_HASH,
  EXPECTED_RUNNER_IMPLEMENTATION_HASH, FROZEN_TARGET_COMMIT,
  RUNNER_IMPLEMENTATION_FILES, RUNNER_SOURCE_BASE_COMMIT,
  TARGET_DEPLOYMENT_PROFILE, TARGET_ENGINE_COMMIT,
} from '../policies/xenon-runner-provenance.js';

export const PINNED_ENGINE_COMMIT = TARGET_ENGINE_COMMIT;
export const EXPECTED_ENGINE_VERSION = 'sf-6';
export const RUNNER_SCHEMA = 'xenon-bounded-runner/v2';
export const PINNED_ROSTER = [
  'BYU', 'MEN', 'BLANKO', 'CHONG', 'GYLE', 'ZANG', 'DHAL', 'HONDO',
  'KIRA', 'MAKO', 'OMEGA', 'CODEX', 'FABLE', 'MNEME', 'AJAX', 'XENON',
] as const;
export const PINNED_ROSTER_HASH = sha256(stable(PINNED_ROSTER));
const XENON_CURSOR = PINNED_ROSTER.indexOf('XENON');
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;

type JsonObject = Record<string, unknown>;

export interface RunnerOptions {
  identity: string;
  handle: string;
  target: string;
  opponent: UniversalOpponent;
  profile: UniversalPolicyProfile;
  output: string;
  host: string;
  actionDelay: number;
  seed: number;
  matches: 1;
  timeoutMs: number;
  dryRun: boolean;
}

export interface HealthPayload {
  ok?: unknown;
  service?: unknown;
  engine?: unknown;
  [key: string]: unknown;
}

export interface AuditSink {
  append(event: string, payload?: unknown): void;
  close(): void;
}

export interface RunnerTransport {
  send(message: JsonObject): void;
  close(): void;
  onMessage(handler: (message: JsonObject) => void | Promise<void>): void;
  onExit(handler: (code: number | null) => void): void;
  onError(handler: (error: Error) => void): void;
}

export interface SshChild {
  stdin: Writable;
  stdout: Readable;
  on(event: 'exit', handler: (code: number | null) => void): unknown;
  on(event: 'error', handler: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnSsh = (command: string, args: string[], options: { stdio: ['pipe', 'pipe', 'inherit'] }) => SshChild;

export interface TokenChild {
  stdout: Readable;
  stderr: Readable;
  on(event: 'exit', handler: (code: number | null) => void): unknown;
  on(event: 'error', handler: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnToken = (command: string, args: string[], options: { stdio: ['ignore', 'pipe', 'pipe'] }) => TokenChild;
export const TOKEN_MINT_TIMEOUT_MS = 15_000;
export const LOUNGE_PING_INTERVAL_MS = 30_000;
export const LOUNGE_PONG_TIMEOUT_MS = 10_000;
const MAX_TOKEN_OUTPUT_BYTES = 32 * 1024;

export interface RunnerDependencies {
  fetchJson(url: string): Promise<unknown>;
  mintToken(options: RunnerOptions): Promise<string>;
  openTransport(options: RunnerOptions): RunnerTransport;
  createAudit(path: string): AuditSink;
  sleep(ms: number): Promise<void>;
  schedule(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearSchedule(timer: ReturnType<typeof setTimeout>): void;
}

export function redact(value: unknown, key = ''): unknown {
  const normalized = key.toLowerCase();
  if (normalized === 'fp' || normalized.includes('fingerprint') || normalized.endsWith('_fp')
      || normalized.includes('privatekey') || normalized === 'identity' || normalized === 'key') return '[REDACTED]';
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonObject).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

export class SecureJsonlAudit implements AuditSink {
  private readonly fd: number;
  private sequence = 0;
  private closed = false;

  constructor(path: string) {
    this.fd = openSync(path, 'wx', 0o600);
    const mode = fstatSync(this.fd).mode & 0o777;
    if (mode !== 0o600) {
      closeSync(this.fd);
      throw new Error(`audit output mode must be 0600, got ${mode.toString(8)}`);
    }
  }

  append(event: string, payload: unknown = {}): void {
    if (this.closed) throw new Error('audit ledger is closed');
    const row = { sequence: ++this.sequence, event, payload: redact(payload) };
    writeSync(this.fd, `${JSON.stringify(row)}\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeSync(this.fd);
  }
}

export function validateHealth(payload: unknown): asserts payload is HealthPayload {
  if (!payload || typeof payload !== 'object') throw new Error('live health payload must be an object');
  const health = payload as HealthPayload;
  if (health.ok !== true || health.service !== 'ringside' || health.engine !== EXPECTED_ENGINE_VERSION)
    throw new Error(`live health mismatch: expected ringside/${EXPECTED_ENGINE_VERSION}`);
}

export function validatePinnedRoster(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length !== PINNED_ROSTER.length
      || value.some((entry, index) => entry !== PINNED_ROSTER[index])
      || value.some((entry) => String(entry).toUpperCase() === 'UNCLOSE'))
    throw new Error(`deployed roster mismatch: expected exact pinned ${PINNED_ROSTER.length}-fighter roster`);
}

export function cursorCharacter(cursor: unknown): string | null {
  return Number.isInteger(cursor) && Number(cursor) >= 0 && Number(cursor) < PINNED_ROSTER.length
    ? PINNED_ROSTER[Number(cursor)]!
    : null;
}

export function computeRunnerImplementationHash(): string {
  const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));
  const digest = createHash('sha256');
  for (const relative of RUNNER_IMPLEMENTATION_FILES) {
    digest.update(`src/${relative}`).update('\0');
    digest.update(readFileSync(resolve(sourceDirectory, relative))).update('\0');
  }
  return digest.digest('hex');
}

export function computeGoldenTraceHash(): string {
  const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));
  return sha256(readFileSync(resolve(sourceDirectory, 'fixtures/xenon-matchup-golden-trace.json')));
}

export function computePolicySourceFileHash(relative: string): string {
  const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));
  return sha256(readFileSync(resolve(sourceDirectory, relative)));
}

export function computeLegacyRuntimeSourceHash(): string {
  const sourceDirectory = fileURLToPath(new URL('../', import.meta.url));
  const digest = createHash('sha256');
  for (const relative of ['policies/xenon-legacy-runtime.ts']) {
    digest.update(`src/${relative}`).update('\0');
    digest.update(readFileSync(resolve(sourceDirectory, relative))).update('\0');
  }
  return digest.digest('hex');
}

export function validateRunnerProvenance(actualHash = computeRunnerImplementationHash()): string {
  if (FROZEN_TARGET_COMMIT !== '8b2438bc2c633c98e2e86923fc8f0eaeacda0340'
      || APPROVED_CROSS_COMMIT !== 'ebb0495f0846211bcdbef20a42701295670df266')
    throw new Error('runner extraction/base commit pin drifted');
  if (RUNNER_SOURCE_BASE_COMMIT !== 'd71c67325912bc076ef6d6715a6845ca605ceafe'
      || TARGET_DEPLOYMENT_PROFILE !== 'sf6-991-pre-unclose-16'
      || TARGET_ENGINE_COMMIT !== '991acfe56ed096775dca728e2382fe56158d0a79')
    throw new Error('runner source base or target deployment profile pin drifted');
  if (APPROVED_CROSS_POLICY_SOURCE_HASH !== SHARED_APPROVED_POLICY_SOURCE_HASH)
    throw new Error('approved cross policySourceHash pin drifted');
  if (computeLegacyRuntimeSourceHash() !== FROZEN_LEGACY_POLICY_SOURCE_HASH)
    throw new Error('frozen legacy runtime source hash drifted');
  if (actualHash !== EXPECTED_RUNNER_IMPLEMENTATION_HASH)
    throw new Error(`runner implementation hash mismatch: expected ${EXPECTED_RUNNER_IMPLEMENTATION_HASH}, got ${actualHash}`);
  return actualHash;
}

export function runnerManifest(options: RunnerOptions): JsonObject {
  const implementationHash = validateRunnerProvenance();
  const policy = createUniversalXenonPolicy({
    configuredOpponent: options.opponent, actualOpponent: options.opponent,
    profile: options.profile, actionDelay: options.actionDelay,
    observationAgeFrames: 0, targetSeed: options.seed,
  });
  return {
    schema: RUNNER_SCHEMA,
    runnerSourceBaseCommit: RUNNER_SOURCE_BASE_COMMIT,
    targetDeploymentProfile: TARGET_DEPLOYMENT_PROFILE,
    targetProfileAttestation: 'exact-authenticated-welcome-roster-required',
    approvedCrossCommit: APPROVED_CROSS_COMMIT,
    frozenTargetCommit: FROZEN_TARGET_COMMIT,
    approvedCrossPolicySourceHash: APPROVED_CROSS_POLICY_SOURCE_HASH,
    implementationFiles: [...RUNNER_IMPLEMENTATION_FILES],
    implementationHash,
    expectedImplementationHash: EXPECTED_RUNNER_IMPLEMENTATION_HASH,
    goldenTraceHash: computeGoldenTraceHash(),
    pinnedEngineCommit: PINNED_ENGINE_COMMIT,
    expectedEngine: EXPECTED_ENGINE_VERSION,
    pinnedRoster: [...PINNED_ROSTER],
    pinnedRosterHash: PINNED_ROSTER_HASH,
    policyProfile: policy.profile,
    actuatorProfile: policy.actuatorProfile,
    policyId: policy.policyId,
    policyHash: policy.policyHash,
    policySourceHash: policy.sourceHash,
    policyConfig: policy.config,
    policyConfigHash: policy.configHash,
    delegateLaunchHash: policy.delegateLaunchHash,
    launchHash: policy.launchHash,
    configuredOpponent: options.opponent,
    expectedActualOpponent: options.opponent,
    ownCharacter: 'XENON',
    exactHandle: options.handle,
    exactTargetHandle: options.target,
    actionDelay: options.actionDelay,
    observationAgeFrames: policy.observationAgeFrames,
    executionHorizon: {
      observationAgeFrames: policy.observationAgeFrames,
      applicationDelayFrames: policy.actionDelay,
    },
    targetSeed: options.seed,
    matchLimit: options.matches,
    directLoungeOnly: true,
    quickQueueAllowed: false,
    identityProvided: true,
    dryRun: options.dryRun,
  };
}

function asWireFighter(value: unknown): WireFighterObservation {
  if (!value || typeof value !== 'object') throw new Error('state fighter is missing');
  const fighter = value as JsonObject;
  const numeric = ['x', 'y', 'vx', 'vy', 'hp', 'wins', 'attackFrame', 'stun'] as const;
  if (numeric.some((field) => typeof fighter[field] !== 'number')
      || (fighter.facing !== 1 && fighter.facing !== -1)
      || typeof fighter.attack !== 'string' || typeof fighter.crouching !== 'boolean')
    throw new Error('state fighter does not match deployed wire shape');
  return fighter as unknown as WireFighterObservation;
}

function asWireProjectiles(value: unknown): WireProjectileObservation[] {
  if (!Array.isArray(value)) throw new Error('state projectiles must be an array');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('invalid projectile wire row');
    const projectile = entry as JsonObject;
    if ((projectile.owner !== 'a' && projectile.owner !== 'b')
        || ['x', 'y', 'vx'].some((field) => typeof projectile[field] !== 'number')
        || typeof projectile.style !== 'string') throw new Error('invalid projectile wire row');
    return projectile as unknown as WireProjectileObservation;
  });
}

interface LoungeRosterEntry {
  id: string;
  name: string;
  cursor: number;
  elo: number;
}

const MAX_LOUNGE_ROSTER_ENTRIES = 256;

function minimalLoungeRoster(value: unknown): LoungeRosterEntry[] {
  if (!Array.isArray(value) || value.length > MAX_LOUNGE_ROSTER_ENTRIES)
    throw new Error('invalid or oversized Lounge roster');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('invalid Lounge roster entry');
    const entry = raw as JsonObject;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 128
        || typeof entry.name !== 'string' || !entry.name || entry.name.length > 64
        || !Number.isInteger(entry.cursor)
        || typeof entry.elo !== 'number' || !Number.isFinite(entry.elo))
      throw new Error('invalid Lounge roster entry');
    return { id: entry.id, name: entry.name, cursor: Number(entry.cursor), elo: entry.elo };
  });
}

export interface ControllerIo {
  send(message: JsonObject): void;
  close(): void;
  audit: AuditSink;
  fetchOfficial(mid: string): Promise<unknown>;
  finished?(status: { ok: boolean; reason: string }): void;
  schedule?(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearSchedule?(timer: ReturnType<typeof setTimeout>): void;
}

export function createRunnerController(options: RunnerOptions, health: HealthPayload, io: ControllerIo) {
  validateRunnerProvenance();
  validateHealth(health);
  const declaredPolicy = createUniversalXenonPolicy({
    configuredOpponent: options.opponent, actualOpponent: options.opponent,
    profile: options.profile, actionDelay: options.actionDelay,
    observationAgeFrames: 0, targetSeed: options.seed,
  });

  let hiReceived = false;
  let welcomed = false;
  let inLounge = false;
  let challengeSent = false;
  let matchStarted = false;
  let stopped = false;
  let completed = 0;
  let mid = '';
  let role: Side | null = null;
  let policy: UniversalPolicyBinding | null = null;
  const actuator = createXenonActuator({ safetyProfile: declaredPolicy.actuatorProfile });
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let pongDeadline: ReturnType<typeof setTimeout> | null = null;
  let pingSequence = 0;
  let latestLoungeRoster: LoungeRosterEntry[] | null = null;
  let transportEnded = false;
  const schedule = io.schedule ?? ((handler: () => void, ms: number) => setTimeout(handler, ms));
  const clearSchedule = io.clearSchedule ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));

  const send = (message: JsonObject): void => {
    if (message.t === 'queue' || message.t === 'dequeue') throw new Error('quick-match commands are forbidden');
    io.audit.append('outbound', message);
    io.send(message);
  };

  const clearKeepalive = (): void => {
    if (pingTimer) clearSchedule(pingTimer);
    if (pongDeadline) clearSchedule(pongDeadline);
    pingTimer = null;
    pongDeadline = null;
  };

  const idleInLounge = (): boolean => welcomed && inLounge && !challengeSent
    && !matchStarted && !stopped && !transportEnded;

  const armKeepalive = (): void => {
    if (!idleInLounge() || pingTimer || pongDeadline) return;
    pingTimer = schedule(() => {
      pingTimer = null;
      if (!idleInLounge()) return;
      const sequence = ++pingSequence;
      io.audit.append('keepalive-ping', { sequence, intervalMs: LOUNGE_PING_INTERVAL_MS });
      send({ t: 'ping' });
      pongDeadline = schedule(() => {
        pongDeadline = null;
        if (idleInLounge()) finish(false, `Lounge keepalive pong timeout after ping ${sequence}`);
      }, LOUNGE_PONG_TIMEOUT_MS);
    }, LOUNGE_PING_INTERVAL_MS);
  };

  const finish = (ok: boolean, reason: string): void => {
    if (stopped) return;
    stopped = true;
    clearKeepalive();
    latestLoungeRoster = null;
    const actuation = actuator.status();
    io.audit.append('stop', { ok, reason, completed, localSeq: actuation.localSeq, lastAck: actuation.lastAck });
    if (matchStarted) send({ t: 'leave' });
    else if (inLounge) send({ t: 'leaveLounge' });
    else send({ t: 'leave' });
    io.finished?.({ ok, reason });
  };

  const verifyOfficial = (payload: unknown, matchEndResult: unknown): JsonObject => {
    if (!payload || typeof payload !== 'object') throw new Error('official result payload missing');
    if (!matchEndResult || typeof matchEndResult !== 'object') throw new Error('authoritative matchEnd result missing');
    const outer = payload as JsonObject;
    const match = outer.match as JsonObject | undefined;
    if (!match || match.id !== mid) throw new Error('official result match id mismatch');
    const expectedAName = role === 'a' ? options.handle : options.target;
    const expectedBName = role === 'b' ? options.handle : options.target;
    const expectedAChar = role === 'a' ? 'XENON' : options.opponent;
    const expectedBChar = role === 'b' ? 'XENON' : options.opponent;
    if (match.a_name !== expectedAName || match.b_name !== expectedBName
        || match.a_char !== expectedAChar || match.b_char !== expectedBChar)
      throw new Error('official result identities or characters mismatch');
    if (match.mode !== 'versus' || match.engine_version !== EXPECTED_ENGINE_VERSION)
      throw new Error('official result mode or engine version mismatch');
    if (match.end_reason !== 'ko' && match.end_reason !== 'time')
      throw new Error(`official result is not a clean completion: ${String(match.end_reason)}`);
    if ((match.winner !== 'a' && match.winner !== 'b')
        || !Number.isInteger(match.a_rounds) || !Number.isInteger(match.b_rounds))
      throw new Error('official result winner/rounds are invalid');
    const winnerSide = match.winner as Side;
    const winnerRounds = Number(winnerSide === 'a' ? match.a_rounds : match.b_rounds);
    const loserRounds = Number(winnerSide === 'a' ? match.b_rounds : match.a_rounds);
    if (winnerRounds !== 2 || loserRounds < 0 || loserRounds >= 2)
      throw new Error('official result winner/rounds are inconsistent');
    const result = matchEndResult as JsonObject;
    const officialWinnerName = winnerSide === 'a' ? expectedAName : expectedBName;
    const officialLoserName = winnerSide === 'a' ? expectedBName : expectedAName;
    const officialWinnerChar = winnerSide === 'a' ? expectedAChar : expectedBChar;
    if (result.winner !== officialWinnerName || result.loser !== officialLoserName
        || result.winnerChar !== officialWinnerChar || result.youWon !== (winnerSide === role))
      throw new Error('official result contradicts authoritative matchEnd');
    return outer;
  };

  const challengeFromLatestRoster = (): void => {
    if (!inLounge || !latestLoungeRoster || challengeSent || matchStarted || stopped) return;
    const targets = latestLoungeRoster.filter((entry) => entry.name === options.target);
    if (!targets.length) return;
    if (targets.length !== 1) return finish(false, 'target handle is not unique in Lounge');
    const target = targets[0]!;
    if (cursorCharacter(target.cursor) !== options.opponent)
      return finish(false, 'target Lounge cursor/character mismatch');
    challengeSent = true;
    latestLoungeRoster = null;
    clearKeepalive();
    send({ t: 'challenge', targetId: target.id });
  };

  const handleState = (message: JsonObject): void => {
    if (!matchStarted || stopped || !role) return;
    if (!Number.isInteger(message.frame) || !Number.isInteger(message.ack)
        || (message.phase !== 'countdown' && message.phase !== 'fight'
          && message.phase !== 'round-over' && message.phase !== 'match-over')
        || typeof message.hitStop !== 'number') return finish(false, 'invalid state envelope');
    const frame = Number(message.frame);
    const ack = Number(message.ack);
    const you = asWireFighter(message.you);
    const opponent = asWireFighter(message.opp);
    const opponentWire = message.opp as JsonObject;
    if (typeof opponentWire.active !== 'boolean' || typeof opponentWire.casting !== 'boolean')
      return finish(false, 'opponent actuation flags do not match deployed wire shape');
    const projectiles = asWireProjectiles(message.projectiles);
    io.audit.append('inbound-state', message);
    const phase = message.phase as MatchPhase;
    const result = actuator.step({
      frame, ack, phase, hitStop: Number(message.hitStop),
      you: {
        attack: you.attack, stun: you.stun, facing: you.facing,
        x: you.x, y: you.y, vy: you.vy,
      },
      opponent: {
        attack: opponent.attack, attackFrame: opponent.attackFrame, stun: opponent.stun,
        facing: opponent.facing, x: opponent.x,
        active: opponentWire.active, casting: opponentWire.casting,
      },
      observationAgeFrames: 0,
      applicationDelayFrames: options.actionDelay,
    }, () => {
      if (!policy) throw new Error('policy is not bound to authoritative matchStart character');
      const status = actuator.status();
      const confirmedPhaseAgeFrames = status.lastConfirmedAttack === 'phase' && status.lastConfirmedFrame !== null
        ? Math.max(0, frame - status.lastConfirmedFrame) : null;
      return policy.decide(
        adaptBotWireContext(you, opponent, projectiles, phase, frame, role!),
        { confirmedPhaseAgeFrames },
      );
    });
    for (const audit of result.audits) io.audit.append(audit.event, audit.payload);
    if (result.failure) return finish(false, result.failure);
    if (!result.emission) return;
    io.audit.append('decision', {
      frame, inboundAck: result.emission.inboundAck, localSeq: result.emission.sequence,
      reason: result.emission.reason, intent: result.emission.intent,
      wireAction: result.emission.input, ackLedger: result.emission.ackLedger,
    });
    send({ t: 'input', ...result.emission.input });
  };

  async function handle(message: JsonObject): Promise<void> {
    if (transportEnded) return;
    if (message.t === 'state') io.audit.append('inbound-state-envelope', message);
    else if (message.t === 'lounge') {
      io.audit.append('inbound-lounge-envelope', {
        rosterCount: Array.isArray(message.roster) ? message.roster.length : null,
        chatCount: Array.isArray(message.chat) ? message.chat.length : null,
      });
    } else io.audit.append('inbound', message);
    try {
      switch (message.t) {
        case 'hi':
          if (hiReceived || welcomed) return finish(false, 'duplicate or out-of-order hi');
          if (message.service !== 'ringside-bot') return finish(false, 'bot service hi mismatch');
          hiReceived = true;
          break;
        case 'welcome':
          // `ssh ... play` injects {t:'hello', trustedFp} inside ssh-server.ts.
          // Client stdin must never send a second hello/API key.
          if (!hiReceived) return finish(false, 'welcome received before play proxy hi');
          if (welcomed) return finish(false, 'duplicate welcome');
          if (message.name !== options.handle) return finish(false, 'authenticated handle mismatch');
          if (message.channel !== 'bot-api') return finish(false, 'authenticated channel mismatch');
          validatePinnedRoster(message.roster);
          welcomed = true;
          io.audit.append('preflight', {
            health, roster: message.roster, rosterHash: PINNED_ROSTER_HASH,
            authenticatedIdentity: { name: message.name, elo: message.elo, channel: message.channel },
          });
          send({ t: 'joinLounge', char: 'XENON' });
          break;
        case 'joinedLounge':
          if (!welcomed || message.char !== 'XENON') return finish(false, 'Lounge join character mismatch');
          inLounge = true;
          challengeFromLatestRoster();
          armKeepalive();
          break;
        case 'pong': {
          if (!pongDeadline) {
            io.audit.append('keepalive-pong-ignored', { reason: 'no-ping-outstanding' });
            break;
          }
          clearSchedule(pongDeadline);
          pongDeadline = null;
          io.audit.append('keepalive-pong', { sequence: pingSequence });
          armKeepalive();
          break;
        }
        case 'lounge': {
          if (!welcomed || challengeSent || matchStarted || stopped) break;
          latestLoungeRoster = minimalLoungeRoster(message.roster);
          io.audit.append('lounge-roster-cached', {
            roster: latestLoungeRoster.map((entry) => ({ ...entry })),
            targetMatches: latestLoungeRoster.filter((entry) => entry.name === options.target).length,
            joined: inLounge,
          });
          challengeFromLatestRoster();
          break;
        }
        case 'matchStart':
          if (!challengeSent || matchStarted || completed >= options.matches) return finish(false, 'unsolicited or excess matchStart');
          if (message.oppName !== options.target || cursorCharacter(message.oppCursor) !== options.opponent
              || cursorCharacter(message.yourCursor) !== 'XENON') return finish(false, 'matchStart identity/cursor/character mismatch');
          if ((message.role !== 'a' && message.role !== 'b') || typeof message.mid !== 'string' || !message.mid)
            return finish(false, 'invalid matchStart envelope');
          matchStarted = true;
          inLounge = false;
          clearKeepalive();
          mid = message.mid;
          role = message.role;
          policy = createUniversalXenonPolicy({
            configuredOpponent: options.opponent,
            actualOpponent: cursorCharacter(message.oppCursor) as UniversalOpponent,
            profile: options.profile,
            actionDelay: options.actionDelay,
            observationAgeFrames: 0,
            targetSeed: options.seed,
          });
          io.audit.append('match-validated', {
            mid, role, opponentHandle: message.oppName, opponentCursor: message.oppCursor,
            opponentCharacter: policy.actualOpponent, policyProfile: policy.profile,
            actuatorProfile: policy.actuatorProfile, policyId: policy.policyId,
            policyHash: policy.policyHash, policySourceHash: policy.sourceHash,
            policyConfigHash: policy.configHash, delegateLaunchHash: policy.delegateLaunchHash,
            actionDelay: policy.actionDelay, observationAgeFrames: policy.observationAgeFrames,
            targetSeed: policy.targetSeed, launchHash: policy.launchHash,
          });
          break;
        case 'state':
          handleState(message);
          break;
        case 'matchEnd': {
          if (!matchStarted || stopped || completed >= options.matches) return finish(false, 'unexpected matchEnd');
          const official = verifyOfficial(await io.fetchOfficial(mid), message.result);
          completed++;
          const replay = `https://${options.host}/matches/${encodeURIComponent(mid)}`;
          io.audit.append('official-result', { mid, result: message.result, official, replay });
          finish(true, 'one authoritative match completed');
          break;
        }
        case 'left':
        case 'leftLounge':
          if (stopped) io.close();
          break;
        case 'queued':
          finish(false, 'server placed bounded runner in forbidden quick queue');
          break;
        case 'error':
          finish(false, `server error: ${String(message.msg ?? message.code ?? 'unknown')}`);
          break;
      }
    } catch (error) {
      finish(false, error instanceof Error ? error.message : String(error));
    }
  }

  return {
    handle,
    abort(reason: string) { finish(false, reason); },
    transportClosed() { transportEnded = true; clearKeepalive(); latestLoungeRoster = null; },
    status: () => ({
      hiReceived, welcomed, inLounge, challengeSent, matchStarted, stopped, completed, mid, role,
      ...actuator.status(),
      cachedLoungeRoster: latestLoungeRoster?.map((entry) => ({ ...entry })) ?? null, transportEnded,
    }),
  };
}

export function parseArgs(argv: string[]): RunnerOptions & { help?: boolean } {
  const valueOptions = new Set([
    'identity', 'handle', 'target', 'opponent', 'profile', 'output', 'host', 'action-delay',
    'seed', 'matches', 'timeout-ms',
  ]);
  const values: Record<string, string> = {};
  let dryRun = false, help = false;
  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index]!;
    if (!raw.startsWith('--')) throw new Error(`unexpected argument: ${raw}`);
    const name = raw.slice(2);
    if (name === 'dry-run') { dryRun = true; continue; }
    if (name === 'help') { help = true; continue; }
    if (!valueOptions.has(name)) throw new Error(`unknown option: --${name}`);
    if (values[name] !== undefined) throw new Error(`duplicate option: --${name}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values[name] = value;
  }
  if (help) return { identity: '', handle: '', target: '', opponent: 'OMEGA', profile: 'new-wave', output: '', host: '', actionDelay: 0, seed: 0, matches: 1, timeoutMs: DEFAULT_TIMEOUT_MS, dryRun, help };
  for (const required of ['identity', 'handle', 'target', 'opponent', 'profile', 'output'])
    if (!values[required]) throw new Error(`--${required} is required`);
  const opponent = values.opponent!.toUpperCase();
  if (!isUniversalOpponent(opponent))
    throw new Error(`--opponent must be one of: ${UNIVERSAL_OPPONENTS.join(', ')}`);
  const profile = values.profile!;
  if (profile !== 'new-wave' && profile !== 'legacy')
    throw new Error('--profile must be new-wave or legacy');
  if (profile !== expectedProfile(opponent))
    throw new Error(`--profile must be ${expectedProfile(opponent)} for ${opponent}`);
  const actionDelay = Number(values['action-delay'] ?? 0);
  const seed = Number(values.seed ?? 2026081901);
  const matches = Number(values.matches ?? 1);
  const timeoutMs = Number(values['timeout-ms'] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(actionDelay) || actionDelay < 0 || actionDelay > 30) throw new Error('--action-delay must be an integer from 0 to 30');
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  if (matches !== 1) throw new Error('--matches is hard-limited to exactly 1');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT_MS)
    throw new Error(`--timeout-ms must be an integer from 1000 to ${MAX_TIMEOUT_MS}`);
  const identity = resolve(values.identity!);
  if (!existsSync(identity) || !statSync(identity).isFile()) throw new Error('--identity must name a dedicated SSH private-key file');
  const output = resolve(values.output!);
  if (existsSync(output)) throw new Error('--output must not already exist (exclusive creation)');
  return {
    identity, handle: values.handle!, target: values.target!, opponent, profile,
    output, host: values.host ?? 'sshfighter.com', actionDelay, seed, matches: 1,
    timeoutMs, dryRun,
  };
}

function defaultFetchJson(url: string): Promise<unknown> {
  return fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).pathname}`);
    return response.json() as Promise<unknown>;
  });
}

function sshCommandArgs(options: RunnerOptions, command: 'token' | 'play'): string[] {
  return [
    '-T', '-i', options.identity,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
    '-o', 'NumberOfPasswordPrompts=0', '-o', 'ConnectTimeout=10',
    '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
    `${options.handle}@${options.host}`, command,
  ];
}

export function mintApiToken(
  options: RunnerOptions,
  spawnToken: SpawnToken = spawn as unknown as SpawnToken,
  schedule: (handler: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  clearSchedule: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): Promise<string> {
  return new Promise<string>((resolveToken, rejectToken) => {
    let child: TokenChild;
    try {
      child = spawnToken('ssh', sshCommandArgs(options, 'token'), { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      rejectToken(new Error('token mint spawn failed'));
      return;
    }
    let stdout = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let exited = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const timeout = schedule(() => fail(new Error('token mint timeout'), true), TOKEN_MINT_TIMEOUT_MS);
    const terminate = (): void => {
      if (exited) return;
      try { child.kill('SIGTERM'); } catch { /* continue escalation */ }
      killTimer = schedule(() => { if (!exited) { try { child.kill('SIGKILL'); } catch { /* ignore */ } } }, 1000);
    };
    const cleanup = (): void => {
      clearSchedule(timeout);
      if (killTimer && exited) clearSchedule(killTimer);
    };
    function fail(error: Error, terminateChild = false): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminateChild) terminate();
      rejectToken(error);
    }
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      stdoutBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (stdoutBytes > MAX_TOKEN_OUTPUT_BYTES) return fail(new Error('token mint output exceeded bound'), true);
      stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (settled) return;
      stderrBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (stderrBytes > MAX_TOKEN_OUTPUT_BYTES) fail(new Error('token mint error output exceeded bound'), true);
    });
    child.on('error', () => fail(new Error('token mint child error'), true));
    child.on('exit', (code) => {
      exited = true;
      cleanup();
      if (settled) return;
      if (code !== 0) return fail(new Error(`token mint exited ${String(code)}`));
      const lines = stdout.replaceAll('\r', '').split('\n');
      // Count loosely recognized labels before validating their values. This
      // prevents a valid line from masking an additional malformed or
      // conflicting player/key line in otherwise successful mint output.
      const playerLines = lines.filter((line) => /^\s*player\s*:/.test(line));
      const keyLines = lines.filter((line) => /^\s*api key\s*:/.test(line));
      if (playerLines.length !== 1 || keyLines.length !== 1
          || playerLines[0] !== `player  : ${options.handle}`)
        return fail(new Error('token mint returned missing, malformed, duplicate, or wrong-player output'));
      const keyMatch = /^api key : (rk_[A-Za-z0-9_-]{32})$/.exec(keyLines[0]!);
      if (!keyMatch)
        return fail(new Error('token mint returned missing, malformed, duplicate, or wrong-player output'));
      settled = true;
      resolveToken(keyMatch[1]!);
    });
  });
}

export function createSshTransport(
  options: RunnerOptions,
  spawnSsh: SpawnSsh = spawn as unknown as SpawnSsh,
  schedule: (handler: () => void, ms: number) => ReturnType<typeof setTimeout> = setTimeout,
  clearSchedule: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): RunnerTransport {
  const child = spawnSsh('ssh', sshCommandArgs(options, 'play'), { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = readline.createInterface({ input: child.stdout });
  let messageHandler: (message: JsonObject) => void | Promise<void> = () => {};
  let exitHandler: (code: number | null) => void = () => {};
  let errorHandler: (error: Error) => void = () => {};
  let messageHandlerReady = false;
  let exitHandlerReady = false;
  let errorHandlerReady = false;
  let bufferedExit: number | null | undefined;
  let bufferedError: Error | null = null;
  const bufferedMessages: JsonObject[] = [];
  let chain = Promise.resolve();
  let closing = false;
  let exited = false;
  let termTimer: ReturnType<typeof setTimeout> | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  lines.on('line', (raw) => {
    const line = raw.trim();
    if (!line.startsWith('{')) return;
    try {
      const message = JSON.parse(line) as JsonObject;
      if (!messageHandlerReady) bufferedMessages.push(message);
      else chain = chain.then(() => messageHandler(message)).then(() => undefined);
    } catch { /* ignore non-protocol SSH banner output */ }
  });
  child.on('exit', (code) => {
    exited = true;
    if (termTimer) clearSchedule(termTimer);
    if (killTimer) clearSchedule(killTimer);
    if (exitHandlerReady) exitHandler(code);
    else bufferedExit = code;
  });
  child.on('error', (error) => {
    if (errorHandlerReady) errorHandler(error);
    else bufferedError = error;
  });
  return {
    send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); },
    close() {
      if (closing) return;
      closing = true;
      try { child.stdin.end(); } catch { /* continue to termination escalation */ }
      termTimer = schedule(() => { if (!exited) child.kill('SIGTERM'); }, 250);
      killTimer = schedule(() => { if (!exited) child.kill('SIGKILL'); }, 1000);
    },
    onMessage(handler) {
      messageHandler = handler;
      messageHandlerReady = true;
      for (const message of bufferedMessages.splice(0))
        chain = chain.then(() => messageHandler(message)).then(() => undefined);
    },
    onExit(handler) {
      exitHandler = handler;
      exitHandlerReady = true;
      if (bufferedExit !== undefined) { const code = bufferedExit; bufferedExit = undefined; exitHandler(code); }
    },
    onError(handler) {
      errorHandler = handler;
      errorHandlerReady = true;
      if (bufferedError) { const error = bufferedError; bufferedError = null; errorHandler(error); }
    },
  };
}

const DEFAULT_DEPS: RunnerDependencies = {
  fetchJson: defaultFetchJson,
  mintToken: mintApiToken,
  openTransport: createSshTransport,
  createAudit: (path) => new SecureJsonlAudit(path),
  sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  schedule: (handler, ms) => setTimeout(handler, ms),
  clearSchedule: (timer) => clearTimeout(timer),
};

export async function executeRunner(options: RunnerOptions, overrides: Partial<RunnerDependencies> = {}): Promise<void> {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  const audit = deps.createAudit(options.output);
  audit.append('manifest', runnerManifest(options));
  if (options.dryRun) {
    audit.append('dry-run', { networkAccess: false, socketOpened: false, healthFetched: false });
    audit.close();
    return;
  }

  let transport: RunnerTransport | null = null;
  try {
    const health = await deps.fetchJson(`https://${options.host}/api/health`);
    validateHealth(health);
    audit.append('health', health);
    let mintedKey = await deps.mintToken(options);
    if (!/^rk_[A-Za-z0-9_-]{32}$/.test(mintedKey)) throw new Error('token mint dependency returned invalid key');
    // Successful mint proves the SSH identity/handle binding. The key is then
    // discarded: `ssh ... play` authenticates by an injected trustedFp hello.
    audit.append('token-minted', { transport: 'ssh', exactHandle: options.handle, keyPersisted: false });
    mintedKey = '';
    transport = deps.openTransport(options);
    await new Promise<void>((resolveRun, rejectRun) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let shutdownDeadline: ReturnType<typeof setTimeout> | undefined;
      let controllerFailure: Error | undefined;
      let failureRecorded = false;
      let controller: ReturnType<typeof createRunnerController> | undefined;
      const recordFailure = (error: Error, source: string): void => {
        if (failureRecorded) return;
        failureRecorded = true;
        audit.append('failed', { reason: error.message, source });
      };
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        controller?.transportClosed();
        if (deadline) deps.clearSchedule(deadline);
        if (shutdownDeadline) deps.clearSchedule(shutdownDeadline);
        audit.close();
        error ? rejectRun(error) : resolveRun();
      };
      const beginShutdown = (error?: Error, source = 'shutdown'): void => {
        if (error) {
          controllerFailure = controllerFailure ?? error;
          recordFailure(controllerFailure, source);
        }
        controller?.transportClosed();
        transport!.close();
        if (!shutdownDeadline) shutdownDeadline = deps.schedule(() => {
          audit.append('transport-termination-timeout', { error: controllerFailure?.message ?? null });
          finish(controllerFailure ?? new Error('transport termination timeout'));
        }, 2000);
      };
      const fetchOfficial = async (mid: string): Promise<unknown> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try { return await deps.fetchJson(`https://${options.host}/api/matches/${encodeURIComponent(mid)}`); }
          catch (error) { lastError = error; if (attempt < 10) await deps.sleep(250); }
        }
        throw lastError instanceof Error ? lastError : new Error('official result unavailable');
      };
      controller = createRunnerController(options, health, {
        send: (message) => transport!.send(message),
        close: () => beginShutdown(),
        audit, fetchOfficial, schedule: deps.schedule, clearSchedule: deps.clearSchedule,
        finished: ({ ok, reason }) => {
          if (!ok) {
            controllerFailure = new Error(reason);
            recordFailure(controllerFailure, 'controller');
          }
        },
      });
      transport!.onMessage((message) => controller.handle(message));
      transport!.onExit((code) => {
        if (settled) return;
        controller!.transportClosed();
        audit.append('transport-exit', { code, stopped: controller.status().stopped });
        const exitError = controllerFailure
          ?? (controller.status().stopped
            ? (code ? new Error(`ssh exited ${code}`) : undefined)
            : new Error(`ssh exited before bounded completion (${String(code)})`));
        if (exitError) recordFailure(exitError, 'transport-exit');
        finish(exitError);
      });
      transport!.onError((error) => {
        if (settled) return;
        const safeMessage = error.message.replaceAll(options.identity, '[REDACTED_IDENTITY]');
        const safeError = new Error(`ssh transport error: ${safeMessage}`);
        audit.append('transport-error', { message: safeMessage });
        beginShutdown(safeError, 'transport-error');
      });
      deadline = deps.schedule(() => {
        controller.abort('global bounded-runner timeout');
        beginShutdown(new Error('global bounded-runner timeout'), 'global-timeout');
      }, options.timeoutMs);
    });
  } catch (error) {
    try { audit.append('fatal', { error: error instanceof Error ? error.message : String(error) }); } catch { /* ledger may already be closed */ }
    try { transport?.close(); } catch { /* ignore */ }
    try { audit.close(); } catch { /* ignore */ }
    throw error;
  }
}

const HELP = `Usage: pnpm runner:xenon --identity KEY --handle HANDLE --target HANDLE --opponent FIGHTER --profile PROFILE --output FILE [options]

Required:
  --identity KEY       dedicated SSH private key (never logged)
  --handle HANDLE      exact authenticated runner handle
  --target HANDLE      exact Lounge opponent handle
  --opponent FIGHTER   exact pinned non-XENON fighter (${UNIVERSAL_OPPONENTS.join(', ')})
  --profile PROFILE    exact policy profile: new-wave or legacy
  --output FILE        new exclusive JSONL ledger, created mode 0600

Options:
  --host HOST          default sshfighter.com
  --action-delay N     configured target delay, integer 0..30 (default 0)
  --seed N             deterministic policy RNG seed (default 2026081901)
  --matches 1          hard limit; no other value accepted
  --timeout-ms N       global bound, 1000..900000 (default 600000)
  --dry-run            create manifest ledger without health/network/socket
  --help               show this help`;

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(HELP);
    else await executeRunner(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

#!/usr/bin/env node
// One-match, incoming-challenge-only CODEX opponent runner. Importing this
// module is side-effect free; executeRunner() is the only network/SSH seam.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  closeSync, existsSync, fstatSync, openSync, readFileSync, statSync, writeSync,
} from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import readline from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AdaptiveCodexPolicy, DEFAULT_ADAPTIVE_CONFIG, type CombatObservation,
} from '../bot/adaptive-codex-policy.js';
import { specialMoveForAttack, specialMoveMotionCode } from '../game/moves.js';
import { emptyInputs, type AttackKind, type Inputs, type MatchPhase } from '../game/types.js';

type JsonObject = Record<string, unknown>;
type Side = 'a' | 'b';

export const TOOL_SOURCE_COMMIT = 'd71c67325912bc076ef6d6715a6845ca605ceafe';
export const PINNED_ENGINE_COMMIT = '991acfe56ed096775dca728e2382fe56158d0a79';
export const DEPLOYMENT_ATTESTATION = 'sf6-991-pre-UNCLOSE';
export const EXPECTED_ENGINE_VERSION = 'sf-6';
export const RUNNER_SCHEMA = 'codex-dgx-bounded-opponent/v1';
export const CONTROLLER_ID = 'adaptive-codex-fable-v2';
export const OWN_HANDLE = 'CODEX_DGX';
export const OWN_CHARACTER = 'CODEX';
export const TARGET_HANDLE = 'XENON_DGX';
export const TARGET_CHARACTER = 'XENON';
export const PINNED_ROSTER = [
  'BYU', 'MEN', 'BLANKO', 'CHONG', 'GYLE', 'ZANG', 'DHAL', 'HONDO',
  'KIRA', 'MAKO', 'OMEGA', 'CODEX', 'FABLE', 'MNEME', 'AJAX', 'XENON',
] as const;
export const POLICY_SOURCE_SHA256 = 'd5229442f8764abe123adab32ad384d3c5758cdb0aa8fa4020e7fd89e705a658';
export const POLICY_CONFIG_SHA256 = 'e7f75b7a21de51cd1c64a0deb14dd2b1027ce135b7ca015ea485b3891141adc2';
const CODEX_CURSOR = PINNED_ROSTER.indexOf(OWN_CHARACTER);
const XENON_CURSOR = PINNED_ROSTER.indexOf(TARGET_CHARACTER);
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_LOUNGE_ROSTER_ENTRIES = 256;
const ACK_TIMEOUT_FRAMES = 30;
const RETRY_AFTER_FRAMES = 3;
const MAX_EDGE_ATTEMPTS = 2;
const MAX_TOKEN_OUTPUT_BYTES = 32 * 1024;
export const TOKEN_MINT_TIMEOUT_MS = 15_000;
export const LOUNGE_PING_INTERVAL_MS = 30_000;
export const LOUNGE_PONG_TIMEOUT_MS = 10_000;

function stable(value: unknown): string {
  const normalized = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalized);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(Object.keys(entry as JsonObject).sort()
        .map((key) => [key, normalized((entry as JsonObject)[key])]));
    }
    return entry;
  };
  return JSON.stringify(normalized(value));
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export const PINNED_ROSTER_HASH = sha256(stable(PINNED_ROSTER));
export const CONTROLLER_HASH = sha256(stable({
  controllerId: CONTROLLER_ID,
  policySourceSha256: POLICY_SOURCE_SHA256,
  policyConfigSha256: POLICY_CONFIG_SHA256,
  config: DEFAULT_ADAPTIVE_CONFIG,
}));

export interface RunnerOptions {
  identity: string;
  output: string;
  host: string;
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

export interface TokenChild {
  stdout: Readable;
  stderr: Readable;
  on(event: 'exit', handler: (code: number | null) => void): unknown;
  on(event: 'error', handler: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnSsh = (
  command: string,
  args: string[],
  options: { stdio: ['pipe', 'pipe', 'inherit'] },
) => SshChild;
export type SpawnToken = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'pipe', 'pipe'] },
) => TokenChild;

export interface RunnerDependencies {
  fetchJson(url: string): Promise<unknown>;
  mintToken(options: RunnerOptions): Promise<string>;
  openTransport(options: RunnerOptions): RunnerTransport;
  createAudit(path: string): AuditSink;
  sleep(ms: number): Promise<void>;
  schedule(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearSchedule(timer: ReturnType<typeof setTimeout>): void;
}

function redactString(value: string): string {
  if (/^rk_[A-Za-z0-9_-]{16,}$/.test(value)) return '[REDACTED_TOKEN]';
  if (/^SHA256:[A-Za-z0-9+/=]{8,}$/.test(value)) return '[REDACTED_FINGERPRINT]';
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) return '[REDACTED_PRIVATE_KEY]';
  return value;
}

export function redact(value: unknown, key = ''): unknown {
  const normalized = key.toLowerCase();
  if (normalized === 'fp' || normalized.endsWith('_fp') || normalized.includes('fingerprint')
      || normalized.includes('privatekey') || normalized.includes('private_key')
      || normalized === 'identity' || normalized === 'identitypath' || normalized === 'identity_path'
      || normalized === 'key'
      || normalized === 'token' || normalized === 'apikey' || normalized === 'api_key') {
    return '[REDACTED]';
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .map(([childKey, child]) => [childKey, redact(child, childKey)]));
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
    writeSync(this.fd, `${JSON.stringify({ sequence: ++this.sequence, event, payload: redact(payload) })}\n`);
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
  if (health.ok !== true || health.service !== 'ringside' || health.engine !== EXPECTED_ENGINE_VERSION) {
    throw new Error(`live health mismatch: expected ringside/${EXPECTED_ENGINE_VERSION}`);
  }
}

export function validatePinnedRoster(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length !== PINNED_ROSTER.length
      || value.some((entry, index) => entry !== PINNED_ROSTER[index])
      || value.some((entry) => String(entry).toUpperCase() === 'UNCLOSE')) {
    throw new Error(`deployment attestation mismatch: expected exact ${DEPLOYMENT_ATTESTATION} 16-fighter roster`);
  }
}

export function cursorCharacter(cursor: unknown): string | null {
  return Number.isInteger(cursor) && Number(cursor) >= 0 && Number(cursor) < PINNED_ROSTER.length
    ? PINNED_ROSTER[Number(cursor)]!
    : null;
}

export function computePolicySourceHash(): string {
  return sha256(readFileSync(fileURLToPath(new URL('../bot/adaptive-codex-policy.ts', import.meta.url))));
}

export function computeRunnerSourceHash(): string {
  return sha256(readFileSync(fileURLToPath(import.meta.url)));
}

export function validateControllerProvenance(): void {
  if (computePolicySourceHash() !== POLICY_SOURCE_SHA256) throw new Error('adaptive CODEX policy source hash drifted');
  if (sha256(stable(DEFAULT_ADAPTIVE_CONFIG)) !== POLICY_CONFIG_SHA256) throw new Error('adaptive CODEX config hash drifted');
}

export function runnerManifest(options: RunnerOptions): JsonObject {
  validateControllerProvenance();
  return {
    schema: RUNNER_SCHEMA,
    toolSourceCommit: TOOL_SOURCE_COMMIT,
    runnerSourceSha256: computeRunnerSourceHash(),
    pinnedEngineCommit: PINNED_ENGINE_COMMIT,
    expectedEngineVersion: EXPECTED_ENGINE_VERSION,
    deploymentAttestation: DEPLOYMENT_ATTESTATION,
    pinnedRoster: [...PINNED_ROSTER],
    pinnedRosterHash: PINNED_ROSTER_HASH,
    controllerId: CONTROLLER_ID,
    controllerHash: CONTROLLER_HASH,
    policySourceSha256: POLICY_SOURCE_SHA256,
    policyConfig: DEFAULT_ADAPTIVE_CONFIG,
    policyConfigSha256: POLICY_CONFIG_SHA256,
    deterministic: true,
    seed: null,
    ownHandle: OWN_HANDLE,
    ownCharacter: OWN_CHARACTER,
    targetHandle: TARGET_HANDLE,
    targetCharacter: TARGET_CHARACTER,
    matchLimit: 1,
    directLoungeOnly: true,
    incomingChallengeOnly: true,
    quickQueueAllowed: false,
    outgoingChallengeAllowed: false,
    identityProvided: true,
    identityLogged: false,
    timeoutMs: options.timeoutMs,
    dryRun: options.dryRun,
    residualRisk: 'fail-closed safety after matchStart sends leave and therefore may create a forfeit; transport loss may do the same',
  };
}

interface LoungeRosterEntry {
  id: string;
  name: string;
  cursor: number;
  elo: number;
}

interface ChallengePeer {
  id: string;
  name: string;
}

function minimalLoungeRoster(value: unknown): LoungeRosterEntry[] {
  if (!Array.isArray(value) || value.length > MAX_LOUNGE_ROSTER_ENTRIES) {
    throw new Error('invalid or oversized Lounge roster');
  }
  const entries = value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('invalid Lounge roster entry');
    const entry = raw as JsonObject;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 128
        || typeof entry.name !== 'string' || !entry.name || entry.name.length > 64
        || !Number.isInteger(entry.cursor) || cursorCharacter(entry.cursor) === null
        || typeof entry.elo !== 'number' || !Number.isFinite(entry.elo)) {
      throw new Error('invalid Lounge roster entry');
    }
    return { id: entry.id, name: entry.name, cursor: Number(entry.cursor), elo: entry.elo };
  });
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error('duplicate Lounge roster id');
  }
  return entries;
}

function minimalChallengePeer(value: unknown): ChallengePeer | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('invalid incoming challenge');
  const peer = value as JsonObject;
  if (typeof peer.id !== 'string' || !peer.id || peer.id.length > 128
      || typeof peer.name !== 'string' || !peer.name || peer.name.length > 64) {
    throw new Error('invalid incoming challenge');
  }
  return { id: peer.id, name: peer.name };
}

function asObservation(message: JsonObject): CombatObservation {
  const fighter = (value: unknown): CombatObservation['you'] => {
    if (!value || typeof value !== 'object') throw new Error('state fighter is missing');
    const row = value as JsonObject;
    const numeric = ['x', 'y', 'vx', 'vy', 'hp', 'wins', 'attackFrame', 'stun'] as const;
    if (numeric.some((field) => typeof row[field] !== 'number')
        || (row.facing !== 1 && row.facing !== -1)
        || typeof row.attack !== 'string' || typeof row.crouching !== 'boolean') {
      throw new Error('state fighter does not match deployed wire shape');
    }
    return row as unknown as CombatObservation['you'];
  };
  if (!Number.isInteger(message.frame) || !Number.isInteger(message.round)
      || typeof message.roundTime !== 'number'
      || (message.phase !== 'countdown' && message.phase !== 'fight'
        && message.phase !== 'round-over' && message.phase !== 'match-over')) {
    throw new Error('invalid state observation envelope');
  }
  if (!Array.isArray(message.projectiles)) throw new Error('state projectiles must be an array');
  const projectiles = message.projectiles.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('invalid projectile wire row');
    const row = value as JsonObject;
    if ((row.owner !== 'a' && row.owner !== 'b')
        || typeof row.x !== 'number' || typeof row.y !== 'number' || typeof row.vx !== 'number') {
      throw new Error('invalid projectile wire row');
    }
    return row as unknown as CombatObservation['projectiles'][number];
  });
  return {
    frame: Number(message.frame),
    phase: message.phase as MatchPhase,
    round: Number(message.round),
    roundTime: Number(message.roundTime),
    you: fighter(message.you),
    opp: fighter(message.opp),
    projectiles,
  };
}

function hasAttackEdge(input: Inputs): boolean {
  return input.punch || input.kick || input.throw || (input.motion.length > 0 && input.motion !== 'N');
}

function withoutEdges(input: Inputs): Inputs {
  // The coordinator keeps a previous non-empty motion. N explicitly overwrites
  // it while all one-shot buttons are suppressed.
  return { ...input, jump: false, punch: false, kick: false, throw: false, motion: 'N' };
}

function intendedAttack(input: Inputs): AttackKind | 'unknown' {
  for (const attack of ['context', 'branchwalk', 'mergecomet'] as const) {
    const move = specialMoveForAttack(OWN_CHARACTER, attack);
    if (move && [specialMoveMotionCode(move, 1), specialMoveMotionCode(move, -1)].includes(input.motion)
        && input[move.button]) return attack;
  }
  if (input.throw) return 'throw';
  if (input.punch) return 'punch';
  if (input.kick) return 'kick';
  return 'unknown';
}

interface PendingEdge {
  input: Inputs;
  expectedAttack: AttackKind | 'unknown';
  acceptedAttacks: AttackKind[];
  predecessorAttack: AttackKind;
  attempt: number;
  sentSeq: number;
  sentFrame: number;
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
  validateControllerProvenance();
  validateHealth(health);
  const policy = new AdaptiveCodexPolicy(DEFAULT_ADAPTIVE_CONFIG);
  let hiReceived = false;
  let welcomed = false;
  let inLounge = false;
  let joinSent = false;
  let challengeAccepted = false;
  let matchStarted = false;
  let matchEnded = false;
  let stopped = false;
  let completed = 0;
  let mid = '';
  let role: Side | null = null;
  let localSeq = 0;
  let lastAck = 0;
  let pending: PendingEdge | null = null;
  let lastPhase: MatchPhase | null = null;
  let needsMotionReset = false;
  let motionResetSeq: number | null = null;
  let latestLoungeRoster: LoungeRosterEntry[] | null = null;
  let pendingIncoming: ChallengePeer | null = null;
  let transportEnded = false;
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let pongDeadline: ReturnType<typeof setTimeout> | null = null;
  let pingSequence = 0;
  const schedule = io.schedule ?? ((handler: () => void, ms: number) => setTimeout(handler, ms));
  const clearSchedule = io.clearSchedule ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));

  const send = (message: JsonObject): void => {
    if (['queue', 'dequeue', 'challenge', 'cancelChallenge'].includes(String(message.t))) {
      throw new Error(`forbidden outbound command: ${String(message.t)}`);
    }
    io.audit.append('outbound', message);
    io.send(message);
  };

  const clearKeepalive = (): void => {
    if (pingTimer) clearSchedule(pingTimer);
    if (pongDeadline) clearSchedule(pongDeadline);
    pingTimer = null;
    pongDeadline = null;
  };

  const idleInLounge = (): boolean => welcomed && inLounge && !challengeAccepted
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
    pendingIncoming = null;
    io.audit.append('stop', { ok, reason, completed, localSeq, lastAck, matchStarted, matchEnded });
    if (!ok && matchStarted && !matchEnded) {
      io.audit.append('safety-forfeit', { reason, residual: 'fail-closed leave after matchStart may record a forfeit' });
      send({ t: 'leave' });
    } else if (inLounge && !matchStarted) {
      send({ t: 'leaveLounge' });
    } else {
      io.close();
    }
    io.finished?.({ ok, reason });
  };

  const rejectIncoming = (reason: string): void => {
    if (inLounge && !challengeAccepted) send({ t: 'declineChallenge' });
    finish(false, reason);
  };

  const acceptIfExact = (): void => {
    if (!inLounge || !latestLoungeRoster || !pendingIncoming || challengeAccepted
        || matchStarted || stopped) return;
    if (pendingIncoming.name !== TARGET_HANDLE) return rejectIncoming('incoming challenger handle mismatch');
    const sameHandle = latestLoungeRoster.filter((entry) => entry.name === TARGET_HANDLE);
    if (sameHandle.length !== 1) return rejectIncoming('target handle is missing or non-unique in latest Lounge roster');
    const target = sameHandle[0]!;
    if (target.id !== pendingIncoming.id || cursorCharacter(target.cursor) !== TARGET_CHARACTER) {
      return rejectIncoming('incoming challenger id/cursor/character mismatch against latest Lounge roster');
    }
    challengeAccepted = true;
    clearKeepalive();
    io.audit.append('challenge-validated', {
      challenger: { id: target.id, name: target.name, cursor: target.cursor, character: TARGET_CHARACTER },
      ownHandle: OWN_HANDLE,
      ownCharacter: OWN_CHARACTER,
    });
    send({ t: 'acceptChallenge' });
  };

  const recordNoEmit = (observation: CombatObservation, reason: string, intent: Inputs | null = null): void => {
    io.audit.append('decision', {
      frame: observation.frame,
      phase: observation.phase,
      inboundAck: lastAck,
      localSeq: null,
      reason,
      intent,
      pendingBeforeEmit: pending ? { ...pending, input: pending.input } : null,
    });
    io.audit.append('emitted-action', { frame: observation.frame, localSeq: null, action: null });
  };

  const sendInput = (
    emitted: Inputs,
    intent: Inputs | null,
    observation: CombatObservation,
    reason: string,
  ): void => {
    const sequence = ++localSeq;
    io.audit.append('decision', {
      frame: observation.frame,
      phase: observation.phase,
      inboundAck: lastAck,
      localSeq: sequence,
      reason,
      intent,
      pendingBeforeEmit: pending ? { ...pending, input: pending.input } : null,
    });
    io.audit.append('emitted-action', { frame: observation.frame, localSeq: sequence, action: emitted });
    send({ t: 'input', ...emitted });
  };

  const verifyOfficial = (payload: unknown, matchEndResult: unknown): JsonObject => {
    if (!payload || typeof payload !== 'object') throw new Error('official result payload missing');
    if (!matchEndResult || typeof matchEndResult !== 'object') throw new Error('authoritative matchEnd result missing');
    const outer = payload as JsonObject;
    const match = outer.match as JsonObject | undefined;
    if (!match || match.id !== mid) throw new Error('official result match id mismatch');
    const expectedAName = role === 'a' ? OWN_HANDLE : TARGET_HANDLE;
    const expectedBName = role === 'b' ? OWN_HANDLE : TARGET_HANDLE;
    const expectedAChar = role === 'a' ? OWN_CHARACTER : TARGET_CHARACTER;
    const expectedBChar = role === 'b' ? OWN_CHARACTER : TARGET_CHARACTER;
    if (match.a_name !== expectedAName || match.b_name !== expectedBName
        || match.a_char !== expectedAChar || match.b_char !== expectedBChar) {
      throw new Error('official result identities or characters mismatch');
    }
    if (match.mode !== 'versus' || match.engine_version !== EXPECTED_ENGINE_VERSION) {
      throw new Error('official result mode or engine version mismatch');
    }
    if (match.end_reason !== 'ko' && match.end_reason !== 'time') {
      throw new Error(`official result is not a normal completion: ${String(match.end_reason)}`);
    }
    if ((match.winner !== 'a' && match.winner !== 'b')
        || !Number.isInteger(match.a_rounds) || !Number.isInteger(match.b_rounds)) {
      throw new Error('official result winner/rounds are invalid');
    }
    const winnerSide = match.winner as Side;
    const winnerRounds = Number(winnerSide === 'a' ? match.a_rounds : match.b_rounds);
    const loserRounds = Number(winnerSide === 'a' ? match.b_rounds : match.a_rounds);
    if (winnerRounds !== 2 || loserRounds < 0 || loserRounds >= 2) {
      throw new Error('official result winner/rounds are inconsistent');
    }
    const result = matchEndResult as JsonObject;
    const officialWinnerName = winnerSide === 'a' ? expectedAName : expectedBName;
    const officialLoserName = winnerSide === 'a' ? expectedBName : expectedAName;
    const officialWinnerChar = winnerSide === 'a' ? expectedAChar : expectedBChar;
    if (result.winner !== officialWinnerName || result.loser !== officialLoserName
        || result.winnerChar !== officialWinnerChar || result.youWon !== (winnerSide === role)) {
      throw new Error('official result contradicts authoritative matchEnd');
    }
    return outer;
  };

  const handleState = (message: JsonObject): void => {
    if (!matchStarted || matchEnded || stopped || !role) return;
    if (!Number.isInteger(message.ack) || typeof message.hitStop !== 'number') {
      return finish(false, 'invalid state transport envelope');
    }
    const ack = Number(message.ack);
    if (ack < lastAck || ack > localSeq) return finish(false, `invalid ack progression ${lastAck}->${ack}/${localSeq}`);
    lastAck = ack;
    const observation = asObservation(message);
    io.audit.append('state', { mid, role, ack, hitStop: message.hitStop, observation });
    const phase = observation.phase;
    if (phase !== 'fight') {
      if (pending) {
        io.audit.append('pending-abandoned', {
          frame: observation.frame, fromPhase: lastPhase, toPhase: phase,
          expectedAttack: pending.expectedAttack, attempt: pending.attempt, sentSeq: pending.sentSeq,
        });
        pending = null;
      }
      if (phase === 'round-over') needsMotionReset = true;
      lastPhase = phase;
      recordNoEmit(observation, 'nonfight-observation-only');
      return;
    }
    lastPhase = phase;

    if (needsMotionReset) {
      if (motionResetSeq === null) {
        const reset = { ...emptyInputs(), motion: 'N' };
        motionResetSeq = localSeq + 1;
        sendInput(reset, reset, observation, 'round-motion-reset');
        return;
      }
      if (ack < motionResetSeq) {
        recordNoEmit(observation, 'awaiting-round-motion-reset-ack');
        return;
      }
      io.audit.append('motion-reset-confirmed', { frame: observation.frame, ack, resetSeq: motionResetSeq });
      needsMotionReset = false;
      motionResetSeq = null;
    }

    if (pending && ack >= pending.sentSeq
        && pending.acceptedAttacks.includes(observation.you.attack)) {
      io.audit.append('attack-confirmed', {
        frame: observation.frame, actualAttack: observation.you.attack,
        expectedAttack: pending.expectedAttack, acceptedAttacks: pending.acceptedAttacks,
        predecessorAttack: pending.predecessorAttack, attempt: pending.attempt,
        sentSeq: pending.sentSeq, ack,
      });
      pending = null;
    }
    if (pending && ack >= pending.sentSeq && observation.you.attack !== 'none'
        && observation.you.attack !== pending.predecessorAttack) {
      return finish(false,
        `attack confirmation mismatch: expected ${pending.acceptedAttacks.join('|')}, got ${observation.you.attack}`);
    }
    if (pending && observation.frame - pending.sentFrame >= ACK_TIMEOUT_FRAMES) {
      const kind = ack < pending.sentSeq ? 'input ack timeout' : 'attack retry timeout';
      return finish(false, `${kind} at frame ${observation.frame}`);
    }

    const hitStop = Number(message.hitStop);
    if (pending) {
      // Do not send even a neutral motion behind an unacknowledged edge. A
      // server state generated before that edge can arrive after our write;
      // emitting N here could overtake/coalesce with it and overwrite the
      // canonical special motion before the coordinator's next tick.
      if (ack < pending.sentSeq) {
        recordNoEmit(observation,
          hitStop > 0 ? 'hitstop-pending-edge-awaiting-ack' : 'pending-edge-awaiting-ack');
        return;
      }
      if (ack >= pending.sentSeq && observation.frame - pending.sentFrame >= RETRY_AFTER_FRAMES) {
        if (pending.attempt >= MAX_EDGE_ATTEMPTS) return finish(false, `attack start timeout at frame ${observation.frame}`);
        if (observation.you.stun <= 0 && observation.you.attack === 'none' && hitStop === 0) {
          const retry = { ...pending.input };
          pending.attempt++;
          pending.sentFrame = observation.frame;
          pending.sentSeq = localSeq + 1;
          sendInput(retry, pending.input, observation, 'acked-no-start-retry');
          return;
        }
      }
      sendInput(withoutEdges(emptyInputs()), null, observation,
        hitStop > 0 ? 'hitstop-pending-edge-suppressed' : 'pending-edge-suppressed');
      return;
    }
    if (hitStop > 0) {
      sendInput(withoutEdges(emptyInputs()), null, observation, 'hitstop-edge-suppressed');
      return;
    }
    const before = new Map(policy.actions);
    const intent = policy.decide(observation);
    const newAction = [...policy.actions].find(([name, count]) => count > (before.get(name) ?? 0))?.[0];
    if (hasAttackEdge(intent)) {
      const expectedAttack = intendedAttack(intent);
      if (expectedAttack === 'unknown') return finish(false, 'policy emitted an unrecognized attack edge');
      pending = {
        input: { ...intent }, expectedAttack,
        // The engine canonically promotes an airborne kick edge to jumpkick.
        // The rounded bot wire cannot distinguish every near-ground case, so
        // both are valid confirmations for the same canonical kick button.
        acceptedAttacks: expectedAttack === 'kick' ? ['kick', 'jumpkick'] : [expectedAttack],
        predecessorAttack: observation.you.attack,
        attempt: 1,
        sentSeq: localSeq + 1, sentFrame: observation.frame,
      };
      sendInput(intent, intent, observation, newAction ?? 'new-canonical-edge');
      return;
    }
    sendInput({ ...intent, motion: intent.motion || 'N' }, intent, observation, newAction ?? 'level-action');
  };

  async function handle(message: JsonObject): Promise<void> {
    if (transportEnded) return;
    if (message.t === 'state') {
      io.audit.append('inbound-state-envelope', {
        frame: message.frame, phase: message.phase, ack: message.ack, hitStop: message.hitStop,
      });
    } else if (message.t === 'lounge') {
      io.audit.append('inbound-lounge-envelope', {
        rosterCount: Array.isArray(message.roster) ? message.roster.length : null,
        chatCount: Array.isArray(message.chat) ? message.chat.length : null,
      });
    } else {
      io.audit.append('inbound', message);
    }
    try {
      switch (message.t) {
        case 'hi':
          if (hiReceived || welcomed) return finish(false, 'duplicate or out-of-order hi');
          if (message.service !== 'ringside-bot') return finish(false, 'bot service hi mismatch');
          hiReceived = true;
          break;
        case 'welcome':
          // `ssh ... play` injects trustedFp. Client stdin must never emit hello.
          if (!hiReceived) return finish(false, 'welcome received before play-proxy hi');
          if (welcomed) return finish(false, 'duplicate welcome');
          if (message.name !== OWN_HANDLE) return finish(false, 'authenticated handle mismatch');
          if (message.channel !== 'bot-api') return finish(false, 'authenticated channel mismatch');
          validatePinnedRoster(message.roster);
          welcomed = true;
          io.audit.append('deployment-attested', {
            health,
            deploymentAttestation: DEPLOYMENT_ATTESTATION,
            roster: message.roster,
            rosterHash: PINNED_ROSTER_HASH,
            authenticatedIdentity: { name: message.name, elo: message.elo, channel: message.channel },
          });
          joinSent = true;
          send({ t: 'joinLounge', char: OWN_CHARACTER });
          break;
        case 'joinedLounge':
          if (!joinSent || !welcomed || inLounge || message.char !== OWN_CHARACTER) {
            return finish(false, 'Lounge join acknowledgment mismatch');
          }
          inLounge = true;
          acceptIfExact();
          armKeepalive();
          break;
        case 'lounge':
          if (!welcomed || matchStarted || stopped) break;
          latestLoungeRoster = minimalLoungeRoster(message.roster);
          io.audit.append('lounge-roster-cached', {
            roster: latestLoungeRoster,
            targetMatches: latestLoungeRoster.filter((entry) => entry.name === TARGET_HANDLE).length,
            joined: inLounge,
          });
          acceptIfExact();
          break;
        case 'challengeState': {
          if (!welcomed || matchStarted || stopped) break;
          const outgoing = minimalChallengePeer(message.outgoing);
          if (outgoing) return finish(false, 'outgoing challenge state is forbidden');
          const incoming = minimalChallengePeer(message.incoming);
          if (!incoming) {
            if (!challengeAccepted) pendingIncoming = null;
            break;
          }
          if (challengeAccepted) {
            if (incoming.id !== pendingIncoming?.id || incoming.name !== TARGET_HANDLE) {
              return finish(false, 'challenge changed after acceptance');
            }
            break;
          }
          pendingIncoming = incoming;
          io.audit.append('incoming-challenge-cached', { incoming, joined: inLounge, rosterKnown: !!latestLoungeRoster });
          acceptIfExact();
          break;
        }
        case 'pong':
          if (!pongDeadline) {
            io.audit.append('keepalive-pong-ignored', { reason: 'no-ping-outstanding' });
            break;
          }
          clearSchedule(pongDeadline);
          pongDeadline = null;
          io.audit.append('keepalive-pong', { sequence: pingSequence });
          armKeepalive();
          break;
        case 'matchStart':
          // Any server matchStart means disconnecting can now forfeit, even when
          // the envelope is wrong. Mark that fact before validating fields so
          // every failure takes the explicit, audited safety-forfeit path.
          if (matchStarted || completed >= 1) {
            return finish(false, 'unsolicited or excess matchStart');
          }
          matchStarted = true;
          inLounge = false;
          clearKeepalive();
          mid = typeof message.mid === 'string' ? message.mid : '';
          role = message.role === 'a' || message.role === 'b' ? message.role : null;
          if (!challengeAccepted) return finish(false, 'unsolicited or excess matchStart');
          if (message.oppName !== TARGET_HANDLE || cursorCharacter(message.oppCursor) !== TARGET_CHARACTER
              || cursorCharacter(message.yourCursor) !== OWN_CHARACTER) {
            return finish(false, 'matchStart identity/cursor/character mismatch');
          }
          if ((message.role !== 'a' && message.role !== 'b')
              || typeof message.mid !== 'string' || !message.mid
              || typeof message.stage !== 'string' || !message.stage) {
            return finish(false, 'invalid matchStart envelope');
          }
          latestLoungeRoster = null;
          pendingIncoming = null;
          mid = message.mid;
          role = message.role;
          policy.reset();
          io.audit.append('match-validated', {
            mid, role, stage: message.stage,
            ownHandle: OWN_HANDLE, ownCursor: CODEX_CURSOR, ownCharacter: OWN_CHARACTER,
            opponentHandle: TARGET_HANDLE, opponentCursor: XENON_CURSOR, opponentCharacter: TARGET_CHARACTER,
            controllerHash: CONTROLLER_HASH,
          });
          break;
        case 'state':
          handleState(message);
          break;
        case 'matchEnd': {
          if (!matchStarted || matchEnded || stopped || completed >= 1) return finish(false, 'unexpected matchEnd');
          // The coordinator has finalized and detached the match before emitting
          // matchEnd. From this point, validation failure must close rather than
          // send leave and falsely label a completed match as a safety forfeit.
          matchEnded = true;
          matchStarted = false;
          const official = verifyOfficial(await io.fetchOfficial(mid), message.result);
          completed++;
          io.audit.append('official-result', {
            mid, matchEnd: message.result, official,
            replay: `https://${options.host}/matches/${encodeURIComponent(mid)}`,
          });
          finish(true, 'one authoritative match completed normally');
          break;
        }
        case 'queued':
        case 'dequeued':
          finish(false, 'server placed incoming-only runner in forbidden quick queue');
          break;
        case 'error':
          finish(false, `server error: ${String(message.msg ?? message.code ?? 'unknown')}`);
          break;
        case 'left':
        case 'leftLounge':
          if (stopped) io.close();
          break;
      }
    } catch (error) {
      finish(false, error instanceof Error ? error.message : String(error));
    }
  }

  return {
    handle,
    abort(reason: string) { finish(false, reason); },
    transportClosed() {
      transportEnded = true;
      clearKeepalive();
      latestLoungeRoster = null;
      pendingIncoming = null;
    },
    status: () => ({
      hiReceived, welcomed, inLounge, joinSent, challengeAccepted, matchStarted, matchEnded,
      stopped, completed, mid, role, localSeq, lastAck, pending, lastPhase,
      needsMotionReset, motionResetSeq,
      cachedLoungeRoster: latestLoungeRoster?.map((entry) => ({ ...entry })) ?? null,
      pendingIncoming: pendingIncoming ? { ...pendingIncoming } : null,
      transportEnded,
    }),
  };
}

export function parseArgs(argv: string[]): RunnerOptions & { help?: boolean } {
  const valueOptions = new Set(['identity', 'output', 'timeout-ms']);
  const values: Record<string, string> = {};
  let dryRun = false;
  let help = false;
  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index]!;
    // pnpm 10 preserves the conventional script/argument separator.
    if (raw === '--') continue;
    if (!raw.startsWith('--')) throw new Error(`unexpected argument: ${raw}`);
    const name = raw.slice(2);
    if (name === 'dry-run') { dryRun = true; continue; }
    if (name === 'help') { help = true; continue; }
    if (!valueOptions.has(name)) throw new Error(`unknown option: --${name}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values[name] = value;
  }
  if (help) return { identity: '', output: '', host: 'sshfighter.com', timeoutMs: DEFAULT_TIMEOUT_MS, dryRun, help };
  for (const required of ['identity', 'output']) if (!values[required]) throw new Error(`--${required} is required`);
  const timeoutMs = Number(values['timeout-ms'] ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be an integer from 1000 to ${MAX_TIMEOUT_MS}`);
  }
  const identity = resolve(values.identity!);
  if (!existsSync(identity) || !statSync(identity).isFile()) {
    throw new Error('--identity must name the dedicated CODEX_DGX SSH private-key file');
  }
  const output = resolve(values.output!);
  if (existsSync(output)) throw new Error('--output must not already exist (exclusive creation)');
  return { identity, output, host: 'sshfighter.com', timeoutMs, dryRun };
}

function defaultFetchJson(url: string): Promise<unknown> {
  return fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    .then(async (response) => {
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
    `${OWN_HANDLE}@${options.host}`, command,
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
      killTimer = schedule(() => {
        if (!exited) try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }, 1000);
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
      const playerLines = lines.filter((line) => /^\s*player\s*:/.test(line));
      const keyLines = lines.filter((line) => /^\s*api key\s*:/.test(line));
      if (playerLines.length !== 1 || keyLines.length !== 1
          || playerLines[0] !== `player  : ${OWN_HANDLE}`) {
        return fail(new Error('token mint returned missing, malformed, duplicate, or wrong-player output'));
      }
      const keyMatch = /^api key : (rk_[A-Za-z0-9_-]{32})$/.exec(keyLines[0]!);
      if (!keyMatch) return fail(new Error('token mint returned missing, malformed, duplicate, or wrong-player output'));
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
      for (const message of bufferedMessages.splice(0)) {
        chain = chain.then(() => messageHandler(message)).then(() => undefined);
      }
    },
    onExit(handler) {
      exitHandler = handler;
      exitHandlerReady = true;
      if (bufferedExit !== undefined) {
        const code = bufferedExit;
        bufferedExit = undefined;
        exitHandler(code);
      }
    },
    onError(handler) {
      errorHandler = handler;
      errorHandlerReady = true;
      if (bufferedError) {
        const error = bufferedError;
        bufferedError = null;
        errorHandler(error);
      }
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
    audit.append('dry-run', {
      networkAccess: false, tokenMinted: false, healthFetched: false,
      officialResultFetched: false, socketOpened: false,
    });
    audit.close();
    return;
  }

  let transport: RunnerTransport | null = null;
  try {
    const health = await deps.fetchJson(`https://${options.host}/api/health`);
    validateHealth(health);
    audit.append('health', health);
    let tokenProof = await deps.mintToken(options);
    if (!/^rk_[A-Za-z0-9_-]{32}$/.test(tokenProof)) throw new Error('token mint dependency returned invalid key');
    audit.append('token-proof', { exactPlayer: OWN_HANDLE, sameSshIdentity: true, tokenPersisted: false });
    tokenProof = '';
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
        if (!shutdownDeadline) {
          shutdownDeadline = deps.schedule(() => {
            audit.append('transport-termination-timeout', { error: controllerFailure?.message ?? null });
            finish(controllerFailure ?? new Error('transport termination timeout'));
          }, 2000);
        }
      };
      const fetchOfficial = async (matchId: string): Promise<unknown> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try { return await deps.fetchJson(`https://${options.host}/api/matches/${encodeURIComponent(matchId)}`); }
          catch (error) {
            lastError = error;
            if (attempt < 10) await deps.sleep(250);
          }
        }
        throw lastError instanceof Error ? lastError : new Error('official result unavailable');
      };
      controller = createRunnerController(options, health, {
        send: (message) => transport!.send(message),
        close: () => beginShutdown(),
        audit,
        fetchOfficial,
        schedule: deps.schedule,
        clearSchedule: deps.clearSchedule,
        finished: ({ ok, reason }) => {
          if (!ok) {
            controllerFailure = new Error(reason);
            recordFailure(controllerFailure, 'controller');
          }
        },
      });
      transport!.onMessage((message) => controller!.handle(message));
      transport!.onExit((code) => {
        if (settled) return;
        controller!.transportClosed();
        audit.append('transport-exit', { code, stopped: controller!.status().stopped });
        const exitError = controllerFailure
          ?? (controller!.status().stopped
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
        controller!.abort('global bounded-runner timeout');
        beginShutdown(new Error('global bounded-runner timeout'), 'global-timeout');
      }, options.timeoutMs);
    });
  } catch (error) {
    try { audit.append('fatal', { error: error instanceof Error ? error.message : String(error) }); } catch { /* closed */ }
    try { transport?.close(); } catch { /* ignore */ }
    try { audit.close(); } catch { /* ignore */ }
    throw error;
  }
}

const HELP = `Usage: pnpm runner:codex-dgx -- --identity KEY --output FILE [options]

Hard bindings:
  authenticated player  ${OWN_HANDLE}
  fighter               ${OWN_CHARACTER}
  sole challenger       ${TARGET_HANDLE}/${TARGET_CHARACTER}
  match limit           exactly one incoming direct-Lounge match

Required:
  --identity KEY       dedicated SSH private key (never logged)
  --output FILE        new exclusive JSONL ledger, created mode 0600

Options:
  --timeout-ms N       global bound, 1000..${MAX_TIMEOUT_MS} (default ${DEFAULT_TIMEOUT_MS})
  --dry-run            create manifest ledger without token, HTTP, or SSH access
  --help               show this help

Residual safety behavior:
  A fail-closed invariant violation after matchStart sends leave and may create a
  forfeit. Transport loss can also create a forfeit. Normal matchEnd never does.`;

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

#!/usr/bin/env node
// Fixed CODEX controller with an append-only, total-order training log.
// It cannot connect unless --arm is explicit, never logs key material, accepts
// challenges only from the configured handle, and pauses for a HAM check after
// every official match boundary.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { AdaptiveCodexPolicy, DEFAULT_ADAPTIVE_CONFIG, type CombatObservation } from '../bot/adaptive-codex-policy.js';
import type { Inputs } from '../game/types.js';

export const CONTROLLER_ID = 'adaptive-codex-fable-v2';
export const CONTROLLER_CONFIG = DEFAULT_ADAPTIVE_CONFIG;

export interface LoggerArgs {
  arm: boolean; dryRun: boolean; user: 'CODEX_AGENT'; identity: string; host: string;
  log: string; expectedOpponent: string; expectedCharacter: string; matches: number; sourceCommit: string;
}

const VALUE_OPTIONS = new Set(['identity', 'user', 'host', 'log', 'expected-opponent', 'expected-character', 'matches', 'source-commit']);
export function parseLoggerArgs(argv: string[]): LoggerArgs {
  const raw: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!VALUE_OPTIONS.has(name) && name !== 'arm' && name !== 'dry-run') throw new Error(`unknown option: --${name}`);
    if (VALUE_OPTIONS.has(name)) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`--${name} requires a value`);
      raw[name] = next; i++;
    } else raw[name] = true;
  }
  const required = (name: string): string => {
    const value = raw[name]; if (typeof value !== 'string' || !value) throw new Error(`--${name} is required`); return value;
  };
  const user = (raw.user ?? 'CODEX_AGENT') as string;
  if (user !== 'CODEX_AGENT') throw new Error('this frozen controller is restricted to --user CODEX_AGENT');
  const matches = Number(raw.matches ?? '1');
  if (!Number.isInteger(matches) || matches < 1 || matches > 5) throw new Error('--matches must be an integer from 1 to 5');
  const arm = raw.arm === true, dryRun = raw['dry-run'] === true;
  if (arm === dryRun) throw new Error('choose exactly one of --arm or --dry-run');
  return {
    arm, dryRun, user: 'CODEX_AGENT', identity: required('identity'), host: (raw.host as string | undefined) ?? 'sshfighter.com',
    log: required('log'), expectedOpponent: required('expected-opponent'), expectedCharacter: required('expected-character').toUpperCase(),
    matches, sourceCommit: required('source-commit'),
  };
}

export function redactFingerprints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactFingerprints);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'fp' || key === 'a_fp' || key === 'b_fp' || key === 'fingerprint') continue;
    result[key] = redactFingerprints(child);
  }
  return result;
}

export function inferDecisionReason(state: CombatObservation, input: Inputs, before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): string {
  for (const [name, count] of after) if (count > (before.get(name) ?? 0)) return name;
  if (state.phase !== 'fight') return 'neutral-phase';
  if (state.you.stun > 0 || state.you.attack !== 'none') return 'locked';
  const toward = Math.sign(state.opp.x - state.you.x) || state.you.facing;
  if (input.moveX === toward) return 'spacing-toward';
  if (input.moveX === -toward) return 'spacing-away';
  return 'neutral';
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

interface OrderedLog {
  record(kind: string, data: Record<string, unknown>): number;
  close(): Promise<string>;
}

function orderedLog(path: string): OrderedLog {
  const stream = createWriteStream(path, { flags: 'wx' });
  let sequence = 0;
  let closed = false;
  const record = (kind: string, data: Record<string, unknown>): number => {
    if (closed) throw new Error('attempted to write a closed log');
    const current = sequence++;
    const row = { sequence: current, wall_time: new Date().toISOString(), monotonic_ns: process.hrtime.bigint().toString(), kind, ...data };
    if (!stream.write(`${JSON.stringify(row)}\n`)) stream.once('drain', () => {});
    return current;
  };
  const close = async (): Promise<string> => {
    if (!closed) { closed = true; await new Promise<void>((ok, fail) => stream.end(ok).once('error', fail)); }
    return fileSha256(path);
  };
  return { record, close };
}

async function fetchOfficial(baseUrl: string, matchId: string): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}`, { headers: { accept: 'application/json' } });
      if (response.ok) return redactFingerprints(await response.json()) as Record<string, unknown>;
    } catch { /* bounded retry while the recorder commits */ }
    await new Promise((ok) => setTimeout(ok, 250 * (attempt + 1)));
  }
  return null;
}

async function ensurePreflight(args: LoggerArgs): Promise<{ launcherSha: string; policySha: string }> {
  await access(args.identity);
  try { await access(args.log); throw new Error(`log already exists: ${args.log}`); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const launcher = fileURLToPath(import.meta.url);
  const policy = resolve(fileURLToPath(new URL('../bot/adaptive-codex-policy.ts', import.meta.url)));
  return { launcherSha: await fileSha256(launcher), policySha: await fileSha256(policy) };
}

export async function runLoggedController(args: LoggerArgs): Promise<void> {
  const hashes = await ensurePreflight(args);
  const safeSummary = {
    controller_id: CONTROLLER_ID, deterministic: true, local_seed: null, config: CONTROLLER_CONFIG,
    source_commit: args.sourceCommit, launcher_sha256: hashes.launcherSha, policy_sha256: hashes.policySha,
    user: args.user, fighter: 'CODEX', expected_opponent: args.expectedOpponent,
    expected_character: args.expectedCharacter, matches: args.matches, log: args.log,
  };
  if (args.dryRun) { console.log(JSON.stringify({ ready: true, armed: false, ...safeSummary }, null, 2)); return; }

  const log = orderedLog(args.log);
  log.record('session', { ...safeSummary, armed: true, redactions: ['fingerprints', 'identity path', 'key material'] });
  const ssh = spawn('ssh', ['-T', '-i', args.identity, '-o', 'IdentitiesOnly=yes', `${args.user}@${args.host}`, 'play'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = readline.createInterface({ input: ssh.stdout });
  const commands = readline.createInterface({ input: process.stdin, terminal: false });
  const policy = new AdaptiveCodexPolicy();
  let roster: string[] = [], matchId = '', opponent = '', completed = 0, pendingBoundary = false, fatal: Error | null = null;

  const send = (message: Record<string, unknown>, causeSequence: number | null = null): void => {
    log.record('emit', { cause_sequence: causeSequence, message });
    if (!ssh.stdin.destroyed) ssh.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const join = (): void => { pendingBoundary = false; send({ t: 'joinLounge', char: 'CODEX' }); };

  commands.on('line', (line) => {
    if (line.trim().toLowerCase() !== 'continue' || !pendingBoundary) return;
    log.record('ham-boundary-ack', { completed });
    join();
  });

  const finalizeMatch = async (message: Record<string, unknown>, inboundSequence: number): Promise<void> => {
    const official = matchId ? await fetchOfficial(`https://${args.host}`, matchId) : null;
    const match = official?.match as Record<string, unknown> | undefined;
    const cleanKo = match?.end_reason === 'ko' && (match?.winner === 'a' || match?.winner === 'b');
    completed++;
    log.record('official-match', { cause_sequence: inboundSequence, match_id: matchId, clean_ko: cleanKo, payload: official });
    log.record('ham-check-required', { completed, requested: args.matches, match_id: matchId });
    console.log(`match boundary ${completed}/${args.matches}; clean_ko=${cleanKo}; check HAM before continuing`);
    matchId = '';
    if (completed >= args.matches) {
      log.record('block-complete', { completed });
      ssh.stdin.end();
    } else {
      pendingBoundary = true;
      console.log('after HAM check, type: continue');
    }
  };

  lines.on('line', (raw) => {
    const line = raw.trim(); if (!line.startsWith('{')) return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(line) as Record<string, unknown>; } catch { return; }
    const safeMessage = redactFingerprints(message) as Record<string, unknown>;
    const inboundSequence = log.record('inbound', { message: safeMessage });
    if (message.t === 'welcome') {
      roster = Array.isArray(message.roster) ? message.roster.map(String) : [];
      join();
    } else if (message.t === 'challengeState') {
      const incoming = message.incoming as { name?: unknown } | null | undefined;
      if (!incoming?.name) return;
      if (String(incoming.name).toLowerCase() === args.expectedOpponent.toLowerCase()) send({ t: 'acceptChallenge' });
      else send({ t: 'declineChallenge' });
    } else if (message.t === 'matchStart') {
      matchId = String(message.mid ?? ''); opponent = String(message.oppName ?? '');
      const oppCharacter = roster[Number(message.oppCursor)] ?? 'UNKNOWN';
      const ownershipOk = opponent.toLowerCase() === args.expectedOpponent.toLowerCase() && oppCharacter === args.expectedCharacter;
      policy.reset();
      log.record('match-provenance', { match_id: matchId, role: message.role, stage: message.stage, opponent, opponent_character: oppCharacter, ownership_ok: ownershipOk });
      if (!ownershipOk) console.error('ownership mismatch: match will finish cleanly but must be excluded');
    } else if (message.t === 'state') {
      const state = message as unknown as CombatObservation;
      if (!state.you || !state.opp || pendingBoundary) return;
      const before = new Map(policy.actions);
      const input = policy.decide(state);
      const reason = inferDecisionReason(state, input, before, policy.actions);
      log.record('decision', { match_id: matchId, state_frame: state.frame, state_ack: (message.ack as number | undefined) ?? null, reason, action: input });
      send({ t: 'input', ...input }, inboundSequence);
    } else if (message.t === 'matchEnd') {
      void finalizeMatch(message, inboundSequence).catch((error) => { fatal = error as Error; ssh.stdin.end(); });
    } else if (message.t === 'error') {
      console.error(`server error: ${String(message.msg)}`);
    }
  });

  await new Promise<void>((ok, fail) => {
    ssh.once('error', fail);
    ssh.once('exit', (code) => code === 0 || completed >= args.matches ? ok() : fail(new Error(`ssh exited ${code}`)));
  });
  lines.close(); commands.close();
  if (fatal) throw fatal;
  const digest = await log.close();
  console.log(JSON.stringify({ complete: completed >= args.matches, matches: completed, log: args.log, sha256: digest }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try { await runLoggedController(parseLoggerArgs(process.argv.slice(2))); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

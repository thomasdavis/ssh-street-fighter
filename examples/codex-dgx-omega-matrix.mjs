#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const HANDLE = 'CODEX_DGX';
const CHARACTER = 'OMEGA';
const TARGET = 'CODEX_MAC';
const TARGET_CHARACTER = 'MNEME';
const POLICY = 'omega-control-v1-seeded-capture';
const POLICY_SEED = 0x4f4d4547; // "OMEG"
const CLEAN_TARGET = 5;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (!['--identity', '--out', '--host'].includes(name)) {
      throw new Error(`unknown argument: ${name}`);
    }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    args[name.slice(2)] = value;
  }
  if (!args.identity) throw new Error('--identity is required');
  if (!args.out) throw new Error('--out is required');
  args.host ||= 'sshfighter.com';
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outputPath = resolve(args.out);
if (existsSync(outputPath)) throw new Error(`refusing to overwrite ${outputPath}`);
mkdirSync(dirname(outputPath), { recursive: true });
const outputFd = openSync(outputPath, 'wx', 0o600);
let sequence = 0;
let closed = false;

function append(kind, payload = {}) {
  const row = { seq: sequence++, at: new Date().toISOString(), kind, ...payload };
  writeSync(outputFd, `${JSON.stringify(row)}\n`);
}

function durable() {
  fsyncSync(outputFd);
}

function closeOutput() {
  if (closed) return;
  durable();
  closeSync(outputFd);
  closed = true;
}

const scriptPath = fileURLToPath(import.meta.url);
const scriptSha256 = createHash('sha256').update(readFileSync(scriptPath)).digest('hex');
let sourceCommit = null;
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: dirname(dirname(scriptPath)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {}

let rngState = POLICY_SEED >>> 0;
function resetRng() {
  rngState = POLICY_SEED >>> 0;
}
function random() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let value = rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

// The established omega-control-v1 thresholds and branches are preserved.
// Only the random source is replaced by the fixed, per-match PRNG above.
function decide(state) {
  const { you, opp, phase } = state;
  const action = { t: 'input', moveX: 0, motion: 'N' };
  if (phase !== 'fight' || !you || !opp) return { action, reason: 'inactive' };

  const dx = opp.x - you.x;
  const dist = Math.abs(dx);
  const towards = Math.sign(dx) || you.facing;
  const facing = you.facing;
  const oppAir = opp.y > 8;
  const oppAttacking = opp.attack && opp.attack !== 'none';
  const forward = facing === 1 ? 'R' : 'L';
  const back = facing === 1 ? 'L' : 'R';
  const backForward = `${back}${forward}`;
  const downForward = `D${forward}`;
  const downBack = `D${back}`;
  let reason;

  if (dist < 38) {
    if (oppAttacking && random() < 0.62) {
      action.moveX = -towards;
      reason = 'close_guard';
    } else if (random() < 0.22) {
      action.motion = backForward; action.kick = true;
      reason = 'close_null_step';
    } else if (random() < 0.30) {
      action.throw = true;
      reason = 'close_throw';
    } else if (random() < 0.55) {
      action.kick = true;
      reason = 'close_kick';
    } else {
      action.punch = true;
      reason = 'close_punch';
    }
  } else if (dist < 105) {
    if (!oppAir && random() < 0.28) {
      action.motion = downBack; action.punch = true;
      reason = 'mid_entropy_well';
    } else if (oppAttacking && random() < 0.18) {
      action.motion = backForward; action.kick = true;
      reason = 'mid_null_step';
    } else {
      action.moveX = towards;
      reason = 'mid_advance';
    }
  } else if (!oppAir && random() < 0.46) {
    action.motion = downForward; action.punch = true;
    reason = 'far_final_testimony';
  } else {
    action.moveX = towards;
    if (random() < 0.025) {
      action.jump = true;
      reason = 'far_jump_advance';
    } else {
      reason = 'far_advance';
    }
  }
  return { action, reason };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchOfficial(matchId) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const value = await fetchJson(`https://sshfighter.com/api/matches/${encodeURIComponent(matchId)}`);
      append('official_match', { matchId, attempt, value });
      return value;
    } catch (error) {
      lastError = String(error);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }
  append('official_match_unavailable', { matchId, error: lastError });
  return null;
}

function officialRow(value) {
  if (!value || typeof value !== 'object') return null;
  return value.match ?? value.record ?? value;
}

function isCleanKo(value) {
  const row = officialRow(value);
  const reason = String(row?.end_reason ?? row?.endReason ?? '').toLowerCase();
  return reason === 'ko';
}

append('session', {
  schema: 'sshfighter-matrix-jsonl-v1',
  handle: HANDLE,
  character: CHARACTER,
  targetHandle: TARGET,
  targetCharacter: TARGET_CHARACTER,
  policy: POLICY,
  policySeed: POLICY_SEED,
  deterministic: true,
  resetSeedAtMatchStart: true,
  scriptSha256,
  sourceCommit,
  cleanTarget: CLEAN_TARGET,
  matchmaking: 'direct-lounge-accept-exact-target-only',
  dryRun: !!args.dryRun,
});

if (args.dryRun) {
  const fixture = {
    t: 'state', phase: 'fight', projectiles: [],
    you: { x: 80, y: 0, facing: 1, hp: 100, attack: 'none' },
    opp: { x: 140, y: 0, facing: -1, hp: 100, attack: 'kick' },
  };
  const sample = () => {
    resetRng();
    return Array.from({ length: 8 }, () => {
      const rngBefore = rngState;
      const value = decide(fixture);
      return { rngBefore, rngAfter: rngState, ...value };
    });
  };
  const first = sample();
  const second = sample();
  const deterministic = JSON.stringify(first) === JSON.stringify(second);
  append('dry_run_result', { deterministic, sample: first });
  closeOutput();
  if (!deterministic) throw new Error('determinism dry-run failed');
  console.log(`DRY RUN PASS: ${POLICY} ${scriptSha256}`);
  process.exit(0);
}

try {
  append('health', { value: await fetchJson('https://sshfighter.com/api/health') });
} catch (error) {
  append('health_unavailable', { error: String(error) });
}

const ssh = spawn('ssh', [
  '-T', '-i', resolve(args.identity), '-o', 'IdentitiesOnly=yes',
  `${HANDLE}@${args.host}`, 'play',
], { stdio: ['pipe', 'pipe', 'inherit'] });
const protocol = readline.createInterface({ input: ssh.stdout });
const operator = readline.createInterface({ input: process.stdin, output: process.stdout });

let acceptAllowed = true;
let acceptedId = '';
let lastIncoming = null;
let awaitingBoundary = false;
let activeMatch = null;
let cleanCount = 0;
let rawCount = 0;
let stopping = false;
let handlingEnd = false;

function send(message, source) {
  append('outbound', { source, message });
  ssh.stdin.write(`${JSON.stringify(message)}\n`);
}

function joinLounge(source) {
  send({ t: 'joinLounge', char: CHARACTER }, source);
}

function tryAccept() {
  if (!acceptAllowed || awaitingBoundary || stopping || !lastIncoming) return;
  if (!lastIncoming.id || lastIncoming.id === acceptedId) return;
  acceptedId = lastIncoming.id;
  if (lastIncoming.name !== TARGET) {
    send({ t: 'declineChallenge' }, 'non_target_incoming_challenge');
    append('challenge_decline', {
      target: { id: lastIncoming.id, name: lastIncoming.name },
      requiredHandle: TARGET,
    });
    return;
  }
  send({ t: 'acceptChallenge' }, 'exact_target_incoming_challenge');
  append('challenge_accept', {
    target: { id: lastIncoming.id, name: lastIncoming.name },
  });
}

async function handleMatchEnd(message) {
  if (handlingEnd) return;
  handlingEnd = true;
  rawCount++;
  const matchId = activeMatch?.matchId ?? message?.result?.matchId ?? message?.result?.mid ?? null;
  const official = matchId ? await fetchOfficial(matchId) : null;
  const clean = isCleanKo(official);
  if (clean) cleanCount++;
  append('match_boundary', {
    rawCount, cleanCount, clean, matchId, activeMatch, clientResult: message.result ?? null,
    hamCheckRequired: cleanCount < CLEAN_TARGET,
  });
  durable();
  activeMatch = null;
  handlingEnd = false;

  if (cleanCount >= CLEAN_TARGET) {
    stopping = true;
    send({ t: 'leave' }, 'clean_target_complete');
    return;
  }
  awaitingBoundary = true;
  acceptAllowed = false;
  acceptedId = '';
  joinLounge('return_after_match');
  console.log(`BOUNDARY raw=${rawCount} clean=${cleanCount}; check HAM, then type CONTINUE`);
}

async function handle(message) {
  append('inbound', { message });
  switch (message.t) {
    case 'welcome':
      joinLounge('welcome');
      break;
    case 'joinedLounge':
      acceptedId = '';
      tryAccept();
      break;
    case 'challengeState':
      lastIncoming = message.incoming ?? null;
      if (!lastIncoming) acceptedId = '';
      tryAccept();
      break;
    case 'matchStart':
      resetRng();
      acceptAllowed = false;
      acceptedId = '';
      lastIncoming = null;
      activeMatch = {
        matchId: message.mid ?? message.matchId ?? null,
        role: message.role ?? null,
        stage: message.stage ?? null,
        opponent: message.oppName ?? null,
      };
      append('policy_reset', { policySeed: POLICY_SEED, activeMatch });
      break;
    case 'state': {
      if (stopping || handlingEnd) break;
      const rngBefore = rngState;
      const { action, reason } = decide(message);
      const rngAfter = rngState;
      append('decision', { matchId: activeMatch?.matchId ?? null, rngBefore, rngAfter, reason, action });
      send(action, 'policy_decision');
      break;
    }
    case 'matchEnd':
      await handleMatchEnd(message);
      break;
    case 'left':
    case 'leftLounge':
      if (stopping) ssh.stdin.end();
      break;
    case 'error':
      append('server_error', { message });
      break;
  }
}

protocol.on('line', (raw) => {
  const line = raw.trim();
  if (!line || line[0] !== '{') return;
  try {
    const message = JSON.parse(line);
    handle(message).catch((error) => append('handler_error', { error: String(error) }));
  } catch (error) {
    append('parse_error', { error: String(error), raw: line });
  }
});

operator.on('line', (raw) => {
  if (raw.trim().toUpperCase() !== 'CONTINUE') return;
  if (!awaitingBoundary || stopping) {
    console.log('CONTINUE ignored: no pending match boundary');
    return;
  }
  append('ham_boundary_ack', { rawCount, cleanCount });
  awaitingBoundary = false;
  acceptAllowed = true;
  tryAccept();
});

ssh.on('exit', (code, signal) => {
  append('transport_exit', { code, signal, rawCount, cleanCount });
  closeOutput();
  operator.close();
  process.exitCode = code || (cleanCount >= CLEAN_TARGET ? 0 : 1);
});

process.on('SIGINT', () => {
  append('operator_interrupt', { rawCount, cleanCount });
  stopping = true;
  send({ t: 'leave' }, 'operator_interrupt');
  setTimeout(() => ssh.kill('SIGTERM'), 1500).unref();
});

console.log(`DISARMED LOGGER READY: ${POLICY} -> ${outputPath}`);
console.log(`Accepting direct challenges only from ${TARGET}/${TARGET_CHARACTER}; output is exclusive and will not be overwritten.`);

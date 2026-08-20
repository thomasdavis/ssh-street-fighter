#!/usr/bin/env node
// One-match Quick Match transport for the frozen omega-control-v1 policy.
// Live operation is impossible without explicit --armed and a zero-queue preflight.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

export const HANDLE = 'CODEX_DGX';
export const CHARACTER = 'OMEGA';
export const POLICY = 'omega-control-v1-seeded-capture';
export const POLICY_SEED = 0x4f4d4547;
export const POLICY_FUNCTION_SHA256 = 'ab9b903e9ba74b046b1439adccfedc33224c8ed247355335931f026018f86497';
export const EXPECTED_FINGERPRINT = 'SHA256:w5cpyiWy6jpCFRaLxln5ZOvrWy1x+QoeWC0PAR4La+A';
export const SOURCE_COMMIT = '3caedf3435c12996cf4d34fb5ac76c7cd7b75076';
export const MIN_ATTESTED_UPTIME = 6751;

export function parseArgs(argv) {
  const args = { host: 'sshfighter.com', windowMs: 45_000, armed: false, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === '--armed') { args.armed = true; continue; }
    if (name === '--dry-run') { args.dryRun = true; continue; }
    if (!['--identity', '--out', '--host', '--window-ms'].includes(name)) throw new Error(`unknown argument: ${name}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    if (name === '--window-ms') args.windowMs = Number(value);
    else args[name.slice(2)] = value;
  }
  if (args.armed === args.dryRun) throw new Error('choose exactly one of --armed or --dry-run');
  if (!Number.isInteger(args.windowMs) || args.windowMs < 5_000 || args.windowMs > 120_000) {
    throw new Error('--window-ms must be an integer from 5000 to 120000');
  }
  if (args.armed && (!args.identity || !args.out)) throw new Error('--armed requires --identity and --out');
  return args;
}

let rngState = POLICY_SEED >>> 0;
export function resetRng() {
  rngState = POLICY_SEED >>> 0;
}
function random() {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let value = rngState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

// Byte-preserved decision logic from PR #28 / c07eb20. Transport safety and
// matchmaking are outside this function and do not change the policy.
export function decide(state) {
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

export function deterministicFixture() {
  const fixture = {
    t: 'state', phase: 'fight', projectiles: [],
    you: { x: 80, y: 0, facing: 1, hp: 100, attack: 'none' },
    opp: { x: 140, y: 0, facing: -1, hp: 100, attack: 'kick' },
  };
  resetRng();
  return Array.from({ length: 8 }, () => {
    const rngBefore = rngState;
    const value = decide(fixture);
    return { rngBefore, rngAfter: rngState, ...value };
  });
}

export function createOneMatchController(options, io) {
  let matchId = '';
  let stopping = false;
  let stopCause = '';
  let ending = false;
  let matched = false;
  let queueTimer = null;
  let roster = [];
  const send = (message, cause) => { io.append('outbound', { cause, message }); io.send(message); };
  const stop = (cause) => {
    if (stopping) return;
    stopping = true;
    stopCause = cause;
    if (queueTimer !== null) io.cancel(queueTimer);
    send({ t: 'leave' }, cause);
  };

  async function handle(message) {
    const loggedMessage = message.t === 'welcome' ? { ...message, fp: '[verified]' } : message;
    io.append('inbound', { message: loggedMessage });
    if (message.t === 'welcome') {
      if (message.name !== HANDLE || message.fp !== EXPECTED_FINGERPRINT) {
        throw new Error(`identity mismatch: ${String(message.name)} / ${String(message.fp)}`);
      }
      io.append('identity_gate', { handle: message.name, fingerprint: message.fp });
      roster = Array.isArray(message.roster) ? message.roster.map(String) : [];
      const cursor = roster.indexOf(CHARACTER);
      if (cursor < 0) throw new Error(`${CHARACTER} absent from runtime roster`);
      io.append('roster_gate', { cursor, rosterCount: roster.length });
      await io.assertQueueSafe();
      queueTimer = io.schedule(() => {
        io.append('queue_window_expired', { windowMs: options.windowMs });
        stop('bounded_queue_window_expired');
      }, options.windowMs);
      send({ t: 'queue', char: CHARACTER }, 'welcome_zero_queue_preflight');
    } else if (message.t === 'queued') {
      if (message.char !== CHARACTER) throw new Error(`queued wrong character: ${message.char}`);
    } else if (message.t === 'matchStart') {
      if (matched) throw new Error('second matchStart rejected');
      matched = true;
      if (queueTimer !== null) io.cancel(queueTimer);
      const ownCharacter = roster[Number(message.yourCursor)] ?? 'UNKNOWN';
      if (ownCharacter !== CHARACTER) throw new Error(`matchStart character mismatch: ${ownCharacter}`);
      matchId = String(message.mid ?? '');
      if (!matchId) throw new Error('matchStart missing match id');
      resetRng();
      io.append('match_start', {
        matchId, role: message.role, stage: message.stage, ownCharacter,
        opponent: message.oppName, opponentCharacter: roster[Number(message.oppCursor)] ?? 'UNKNOWN',
      });
    } else if (message.t === 'state' && matched && !stopping && !ending) {
      const rngBefore = rngState;
      const result = decide(message);
      io.append('decision', {
        matchId, frame: message.frame, ack: message.ack ?? null,
        rngBefore, rngAfter: rngState, reason: result.reason, action: result.action,
      });
      send(result.action, 'state_decision');
    } else if (message.t === 'matchEnd' && matched && !stopping && !ending) {
      ending = true;
      const official = await io.fetchOfficial(matchId);
      io.append('match_boundary', { matchId, clientResult: message.result ?? null, official });
      stop('one_match_complete');
    } else if (message.t === 'left') {
      io.finish({ matched, matchId, reason: stopCause || (matched ? 'one_match_complete' : 'server_left') });
    } else if (message.t === 'error') {
      throw new Error(`server error: ${message.msg}`);
    }
  }
  return { handle, stop, status: () => ({ matchId, stopping, stopCause, ending, matched }) };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function run(args) {
  const first = deterministicFixture();
  const second = deterministicFixture();
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('policy determinism check failed');
  const policyFunctionSha256 = createHash('sha256').update(decide.toString()).digest('hex');
  if (policyFunctionSha256 !== POLICY_FUNCTION_SHA256) throw new Error(`frozen policy hash mismatch: ${policyFunctionSha256}`);
  if (args.dryRun) {
    console.log(JSON.stringify({ ready: true, armed: false, policy: POLICY, policySeed: POLICY_SEED,
      sourceCommit: SOURCE_COMMIT, policyFunctionSha256, sample: first }, null, 2));
    return;
  }

  accessSync(resolve(args.identity));
  const outputPath = resolve(args.out);
  if (existsSync(outputPath)) throw new Error(`refusing to overwrite ${outputPath}`);
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', SOURCE_COMMIT, head], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['diff', '--quiet', SOURCE_COMMIT, '--', 'src'], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    throw new Error(`mechanics source differs from attested ${SOURCE_COMMIT}`);
  }
  const [health, live] = await Promise.all([
    fetchJson(`https://${args.host}/api/health`), fetchJson(`https://${args.host}/api/live`),
  ]);
  if (health.engine !== 'sf-6' || Number(health.uptime_s) < MIN_ATTESTED_UPTIME) throw new Error('live mechanics/deployment epoch gate failed');
  if (Number(live.queued) !== 0) throw new Error(`global queue is not empty: ${live.queued}`);

  mkdirSync(dirname(outputPath), { recursive: true });
  const fd = openSync(outputPath, 'wx', 0o600);
  let seq = 0;
  let closed = false;
  const append = (kind, payload = {}) => writeSync(fd, `${JSON.stringify({ seq: seq++, at: new Date().toISOString(), kind, ...payload })}\n`);
  const closeLog = () => { if (!closed) { fsyncSync(fd); closeSync(fd); closed = true; } };
  append('session', { schema: 'sshfighter-omega-quickmatch-v1', armed: true, handle: HANDLE, character: CHARACTER,
    expectedFingerprint: EXPECTED_FINGERPRINT, policy: POLICY, policySeed: POLICY_SEED, policyFunctionSha256,
    runnerCommit: head, mechanicsSourceCommit: SOURCE_COMMIT, health, initialLive: live,
    queueWindowMs: args.windowMs, matchLimit: 1 });

  const ssh = spawn('ssh', ['-T', '-i', resolve(args.identity), '-o', 'IdentitiesOnly=yes', `${HANDLE}@${args.host}`, 'play'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = readline.createInterface({ input: ssh.stdout });
  let finished = false;
  const send = (message) => { if (!ssh.stdin.destroyed) ssh.stdin.write(`${JSON.stringify(message)}\n`); };
  const controller = createOneMatchController({ windowMs: args.windowMs }, {
    send, append,
    schedule: (fn, ms) => setTimeout(fn, ms), cancel: (timer) => clearTimeout(timer),
    assertQueueSafe: async () => {
      const latest = await fetchJson(`https://${args.host}/api/live`);
      append('queue_gate', { live: latest });
      if (Number(latest.queued) !== 0) throw new Error(`global queue changed before join: ${latest.queued}`);
    },
    fetchOfficial: async (matchId) => {
      for (let attempt = 1; attempt <= 12; attempt++) {
        try { return await fetchJson(`https://${args.host}/api/matches/${encodeURIComponent(matchId)}`); }
        catch (error) { if (attempt === 12) return { unavailable: true, error: String(error) }; await new Promise((ok) => setTimeout(ok, attempt * 250)); }
      }
    },
    finish: (summary) => { if (finished) return; finished = true; append('complete', summary); closeLog(); ssh.stdin.end(); },
  });
  lines.on('line', (raw) => {
    const line = raw.trim(); if (!line.startsWith('{')) return;
    try { void controller.handle(JSON.parse(line)).catch((error) => { append('fatal', { error: String(error) }); controller.stop('fatal'); }); }
    catch (error) { append('fatal', { error: String(error) }); controller.stop('fatal'); }
  });
  process.once('SIGINT', () => controller.stop('operator_sigint'));
  await new Promise((resolvePromise, rejectPromise) => {
    ssh.once('error', rejectPromise);
    ssh.once('exit', (code) => code === 0 || finished ? resolvePromise() : rejectPromise(new Error(`ssh exited ${code}`)));
  }).finally(() => { lines.close(); closeLog(); });
  console.log(JSON.stringify({ ...controller.status(), log: outputPath,
    sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex') }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try { await run(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}

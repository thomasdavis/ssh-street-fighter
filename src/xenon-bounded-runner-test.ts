import { chmodSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { makeFighter, makeMatch, stepMatch } from './game/engine.js';
import { emptyInputs, type Inputs } from './game/types.js';
import { clearEdges } from './cluster/messages.js';
import {
  computeGoldenTraceHash, computeRunnerImplementationHash, createRunnerController, createSshTransport,
  executeRunner, LOUNGE_PING_INTERVAL_MS, LOUNGE_PONG_TIMEOUT_MS, mintApiToken, parseArgs,
  PINNED_ROSTER, PINNED_ROSTER_HASH, TOKEN_MINT_TIMEOUT_MS,
  redact, runnerManifest, SecureJsonlAudit, validateHealth, validatePinnedRoster,
  validateRunnerProvenance, APPROVED_CROSS_POLICY_SOURCE_HASH,
  RUNNER_SOURCE_BASE_COMMIT, TARGET_DEPLOYMENT_PROFILE, TARGET_ENGINE_COMMIT,
  type AuditSink, type HealthPayload, type RunnerOptions, type RunnerTransport, type SshChild, type TokenChild,
} from './tools/xenon-bounded-runner.js';
import {
  FROZEN_XENON_MATCHUP_CONFIG, matchupXenonDecision,
  type LatencyPolicyContext, type OpponentName,
} from './policies/xenon-matchup.js';

type Message = Record<string, unknown>;

class MemoryAudit implements AuditSink {
  rows: Array<{ event: string; payload: unknown }> = [];
  closed = false;
  append(event: string, payload: unknown = {}) { this.rows.push({ event, payload: redact(payload) }); }
  close() { if (!this.closed) this.rows.push({ event: 'ledger-close', payload: {} }); this.closed = true; }
}

class FakeClock {
  now = 0;
  nextId = 1;
  tasks = new Map<number, { at: number; handler: () => void }>();
  schedule = (handler: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.now + ms, handler });
    return id as unknown as ReturnType<typeof setTimeout>;
  };
  clear = (timer: ReturnType<typeof setTimeout>): void => {
    this.tasks.delete(timer as unknown as number);
  };
  advance(ms: number): void {
    const target = this.now + ms;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      this.tasks.delete(due[0]);
      this.now = due[1].at;
      due[1].handler();
    }
    this.now = target;
  }
}

const baseOptions = (overrides: Partial<RunnerOptions> = {}): RunnerOptions => ({
  identity: '/private/dedicated-key', handle: 'XENON_RUNNER', target: 'TARGET_FABLE',
  opponent: 'FABLE', profile: 'new-wave', output: '/tmp/unused.jsonl', host: 'sshfighter.com', actionDelay: 0,
  seed: 2026081901, matches: 1, timeoutMs: 600000, dryRun: false, ...overrides,
});
const health: HealthPayload = { ok: true, service: 'ringside', engine: 'sf-6', uptime_s: 10 };
const TEST_API_KEY = `rk_${'A'.repeat(32)}`;
const cursor = (name: string): number => PINNED_ROSTER.indexOf(name as typeof PINNED_ROSTER[number]);

const fighter = (overrides: Message = {}): Message => ({
  x: 80, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0,
  attack: 'none', attackFrame: 0, stun: 0, crouching: false,
  pose: 'idle', special: false, active: false, casting: false, ...overrides,
});
const state = (overrides: Message = {}): Message => ({
  t: 'state', frame: 1, phase: 'fight', round: 1, roundTime: 60, hitStop: 0, ack: 0,
  you: fighter(), opp: fighter({ x: 130, facing: -1 }), projectiles: [], ...overrides,
});

function harness(options = baseOptions(), official?: Message, clock?: FakeClock) {
  const sent: Message[] = [];
  const audit = new MemoryAudit();
  let closes = 0;
  const controller = createRunnerController(options, health, {
    send: (message) => sent.push(message), close: () => { closes++; }, audit,
    schedule: clock?.schedule, clearSchedule: clock?.clear,
    fetchOfficial: async (mid) => official ?? ({
      match: {
        id: mid, mode: 'versus', a_name: options.handle, b_name: options.target,
        a_char: 'XENON', b_char: options.opponent, engine_version: 'sf-6',
        end_reason: 'ko', winner: 'a', a_rounds: 2, b_rounds: 0,
        a_fp: 'SHA256:private-a', b_fp: 'SHA256:private-b',
      },
    }),
  });
  return { controller, sent, audit, closes: () => closes, options };
}

async function enterMatch(h: ReturnType<typeof harness>, overrides: Message = {}) {
  await h.controller.handle({ t: 'hi', service: 'ringside-bot', send_hello_with: 'api key from `ssh host token`' });
  await h.controller.handle({ t: 'welcome', name: 'XENON_RUNNER', elo: 1200, fp: 'SHA256:private', channel: 'bot-api', roster: [...PINNED_ROSTER] });
  await h.controller.handle({ t: 'joinedLounge', char: 'XENON' });
  await h.controller.handle({ t: 'lounge', roster: [{ id: 'target:1', name: h.options.target, cursor: cursor(h.options.opponent), elo: 1200 }], chat: [] });
  await h.controller.handle({
    t: 'matchStart', mid: 'match-1', role: 'a', yourCursor: cursor('XENON'),
    oppName: h.options.target, oppCursor: cursor(h.options.opponent), stage: 'dojo', ...overrides,
  });
}

validateHealth(health);
validatePinnedRoster([...PINNED_ROSTER]);
assert.equal(PINNED_ROSTER.length, 17);
assert.equal(PINNED_ROSTER.at(-1), 'UNCLOSE');
assert.equal(RUNNER_SOURCE_BASE_COMMIT, 'd71c67325912bc076ef6d6715a6845ca605ceafe');
assert.equal(TARGET_DEPLOYMENT_PROFILE, 'sf6-d71-unclose-17');
assert.equal(TARGET_ENGINE_COMMIT, 'd71c67325912bc076ef6d6715a6845ca605ceafe');
assert.match(PINNED_ROSTER_HASH, /^[0-9a-f]{64}$/);
assert.throws(() => validateHealth({ ok: true, service: 'ringside', engine: 'sf-7' }));
assert.throws(() => validatePinnedRoster(PINNED_ROSTER.slice(0, -1)));
assert.throws(() => validatePinnedRoster([...PINNED_ROSTER.slice(0, -2), 'UNCLOSE', 'XENON']));
assert.throws(() => validatePinnedRoster([...PINNED_ROSTER.slice(0, -1), 'BYU']));
console.log('PASS  exact d71 17-fighter roster passes; old 16, substitutions, and order changes fail closed');

const healthOnly = harness();
await healthOnly.controller.handle({ t: 'hi', service: 'ringside-bot' });
assert.equal(healthOnly.sent.some((message) => message.t === 'joinLounge' || message.t === 'input'), false);
assert.equal(healthOnly.controller.status().welcomed, false);
console.log('PASS  sf-6 health alone never attests the d71 17-roster profile or permits Lounge/input');

const golden = JSON.parse(readFileSync(new URL('./fixtures/xenon-matchup-golden-trace.json', import.meta.url), 'utf8')) as {
  derivedFromCommit: string;
  approvedCrossCommit: string;
  approvedPolicySourceHash: string;
  cases: Array<{
    id: string; opponent: OpponentName; actionDelay: number; random: number;
    context: LatencyPolicyContext; action: Inputs;
  }>;
};
assert.equal(golden.derivedFromCommit, '8b2438bc2c633c98e2e86923fc8f0eaeacda0340');
assert.equal(golden.approvedCrossCommit, 'ebb0495f0846211bcdbef20a42701295670df266');
assert.equal(golden.approvedPolicySourceHash, '0ca16d112b292090e19d5606b47aa612a961862b6175fd5833c727690c80bc79');
for (const fixture of golden.cases) {
  const actual = matchupXenonDecision(
    fixture.context, fixture.actionDelay, FROZEN_XENON_MATCHUP_CONFIG,
    fixture.opponent, fixture.opponent, () => fixture.random,
  );
  assert.deepEqual(actual, fixture.action, fixture.id);
}
console.log('PASS  frozen 8b243/ebb0495 golden action trace reproduces independently from recorded contexts');
assert.equal(APPROVED_CROSS_POLICY_SOURCE_HASH, golden.approvedPolicySourceHash);
assert.match(computeGoldenTraceHash(), /^[0-9a-f]{64}$/);
assert.equal(validateRunnerProvenance(), computeRunnerImplementationHash());
assert.throws(() => validateRunnerProvenance('0'.repeat(64)));
console.log('PASS  approved policySourceHash is preserved separately and implementation provenance fails closed');

const happy = harness();
await enterMatch(happy);
assert.deepEqual(happy.sent.slice(0, 2), [
  { t: 'joinLounge', char: 'XENON' }, { t: 'challenge', targetId: 'target:1' },
]);
assert.equal(happy.sent.some((message) => message.t === 'hello'), false);
assert.ok(!JSON.stringify(happy.audit.rows).includes(TEST_API_KEY));
await happy.controller.handle(state());
const firstEdge = happy.sent.at(-1)!;
assert.equal(firstEdge.t, 'input');
assert.ok(firstEdge.motion && (firstEdge.punch || firstEdge.kick));
await happy.controller.handle(state({ frame: 2, ack: 1, you: fighter({ attack: 'phase', attackFrame: 1 }) }));
await happy.controller.handle({ t: 'matchEnd', result: { winner: 'XENON_RUNNER', loser: 'TARGET_FABLE', youWon: true, winnerChar: 'XENON' } });
assert.deepEqual(happy.sent.at(-1), { t: 'leave' });
await happy.controller.handle({ t: 'left' });
assert.equal(happy.closes(), 1);
assert.equal(happy.controller.status().completed, 1);
assert.equal(happy.sent.filter((message) => message.t === 'joinLounge').length, 1);
assert.equal(happy.sent.some((message) => message.t === 'queue'), false);
const official = happy.audit.rows.find((row) => row.event === 'official-result');
assert.ok(official && JSON.stringify(official.payload).includes('/matches/match-1'));
assert.ok(!JSON.stringify(happy.audit.rows).includes('SHA256:private'));
console.log('PASS  exact direct-Lounge happy path completes once, verifies result, and never queues/rejoins');

const wrongHandle = harness();
await wrongHandle.controller.handle({ t: 'hi', service: 'ringside-bot' });
await wrongHandle.controller.handle({ t: 'welcome', name: 'BOT', channel: 'bot-api', roster: [...PINNED_ROSTER] });
assert.equal(wrongHandle.sent.some((message) => message.t === 'input'), false);
assert.equal(wrongHandle.sent.some((message) => message.t === 'joinLounge'), false);
assert.equal(wrongHandle.controller.status().stopped, true);

const wrongCursor = harness();
await wrongCursor.controller.handle({ t: 'hi', service: 'ringside-bot' });
await wrongCursor.controller.handle({ t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER] });
await wrongCursor.controller.handle({ t: 'joinedLounge', char: 'XENON' });
await wrongCursor.controller.handle({ t: 'lounge', roster: [{ id: 'target:1', name: 'TARGET_FABLE', cursor: cursor('MNEME'), elo: 1200 }] });
assert.equal(wrongCursor.sent.some((message) => message.t === 'challenge' || message.t === 'input'), false);
assert.equal(wrongCursor.controller.status().stopped, true);

for (const mismatch of [
  { oppName: 'WRONG' }, { oppCursor: cursor('MNEME') }, { yourCursor: cursor('AJAX') },
]) {
  const wrongStart = harness();
  await enterMatch(wrongStart, mismatch);
  assert.equal(wrongStart.sent.some((message) => message.t === 'input'), false);
  assert.equal(wrongStart.controller.status().stopped, true);
}
console.log('PASS  wrong authenticated handle, Lounge cursor, or matchStart identity/character produce zero inputs');

const welcomeBeforeHello = harness();
await welcomeBeforeHello.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
assert.equal(welcomeBeforeHello.controller.status().stopped, true);
assert.equal(welcomeBeforeHello.sent.some((message) => message.t === 'joinLounge' || message.t === 'input'), false);
console.log('PASS  welcome before play-proxy hi fails closed with zero Lounge or combat input');

const duplicateAuthError = harness();
await duplicateAuthError.controller.handle({ t: 'hi', service: 'ringside-bot' });
await duplicateAuthError.controller.handle({ t: 'error', msg: 'already authenticated' });
assert.equal(duplicateAuthError.controller.status().stopped, true);
assert.equal(duplicateAuthError.sent.some((message) => message.t === 'hello' || message.t === 'joinLounge' || message.t === 'input'), false);
console.log('PASS  duplicate-auth server error is handled fail-closed and client hello is unreachable');

const rosterFirstClock = new FakeClock();
const rosterFirst = harness(baseOptions(), undefined, rosterFirstClock);
await rosterFirst.controller.handle({ t: 'hi', service: 'ringside-bot' });
await rosterFirst.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await rosterFirst.controller.handle({
  t: 'lounge',
  roster: [{
    id: 'target:pre-ack', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1234,
    fp: 'must-not-cache', nested: { unbounded: 'must-not-cache' },
  }],
  chat: [{ message: 'must-not-cache' }],
});
assert.equal(rosterFirst.sent.some((message) => message.t === 'challenge'), false);
assert.deepEqual(rosterFirst.controller.status().cachedLoungeRoster, [
  { id: 'target:pre-ack', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1234 },
]);
assert.ok(!JSON.stringify(rosterFirst.audit.rows).includes('must-not-cache'));
await rosterFirst.controller.handle({ t: 'joinedLounge', char: 'XENON' });
assert.deepEqual(rosterFirst.sent.at(-1), { t: 'challenge', targetId: 'target:pre-ack' });
assert.equal(rosterFirst.sent.filter((message) => message.t === 'challenge').length, 1);
assert.equal(rosterFirst.controller.status().cachedLoungeRoster, null);
rosterFirstClock.advance(5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(rosterFirst.sent.some((message) => message.t === 'ping'), false);
await rosterFirst.controller.handle({
  t: 'lounge', roster: [{ id: 'target:repeat', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }],
});
assert.equal(rosterFirst.sent.filter((message) => message.t === 'challenge').length, 1);
console.log('PASS  roster-before-joined caches only bounded fields and challenges exactly once after joined ack');

const latestBeforeJoinClock = new FakeClock();
const latestBeforeJoin = harness(baseOptions(), undefined, latestBeforeJoinClock);
await latestBeforeJoin.controller.handle({ t: 'hi', service: 'ringside-bot' });
await latestBeforeJoin.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await latestBeforeJoin.controller.handle({
  t: 'lounge', roster: [{ id: 'target:stale', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }],
});
await latestBeforeJoin.controller.handle({
  t: 'lounge', roster: [{ id: 'other:latest', name: 'CLAUDE', cursor: cursor('FABLE'), elo: 1200 }],
});
await latestBeforeJoin.controller.handle({ t: 'joinedLounge', char: 'XENON' });
assert.equal(latestBeforeJoin.sent.some((message) => message.t === 'challenge'), false);

const absentThenPresentClock = new FakeClock();
const absentThenPresent = harness(baseOptions(), undefined, absentThenPresentClock);
await absentThenPresent.controller.handle({ t: 'hi', service: 'ringside-bot' });
await absentThenPresent.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await absentThenPresent.controller.handle({ t: 'joinedLounge', char: 'XENON' });
await absentThenPresent.controller.handle({
  t: 'lounge', roster: [{ id: 'other:1', name: 'CLAUDE', cursor: cursor('FABLE'), elo: 1200 }],
});
assert.equal(absentThenPresent.sent.some((message) => message.t === 'challenge'), false);
await absentThenPresent.controller.handle({
  t: 'lounge', roster: [{ id: 'target:appeared', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }],
});
assert.deepEqual(absentThenPresent.sent.at(-1), { t: 'challenge', targetId: 'target:appeared' });
absentThenPresentClock.advance(5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(absentThenPresent.sent.some((message) => message.t === 'ping'), false);
console.log('PASS  latest roster wins before joined and joined-first absence-to-appearance challenges once');

for (const roster of [
  [
    { id: 'target:1', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 },
    { id: 'target:2', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1201 },
  ],
  [{ id: 'target:wrong-char', name: 'TARGET_FABLE', cursor: cursor('MNEME'), elo: 1200 }],
]) {
  const invalidTarget = harness();
  await invalidTarget.controller.handle({ t: 'hi', service: 'ringside-bot' });
  await invalidTarget.controller.handle({
    t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
  });
  await invalidTarget.controller.handle({ t: 'lounge', roster });
  assert.equal(invalidTarget.sent.some((message) => message.t === 'challenge'), false);
  await invalidTarget.controller.handle({ t: 'joinedLounge', char: 'XENON' });
  assert.equal(invalidTarget.controller.status().stopped, true);
  assert.equal(invalidTarget.sent.some((message) => message.t === 'challenge'), false);
  assert.equal(invalidTarget.controller.status().cachedLoungeRoster, null);
}
console.log('PASS  cached duplicate target and wrong cursor fail closed only after joined gate');

const oversizedRoster = harness();
await oversizedRoster.controller.handle({ t: 'hi', service: 'ringside-bot' });
await oversizedRoster.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await oversizedRoster.controller.handle({
  t: 'lounge',
  roster: Array.from({ length: 257 }, (_, index) => ({
    id: `other:${index}`, name: `OTHER_${index}`, cursor: cursor('FABLE'), elo: 1200,
  })),
});
assert.equal(oversizedRoster.controller.status().stopped, true);
assert.equal(oversizedRoster.controller.status().cachedLoungeRoster, null);
assert.equal(oversizedRoster.sent.some((message) => message.t === 'challenge'), false);

const cachedThenClosed = harness();
await cachedThenClosed.controller.handle({ t: 'hi', service: 'ringside-bot' });
await cachedThenClosed.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await cachedThenClosed.controller.handle({
  t: 'lounge', roster: [{ id: 'target:cached', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }],
});
assert.notEqual(cachedThenClosed.controller.status().cachedLoungeRoster, null);
cachedThenClosed.controller.transportClosed();
assert.equal(cachedThenClosed.controller.status().cachedLoungeRoster, null);
const closedSendCount = cachedThenClosed.sent.length;
const closedAuditCount = cachedThenClosed.audit.rows.length;
await cachedThenClosed.controller.handle({ t: 'joinedLounge', char: 'XENON' });
assert.equal(cachedThenClosed.sent.length, closedSendCount);
assert.equal(cachedThenClosed.audit.rows.length, closedAuditCount);
console.log('PASS  Lounge snapshot is bounded and cleared on transport exit');

const idleClock = new FakeClock();
const idleKeepalive = harness(baseOptions(), undefined, idleClock);
await idleKeepalive.controller.handle({ t: 'hi', service: 'ringside-bot' });
await idleKeepalive.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await idleKeepalive.controller.handle({ t: 'joinedLounge', char: 'XENON' });
await idleKeepalive.controller.handle({
  t: 'lounge', roster: [{ id: 'other:1', name: 'CLAUDE', cursor: cursor('FABLE'), elo: 1200 }],
});
for (let index = 0; index < 5; index++) {
  idleClock.advance(LOUNGE_PING_INTERVAL_MS);
  assert.equal(idleKeepalive.sent.at(-1)?.t, 'ping');
  await idleKeepalive.controller.handle({ t: 'pong' });
}
assert.equal(idleClock.now, 5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(idleKeepalive.sent.filter((message) => message.t === 'ping').length, 5);
assert.equal(idleKeepalive.sent.some((message) => message.t === 'challenge' || message.t === 'input'), false);
assert.equal(idleKeepalive.controller.status().stopped, false);
assert.equal(idleKeepalive.audit.rows.filter((row) => row.event === 'keepalive-ping').length, 5);
assert.equal(idleKeepalive.audit.rows.filter((row) => row.event === 'keepalive-pong').length, 5);
console.log('PASS  authenticated idle Lounge remains healthy beyond two minutes through audited ping/pong');

const missingPongClock = new FakeClock();
const missingPong = harness(baseOptions(), undefined, missingPongClock);
await missingPong.controller.handle({ t: 'hi', service: 'ringside-bot' });
await missingPong.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await missingPong.controller.handle({ t: 'joinedLounge', char: 'XENON' });
missingPongClock.advance(LOUNGE_PING_INTERVAL_MS);
assert.equal(missingPong.sent.at(-1)?.t, 'ping');
missingPongClock.advance(LOUNGE_PONG_TIMEOUT_MS);
assert.equal(missingPong.controller.status().stopped, true);
assert.equal(missingPong.sent.at(-1)?.t, 'leaveLounge');
const stoppedSendCount = missingPong.sent.length;
missingPongClock.advance(5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(missingPong.sent.length, stoppedSendCount);
assert.equal(missingPongClock.tasks.size, 0);
console.log('PASS  missing Lounge pong fails closed on deadline with timer cleanup and no post-stop writes');

const combatClock = new FakeClock();
const combatKeepalive = harness(baseOptions(), undefined, combatClock);
await enterMatch(combatKeepalive);
combatClock.advance(5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(combatKeepalive.sent.some((message) => message.t === 'ping'), false);
assert.equal(combatClock.tasks.size, 0);
const closedClock = new FakeClock();
const transportClosed = harness(baseOptions(), undefined, closedClock);
await transportClosed.controller.handle({ t: 'hi', service: 'ringside-bot' });
await transportClosed.controller.handle({
  t: 'welcome', name: 'XENON_RUNNER', channel: 'bot-api', roster: [...PINNED_ROSTER],
});
await transportClosed.controller.handle({ t: 'joinedLounge', char: 'XENON' });
transportClosed.controller.transportClosed();
closedClock.advance(5 * LOUNGE_PING_INTERVAL_MS);
assert.equal(transportClosed.sent.some((message) => message.t === 'ping'), false);
assert.equal(closedClock.tasks.size, 0);
console.log('PASS  keepalive is disarmed for match/combat and transport close with no late writes');

const hitStop = harness();
await enterMatch(hitStop);
await hitStop.controller.handle(state({ hitStop: 2 }));
const suppressed = hitStop.sent.at(-1)!;
assert.deepEqual(
  { motion: suppressed.motion, punch: suppressed.punch, kick: suppressed.kick, throw: suppressed.throw, jump: suppressed.jump },
  { motion: 'N', punch: false, kick: false, throw: false, jump: false },
);
assert.ok(hitStop.audit.rows.some((row) => row.event === 'decision'
  && JSON.stringify(row.payload).includes('hitstop-edge-suppressed')));
console.log('PASS  hitStop suppresses every edge while preserving an audited decision');

const retry = harness();
await enterMatch(retry);
await retry.controller.handle(state({ frame: 10 }));
const canonical = retry.sent.at(-1)!;
await retry.controller.handle(state({ frame: 11, ack: 1 }));
await retry.controller.handle(state({ frame: 13, ack: 2 }));
const retried = retry.sent.at(-1)!;
for (const key of ['moveX', 'down', 'jump', 'punch', 'kick', 'throw', 'motion'])
  assert.equal(retried[key], canonical[key], `retry changed ${key}`);
assert.ok(retry.audit.rows.some((row) => row.event === 'decision'
  && JSON.stringify(row.payload).includes('acked-no-start-retry')));
await retry.controller.handle(state({ frame: 14, ack: 3, you: fighter({ attack: 'phase', attackFrame: 1 }) }));
assert.equal(retry.controller.status().pending, null);
assert.ok(retry.audit.rows.some((row) => row.event === 'attack-confirmed'));
console.log('PASS  ack/no-start retries exactly once with canonical edge and authoritative attack confirmation clears latch');

const retryTimeout = harness();
await enterMatch(retryTimeout);
await retryTimeout.controller.handle(state({ frame: 20 }));
await retryTimeout.controller.handle(state({ frame: 23, ack: 1 }));
await retryTimeout.controller.handle(state({ frame: 26, ack: 2 }));
await retryTimeout.controller.handle(state({ frame: 29, ack: 3 }));
await retryTimeout.controller.handle(state({ frame: 30, ack: 4 }));
assert.equal(retryTimeout.controller.status().stopped, true);
assert.match(JSON.stringify(retryTimeout.audit.rows), /attack start timeout/);
console.log('PASS  bounded retry exhaustion aborts safely');

const ackTimeout = harness();
await enterMatch(ackTimeout);
await ackTimeout.controller.handle(state({ frame: 30 }));
await ackTimeout.controller.handle(state({ frame: 61, ack: 0 }));
assert.equal(ackTimeout.controller.status().stopped, true);
assert.match(JSON.stringify(ackTimeout.audit.rows), /input ack timeout/);
console.log('PASS  unacknowledged edge timeout aborts safely');

const droppedRoundEdge = harness();
await enterMatch(droppedRoundEdge);
await droppedRoundEdge.controller.handle(state({ frame: 40 }));
const beforeRoundOver = droppedRoundEdge.sent.filter((message) => message.t === 'input').length;
await droppedRoundEdge.controller.handle(state({ frame: 41, ack: 1, phase: 'round-over' }));
assert.equal(droppedRoundEdge.sent.filter((message) => message.t === 'input').length, beforeRoundOver);
assert.equal(droppedRoundEdge.controller.status().pending, null);
assert.equal(droppedRoundEdge.controller.status().stopped, false);
assert.ok(droppedRoundEdge.audit.rows.some((row) => row.event === 'pending-abandoned'));
console.log('PASS  fight-to-round-over abandons and audits pending edge without retry, timeout, or combat input');

const matchOverPending = harness();
await enterMatch(matchOverPending);
await matchOverPending.controller.handle(state({ frame: 50 }));
const beforeMatchOver = matchOverPending.sent.length;
await matchOverPending.controller.handle(state({ frame: 51, ack: 1, phase: 'match-over' }));
assert.equal(matchOverPending.sent.length, beforeMatchOver);
assert.equal(matchOverPending.controller.status().stopped, false);
await matchOverPending.controller.handle({ t: 'matchEnd', result: { winner: 'XENON_RUNNER', loser: 'TARGET_FABLE', youWon: true, winnerChar: 'XENON' } });
assert.deepEqual(matchOverPending.sent.at(-1), { t: 'leave' });
console.log('PASS  match-over is observation-only and waits for authoritative matchEnd');

const mismatch = harness();
await enterMatch(mismatch);
await mismatch.controller.handle(state({ frame: 60 }));
await mismatch.controller.handle(state({ frame: 61, ack: 1, you: fighter({ attack: 'kick', attackFrame: 1 }) }));
assert.equal(mismatch.controller.status().stopped, true);
assert.match(JSON.stringify(mismatch.audit.rows), /attack confirmation mismatch: expected phase, got kick/);
assert.ok(!mismatch.audit.rows.some((row) => row.event === 'attack-confirmed'));
console.log('PASS  attack confirmation requires exact expected raw attack and fails closed on mismatch');

const validOfficialMatch = {
  id: 'match-1', mode: 'versus', engine_version: 'sf-6',
  a_name: 'XENON_RUNNER', b_name: 'TARGET_FABLE', a_char: 'XENON', b_char: 'FABLE',
  end_reason: 'ko', winner: 'a', a_rounds: 2, b_rounds: 0,
};
const validMatchEnd = { winner: 'XENON_RUNNER', loser: 'TARGET_FABLE', youWon: true, winnerChar: 'XENON' };
const officialNegativeCases = [
  { name: 'mode', match: { ...validOfficialMatch, mode: 'practice' }, result: validMatchEnd },
  { name: 'engine', match: { ...validOfficialMatch, engine_version: 'sf-5' }, result: validMatchEnd },
  { name: 'winner', match: { ...validOfficialMatch, winner: 'b' }, result: validMatchEnd },
  { name: 'rounds', match: { ...validOfficialMatch, a_rounds: 1 }, result: validMatchEnd },
  { name: 'matchEnd', match: validOfficialMatch, result: { winner: 'TARGET_FABLE', loser: 'XENON_RUNNER', youWon: false, winnerChar: 'FABLE' } },
] as const;
for (const negative of officialNegativeCases) {
  const rejected = harness(baseOptions(), { match: negative.match });
  await enterMatch(rejected);
  await rejected.controller.handle({ t: 'matchEnd', result: negative.result });
  assert.equal(rejected.controller.status().stopped, true, negative.name);
  assert.equal(rejected.controller.status().completed, 0, negative.name);
  assert.ok(!rejected.audit.rows.some((row) => row.event === 'official-result'), negative.name);
}
console.log('PASS  official result fails closed on mode, engine, winner, rounds, or matchEnd inconsistency');

const mergeLikeCoordinator = (destination: Inputs, incoming: Inputs): void => {
  destination.moveX = incoming.moveX;
  destination.down = incoming.down;
  destination.motion = incoming.motion || destination.motion;
  destination.jump ||= incoming.jump;
  destination.punch ||= incoming.punch;
  destination.kick ||= incoming.kick;
  destination.throw ||= incoming.throw;
};
const messageInputs = (message: Message): Inputs => ({
  moveX: Number(message.moveX), down: Boolean(message.down), jump: Boolean(message.jump),
  punch: Boolean(message.punch), kick: Boolean(message.kick), throw: Boolean(message.throw),
  motion: String(message.motion ?? ''),
});
const expectedFrozenWire: Record<OpponentName, Inputs> = {
  OMEGA: { ...emptyInputs(), moveX: 1, motion: 'N' },
  AJAX: { ...emptyInputs(), moveX: 1, motion: 'N' },
  MNEME: { ...emptyInputs(), moveX: 1, motion: 'N' },
  FABLE: { ...emptyInputs(), kick: true, motion: 'LR' },
};
for (const opponent of ['OMEGA', 'MNEME', 'AJAX', 'FABLE'] as const) {
  const wireGolden = harness(baseOptions({
    opponent, target: `TARGET_${opponent}`, actionDelay: 5, seed: 42,
  }));
  await enterMatch(wireGolden);
  await wireGolden.controller.handle(state({
    frame: 20, you: fighter({ x: 70, facing: 1 }),
    opp: fighter({ x: 140, facing: -1 }),
  }));
  assert.deepEqual(messageInputs(wireGolden.sent.at(-1)!), expectedFrozenWire[opponent], opponent);
  assert.equal(wireGolden.controller.status().safetyProfile, 'frozen', opponent);
}
console.log('PASS  default runner emits frozen new-wave wire traces, including immediate FABLE Phase');
const sticky = emptyInputs();
const phaseEdge = {
  ...emptyInputs(), motion: String(canonical.motion), kick: true,
};
mergeLikeCoordinator(sticky, phaseEdge);
clearEdges(sticky);
assert.equal(sticky.motion, canonical.motion, 'fixture must model coordinator sticky motion');
const staleMatch = makeMatch(makeFighter('a', 'XENON', 'a'), makeFighter('b', 'FABLE', 'b'));
staleMatch.phase = 'fight'; staleMatch.a.x = 80; staleMatch.b.x = 100;
mergeLikeCoordinator(sticky, { ...emptyInputs(), motion: 'N', kick: true });
stepMatch(staleMatch, sticky, emptyInputs());
assert.equal(staleMatch.a.attack, 'kick', 'explicit N must overwrite stale phase motion before a normal kick');
console.log('PASS  explicit neutral wire motion clears coordinator-sticky special motion before later edges');

for (const runnerSide of ['a', 'b'] as const) {
  const roundReset = harness(baseOptions({ opponent: 'MNEME', target: 'TARGET_MNEME' }));
  await enterMatch(roundReset, { role: runnerSide });
  const coordinatorPending = emptyInputs();

  await roundReset.controller.handle(state({
    frame: 70, opp: fighter({ x: 130, facing: -1, attack: 'construct', attackFrame: 31 }),
  }));
  const priorPhaseEdge = messageInputs(roundReset.sent.at(-1)!);
  assert.equal(priorPhaseEdge.motion, 'LR', runnerSide);
  assert.equal(priorPhaseEdge.kick, true, runnerSide);
  mergeLikeCoordinator(coordinatorPending, priorPhaseEdge);

  const oldRound = runnerSide === 'a'
    ? makeMatch(makeFighter('a', 'XENON', 'a'), makeFighter('b', 'MNEME', 'b'))
    : makeMatch(makeFighter('a', 'MNEME', 'a'), makeFighter('b', 'XENON', 'b'));
  oldRound.phase = 'fight';
  const oldRunner = runnerSide === 'a' ? oldRound.a : oldRound.b;
  const oldOpponent = runnerSide === 'a' ? oldRound.b : oldRound.a;
  oldRunner.x = 80; oldOpponent.x = 130;
  stepMatch(
    oldRound,
    runnerSide === 'a' ? coordinatorPending : emptyInputs(),
    runnerSide === 'b' ? coordinatorPending : emptyInputs(),
  );
  assert.equal(oldRunner.attack, 'phase', `${runnerSide}: fixture must start from a real Phase`);
  clearEdges(coordinatorPending);
  assert.equal(coordinatorPending.motion, 'LR', `${runnerSide}: coordinator must retain LR after edge clear`);

  await roundReset.controller.handle(state({ frame: 71, ack: 1, phase: 'round-over' }));
  assert.equal(roundReset.controller.status().needsMotionReset, true, runnerSide);
  const sentBeforeReset = roundReset.sent.length;
  await roundReset.controller.handle(state({ frame: 72, ack: 1, phase: 'fight' }));
  assert.equal(roundReset.sent.length, sentBeforeReset + 1, runnerSide);
  const reset = messageInputs(roundReset.sent.at(-1)!);
  assert.deepEqual(
    { motion: reset.motion, jump: reset.jump, punch: reset.punch, kick: reset.kick, throw: reset.throw },
    { motion: 'N', jump: false, punch: false, kick: false, throw: false },
    runnerSide,
  );
  mergeLikeCoordinator(coordinatorPending, reset);
  clearEdges(coordinatorPending);
  assert.equal(coordinatorPending.motion, 'N', `${runnerSide}: acknowledged reset must replace sticky LR`);

  const sentWhileResetUnacked = roundReset.sent.length;
  await roundReset.controller.handle(state({
    frame: 73, ack: 1, phase: 'fight', you: fighter(),
    opp: fighter({ x: 100, facing: -1 }),
  }));
  assert.equal(roundReset.sent.length, sentWhileResetUnacked, `${runnerSide}: policy must wait for reset ack`);

  await roundReset.controller.handle(state({
    frame: 74, ack: 2, phase: 'fight', you: fighter(),
    opp: fighter({ x: 100, facing: -1 }),
  }));
  const intendedNormalKick = messageInputs(roundReset.sent.at(-1)!);
  assert.equal(intendedNormalKick.motion, '', `${runnerSide}: frozen policy fixture must intend no special motion`);
  assert.equal(intendedNormalKick.kick, true, runnerSide);
  mergeLikeCoordinator(coordinatorPending, intendedNormalKick);

  const nextRound = runnerSide === 'a'
    ? makeMatch(makeFighter('a', 'XENON', 'a'), makeFighter('b', 'MNEME', 'b'))
    : makeMatch(makeFighter('a', 'MNEME', 'a'), makeFighter('b', 'XENON', 'b'));
  nextRound.phase = 'fight';
  const nextRunner = runnerSide === 'a' ? nextRound.a : nextRound.b;
  const nextOpponent = runnerSide === 'a' ? nextRound.b : nextRound.a;
  nextRunner.x = 80; nextOpponent.x = 100;
  stepMatch(
    nextRound,
    runnerSide === 'a' ? coordinatorPending : emptyInputs(),
    runnerSide === 'b' ? coordinatorPending : emptyInputs(),
  );
  assert.equal(nextRunner.attack, 'kick', `${runnerSide}: reset must prevent stale LR from producing Phase`);
  await roundReset.controller.handle(state({
    frame: 75, ack: 3, phase: 'fight', you: fighter({ attack: 'kick', attackFrame: 1 }),
    opp: fighter({ x: 100, facing: -1 }),
  }));
  assert.equal(roundReset.controller.status().stopped, false, `${runnerSide}: exact normal kick must confirm`);
  assert.ok(!roundReset.sent.some((message) => message.t === 'leave'), runnerSide);
}
console.log('PASS  acknowledged round reset prevents sticky LR Phase on next-round normal kick for both seats');

class FakeTokenChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kills: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals = 'SIGTERM') { this.kills.push(signal); return true; }
}

async function tokenOutputAttempt(output: string, code = 0) {
  const child = new FakeTokenChild();
  let command = '', args: string[] = [];
  const promise = mintApiToken(
    baseOptions(),
    ((spawnCommand: string, spawnArgs: string[]) => {
      command = spawnCommand; args = spawnArgs; return child as unknown as TokenChild;
    }),
  );
  child.stdout.write(output);
  child.emit('exit', code);
  return { child, command, args, promise };
}

const minted = await tokenOutputAttempt(`player  : ${baseOptions().handle}\napi key : ${TEST_API_KEY}\n`);
assert.equal(await minted.promise, TEST_API_KEY);
assert.equal(minted.command, 'ssh');
assert.equal(minted.args.at(-1), 'token');
assert.ok(minted.args.includes(`${baseOptions().handle}@${baseOptions().host}`));
assert.ok(!minted.args.some((arg) => arg.includes(TEST_API_KEY)));
for (const required of [
  'BatchMode=yes', 'NumberOfPasswordPrompts=0', 'ConnectTimeout=10', 'IdentitiesOnly=yes',
  'ServerAliveInterval=30', 'ServerAliveCountMax=3',
])
  assert.ok(minted.args.includes(required), required);
for (const output of [
  '',
  `player  : ${baseOptions().handle}\napi key : rk_short\n`,
  `player  : ${baseOptions().handle}\napi key : ${TEST_API_KEY}-suffix\n`,
  `player  : ${baseOptions().handle}\napi key : ${TEST_API_KEY}A\n`,
  `player  : WRONG\napi key : ${TEST_API_KEY}\n`,
  `player  : ${baseOptions().handle}\nplayer  : WRONG\napi key : ${TEST_API_KEY}\n`,
  `player  : ${baseOptions().handle}\napi key : ${TEST_API_KEY}\napi key : rk_short\n`,
  `player  : ${baseOptions().handle}\napi key : ${TEST_API_KEY}\napi key : ${TEST_API_KEY}\n`,
]) {
  const failed = await tokenOutputAttempt(output);
  await assert.rejects(failed.promise);
}
const oversized = await tokenOutputAttempt('x'.repeat(32 * 1024 + 1));
await assert.rejects(oversized.promise, /token mint output exceeded bound/);
assert.deepEqual(oversized.child.kills, ['SIGTERM']);
const errorTokenChild = new FakeTokenChild();
const errorSchedules: Array<{ handler: () => void; ms: number }> = [];
const errorMint = mintApiToken(
  baseOptions(), () => errorTokenChild as unknown as TokenChild,
  ((handler: () => void, ms: number) => { errorSchedules.push({ handler, ms }); return {} as ReturnType<typeof setTimeout>; }),
  (() => {}),
);
errorTokenChild.emit('error', new Error(`secret ${TEST_API_KEY}`));
await assert.rejects(errorMint, /token mint child error/);
assert.deepEqual(errorTokenChild.kills, ['SIGTERM']);
const timeoutTokenChild = new FakeTokenChild();
const timeoutSchedules: Array<{ handler: () => void; ms: number }> = [];
const timeoutMint = mintApiToken(
  baseOptions(), () => timeoutTokenChild as unknown as TokenChild,
  ((handler: () => void, ms: number) => { timeoutSchedules.push({ handler, ms }); return {} as ReturnType<typeof setTimeout>; }),
  (() => {}),
);
timeoutSchedules.find((timer) => timer.ms === TOKEN_MINT_TIMEOUT_MS)!.handler();
await assert.rejects(timeoutMint, /token mint timeout/);
timeoutSchedules.find((timer) => timer.ms === 1000)!.handler();
assert.deepEqual(timeoutTokenChild.kills, ['SIGTERM', 'SIGKILL']);
console.log('PASS  token mint is strict, noninteractive, argv-safe, bounded, and handles missing/malformed/duplicate/error/timeout');

for (const reason of ['missing', 'malformed', 'duplicate', 'timeout', 'error']) {
  let playOpened = 0;
  await assert.rejects(() => executeRunner(baseOptions(), {
    createAudit: () => new MemoryAudit(), fetchJson: async () => health,
    mintToken: async () => { throw new Error(`token ${reason}`); },
    openTransport: () => { playOpened++; throw new Error('play must not open'); },
  }));
  assert.equal(playOpened, 0, reason);
}
console.log('PASS  every token failure path opens zero play transports');

class FakeSshChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  kills: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals = 'SIGTERM') { this.kills.push(signal); return true; }
}
const fakeChild = new FakeSshChild();
let sshCommand = '', sshArgs: string[] = [];
const scheduledKills: Array<{ handler: () => void; ms: number }> = [];
const sshTransport = createSshTransport(
  baseOptions(),
  ((command: string, args: string[]) => { sshCommand = command; sshArgs = args; return fakeChild as unknown as SshChild; }),
  ((handler: () => void, ms: number) => { scheduledKills.push({ handler, ms }); return {} as ReturnType<typeof setTimeout>; }),
  (() => {}),
);
let transportError = '', transportExit: number | null | undefined;
sshTransport.onError((error) => { transportError = error.message; });
sshTransport.onExit((code) => { transportExit = code; });
fakeChild.emit('error', new Error('spawn failed'));
assert.equal(transportError, 'spawn failed');
sshTransport.close();
for (const scheduled of scheduledKills.sort((a, b) => a.ms - b.ms)) scheduled.handler();
assert.equal(sshCommand, 'ssh');
for (const required of [
  'BatchMode=yes', 'NumberOfPasswordPrompts=0', 'ConnectTimeout=10', 'IdentitiesOnly=yes',
  'ServerAliveInterval=30', 'ServerAliveCountMax=3',
])
  assert.ok(sshArgs.includes(required), required);
assert.deepEqual(fakeChild.kills, ['SIGTERM', 'SIGKILL']);
fakeChild.emit('exit', 255);
assert.equal(transportExit, 255);
console.log('PASS  injectable SSH child is noninteractive and close escalates SIGTERM/SIGKILL with error/exit delivery');

let lifecycleAudit: MemoryAudit | null = null;
let lifecycleHandler: ((message: Message) => void | Promise<void>) = () => {};
let lifecycleExit: (code: number | null) => void = () => {};
const bridgeEvents: string[] = [];
const lifecycleTransport: RunnerTransport = {
  send(message) {
    if (message.t === 'hello') bridgeEvents.push('client-hello');
    if (message.t === 'leave') queueMicrotask(() => { void lifecycleHandler({ t: 'left' }); });
  },
  close() { queueMicrotask(() => lifecycleExit(0)); },
  onMessage(handler) {
    lifecycleHandler = handler;
    queueMicrotask(() => { void (async () => {
      bridgeEvents.push('bot-hi');
      await handler({ t: 'hi', service: 'ringside-bot' });
      bridgeEvents.push('server-injected-trustedFp-hello');
      bridgeEvents.push('exact-welcome');
      await handler({ t: 'welcome', name: 'XENON_RUNNER', elo: 1200, channel: 'bot-api', roster: [...PINNED_ROSTER] });
      await handler({ t: 'joinedLounge', char: 'XENON' });
      await handler({ t: 'lounge', roster: [{ id: 'target:1', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }] });
      await handler({ t: 'matchStart', mid: 'match-1', role: 'a', yourCursor: cursor('XENON'), oppName: 'TARGET_FABLE', oppCursor: cursor('FABLE'), stage: 'dojo' });
      await handler({ t: 'matchEnd', result: validMatchEnd });
    })(); });
  },
  onExit(handler) { lifecycleExit = handler; },
  onError() {},
};
await executeRunner(baseOptions(), {
  createAudit: () => { lifecycleAudit = new MemoryAudit(); return lifecycleAudit; },
  fetchJson: async (url) => url.endsWith('/api/health') ? health : { match: validOfficialMatch },
  mintToken: async () => { bridgeEvents.push('token-mint'); return TEST_API_KEY; },
  openTransport: () => { bridgeEvents.push('play-open'); return lifecycleTransport; },
});
const lifecycleRows = lifecycleAudit!.rows.map((row) => row.event);
assert.ok(lifecycleRows.indexOf('transport-exit') >= 0);
assert.ok(lifecycleRows.indexOf('transport-exit') < lifecycleRows.indexOf('ledger-close'));
const lifecycleText = JSON.stringify(lifecycleAudit!.rows);
assert.ok(!lifecycleText.includes(TEST_API_KEY));
assert.deepEqual(bridgeEvents.slice(0, 5), [
  'token-mint', 'play-open', 'bot-hi', 'server-injected-trustedFp-hello', 'exact-welcome',
]);
assert.equal(bridgeEvents.includes('client-hello'), false);
assert.equal(lifecycleAudit!.rows.some((row) => row.event === 'outbound' && (row.payload as Message).t === 'hello'), false);
console.log('PASS  SSH bridge orders mint -> hi -> injected trustedFp auth -> exact welcome with zero client hello');

let idleExitAudit: MemoryAudit | null = null;
const idleExitTransport: RunnerTransport = {
  send() {}, close() {}, onMessage() {}, onError() {},
  onExit(handler) { queueMicrotask(() => handler(255)); },
};
await assert.rejects(() => executeRunner(baseOptions(), {
  createAudit: () => { idleExitAudit = new MemoryAudit(); return idleExitAudit; },
  fetchJson: async () => health, mintToken: async () => TEST_API_KEY,
  openTransport: () => idleExitTransport,
}), /ssh exited before bounded completion/);
const idleExitRows = idleExitAudit!.rows.map((row) => row.event);
assert.ok(idleExitRows.indexOf('transport-exit') >= 0);
assert.ok(idleExitRows.indexOf('failed') > idleExitRows.indexOf('transport-exit'));
assert.ok(idleExitRows.indexOf('failed') < idleExitRows.indexOf('ledger-close'));
assert.match(
  JSON.stringify(idleExitAudit!.rows.find((row) => row.event === 'failed')?.payload),
  /ssh exited before bounded completion/,
);
console.log('PASS  unexpected idle SSH exit records the actionable failure before ledger close');

let errorAudit: MemoryAudit | null = null;
let errorExit: (code: number | null) => void = () => {};
const errorTransport: RunnerTransport = {
  send() {}, close() { queueMicrotask(() => errorExit(255)); },
  onMessage() {}, onExit(handler) { errorExit = handler; },
  onError(handler) { queueMicrotask(() => handler(new Error(`failed ${baseOptions().identity}`))); },
};
await assert.rejects(() => executeRunner(baseOptions(), {
  createAudit: () => { errorAudit = new MemoryAudit(); return errorAudit; },
  fetchJson: async () => health, mintToken: async () => TEST_API_KEY, openTransport: () => errorTransport,
}));
const errorRows = errorAudit!.rows.map((row) => row.event);
assert.ok(errorRows.indexOf('transport-error') >= 0);
assert.ok(errorRows.indexOf('transport-error') < errorRows.indexOf('transport-exit'));
assert.ok(errorRows.indexOf('transport-exit') < errorRows.indexOf('ledger-close'));
assert.ok(!JSON.stringify(errorAudit!.rows).includes(baseOptions().identity));
console.log('PASS  transport error and exit are audited in order with identity path redacted before ledger close');

let noExitAudit: MemoryAudit | null = null;
let noExitHandler: ((message: Message) => void | Promise<void>) = () => {};
const noExitTransport: RunnerTransport = {
  send(message) { if (message.t === 'leave') queueMicrotask(() => { void noExitHandler({ t: 'left' }); }); },
  close() {}, onExit() {}, onError() {},
  onMessage(handler) {
    noExitHandler = handler;
    queueMicrotask(() => { void (async () => {
      await handler({ t: 'hi', service: 'ringside-bot' });
      await handler({ t: 'welcome', name: 'XENON_RUNNER', elo: 1200, channel: 'bot-api', roster: [...PINNED_ROSTER] });
      await handler({ t: 'joinedLounge', char: 'XENON' });
      await handler({ t: 'lounge', roster: [{ id: 'target:1', name: 'TARGET_FABLE', cursor: cursor('FABLE'), elo: 1200 }] });
      await handler({ t: 'matchStart', mid: 'match-1', role: 'a', yourCursor: cursor('XENON'), oppName: 'TARGET_FABLE', oppCursor: cursor('FABLE'), stage: 'dojo' });
      await handler({ t: 'matchEnd', result: validMatchEnd });
    })(); });
  },
};
await assert.rejects(() => executeRunner(baseOptions(), {
  createAudit: () => { noExitAudit = new MemoryAudit(); return noExitAudit; },
  fetchJson: async (url) => url.endsWith('/api/health') ? health : { match: validOfficialMatch },
  mintToken: async () => TEST_API_KEY,
  openTransport: () => noExitTransport,
  schedule: ((handler: () => void, ms: number) => {
    if (ms === 2000) queueMicrotask(handler);
    return {} as ReturnType<typeof setTimeout>;
  }),
  clearSchedule: () => {},
}));
const noExitRows = noExitAudit!.rows.map((row) => row.event);
assert.ok(noExitRows.indexOf('transport-termination-timeout') >= 0);
assert.ok(noExitRows.indexOf('transport-termination-timeout') < noExitRows.indexOf('ledger-close'));
console.log('PASS  missing child exit cannot hang and records termination timeout before ledger close');

const temp = mkdtempSync(join(tmpdir(), 'xenon-runner-test-'));
const ledgerPath = join(temp, 'ledger.jsonl');
const fileAudit = new SecureJsonlAudit(ledgerPath);
fileAudit.append('secret-test', { fp: 'SECRET_FP', a_fp: 'SECRET_A', identity: '/secret/key', nested: { fingerprint: 'SECRET_B' }, public: 'ok' });
fileAudit.close();
const ledger = readFileSync(ledgerPath, 'utf8');
assert.equal(statSync(ledgerPath).mode & 0o777, 0o600);
assert.ok(!ledger.includes('SECRET_') && !ledger.includes('/secret/key') && ledger.includes('[REDACTED]'));
unlinkSync(ledgerPath);
console.log('PASS  exclusive audit ledger is mode 0600 and recursively redacts keys/fingerprints');

const identityPath = join(temp, 'dedicated-key');
const dryPath = join(temp, 'dry-run.jsonl');
writeFileSync(identityPath, 'test-only-key'); chmodSync(identityPath, 0o600);
const parsed = parseArgs([
  '--identity', identityPath, '--handle', 'XENON_RUNNER', '--target', 'TARGET_FABLE',
  '--opponent', 'FABLE', '--profile', 'new-wave', '--output', dryPath, '--dry-run', '--matches', '1',
]);
let fetched = 0, mintedDry = 0, opened = 0;
await executeRunner(parsed, {
  fetchJson: async () => { fetched++; return health; },
  mintToken: async () => { mintedDry++; return TEST_API_KEY; },
  openTransport: () => { opened++; throw new Error('dry-run opened transport'); },
});
assert.equal(fetched, 0); assert.equal(mintedDry, 0); assert.equal(opened, 0);
const dryLedger = readFileSync(dryPath, 'utf8');
assert.match(dryLedger, /"networkAccess":false/);
assert.match(dryLedger, /"socketOpened":false/);
assert.equal(statSync(dryPath).mode & 0o777, 0o600);
assert.equal((runnerManifest(parsed).matchLimit), 1);
assert.throws(() => parseArgs([
  '--identity', identityPath, '--handle', 'X', '--target', 'Y', '--opponent', 'FABLE',
  '--profile', 'new-wave', '--output', join(temp, 'other'), '--matches', '2',
]));
unlinkSync(dryPath); unlinkSync(identityPath);
console.log('PASS  dry-run creates a bounded manifest without health, token mint, or socket; max matches is exactly one');

console.log('\nXENON BOUNDED RUNNER TEST: PASS');

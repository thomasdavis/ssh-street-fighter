import { EventEmitter } from 'node:events';
import {
  chmodSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { PassThrough } from 'node:stream';
import { attackActive, specialMoveStats } from './game/engine.js';
import { SPECIAL_ATTACK_KINDS, type SpecialAttack } from './game/moves.js';
import type { Fighter, Inputs, Match } from './game/types.js';
import { MatchCoordinator, type WorkerRef } from './cluster/coordinator.js';
import type { P2W } from './cluster/messages.js';
import {
  CONTROLLER_HASH, CONTROLLER_ID, createRunnerController, createSshTransport,
  DEPLOYMENT_ATTESTATION, executeRunner, LOUNGE_PING_INTERVAL_MS,
  LOUNGE_PONG_TIMEOUT_MS, mintApiToken, OWN_CHARACTER, OWN_HANDLE, parseArgs,
  PINNED_ROSTER, PINNED_ROSTER_HASH, POLICY_CONFIG_SHA256, POLICY_SOURCE_SHA256,
  redact, runnerManifest, SecureJsonlAudit, TARGET_CHARACTER, TARGET_HANDLE,
  TOKEN_MINT_TIMEOUT_MS, validateControllerProvenance, validateHealth,
  validatePinnedRoster,
  type AuditSink, type HealthPayload, type RunnerOptions, type RunnerTransport,
  type SshChild, type TokenChild,
} from './tools/codex-dgx-bounded-opponent.js';

type Message = Record<string, unknown>;

class MemoryAudit implements AuditSink {
  rows: Array<{ sequence: number; event: string; payload: unknown }> = [];
  closed = false;
  append(event: string, payload: unknown = {}) {
    this.rows.push({ sequence: this.rows.length + 1, event, payload: redact(payload) });
  }
  close() { this.closed = true; }
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

const options = (overrides: Partial<RunnerOptions> = {}): RunnerOptions => ({
  identity: '/private/CODEX_DGX', output: '/tmp/unused.jsonl', host: 'sshfighter.com',
  timeoutMs: 600_000, dryRun: false, ...overrides,
});
const health: HealthPayload = { ok: true, service: 'ringside', engine: 'sf-6', uptime_s: 100 };
const cursor = (name: string): number => PINNED_ROSTER.indexOf(name as typeof PINNED_ROSTER[number]);
const rosterEntry = (overrides: Message = {}): Message => ({
  id: 'xenon:1', name: TARGET_HANDLE, cursor: cursor(TARGET_CHARACTER), elo: 1200, ...overrides,
});
const incoming = (overrides: Message = {}): Message => ({
  t: 'challengeState', incoming: { id: 'xenon:1', name: TARGET_HANDLE, ...overrides }, outgoing: null,
});
const lounge = (entries: Message[] = [rosterEntry()]): Message => ({ t: 'lounge', roster: entries, chat: [] });
const fighter = (overrides: Message = {}): Message => ({
  x: 80, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0,
  attack: 'none', attackFrame: 0, stun: 0, crouching: false,
  special: false, active: false, casting: false, ...overrides,
});
const state = (overrides: Message = {}): Message => ({
  t: 'state', frame: 1, phase: 'fight', round: 1, roundTime: 99, hitStop: 0, ack: 0,
  you: fighter(), opp: fighter({ x: 140, facing: -1 }), projectiles: [], ...overrides,
});

function official(role: 'a' | 'b', winner: 'a' | 'b' = role): Message {
  return {
    match: {
      id: 'match-1', mode: 'versus', engine_version: 'sf-6', end_reason: 'ko', winner,
      a_name: role === 'a' ? OWN_HANDLE : TARGET_HANDLE,
      b_name: role === 'b' ? OWN_HANDLE : TARGET_HANDLE,
      a_char: role === 'a' ? OWN_CHARACTER : TARGET_CHARACTER,
      b_char: role === 'b' ? OWN_CHARACTER : TARGET_CHARACTER,
      a_rounds: winner === 'a' ? 2 : 0,
      b_rounds: winner === 'b' ? 2 : 0,
      a_fp: 'SHA256:PRIVATEAAAA', b_fp: 'SHA256:PRIVATEBBBB',
    },
  };
}

function matchEnd(role: 'a' | 'b', winner: 'a' | 'b' = role): Message {
  const ownWon = winner === role;
  return {
    t: 'matchEnd',
    result: {
      winner: ownWon ? OWN_HANDLE : TARGET_HANDLE,
      loser: ownWon ? TARGET_HANDLE : OWN_HANDLE,
      youWon: ownWon,
      winnerChar: ownWon ? OWN_CHARACTER : TARGET_CHARACTER,
    },
  };
}

function harness(role: 'a' | 'b' = 'a', clock?: FakeClock, officialPayload?: Message) {
  const sent: Message[] = [];
  const audit = new MemoryAudit();
  let closes = 0;
  const controller = createRunnerController(options(), health, {
    send: (message) => sent.push(message),
    close: () => { closes++; },
    audit,
    schedule: clock?.schedule,
    clearSchedule: clock?.clear,
    fetchOfficial: async () => officialPayload ?? official(role),
  });
  return { controller, sent, audit, closes: () => closes, role };
}

async function authenticate(h: ReturnType<typeof harness>) {
  await h.controller.handle({ t: 'hi', service: 'ringside-bot', send_hello_with: 'proof' });
  await h.controller.handle({
    t: 'welcome', name: OWN_HANDLE, elo: 1200, fp: 'SHA256:PRIVATEWELCOME',
    channel: 'bot-api', roster: [...PINNED_ROSTER],
  });
}

async function enterMatch(h: ReturnType<typeof harness>) {
  await authenticate(h);
  await h.controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
  await h.controller.handle(lounge());
  await h.controller.handle(incoming());
  await h.controller.handle({
    t: 'matchStart', mid: 'match-1', role: h.role,
    yourCursor: cursor(OWN_CHARACTER), oppName: TARGET_HANDLE,
    oppCursor: cursor(TARGET_CHARACTER), stage: 'dojo',
  });
}

class CoordinatorWorker implements WorkerRef {
  messages: P2W[] = [];
  constructor(readonly id: number) {}
  send = (message: P2W): void => { this.messages.push(message); };
  take<T extends P2W['t']>(kind: T): Extract<P2W, { t: T }> {
    const index = this.messages.findIndex((message) => message.t === kind);
    assert.notEqual(index, -1, `missing coordinator ${kind}`);
    return this.messages.splice(index, 1)[0] as Extract<P2W, { t: T }>;
  }
  latest<T extends P2W['t']>(kind: T): Extract<P2W, { t: T }> {
    const value = [...this.messages].reverse().find((message) => message.t === kind);
    assert.ok(value, `missing coordinator ${kind}`);
    return value as Extract<P2W, { t: T }>;
  }
}

function botFighterView(value: Fighter): Message {
  const special = SPECIAL_ATTACK_KINDS.has(value.attack);
  let casting = false;
  if (special && !attackActive(value)) {
    try { casting = value.attackFrame < specialMoveStats(value.attack as SpecialAttack).startup; } catch { /* no-op */ }
  }
  return {
    x: Math.round(value.x), y: Math.round(value.y), vx: Math.round(value.vx), vy: Math.round(value.vy),
    facing: value.facing, hp: value.hp, wins: value.wins, attack: value.attack,
    attackFrame: value.attackFrame, stun: value.stun, pose: value.pose,
    crouching: value.crouching, special, active: attackActive(value), casting,
  };
}

function coordinatorWireState(match: Match, role: 'a' | 'b', ack: number): Message {
  const you = role === 'a' ? match.a : match.b;
  const opp = role === 'a' ? match.b : match.a;
  return {
    t: 'state', frame: match.frame, phase: match.phase, round: match.round,
    roundTime: Math.round(match.roundTime), hitStop: match.hitStop, ack,
    you: botFighterView(you), opp: botFighterView(opp),
    projectiles: match.projectiles.filter((projectile) => projectile.active).map((projectile) => ({
      owner: projectile.owner, x: Math.round(projectile.x), y: Math.round(projectile.y),
      vx: projectile.vx, style: projectile.style,
    })),
  };
}

async function coordinatorActuationHarness(role: 'a' | 'b') {
  const coordinator = new MatchCoordinator();
  const codexWorker = new CoordinatorWorker(71);
  const xenonWorker = new CoordinatorWorker(72);
  const codexSid = 701;
  const xenonSid = 702;
  const codexQueue = {
    t: 'queue' as const, sid: codexSid, cid: 'codex-dgx-test', name: OWN_HANDLE,
    fp: null, cursor: cursor(OWN_CHARACTER), elo: 1200, region: 'XX',
  };
  const xenonQueue = {
    t: 'queue' as const, sid: xenonSid, cid: 'xenon-dgx-test', name: TARGET_HANDLE,
    fp: null, cursor: cursor(TARGET_CHARACTER), elo: 1200, region: 'XX',
  };
  if (role === 'a') {
    coordinator.handle(codexWorker, codexQueue);
    coordinator.handle(xenonWorker, xenonQueue);
  } else {
    coordinator.handle(xenonWorker, xenonQueue);
    coordinator.handle(codexWorker, codexQueue);
  }
  const start = codexWorker.take('matchStart');
  assert.equal(start.role, role);
  const sent: Message[] = [];
  const audit = new MemoryAudit();
  let wireSeq = 0;
  const controller = createRunnerController(options(), health, {
    audit,
    close: () => {},
    fetchOfficial: async () => { throw new Error('not used'); },
    send: (message) => {
      sent.push(message);
      if (message.t !== 'input') return;
      const { t: _type, ...rawInput } = message;
      coordinator.handle(codexWorker, {
        t: 'input', mid: start.mid, sid: codexSid,
        input: rawInput as unknown as Inputs, seq: ++wireSeq,
      });
    },
  });
  await controller.handle({ t: 'hi', service: 'ringside-bot', send_hello_with: 'proof' });
  await controller.handle({
    t: 'welcome', name: OWN_HANDLE, elo: 1200, fp: 'SHA256:PRIVATEWELCOME',
    channel: 'bot-api', roster: [...PINNED_ROSTER],
  });
  await controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
  await controller.handle(lounge());
  await controller.handle(incoming());
  await controller.handle({
    t: 'matchStart', mid: start.mid, role: start.role, yourCursor: start.yourCursor,
    oppName: start.oppName, oppCursor: start.oppCursor, stage: start.stage,
  });
  coordinator.tick();
  const relayed = codexWorker.latest('state');
  return { coordinator, controller, codexWorker, sent, audit, match: relayed.m, role, wireSeq: () => wireSeq };
}

validateHealth(health);
validatePinnedRoster([...PINNED_ROSTER]);
validateControllerProvenance();
assert.equal(PINNED_ROSTER.length, 16);
assert.equal(PINNED_ROSTER.includes('UNCLOSE' as never), false);
assert.match(PINNED_ROSTER_HASH, /^[0-9a-f]{64}$/);
assert.match(POLICY_SOURCE_SHA256, /^[0-9a-f]{64}$/);
assert.match(POLICY_CONFIG_SHA256, /^[0-9a-f]{64}$/);
assert.match(CONTROLLER_HASH, /^[0-9a-f]{64}$/);
assert.equal(CONTROLLER_ID, 'adaptive-codex-fable-v2');
assert.equal(DEPLOYMENT_ATTESTATION, 'sf6-991-pre-UNCLOSE');
assert.throws(() => validateHealth({ ok: true, service: 'ringside', engine: 'sf-7' }));
assert.throws(() => validatePinnedRoster([...PINNED_ROSTER, 'UNCLOSE']));
assert.throws(() => validatePinnedRoster([...PINNED_ROSTER.slice(0, -1), 'UNCLOSE']));
console.log('PASS  exact sf6-991-pre-UNCLOSE health/16-roster and controller provenance fail closed');

const protocolEvents = [
  { t: 'joinedLounge', char: OWN_CHARACTER },
  lounge(),
  incoming(),
];
const permutations = <T>(rows: T[]): T[][] => rows.length <= 1
  ? [rows]
  : rows.flatMap((row, index) => permutations([...rows.slice(0, index), ...rows.slice(index + 1)])
    .map((tail) => [row, ...tail]));
for (const order of permutations(protocolEvents)) {
  const h = harness();
  await authenticate(h);
  for (const event of order) await h.controller.handle(event);
  assert.equal(h.sent.filter((message) => message.t === 'acceptChallenge').length, 1, JSON.stringify(order));
  assert.equal(h.sent.some((message) => message.t === 'challenge'), false);
  assert.equal(h.sent.some((message) => message.t === 'queue' || message.t === 'dequeue'), false);
  assert.equal(h.sent.some((message) => message.t === 'hello'), false);
}
console.log('PASS  every joined/Lounge/incoming protocol order accepts exactly once and never challenges or queues');

const wrongCases: Array<{ name: string; events: Message[] }> = [
  {
    name: 'welcome before hi',
    events: [
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER] },
    ],
  },
  {
    name: 'wrong authenticated handle',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: 'CODEX_AGENT', channel: 'bot-api', roster: [...PINNED_ROSTER] },
    ],
  },
  {
    name: '17-fighter roster',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER, 'UNCLOSE'] },
    ],
  },
  {
    name: 'wrong challenger handle',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER] },
      { t: 'joinedLounge', char: OWN_CHARACTER },
      { t: 'lounge', roster: [{ id: 'other:1', name: 'OMEGA_DGX', cursor: cursor('OMEGA'), elo: 1200 }], chat: [] },
      { t: 'challengeState', incoming: { id: 'other:1', name: 'OMEGA_DGX' }, outgoing: null },
    ],
  },
  {
    name: 'wrong XENON cursor',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER] },
      { t: 'joinedLounge', char: OWN_CHARACTER },
      lounge([rosterEntry({ cursor: cursor('FABLE') })]), incoming(),
    ],
  },
  {
    name: 'duplicate XENON handle',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER] },
      { t: 'joinedLounge', char: OWN_CHARACTER },
      lounge([rosterEntry(), rosterEntry({ id: 'xenon:2' })]), incoming(),
    ],
  },
  {
    name: 'outgoing challenge state',
    events: [
      { t: 'hi', service: 'ringside-bot' },
      { t: 'welcome', name: OWN_HANDLE, channel: 'bot-api', roster: [...PINNED_ROSTER] },
      { t: 'joinedLounge', char: OWN_CHARACTER },
      { t: 'challengeState', incoming: null, outgoing: { id: 'x', name: TARGET_HANDLE } },
    ],
  },
];
for (const mismatch of wrongCases) {
  const h = harness();
  for (const event of mismatch.events) await h.controller.handle(event);
  assert.equal(h.sent.some((message) => message.t === 'acceptChallenge'), false, mismatch.name);
  assert.equal(h.sent.some((message) => message.t === 'input'), false, mismatch.name);
  assert.equal(h.controller.status().stopped, true, mismatch.name);
}
console.log('PASS  authentication, roster, challenger, cursor, uniqueness, and outgoing mismatches produce zero accept/input');

const latestRosterWins = harness();
await authenticate(latestRosterWins);
await latestRosterWins.controller.handle(lounge());
await latestRosterWins.controller.handle(lounge([]));
await latestRosterWins.controller.handle(incoming());
await latestRosterWins.controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
assert.equal(latestRosterWins.sent.some((message) => message.t === 'acceptChallenge'), false);
assert.equal(latestRosterWins.controller.status().stopped, true);
console.log('PASS  acceptance uses the latest bounded roster, never an earlier matching snapshot');

for (const mismatch of [
  { oppName: 'WRONG' },
  { oppCursor: cursor('FABLE') },
  { yourCursor: cursor('AJAX') },
  { role: 'c' },
]) {
  const h = harness();
  await authenticate(h);
  await h.controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
  await h.controller.handle(lounge());
  await h.controller.handle(incoming());
  await h.controller.handle({
    t: 'matchStart', mid: 'match-1', role: 'a', yourCursor: cursor(OWN_CHARACTER),
    oppName: TARGET_HANDLE, oppCursor: cursor(TARGET_CHARACTER), stage: 'dojo', ...mismatch,
  });
  assert.equal(h.sent.some((message) => message.t === 'input'), false);
  assert.equal(h.controller.status().stopped, true);
}
console.log('PASS  matchStart handle/cursor/role mismatches fail closed with zero combat input');

for (const role of ['a', 'b'] as const) {
  const h = harness(role, undefined, official(role, 'a'));
  await enterMatch(h);
  assert.equal(h.controller.status().role, role);
  await h.controller.handle(state());
  const action = h.sent.at(-1)!;
  assert.equal(action.t, 'input');
  assert.equal(action.motion, 'N');
  const stateRow = h.audit.rows.find((row) => row.event === 'state');
  const decisionRow = h.audit.rows.find((row) => row.event === 'decision');
  const emittedRow = h.audit.rows.find((row) => row.event === 'emitted-action');
  assert.ok(stateRow && decisionRow && emittedRow);
  const winner = 'a'; // covers one CODEX win (seat A) and one CODEX loss (seat B)
  await h.controller.handle(matchEnd(role, winner));
  assert.equal(h.controller.status().completed, 1);
  assert.equal(h.controller.status().matchEnded, true);
  assert.equal(h.closes(), 1);
  assert.equal(h.sent.some((message) => message.t === 'leave'), false);
  const count = h.sent.length;
  await h.controller.handle({
    t: 'matchStart', mid: 'match-2', role, yourCursor: cursor(OWN_CHARACTER),
    oppName: TARGET_HANDLE, oppCursor: cursor(TARGET_CHARACTER), stage: 'dojo',
  });
  assert.equal(h.sent.length, count);
  assert.ok(h.audit.rows.some((row) => row.event === 'official-result'));
  assert.equal(JSON.stringify(h.audit.rows).includes('SHA256:PRIVATE'), false);
}
console.log('PASS  both seats validate one official normal result, never leave/forfeit after matchEnd, and reject excess matches');

const postEndMismatch = harness('a', undefined, {
  match: { ...(official('a').match as Message), a_name: 'WRONG' },
});
await enterMatch(postEndMismatch);
await postEndMismatch.controller.handle(matchEnd('a'));
assert.equal(postEndMismatch.controller.status().stopped, true);
assert.equal(postEndMismatch.controller.status().matchEnded, true);
assert.equal(postEndMismatch.sent.some((message) => message.t === 'leave'), false);
assert.equal(JSON.stringify(postEndMismatch.audit.rows).includes('safety-forfeit'), false);
console.log('PASS  official mismatch after authoritative matchEnd fails closed without creating a false forfeit');

const hitStop = harness();
await enterMatch(hitStop);
await hitStop.controller.handle(state({ hitStop: 2 }));
const suppressed = hitStop.sent.at(-1)!;
assert.deepEqual(
  { jump: suppressed.jump, punch: suppressed.punch, kick: suppressed.kick, throw: suppressed.throw, motion: suppressed.motion },
  { jump: false, punch: false, kick: false, throw: false, motion: 'N' },
);
assert.match(JSON.stringify(hitStop.audit.rows), /hitstop-edge-suppressed/);

const roundReset = harness();
await enterMatch(roundReset);
await roundReset.controller.handle(state({ frame: 100, phase: 'round-over' }));
const beforeReset = roundReset.sent.length;
await roundReset.controller.handle(state({ frame: 101, phase: 'fight' }));
assert.equal(roundReset.sent.length, beforeReset + 1);
assert.equal(roundReset.sent.at(-1)?.motion, 'N');
assert.match(JSON.stringify(roundReset.audit.rows), /round-motion-reset/);
console.log('PASS  hitStop/nonfight edges are suppressed and sticky motion resets to N between rounds');

function prepareActuationMatch(match: Match, role: 'a' | 'b'): { you: Fighter; opp: Fighter } {
  match.phase = 'fight';
  match.phaseTimer = 0;
  match.roundTime = 99;
  match.frame = 100;
  match.hitStop = 0;
  match.projectiles.length = 0;
  match.sparks.length = 0;
  const you = role === 'a' ? match.a : match.b;
  const opp = role === 'a' ? match.b : match.a;
  Object.assign(you, {
    x: 80, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0,
    attack: 'none', attackFrame: 0, attackHit: false, attackCrouch: false,
    stun: 0, thrownT: 0, phaseT: 0, armorT: 0, victoryT: 0,
    crouching: false, blocking: false,
  });
  Object.assign(opp, {
    x: 140, y: 0, vx: 0, vy: 0, facing: -1, hp: 100, wins: 0,
    attack: 'none', attackFrame: 0, attackHit: false, attackCrouch: false,
    stun: 0, thrownT: 0, phaseT: 0, armorT: 0, victoryT: 0,
    crouching: false, blocking: false,
  });
  return { you, opp };
}

for (const role of ['a', 'b'] as const) {
  const airborne = await coordinatorActuationHarness(role);
  const airborneFighters = prepareActuationMatch(airborne.match, role);
  Object.assign(airborneFighters.you, { y: 30, vy: -2 });
  Object.assign(airborneFighters.opp, { x: 115 });
  await airborne.controller.handle(coordinatorWireState(airborne.match, role, airborne.wireSeq()));
  assert.equal(airborne.sent.at(-1)?.t, 'input');
  assert.equal(airborne.sent.at(-1)?.kick, true);
  airborne.coordinator.tick();
  const airborneRelay = airborne.codexWorker.latest('state');
  assert.equal((role === 'a' ? airborneRelay.m.a : airborneRelay.m.b).attack, 'jumpkick');
  await airborne.controller.handle(coordinatorWireState(airborneRelay.m, role, airborneRelay.ack));
  assert.equal(airborne.controller.status().stopped, false);
  assert.equal(airborne.controller.status().pending, null);
  assert.ok(airborne.audit.rows.some((row) => row.event === 'attack-confirmed'
    && JSON.stringify(row.payload).includes('jumpkick')));

  const conversion = await coordinatorActuationHarness(role);
  const conversionFighters = prepareActuationMatch(conversion.match, role);
  Object.assign(conversionFighters.you, {
    y: 40, vy: -2, attack: 'context', attackFrame: 15, attackHit: false,
  });
  Object.assign(conversionFighters.opp, {
    x: 105, attack: 'kick', attackFrame: 11, attackHit: false,
  });
  const preAck = coordinatorWireState(conversion.match, role, conversion.wireSeq());
  await conversion.controller.handle(preAck);
  assert.equal(conversion.sent.at(-1)?.t, 'input');
  assert.ok(conversion.sent.at(-1)?.motion);
  const afterEdge = conversion.sent.length;
  await conversion.controller.handle(preAck);
  assert.equal(conversion.controller.status().stopped, false);
  assert.equal(conversion.sent.length, afterEdge, 'pre-ack predecessor state emitted an overtaking input');
  assert.match(JSON.stringify(conversion.audit.rows), /pending-edge-awaiting-ack/);
  conversion.coordinator.tick();
  const conversionRelay = conversion.codexWorker.latest('state');
  assert.equal((role === 'a' ? conversionRelay.m.a : conversionRelay.m.b).attack, 'mergecomet');
  await conversion.controller.handle(coordinatorWireState(conversionRelay.m, role, conversionRelay.ack));
  assert.equal(conversion.controller.status().stopped, false);
  assert.equal(conversion.controller.status().pending, null);
}
console.log('PASS  real coordinator+engine confirms airborne kick→jumpkick and pre-ack Context→Weight conversion on both seats');

async function deterministicTrace(): Promise<string> {
  const h = harness('a');
  await enterMatch(h);
  await h.controller.handle(state({ frame: 4, ack: 0 }));
  await h.controller.handle(state({ frame: 5, ack: 1, you: fighter({ x: 82 }) }));
  await h.controller.handle(matchEnd('a'));
  return JSON.stringify(h.audit.rows);
}
assert.equal(await deterministicTrace(), await deterministicTrace());
console.log('PASS  fixed protocol/state stream produces a byte-identical deterministic audit trace');

const idleClock = new FakeClock();
const idle = harness('a', idleClock);
await authenticate(idle);
await idle.controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
await idle.controller.handle(lounge([]));
for (let i = 0; i < 5; i++) {
  idleClock.advance(LOUNGE_PING_INTERVAL_MS);
  assert.equal(idle.sent.at(-1)?.t, 'ping');
  await idle.controller.handle({ t: 'pong' });
}
assert.equal(idle.controller.status().stopped, false);
assert.equal(idle.sent.some((message) => message.t === 'challenge' || message.t === 'queue'), false);

const missedPongClock = new FakeClock();
const missedPong = harness('a', missedPongClock);
await authenticate(missedPong);
await missedPong.controller.handle({ t: 'joinedLounge', char: OWN_CHARACTER });
missedPongClock.advance(LOUNGE_PING_INTERVAL_MS + LOUNGE_PONG_TIMEOUT_MS);
assert.equal(missedPong.controller.status().stopped, true);
assert.equal(missedPongClock.tasks.size, 0);
console.log('PASS  idle Lounge keepalive survives repeated pongs and fails bounded on a missing pong');

const safety = harness();
await enterMatch(safety);
await safety.controller.handle(state({ ack: 99 }));
assert.equal(safety.sent.at(-1)?.t, 'leave');
assert.match(JSON.stringify(safety.audit.rows), /safety-forfeit/);
console.log('PASS  post-matchStart invariant failure documents and uses the sole fail-closed forfeit path');

const scratch = mkdtempSync(join(tmpdir(), 'codex-dgx-runner-test-'));
const keyPath = join(scratch, 'dedicated-key');
writeFileSync(keyPath, 'not-a-real-key\n', { mode: 0o600 });
const parsed = parseArgs(['--', '--dry-run', '--identity', keyPath, '--output', join(scratch, 'parsed.jsonl')]);
assert.equal(parsed.dryRun, true);
assert.equal(parsed.host, 'sshfighter.com');
assert.throws(() => parseArgs([
  '--dry-run', '--identity', keyPath, '--output', join(scratch, 'bad.jsonl'), '--host', 'elsewhere',
]));

const securePath = join(scratch, 'secure.jsonl');
const secure = new SecureJsonlAudit(securePath);
secure.append('secrets', {
  fp: 'SHA256:PRIVATE', identity: '/secret/id', key: `rk_${'K'.repeat(32)}`,
  nested: { api_key: `rk_${'A'.repeat(32)}`, text: 'kept' },
});
secure.close();
assert.equal(statSync(securePath).mode & 0o777, 0o600);
const secureText = readFileSync(securePath, 'utf8');
assert.equal(secureText.includes('/secret/id'), false);
assert.equal(secureText.includes(`rk_${'K'.repeat(32)}`), false);
assert.equal(secureText.includes('SHA256:PRIVATE'), false);
assert.equal(secureText.includes('kept'), true);
assert.throws(() => new SecureJsonlAudit(securePath));
console.log('PASS  ledger creation is exclusive mode0600 with recursive identity/key/token/fingerprint redaction');

let dryFetch = 0;
let dryMint = 0;
let drySocket = 0;
const dryOutput = join(scratch, 'dry.jsonl');
await executeRunner(options({ identity: keyPath, output: dryOutput, dryRun: true }), {
  fetchJson: async () => { dryFetch++; throw new Error('unreachable'); },
  mintToken: async () => { dryMint++; throw new Error('unreachable'); },
  openTransport: () => { drySocket++; throw new Error('unreachable'); },
});
assert.deepEqual({ dryFetch, dryMint, drySocket }, { dryFetch: 0, dryMint: 0, drySocket: 0 });
assert.equal(statSync(dryOutput).mode & 0o777, 0o600);
const dryRows = readFileSync(dryOutput, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Message);
assert.deepEqual(dryRows.map((row) => row.event), ['manifest', 'dry-run']);
assert.equal(JSON.stringify(dryRows).includes(keyPath), false);
assert.equal(JSON.stringify(dryRows).includes(dryOutput), false);
assert.equal((dryRows[0]!.payload as Message).ownHandle, OWN_HANDLE);
console.log('PASS  dry run writes only provenance and performs zero token/HTTP/socket work');

class FakeTokenChild extends EventEmitter implements TokenChild {
  stdout = new PassThrough();
  stderr = new PassThrough();
  signals: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals = 'SIGTERM') { this.signals.push(signal); return true; }
}

const tokenOptions = options({ identity: keyPath });
const successChild = new FakeTokenChild();
const successPromise = mintApiToken(tokenOptions, () => successChild);
successChild.stdout.write(`player  : ${OWN_HANDLE}\napi key : rk_${'A'.repeat(32)}\n`);
successChild.emit('exit', 0);
assert.equal(await successPromise, `rk_${'A'.repeat(32)}`);

const wrongPlayerChild = new FakeTokenChild();
const wrongPlayerPromise = mintApiToken(tokenOptions, () => wrongPlayerChild);
wrongPlayerChild.stdout.write(`player  : CODEX_AGENT\napi key : rk_${'A'.repeat(32)}\n`);
wrongPlayerChild.emit('exit', 0);
await assert.rejects(wrongPlayerPromise, /wrong-player/);

const duplicatePlayerChild = new FakeTokenChild();
const duplicatePlayerPromise = mintApiToken(tokenOptions, () => duplicatePlayerChild);
duplicatePlayerChild.stdout.write(`player  : ${OWN_HANDLE}\nplayer  : OTHER\napi key : rk_${'A'.repeat(32)}\n`);
duplicatePlayerChild.emit('exit', 0);
await assert.rejects(duplicatePlayerPromise, /wrong-player/);

const overflowChild = new FakeTokenChild();
const overflowPromise = mintApiToken(tokenOptions, () => overflowChild);
overflowChild.stdout.write('X'.repeat(32 * 1024 + 1));
await assert.rejects(overflowPromise, /exceeded bound/);
assert.deepEqual(overflowChild.signals, ['SIGTERM']);

const tokenClock = new FakeClock();
const timeoutChild = new FakeTokenChild();
const timeoutPromise = mintApiToken(tokenOptions, () => timeoutChild, tokenClock.schedule, tokenClock.clear);
tokenClock.advance(TOKEN_MINT_TIMEOUT_MS);
await assert.rejects(timeoutPromise, /timeout/);
assert.deepEqual(timeoutChild.signals, ['SIGTERM']);
tokenClock.advance(1000);
assert.deepEqual(timeoutChild.signals, ['SIGTERM', 'SIGKILL']);
console.log('PASS  same-key token proof requires one exact player/key line and TERM/KILL bounds a hung child');

class FakeSshChild extends EventEmitter implements SshChild {
  stdin = new PassThrough();
  stdout = new PassThrough();
  signals: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals = 'SIGTERM') { this.signals.push(signal); return true; }
}

const sshClock = new FakeClock();
const sshChild = new FakeSshChild();
let spawnArgs: string[] = [];
const transport = createSshTransport(tokenOptions, (_command, args) => {
  spawnArgs = args;
  return sshChild;
}, sshClock.schedule, sshClock.clear);
assert.equal(spawnArgs.includes(`${OWN_HANDLE}@sshfighter.com`), true);
assert.equal(spawnArgs.includes('play'), true);
assert.equal(spawnArgs.includes(`rk_${'A'.repeat(32)}`), false);
transport.close();
sshClock.advance(250);
assert.deepEqual(sshChild.signals, ['SIGTERM']);
sshClock.advance(750);
assert.deepEqual(sshChild.signals, ['SIGTERM', 'SIGKILL']);
sshChild.emit('exit', 0);
assert.equal(sshClock.tasks.size, 0);
console.log('PASS  play proxy receives no client token/hello and bounded close escalates TERM then KILL');

const manifest = runnerManifest(options({ output: dryOutput, dryRun: true }));
assert.equal(manifest.ownHandle, OWN_HANDLE);
assert.equal(manifest.targetHandle, TARGET_HANDLE);
assert.equal(manifest.matchLimit, 1);
assert.equal(manifest.quickQueueAllowed, false);
assert.match(String(manifest.residualRisk), /forfeit/);

for (const file of [securePath, dryOutput, keyPath]) {
  try { chmodSync(file, 0o600); unlinkSync(file); } catch { /* best-effort test cleanup */ }
}

console.log('\nCODEX_DGX BOUNDED OPPONENT TEST: PASS');

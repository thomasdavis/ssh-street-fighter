import { strict as assert } from 'node:assert';
import { chmodSync, mkdtempSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyInputs, type Inputs } from './game/types.js';
import { clearEdges } from './cluster/messages.js';
import { makeFighter, makeMatch, stepMatch } from './game/engine.js';
import {
  APPROVED_CROSS_POLICY_SOURCE_HASH, adaptBotWireContext,
  createFrozenXenonMatchupPolicy, matchupLaunchHash,
  type WireFighterObservation,
} from './policies/xenon-matchup.js';
import {
  createUniversalXenonPolicy, expectedProfile,
  FROZEN_LEGACY_POLICY_SOURCE_HASH, UNIVERSAL_OPPONENTS,
  type UniversalOpponent,
} from './policies/xenon-universal.js';
import {
  FROZEN_LEGACY_CONDITIONED_CONFIG, FROZEN_LEGACY_CONDITIONED_CONFIG_HASH,
} from './policies/xenon-legacy-runtime.js';
import {
  computeLegacyRuntimeSourceHash,
  createRunnerController, executeRunner, parseArgs,
  PINNED_ROSTER, redact, runnerManifest,
  type AuditSink, type HealthPayload, type RunnerOptions,
} from './tools/xenon-bounded-runner.js';

type Message = Record<string, unknown>;

const mergeCoordinatorInput = (destination: Inputs, incoming: Inputs): void => {
  destination.moveX = incoming.moveX;
  destination.down = incoming.down;
  destination.motion = incoming.motion || destination.motion;
  destination.jump ||= incoming.jump;
  destination.punch ||= incoming.punch;
  destination.kick ||= incoming.kick;
  destination.throw ||= incoming.throw;
};

class MemoryAudit implements AuditSink {
  rows: Array<{ event: string; payload: unknown }> = [];
  append(event: string, payload: unknown = {}) { this.rows.push({ event, payload: redact(payload) }); }
  close() {}
}

const health: HealthPayload = { ok: true, service: 'ringside', engine: 'sf-6' };
const cursor = (character: string): number => PINNED_ROSTER.indexOf(character as typeof PINNED_ROSTER[number]);
const options = (opponent: UniversalOpponent, overrides: Partial<RunnerOptions> = {}): RunnerOptions => ({
  identity: '/test/key', handle: 'XENON_TEST', target: `TARGET_${opponent}`,
  opponent, profile: expectedProfile(opponent), output: '/tmp/test-only.jsonl',
  host: 'sshfighter.com', actionDelay: 5, seed: 2026081901,
  matches: 1, timeoutMs: 600000, dryRun: true, ...overrides,
});
const fighter = (overrides: Message = {}): Message => ({
  x: 80, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0,
  attack: 'none', attackFrame: 0, stun: 0, crouching: false,
  pose: 'idle', special: false, active: false, casting: false, ...overrides,
});
const wireFighter = (overrides: Partial<WireFighterObservation> = {}): WireFighterObservation => ({
  x: 80, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0,
  attack: 'none', attackFrame: 0, stun: 0, crouching: false, ...overrides,
});
const state = (frame: number, ack: number, overrides: Message = {}): Message => ({
  t: 'state', frame, phase: 'fight', round: 1, roundTime: 60, hitStop: 0, ack,
  you: fighter(), opp: fighter({ x: 150, facing: -1 }), projectiles: [], ...overrides,
});

function controllerHarness(runnerOptions: RunnerOptions) {
  const sent: Message[] = [];
  const audit = new MemoryAudit();
  const controller = createRunnerController(runnerOptions, health, {
    send: (message) => sent.push(message), close: () => {}, audit,
    fetchOfficial: async () => { throw new Error('not used'); },
  });
  return { controller, sent, audit };
}

async function enter(h: ReturnType<typeof controllerHarness>, runnerOptions: RunnerOptions, side: 'a' | 'b') {
  await h.controller.handle({ t: 'hi', service: 'ringside-bot' });
  await h.controller.handle({
    t: 'welcome', name: runnerOptions.handle, channel: 'bot-api', roster: [...PINNED_ROSTER],
  });
  await h.controller.handle({ t: 'joinedLounge', char: 'XENON' });
  await h.controller.handle({
    t: 'lounge', roster: [{ id: 'target', name: runnerOptions.target, cursor: cursor(runnerOptions.opponent), elo: 1200 }],
  });
  await h.controller.handle({
    t: 'matchStart', mid: `${runnerOptions.opponent}-${side}`, role: side,
    yourCursor: cursor('XENON'), oppName: runnerOptions.target,
    oppCursor: cursor(runnerOptions.opponent), stage: 'dojo',
  });
}

assert.equal(UNIVERSAL_OPPONENTS.length, 15);
assert.equal(new Set(UNIVERSAL_OPPONENTS).size, 15);
assert.ok(!UNIVERSAL_OPPONENTS.includes('XENON' as never));
assert.equal(computeLegacyRuntimeSourceHash(), FROZEN_LEGACY_POLICY_SOURCE_HASH);
assert.deepEqual(FROZEN_LEGACY_CONDITIONED_CONFIG, {
  phaseBandMin: 56, phaseBandMax: 84, landingLeadFrames: 4,
  antiAirAvoidDistance: 62, threatPhaseDistance: 68, latencyReachPerFrame: 2,
  gylePhaseRetreatFrames: 54, gylePhaseRetreatDistance: 64, gyleElectricAvoidDistance: 44,
});
const runtimeSource = readFileSync(new URL('./policies/xenon-legacy-runtime.ts', import.meta.url), 'utf8');
assert.ok(!runtimeSource.includes('legacyConditionedCandidates'));
assert.ok(!runtimeSource.includes('xenon-legacy-actuation-dev'));
assert.ok(!runtimeSource.includes('opponents/legacy-ood'));
console.log('PASS  curated runtime config is exact and imports no search, evaluator, or opponent family');
for (const opponent of UNIVERSAL_OPPONENTS) {
  const profile = expectedProfile(opponent);
  const binding = createUniversalXenonPolicy({
    configuredOpponent: opponent, actualOpponent: opponent, profile,
    actionDelay: 5, observationAgeFrames: 0, targetSeed: 42,
  });
  assert.equal(binding.profile, profile, opponent);
  assert.equal(binding.actuatorProfile, profile === 'legacy' ? 'legacy-delay' : 'frozen', opponent);
  assert.match(binding.launchHash, /^[0-9a-f]{64}$/, opponent);
  assert.throws(() => createUniversalXenonPolicy({
    configuredOpponent: opponent, actualOpponent: opponent,
    profile: profile === 'legacy' ? 'new-wave' : 'legacy',
    actionDelay: 5, targetSeed: 42,
  }), /requires exact/);
  const wrongActual = UNIVERSAL_OPPONENTS.find((candidate) => candidate !== opponent)!;
  assert.throws(() => createUniversalXenonPolicy({
    configuredOpponent: opponent, actualOpponent: wrongActual, profile,
    actionDelay: 5, targetSeed: 42,
  }), /does not match actual/);
}
console.log('PASS  exact fifteen-opponent mapping binds character/profile and rejects mismatch');

for (const opponent of ['OMEGA', 'AJAX', 'FABLE', 'MNEME'] as const) {
  const universal = createUniversalXenonPolicy({
    configuredOpponent: opponent, actualOpponent: opponent, profile: 'new-wave',
    actionDelay: 5, targetSeed: 42,
  });
  const frozen = createFrozenXenonMatchupPolicy({
    configuredOpponent: opponent, actualOpponent: opponent, actionDelay: 5, seed: 42,
  });
  const context = adaptBotWireContext(
    wireFighter(), wireFighter({ x: 150, facing: -1 }), [], 'fight', 20, 'a',
  );
  assert.deepEqual(universal.decide(context), frozen.decide(context), opponent);
  assert.equal(universal.policyHash, frozen.policyHash, opponent);
  assert.equal(universal.configHash, frozen.configHash, opponent);
  assert.equal(universal.sourceHash, APPROVED_CROSS_POLICY_SOURCE_HASH, opponent);
  assert.equal(universal.delegateLaunchHash, matchupLaunchHash(frozen.configHash, opponent), opponent);
}
console.log('PASS  all new-wave dispatches preserve frozen delegate actions and hashes');

for (const opponent of UNIVERSAL_OPPONENTS) {
  for (const side of ['a', 'b'] as const) {
    const runnerOptions = options(opponent);
    const h = controllerHarness(runnerOptions);
    await enter(h, runnerOptions, side);
    await h.controller.handle(state(1, 0));
    const inputs = h.sent.filter((message) => message.t === 'input');
    assert.equal(inputs.length, 1, `${opponent}/${side}`);
    assert.equal(h.controller.status().safetyProfile, expectedProfile(opponent) === 'legacy' ? 'legacy-delay' : 'frozen');
    const validated = h.audit.rows.find((row) => row.event === 'match-validated')?.payload as Message;
    assert.equal(validated.opponentCharacter, opponent, `${opponent}/${side}`);
    assert.equal(validated.policyProfile, expectedProfile(opponent), `${opponent}/${side}`);
  }
}
console.log('PASS  all fifteen opponents and both seats bind cursor/character before one combat input');

for (const opponent of UNIVERSAL_OPPONENTS) {
  const runnerOptions = options(opponent);
  const h = controllerHarness(runnerOptions);
  await h.controller.handle({ t: 'hi', service: 'ringside-bot' });
  await h.controller.handle({ t: 'welcome', name: runnerOptions.handle, channel: 'bot-api', roster: [...PINNED_ROSTER] });
  await h.controller.handle({ t: 'joinedLounge', char: 'XENON' });
  await h.controller.handle({
    t: 'lounge', roster: [{ id: 'target', name: runnerOptions.target, cursor: cursor(opponent), elo: 1200 }],
  });
  const wrong = UNIVERSAL_OPPONENTS.find((candidate) => candidate !== opponent)!;
  await h.controller.handle({
    t: 'matchStart', mid: 'wrong', role: 'a', yourCursor: cursor('XENON'),
    oppName: runnerOptions.target, oppCursor: cursor(wrong), stage: 'dojo',
  });
  assert.equal(h.sent.some((message) => message.t === 'input'), false, opponent);
}
console.log('PASS  matchStart opponent mismatch produces zero combat inputs for all configured opponents');

const gyleOptions = options('GYLE');
const gyle = controllerHarness(gyleOptions);
await enter(gyle, gyleOptions, 'a');
await gyle.controller.handle(state(1, 0));
const phase = gyle.sent.at(-1)!;
assert.equal(phase.t, 'input'); assert.equal(phase.kick, true); assert.equal(phase.motion, 'LR');
await gyle.controller.handle(state(2, 1, { you: fighter({ attack: 'phase', attackFrame: 1 }) }));
await gyle.controller.handle(state(20, 2));
const retreat = gyle.sent.at(-1)!;
assert.equal(retreat.t, 'input'); assert.equal(retreat.moveX, -1);
assert.equal(retreat.punch, false); assert.equal(retreat.kick, false); assert.equal(retreat.throw, false);
assert.equal(gyle.controller.status().lastConfirmedAttack, 'phase');
console.log('PASS  legacy runner feeds authoritative confirmed-Phase age into GYLE conditioned retreat');

for (const side of ['a', 'b'] as const) {
  const runnerOptions = options('GYLE');
  const resetCase = controllerHarness(runnerOptions);
  await enter(resetCase, runnerOptions, side);
  const sticky = emptyInputs();
  await resetCase.controller.handle(state(1, 0));
  const phaseInput = resetCase.sent.at(-1)!;
  mergeCoordinatorInput(sticky, {
    moveX: Number(phaseInput.moveX), down: Boolean(phaseInput.down), jump: Boolean(phaseInput.jump),
    punch: Boolean(phaseInput.punch), kick: Boolean(phaseInput.kick), throw: Boolean(phaseInput.throw),
    motion: String(phaseInput.motion ?? ''),
  });
  clearEdges(sticky);
  assert.equal(sticky.motion, 'LR', side);
  await resetCase.controller.handle(state(2, 1, { phase: 'round-over' }));
  await resetCase.controller.handle(state(3, 1));
  const neutralReset = resetCase.sent.at(-1)!;
  assert.equal(neutralReset.motion, 'N', side);
  assert.equal(neutralReset.punch, false, side); assert.equal(neutralReset.kick, false, side);
  mergeCoordinatorInput(sticky, {
    moveX: Number(neutralReset.moveX), down: Boolean(neutralReset.down), jump: Boolean(neutralReset.jump),
    punch: Boolean(neutralReset.punch), kick: Boolean(neutralReset.kick), throw: Boolean(neutralReset.throw),
    motion: String(neutralReset.motion ?? ''),
  });
  clearEdges(sticky);
  assert.equal(sticky.motion, 'N', side);
  await resetCase.controller.handle(state(4, 2, { opp: fighter({ x: 100, facing: -1 }) }));
  const normalInput = resetCase.sent.at(-1)!;
  assert.equal(normalInput.motion, '', side);
  mergeCoordinatorInput(sticky, {
    moveX: Number(normalInput.moveX), down: Boolean(normalInput.down), jump: Boolean(normalInput.jump),
    punch: Boolean(normalInput.punch), kick: Boolean(normalInput.kick), throw: Boolean(normalInput.throw),
    motion: String(normalInput.motion ?? ''),
  });
  const match = side === 'a'
    ? makeMatch(makeFighter('a', 'XENON', 'a'), makeFighter('b', 'GYLE', 'b'))
    : makeMatch(makeFighter('a', 'GYLE', 'a'), makeFighter('b', 'XENON', 'b'));
  match.phase = 'fight';
  const self = side === 'a' ? match.a : match.b;
  const opponent = side === 'a' ? match.b : match.a;
  self.x = 80; opponent.x = 100;
  stepMatch(match, side === 'a' ? sticky : emptyInputs(), side === 'b' ? sticky : emptyInputs());
  assert.notEqual(self.attack, 'phase', side);
  assert.ok(self.attack === 'kick' || self.attack === 'throw', `${side}: expected exact normal edge`);
}
console.log('PASS  legacy both-seat round reset clears coordinator-sticky Phase motion before normal edge');

const legacyManifest = runnerManifest(options('BYU'));
assert.equal(legacyManifest.policyProfile, 'legacy');
assert.equal(legacyManifest.actuatorProfile, 'legacy-delay');
assert.equal(legacyManifest.policyConfigHash, FROZEN_LEGACY_CONDITIONED_CONFIG_HASH);
assert.equal(legacyManifest.policySourceHash, FROZEN_LEGACY_POLICY_SOURCE_HASH);
assert.deepEqual(legacyManifest.executionHorizon, { observationAgeFrames: 0, applicationDelayFrames: 5 });
assert.equal(legacyManifest.targetSeed, 2026081901);
assert.equal(legacyManifest.runnerSourceBaseCommit, 'd71c67325912bc076ef6d6715a6845ca605ceafe');
assert.equal(legacyManifest.targetDeploymentProfile, 'sf6-991-pre-unclose-16');
assert.equal(legacyManifest.targetProfileAttestation, 'exact-authenticated-welcome-roster-required');

const temp = mkdtempSync(join(tmpdir(), 'xenon-universal-runner-'));
const identity = join(temp, 'identity');
const output = join(temp, 'dry.jsonl');
writeFileSync(identity, 'test'); chmodSync(identity, 0o600);
const parsed = parseArgs([
  '--identity', identity, '--handle', 'XENON_TEST', '--target', 'TARGET_BYU',
  '--opponent', 'BYU', '--profile', 'legacy', '--output', output, '--action-delay', '5', '--dry-run',
]);
let network = 0;
await executeRunner(parsed, {
  fetchJson: async () => { network++; return health; },
  mintToken: async () => { network++; return `rk_${'A'.repeat(32)}`; },
  openTransport: () => { network++; throw new Error('dry-run opened transport'); },
});
assert.equal(network, 0);
const ledger = readFileSync(output, 'utf8');
assert.match(ledger, /"policyProfile":"legacy"/);
assert.match(ledger, new RegExp(FROZEN_LEGACY_CONDITIONED_CONFIG_HASH));
assert.match(ledger, new RegExp(FROZEN_LEGACY_POLICY_SOURCE_HASH));
assert.equal(statSync(output).mode & 0o777, 0o600);
assert.throws(() => parseArgs([
  '--identity', identity, '--handle', 'X', '--target', 'Y', '--opponent', 'BYU',
  '--output', join(temp, 'missing-profile'),
]), /--profile is required/);
assert.throws(() => parseArgs([
  '--identity', identity, '--handle', 'X', '--target', 'Y', '--opponent', 'BYU',
  '--profile', 'new-wave', '--output', join(temp, 'wrong-profile'),
]), /--profile must be legacy/);
assert.throws(() => parseArgs([
  '--identity', identity, '--handle', 'X', '--target', 'Y', '--opponent', 'BYU',
  '--profile', 'legacy', '--profile', 'legacy', '--output', join(temp, 'duplicate-profile'),
]), /duplicate option/);
assert.throws(() => parseArgs([
  '--identity', identity, '--handle', 'X', '--target', 'Y', '--opponent', 'UNCLOSE',
  '--profile', 'legacy', '--output', join(temp, 'unclose'),
]), /--opponent must be one of/);
unlinkSync(output); unlinkSync(identity);
console.log('PASS  dry-run records universal hashes with zero network and malformed CLI fails closed');

console.log('\nXENON UNIVERSAL RUNNER TEST: PASS');

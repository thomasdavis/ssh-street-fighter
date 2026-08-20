#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  CHARACTER, EXPECTED_FINGERPRINT, HANDLE, POLICY_FUNCTION_SHA256, POLICY_SEED,
  createOneMatchController, decide,
  deterministicFixture, parseArgs, resetRng,
} from './codex-dgx-omega-quickmatch.mjs';

let pass = true;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) pass = false; };
const throws = (fn, pattern) => { try { fn(); return false; } catch (error) { return pattern.test(String(error)); } };

check('default launch is impossible', throws(() => parseArgs([]), /choose exactly one/));
check('armed mode requires identity and output', throws(() => parseArgs(['--armed']), /requires --identity and --out/));
check('queue window is bounded', throws(() => parseArgs(['--dry-run', '--window-ms', '200000']), /5000 to 120000/));
check('dry-run requires no identity or output', parseArgs(['--dry-run']).dryRun === true);
check('fixed seed remains OMEG', POLICY_SEED === 0x4f4d4547);
check('policy rerun is byte deterministic', JSON.stringify(deterministicFixture()) === JSON.stringify(deterministicFixture()));
resetRng();
check('policy function matches frozen PR #28 sha256',
  createHash('sha256').update(decide.toString()).digest('hex') === POLICY_FUNCTION_SHA256);

const sent = [], rows = [], timers = [];
let finished = null;
const controller = createOneMatchController({ windowMs: 5000 }, {
  send: (message) => sent.push(message), append: (kind, data) => rows.push({ kind, ...data }),
  schedule: (fn) => { timers.push(fn); return timers.length - 1; }, cancel: () => {},
  assertQueueSafe: async () => {},
  fetchOfficial: async (matchId) => ({ match: { id: matchId, end_reason: 'ko' } }),
  finish: (summary) => { finished = summary; },
});
const roster = ['BYU', CHARACTER, 'CODEX'];
await controller.handle({ t: 'welcome', name: HANDLE, fp: EXPECTED_FINGERPRINT, roster });
check('welcome queues exact OMEGA once', sent.length === 1 && sent[0].t === 'queue' && sent[0].char === CHARACTER);
await controller.handle({ t: 'queued', char: CHARACTER });
await controller.handle({ t: 'matchStart', mid: 'fixture', yourCursor: 1, oppCursor: 2, role: 'a', stage: 'dojo', oppName: 'OPP' });
await controller.handle({ t: 'state', frame: 1, ack: 0, phase: 'fight', you: { x: 50, y: 0, facing: 1, attack: 'none' }, opp: { x: 120, y: 0, attack: 'none' } });
check('fight emits exactly one deterministic input', sent.length === 2 && sent[1].t === 'input');
await controller.handle({ t: 'matchEnd', result: { youWon: true } });
check('one match sends leave instead of requeue', sent.length === 3 && sent[2].t === 'leave' && controller.status().stopping);
await controller.handle({ t: 'left' });
check('clean left finalizes one bounded match', finished?.matched === true && finished?.matchId === 'fixture');

const timeoutSent = [];
const timeout = createOneMatchController({ windowMs: 5000 }, {
  send: (message) => timeoutSent.push(message), append: () => {}, schedule: (fn) => { timers.push(fn); return timers.length - 1; },
  cancel: () => {}, assertQueueSafe: async () => {}, fetchOfficial: async () => null, finish: () => {},
});
await timeout.handle({ t: 'welcome', name: HANDLE, fp: EXPECTED_FINGERPRINT, roster });
timers.at(-1)();
check('expired queue window leaves without a match', timeoutSent.at(-1)?.t === 'leave' && !timeout.status().matched);

const unsafeSent = [];
const unsafe = createOneMatchController({ windowMs: 5000 }, {
  send: (message) => unsafeSent.push(message), append: () => {}, schedule: () => 0, cancel: () => {},
  assertQueueSafe: async () => { throw new Error('global queue changed before join: 1'); },
  fetchOfficial: async () => null, finish: () => {},
});
await check('connection-time queue race aborts before queueing',
  await unsafe.handle({ t: 'welcome', name: HANDLE, fp: EXPECTED_FINGERPRINT, roster })
    .then(() => false, (error) => /queue changed/.test(String(error)))
    && unsafeSent.length === 0);

const wrongIdentitySent = [];
const wrongIdentity = createOneMatchController({ windowMs: 5000 }, {
  send: (message) => wrongIdentitySent.push(message), append: () => {}, schedule: () => 0, cancel: () => {},
  assertQueueSafe: async () => {}, fetchOfficial: async () => null, finish: () => {},
});
await check('wrong SSH identity aborts before queueing',
  await wrongIdentity.handle({ t: 'welcome', name: 'CODEX_ROOT', fp: 'wrong', roster })
    .then(() => false, (error) => /identity mismatch/.test(String(error)))
    && wrongIdentitySent.length === 0);

console.log(pass ? '\nOMEGA QUICK MATCH TEST: PASS' : '\nOMEGA QUICK MATCH TEST: FAIL');
process.exit(pass ? 0 : 1);

import { emptyInputs } from './game/types.js';
import { inferDecisionReason, parseLoggerArgs, redactFingerprints } from './tools/codex-live-logger.js';
import type { CombatObservation } from './bot/adaptive-codex-policy.js';

let pass = true;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) pass = false; };

const parsed = parseLoggerArgs(['--dry-run', '--identity', 'key', '--log', 'block.jsonl', '--expected-opponent', 'CODEX_MAC', '--expected-character', 'MNEME', '--source-commit', 'abc', '--matches', '5']);
check('dry run remains disarmed and bounded', parsed.dryRun && !parsed.arm && parsed.matches === 5 && parsed.user === 'CODEX_AGENT');
let rejected = false;
try { parseLoggerArgs(['--arm', '--identity', 'key', '--log', 'x', '--expected-opponent', 'CODEX_MAC', '--expected-character', 'MNEME', '--source-commit', 'abc', '--user', 'SOMEONE']); } catch { rejected = true; }
check('controller rejects identity-handle reassignment', rejected);

const redacted = JSON.stringify(redactFingerprints({ fp: 'secret', match: { a_fp: 'a', b_fp: 'b', name: 'kept' }, rows: [{ fingerprint: 'x', hp: 4 }] }));
check('fingerprints are recursively removed', !redacted.includes('secret') && !redacted.includes('a_fp') && !redacted.includes('fingerprint') && redacted.includes('kept'));

const state = { frame: 9, phase: 'fight', you: { x: 10, y: 0, vx: 0, vy: 0, facing: 1, hp: 100, wins: 0, attack: 'none', attackFrame: 0, stun: 0, crouching: false }, opp: { x: 80, y: 0, vx: 0, vy: 0, facing: -1, hp: 100, wins: 0, attack: 'none', attackFrame: 0, stun: 0, crouching: false }, round: 1, roundTime: 99, projectiles: [] } as CombatObservation;
const input = emptyInputs(); input.moveX = 1;
check('movement reason is deterministic', inferDecisionReason(state, input, new Map(), new Map()) === 'spacing-toward');
check('policy counters take precedence as reasons', inferDecisionReason(state, input, new Map(), new Map([['context', 1]])) === 'context');

console.log(pass ? '\nCODEX LIVE LOGGER TEST: PASS' : '\nCODEX LIVE LOGGER TEST: FAIL');
process.exit(pass ? 0 : 1);

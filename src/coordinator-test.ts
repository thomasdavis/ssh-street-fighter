// Unit-tests the cross-worker match coordinator with fake workers (no cluster
// fork needed). Two players on DIFFERENT workers with the SAME local sid must
// still be paired and simulated correctly.
process.env.SF_DB = '/tmp/coord-test.db';
import { MatchCoordinator, type WorkerRef } from './cluster/coordinator.js';
import { initDb } from './db/db.js';
import type { P2W } from './cluster/messages.js';
import { emptyInputs } from './game/types.js';

initDb();
let pass = true;
const check = (n: string, c: boolean, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

const coord = new MatchCoordinator();
const outA: P2W[] = [], outB: P2W[] = [];
const wA: WorkerRef = { id: 1, send: (m) => outA.push(m) };
const wB: WorkerRef = { id: 2, send: (m) => outB.push(m) };

// Both queue — different workers, SAME sid (5) to prove gids disambiguate.
coord.handle(wA, { t: 'queue', sid: 5, cid: 'a', name: 'ALICE', fp: null, cursor: 0, elo: 1200 });
check('first queue waits (no match yet)', coord.activeMatches === 0 && coord.queued === 1);
coord.handle(wB, { t: 'queue', sid: 5, cid: 'b', name: 'BOB', fp: null, cursor: 3, elo: 1200 });

const startA = outA.find((m) => m.t === 'matchStart') as Extract<P2W, { t: 'matchStart' }> | undefined;
const startB = outB.find((m) => m.t === 'matchStart') as Extract<P2W, { t: 'matchStart' }> | undefined;
check('both players paired across workers', !!startA && !!startB && coord.activeMatches === 1);
check('roles + opponents correct', startA?.role === 'a' && startB?.role === 'b' && startA?.oppName === 'CHONG' && startB?.oppName === 'BYU',
  `A opp=${startA?.oppName} B opp=${startB?.oppName}`);
const mid = startA!.mid;

// Tick through countdown into the fight.
for (let i = 0; i < 100; i++) coord.tick();
// ALICE (worker A, sid 5) holds right; her input must drive side 'a', not 'b'.
const inA = emptyInputs(); inA.moveX = 1;
coord.handle(wA, { t: 'input', mid, sid: 5, input: inA, seq: 1 });
for (let i = 0; i < 40; i++) coord.tick();

const lastState = [...outA].reverse().find((m) => m.t === 'state') as Extract<P2W, { t: 'state' }> | undefined;
check('state is relayed to workers', !!lastState);
check('sim runs + input routes to correct side (ALICE moved right)', !!lastState && lastState.m.a.x > 60,
  `a.x=${lastState?.m.a.x?.toFixed(1)} b.x=${lastState?.m.b.x?.toFixed(1)}`);
check('input did NOT bleed into opponent (BOB stationary-ish)', !!lastState && lastState.m.b.vx === 0,
  `b.vx=${lastState?.m.b.vx}`);

// Forfeit: ALICE disconnects/leaves — BOB should win.
outB.length = 0;
coord.handle(wA, { t: 'leaveMatch', mid, sid: 5 });
const endB = outB.find((m) => m.t === 'matchEnd') as Extract<P2W, { t: 'matchEnd' }> | undefined;
check('opponent leaving ends the match as a win', !!endB && endB.result.youWon === true, `bob end=${JSON.stringify(endB?.result?.youWon)}`);
check('match cleaned up', coord.activeMatches === 0 && coord.queued === 0);

// ---- lounge across workers ----
const lounge = (m: P2W | undefined) => m as Extract<P2W, { t: 'lounge' }> | undefined;
const chal = (m: P2W | undefined) => m as Extract<P2W, { t: 'challengeState' }> | undefined;
outA.length = 0; outB.length = 0;
coord.handle(wA, { t: 'loungeJoin', sid: 10, cid: 'la', name: 'LOUA', fp: null, cursor: 0, elo: 1200 });
coord.handle(wB, { t: 'loungeJoin', sid: 10, cid: 'lb', name: 'LOUB', fp: null, cursor: 1, elo: 1200 });
const rA = lounge([...outA].reverse().find((m) => m.t === 'lounge'));
const rB = lounge([...outB].reverse().find((m) => m.t === 'lounge'));
check('lounge presence is global across workers',
  !!rA?.roster.some((r) => r.name === 'LOUB') && !!rB?.roster.some((r) => r.name === 'LOUA') && coord.loungeSize === 2);

outB.length = 0;
coord.handle(wA, { t: 'chat', sid: 10, text: 'hey there' });
check('chat broadcasts to other workers', !!lounge([...outB].reverse().find((m) => m.t === 'lounge'))?.chat.some((c) => c.message === 'hey there'));

outA.length = 0; outB.length = 0;
coord.handle(wA, { t: 'challenge', sid: 10, targetId: 'lb' });
check('challenge crosses workers', chal(outB.find((m) => m.t === 'challengeState'))?.incoming?.name === 'LOUA');

outA.length = 0; outB.length = 0;
coord.handle(wB, { t: 'respondChallenge', sid: 10, accept: true });
check('accepting a cross-worker challenge starts a match',
  !!outA.find((m) => m.t === 'matchStart') && !!outB.find((m) => m.t === 'matchStart') && coord.loungeSize === 0);

console.log(pass ? '\nCOORDINATOR TEST: PASS' : '\nCOORDINATOR TEST: FAIL');
process.exit(pass ? 0 : 1);

// Unit-tests the cross-worker match coordinator with fake workers (no cluster
// fork needed). Two players on DIFFERENT workers with the SAME local sid must
// still be paired and simulated correctly.
process.env.SF_DB = '/tmp/coord-test.db';
import { unlinkSync } from 'fs';
import type { WorkerRef } from './cluster/coordinator.js';
import type { P2W } from './cluster/messages.js';
import { emptyInputs } from './game/types.js';

for (const suffix of ['', '-wal', '-shm']) {
  try { unlinkSync(`${process.env.SF_DB}${suffix}`); } catch { /* absent is fine */ }
}
const { MatchCoordinator } = await import('./cluster/coordinator.js');
const db = await import('./db/db.js');
db.initDb();
let pass = true;
const check = (n: string, c: boolean, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

const coord = new MatchCoordinator();
const outA: P2W[] = [], outB: P2W[] = [];
const wA: WorkerRef = { id: 1, send: (m) => outA.push(m) };
const wB: WorkerRef = { id: 2, send: (m) => outB.push(m) };

// Both queue — different workers, SAME sid (5) to prove gids disambiguate.
coord.handle(wA, { t: 'queue', sid: 5, cid: 'a', name: 'ALICE', fp: null, cursor: 0, elo: 1200, region: 'NA' });
check('first queue waits (no match yet)', coord.activeMatches === 0 && coord.queued === 1);
coord.handle(wB, { t: 'queue', sid: 5, cid: 'b', name: 'BOB', fp: null, cursor: 3, elo: 1200, region: 'NA' });

const startA = outA.find((m) => m.t === 'matchStart') as Extract<P2W, { t: 'matchStart' }> | undefined;
const startB = outB.find((m) => m.t === 'matchStart') as Extract<P2W, { t: 'matchStart' }> | undefined;
check('both players paired across workers', !!startA && !!startB && coord.activeMatches === 1);
check('roles + opponent handles correct', startA?.role === 'a' && startB?.role === 'b' && startA?.oppName === 'BOB' && startB?.oppName === 'ALICE',
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

// ---- regression: a duplicate queue (e.g. a double-dispatched W2P message) must
// NOT pair a player with themselves. ----
{
  const c2 = new MatchCoordinator();
  const out: P2W[] = [];
  const w: WorkerRef = { id: 9, send: (m) => out.push(m) };
  const q = { t: 'queue', sid: 1, cid: 'x', name: 'SOLO', fp: null, cursor: 2, elo: 1200, region: 'XX' } as const;
  c2.handle(w, q); c2.handle(w, q);   // same player queues twice
  check('duplicate queue does NOT self-pair',
    c2.activeMatches === 0 && c2.queued === 1 && !out.some((m) => m.t === 'matchStart'),
    `matches=${c2.activeMatches} queued=${c2.queued} starts=${out.filter((m) => m.t === 'matchStart').length}`);
}

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

// ---- regression: matchEnd can synchronously expose a disconnect back to the
// coordinator. The completed match must already be detached, so that disconnect
// cannot turn the KO into a forfeit, write a second result, or apply Elo twice. ----
{
  const fpA = 'SHA256:finish-a'; const fpB = 'SHA256:finish-b';
  db.touchOrCreate(fpA); db.setUsername(fpA, 'FINISHA');
  db.touchOrCreate(fpB); db.setUsername(fpB, 'FINISHB');

  const c3 = new MatchCoordinator();
  const endA: P2W[] = [], endB2: P2W[] = [];
  let detachedBeforeCompletion = false;
  const w3A: WorkerRef = { id: 11, send: (m) => {
    endA.push(m);
    if (m.t === 'matchEnd') {
      detachedBeforeCompletion = c3.activeMatches === 0;
      c3.handleExit(11); // the exact finish -> immediate disconnect race
    }
  } };
  const w3B: WorkerRef = { id: 12, send: (m) => endB2.push(m) };
  c3.handle(w3A, { t: 'queue', sid: 1, cid: 'fa', name: 'FINISHA', fp: fpA, cursor: 10, elo: 1200, region: 'NA' });
  c3.handle(w3B, { t: 'queue', sid: 1, cid: 'fb', name: 'FINISHB', fp: fpB, cursor: 11, elo: 1200, region: 'NA' });
  const start = endA.find((m) => m.t === 'matchStart') as Extract<P2W, { t: 'matchStart' }>;
  const finishing = (c3 as unknown as { matches: Map<string, { match: {
    a: { hp: number; wins: number }; b: { hp: number; wins: number };
    phase: string; phaseTimer: number;
  } }> }).matches.get(start.mid)!;

  for (let i = 0; i < 35; i++) c3.tick(); // make the replay authoritative (>1s)
  finishing.match.a.wins = 2; finishing.match.a.hp = 73;
  finishing.match.b.wins = 0; finishing.match.b.hp = 0;
  finishing.match.phase = 'match-over'; finishing.match.phaseTimer = 0;
  c3.tick();

  // Further stale completion/disconnect signals remain harmless.
  c3.handle(w3A, { t: 'leaveMatch', mid: start.mid, sid: 1 });
  c3.handleExit(12);

  const sql = db.getDb();
  const history = sql.prepare("SELECT * FROM match_history WHERE winner = 'FINISHA' AND loser = 'FINISHB'").all();
  const pa = db.getByFingerprint(fpA)!; const pb = db.getByFingerprint(fpB)!;
  const rich = sql.prepare('SELECT * FROM matches WHERE id = ?').get(start.mid) as {
    winner: string; a_rounds: number; b_rounds: number; end_reason: string;
    a_elo_before: number; a_elo_after: number; b_elo_before: number; b_elo_after: number;
  } | undefined;
  const koRows = (sql.prepare("SELECT COUNT(*) n FROM match_events WHERE match_id = ? AND type = 'ko'").get(start.mid) as { n: number }).n;
  const aEnds = endA.filter((m) => m.t === 'matchEnd');
  const bEnds = endB2.filter((m) => m.t === 'matchEnd');

  check('completed match detached before matchEnd is observable', detachedBeforeCompletion);
  check('finish -> immediate disconnect writes one result', history.length === 1 && aEnds.length === 1 && bEnds.length === 1,
    `history=${history.length} aEnds=${aEnds.length} bEnds=${bEnds.length}`);
  check('one authoritative KO row survives the race', !!rich && rich.winner === 'a' && rich.a_rounds === 2 && rich.b_rounds === 0 && rich.end_reason === 'ko' && koRows === 1,
    `rich=${JSON.stringify(rich)} koRows=${koRows}`);
  check('Elo and player records advance exactly once', pa.matches === 1 && pa.wins === 1 && pa.elo === 1216 && pb.matches === 1 && pb.losses === 1 && pb.elo === 1184
    && rich?.a_elo_before === 1200 && rich.a_elo_after === 1216 && rich.b_elo_before === 1200 && rich.b_elo_after === 1184,
  `A=${pa.matches}/${pa.elo} B=${pb.matches}/${pb.elo}`);
}

console.log(pass ? '\nCOORDINATOR TEST: PASS' : '\nCOORDINATOR TEST: FAIL');
process.exit(pass ? 0 : 1);

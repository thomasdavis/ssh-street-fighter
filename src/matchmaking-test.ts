import {
  FALLBACK_MS,
  RECENT_OPPONENT_TTL_MS,
  REMATCH_FALLBACK_MS,
  RecentOpponentHistory,
  agedPair,
  bestWaiter,
  compatibleWaiters,
  type OpponentPool,
  type Waiter,
} from './net/matchmaking.js';

const waiter = (isBot: boolean, opponentPool: OpponentPool, region = 'XX', queuedAt = 0): Waiter =>
  ({ isBot, opponentPool, region, queuedAt });

let pass = true;
const check = (name: string, condition: boolean): void => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) pass = false;
};

const humanForBots = waiter(false, 'bots', 'NA', 1);
const humanForHumans = waiter(false, 'humans', 'NA', 2);
const botForAll = waiter(true, 'all', 'XX', 3);

check('default human bot pool accepts a bot', compatibleWaiters(humanForBots, botForAll));
check('bot-seeking human cannot be pulled into a human match', !compatibleWaiters(humanForBots, humanForHumans));
check('human-only players can pair together', compatibleWaiters(humanForHumans, waiter(false, 'humans', 'NA', 4)));
check('bots can opt into bot-only sparring', compatibleWaiters(waiter(true, 'bots'), waiter(true, 'all')));

const mixed = [humanForHumans, botForAll];
check('best waiter skips an older incompatible account type', bestWaiter(mixed, humanForBots) === 1);
check('same-region compatible player wins over unknown region', bestWaiter([
  waiter(true, 'all', 'XX', 1), waiter(true, 'all', 'NA', 2),
], humanForBots) === 1);

const old = Date.now() - FALLBACK_MS - 1;
check('aged fallback never violates opponent choice', agedPair([
  waiter(false, 'bots', 'EU', old), waiter(false, 'humans', 'AS', old + 1),
], Date.now()) === null);
const aged = agedPair([
  waiter(false, 'bots', 'EU', old), waiter(false, 'humans', 'AS', old + 1), waiter(true, 'all', 'NA', old + 2),
], Date.now());
check('aged fallback finds the oldest mutually compatible pair', !!aged && aged.includes(0) && aged.includes(2));

const now = 100_000;
const recentA: Waiter = { ...waiter(true, 'all', 'XX', now), matchKey: 'a', recentOpponentKeys: ['b'] };
const recentB: Waiter = { ...waiter(true, 'all', 'XX', now), matchKey: 'b', recentOpponentKeys: ['a'] };
const freshC: Waiter = { ...waiter(true, 'all', 'XX', now), matchKey: 'c', recentOpponentKeys: [] };
check('an immediate rematch waits instead of synchronizing a permanent pair', bestWaiter([recentA], recentB, now) === -1);
check('a fresh opponent wins over an older compatible recent opponent', bestWaiter([recentB, freshC], recentA, now) === 1);
check('a rematch is allowed after the no-alternative escape hatch', bestWaiter([
  { ...recentA, queuedAt: now - REMATCH_FALLBACK_MS - 1 },
], recentB, now) === 0);

const recentOld = now - FALLBACK_MS - 1;
check('ordinary cross-region fallback does not defeat rematch avoidance', agedPair([
  { ...recentA, queuedAt: recentOld }, { ...recentB, queuedAt: recentOld + 1 },
], now) === null);
const rematchOld = now - REMATCH_FALLBACK_MS - 1;
const rematchPair = agedPair([
  { ...recentA, queuedAt: rematchOld }, { ...recentB, queuedAt: rematchOld + 1 },
], now);
check('aged fallback eventually permits the only compatible rematch', !!rematchPair && rematchPair.includes(0) && rematchPair.includes(1));

const history = new RecentOpponentHistory();
history.remember('a', 'b', 1);
history.remember('a', 'c', 2);
history.remember('a', 'd', 3);
history.remember('a', 'e', 4);
check('history retains only the three most recent unique opponents', history.recent('a', 4).join(',') === 'e,d,c');
check('opponent history expires after two minutes', history.recent('a', RECENT_OPPONENT_TTL_MS + 5).length === 0);

console.log(pass ? '\nMATCHMAKING TEST: PASS' : '\nMATCHMAKING TEST: FAIL');
process.exit(pass ? 0 : 1);

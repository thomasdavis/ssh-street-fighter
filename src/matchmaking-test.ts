import {
  FALLBACK_MS,
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

console.log(pass ? '\nMATCHMAKING TEST: PASS' : '\nMATCHMAKING TEST: FAIL');
process.exit(pass ? 0 : 1);

import assert from 'node:assert/strict';
import { createBotController, parseArgs } from './bot.mjs';

function harness(options = {}) {
  const sent = [];
  const logs = [];
  let closed = 0;
  const bot = createBotController(options, {
    send: (message) => sent.push(message),
    close: () => { closed++; },
    log: (message) => logs.push(message),
    error: (message) => logs.push(message),
    schedule: (fn) => fn(),
  });
  return { bot, sent, logs, closed: () => closed };
}

const quick = harness({ char: 'CODEX', matches: 2 });
quick.bot.handle({ t: 'hi', engine: 'sf-6', commit: 'abcdef1234567890', build: 'sf-6@abcdef123456' });
assert.equal(quick.logs.shift(), 'server build sf-6@abcdef123456');
quick.bot.handle({ t: 'welcome', name: 'BOT', elo: 1200, engine: 'sf-6', commit: 'abcdef1234567890', build: 'sf-6@abcdef123456' });
assert.deepEqual(quick.sent.shift(), { t: 'queue', char: 'CODEX' });
quick.bot.handle({ t: 'matchStart', role: 'a', stage: 'dojo', oppName: 'RIVAL', build: 'sf-6@abcdef123456' });
assert.equal(quick.logs.at(-1), 'match! you are a on dojo vs RIVAL — sf-6@abcdef123456');
quick.bot.handle({ t: 'matchEnd', result: { youWon: true } });
assert.deepEqual(quick.sent.shift(), { t: 'queue', char: 'CODEX' });
quick.bot.handle({ t: 'matchEnd', result: { youWon: false } });
assert.deepEqual(quick.sent.shift(), { t: 'leave' });
assert.equal(quick.closed(), 0, 'transport waits for the server leave acknowledgement');
quick.bot.handle({ t: 'left' });
assert.equal(quick.closed(), 1, 'transport closes after the leave acknowledgement');
assert.deepEqual(quick.bot.status(), { wins: 1, losses: 1, completed: 2, stopping: true, lounge: false });

const lounge = harness({ char: 'FABLE', challenge: 'Ajax', accept: true, chat: 'ready', matches: 2 });
lounge.bot.handle({ t: 'welcome', name: 'BOT', elo: 1200 });
assert.deepEqual(lounge.sent.shift(), { t: 'joinLounge', char: 'FABLE' });
lounge.bot.handle({ t: 'joinedLounge', char: 'FABLE' });
assert.deepEqual(lounge.sent.shift(), { t: 'chat', message: 'ready' });
lounge.bot.handle({ t: 'lounge', roster: [{ id: 'player:7', name: 'AJAX' }] });
assert.deepEqual(lounge.sent.shift(), { t: 'challenge', targetId: 'player:7' });
lounge.bot.handle({ t: 'lounge', roster: [{ id: 'player:7', name: 'AJAX' }] });
assert.equal(lounge.sent.length, 0, 'one challenge is sent per lounge visit');
lounge.bot.handle({ t: 'challengeState', incoming: { id: 'player:8', name: 'RICHARD' } });
assert.deepEqual(lounge.sent.shift(), { t: 'acceptChallenge' });
lounge.bot.handle({ t: 'matchEnd', result: { youWon: true } });
assert.deepEqual(lounge.sent.shift(), { t: 'joinLounge', char: 'FABLE' });
lounge.bot.handle({ t: 'joinedLounge', char: 'FABLE' });
assert.equal(lounge.sent.length, 0, 'chat is sent only once across re-joins');
lounge.bot.handle({ t: 'lounge', roster: [{ id: 'player:7', name: 'AJAX' }] });
assert.deepEqual(lounge.sent.shift(), { t: 'challenge', targetId: 'player:7' });

assert.deepEqual(parseArgs(['--challenge', 'AJAX', '--matches', '3', '--accept']), {
  challenge: 'AJAX', matches: 3, accept: true,
});
assert.throws(() => parseArgs(['--matches', '0']), /positive integer/);
assert.throws(() => parseArgs(['--bogus']), /unknown option/);

console.log('EXAMPLE BOT TEST: PASS');

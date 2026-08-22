import {
  TV_LIVE_MISSING_GRACE_MS,
  tvCanAdvance,
  tvLiveMissingLongEnough,
  type TvAdvanceReason,
} from './tv-director.js';

let pass = true;
const check = (name: string, condition: boolean) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) pass = false;
};

const nonTerminalReasons: TvAdvanceReason[] = ['initial', 'live-arrived', 'replay-complete', 'retry'];
check('a live bout cannot be preempted by another program', nonTerminalReasons.every((reason) => !tvCanAdvance('live', reason, 'current', null)));
check('the current live ending releases the channel', tvCanAdvance('live', 'live-ended', 'current', 'current'));
check('an unbound live ending cannot release the channel', !tvCanAdvance('live', 'live-ended'));
check('a stale ending from another match cannot release the channel', !tvCanAdvance('live', 'live-ended', 'current', 'previous'));
check('a replay may yield when live action arrives', tvCanAdvance('replay', 'live-arrived'));
check('a completed replay may rotate to the next program', tvCanAdvance('replay', 'replay-complete'));
check('one missing response is tolerated', !tvLiveMissingLongEnough(1_000, 1_000 + TV_LIVE_MISSING_GRACE_MS - 1));
check('a continuously missing match eventually releases', tvLiveMissingLongEnough(1_000, 1_000 + TV_LIVE_MISSING_GRACE_MS));
check('a healthy match has no missing deadline', !tvLiveMissingLongEnough(null, Number.MAX_SAFE_INTEGER));

if (!pass) process.exit(1);
console.log('TV DIRECTOR TEST: PASS');

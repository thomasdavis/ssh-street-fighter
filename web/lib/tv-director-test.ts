import { tvCanAdvance, type TvAdvanceReason } from './tv-director.js';

let pass = true;
const check = (name: string, condition: boolean) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) pass = false;
};

const nonTerminalReasons: TvAdvanceReason[] = ['initial', 'live-arrived', 'replay-complete', 'retry'];
check('a live bout cannot be preempted by another program', nonTerminalReasons.every((reason) => !tvCanAdvance('live', reason)));
check('an authoritative live ending releases the channel', tvCanAdvance('live', 'live-ended'));
check('a replay may yield when live action arrives', tvCanAdvance('replay', 'live-arrived'));
check('a completed replay may rotate to the next program', tvCanAdvance('replay', 'replay-complete'));

if (!pass) process.exit(1);
console.log('TV DIRECTOR TEST: PASS');

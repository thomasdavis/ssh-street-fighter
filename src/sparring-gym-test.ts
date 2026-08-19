import { makeFighter } from './game/engine.js';
import { gymFighterView, runGym } from './tools/omega-gym.js';

let pass = true;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) pass = false;
};

const options = {
  fighter: 'CODEX',
  opponents: ['FABLE'],
  styleNames: ['rushdown', 'turtle'],
  matches: 2,
  seed: 73,
};
const first = await runGym(options);
const second = await runGym(options);

check('same seed produces the same complete result', JSON.stringify(first) === JSON.stringify(second));
check('requested fighter, opponents, and bounded block are preserved',
  first.fighter === 'CODEX' && first.opponents.join(',') === 'FABLE' && first.total.played === 4,
  `${first.fighter} vs ${first.opponents.join(',')} played=${first.total.played}`);
check('style rows contain bounded match and round summaries',
  first.styles.length === 2 && first.styles.every((row) => row.played === 2 && row.wins + row.losses + row.draws === row.played
    && row.roundsWon >= 0 && row.roundsLost >= 0));

let rejected = false;
try { await runGym({ fighter: 'NOT_A_FIGHTER', matches: 1 }); } catch { rejected = true; }
check('invalid fighters fail fast', rejected);

for (const [character, attack] of [['MNEME', 'construct'], ['AJAX', 'boomerang'], ['XENON', 'phase']] as const) {
  const fighter = makeFighter('a', character, 'a');
  fighter.attack = attack;
  const observed = gymFighterView(fighter);
  check(`${character} canonical special is labeled in agent observations`, observed.special === true,
    `attack=${observed.attack} special=${observed.special}`);
}

console.log(pass ? '\nSPARRING GYM TEST: PASS' : '\nSPARRING GYM TEST: FAIL');
process.exit(pass ? 0 : 1);

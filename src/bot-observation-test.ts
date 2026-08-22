import { botStateFor } from './api/bot-server.js';
import { BOMBARDMENT, makeFighter, makeMatch, specialMoveStats, stepMatch } from './game/engine.js';
import { specialMovesFor } from './game/moves.js';
import { ROSTER } from './game/roster.js';
import { emptyInputs, type Inputs, type Match } from './game/types.js';

let pass = true;
const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!condition) pass = false;
};
const neutral = (): Inputs => emptyInputs();
const move = (motion: string, button: 'punch' | 'kick'): Inputs => ({ ...emptyInputs(), motion, [button]: true });
function setup(a: string, b = 'BYU'): Match {
  const match = makeMatch(makeFighter('a', a, 'a'), makeFighter('b', b, 'b'));
  for (let i = 0; i < 95; i++) stepMatch(match, neutral(), neutral());
  match.a.x = 70; match.a.facing = 1; match.b.x = 180; match.b.facing = -1;
  return match;
}

const rosterMoves = ROSTER.flatMap((character) => specialMovesFor(character.name));
const statsComplete = rosterMoves.every((moveDefinition) => {
  const stats = specialMoveStats(moveDefinition.attack);
  return stats.startup >= 0 && stats.active > 0 && stats.recovery >= 0 && !!stats.impact;
});
check('every roster special has explicit public timing and behavior', statsComplete,
  `moves=${rosterMoves.length}`);
check('new mechanics no longer inherit Entropy Well metadata',
  specialMoveStats('construct').impact.includes('turret')
  && specialMoveStats('boomerang').impact.includes('Returning')
  && specialMoveStats('reflect').impact.includes('reflection'));

{
  const match = setup('MNEME');
  stepMatch(match, move('DL', 'punch'), neutral());
  const startup = botStateFor('a', match, 4);
  check('fighter observation identifies character and startup phase', startup.you.character === 'MNEME'
    && startup.you.movePhase === 'startup' && startup.you.casting === true && startup.ack === 4);

  for (let i = 0; i < 20 && !match.projectiles.some((projectile) => projectile.style === 'construct'); i++)
    stepMatch(match, neutral(), neutral());
  const turretState = botStateFor('a', match, 4);
  const turret = turretState.projectiles.find((projectile: Record<string, any>) => projectile.style === 'construct');
  check('turret wire state is explicit and persistent', !!turret && turret.id > 0
    && turret.sourceAttack === 'construct' && turret.state === 'turret' && turret.dangerous === false
    && turret.canHit === false && turret.reflectable === false
    && turret.vx === 0 && turret.vy === 0 && turret.ttl > 0 && turret.nextFireIn > 0);

  for (let i = 0; i < 25 && !match.projectiles.some((projectile) => projectile.parentId); i++)
    stepMatch(match, neutral(), neutral());
  const moteState = botStateFor('a', match, 4);
  const mote = moteState.projectiles.find((projectile: Record<string, any>) => projectile.parentId === turret?.id);
  check('turret child is attributable to its stable parent id', !!mote && mote.id !== turret.id
    && mote.sourceAttack === 'construct' && mote.state === 'traveling' && mote.dangerous === true && mote.canHit === true);
}

{
  const match = setup('MEGAWATTS');
  stepMatch(match, move('DU', 'punch'), neutral());
  for (let i = 0; i < 20 && !match.projectiles.some((projectile) => projectile.style === 'knowledge'); i++)
    stepMatch(match, neutral(), neutral());
  const before = match.projectiles.find((projectile) => projectile.style === 'knowledge');
  const y = before?.y ?? 0;
  stepMatch(match, neutral(), neutral());
  const wire = botStateFor('a', match, 9);
  const bomb = wire.projectiles.find((projectile: Record<string, any>) => projectile.style === 'knowledge');
  check('diagonal projectile exposes vertical velocity and source', !!bomb
    && bomb.sourceAttack === 'bombardment' && bomb.vy === -BOMBARDMENT.dropPerFrame
    && Math.abs(bomb.y - (y - BOMBARDMENT.dropPerFrame)) < 0.01 && bomb.reflectable === true);
}

console.log(pass ? '\nBOT OBSERVATION TEST: PASS' : '\nBOT OBSERVATION TEST: FAIL');
process.exit(pass ? 0 : 1);

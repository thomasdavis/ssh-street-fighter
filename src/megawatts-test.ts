// Focused contract tests for MEGAWATTS' XENON matchup. The asymmetry comes from
// ordinary projectile timing and shared moves, never an opponent-name branch.
import { BOMBARDMENT, HAD, REFLECT, makeFighter, makeMatch, specialMoveStats, stepMatch } from './game/engine.js';
import { emptyInputs, type Inputs, type Match } from './game/types.js';

let pass = true;
const check = (name: string, cond: boolean, detail = ''): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!cond) pass = false;
};
const neutral = (): Inputs => emptyInputs();
const move = (motion: string, button: 'punch' | 'kick'): Inputs => ({ ...emptyInputs(), motion, [button]: true });
function setup(a = 'MEGAWATTS', b = 'XENON'): Match {
  const match = makeMatch(makeFighter('a', a, 'a'), makeFighter('b', b, 'b'));
  for (let i = 0; i < 95; i++) stepMatch(match, neutral(), neutral());
  return match;
}

// Citation Bolt intentionally reuses the standard fireball primitive. XENON
// can reverse it with the standard Reflect path.
{
  const match = setup();
  match.a.x = 80; match.a.facing = 1; match.b.x = 130; match.b.facing = -1;
  stepMatch(match, move('DR', 'punch'), move('DU', 'punch'));
  let reflected = false; let reflectedVx = 0;
  for (let i = 0; i < HAD.total; i++) {
    stepMatch(match, neutral(), neutral());
    const citation = match.projectiles.find((projectile) => projectile.style === 'citation');
    if (citation?.owner === 'b' && citation.vx < 0) { reflected = true; reflectedVx = citation.vx; }
  }
  check('Citation Bolt uses the reflectable projectile path', reflected, `reflectedVx=${reflectedVx.toFixed(1)}`);
}

// Bombardment adds only a fixed diagonal: two ordinary projectiles move by
// constant x/y deltas and carry no gravity, landing, arming, or pulse state.
{
  const match = setup();
  match.a.x = 30; match.a.facing = 1; match.b.x = 220; match.b.facing = -1;
  stepMatch(match, move('DU', 'punch'), neutral());
  let first: Match['projectiles'][number] | undefined;
  let firstSpawn = -1; let secondSpawn = -1; let diagonal = false; let minimalState = false;
  for (let i = 1; i <= BOMBARDMENT.total; i++) {
    const before = first ? { x: first.x, y: first.y } : null;
    stepMatch(match, neutral(), neutral());
    const cores = match.projectiles.filter((projectile) => projectile.style === 'knowledge');
    if (!first && cores[0]) { first = cores[0]; firstSpawn = i; }
    if (secondSpawn < 0 && cores.length === 2) secondSpawn = i;
    if (before && first && first.active) {
      diagonal ||= Math.abs((first.x - before.x) - BOMBARDMENT.projectileVx) < 1e-9
        && Math.abs((before.y - first.y) - BOMBARDMENT.dropPerFrame) < 1e-9;
    }
    if (cores[0]) minimalState = !Object.hasOwn(cores[0], 'vy') && !Object.hasOwn(cores[0], 'grounded') && !Object.hasOwn(cores[0], 'pulses');
  }
  check('Bombs of Knowledge releases two cores', firstSpawn >= 0 && secondSpawn > firstSpawn, `spawn=${firstSpawn},${secondSpawn}`);
  check('knowledge cores follow a fixed diagonal', diagonal);
  check('bombardment introduces no projectile physics state', minimalState);
  check('the two releases exceed one Reflect active window', secondSpawn - firstSpawn > REFLECT.active,
    `spacing=${secondSpawn - firstSpawn} reflectActive=${REFLECT.active}`);
}

// Each core is still an ordinary reflectable/phaseable projectile. The stagger,
// rather than an immunity flag, is what makes XENON answer twice.
{
  const match = setup();
  match.a.x = 80; match.b.x = 120; match.b.facing = -1;
  match.b.attack = 'reflect'; match.b.attackFrame = REFLECT.startup + 1; match.b.phaseT = 8;
  match.projectiles.push({ owner: 'a', x: match.b.x - 2, y: 30, vx: 2.1, active: true, hit: false, frame: 0, facing: 1, style: 'knowledge' });
  stepMatch(match, neutral(), neutral());
  const reflected = match.projectiles.find((projectile) => projectile.style === 'knowledge');
  check('a knowledge core can be reflected', !!reflected && reflected.owner === 'b' && reflected.vx < 0);
}
{
  const match = setup();
  match.a.x = 80; match.b.x = 120;
  match.b.phaseT = 2;
  match.projectiles.push({ owner: 'a', x: match.b.x - 2, y: 30, vx: 2.1, active: true, hit: false, frame: 0, facing: 1, style: 'knowledge' });
  const hp = match.b.hp;
  stepMatch(match, neutral(), neutral());
  check('Phase passes through a knowledge core', match.b.hp === hp && match.projectiles.some((projectile) => projectile.style === 'knowledge'));
}

// Ground Truth intentionally inherits the established electric field: strong
// close coverage and repeated timing, without MEGAWATTS-specific protection.
{
  const match = setup();
  match.a.x = 100; match.a.facing = 1; match.b.x = 125; match.b.facing = -1;
  stepMatch(match, move('DU', 'kick'), neutral());
  const beganAsElectric = match.a.attack === 'electric';
  const before = match.b.hp;
  const stats = specialMoveStats('electric');
  for (let i = 0; i < stats.startup + stats.active; i++) stepMatch(match, neutral(), neutral());
  check('Ground Truth reuses the electric field primitive', beganAsElectric && match.b.hp < before, `damage=${before - match.b.hp}`);
  check('Ground Truth grants no phase or armor', match.a.phaseT === 0 && match.a.armorT === 0,
    `phaseT=${match.a.phaseT} armorT=${match.a.armorT}`);
}

console.log(pass ? '\nMEGAWATTS TEST: PASS' : '\nMEGAWATTS TEST: FAIL');
process.exit(pass ? 0 : 1);

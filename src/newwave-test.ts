// Behavioural checks for the new-wave mechanics: XENON phase i-frames + cross-up,
// AJAX super-armor and returning boomerang, MNEME construct turret + motes,
// UNCLOSE token stream + free-tier channel, the universal flying kick.
// Drives the real engine with crafted inputs.
import { makeFighter, makeMatch, stepMatch, BOOMERANG, CONSTRUCT, REFLECT, STREAM, FREETIER } from './game/engine.js';
import { emptyInputs, type Inputs, type Match } from './game/types.js';

let pass = true;
const check = (name: string, cond: boolean, detail = ''): void => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!cond) pass = false;
};
const NEUT = (): Inputs => emptyInputs();
function setup(aChar: string, bChar: string): Match {
  const m = makeMatch(makeFighter('a', aChar, 'a'), makeFighter('b', bChar, 'b'));
  for (let i = 0; i < 95; i++) stepMatch(m, NEUT(), NEUT());   // run out the countdown → 'fight'
  return m;
}
// motion codes for side a facing right: DF=DR, DB=DL, BF=LR, DU=DU
const mv = (motion: string, btn: 'punch' | 'kick'): Inputs => ({ ...emptyInputs(), motion, [btn]: true });

// --- XENON PHASE STEP ---------------------------------------------------------
{
  const m = setup('XENON', 'MEN');
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'LR' : 'RL', 'kick'), NEUT());
  check('XENON phase step starts', m.a.attack === 'phase' && m.a.phaseT > 0, `phaseT=${m.a.phaseT}`);
}
{
  // a fighter with phaseT set takes no damage from an adjacent active punch
  const m = setup('XENON', 'MEN');
  m.a.x = 100; m.b.x = 112; m.a.phaseT = 30;
  const before = m.a.hp;
  for (let i = 0; i < 8; i++) stepMatch(m, NEUT(), { ...emptyInputs(), punch: true });
  check('phase intangibility blocks all damage', m.a.hp === before, `hp=${m.a.hp}`);
}

// --- AJAX CONTRADICTION (super-armor) ----------------------------------------
{
  const m = setup('AJAX', 'MEN');
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'LR' : 'RL', 'punch'), NEUT());
  check('AJAX armored strike starts', m.a.attack === 'armor' && m.a.armorT > 0, `armorT=${m.a.armorT}`);
  m.a.x = 100; m.b.x = 112;
  const before = m.a.hp;
  let flinched = false, dropped = false;
  for (let i = 0; i < 5; i++) {
    stepMatch(m, NEUT(), { ...emptyInputs(), punch: true });
    if (m.a.stun > 0) flinched = true;
    if (m.a.attack !== 'armor') dropped = true;
  }
  check('super-armor: took damage but never flinched or lost the move', m.a.hp < before && !flinched && !dropped, `hp=${m.a.hp} flinch=${flinched} dropped=${dropped}`);
}

// --- AJAX BOOMERANG (flies out to a real reach, hits, returns, is caught) -----
{
  const m = setup('AJAX', 'MEN');
  m.a.x = 80; m.a.facing = 1; m.b.x = 170; m.b.facing = -1;   // opponent ~90 away, inside the flight path
  const bHp0 = m.b.hp;
  stepMatch(m, mv('DR', 'kick'), NEUT());                     // boomerang = D,F + kick
  let maxOut = 0, returned = false, caught = false, existed = false;
  for (let i = 0; i < 90; i++) {
    stepMatch(m, NEUT(), NEUT());
    const b = m.projectiles.find((p) => p.style === 'boomerang');
    if (b) { existed = true; maxOut = Math.max(maxOut, Math.abs(b.x - m.a.x)); if (b.returning) returned = true; }
    else if (existed && returned) caught = true;              // gone after the return leg = caught in hand
  }
  check('boomerang is thrown', existed);
  check('boomerang flies a real distance out', maxOut >= 90, `maxOut=${maxOut.toFixed(0)}`);
  check('boomerang hits a distant opponent', m.b.hp < bHp0, `bHp ${bHp0}->${m.b.hp}`);
  check('boomerang reverses and is caught', returned && caught);
}

// --- MNEME MEMORY SENTINEL (construct + motes) -------------------------------
{
  const m = setup('MNEME', 'MEN');
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'DL' : 'DR', 'punch'), NEUT());
  for (let i = 0; i < CONSTRUCT.spawn + 2; i++) stepMatch(m, NEUT(), NEUT());
  check('sentinel construct is planted', m.projectiles.some((p) => p.style === 'construct'));
  let sawMote = false;
  for (let i = 0; i < 40; i++) { stepMatch(m, NEUT(), NEUT()); if (m.projectiles.some((p) => p.style === 'mote')) sawMote = true; }
  check('sentinel fires motes on its own', sawMote);
}

// --- XENON REFLECT (turn a projectile back) ----------------------------------
{
  const m = setup('XENON', 'BYU');
  m.a.x = 100; m.a.facing = 1;
  m.a.attack = 'reflect'; m.a.attackFrame = REFLECT.startup + 2; m.a.phaseT = 10;   // mid-parry
  m.projectiles.push({ id: m.nextProjectileId++, owner: 'b', x: 108, y: 30, vx: -4, vy: 0, active: true, hit: false, frame: 0, facing: -1, style: 'blue', sourceAttack: 'hadouken' });
  stepMatch(m, mv('DU', 'punch'), NEUT());
  const p = m.projectiles.find((q) => q.style === 'blue');
  check('reflect turns a projectile back at its sender', !!p && p.owner === 'a' && p.vx > 0, p ? `owner=${p.owner} vx=${p.vx.toFixed(1)}` : 'gone');
}

// --- XENON BLINK (teleport to point-blank) -----------------------------------
{
  const m = setup('XENON', 'MEN');
  m.a.x = 40; m.a.facing = 1; m.b.x = 200; m.b.facing = -1;   // far apart
  stepMatch(m, mv('DL', 'punch'), NEUT());                    // blink = D,B + punch
  for (let i = 0; i < 6; i++) stepMatch(m, NEUT(), NEUT());
  check('blink teleports XENON to point-blank', Math.abs(m.a.x - m.b.x) < 30, `gap ${Math.abs(m.a.x - m.b.x).toFixed(0)}`);
}

// --- AJAX LASSO (yank the rival in) ------------------------------------------
{
  const m = setup('AJAX', 'MEN');
  m.a.x = 100; m.a.facing = 1; m.b.x = 150; m.b.facing = -1;   // b to Ajax's right, within short rope range
  const bx0 = m.b.x;
  stepMatch(m, mv('DL', 'kick'), NEUT());                       // lasso = D,B + kick, facing right
  let sawRope = false;
  for (let i = 0; i < 34; i++) { stepMatch(m, NEUT(), NEUT()); if (m.projectiles.some((p) => p.style === 'rope')) sawRope = true; }
  check('lasso rope is thrown', sawRope);
  check('lasso yanks the rival back toward Ajax', m.b.x < bx0 - 3, `bx ${bx0.toFixed(0)} -> ${m.b.x.toFixed(0)}`);
}

// --- UNCLOSE TOKEN STREAM (sequential one-lane motes) -------------------------
{
  const m = setup('UNCLOSE', 'MEN');
  m.a.x = 60; m.b.x = 200;                                     // far apart so nothing connects early
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'DR' : 'DL', 'punch'), NEUT());
  check('token stream starts', m.a.attack === 'stream');
  let maxMotes = 0, firstSpawnFrame = -1, lastSpawnFrame = -1;
  for (let i = 1; i <= STREAM.spawn + STREAM.count * STREAM.spawnEvery + 2; i++) {
    stepMatch(m, NEUT(), NEUT());
    const n = m.projectiles.filter((p) => p.style === 'mote').length;
    if (n > maxMotes) { maxMotes = n; if (firstSpawnFrame < 0) firstSpawnFrame = i; lastSpawnFrame = i; }
  }
  check('stream looses all three tokens', maxMotes === STREAM.count, `motes=${maxMotes}`);
  check('tokens are spawned sequentially, not at once', lastSpawnFrame > firstSpawnFrame, `first=${firstSpawnFrame} last=${lastSpawnFrame}`);
}

// --- UNCLOSE FREE TIER (channelled heal; interrupt forfeits it) ----------------
{
  const m = setup('UNCLOSE', 'MEN');
  m.a.hp = 60; m.a.x = 60; m.b.x = 200;
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'DL' : 'DR', 'kick'), NEUT());
  check('free tier starts', m.a.attack === 'freetier');
  for (let i = 0; i < FREETIER.total + 2; i++) stepMatch(m, NEUT(), NEUT());
  check('completed channel restores health', m.a.hp === 60 + FREETIER.heal, `hp=${m.a.hp}`);
}
{
  const m = setup('UNCLOSE', 'MEN');
  m.a.hp = 60; m.a.x = 100; m.b.x = 118;                       // point-blank: the channel will be punished
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'DL' : 'DR', 'kick'), NEUT());
  check('free tier starts under pressure', m.a.attack === 'freetier');
  for (let i = 0; i < FREETIER.total + 6; i++) stepMatch(m, NEUT(), { ...emptyInputs(), punch: true });
  check('an interrupted channel never heals', m.a.hp < 60, `hp=${m.a.hp}`);
}

// --- Universal FLYING KICK ---------------------------------------------------
{
  const m = setup('BYU', 'MEN');
  stepMatch(m, { ...emptyInputs(), jump: true }, NEUT());
  check('fighter leaves the ground', m.a.y > 0);
  stepMatch(m, { ...emptyInputs(), kick: true }, NEUT());
  check('an airborne kick becomes a flying kick', m.a.attack === 'jumpkick');
}

// --- VICTORY pose at round end ----------------------------------------------
{
  const m = setup('MNEME', 'AJAX');
  m.b.hp = 0;                               // AJAX is KO'd → MNEME wins the round
  stepMatch(m, NEUT(), NEUT());             // round-end fires, winner.victoryT is set
  stepMatch(m, NEUT(), NEUT());             // round-over frame → winner's pose derives to victory
  check('winner enters victory pose, loser is KO', m.a.pose === 'victory' && m.a.victoryT > 0 && m.b.pose === 'ko', `a=${m.a.pose} b=${m.b.pose}`);
}

console.log(pass ? '\nNEW-WAVE TEST: PASS' : '\nNEW-WAVE TEST: FAIL');
process.exit(pass ? 0 : 1);

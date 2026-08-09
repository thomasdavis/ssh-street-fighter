// Headless mechanics test for the fluid engine.
import { makeFighter, makeMatch, stepMatch, ATTACKS, STAGE_RIGHT } from './game/engine.js';
import { emptyInputs, type Inputs } from './game/types.js';
import { ROSTER } from './game/roster.js';
import { specialMoveMotionCode, specialMovesFor } from './game/moves.js';

const idle = (): Inputs => emptyInputs();
function fresh(aName = 'BYU', bName = 'MEN') {
  const a = makeFighter('a', aName, 'a');
  const b = makeFighter('b', bName, 'b');
  const m = makeMatch(a, b);
  m.phase = 'fight'; m.phaseTimer = 0; m.message = '';
  return m;
}

let pass = true;
const check = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${extra}`); if (!cond) pass = false; };

// 1) walk closes distance with acceleration
let m = fresh();
let steps = 0; const startGap = m.b.x - m.a.x;
while (m.b.x - m.a.x > 34 && steps < 300) { const i = idle(); i.moveX = 1; stepMatch(m, i, idle()); steps++; }
check('walk closes distance', m.b.x - m.a.x <= 40 && steps < 300, `gap ${startGap.toFixed(0)}→${(m.b.x - m.a.x).toFixed(0)} in ${steps}`);

// 2) punch damages; kick hits harder
m = fresh(); m.a.x = m.b.x - 24; m.a.facing = 1; m.b.facing = -1;
let hp = m.b.hp; { const i = idle(); i.punch = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 12; k++) stepMatch(m, idle(), idle());
const punchDmg = hp - m.b.hp;
m = fresh(); m.a.x = m.b.x - 24; hp = m.b.hp; { const i = idle(); i.kick = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 20; k++) stepMatch(m, idle(), idle());
const kickDmg = hp - m.b.hp;
check('punch deals damage', punchDmg >= ATTACKS.punch.dmg - 1, `punch=${punchDmg}`);
check('kick > punch damage', kickDmg > punchDmg, `kick=${kickDmg} punch=${punchDmg}`);

// 3) block (hold back) reduces to chip — at the wall so B can't retreat
m = fresh(); m.b.x = STAGE_RIGHT; m.a.x = STAGE_RIGHT - 20; hp = m.b.hp;
for (let k = 0; k < 14; k++) { const ia = idle(); if (k === 0) ia.punch = true; const ib = idle(); ib.moveX = 1; stepMatch(m, ia, ib); }
check('holding back blocks (chip only)', hp - m.b.hp <= ATTACKS.punch.chip + 1, `blocked dmg=${hp - m.b.hp}`);

// 3b) crouch attack: down + punch is a low attack that still connects
m = fresh(); m.a.x = m.b.x - 22; hp = m.b.hp;
let sawCrouchPunch = false;
for (let k = 0; k < 14; k++) { const ia = idle(); ia.down = true; if (k === 0) ia.punch = true; stepMatch(m, ia, idle()); if (m.a.pose === 'crouchpunch') sawCrouchPunch = true; }
check('crouch punch connects', sawCrouchPunch && hp - m.b.hp >= ATTACKS.punch.dmg - 1, `pose seen=${sawCrouchPunch} dmg=${hp - m.b.hp}`);

// 4) facing flips after jumping across
m = fresh(); m.a.x = 60; m.b.x = 80;   // A left of B -> A faces right
const before = m.a.facing;
// shove A far past B and settle on the ground
m.a.x = m.b.x + 30; stepMatch(m, idle(), idle());
check('facing flips when crossed', m.a.facing === -1 && before === 1, `before ${before} after ${m.a.facing}`);

// 5) jump-over: airborne fighters are not separated
m = fresh(); m.a.x = 100; m.b.x = 108; m.a.y = 30; // A above B, overlapping x
stepMatch(m, idle(), idle());
check('jumper passes over (no shove)', Math.abs(m.b.x - m.a.x) < 20, `gap ${(m.b.x - m.a.x).toFixed(1)}`);

// 6) diagonal jump carries horizontal momentum
m = fresh(); const x0 = m.a.x; { const i = idle(); i.moveX = -1; i.jump = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 6; k++) { const i = idle(); i.moveX = -1; stepMatch(m, i, idle()); }
check('diagonal jump moves horizontally', m.a.x < x0 - 4 && m.a.y > 0, `dx ${(m.a.x - x0).toFixed(1)} y ${m.a.y.toFixed(1)}`);

// 7) Hadouken: QCF (↓→) + punch spawns a fireball that travels and damages
m = fresh(); m.a.x = 55; m.b.x = 185; m.a.facing = 1;
{ const i = idle(); i.motion = 'DR'; i.punch = true; stepMatch(m, i, idle()); }
const wasHadouken = m.a.pose === 'hadouken' || m.a.attack === 'hadouken';
for (let k = 0; k < 14; k++) stepMatch(m, idle(), idle());
const spawned = m.projectiles.length > 0;
const hp0 = m.b.hp;
for (let k = 0; k < 70; k++) stepMatch(m, idle(), idle());
check('hadouken triggers on ↓→ + punch', wasHadouken, `attack was hadouken=${wasHadouken}`);
check('fireball spawned + traveled', spawned, `projectiles=${spawned}`);
check('fireball damaged opponent', m.b.hp < hp0, `b hp ${hp0}→${m.b.hp}`);

// 8) plain punch (no motion) is NOT a hadouken
m = fresh(); m.a.x = 55; { const i = idle(); i.punch = true; stepMatch(m, i, idle()); }
check('plain punch is not a hadouken', m.a.attack === 'punch');

// 9) a non-projectile character (BLANKO) cannot throw a fireball
m = fresh('BYU', 'BLANKO'); { const i = idle(); i.motion = 'DL'; i.punch = true; stepMatch(m, idle(), i); }
check('non-hadouken char cannot fireball', m.b.attack !== 'hadouken' && m.projectiles.length === 0);

// 10) Shoryuken: DP motion (→↓→) + punch launches upward and hits on contact
m = fresh(); m.a.x = m.b.x - 26; m.a.facing = 1; m.b.facing = -1;
{ const i = idle(); i.motion = 'RDR'; i.punch = true; stepMatch(m, i, idle()); }
const wasShoryu = m.a.pose === 'shoryuken' || m.a.attack === 'shoryuken';
const roseUp = m.a.vy > 0 || m.a.y > 0;
let shoryuHp = m.b.hp, defLaunched = false;
for (let k = 0; k < 20; k++) { stepMatch(m, idle(), idle()); if (m.b.vy > 0 || m.b.y > 0) defLaunched = true; }
check('shoryuken triggers on →↓→ + punch', wasShoryu, `attack=${m.a.attack}`);
check('shoryuken rises off the ground', roseUp, `vy=${m.a.vy.toFixed(1)} y=${m.a.y.toFixed(1)}`);
check('shoryuken damages + launches opponent', m.b.hp < shoryuHp && defLaunched, `dmg=${shoryuHp - m.b.hp} launched=${defLaunched}`);

// 10b) a character without the rising-strike archetype does not shoryuken
m = fresh('BYU', 'BLANKO'); { const i = idle(); i.motion = 'RDR'; i.punch = true; stepMatch(m, idle(), i); }
check('non-special char cannot shoryuken', m.b.attack !== 'shoryuken');

// 11) Hurricane Kick: QCB (↓←) + kick spins forward and multi-hits
m = fresh(); m.a.x = m.b.x - 30; m.a.facing = 1; m.b.facing = -1;
{ const i = idle(); i.motion = 'DL'; i.kick = true; stepMatch(m, i, idle()); }
const wasHurri = m.a.pose === 'hurricane' || m.a.attack === 'hurricane';
let hurriHits = 0, prevHp = m.b.hp;
for (let k = 0; k < 34; k++) { stepMatch(m, idle(), idle()); if (m.b.hp < prevHp) { hurriHits++; prevHp = m.b.hp; } }
check('hurricane triggers on ↓← + kick', wasHurri, `attack=${m.a.attack}`);
check('hurricane multi-hits (>=2 hits)', hurriHits >= 2, `hits=${hurriHits}`);

// 11b) ↓← + PUNCH is not a hurricane (kick-only)
m = fresh(); m.a.x = m.b.x - 30; { const i = idle(); i.motion = 'DL'; i.punch = true; stepMatch(m, i, idle()); }
check('hurricane needs kick not punch', m.a.attack !== 'hurricane');

// 12) BLANKO Rolling Attack: back→forward + punch becomes a fast airborne ball
m = fresh('BLANKO'); m.a.x = 70; m.b.x = 132; m.a.facing = 1; m.b.facing = -1;
{ const i = idle(); i.motion = 'LR'; i.punch = true; stepMatch(m, i, idle()); }
const wasRolling = m.a.attack === 'rolling' && m.a.vx > 4 && m.a.y > 0;
const rollHp = m.b.hp;
for (let k = 0; k < 22; k++) stepMatch(m, idle(), idle());
check('BLANKO roll triggers on ←→ + punch', wasRolling, `attack=${m.a.attack}`);
check('BLANKO roll travels + damages', m.b.hp < rollHp, `dmg=${rollHp - m.b.hp} x=${m.a.x.toFixed(1)}`);

// 13) Vertical Roll: down→up + kick rises sharply and launches on contact
m = fresh('BLANKO'); m.a.x = m.b.x - 23; m.a.facing = 1; m.b.facing = -1;
{ const i = idle(); i.motion = 'DU'; i.jump = true; i.kick = true; stepMatch(m, i, idle()); }
const wasVertical = m.a.attack === 'verticalroll' && m.a.vy > 8;
const verticalHp = m.b.hp; let verticalLaunched = false;
for (let k = 0; k < 18; k++) { stepMatch(m, idle(), idle()); if (m.b.vy > 0 || m.b.y > 0) verticalLaunched = true; }
check('BLANKO vertical roll triggers on ↓↑ + kick', wasVertical, `attack=${m.a.attack}`);
check('BLANKO vertical roll damages + launches', m.b.hp < verticalHp && verticalLaunched, `dmg=${verticalHp - m.b.hp} launched=${verticalLaunched}`);

// 14) Electric Thunder: down→up + punch survives a one-tick SSH split and multi-hits
m = fresh('BLANKO'); m.a.x = m.b.x - 20; m.a.facing = 1; m.b.facing = -1;
{ const i = idle(); i.motion = 'DU'; i.jump = true; stepMatch(m, i, idle()); }
const hopBeforeButton = m.a.y > 0;
{ const i = idle(); i.motion = 'DU'; i.punch = true; stepMatch(m, i, idle()); }
const wasElectric = m.a.attack === 'electric' && m.a.y === 0;
let electricHits = 0; let electricHp = m.b.hp;
for (let k = 0; k < 28; k++) { stepMatch(m, idle(), idle()); if (m.b.hp < electricHp) { electricHits++; electricHp = m.b.hp; } }
check('BLANKO electric cancels the one-tick input hop', hopBeforeButton && wasElectric, `hop=${hopBeforeButton} attack=${m.a.attack}`);
check('BLANKO electric multi-hits (>=2 hits)', electricHits >= 2, `hits=${electricHits}`);

// 15) Character ownership: BYU cannot invoke BLANKO's horizontal roll
m = fresh(); { const i = idle(); i.motion = 'LR'; i.punch = true; stepMatch(m, i, idle()); }
check('non-BLANKO char cannot rolling attack', m.a.attack !== 'rolling');

// 16) Every roster entry owns exactly three recognizable special inputs.
for (const character of ROSTER) {
  const moves = specialMovesFor(character.name);
  check(`${character.name} has three specials`, moves.length === 3, `count=${moves.length}`);
  for (const move of moves) {
    m = fresh(character.name);
    const i = idle(); i.motion = specialMoveMotionCode(move, 1); i[move.button] = true;
    stepMatch(m, i, idle());
    check(`${character.name} ${move.name} input`, m.a.attack === move.attack, `got=${m.a.attack}`);
  }
}

// 17) Every projectile fighter's appearance follows its move definition, not a character-name conditional.
for (const character of ROSTER) {
  const move = specialMovesFor(character.name).find((x) => x.attack === 'hadouken');
  if (!move) continue;
  m = fresh(character.name); const i = idle(); i.motion = specialMoveMotionCode(move, 1); i[move.button] = true; stepMatch(m, i, idle());
  for (let k = 0; k < 12; k++) stepMatch(m, idle(), idle());
  const expected = move.projectile ?? 'blue';
  check(`${character.name} projectile style`, m.projectiles[0]?.style === expected, `got=${m.projectiles[0]?.style ?? 'none'}`);
}

console.log(pass ? '\nENGINE TEST: PASS' : '\nENGINE TEST: FAIL');
process.exit(pass ? 0 : 1);

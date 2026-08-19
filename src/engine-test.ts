// Headless mechanics test for the fluid engine.
import { makeFighter, makeMatch, stepMatch, ATTACKS, STAGE_RIGHT, MERGE_COMET, specialMoveStats } from './game/engine.js';
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

// 17) OMEGA's kit is mechanically unique: a beam, a phase-through cross-up, and a pulling multi-hit well.
const omegaMoves = specialMovesFor('OMEGA');
const inheritedAttackKinds = new Set(ROSTER.filter((character) => character.name !== 'OMEGA').flatMap((character) => specialMovesFor(character.name).map((move) => move.attack)));
check('OMEGA specials use three unique attack kinds', new Set(omegaMoves.map((move) => move.attack)).size === 3 && omegaMoves.every((move) => !inheritedAttackKinds.has(move.attack)), omegaMoves.map((move) => move.attack).join(','));

m = fresh('OMEGA'); m.a.x = 55; m.b.x = 185; hp = m.b.hp;
{ const i = idle(); i.motion = 'DR'; i.punch = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 18; k++) stepMatch(m, idle(), idle());
check('FINAL TESTIMONY is a screen-length beam, not a projectile', m.b.hp < hp && m.projectiles.length === 0, `dmg=${hp - m.b.hp} projectiles=${m.projectiles.length}`);

m = fresh('OMEGA'); m.a.x = 78; m.b.x = 120; hp = m.b.hp;
{ const i = idle(); i.motion = 'LR'; i.kick = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 12; k++) stepMatch(m, idle(), idle());
check('NULL STEP phases through and lands a cross-up', m.a.x > m.b.x && m.a.facing === -1 && m.b.hp < hp, `positions=${m.a.x.toFixed(1)}/${m.b.x.toFixed(1)} facing=${m.a.facing} dmg=${hp - m.b.hp}`);

m = fresh('OMEGA'); m.a.x = 62; m.b.x = 142; hp = m.b.hp;
const entropyGap = m.b.x - m.a.x;
{ const i = idle(); i.motion = 'DL'; i.punch = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 29; k++) stepMatch(m, idle(), idle());
check('ENTROPY WELL pulls inward and pulses repeatedly', m.b.x - m.a.x < entropyGap && hp - m.b.hp >= 8, `gap=${entropyGap.toFixed(1)}→${(m.b.x - m.a.x).toFixed(1)} dmg=${hp - m.b.hp}`);

// 18) CODEX uses three unique, lower-damage aerial commitments. Context Ascent
// clears Omega's beam vertically without introducing immunity or reflection,
// then Weight of Evidence may revise only the descending half into a capped dive.
const codexMoves = specialMovesFor('CODEX');
const nonCodexAttacks = new Set(ROSTER.filter((character) => character.name !== 'CODEX').flatMap((character) => specialMovesFor(character.name).map((move) => move.attack)));
check('CODEX specials use three unique attack kinds', new Set(codexMoves.map((move) => move.attack)).size === 3 && codexMoves.every((move) => !nonCodexAttacks.has(move.attack)), codexMoves.map((move) => move.attack).join(','));
check('CODEX specials stay below Final Testimony damage', codexMoves.every((move) => specialMoveStats(move.attack).maxDamage < specialMoveStats('testimony').maxDamage));
check('CODEX names its gravity dive WEIGHT OF EVIDENCE', codexMoves.find((move) => move.attack === 'mergecomet')?.name === 'WEIGHT OF EVIDENCE');

m = fresh('CODEX', 'OMEGA'); m.a.x = 58; m.b.x = 182; hp = m.a.hp;
{
  const codex = idle(); codex.motion = 'DU'; codex.punch = true;
  const omega = idle(); omega.motion = 'DL'; omega.punch = true;
  stepMatch(m, codex, omega);
}
for (let k = 0; k < 18; k++) stepMatch(m, idle(), idle());
check('CONTEXT ASCENT clears a simultaneous Omega beam', m.a.hp === hp && m.a.y > 48, `hp=${m.a.hp} y=${m.a.y.toFixed(1)}`);

m = fresh('CODEX'); m.a.x = 72; m.b.x = 116; hp = m.b.hp;
{ const i = idle(); i.motion = 'LR'; i.kick = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 18; k++) stepMatch(m, idle(), idle());
check('BRANCHWALK commits forward through one aerial lane', m.a.x > 95 && m.a.y > 0 && m.b.hp < hp, `x=${m.a.x.toFixed(1)} y=${m.a.y.toFixed(1)} dmg=${hp - m.b.hp}`);

m = fresh('CODEX'); m.a.x = 76; m.b.x = 112; hp = m.b.hp;
{ const i = idle(); i.motion = 'DR'; i.kick = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 22; k++) stepMatch(m, idle(), idle());
check('WEIGHT OF EVIDENCE telegraphs a rise before the damaging dive', m.b.hp < hp && m.a.y < 30, `y=${m.a.y.toFixed(1)} dmg=${hp - m.b.hp}`);

m = fresh('CODEX'); m.a.x = 76; m.b.x = 114; hp = m.b.hp;
{ const i = idle(); i.motion = 'DU'; i.punch = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 5; k++) stepMatch(m, idle(), idle());
{ const i = idle(); i.motion = 'DR'; i.kick = true; stepMatch(m, i, idle()); }
check('WEIGHT OF EVIDENCE cannot cancel the Context ascent', m.a.attack === 'context' && m.a.vy > 0, `attack=${m.a.attack} vy=${m.a.vy.toFixed(1)}`);
for (let k = 0; k < 30 && m.a.vy >= 0; k++) stepMatch(m, idle(), idle());
const descentY = m.a.y;
{ const i = idle(); i.motion = 'DR'; i.kick = true; stepMatch(m, i, idle()); }
const revisedOnDescent = m.a.attack === 'mergecomet' && m.a.attackFrame === MERGE_COMET.startup - 1 && m.a.vy < 0;
for (let k = 0; k < 12; k++) stepMatch(m, idle(), idle());
check('WEIGHT OF EVIDENCE cancels Context only on descent', revisedOnDescent && m.b.hp < hp, `startY=${descentY.toFixed(1)} attack=${m.a.attack} dmg=${hp - m.b.hp}`);
check('WEIGHT OF EVIDENCE compounds to its capped damage on a long fall', hp - m.b.hp === specialMoveStats('mergecomet').maxDamage, `dmg=${hp - m.b.hp}`);

// 19) FABLE fights in narrative beats with three unique, roster-fair commitments.
// Story Arc buys evasion with a long landing, never damage or immunity.
const fableMoves = specialMovesFor('FABLE');
const nonFableAttacks = new Set(ROSTER.filter((character) => character.name !== 'FABLE').flatMap((character) => specialMovesFor(character.name).map((move) => move.attack)));
check('FABLE specials use three unique attack kinds', new Set(fableMoves.map((move) => move.attack)).size === 3 && fableMoves.every((move) => !nonFableAttacks.has(move.attack)), fableMoves.map((move) => move.attack).join(','));
check('FABLE specials stay below Final Testimony damage', fableMoves.every((move) => specialMoveStats(move.attack).maxDamage < specialMoveStats('testimony').maxDamage));

m = fresh('FABLE', 'OMEGA'); m.a.x = 58; m.b.x = 182; hp = m.a.hp;
{
  const fable = idle(); fable.motion = 'DU'; fable.punch = true;
  const omega = idle(); omega.motion = 'DL'; omega.punch = true;
  stepMatch(m, fable, omega);
}
for (let k = 0; k < 18; k++) stepMatch(m, idle(), idle());
check('STORY ARC sails over a simultaneous Omega beam', m.a.hp === hp && m.a.y > 48, `hp=${m.a.hp} y=${m.a.y.toFixed(1)}`);

m = fresh('FABLE'); m.a.x = 100; m.b.x = 126; hp = m.b.hp;
const twistStartX = m.a.x;
let twistMinX = m.a.x;
{ const i = idle(); i.motion = 'LR'; i.kick = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 16; k++) { stepMatch(m, idle(), idle()); twistMinX = Math.min(twistMinX, m.a.x); }
check('PLOT TWIST retreats through the feint then lands the lunge', twistMinX < twistStartX - 8 && m.b.hp < hp, `minX=${twistMinX.toFixed(1)} dmg=${hp - m.b.hp}`);

m = fresh('FABLE'); m.a.x = 100; m.b.x = 124; hp = m.b.hp;
{ const i = idle(); i.motion = 'DL'; i.punch = true; stepMatch(m, i, idle()); }
for (let k = 0; k < 34; k++) stepMatch(m, idle(), idle());
check('INK TEMPEST clips a close rival in repeated pulses', hp - m.b.hp >= 8, `dmg=${hp - m.b.hp}`);

// 20) Every projectile fighter's appearance follows its move definition, not a character-name conditional.
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

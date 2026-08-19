// Behavioural checks for the new-wave mechanics: XENON phase i-frames + cross-up,
// AJAX super-armor and returning boomerang, MNEME construct turret + motes, the
// universal flying kick. Drives the real engine with crafted inputs.
import { makeFighter, makeMatch, stepMatch, BOOMERANG, CONSTRUCT } from './game/engine.js';
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

// --- AJAX THE RECKONING (returning boomerang) --------------------------------
{
  const m = setup('AJAX', 'MEN');
  const facing = m.a.facing;
  stepMatch(m, mv(facing === 1 ? 'DR' : 'DL', 'kick'), NEUT());
  for (let i = 0; i < BOOMERANG.spawn + 2; i++) stepMatch(m, NEUT(), NEUT());
  check('boomerang is thrown', m.projectiles.some((p) => p.style === 'boomerang'));
  let returned = false;
  for (let i = 0; i < 60; i++) { stepMatch(m, NEUT(), NEUT()); if (m.projectiles.some((p) => p.style === 'boomerang' && p.returning)) returned = true; }
  check('boomerang reverses and homes back', returned);
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

// --- Universal FLYING KICK ---------------------------------------------------
{
  const m = setup('BYU', 'MEN');
  stepMatch(m, { ...emptyInputs(), jump: true }, NEUT());
  check('fighter leaves the ground', m.a.y > 0);
  stepMatch(m, { ...emptyInputs(), kick: true }, NEUT());
  check('an airborne kick becomes a flying kick', m.a.attack === 'jumpkick');
}

console.log(pass ? '\nNEW-WAVE TEST: PASS' : '\nNEW-WAVE TEST: FAIL');
process.exit(pass ? 0 : 1);

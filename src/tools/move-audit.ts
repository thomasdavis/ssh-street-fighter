// Move audit — empirical balance evidence for every special in the roster.
// For each move it prints the declared frame data, then actually runs the
// engine to measure damage dealt against each canonical defense (stand /
// block-from-start / crouch / jump-on-startup), taking the worst case over a
// distance sweep. Two derived columns make outliers obvious:
//   minDef  — the best any defender can do (the move's unavoidable floor)
//   guardTax — damage taken when blocking from before the attack, minus the
//              move's declared maximum chip. A positive guardTax means the
//              move structurally BREAKS GUARD (e.g. staggered multi-projectile
//              arrival re-hitting through block-stun) — the Archive Volley bug.
// Throws are exempt from guardTax (unblockable by design).
//
//   tsx src/tools/move-audit.ts             # full roster report
//   tsx src/tools/move-audit.ts --check     # exit 1 if any non-throw move has guardTax > 0
//   tsx src/tools/move-audit.ts MNEME       # one character
import { makeFighter, makeMatch, stepMatch, specialMoveStats } from '../game/engine.js';
import { emptyInputs, type Inputs } from '../game/types.js';
import { ROSTER } from '../game/roster.js';
import { specialMovesFor, specialMoveMotionCode, type SpecialMoveDefinition } from '../game/moves.js';

type Defense = 'stand' | 'block' | 'crouch' | 'jump';
const DEFENSES: Defense[] = ['stand', 'block', 'crouch', 'jump'];
const DISTANCES = [26, 45, 70, 110];
const SIM_FRAMES = 110; // covers every special's total + projectile travel

function trial(attacker: string, move: SpecialMoveDefinition, defense: Defense, dist: number): number {
  const m = makeMatch(makeFighter('a', attacker, 'a'), makeFighter('b', 'BYU', 'b'));
  m.phase = 'fight'; m.phaseTimer = 0; m.message = '';
  m.a.x = 60; m.b.x = Math.min(200, 60 + dist);
  const hp0 = m.b.hp;
  for (let f = 0; f < SIM_FRAMES; f++) {
    const ia = emptyInputs(); const ib: Inputs = emptyInputs();
    if (f === 0) {
      ia.motion = specialMoveMotionCode(move, 1);
      ia[move.button] = true;
      if (move.earlyAirStart) ia.jump = true;
    }
    if (defense === 'block') ib.moveX = 1;                 // hold away from the start
    if (defense === 'crouch') ib.down = true;
    if (defense === 'jump' && f === Math.max(1, specialMoveStats(move.attack).startup - 2)) ib.jump = true;
    stepMatch(m, ia, ib);
  }
  return hp0 - m.b.hp;
}

function audit(name: string): { rows: string[]; violations: string[] } {
  const rows: string[] = [];
  const violations: string[] = [];
  for (const move of specialMovesFor(name)) {
    const s = specialMoveStats(move.attack);
    const worst: Record<Defense, number> = { stand: 0, block: 0, crouch: 0, jump: 0 };
    for (const d of DEFENSES) for (const dist of DISTANCES) worst[d] = Math.max(worst[d], trial(name, move, d, dist));
    const minDef = Math.min(...DEFENSES.map((d) => worst[d]));
    const maxChip = s.chipPerHit * s.maxHits;
    const guardTax = move.attack === 'throw' ? 0 : worst.block - maxChip;
    if (guardTax > 0) violations.push(`${name}/${move.name}: blocking from start costs ${worst.block}, declared max chip is ${maxChip} (guardTax +${guardTax})`);
    rows.push(`  ${move.name.padEnd(18)} ${String(s.startup).padStart(3)}/${String(s.active).padStart(3)}/${String(s.recovery).padStart(3)}  dmg=${String(s.maxDamage).padStart(3)} chip=${String(maxChip).padStart(2)}  stand=${String(worst.stand).padStart(3)} block=${String(worst.block).padStart(3)} crouch=${String(worst.crouch).padStart(3)} jump=${String(worst.jump).padStart(3)}  minDef=${String(minDef).padStart(3)}${guardTax > 0 ? `  ** GUARD-BREAK +${guardTax}` : ''}`);
  }
  return { rows, violations };
}

const arg = process.argv[2] ?? '';
const check = arg === '--check';
const targets = check || !arg ? ROSTER.map((c) => c.name) : [arg.toUpperCase()];
const allViolations: string[] = [];
console.log('move                 st/act/rec  declared      measured worst-case damage per defense');
for (const name of targets) {
  const { rows, violations } = audit(name);
  if (!rows.length) { console.log(`${name}: no specials found`); continue; }
  console.log(`${name}`);
  for (const r of rows) console.log(r);
  allViolations.push(...violations);
}
if (allViolations.length) {
  console.log('\nGUARD-BREAK VIOLATIONS (blocking from before the attack should cost at most declared chip):');
  for (const v of allViolations) console.log(`  FAIL: ${v}`);
} else {
  console.log('\nNo guard-break violations.');
}
if (check) process.exit(allViolations.length ? 1 : 0);

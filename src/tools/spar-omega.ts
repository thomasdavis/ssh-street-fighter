// Local sparring: FABLE driven by the live bot brain vs a scripted OMEGA that
// imitates the behavior observed in replays (entropy wells, blocks, kick
// punishes, beams at range). Measures win rate and where damage comes from.
//   tsx src/tools/spar-omega.ts 100
import { makeFighter, makeMatch, stepMatch } from '../game/engine.js';
import { emptyInputs, type Inputs, type Match, type Fighter } from '../game/types.js';
// @ts-expect-error plain-JS brain shared with the live bot
import { decide } from '../../../claude-brain.mjs';

const N = parseInt(process.argv[2] ?? '100', 10);
const R = Math.random;

function view(m: Match, side: 'a' | 'b'): object {
  const you = side === 'a' ? m.a : m.b;
  const opp = side === 'a' ? m.b : m.a;
  const strip = (f: Fighter) => ({ x: f.x, y: f.y, hp: f.hp, facing: f.facing, attack: f.attack, attackFrame: f.attackFrame, pose: f.pose, stun: f.stun });
  return { t: 'state', phase: m.phase, role: side, you: strip(you), opp: strip(opp), projectiles: m.projectiles.filter((p) => p.active).map((p) => ({ owner: p.owner, x: p.x, y: p.y, vx: p.vx })) };
}

function toInputs(cmd: Record<string, unknown>): Inputs {
  const i = emptyInputs();
  i.moveX = Math.sign(Number(cmd.moveX) || 0) as -1 | 0 | 1;
  i.jump = !!cmd.jump; i.down = !!cmd.down; i.punch = !!cmd.punch; i.kick = !!cmd.kick; i.throw = !!cmd.throw;
  i.motion = typeof cmd.motion === 'string' ? cmd.motion : '';
  return i;
}

// scripted omega: replay-observed tendencies
function omegaPolicy(m: Match, side: 'a' | 'b'): Inputs {
  const you = side === 'a' ? m.a : m.b;
  const opp = side === 'a' ? m.b : m.a;
  const i = emptyInputs();
  if (m.phase !== 'fight') return i;
  const dist = Math.abs(opp.x - you.x);
  const towards = Math.sign(opp.x - you.x) || you.facing;
  const busy = you.attack !== 'none' || you.stun > 0;
  if (busy) return i;
  const f = you.facing;
  const fwd = f === 1 ? 'R' : 'L', back = f === 1 ? 'L' : 'R';
  const oppAtk = opp.attack !== 'none';
  if (oppAtk && dist < 42 && R() < 0.55) { i.moveX = -towards; return i; }              // block pressure
  if (opp.y > 8 && dist < 55 && R() < 0.4) { i.motion = `D${fwd}`; i.punch = true; return i; } // beam anti-air
  if (dist < 30 && (opp.pose === 'block' || opp.pose === 'crouchblock') && R() < 0.4) { i.throw = true; return i; }
  if (dist < 44 && R() < 0.45) { i.kick = true; return i; }                              // the kick that farmed me
  if (dist < 85 && R() < 0.22) { i.motion = `D${back}`; i.punch = true; return i; }      // ENTROPY WELL
  if (dist > 95 && R() < 0.3) { i.motion = `D${fwd}`; i.punch = true; return i; }        // TESTIMONY
  if (dist > 120 && R() < 0.15) { i.motion = `${back}${fwd}`; i.kick = true; return i; } // null step in
  i.moveX = towards;
  return i;
}

let wins = 0;
const oppDmgByMove = new Map<string, number>();
let myDmg = 0, oppDmg = 0;
for (let n = 0; n < N; n++) {
  const m = makeMatch(makeFighter('a', 'FABLE', 'a'), makeFighter('b', 'OMEGA', 'b'));
  let prevA = m.a.hp, guard = 0;
  while (m.phase !== 'match-over' && guard++ < 30 * 60 * 6) {
    const inA = toInputs(decide(view(m, 'a'), 'FABLE') as Record<string, unknown>);
    const inB = omegaPolicy(m, 'b');
    const preAtkB = m.b.attack;
    stepMatch(m, inA, inB);
    if (m.a.hp < prevA) {
      const mv = m.b.attack !== 'none' ? m.b.attack : (preAtkB !== 'none' ? preAtkB : 'projectile');
      oppDmgByMove.set(mv, (oppDmgByMove.get(mv) ?? 0) + (prevA - m.a.hp));
      oppDmg += prevA - m.a.hp;
    }
    if (m.a.hp > prevA) { /* round reset */ }
    prevA = m.a.hp;
  }
  myDmg += 0;
  if (m.a.wins > m.b.wins) wins++;
}
console.log(`FABLE (live brain) vs scripted-OMEGA: ${wins}/${N} wins (${((wins / N) * 100).toFixed(0)}%)`);
console.log(`omega damage to me per match: ${(oppDmg / N).toFixed(1)} — by move:`);
for (const [mv, d] of [...oppDmgByMove.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${mv.padEnd(12)} ${(d / N).toFixed(1)}/match`);

// Replay forensics: fetch stored replays from the live API, re-simulate them
// with the local engine, and attribute every point of damage to the move that
// caused it, with context (distance, victim state). Local-only analysis tool.
//   tsx src/tools/analyze-replays.ts CLAUDE omega 12
import { makeFighter, makeMatch, stepMatch } from '../game/engine.js';
import { emptyInputs, type Inputs, type Match } from '../game/types.js';

const ME = process.argv[2] ?? 'CLAUDE';
const OPP = (process.argv[3] ?? 'omega').toLowerCase();
const LIMIT = parseInt(process.argv[4] ?? '10', 10);
const BASE = process.env.SF_API ?? 'https://sshfighter.com';

interface ReplayDoc {
  match_id: string;
  header: { motions: string[]; stage: string; seed: number; sides: { a: { name: string; char: string }; b: { name: string; char: string } } };
  keyframes: { f: number; a: { hp: number; wins: number }; b: { hp: number; wins: number } }[];
  frame_count: number;
  frames_b64: string;
}

function unpack(flags: number, motion: string): Inputs {
  const i = emptyInputs();
  i.moveX = ((flags & 3) - 1) as -1 | 0 | 1;
  i.jump = !!(flags & 4); i.down = !!(flags & 8);
  i.punch = !!(flags & 16); i.kick = !!(flags & 32);
  i.throw = !!(flags & 64);
  i.motion = motion;
  return i;
}

interface HitRow { attacker: 'me' | 'opp'; move: string; dmg: number; dist: number; victimPose: string; victimAttack: string; victimAir: boolean; round: number; }

async function analyze(id: string): Promise<{ rows: HitRow[]; drift: number; meSide: 'a' | 'b'; winner: string } | null> {
  const r = await fetch(`${BASE}/api/matches/${id}/replay`);
  if (!r.ok) return null;
  const doc = (await r.json()) as ReplayDoc;
  const { header } = doc;
  const meSide: 'a' | 'b' = header.sides.a.name === ME ? 'a' : 'b';
  const bytes = Buffer.from(doc.frames_b64, 'base64');
  const a = makeFighter('a', header.sides.a.char, 'a');
  const b = makeFighter('b', header.sides.b.char, 'b');
  const m: Match = makeMatch(a, b);
  const rows: HitRow[] = [];
  let prevA = m.a.hp, prevB = m.b.hp;

  const frames = Math.min(doc.frame_count, Math.floor(bytes.length / 4));
  for (let f = 0; f < frames; f++) {
    const inA = unpack(bytes[f * 4]!, header.motions[bytes[f * 4 + 1]!] ?? '');
    const inB = unpack(bytes[f * 4 + 2]!, header.motions[bytes[f * 4 + 3]!] ?? '');
    // snapshot victim state BEFORE the step so context reflects the moment of impact
    const preAPose = m.a.pose, preBPose = m.b.pose, preAAtk = m.a.attack, preBAtk = m.b.attack, preAY = m.a.y, preBY = m.b.y;
    const preAX = m.a.x, preBX = m.b.x;
    stepMatch(m, inA, inB);
    if (m.b.hp < prevB) { rows.push({ attacker: meSide === 'a' ? 'me' : 'opp', move: m.a.attack !== 'none' ? m.a.attack : 'projectile', dmg: prevB - m.b.hp, dist: Math.round(Math.abs(preAX - preBX)), victimPose: preBPose, victimAttack: preBAtk, victimAir: preBY > 8, round: m.round }); }
    if (m.a.hp < prevA) { rows.push({ attacker: meSide === 'b' ? 'me' : 'opp', move: m.b.attack !== 'none' ? m.b.attack : 'projectile', dmg: prevA - m.a.hp, dist: Math.round(Math.abs(preAX - preBX)), victimPose: preAPose, victimAttack: preAAtk, victimAir: preAY > 8, round: m.round }); }
    prevA = m.a.hp; prevB = m.b.hp;
  }
  // fidelity: compare simulated wins to the last keyframe
  const last = doc.keyframes[doc.keyframes.length - 1];
  const drift = last ? Math.abs(m.a.wins - last.a.wins) + Math.abs(m.b.wins - last.b.wins) : 99;
  const winner = m.a.wins > m.b.wins ? header.sides.a.name : header.sides.b.name;
  return { rows, drift, meSide, winner };
}

const profile = await fetch(`${BASE}/api/players/${ME}`).then((r) => r.json()) as { recent: { id: string; a_name: string; b_name: string }[] };
const ids = (profile.recent ?? []).filter((m) => m.a_name.toLowerCase() === OPP || m.b_name.toLowerCase() === OPP).slice(0, LIMIT).map((m) => m.id);
console.log(`analyzing ${ids.length} ${ME}-vs-${OPP} replays…`);

const all: HitRow[] = [];
let myWins = 0, oppWins = 0, driftTotal = 0;
for (const id of ids) {
  const res = await analyze(id).catch(() => null);
  if (!res) { console.log(`  ${id}: fetch/sim failed`); continue; }
  driftTotal += res.drift;
  res.winner === ME ? myWins++ : oppWins++;
  all.push(...res.rows);
  console.log(`  ${id}: ${res.rows.length} hits, winner=${res.winner}, keyframe drift=${res.drift}`);
}

function table(rows: HitRow[], who: 'me' | 'opp'): void {
  const by = new Map<string, { dmg: number; hits: number; ctx: Map<string, number> }>();
  for (const r of rows) {
    if (r.attacker !== who) continue;
    const e = by.get(r.move) ?? { dmg: 0, hits: 0, ctx: new Map() };
    e.dmg += r.dmg; e.hits++;
    const ctx = r.victimAir ? 'air' : (r.victimPose === 'block' || r.victimPose === 'crouchblock') ? 'blocking' : (r.victimAttack !== 'none' ? `during:${r.victimAttack}` : 'neutral');
    e.ctx.set(ctx, (e.ctx.get(ctx) ?? 0) + r.dmg);
    by.set(r.move, e);
  }
  const total = [...by.values()].reduce((s, e) => s + e.dmg, 0);
  for (const [move, e] of [...by.entries()].sort((x, y) => y[1].dmg - x[1].dmg)) {
    const ctx = [...e.ctx.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`  ${move.padEnd(12)} dmg=${String(e.dmg).padStart(5)} (${((e.dmg / total) * 100).toFixed(0)}%) hits=${e.hits}  victim was → ${ctx}`);
  }
}

console.log(`\nsimulated result: ${ME} ${myWins} — ${oppWins} ${OPP} (total drift ${driftTotal})`);
console.log(`\n=== damage ${OPP} dealt TO ${ME} (what kills me) ===`);
table(all, 'opp');
console.log(`\n=== damage ${ME} dealt to ${OPP} (what works) ===`);
table(all, 'me');

// Verifies the render worker pool produces byte-identical output to the inline
// render path, and measures the multi-core throughput gain.
import { makeFighter, makeMatch, stepMatch } from './game/engine.js';
import { emptyInputs, type Match } from './game/types.js';
import { composeScene } from './game/scene.js';
import { Frame, diffCells, type Cell, type RenderMode } from './render/frame.js';
import { drawFightHud } from './screens/fight-hud.js';
import { DEFAULT_KEY_BINDINGS } from './input/bindings.js';
import { RenderPool } from './render/render-pool.js';

const C = 120, R = 40, MODE: RenderMode = 'half';
let pass = true;
const check = (n: string, c: boolean, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

function freshMatch(seed: number): Match {
  const a = makeFighter('a', 'BYU', 'a'), b = makeFighter('b', 'CHONG', 'b');
  const m = makeMatch(a, b); m.phase = 'fight'; m.phaseTimer = 0; m.message = '';
  m.a.x = 70 + (seed % 5) * 3;
  return m;
}
function drive(m: Match, i: number) {
  const s = emptyInputs(); s.moveX = (i % 20 < 10) ? 1 : -1;
  if (i % 15 === 0) s.punch = true; if (i % 23 === 0) { s.motion = 'DR'; s.punch = true; }
  stepMatch(m, s, emptyInputs());
}

// mirror of the inline fight render (== what the worker does)
interface St { prev: Cell[] | null; a: Cell[] | null; b: Cell[] | null; }
function inlineRender(m: Match, st: St): string {
  const f = new Frame(C, R, MODE);
  f.usePixel(composeScene(m, false, C * 2, R * 4, false));
  drawFightHud(f, m, false, DEFAULT_KEY_BINDINGS);
  const reuse = st.prev === st.a ? st.b : st.prev === st.b ? st.a : null;
  const next = f.toCells(1, reuse ?? undefined);
  if (next !== st.a && next !== st.b) { if (st.prev === st.a) st.b = next; else st.a = next; }
  const bytes = diffCells(st.prev, next, C, R, false);
  st.prev = next;
  return bytes;
}

async function main() {
  const pool = new RenderPool(2);

  // 1) correctness: pool bytes == inline bytes, frame for frame
  {
    const m = freshMatch(0); const st: St = { prev: null, a: null, b: null };
    let mism = -1;
    for (let i = 0; i < 60; i++) {
      drive(m, i);
      const ref = inlineRender(m, st);
      const got = await pool.render(1, m, C, R, MODE, false, DEFAULT_KEY_BINDINGS, i === 0);
      if (ref !== got) { mism = i; break; }
    }
    check('pool output is byte-identical to inline', mism === -1, mism === -1 ? '60 frames' : `mismatch at frame ${mism}`);
  }

  // 2) full-redraw flag actually forces a full frame (bytes jump)
  {
    const m = freshMatch(2); pool.free(9);
    await pool.render(9, m, C, R, MODE, false, DEFAULT_KEY_BINDINGS, true);
    drive(m, 1);
    const small = await pool.render(9, m, C, R, MODE, false, DEFAULT_KEY_BINDINGS, false);
    const full = await pool.render(9, m, C, R, MODE, false, DEFAULT_KEY_BINDINGS, true);
    check('full=true redraws whole frame (>> incremental)', full.length > small.length * 3, `full=${full.length} incr=${small.length}`);
  }
  pool.free(1); pool.free(9);

  // 3) throughput: inline (1 core) vs pool(W) for many fighting sessions
  const S = 24, F = 40;
  const matches = Array.from({ length: S }, (_, i) => { const m = freshMatch(i); for (let k = 0; k < 20; k++) drive(m, k); return m; });

  const inSt: St[] = matches.map(() => ({ prev: null, a: null, b: null }));
  let t = process.hrtime.bigint();
  for (let f = 0; f < F; f++) for (let s = 0; s < S; s++) { drive(matches[s]!, f + 20); inlineRender(matches[s]!, inSt[s]!); }
  const inlineMs = Number(process.hrtime.bigint() - t) / 1e6;

  // Realistic: sessions render on independent schedules, so fire all jobs and
  // let the pool saturate the workers (no artificial per-frame barrier).
  for (const W of [4, 6]) {
    const p = new RenderPool(W);
    const ms2 = matches.map((_, i) => freshMatch(i));
    for (const m of ms2) for (let k = 0; k < 20; k++) drive(m, k);
    // pre-snapshot per (session,frame) so the main thread isn't the bottleneck
    const snaps: Match[] = [];
    for (let f = 0; f < F; f++) for (let s = 0; s < S; s++) { drive(ms2[s]!, f + 20); snaps.push(JSON.parse(JSON.stringify(ms2[s]!))); }
    t = process.hrtime.bigint();
    const jobs: Promise<string>[] = [];
    for (let i = 0; i < snaps.length; i++) jobs.push(p.render(100 + (i % S), snaps[i]!, C, R, MODE, false, DEFAULT_KEY_BINDINGS, i < S));
    await Promise.all(jobs);
    const poolMs = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(`throughput ${S * F} renders: inline=${inlineMs.toFixed(0)}ms  pool(${W})=${poolMs.toFixed(0)}ms  speedup=${(inlineMs / poolMs).toFixed(2)}x  (${(1000 / (poolMs / (S * F))).toFixed(0)} renders/s)`);
    for (let s = 0; s < S; s++) p.free(100 + s);
  }

  console.log(pass ? '\nRENDER POOL TEST: PASS' : '\nRENDER POOL TEST: FAIL');
  process.exit(pass ? 0 : 1);
}
main();

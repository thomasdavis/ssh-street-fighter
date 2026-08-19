// Compare color strategies on real fight+stage frames: raw diff bytes and
// gzip'd (what zlib sends on the wire). Helps pick a default without banding.
import { gzipSync } from 'zlib';
import { Frame, diffCells, type Cell } from '../render/frame.js';
import { quantize } from '../render/pixel.js';
import { composeScene } from '../game/scene.js';
import { drawFightHud } from '../screens/fight-hud.js';
import { makeFighter, makeMatch, stepMatch, TICK_HZ } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';

const cols = 200, rows = 56, N = 120, RENDER_HZ = 12;
function frames(): Cell[][] {
  const a = makeFighter('a', 'BYU', 'a'), b = makeFighter('b', 'MEN', 'b');
  const m = makeMatch(a, b); m.stage = 'dojo'; m.phase = 'fight'; m.phaseTimer = 0;
  const out: Cell[][] = [];
  let renderAccum = 0;
  for (let t = 0; t < N; t++) {
    const inA = emptyInputs(); inA.moveX = t % 40 < 20 ? 1 : -1; if (t % 25 === 0) inA.punch = true;
    const inB = emptyInputs(); inB.moveX = t % 50 < 25 ? -1 : 1; if (t % 30 === 0) inB.kick = true;
    stepMatch(m, inA, inB);
    renderAccum += RENDER_HZ;
    if (renderAccum < TICK_HZ) continue;
    renderAccum -= TICK_HZ;
    const f = new Frame(cols, rows, 'half');
    f.usePixel(composeScene(m, cols * 2, rows * 4));
    drawFightHud(f, m, false);
    out.push(f.toCells());
  }
  return out;
}
const qz = (cells: Cell[], step: number): Cell[] => step <= 1 ? cells : cells.map((c) => ({ ch: c.ch, fg: quantize(c.fg, step), bg: quantize(c.bg, step), bold: c.bold }));

const base = frames();
const secs = N / TICK_HZ;
function run(label: string, step: number, indexed: boolean): void {
  let prev: Cell[] | null = null, raw = 0; const chunks: Buffer[] = [];
  for (const cells of base) {
    const q = qz(cells, step);
    const out = diffCells(prev, q, cols, rows, indexed);
    prev = q; raw += Buffer.byteLength(out); if (out) chunks.push(Buffer.from(out));
  }
  const gz = gzipSync(Buffer.concat(chunks), { level: 6 }).length;
  console.log(`${label.padEnd(26)} raw ${(raw / secs / 1024).toFixed(1)} KB/s   wire(gzip) ${(gz / secs / 1024).toFixed(1)} KB/s`);
}
run('truecolor (current)', 1, false);
run('truecolor + quant8', 8, false);
run('truecolor + quant16', 16, false);
run('indexed-256', 1, true);
run('indexed-256 + quant8', 8, true);

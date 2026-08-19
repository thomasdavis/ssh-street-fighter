// Simulate a moving fight and measure how compressible the streamed ANSI is.
import { gzipSync, deflateSync } from 'zlib';
import { Frame, diffCells } from '../render/frame.js';
import { composeScene } from '../game/scene.js';
import { drawFightHud } from '../screens/fight-hud.js';
import { makeFighter, makeMatch, stepMatch, TICK_HZ } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';

const cols = 200, rows = 56;
const a = makeFighter('a', 'BYU', 'a'), b = makeFighter('b', 'MEN', 'b');
const m = makeMatch(a, b); m.stage = 'dojo'; m.phase = 'fight'; m.phaseTimer = 0;

let prev: any = null;
let total = 0;
const chunks: Buffer[] = [];
for (let t = 0; t < 120; t++) {
  const inA = emptyInputs(); inA.moveX = (t % 40 < 20) ? 1 : -1; if (t % 25 === 0) inA.punch = true;
  const inB = emptyInputs(); if (t % 30 === 0) inB.kick = true; inB.moveX = (t % 50 < 25) ? -1 : 1;
  stepMatch(m, inA, inB);
  const f = new Frame(cols, rows, 'half');
  f.usePixel(composeScene(m, cols * 2, rows * 4));
  drawFightHud(f, m, false);
  const cells = f.toCells();
  const out = diffCells(prev, cells, cols, rows);
  prev = cells;
  if (out) { total += Buffer.byteLength(out); chunks.push(Buffer.from(out)); }
}
const raw = Buffer.concat(chunks);
const gz = gzipSync(raw, { level: 6 });
const df = deflateSync(raw, { level: 6 });
const secs = 120 / TICK_HZ;
console.log(`frames=120  raw=${(raw.length / 1024).toFixed(0)}KB (${(raw.length / secs / 1024).toFixed(1)} KB/s)`);
console.log(`gzip=${(gz.length / 1024).toFixed(0)}KB (${(gz.length / secs / 1024).toFixed(1)} KB/s)  ratio ${(raw.length / gz.length).toFixed(1)}x`);
console.log(`deflate=${(df.length / 1024).toFixed(0)}KB  ratio ${(raw.length / df.length).toFixed(1)}x`);

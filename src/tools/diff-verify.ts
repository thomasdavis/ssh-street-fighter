// Correctness check for diffCells: apply the emitted ANSI to a tiny terminal
// emulator and confirm it reconstructs the exact target frame (no color bleed).
import { Frame, diffCells, type Cell } from '../render/frame.js';
import { composeScene } from '../game/scene.js';
import { drawFightHud } from '../screens/fight-hud.js';
import { makeFighter, makeMatch, stepMatch } from '../game/engine.js';
import { emptyInputs } from '../game/types.js';
import { index256ToRgb, snap256, rgb } from '../render/pixel.js';

const cols = 120, rows = 40;
const INDEXED = process.argv.includes('--indexed');
type TC = { ch: string; fg: [number, number, number]; bg: [number, number, number]; bold: boolean };
function applyAnsi(grid: TC[], ansi: string): void {
  let cx = 0, cy = 0, fg: [number, number, number] = [0, 0, 0], bg: [number, number, number] = [0, 0, 0], bold = false;
  let i = 0;
  while (i < ansi.length) {
    if (ansi[i] === '\x1b' && ansi[i + 1] === '[') {
      const m = /^\x1b\[([0-9;]*)([Hm])/.exec(ansi.slice(i));
      if (m) {
        const params = m[1]!.split(';');
        if (m[2] === 'H') { cy = (parseInt(params[0] || '1', 10) || 1) - 1; cx = (parseInt(params[1] || '1', 10) || 1) - 1; }
        else { // SGR
          let k = 0;
          while (k < params.length) {
            const p = params[k];
            if (p === '1') { bold = true; k++; }
            else if (p === '22') { bold = false; k++; }
            else if (p === '0' || p === '') { fg = [0, 0, 0]; bg = [0, 0, 0]; bold = false; k++; }
            else if (p === '38' && params[k + 1] === '2') { fg = [+params[k + 2]!, +params[k + 3]!, +params[k + 4]!]; k += 5; }
            else if (p === '48' && params[k + 1] === '2') { bg = [+params[k + 2]!, +params[k + 3]!, +params[k + 4]!]; k += 5; }
            else if (p === '38' && params[k + 1] === '5') { const c = index256ToRgb(+params[k + 2]!); fg = [c.r, c.g, c.b]; k += 3; }
            else if (p === '48' && params[k + 1] === '5') { const c = index256ToRgb(+params[k + 2]!); bg = [c.r, c.g, c.b]; k += 3; }
            else k++;
          }
        }
        i += m[0].length; continue;
      }
    }
    const ch = ansi[i]!;
    if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) grid[cy * cols + cx] = { ch, fg: [...fg], bg: [...bg], bold };
    cx++; i++;
  }
}
function toTC(cells: Cell[]): TC[] {
  return cells.map((c) => {
    const fg = INDEXED ? snap256(c.fg) : c.fg, bg = INDEXED ? snap256(c.bg) : c.bg;
    return { ch: c.ch, fg: [fg.r, fg.g, fg.b] as [number, number, number], bg: [bg.r, bg.g, bg.b] as [number, number, number], bold: c.bold };
  });
}
void rgb;
function eq(a: TC, b: TC): boolean { return a.ch === b.ch && a.bold === b.bold && a.fg.join() === b.fg.join() && a.bg.join() === b.bg.join(); }

const a = makeFighter('a', 'BYU', 'a'), b = makeFighter('b', 'MEN', 'b');
const m = makeMatch(a, b); m.stage = 'dojo'; m.phase = 'fight'; m.phaseTimer = 0;
const term: TC[] = new Array(cols * rows).fill(0).map(() => ({ ch: ' ', fg: [0, 0, 0] as [number, number, number], bg: [0, 0, 0] as [number, number, number], bold: false }));
let prev: Cell[] | null = null;
let mismatches = 0, checked = 0;
for (let t = 0; t < 40; t++) {
  const inA = emptyInputs(); inA.moveX = t % 30 < 15 ? 1 : -1; if (t % 10 === 0) inA.punch = true;
  stepMatch(m, inA, emptyInputs());
  const f = new Frame(cols, rows, 'half');
  f.usePixel(composeScene(m, cols * 2, rows * 4));
  drawFightHud(f, m, false);
  const cells = f.toCells();
  applyAnsi(term, diffCells(prev, cells, cols, rows, INDEXED));
  prev = cells;
  const want = toTC(cells);
  for (let i = 0; i < term.length; i++) { checked++; if (!eq(term[i]!, want[i]!)) mismatches++; }
}
console.log(`checked ${checked} cells over 40 frames; mismatches: ${mismatches}`);
console.log(mismatches === 0 ? 'DIFF VERIFY: PASS (reconstruction exact)' : 'DIFF VERIFY: FAIL');
process.exit(mismatches === 0 ? 0 : 1);

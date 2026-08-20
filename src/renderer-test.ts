// Unit-tests the OctantRenderer: full paint on first frame + after reset, empty
// output when nothing changed (change-detection), and a diff when it does.
import { Frame } from './render/frame.js';
import { rgb } from './render/pixel.js';
import { OctantRenderer } from './render/renderer.js';

let pass = true;
const check = (n: string, c: boolean, x = ''): void => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

const COLS = 40, ROWS = 12;
function frame(label: string): Frame {
  const f = new Frame(COLS, ROWS, 'quadrant');
  f.gradient(rgb(20, 20, 30), rgb(40, 30, 50));
  f.write(2, 2, label, rgb(240, 240, 240));
  return f;
}

const r = new OctantRenderer(1, false);
const first = r.render(frame('HELLO'), COLS, ROWS);
check('first frame paints', first.length > 0);
const second = r.render(frame('HELLO'), COLS, ROWS);
check('unchanged frame → empty (change-detected)', second === '');
const changed = r.render(frame('WORLD'), COLS, ROWS);
check('changed frame → non-empty diff', changed.length > 0);
const same = r.render(frame('WORLD'), COLS, ROWS);
check('re-settled → empty again', same === '');
r.reset();
const afterReset = r.render(frame('WORLD'), COLS, ROWS);
check('reset forces a full repaint', afterReset.length > 0 && afterReset.length >= changed.length);

console.log(`\nRENDERER TEST: ${pass ? 'PASS' : 'FAIL'}`);
if (!pass) process.exit(1);

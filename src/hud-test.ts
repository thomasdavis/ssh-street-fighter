// The fight HUD must remain textual and complete as terminal font zoom changes
// the available cell grid. Exercise every responsive tier down to our 24x12
// minimum and ensure both fighters, timer, health, announcement and exits exist.
import { Frame } from './render/frame.js';
import { composeScene } from './game/scene.js';
import { drawFightHud } from './screens/fight-hud.js';
import { makeFighter, makeMatch } from './game/engine.js';

const a = makeFighter('a', 'BYU', 'a');
const b = makeFighter('b', 'MEN', 'b');
const match = makeMatch(a, b);
match.phase = 'fight'; match.message = 'ROUND 1'; match.roundTime = 47;
a.hp = 72; b.hp = 38; a.wins = 1;

let failed = false;
for (const [cols, rows] of [[24, 12], [34, 14], [44, 16], [68, 20], [96, 28], [160, 48]] as const) {
  const frame = new Frame(cols, rows, 'octant');
  frame.usePixel(composeScene(match, cols * 2, rows * 4));
  drawFightHud(frame, match, false);
  const cells = frame.toCells();
  const lines = Array.from({ length: rows }, (_, y) => cells.slice(y * cols, (y + 1) * cols).map((cell) => cell.ch).join(''));
  const top = lines[0] ?? '', bars = lines[1] ?? '', all = lines.join('\n'), footer = lines[rows - 1] ?? '';
  const checks = {
    fighters: top.includes('BYU') && top.includes('MEN'),
    timer: top.includes('47'),
    health: bars.includes('█') && bars.includes('░'),
    announcement: all.includes('ROUND 1'),
    essential_controls: footer.includes('?') && footer.includes('Q'),
  };
  const ok = Object.values(checks).every(Boolean);
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${cols}x${rows}  ${JSON.stringify(checks)}`);
}
console.log(failed ? 'HUD RESPONSIVE TEST: FAIL' : 'HUD RESPONSIVE TEST: PASS');
process.exit(failed ? 1 : 0);

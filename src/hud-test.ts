// The fight HUD must remain complete as terminal font zoom changes the available
// pixel-surface grid. Record the semantic draw calls while delegating to the real
// pixel renderer, then verify every supported responsive tier keeps the fighters,
// timer, health, announcement, and essential controls.
import { Frame } from './render/frame.js';
import { composeScene } from './game/scene.js';
import { drawFightHudSurface } from './screens/fight-hud.js';
import { makeFighter, makeMatch } from './game/engine.js';
import { makeSurface, minTerminal, pixelReady, type PanelOpts, type Rect, type Surface, type TextOpts } from './ui/surface.js';
import { THEME } from './ui/theme.js';
import type { RGB } from './render/pixel.js';

class HudProbe implements Surface {
  texts: string[] = [];
  headings: string[] = [];
  fills: RGB[] = [];

  constructor(private inner: Surface) {}
  get cols(): number { return this.inner.cols; }
  get rows(): number { return this.inner.rows; }
  get kind(): 'cell' | 'pixel' { return this.inner.kind; }
  gradient(top: RGB, bot: RGB): void { this.inner.gradient(top, bot); }
  fill(x: number, y: number, w: number, h: number, color: RGB): void {
    this.fills.push(color);
    this.inner.fill(x, y, w, h, color);
  }
  text(x: number, y: number, str: string, o?: TextOpts): void {
    this.texts.push(str);
    this.inner.text(x, y, str, o);
  }
  panel(x: number, y: number, w: number, h: number, o?: PanelOpts): Rect { return this.inner.panel(x, y, w, h, o); }
  heading(y: number, str: string, color: RGB, scale?: number): void {
    this.headings.push(str);
    this.inner.heading(y, str, color, scale);
  }
  headingHeight(scale?: number): number { return this.inner.headingHeight(scale); }
  width(str: string): number { return this.inner.width(str); }
  unitX(subPx: number): number { return this.inner.unitX(subPx); }
  unitY(subPy: number): number { return this.inner.unitY(subPy); }
}

const sameColor = (a: RGB, b: RGB): boolean => a.r === b.r && a.g === b.g && a.b === b.b;

const a = makeFighter('a', 'BYU', 'a');
const b = makeFighter('b', 'MEN', 'b');
const match = makeMatch(a, b);
match.phase = 'fight'; match.message = 'ROUND 1'; match.roundTime = 47;
a.hp = 72; b.hp = 38; a.wins = 1;

let failed = false;
const minimum = minTerminal();
const sizes = [[minimum.cols, minimum.rows], [160, 55], [240, 80], [320, 120]] as const;
for (const [cols, rows] of sizes) {
  const frame = new Frame(cols, rows, 'octant');
  frame.usePixel(composeScene(match, cols * 2, rows * 4));
  const probe = new HudProbe(makeSurface(frame));
  drawFightHudSurface(probe, match, false);
  const text = probe.texts.join(' ');
  const checks = {
    supported: pixelReady(cols, rows) && probe.kind === 'pixel',
    fighters: text.includes('BYU') && text.includes('MEN'),
    timer: text.includes('47'),
    health: probe.fills.some((c) => sameColor(c, THEME.hpFull)) && probe.fills.some((c) => sameColor(c, THEME.accent)),
    announcement: probe.headings.includes('ROUND 1'),
    essential_controls: probe.texts.includes('?') && probe.texts.includes('Q'),
  };
  const ok = Object.values(checks).every(Boolean);
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${cols}x${rows}  ${JSON.stringify(checks)}`);
}
console.log(failed ? 'HUD RESPONSIVE TEST: FAIL' : 'HUD RESPONSIVE TEST: PASS');
process.exit(failed ? 1 : 0);

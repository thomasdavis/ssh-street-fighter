// Shown instead of a screen when the terminal is too small for the pixel UI to
// fit. Drawn as crisp one-cell text so it stays readable at any (small) size.
import type { Frame } from '../render/frame.js';
import { minTerminal } from './surface.js';
import { rgb } from '../render/pixel.js';
import { THEME } from './theme.js';

const BG_TOP = rgb(24, 12, 12), BG_BOT = rgb(48, 16, 20);

export function drawTooSmall(f: Frame): void {
  f.gradient(BG_TOP, BG_BOT);
  const need = minTerminal();
  const lines: [string, ReturnType<typeof rgb>, boolean][] = [
    ['TERMINAL TOO SMALL', THEME.accent, true],
    ['', THEME.text, false],
    [`your size:  ${f.cols} x ${f.rows}`, THEME.text, false],
    [`need about: ${need.cols} x ${need.rows} or larger`, THEME.good, true],
    ['', THEME.text, false],
    ['ZOOM OUT (make the font smaller) or', THEME.textDim, false],
    ['enlarge the window until this clears.', THEME.textDim, false],
  ];
  const top = Math.max(0, Math.floor((f.rows - lines.length) / 2));
  for (let i = 0; i < lines.length; i++) {
    const [text, color, bold] = lines[i]!;
    if (text) f.center(top + i, text, color, undefined, bold);
  }
}

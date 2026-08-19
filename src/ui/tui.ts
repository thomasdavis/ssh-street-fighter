// Cell-based drawing helpers for the CellSurface backend (SF_UI=cell) — crisp
// one-terminal-cell panels and block-letter headings. The pixel UI (the default)
// uses ui/surface.ts + ui/widgets.ts instead; these are only the fallback path.
import type { Frame } from '../render/frame.js';
import type { RGB } from '../render/pixel.js';
import { glyphRows } from '../render/font.js';
import { THEME } from './theme.js';

const B = { // box-drawing sets
  single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', lt: '├', rt: '┤' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', lt: '╠', rt: '╣' },
  round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', lt: '├', rt: '┤' },
};

export interface Rect { x: number; y: number; w: number; h: number; }
export interface BoxOpts { fg?: RGB; bg?: RGB; title?: string; titleFg?: RGB; style?: 'single' | 'double' | 'round'; }

/** Draw a bordered box (optionally titled). Returns the inner content rect. */
export function box(f: Frame, x: number, y: number, w: number, h: number, o: BoxOpts = {}): Rect {
  const s = B[o.style ?? 'round'];
  const fg = o.fg ?? THEME.panelBorder;
  const bg = o.bg ?? THEME.panel;
  f.fill(x, y, w, h, bg);
  f.putChar(x, y, s.tl, fg, bg, true); f.putChar(x + w - 1, y, s.tr, fg, bg, true);
  f.putChar(x, y + h - 1, s.bl, fg, bg, true); f.putChar(x + w - 1, y + h - 1, s.br, fg, bg, true);
  for (let i = 1; i < w - 1; i++) { f.putChar(x + i, y, s.h, fg, bg, true); f.putChar(x + i, y + h - 1, s.h, fg, bg, true); }
  for (let i = 1; i < h - 1; i++) { f.putChar(x, y + i, s.v, fg, bg, true); f.putChar(x + w - 1, y + i, s.v, fg, bg, true); }
  let top = y + 1;
  if (o.title) {
    const label = ` ${o.title} `;
    f.write(x + 2, y, label, o.titleFg ?? THEME.panelTitle, bg, true);
    top = y + 2;
  }
  return { x: x + 2, y: top, w: w - 4, h: h - (top - y) - 1 };
}

/** Big block-letter text (each glyph pixel = one █ cell → crisp). */
export function bigText(f: Frame, x: number, y: number, str: string, fg: RGB, bg: RGB, scale = 1): void {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = glyphRows(ch);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy]![gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) f.putChar(cx + gx * scale + sx, y + gy * scale + sy, '█', fg, bg, false);
      }
    }
    cx += (3 + 1) * scale;
  }
}
export function bigWidth(str: string, scale = 1): number { return str.length * (3 + 1) * scale - scale; }

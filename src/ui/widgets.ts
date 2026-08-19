// Reusable widgets composed from the Surface primitives. Written once, they work
// on both the crisp-cell and constant-size-pixel backends, so every screen (and
// future feature) shares the same building blocks.
//
// NOTE: the pixel font only has A–Z 0–9 and a few symbols (! - : . / % # ( ) + ,)
// — no box/bar/arrow glyphs. So bars, dividers, cursors and markers here are drawn
// with fills, never block characters, and separators use '-' / '/'.
import type { Surface, TextOpts } from './surface.js';
import { THEME } from './theme.js';
import type { RGB } from '../render/pixel.js';

/** Centered body text on a row. */
export function centerText(s: Surface, y: number, str: string, o: TextOpts = {}): void {
  s.text(Math.max(0, Math.floor((s.cols - str.length) / 2)), y, str, o);
}

/** Thin horizontal rule (a short fill, not box glyphs). */
export function divider(s: Surface, x: number, y: number, w: number, color: RGB = THEME.panelBorder): void {
  s.fill(x, y + 0.35, w, 0.18, color);
}

/** A segmented meter: `filled` of `segs` lit. Drawn as fills so it works in pixel mode. */
export function meter(s: Surface, x: number, y: number, segs: number, filled: number, onColor: RGB, offColor: RGB = THEME.textDim): void {
  for (let i = 0; i < segs; i++) s.fill(x + i * 1.1, y + 0.1, 0.8, 0.8, i < filled ? onColor : offColor);
}

export interface TableCol { header: string; x: number; }
/** Header row + rule + data rows, with an optional highlighted row. Columns are
 *  placed at unit offsets from x. */
export function table(s: Surface, x: number, y: number, w: number, colX: number[], headers: string[], rows: string[][], highlight = -1): void {
  for (let c = 0; c < headers.length; c++) s.text(x + colX[c]!, y, headers[c]!, { color: THEME.accent2, bold: true });
  divider(s, x, y + 1, w);
  for (let r = 0; r < rows.length; r++) {
    const ry = y + 2 + r;
    const hl = r === highlight;
    if (hl) s.fill(x - 0.5, ry, w + 1, 1, THEME.select);
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) s.text(x + colX[c]!, ry, row[c]!, { color: hl ? THEME.selectText : THEME.text, bold: hl });
  }
}

export interface InputOpts { label?: string; focus?: boolean; frame?: number; placeholder?: string; }
/** Single-line text field: a bordered box with the value + a blinking caret. */
export function inputField(s: Surface, x: number, y: number, w: number, value: string, o: InputOpts = {}): void {
  if (o.label) { s.text(x, y, o.label, { color: THEME.textDim }); y += 1; }
  const inner = s.panel(x, y, w, 3, { fill: THEME.shadow, border: o.focus ? THEME.accent : THEME.panelBorder });
  const shown = value.length ? value : (o.placeholder ?? '');
  s.text(inner.x, inner.y, shown, { color: value.length ? THEME.text : THEME.textDim, bold: value.length > 0 });
  if (o.focus && Math.floor((o.frame ?? 0) / 8) % 2 === 0) s.fill(inner.x + value.length + 0.1, inner.y, 0.35, 1, THEME.accent);
}

export interface MenuOpts { disabled?: number[]; gap?: number; }
/** Vertical menu list; the selected row gets a highlight bar + ▶ marker. */
export function menuList(s: Surface, x: number, y: number, w: number, items: string[], selected: number, o: MenuOpts = {}): void {
  const gap = o.gap ?? 1;
  for (let i = 0; i < items.length; i++) {
    const ry = y + i * (1 + gap);
    const sel = i === selected;
    const disabled = o.disabled?.includes(i);
    if (sel) s.fill(x, ry, w, 1, THEME.select);
    const color = disabled ? THEME.textDim : sel ? THEME.selectText : THEME.text;
    s.text(x + 1, ry, sel ? '▶' : ' ', { color: THEME.accent });
    s.text(x + 3, ry, items[i]!, { color, bold: sel });
  }
}

/** Centered footer hints: [["ENTER","SELECT"],["?","HELP"]]. */
export function hints(s: Surface, y: number, list: [string, string][]): void {
  const parts = list.map(([k, l]) => `${k} ${l}`);
  const total = parts.join('   ').length;
  let x = Math.max(0, Math.floor((s.cols - total) / 2));
  for (const [k, l] of list) {
    s.text(x, y, k, { color: THEME.accent, bold: true }); x += k.length + 1;
    s.text(x, y, l, { color: THEME.textDim }); x += l.length + 3;
  }
}

/** A label/value line: "WINS   12". */
export function stat(s: Surface, x: number, y: number, label: string, value: string, valueColor = THEME.text): void {
  s.text(x, y, label, { color: THEME.textDim });
  s.text(x + Math.max(label.length + 1, 8), y, value, { color: valueColor, bold: true });
}

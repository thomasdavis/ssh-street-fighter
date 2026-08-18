// Reusable widgets composed from the Surface primitives. Written once, they work
// on both the crisp-cell and constant-size-pixel backends, so every screen (and
// future feature) shares the same building blocks.
import type { Surface } from './surface.js';
import { THEME } from './theme.js';

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

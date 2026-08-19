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

// Spacing scale (in layout units). Every component spaces its content on this
// rhythm so pages built from these widgets share the same vertical cadence and
// look consistent without per-screen tuning. In pixel mode `bold` is a no-op
// (the font has no weight), so hierarchy comes from COLOR + SPACING, never weight.
export const SP = {
  line: 1.25,     // dense paragraph leading
  row: 1.55,      // scannable list / table row pitch
  gap: 1.0,       // small gap between elements
  section: 2.1,   // gap between sections / below a title
};

/** Centered body text on a row. */
export function centerText(s: Surface, y: number, str: string, o: TextOpts = {}): void {
  s.text(Math.max(0, Math.floor((s.cols - str.length) / 2)), y, str, o);
}

/** Thin horizontal rule (a short fill, not box glyphs). Optional left/right inset. */
export function divider(s: Surface, x: number, y: number, w: number, color: RGB = THEME.panelBorder, inset = 0): void {
  s.fill(x + inset, y + 0.4, w - inset * 2, 0.14, color);
}

/** A small section label (accent) with a rule under it. Returns the y where the
 *  section's content should start, so callers stay on the spacing rhythm. */
export function section(s: Surface, x: number, y: number, w: number, title: string, color: RGB = THEME.accent2): number {
  s.text(x, y, title, { color });
  divider(s, x, y + 1.0, w);
  return y + SP.row + 0.35;
}

export interface FieldOpts { labelW?: number; pitch?: number; labelColor?: RGB; valueColor?: RGB; }
/** A stack of label/value rows on the row rhythm (bindings, stats, specs).
 *  Returns the y after the last row. Label is accent, value is body text. */
export function fieldRows(s: Surface, x: number, y: number, entries: [string, string][], o: FieldOpts = {}): number {
  const pitch = o.pitch ?? SP.row;
  const labelW = o.labelW ?? Math.max(1, ...entries.map((e) => e[0].length)) + 2;
  let cy = y;
  for (const [k, v] of entries) {
    s.text(x, cy, k, { color: o.labelColor ?? THEME.accent });
    if (v) s.text(x + labelW, cy, v, { color: o.valueColor ?? THEME.text });
    cy += pitch;
  }
  return cy;
}

/** A segmented meter: `filled` of `segs` lit. Drawn as fills so it works in pixel mode. */
export function meter(s: Surface, x: number, y: number, segs: number, filled: number, onColor: RGB, offColor: RGB = THEME.textDim): void {
  for (let i = 0; i < segs; i++) s.fill(x + i * 1.1, y + 0.1, 0.8, 0.8, i < filled ? onColor : offColor);
}

/** A fighter health bar: full track + colored fill (red→gold→yellow by pct), with
 *  ten chunk ticks. `mirror` fills from the right (player 2). All fills — no glyphs. */
export function healthBar(s: Surface, x: number, y: number, w: number, pct: number, mirror = false): void {
  const p = Math.max(0, Math.min(1, pct));
  const h = 0.85;
  s.fill(x, y, w, h, THEME.shadow);                                   // empty track
  const fw = w * p;
  const col = p <= 0.3 ? THEME.hpLow : p <= 0.55 ? THEME.accent : THEME.hpFull;
  if (fw > 0) s.fill(mirror ? x + w - fw : x, y, fw, h, col);
  for (let i = 1; i < 10; i++) s.fill(x + (i * w) / 10, y, 0.07, h, THEME.shadow);   // segment ticks
}

/** A big centered announcement over a fitted shadow band (ROUND/FIGHT/KO…).
 *  Heading text is ~2 units per char, so the band is sized and centered to match. */
export function banner(s: Surface, y: number, text: string, color: RGB = THEME.accent): void {
  if (!text) return;
  const w = Math.min(s.cols, text.length * 2 + 2);
  const x = Math.floor((s.cols - w) / 2);
  s.fill(x, y - 0.25, w, s.headingHeight(1) + 0.35, THEME.shadow);
  s.heading(y, text, color, 1);
}

export interface TableOpts { pitch?: number; colColors?: (RGB | undefined)[]; }
/** Header row + rule + data rows on the row rhythm, with an optional highlighted
 *  (padded) row. `colColors[c]` sets per-column colour for hierarchy (e.g. a dim
 *  rank column, an accent ELO column). Columns are placed at unit offsets from x.
 *  Returns the y after the last row. */
export function table(s: Surface, x: number, y: number, w: number, colX: number[], headers: string[], rows: string[][], highlight = -1, o: TableOpts = {}): number {
  const pitch = o.pitch ?? SP.row;
  for (let c = 0; c < headers.length; c++) s.text(x + colX[c]!, y, headers[c]!, { color: THEME.accent2 });
  divider(s, x, y + 1.05, w);
  const y0 = y + SP.row + 0.55;   // header → first row gap
  for (let r = 0; r < rows.length; r++) {
    const ry = y0 + r * pitch;
    const hl = r === highlight;
    if (hl) s.fill(x - 0.7, ry - 0.3, w + 1.4, 1.2, THEME.select);
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const base = o.colColors?.[c] ?? (c === 0 ? THEME.textDim : THEME.text);
      s.text(x + colX[c]!, ry, row[c]!, { color: hl ? THEME.selectText : base });
    }
  }
  return y0 + rows.length * pitch;
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

export interface MenuOpts { disabled?: number[]; gap?: number; pitch?: number; }
/** Vertical menu list; the selected row gets a padded highlight bar + ▶ marker.
 *  Row pitch defaults to the row rhythm (or 1+gap for legacy callers). */
export function menuList(s: Surface, x: number, y: number, w: number, items: string[], selected: number, o: MenuOpts = {}): void {
  const pitch = o.pitch ?? (o.gap != null ? 1 + o.gap : SP.row);
  for (let i = 0; i < items.length; i++) {
    const ry = y + i * pitch;
    const sel = i === selected;
    const disabled = o.disabled?.includes(i);
    if (sel) s.fill(x - 0.3, ry - 0.3, w + 0.6, 1.2, THEME.select);
    const color = disabled ? THEME.textDim : sel ? THEME.selectText : THEME.text;
    s.text(x + 1, ry, sel ? '▶' : ' ', { color: sel ? THEME.selectText : THEME.accent });
    s.text(x + 3, ry, items[i]!, { color });
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

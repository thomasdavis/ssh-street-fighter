// Hybrid terminal frame: a grid of terminal CELLS. Each cell is either a real
// text character (crisp — the terminal's own font) or, where no text is set,
// an octant pixel block sampled from an optional pixel layer. HUD/menus use
// text cells (sharp at any size); the game viewport uses the pixel layer.
import { createGrid, octantCell, halfCell, halfCellInto, quantize, rgbTo256, rgb, type PixelGrid, type RGB } from './pixel.js';

const ESC = '\x1b';
const DEFAULT_BG: RGB = rgb(10, 9, 18);

export type RenderMode = 'octant' | 'half';

export interface TextCell { ch: string; fg: RGB; bg: RGB; bold: boolean; }

export class Frame {
  readonly cols: number;
  readonly rows: number;
  readonly mode: RenderMode;
  private text: (TextCell | null)[];
  private _pixel: PixelGrid | null = null;

  constructor(cols: number, rows: number, mode: RenderMode = 'octant') {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.mode = mode;
    this.text = new Array(this.cols * this.rows).fill(null);
  }

  /** Get (creating on first use) the pixel layer, sized 2*cols x 4*rows. */
  pixel(): PixelGrid {
    if (!this._pixel) this._pixel = createGrid(this.cols * 2, this.rows * 4, rgb(0, 0, 0));
    return this._pixel;
  }
  /** Install a pre-built pixel layer (must be 2*cols x 4*rows). */
  usePixel(grid: PixelGrid): void { this._pixel = grid; }
  hasPixel(): boolean { return this._pixel !== null; }

  private idx(x: number, y: number): number { return y * this.cols + x; }

  /** Set a cell. If bg is omitted, keep whatever background is already there
   *  (so text can sit on a gradient without leaving a solid rectangle). */
  putChar(x: number, y: number, ch: string, fg: RGB, bg?: RGB, bold = false): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = this.idx(x, y);
    const keep = bg ?? this.text[i]?.bg ?? DEFAULT_BG;
    this.text[i] = { ch, fg, bg: keep, bold };
  }

  write(x: number, y: number, str: string, fg: RGB, bg?: RGB, bold = false): void {
    for (let i = 0; i < str.length; i++) this.putChar(x + i, y, str[i]!, fg, bg, bold);
  }

  center(y: number, str: string, fg: RGB, bg?: RGB, bold = false): void {
    this.write(Math.max(0, Math.floor((this.cols - str.length) / 2)), y, str, fg, bg, bold);
  }

  fill(x: number, y: number, w: number, h: number, bg: RGB): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.putChar(xx, yy, ' ', bg, bg, false);
  }

  /** Darken every cell (for modal overlays). */
  dim(factor = 0.35): void {
    for (let i = 0; i < this.text.length; i++) {
      const c = this.text[i];
      if (!c) continue;
      c.fg = rgb(Math.round(c.fg.r * factor), Math.round(c.fg.g * factor), Math.round(c.fg.b * factor));
      c.bg = rgb(Math.round(c.bg.r * factor), Math.round(c.bg.g * factor), Math.round(c.bg.b * factor));
    }
  }

  /** Vertical gradient background across the whole frame (text-cell based). */
  gradient(top: RGB, bot: RGB): void {
    for (let y = 0; y < this.rows; y++) {
      const t = this.rows > 1 ? y / (this.rows - 1) : 0;
      const c = rgb(
        Math.round(top.r + (bot.r - top.r) * t),
        Math.round(top.g + (bot.g - top.g) * t),
        Math.round(top.b + (bot.b - top.b) * t));
      for (let x = 0; x < this.cols; x++) this.putChar(x, y, ' ', c, c, false);
    }
  }

  // ---------- composite + diff ----------
  private rowString(y: number): string {
    let out = '';
    let lf: RGB | null = null, lb: RGB | null = null, lbold: boolean | null = null;
    for (let x = 0; x < this.cols; x++) {
      const t = this.text[this.idx(x, y)];
      let ch: string, fg: RGB, bg: RGB, bold: boolean;
      if (t) { ch = t.ch; fg = t.fg; bg = t.bg; bold = t.bold; }
      else if (this._pixel) { const c = (this.mode === 'half' ? halfCell : octantCell)(this._pixel, x * 2, y * 4); ch = c.char; fg = c.fg; bg = c.bg; bold = false; }
      else { ch = ' '; fg = DEFAULT_BG; bg = DEFAULT_BG; bold = false; }
      if (!lf || !lb || lbold === null || lf.r !== fg.r || lf.g !== fg.g || lf.b !== fg.b || lb.r !== bg.r || lb.g !== bg.g || lb.b !== bg.b || lbold !== bold) {
        out += `${ESC}[0${bold ? ';1' : ''};38;2;${fg.r};${fg.g};${fg.b};48;2;${bg.r};${bg.g};${bg.b}m`;
        lf = fg; lb = bg; lbold = bold;
      }
      out += ch;
    }
    return out + `${ESC}[0m`;
  }

  /** Render all rows to strings. */
  toRows(): string[] {
    const rows: string[] = new Array(this.rows);
    for (let y = 0; y < this.rows; y++) rows[y] = this.rowString(y);
    return rows;
  }

  /** Resolve every terminal cell (text wins over the pixel layer). `colorStep`
   * collapses near-identical truecolors before diffing, improving compression.
   *
   * Pass a `reuse` buffer (from a prior toCells of the SAME size) to fill it in
   * place with zero allocation — the render loop double-buffers two of these so
   * a busy fight allocates nothing per frame (huge GC relief at scale). */
  toCells(colorStep = 1, reuse?: Cell[]): Cell[] {
    const n = this.cols * this.rows;
    const reusing = !!reuse && reuse.length === n;
    const out: Cell[] = reusing ? reuse! : new Array(n);
    const step = colorStep > 1 ? colorStep : 0;
    const qc = (dst: RGB, src: RGB) => {
      if (step) { dst.r = Math.min(255, Math.round(src.r / step) * step); dst.g = Math.min(255, Math.round(src.g / step) * step); dst.b = Math.min(255, Math.round(src.b / step) * step); }
      else { dst.r = src.r; dst.g = src.g; dst.b = src.b; }
    };
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = this.idx(x, y);
        if (!reusing) {
          // allocating path (first frame / one-off callers)
          const t = this.text[i];
          const q = (c: RGB) => step ? quantize(c, step) : { r: c.r, g: c.g, b: c.b };
          if (t) { out[i] = { ch: t.ch, fg: q(t.fg), bg: q(t.bg), bold: t.bold }; continue; }
          if (this._pixel) { const c = (this.mode === 'half' ? halfCell : octantCell)(this._pixel, x * 2, y * 4); out[i] = { ch: c.char, fg: q(c.fg), bg: q(c.bg), bold: false }; continue; }
          out[i] = { ch: ' ', fg: { ...DEFAULT_BG }, bg: { ...DEFAULT_BG }, bold: false };
          continue;
        }
        // reuse path: mutate the existing cell + its RGB objects in place
        const cell = out[i]!;
        const t = this.text[i];
        if (t) { cell.ch = t.ch; cell.bold = t.bold; qc(cell.fg, t.fg); qc(cell.bg, t.bg); continue; }
        if (this._pixel) {
          cell.bold = false;
          if (this.mode === 'half') { cell.ch = halfCellInto(this._pixel, x * 2, y * 4, cell.fg, cell.bg); if (step) { qc(cell.fg, cell.fg); qc(cell.bg, cell.bg); } }
          else { const c = octantCell(this._pixel, x * 2, y * 4); cell.ch = c.char; qc(cell.fg, c.fg); qc(cell.bg, c.bg); }
          continue;
        }
        cell.ch = ' '; cell.bold = false; qc(cell.fg, DEFAULT_BG); qc(cell.bg, DEFAULT_BG);
      }
    }
    return out;
  }
}

export interface Cell { ch: string; fg: RGB; bg: RGB; bold: boolean; }
function cellEq(a: Cell, b: Cell): boolean {
  return a.ch === b.ch && a.bold === b.bold &&
    a.fg.r === b.fg.r && a.fg.g === b.fg.g && a.fg.b === b.fg.b &&
    a.bg.r === b.bg.r && a.bg.g === b.bg.g && a.bg.b === b.bg.b;
}

/**
 * Cell-level diff: only the columns that actually changed are redrawn (with an
 * absolute cursor move per run). Short unchanged gaps are merged into a run so
 * we don't pay a cursor-move+SGR reset for a 1-2 cell gap. This is what keeps a
 * small moving sprite cheap to stream over a detailed static background.
 */
export function diffCells(prev: Cell[] | null, next: Cell[], cols: number, rows: number, indexed = false): string {
  const GAP = 4;
  let out = '';
  // SGR state is tracked across runs/rows (cursor moves don't reset it), so we
  // emit only the channel(s) that changed. `indexed` uses 8-bit palette codes
  // (38;5;N) — shorter, fewer distinct colors, at the cost of mild banding.
  let lfi = -1, lbi = -1, lbold: boolean | null = null;
  const fgId = (c: Cell) => indexed ? rgbTo256(c.fg.r, c.fg.g, c.fg.b) : ((c.fg.r << 16) | (c.fg.g << 8) | c.fg.b);
  const bgId = (c: Cell) => indexed ? rgbTo256(c.bg.r, c.bg.g, c.bg.b) : ((c.bg.r << 16) | (c.bg.g << 8) | c.bg.b);
  for (let y = 0; y < rows; y++) {
    const base = y * cols;
    let x = 0;
    while (x < cols) {
      if (prev && cellEq(prev[base + x]!, next[base + x]!)) { x++; continue; }
      let end = x + 1, gap = 0, j = x + 1;
      while (j < cols) {
        if (!prev || !cellEq(prev[base + j]!, next[base + j]!)) { end = j + 1; gap = 0; }
        else if (++gap > GAP) break;
        j++;
      }
      out += `${ESC}[${y + 1};${x + 1}H`;
      for (let k = x; k < end; k++) {
        const c = next[base + k]!;
        const fi = fgId(c), bi = bgId(c), bc = lbold !== c.bold;
        if (fi !== lfi || bi !== lbi || bc) {
          let s = '';
          if (bc) s += c.bold ? '1' : '22';
          if (fi !== lfi) s += `${s ? ';' : ''}${indexed ? `38;5;${fi}` : `38;2;${c.fg.r};${c.fg.g};${c.fg.b}`}`;
          if (bi !== lbi) s += `${s ? ';' : ''}${indexed ? `48;5;${bi}` : `48;2;${c.bg.r};${c.bg.g};${c.bg.b}`}`;
          out += `${ESC}[${s}m`;
          lfi = fi; lbi = bi; lbold = c.bold;
        }
        out += c.ch;
      }
      x = end;
    }
  }
  return out;
}

/** Diff two rendered frames; emit only changed rows (absolute cursor moves). */
export function diffRows(prev: string[] | null, next: string[]): string {
  let out = '';
  for (let i = 0; i < next.length; i++) {
    if (!prev || prev[i] !== next[i]) out += `${ESC}[${i + 1};1H${next[i]}`;
  }
  return out;
}

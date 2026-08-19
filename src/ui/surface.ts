// A Surface is the single drawing target every screen renders against. Screens
// lay out in abstract "units" (a character grid) and never care how it's drawn —
// the backend decides:
//
//   • CellSurface  — crisp one-cell terminal text. Used on small terminals where
//                    a pixel font would be too coarse. Units = terminal cells.
//   • PixelSurface — the maldoror pixel font drawn into the graphics layer at a
//                    CONSTANT physical size (sharper the more you zoom out). Used
//                    once the terminal is big enough to render it cleanly. Units =
//                    a virtual character grid whose cells are a fixed fraction of
//                    the screen.
//
// Because both expose the same unit-based API (cols/rows/text/fill/panel/…), a
// widget or screen is written ONCE and looks right at any zoom. This is the base
// every current and future UI (menus, lounge, leaderboard, help, HUD, and
// whatever non-game features come next) is built on.
import type { Frame } from '../render/frame.js';
import { fillRect, rgb, type PixelGrid, type RGB } from '../render/pixel.js';
import { drawTextPx, textPxWidth } from '../render/font.js';
import { box, bigText, bigWidth } from './tui.js';
import { THEME } from './theme.js';

export type Align = 'left' | 'center' | 'right';
export interface TextOpts { color?: RGB; bg?: RGB; bold?: boolean; }
export interface PanelOpts { title?: string; titleColor?: RGB; border?: RGB; fill?: RGB; }
export interface Rect { x: number; y: number; w: number; h: number; }

export interface Surface {
  readonly cols: number;          // width in layout units
  readonly rows: number;          // height in layout units
  readonly kind: 'cell' | 'pixel';
  gradient(top: RGB, bot: RGB): void;
  fill(x: number, y: number, w: number, h: number, color: RGB): void;
  text(x: number, y: number, str: string, o?: TextOpts): void;
  /** Bordered, optionally-titled panel. Returns the inner content rect (units). */
  panel(x: number, y: number, w: number, h: number, o?: PanelOpts): Rect;
  /** Big centered heading. `scale` ≥ 1. */
  heading(y: number, str: string, color: RGB, scale?: number): void;
  headingHeight(scale?: number): number;   // units tall
  width(str: string): number;              // width of body text in units (== length)
  /** Convert a pixel-layer sub-pixel coordinate to layout units (for overlays
   *  positioned over a rendered scene). The scene grid is 2*cols x 4*rows. */
  unitX(subPx: number): number;
  unitY(subPy: number): number;
}

// ---------- crisp one-cell backend ----------
class CellSurface implements Surface {
  readonly kind = 'cell' as const;
  constructor(private f: Frame) {}
  get cols(): number { return this.f.cols; }
  get rows(): number { return this.f.rows; }
  gradient(top: RGB, bot: RGB): void { this.f.gradient(top, bot); }
  fill(x: number, y: number, w: number, h: number, color: RGB): void {
    this.f.fill(Math.round(x), Math.round(y), Math.round(w), Math.round(h), color);
  }
  text(x: number, y: number, str: string, o: TextOpts = {}): void {
    this.f.write(Math.round(x), Math.round(y), str, o.color ?? THEME.text, o.bg, o.bold);
  }
  panel(x: number, y: number, w: number, h: number, o: PanelOpts = {}): Rect {
    return box(this.f, Math.round(x), Math.round(y), Math.round(w), Math.round(h),
      { title: o.title, titleFg: o.titleColor, fg: o.border, bg: o.fill, style: 'double' });
  }
  heading(y: number, str: string, color: RGB, scale = 1): void {
    bigText(this.f, Math.max(0, Math.floor((this.cols - bigWidth(str, scale)) / 2)), Math.round(y), str, color, THEME.bgTop, scale);
  }
  headingHeight(scale = 1): number { return 5 * scale; }
  width(str: string): number { return str.length; }
  unitX(subPx: number): number { return subPx / 2; }
  unitY(subPy: number): number { return subPy / 4; }
}

// ---------- constant-size pixel-font backend ----------
// 5x7 font metrics (in font-pixels): 6-wide advance, 9-tall line. The octant
// renderer is pixel-perfect, so a 1-sub-pixel font (cellPx=1) is already crisp —
// it just needs to be a legible physical size, which 5x7 is.
const PIXEL_UNIT = 0.0040;   // font-pixel size as a fraction of screen height
const CW = 6, LH = 9, GLYPH_H = 7;
class PixelSurface implements Surface {
  readonly kind = 'pixel' as const;
  private g: PixelGrid;
  private cellPx: number;
  private cw: number;        // sub-pixels per unit column
  private lh: number;        // sub-pixels per unit row
  readonly cols: number;
  readonly rows: number;
  constructor(f: Frame) {
    const pw = f.cols * 2, ph = f.rows * 4;
    // Render UI screens with the finer octant sampler (2×4 sub-pixels/cell): it
    // stays crisp at a 1-sub-pixel font size, so the pixel font is both sharp AND
    // small enough to fit a full screen of content — unlike half-block, which
    // needs a 2-sub-pixel font and blurs/overflows at moderate zoom.
    f.mode = 'octant';
    this.g = f.pixel();
    this.cellPx = Math.max(1, Math.round(ph * PIXEL_UNIT));
    this.cw = CW * this.cellPx;
    this.lh = LH * this.cellPx;
    this.cols = Math.floor(pw / this.cw);
    this.rows = Math.floor(ph / this.lh);
  }
  private gx(x: number): number { return Math.round(x * this.cw); }
  private gy(y: number): number { return Math.round(y * this.lh); }
  gradient(top: RGB, bot: RGB): void {
    const h = this.g.length, w = this.g[0]?.length ?? 0;
    for (let y = 0; y < h; y++) {
      const t = h > 1 ? y / (h - 1) : 0;
      fillRect(this.g, 0, y, w, 1, rgb(Math.round(top.r + (bot.r - top.r) * t), Math.round(top.g + (bot.g - top.g) * t), Math.round(top.b + (bot.b - top.b) * t)));
    }
  }
  fill(x: number, y: number, w: number, h: number, color: RGB): void {
    fillRect(this.g, this.gx(x), this.gy(y), Math.round(w * this.cw), Math.round(h * this.lh), color);
  }
  text(x: number, y: number, str: string, o: TextOpts = {}): void {
    if (o.bg) this.fill(x, y, str.length, 1, o.bg);
    const yOff = this.cellPx * Math.round((this.lh / this.cellPx - GLYPH_H) / 2); // center the glyph in the line, aligned to cellPx
    drawTextPx(this.g, str, this.gx(x), this.gy(y) + yOff, o.color ?? THEME.text, this.cellPx);
  }
  panel(x: number, y: number, w: number, h: number, o: PanelOpts = {}): Rect {
    const bt = Math.max(1, Math.round(this.cellPx * 0.9));           // border thickness (sub-px)
    const px = this.gx(x), py = this.gy(y), pw2 = Math.round(w * this.cw), ph2 = Math.round(h * this.lh);
    const border = o.border ?? THEME.panelBorder, fill = o.fill ?? THEME.panel;
    fillRect(this.g, px, py, pw2, ph2, fill);
    fillRect(this.g, px, py, pw2, bt, border); fillRect(this.g, px, py + ph2 - bt, pw2, bt, border);
    fillRect(this.g, px, py, bt, ph2, border); fillRect(this.g, px + pw2 - bt, py, bt, ph2, border);
    let top = y + 0.5;
    if (o.title) {
      this.fill(x + 0.4, y + 0.4, w - 0.8, 1.1, THEME.shadow);
      this.text(x + 1, y + 0.5, o.title, { color: o.titleColor ?? THEME.panelTitle });
      fillRect(this.g, px, this.gy(y + 1.7), pw2, bt, border);
      top = y + 2;
    }
    return { x: x + 1, y: top, w: w - 2, h: h - (top - y) - 0.6 };
  }
  heading(y: number, str: string, color: RGB, scale = 1): void {
    const s = this.cellPx * (scale + 1);
    const w = textPxWidth(str, s);
    drawTextPx(this.g, str, s * Math.round(((this.cols * this.cw) - w) / (2 * s)), this.gy(y), color, s);
  }
  headingHeight(scale = 1): number { return Math.ceil((GLYPH_H * (scale + 1)) / LH) + 1; }
  width(str: string): number { return str.length; }
  unitX(subPx: number): number { return subPx / this.cw; }
  unitY(subPy: number): number { return subPy / this.lh; }
}

/** Pick the backend by terminal resolution: the constant-size pixel font ONLY
 *  once the graphics layer has enough sub-pixels to render it crisply (cellPx≥2,
 *  ~68+ rows, and a wide enough grid), crisp one-cell text otherwise. This keeps
 *  the UI crisp at every zoom — cell text when zoomed in / normal, constant-size
 *  pixel text when zoomed way out. SF_UI ('pixel' | 'cell') forces a mode. */
/** Summary of the most recently created surface, for the debug overlay. */
export interface SurfaceInfo { kind: 'cell' | 'pixel'; cols: number; rows: number; cellPx: number; mode: string; }
export let lastSurfaceInfo: SurfaceInfo = { kind: 'cell', cols: 0, rows: 0, cellPx: 0, mode: '-' };

export const MIN_PIXEL_COLS = 48, MIN_PIXEL_ROWS = 22;   // virtual-grid minimum for a full screen of UI
/** Is the terminal big enough for the (legible, ≥2px) pixel UI to fit? Below
 *  this we show a "make your terminal bigger" notice instead of a squashed UI. */
export function pixelReady(cols: number, rows: number): boolean {
  const pw = cols * 2, ph = rows * 4;
  const cellPx = Math.max(1, Math.round(ph * PIXEL_UNIT));
  return Math.floor(pw / (CW * cellPx)) >= MIN_PIXEL_COLS && Math.floor(ph / (LH * cellPx)) >= MIN_PIXEL_ROWS;
}

/** Smallest terminal (cols, rows) that satisfies pixelReady — shown in the notice. */
export function minTerminal(): { cols: number; rows: number } {
  for (let rows = 20; rows < 300; rows++) if (pixelReady(rows * 3, rows)) {
    let cols = 40; while (!pixelReady(cols, rows)) cols += 2;
    return { cols, rows };
  }
  return { cols: 200, rows: 68 };
}

export function makeSurface(f: Frame): Surface {
  // Pixel-only UI. SF_UI=cell is a dev-only escape hatch.
  const s = process.env.SF_UI === 'cell' ? new CellSurface(f) : new PixelSurface(f);
  lastSurfaceInfo = { kind: s.kind, cols: s.cols, rows: s.rows, cellPx: (s as unknown as { cellPx?: number }).cellPx ?? 0, mode: f.mode };
  return s;
}

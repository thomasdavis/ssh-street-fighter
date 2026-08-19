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
}

// ---------- constant-size pixel-font backend ----------
const PIXEL_UNIT = 0.0055;  // font-pixel size as a fraction of screen height → constant physical size
                            // (chosen so the virtual grid is ~60 columns wide — a comfortable, readable body size)
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
    this.g = f.pixel();
    this.cellPx = Math.max(1, Math.round(ph * PIXEL_UNIT));
    this.cw = 4 * this.cellPx;
    this.lh = 6 * this.cellPx;
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
    const yOff = Math.round((this.lh - 5 * this.cellPx) / 2); // center glyph in the unit row
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
    drawTextPx(this.g, str, Math.round(((this.cols * this.cw) - w) / 2), this.gy(y), color, s);
  }
  headingHeight(scale = 1): number { return Math.ceil((5 * (scale + 1)) / 6) + 1; }
  width(str: string): number { return str.length; }
}

/** Pick the backend by terminal resolution: the constant-size pixel font ONLY
 *  once the graphics layer has enough sub-pixels to render it crisply (cellPx≥2,
 *  ~68+ rows, and a wide enough grid), crisp one-cell text otherwise. This keeps
 *  the UI crisp at every zoom — cell text when zoomed in / normal, constant-size
 *  pixel text when zoomed way out. SF_UI ('pixel' | 'cell') forces a mode. */
export function makeSurface(f: Frame): Surface {
  const forced = process.env.SF_UI;
  if (forced === 'pixel') return new PixelSurface(f);
  if (forced === 'cell') return new CellSurface(f);
  const cellPx = Math.round(f.rows * 4 * PIXEL_UNIT);
  return cellPx >= 2 && f.cols >= 170 ? new PixelSurface(f) : new CellSurface(f);
}

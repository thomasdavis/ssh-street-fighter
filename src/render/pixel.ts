// Compact octant pixel renderer, vendored from the maldoror.dev approach.
// Renders a PixelGrid (24-bit RGB framebuffer) into terminal rows using Unicode
// octant block glyphs: every 2x4 block of pixels becomes ONE character cell with
// a truecolor foreground/background pair. That gives 8 real sub-pixels per cell.
import { OCTANT_CHARS } from '../octant/octant-chars.js';

export interface RGB { r: number; g: number; b: number; }
export type Pixel = RGB | null;
export type PixelGrid = Pixel[][];

const ESC = '\x1b';
export const RESET = `${ESC}[0m`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;
export const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;

const DEFAULT_BG: RGB = { r: 16, g: 16, b: 22 };

export function rgb(r: number, g: number, b: number): RGB { return { r, g, b }; }

/** Snap each channel to a step grid (collapses near-identical colors → longer
 *  diff runs + better compression). step 1 = no-op. */
export function quantize(c: RGB, step: number): RGB {
  if (step <= 1) return c;
  const q = (v: number) => Math.min(255, Math.round(v / step) * step);
  return { r: q(c.r), g: q(c.g), b: q(c.b) };
}

const to6 = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.round((v - 35) / 40)));
/** Nearest xterm-256 palette index for an RGB (6x6x6 cube + 24 grays). */
export function rgbTo256(r: number, g: number, b: number): number {
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 23);
  }
  return 16 + 36 * to6(r) + 6 * to6(g) + to6(b);
}

const CUBE = [0, 95, 135, 175, 215, 255];
/** Inverse: xterm-256 index -> RGB (for previewing the quantized look). */
export function index256ToRgb(i: number): RGB {
  if (i >= 232) { const v = 8 + (i - 232) * 10; return { r: v, g: v, b: v }; }
  const j = i - 16;
  return { r: CUBE[Math.floor(j / 36) % 6]!, g: CUBE[Math.floor(j / 6) % 6]!, b: CUBE[j % 6]! };
}
/** Round an RGB to the xterm-256 palette (what indexed mode displays). */
export function snap256(c: RGB): RGB { return index256ToRgb(rgbTo256(c.r, c.g, c.b)); }

export function createGrid(width: number, height: number, fill: Pixel = null): PixelGrid {
  const g: PixelGrid = new Array(height);
  for (let y = 0; y < height; y++) {
    const row: Pixel[] = new Array(width);
    for (let x = 0; x < width; x++) row[x] = fill;
    g[y] = row;
  }
  return g;
}

/** Draw a filled rectangle of a solid color into the grid (clipped). */
export function fillRect(g: PixelGrid, x0: number, y0: number, w: number, h: number, color: Pixel): void {
  for (let y = y0; y < y0 + h; y++) {
    const row = g[y];
    if (!row) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= row.length) continue;
      row[x] = color;
    }
  }
}

/** Composite a sprite grid onto the background at an offset; null = transparent. */
export function blit(bg: PixelGrid, sprite: PixelGrid, offX: number, offY: number, flipX = false): void {
  const sh = sprite.length;
  for (let y = 0; y < sh; y++) {
    const srow = sprite[y];
    if (!srow) continue;
    const ty = y + offY;
    const trow = bg[ty];
    if (!trow) continue;
    const sw = srow.length;
    for (let x = 0; x < sw; x++) {
      const px = flipX ? srow[sw - 1 - x] : srow[x];
      if (!px) continue;
      const tx = x + offX;
      if (tx < 0 || tx >= trow.length) continue;
      trow[tx] = px;
    }
  }
}

// ---- octant fit (brightness split), per maldoror fitBrightness ----
function bright(p: Pixel): number {
  const c = p ?? DEFAULT_BG;
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

export interface Fit { char: string; fg: RGB; bg: RGB; }

/** Fit the 2x4 pixel block at (x,y) to one octant terminal cell. */
export function octantCell(grid: PixelGrid, x: number, y: number): Fit { return fitCell(grid, x, y); }

const HALF_BLOCK_TOP = '▀'; // ▀ — upper half block (fg = top, bg = bottom)

function avgBlock(grid: PixelGrid, x: number, y: number, rows: number): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy < rows; dy++) {
    const row = grid[y + dy];
    for (let dx = 0; dx < 2; dx++) {
      const c = (row ? row[x + dx] ?? null : null) ?? DEFAULT_BG;
      r += c.r; g += c.g; b += c.b; n++;
    }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/**
 * Render the 2x4 block at (x,y) as a half-block cell (▀): the top half becomes
 * the foreground color, the bottom half the background. Only needs the ▀ glyph
 * + truecolor, so it renders on ANY terminal (unlike the Unicode-16 octants).
 */
export function halfCell(grid: PixelGrid, x: number, y: number): Fit {
  return { char: HALF_BLOCK_TOP, fg: avgBlock(grid, x, y, 2), bg: avgBlock(grid, x, y + 2, 2) };
}

/** Average the `rows`x2 block at (x,y) INTO an existing RGB (no allocation). */
function avgBlockInto(grid: PixelGrid, x: number, y: number, rows: number, out: RGB): void {
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = 0; dy < rows; dy++) {
    const row = grid[y + dy];
    for (let dx = 0; dx < 2; dx++) {
      const c = (row ? row[x + dx] ?? null : null) ?? DEFAULT_BG;
      r += c.r; g += c.g; b += c.b; n++;
    }
  }
  out.r = Math.round(r / n); out.g = Math.round(g / n); out.b = Math.round(b / n);
}

/** Half-block cell written INTO existing fg/bg RGB objects (allocation-free hot
 * path for the per-frame render loop). Returns the glyph. */
export function halfCellInto(grid: PixelGrid, x: number, y: number, outFg: RGB, outBg: RGB): string {
  avgBlockInto(grid, x, y, 2, outFg);
  avgBlockInto(grid, x, y + 2, 2, outBg);
  return HALF_BLOCK_TOP;
}

function fitCell(grid: PixelGrid, x: number, y: number): Fit {
  // gather the 2x4 sub-pixels; bit index = dy*2 + dx
  const px: Pixel[] = new Array(8);
  let min = Infinity, max = -Infinity;
  for (let dy = 0; dy < 4; dy++) {
    const row = grid[y + dy];
    for (let dx = 0; dx < 2; dx++) {
      const p = row ? row[x + dx] ?? null : null;
      px[dy * 2 + dx] = p;
      const b = bright(p);
      if (b < min) min = b;
      if (b > max) max = b;
    }
  }
  if (max - min <= 10) {
    const avg = mean(px, 0xff);
    return { char: OCTANT_CHARS[0xff]!, fg: avg, bg: avg };
  }
  const threshold = (min + max) / 2;
  let pattern = 0;
  for (let i = 0; i < 8; i++) if (bright(px[i]!) >= threshold) pattern |= 1 << i;
  const fg = mean(px, pattern);
  const bg = mean(px, (~pattern) & 0xff);
  return { char: OCTANT_CHARS[pattern]!, fg, bg };
}

function mean(px: Pixel[], mask: number): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < 8; i++) {
    if (!(mask & (1 << i))) continue;
    const c = px[i] ?? DEFAULT_BG;
    r += c.r; g += c.g; b += c.b; n++;
  }
  if (n === 0) return { ...DEFAULT_BG };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function sgr(fg: RGB | null, bg: RGB | null): string {
  if (fg && bg) return `${ESC}[38;2;${fg.r};${fg.g};${fg.b};48;2;${bg.r};${bg.g};${bg.b}m`;
  if (fg) return `${ESC}[38;2;${fg.r};${fg.g};${fg.b}m`;
  if (bg) return `${ESC}[48;2;${bg.r};${bg.g};${bg.b}m`;
  return '';
}

/**
 * Fit a source grid into a target of `tw`x`th` pixels, preserving aspect ratio
 * (letterboxed on a solid backdrop), nearest-neighbor. Lets one logical scene
 * render onto any terminal size without stretching.
 */
export function fitGrid(src: PixelGrid, tw: number, th: number, backdrop: Pixel = null): PixelGrid {
  const sh = src.length;
  const sw = src[0]?.length ?? 0;
  const out = createGrid(tw, th, backdrop);
  if (sw === 0 || sh === 0) return out;
  const scale = Math.min(tw / sw, th / sh);
  const dw = Math.max(1, Math.floor(sw * scale));
  const dh = Math.max(1, Math.floor(sh * scale));
  const ox = Math.floor((tw - dw) / 2);
  const oy = Math.floor((th - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const syRow = src[Math.min(sh - 1, Math.floor(y / scale))]!;
    const outRow = out[y + oy]!;
    for (let x = 0; x < dw; x++) {
      outRow[x + ox] = syRow[Math.min(sw - 1, Math.floor(x / scale))] ?? backdrop;
    }
  }
  return out;
}

/**
 * Resize a sprite grid to a target pixel height (aspect-preserved). Uses area
 * averaging when shrinking (crisp downscale of high-res art) and nearest when
 * enlarging. Returns the new grid and the scale factor applied.
 */
export function resizeGridH(grid: PixelGrid, targetH: number): { grid: PixelGrid; factor: number } {
  const sh = grid.length, sw = grid[0]?.length ?? 0;
  if (sh === 0 || sw === 0 || targetH === sh) return { grid, factor: 1 };
  const factor = targetH / sh;
  const th = Math.max(1, Math.round(targetH));
  const tw = Math.max(1, Math.round(sw * factor));
  const out = createGrid(tw, th, null);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = Math.floor(ty / factor), sy1 = Math.max(sy0 + 1, Math.ceil((ty + 1) / factor));
    const orow = out[ty]!;
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor(tx / factor), sx1 = Math.max(sx0 + 1, Math.ceil((tx + 1) / factor));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy < sh; sy++) {
        const srow = grid[sy]!;
        for (let sx = sx0; sx < sx1 && sx < sw; sx++) { const p = srow[sx]; if (p) { r += p.r; g += p.g; b += p.b; n++; } }
      }
      orow[tx] = n > 0 ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null;
    }
  }
  return { grid: out, factor };
}

/**
 * Resize a packed RGBA sprite (Uint8Array, row-major) to a target pixel height,
 * area-averaged. Lets us hold high-res sprites compactly as bytes and downscale
 * to the exact on-screen size on demand. `mirror` flips horizontally.
 */
export function resizeRGBA(rgba: Uint8Array, sw: number, sh: number, targetH: number, mirror = false, alphaT = 128): PixelGrid {
  const factor = targetH / sh;
  const th = Math.max(1, Math.round(targetH));
  const tw = Math.max(1, Math.round(sw * factor));
  const out = createGrid(tw, th, null);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = Math.floor(ty / factor), sy1 = Math.max(sy0 + 1, Math.ceil((ty + 1) / factor));
    const orow = out[ty]!;
    for (let tx = 0; tx < tw; tx++) {
      const stx = mirror ? tw - 1 - tx : tx;
      const sx0 = Math.floor(stx / factor), sx1 = Math.max(sx0 + 1, Math.ceil((stx + 1) / factor));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy < sh; sy++) {
        for (let sx = sx0; sx < sx1 && sx < sw; sx++) {
          const i = (sy * sw + sx) * 4;
          if (rgba[i + 3]! >= alphaT) { r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!; n++; }
        }
      }
      orow[tx] = n > 0 ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : null;
    }
  }
  return out;
}

/** Render the full grid to an array of terminal rows (one row per 4 pixels). */
export function renderOctantGrid(grid: PixelGrid): string[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const out: string[] = [];
  for (let y = 0; y + 3 < height; y += 4) {
    let line = '';
    let lastFg: RGB | null = null;
    let lastBg: RGB | null = null;
    for (let x = 0; x + 1 < width; x += 2) {
      const { char, fg, bg } = fitCell(grid, x, y);
      const fgc = !lastFg || lastFg.r !== fg.r || lastFg.g !== fg.g || lastFg.b !== fg.b;
      const bgc = !lastBg || lastBg.r !== bg.r || lastBg.g !== bg.g || lastBg.b !== bg.b;
      if (fgc || bgc) {
        line += sgr(fgc ? fg : null, bgc ? bg : null);
        if (fgc) lastFg = fg;
        if (bgc) lastBg = bg;
      }
      line += char;
    }
    line += RESET;
    out.push(line);
  }
  return out;
}

/**
 * Diff two rendered frames (arrays of row strings) and emit an ANSI update that
 * only repaints rows that changed. Row-granular, which is plenty for SSH.
 * `prev` may be null for a full paint.
 */
export function diffFrame(prev: string[] | null, next: string[]): string {
  let out = '';
  for (let i = 0; i < next.length; i++) {
    if (!prev || prev[i] !== next[i]) {
      out += `${ESC}[${i + 1};1H`;   // cursor to row i+1, col 1
      out += `${ESC}[2K`;             // clear entire line
      out += next[i];
    }
  }
  return out;
}

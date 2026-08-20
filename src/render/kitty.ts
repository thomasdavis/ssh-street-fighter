// Kitty graphics protocol encoder: transmit a full framebuffer to the terminal
// as real pixels (used when the client terminal supports it — ghostty, kitty,
// wezterm, vscode, cmux, …). Falls back to the octant renderer otherwise.
//
// Technique (per the kitty spec + zenbu-labs/terminal-browser reference):
//   \x1b_Ga=T,f=24,o=z,s=<w>,v=<h>,t=d,i=<id>,p=1,C=1,q=2,m=<more>;<base64 zlib chunk>\x1b\\
//   - f=24  : RGB (opaque frames — 25% smaller than RGBA/f=32)
//   - o=z   : zlib-compressed payload (flat regions collapse to almost nothing)
//   - t=d   : direct — payload embedded in the escape (the only option over SSH)
//   - i=<id>: one image id per session; re-transmitting replaces it in place
//   - p=1,C=1: cursor placement that does NOT move the cursor (no scroll)
//   - q=2   : quiet — the terminal sends no OK/response we would have to parse
//   - m=1/0 : chunk continuation (base64 split at 4096 bytes)
import { deflateSync } from 'node:zlib';
import type { PixelGrid } from './pixel.js';

const CHUNK = 4096;
const ST = '\x1b\\';

/** Pack a PixelGrid (cols*2 x rows*4, RGB|null) into tightly-packed RGB bytes.
 *  Null (transparent) pixels become black — our scenes fill their background. */
export function packRGB(grid: PixelGrid, w: number, h: number): Buffer {
  const buf = Buffer.allocUnsafe(w * h * 3);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const p = row ? row[x] : null;
      if (p) { buf[o] = p.r; buf[o + 1] = p.g; buf[o + 2] = p.b; } else { buf[o] = 0; buf[o + 1] = 0; buf[o + 2] = 0; }
      o += 3;
    }
  }
  return buf;
}

/** FNV-1a over the packed pixels — a cheap change-detector so we never re-send an
 *  identical frame (huge for static menus). */
export function hashBuf(buf: Buffer): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) { h ^= buf[i]!; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The full transmit-and-display escape for one RGB frame (zlib + chunked base64).
 *  When `place` is given, the image is scaled to exactly fill `cols`x`rows` cells
 *  (c=/r=), so we can compose at high resolution and let the terminal fit it to
 *  the grid — no cell-pixel-size probing needed. */
export function transmit(imageId: number, w: number, h: number, rgb: Buffer, place?: { cols: number; rows: number }): string {
  const payload = deflateSync(rgb).toString('base64');
  const fit = place ? `,c=${place.cols},r=${place.rows}` : '';
  let out = '';
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const more = i + CHUNK < payload.length ? 1 : 0;
    if (i === 0) out += `\x1b_Ga=T,f=24,o=z,s=${w},v=${h},t=d,i=${imageId},p=1,C=1${fit},q=2,m=${more};${chunk}${ST}`;
    else out += `\x1b_Gm=${more};${chunk}${ST}`;
  }
  return out;
}

/** Delete our image (used on resize/teardown so a shrunk frame leaves no ghost). */
export function deleteImage(imageId: number): string {
  return `\x1b_Ga=d,d=I,i=${imageId},q=2${ST}`;
}

/** A graphics-support probe: query our image id, then a primary-DA request as a
 *  fence. If the DA reply arrives without a `Gi=<id>;OK`, graphics is unsupported. */
export function graphicsProbe(imageId: number): string {
  return `\x1b_Gi=${imageId},a=q,t=d,f=24,s=1,v=1;AAAA${ST}\x1b[c`;
}

/** Per-session graphics renderer: holds the image id + last frame hash/size so it
 *  only re-transmits when the picture actually changes. */
export class KittyRenderer {
  private lastHash = -1;
  private lastW = 0;
  private lastH = 0;
  constructor(private readonly imageId: number) {}

  reset(): void { this.lastHash = -1; this.lastW = 0; this.lastH = 0; }

  /** Bytes to draw this frame (empty string if nothing changed). The image is
   *  packed at the grid's own pixel size and scaled to fill `cols`x`rows` cells. */
  frame(grid: PixelGrid, cols: number, rows: number): string {
    const w = grid[0]?.length ?? 0, h = grid.length;
    if (w === 0 || h === 0) return '';
    const rgb = packRGB(grid, w, h);
    const hash = hashBuf(rgb);
    const resized = w !== this.lastW || h !== this.lastH;
    if (!resized && hash === this.lastHash) return '';
    let out = '';
    if (resized && (this.lastW || this.lastH)) out += deleteImage(this.imageId) + '\x1b[2J';
    out += '\x1b[H' + transmit(this.imageId, w, h, rgb, { cols, rows });
    this.lastHash = hash; this.lastW = w; this.lastH = h;
    return out;
  }
}

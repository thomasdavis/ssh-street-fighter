// Minimal 3x5 pixel font for HUD text (uppercase, digits, a few symbols).
import type { PixelGrid, Pixel } from './pixel.js';

const F: Record<string, string[]> = {
  'A': ['###', '# #', '###', '# #', '# #'],
  'B': ['## ', '# #', '## ', '# #', '## '],
  'C': ['###', '#  ', '#  ', '#  ', '###'],
  'D': ['## ', '# #', '# #', '# #', '## '],
  'E': ['###', '#  ', '## ', '#  ', '###'],
  'F': ['###', '#  ', '## ', '#  ', '#  '],
  'G': ['###', '#  ', '# #', '# #', '###'],
  'H': ['# #', '# #', '###', '# #', '# #'],
  'I': ['###', ' # ', ' # ', ' # ', '###'],
  'J': ['  #', '  #', '  #', '# #', '###'],
  'K': ['# #', '# #', '## ', '# #', '# #'],
  'L': ['#  ', '#  ', '#  ', '#  ', '###'],
  'M': ['# #', '###', '###', '# #', '# #'],
  'N': ['# #', '###', '###', '###', '# #'],
  'O': ['###', '# #', '# #', '# #', '###'],
  'P': ['###', '# #', '###', '#  ', '#  '],
  'Q': ['###', '# #', '# #', '###', '  #'],
  'R': ['###', '# #', '## ', '# #', '# #'],
  'S': ['###', '#  ', '###', '  #', '###'],
  'T': ['###', ' # ', ' # ', ' # ', ' # '],
  'U': ['# #', '# #', '# #', '# #', '###'],
  'V': ['# #', '# #', '# #', '# #', ' # '],
  'W': ['# #', '# #', '###', '###', '# #'],
  'X': ['# #', '# #', ' # ', '# #', '# #'],
  'Y': ['# #', '# #', ' # ', ' # ', ' # '],
  'Z': ['###', '  #', ' # ', '#  ', '###'],
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', ' # ', ' # ', ' # '],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  ' ': ['   ', '   ', '   ', '   ', '   '],
  '!': [' # ', ' # ', ' # ', '   ', ' # '],
  '-': ['   ', '   ', '###', '   ', '   '],
  ':': ['   ', ' # ', '   ', ' # ', '   '],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  '/': ['  #', '  #', ' # ', '#  ', '#  '],
  '%': ['# #', '  #', ' # ', '#  ', '# #'],
  '#': ['# #', '###', '# #', '###', '# #'],
  '(': [' ##', '#  ', '#  ', '#  ', ' ##'],
  ')': ['## ', '  #', '  #', '  #', '## '],
  '+': ['   ', ' # ', '###', ' # ', '   '],
  ',': ['   ', '   ', '   ', ' # ', '#  '],
  '←': [' # ', '#  ', '###', '#  ', ' # '],
  '→': [' # ', '  #', '###', '  #', ' # '],
  '↑': [' # ', '###', '# #', ' # ', ' # '],
  '↓': [' # ', ' # ', '# #', '###', ' # '],
  '·': ['   ', '   ', ' # ', '   ', '   '],
  '▶': ['#  ', '## ', '###', '## ', '#  '],
  '▲': ['   ', ' # ', '###', '###', '   '],
  '?': ['###', '  #', ' ##', '   ', ' # '],
  '=': ['   ', '###', '   ', '###', '   '],
  ';': ['   ', ' # ', '   ', ' # ', '#  '],
  "'": [' # ', ' # ', '   ', '   ', '   '],
  '<': ['  #', ' # ', '#  ', ' # ', '  #'],
  '>': ['#  ', ' # ', '  #', ' # ', '#  '],
  '[': ['## ', '#  ', '#  ', '#  ', '## '],
  ']': [' ##', '  #', '  #', '  #', ' ##'],
};

export function textWidth(text: string, scale = 1): number {
  return text.length * (3 + 1) * scale - scale;
}

/** The 3x5 glyph map, exposed for cell-based block-letter rendering (crisp big text). */
export const FONT3X5: Record<string, string[]> = F;
export function glyphRows(ch: string): string[] { return F[ch.toUpperCase()] ?? F[' ']!; }

// --- continuous-scale pixel text (each font pixel = a cellPx-sized square) ---
// cellPx may be fractional, so text scales smoothly with the framebuffer size
// instead of stepping like the integer block font. Draws into a PixelGrid.
export function textPxWidth(text: string, cellPx: number): number {
  return Math.round(text.length * 4 * cellPx - cellPx);
}

export function drawTextPx(g: PixelGrid, text: string, x0: number, y0: number, color: Pixel, cellPx: number): void {
  const sz = Math.max(1, Math.round(cellPx));
  let fx = x0;
  for (const chRaw of text.toUpperCase()) {
    const glyph = F[chRaw] ?? F[' ']!;
    for (let gy = 0; gy < 5; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] !== '#') continue;
        const rx = Math.round(fx + gx * cellPx), ry = Math.round(y0 + gy * cellPx);
        for (let dy = 0; dy < sz; dy++) {
          const grow = g[ry + dy];
          if (!grow) continue;
          for (let dx = 0; dx < sz; dx++) { const px = rx + dx; if (px >= 0 && px < grow.length) grow[px] = color; }
        }
      }
    }
    fx += 4 * cellPx;
  }
}

export function drawText(g: PixelGrid, text: string, x0: number, y0: number, color: Pixel, scale = 1): void {
  let cx = x0;
  for (const chRaw of text.toUpperCase()) {
    const glyph = F[chRaw] ?? F[' ']!;
    for (let gy = 0; gy < 5; gy++) {
      const row = glyph[gy]!;
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          const py = y0 + gy * scale + sy;
          const grow = g[py];
          if (!grow) continue;
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + gx * scale + sx;
            if (px < 0 || px >= grow.length) continue;
            grow[px] = color;
          }
        }
      }
    }
    cx += (3 + 1) * scale;
  }
}

// Small always-on debug overlay so a screenshot self-documents the exact
// settings it was taken at. Drawn as crisp text cells (top-left) on top of
// whatever the screen rendered. Toggle off with SF_DEBUG=0.
import type { Frame } from '../render/frame.js';
import { lastSurfaceInfo } from './surface.js';
import { rgb } from '../render/pixel.js';

const BG = rgb(8, 6, 14);
const FG = rgb(120, 255, 140);
const DIM = rgb(150, 150, 160);

export const DEBUG_ON = process.env.SF_DEBUG !== '0';

/** One-line HUD of the render settings, e.g.:
 *  DBG term 150x50  render octant  ui pixel  grid 75x33  px1 */
export function drawDebugOverlay(f: Frame): void {
  const i = lastSurfaceInfo;
  const grid = i.kind === 'pixel' ? `grid ${i.cols}x${i.rows} px${i.cellPx}` : `grid ${f.cols}x${f.rows}`;
  const parts = [`term ${f.cols}x${f.rows}`, `render ${f.mode}`, `ui ${i.kind}`, grid];
  const line = 'DBG ' + parts.join('  ');
  const w = Math.min(f.cols, line.length + 2);
  f.fill(0, 0, w, 1, BG);
  f.putChar(0, 0, ' ', FG, BG);
  f.write(1, 0, 'DBG ', FG, BG, true);
  f.write(5, 0, parts.join('  ').slice(0, Math.max(0, f.cols - 6)), DIM, BG);
}

// Character-select and waiting screens — composed as PixelGrids so the player
// sees real graphics the instant they connect (no opponent required).
//
// Rendered at the terminal's FULL pixel resolution (like the fight scene), so
// each fighter is scaled straight from its high-res source to its on-screen size
// — one clean resample. (The old path composed at the 240x160 world size and then
// upscaled the whole grid, double-resampling every fighter into mush.)
import { createGrid, fillRect, blit, resizeGridH, rgb, type PixelGrid, type RGB } from '../render/pixel.js';
import { drawFighter } from './sprites.js';
import { WORLD_W, WORLD_H, GROUND_Y } from './engine.js';
import { ROSTER, characterAt } from './roster.js';
import { SPRITES } from './sprite-set.js';
import { STAGES } from './stage-set.js';
import type { FighterPalette } from './types.js';

const GOLD = rgb(250, 224, 96);
const SHADOW = rgb(24, 18, 30);
const SELECT_FLOOR = 112; // fighters stand here (world units), leaving room for labels below

interface View { ws: number; ox: number; oy: number; pw: number; ph: number; }
function makeView(pw: number, ph: number): View {
  const ws = Math.min(pw / WORLD_W, ph / WORLD_H);
  return { ws, ox: Math.round((pw - WORLD_W * ws) / 2), oy: Math.round((ph - WORLD_H * ws) / 2), pw, ph };
}
const sx = (v: View, x: number): number => Math.round(v.ox + x * v.ws);
const sy = (v: View, y: number): number => Math.round(v.oy + y * v.ws);
/** Fill a world-space rectangle, mapped to the framebuffer. */
function wrect(g: PixelGrid, v: View, x: number, y: number, w: number, h: number, c: RGB): void {
  fillRect(g, sx(v, x), sy(v, y), Math.max(1, Math.round(w * v.ws)), Math.max(1, Math.round(h * v.ws)), c);
}

function backdrop(g: PixelGrid, v: View): void {
  fillRect(g, 0, 0, v.pw, v.ph, rgb(0, 0, 0)); // letterbox
  for (let ypix = 0; ypix < v.ph; ypix++) {
    const wy = (ypix - v.oy) / v.ws;
    if (wy < 0 || wy > WORLD_H) continue;
    const t = wy / WORLD_H;
    fillRect(g, sx(v, 0), ypix, Math.round(WORLD_W * v.ws), 1, rgb(Math.round(30 + 20 * t), Math.round(20 + 10 * t), Math.round(44 + 30 * t)));
  }
  wrect(g, v, 0, GROUND_Y + 8, WORLD_W, WORLD_H - GROUND_Y - 8, rgb(50, 38, 54));
}

/** Draw a character pose at full framebuffer resolution (one clean resample). */
function drawIdleAt(g: PixelGrid, v: View, name: string, palette: FighterPalette, wx: number, baseline: number, standH: number, bob: number, pose = 'idle_1', facing: 1 | -1 = 1): void {
  const targetH = Math.max(8, Math.round(standH * v.ws));
  const feetX = v.ox + wx * v.ws, feetY = v.oy + (baseline + bob) * v.ws;
  const spr = SPRITES.getScaled(name, pose, facing, targetH) ?? (pose !== 'idle_1' ? SPRITES.getScaled(name, 'idle_1', facing, targetH) : null);
  if (spr) { blit(g, spr.grid, Math.round(feetX - spr.anchorX), Math.round(feetY - spr.anchorY), false); return; }
  const { grid } = resizeGridH(drawFighter('idle', palette, 0), targetH);   // procedural fallback, scaled to match
  const gw = grid[0]?.length ?? 0, gh = grid.length;
  blit(g, grid, Math.round(feetX - gw / 2), Math.round(feetY - gh), facing === -1);
}

/** Multiply every pixel toward black (allocates fresh cells — grids share refs). */
function dimGrid(g: PixelGrid, factor: number): void {
  for (const row of g) for (let x = 0; x < row.length; x++) {
    const c = row[x];
    if (c) row[x] = { r: Math.round(c.r * factor), g: Math.round(c.g * factor), b: Math.round(c.b * factor) };
  }
}

export interface SelectSlot { x: number; baseline: number; standH: number; }
export function fighterSlot(i: number, n: number): SelectSlot {
  if (n <= 4) return { x: Math.round((WORLD_W / n) * i + WORLD_W / n / 2), baseline: SELECT_FLOOR, standH: 52 };
  const cols = Math.ceil(n / 2);
  const row = Math.floor(i / cols), col = i % cols;
  const rowCount = Math.min(cols, n - row * cols);
  const crowded = n > 8;
  return {
    x: Math.round((WORLD_W / rowCount) * col + WORLD_W / rowCount / 2),
    baseline: row === 0 ? (crowded ? 80 : 72) : (crowded ? 128 : 124),
    standH: crowded ? 44 : 48,
  };
}

// --- sprite-only stages (no pixel text; crisp text is overlaid by the screen) ---
export const SELECT_STAGE = { W: WORLD_W, H: WORLD_H, floor: SELECT_FLOOR };

export function composeSelectStage(cursor: number, frame: number, pw: number, ph: number): PixelGrid {
  const v = makeView(pw, ph);
  const g = createGrid(pw, ph, rgb(0, 0, 0));
  backdrop(g, v);
  const n = ROSTER.length;
  const sel = ((cursor % n) + n) % n;
  const bob = Math.round(Math.sin(frame / 5) * 2);
  for (let i = 0; i < n; i++) {
    const c = characterAt(i);
    const slot = fighterSlot(i, n);
    const isSel = i === sel;
    if (isSel) {
      wrect(g, v, slot.x - 24, slot.baseline - slot.standH - 6, 48, slot.standH + 6, rgb(70, 56, 104));
      wrect(g, v, slot.x - 22, slot.baseline - 2, 44, 4, GOLD);
    }
    wrect(g, v, slot.x - 16, slot.baseline - 1, 32, 2, SHADOW);
    drawIdleAt(g, v, c.name, c.palette, slot.x, slot.baseline, slot.standH, isSel ? bob : 0);
    if (isSel) { const ay = slot.baseline - slot.standH - 7; for (let k = 0; k < 4; k++) wrect(g, v, slot.x - k, ay + k, 1 + k * 2, 1, GOLD); }
  }
  return g;
}

/** Home-screen backdrop: a dimmed stage with the selected fighter posing on the
 *  right, so the main menu reads like a game title screen. Rendered at full
 *  framebuffer resolution; the menu UI is drawn over it by the screen. */
export function composeMenuStage(cursor: number, frame: number, pw: number, ph: number, stageId: string): PixelGrid {
  const g = createGrid(pw, ph, rgb(12, 10, 20));
  const coverH = Math.max(ph, Math.ceil(pw / 1.5));   // 3:2 stage sized to cover the frame
  const stage = STAGES.get(stageId, coverH);
  if (stage) {
    const sw = stage[0]?.length ?? 0, sh = stage.length;
    blit(g, stage, Math.round((pw - sw) / 2), Math.round((ph - sh) / 2), false);
  }
  dimGrid(g, 0.5);   // moody title vibe + keeps overlaid UI legible
  const v = makeView(pw, ph);
  const c = characterAt(cursor);
  const bob = Math.round(Math.sin(frame / 9) * 1.5);
  drawIdleAt(g, v, c.name, c.palette, WORLD_W * 0.72, SELECT_FLOOR + 14, 104, bob, 'menu', -1);
  return g;
}

export function composeWaitingStage(cursor: number, frame: number, pw: number, ph: number): PixelGrid {
  const v = makeView(pw, ph);
  const g = createGrid(pw, ph, rgb(0, 0, 0));
  backdrop(g, v);
  const c = characterAt(cursor);
  const cx = WORLD_W / 2;
  const bob = Math.round(Math.sin(frame / 5) * 2);
  wrect(g, v, cx - 24, 30, 48, SELECT_FLOOR - 30, rgb(70, 56, 104));
  wrect(g, v, cx - 22, SELECT_FLOOR - 2, 44, 4, GOLD);
  wrect(g, v, cx - 16, SELECT_FLOOR - 1, 32, 2, SHADOW);
  drawIdleAt(g, v, c.name, c.palette, cx, SELECT_FLOOR, 52, bob);
  return g;
}

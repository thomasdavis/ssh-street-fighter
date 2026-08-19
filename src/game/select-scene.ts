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
import { ROSTER, characterAt, type Character } from './roster.js';
import { SPRITES } from './sprite-set.js';
import { STAGES } from './stage-set.js';
import type { FighterPalette } from './types.js';

const GOLD = rgb(250, 224, 96);
const SHADOW = rgb(24, 18, 30);
const SELECT_FLOOR = 112; // fighters stand here (world units), leaving room for labels below
const SELECT_BG = 'dojo';     // character-select backdrop stage
const WAITING_BG = 'monsoon'; // waiting-for-opponent backdrop stage

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

/** Fill the frame with a stage image, cover-cropped and dimmed (a moody backdrop
 *  the fighters + UI sit over). Falls back to the gradient if the stage is absent. */
function stageBackdrop(g: PixelGrid, pw: number, ph: number, stageId: string, dim: number): void {
  const coverH = Math.max(ph, Math.ceil(pw / 1.5));   // 3:2 stage sized to cover the frame
  const stage = STAGES.get(stageId, coverH);
  if (stage) {
    const sw = stage[0]?.length ?? 0, sh = stage.length;
    blit(g, stage, Math.round((pw - sw) / 2), Math.round((ph - sh) / 2), false);
    dimGrid(g, dim);
  } else {
    backdrop(g, makeView(pw, ph));
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

// ── SF2-style character select ───────────────────────────────────────────────
// The highlighted fighter poses large on a spotlit stage (left); the whole roster
// sits in a grid of framed face portraits (right). Geometry is computed once
// (selectLayout) so the pixel scene and the crisp text overlay agree on it.
export const SELECT_COLS = 5;                   // portrait-grid columns
const CELL_PAD_FRAC = 0.10;                     // padding inside each grid cell
const BUST_HEAD_FRAC = 0.46;                    // fraction of a full figure a bust box shows

export interface Rect { x: number; y: number; w: number; h: number; }
export interface HeroBox extends Rect { cx: number; feetY: number; standH: number; }
export interface SelectLayout {
  cols: number; rows: number;
  hero: HeroBox;
  boxes: Rect[];        // framed portrait rect for each fighter (framebuffer px)
  nameY: number[];      // top (framebuffer px) of each fighter's name strip
}

/** Compute the select-screen geometry (all in framebuffer pixels). */
export function selectLayout(pw: number, ph: number, n: number): SelectLayout {
  // Reserve the top/bottom bands by the overlaid text's ACTUAL metrics (a fixed
  // number of rows), not a fraction of height — otherwise the big heading/hints
  // overlap the grid on shorter terminals. Mirrors PixelSurface's line height.
  const lh = 9 * Math.max(1, Math.round(ph * 0.0040));   // sub-pixels per text row
  const topPx = Math.round(4.6 * lh);           // heading (3) + subheading (1) + margin
  const botPx = Math.round(3.5 * lh);           // tagline + difficulty + hints
  const contentY = topPx;
  const contentH = Math.max(8, ph - topPx - botPx);
  const heroX = Math.round(pw * 0.02);
  const heroW = Math.round(pw * 0.38);
  const gridX = heroX + heroW + Math.round(pw * 0.04);
  const gridW = Math.max(8, pw - gridX - Math.round(pw * 0.02));
  const cols = SELECT_COLS;
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = gridW / cols;
  const cellH = contentH / rows;
  const pad = Math.min(cellW, cellH) * CELL_PAD_FRAC;
  const nameH = Math.min(cellH * 0.24, Math.max(7, ph * 0.03));
  const boxes: Rect[] = [];
  const nameY: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const rowCount = Math.min(cols, n - row * cols);
    const rowOff = ((cols - rowCount) * cellW) / 2;   // centre a short final row
    const cellX = gridX + rowOff + col * cellW;
    const cellY = contentY + row * cellH;
    boxes.push({ x: cellX + pad, y: cellY + pad, w: cellW - 2 * pad, h: cellH - 2 * pad - nameH });
    nameY.push(cellY + cellH - nameH);
  }
  const hero: HeroBox = {
    x: heroX, y: contentY, w: heroW, h: contentH,
    cx: heroX + heroW / 2,
    feetY: contentY + contentH * 0.9,
    standH: contentH * 0.78,
  };
  return { cols, rows, hero, boxes, nameY };
}

const mix = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);

/** Feet-anchored sprite draw in framebuffer pixels (hero + bust fallbacks). */
function drawSpritePx(g: PixelGrid, name: string, palette: FighterPalette, feetX: number, feetY: number, standH: number, bob: number, pose = 'idle_1', facing: 1 | -1 = 1): void {
  const targetH = Math.max(8, Math.round(standH));
  const spr = SPRITES.getScaled(name, pose, facing, targetH) ?? (pose !== 'idle_1' ? SPRITES.getScaled(name, 'idle_1', facing, targetH) : null);
  if (spr) { blit(g, spr.grid, Math.round(feetX - spr.anchorX), Math.round(feetY + bob - spr.anchorY), false); return; }
  const { grid } = resizeGridH(drawFighter('idle', palette, 0), targetH);
  const gw = grid[0]?.length ?? 0, gh = grid.length;
  blit(g, grid, Math.round(feetX - gw / 2), Math.round(feetY + bob - gh), facing === -1);
}

/** Bounding box of the non-transparent pixels in a grid (null if fully empty). */
function contentBBox(grid: PixelGrid): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    for (let x = 0; x < row.length; x++) if (row[x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < x0 ? null : { x0, y0, x1, y1 };
}

/** Blit a sprite, writing only into the clip rectangle [cx0,cx1) x [cy0,cy1). */
function blitClipped(bg: PixelGrid, sprite: PixelGrid, offX: number, offY: number, cx0: number, cy0: number, cx1: number, cy1: number): void {
  for (let y = 0; y < sprite.length; y++) {
    const ty = y + offY;
    if (ty < cy0 || ty >= cy1) continue;
    const trow = bg[ty], srow = sprite[y];
    if (!trow || !srow) continue;
    for (let x = 0; x < srow.length; x++) {
      const px = srow[x]; if (!px) continue;
      const tx = x + offX;
      if (tx < cx0 || tx >= cx1 || tx < 0 || tx >= trow.length) continue;
      trow[tx] = px;
    }
  }
}

/** Blend one pixel toward `c` by alpha `a` (keeps the backdrop showing through). */
function blendPx(g: PixelGrid, x: number, y: number, c: RGB, a: number): void {
  const row = g[y]; if (!row || x < 0 || x >= row.length) return;
  const base = row[x] ?? { r: 0, g: 0, b: 0 };
  row[x] = { r: mix(base.r, c.r, a), g: mix(base.g, c.g, a), b: mix(base.b, c.b, a) };
}

/** Soft blended ellipse — spotlight pools, contact shadows, back-glow. */
function ellipseBlend(g: PixelGrid, cx: number, cy: number, rx: number, ry: number, c: RGB, a: number, feather = 0.5): void {
  if (rx < 1 || ry < 1) return;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.ceil(cx + rx);
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) continue;
    const fall = d < feather ? 1 : 1 - (d - feather) / (1 - feather);
    blendPx(g, x, y, c, a * fall);
  }
}

/** A framed head-and-shoulders bust, clipped into a portrait box. */
function drawBust(g: PixelGrid, name: string, palette: FighterPalette, bx: number, by: number, bw: number, bh: number): void {
  const fullH = Math.max(12, Math.round(bh / BUST_HEAD_FRAC));
  const grid = SPRITES.getScaled(name, 'idle_1', 1, fullH)?.grid ?? resizeGridH(drawFighter('idle', palette, 0), fullH).grid;
  const bb = contentBBox(grid);
  if (!bb) return;
  const headroom = Math.round(bh * 0.08);
  const drawX = Math.round(bx + bw / 2 - (bb.x0 + bb.x1) / 2);
  const drawY = Math.round(by + headroom - bb.y0);
  blitClipped(g, grid, drawX, drawY, Math.round(bx), Math.round(by), Math.round(bx + bw), Math.round(by + bh));
}

/** One framed roster portrait (tinted plaque + bust + arcade-cursor frame). */
function drawPortrait(g: PixelGrid, c: Character, box: Rect, selected: boolean, pulse: number): void {
  const bx = Math.round(box.x), by = Math.round(box.y), bw = Math.round(box.w), bh = Math.round(box.h);
  if (bw < 2 || bh < 2) return;
  const pal = c.palette;
  for (let y = 0; y < bh; y++) {           // plaque: dark gradient washed with the fighter colour up top
    const t = y / Math.max(1, bh - 1), wash = 0.16 * (1 - t);
    fillRect(g, bx, by + y, bw, 1, {
      r: mix(mix(40, 12, t), pal.gi.r, wash),
      g: mix(mix(34, 10, t), pal.gi.g, wash),
      b: mix(mix(60, 20, t), pal.gi.b, wash),
    });
  }
  ellipseBlend(g, bx + bw / 2, by + bh * 0.52, bw * 0.52, bh * 0.6, pal.gi, 0.22, 0.15);   // back-glow
  drawBust(g, c.name, pal, bx, by, bw, bh);
  const border = selected ? { r: 255, g: mix(196, 255, pulse), b: mix(60, 150, pulse) } : rgb(96, 84, 132);
  const bt = selected ? Math.max(2, Math.round(bh * 0.05)) : 1;
  fillRect(g, bx, by, bw, bt, border); fillRect(g, bx, by + bh - bt, bw, bt, border);
  fillRect(g, bx, by, bt, bh, border); fillRect(g, bx + bw - bt, by, bt, bh, border);
  if (selected) {                          // gold arcade-cursor L-brackets on the corners
    const tk = Math.max(2, Math.round(Math.min(bw, bh) * 0.18));
    fillRect(g, bx - 1, by - 1, tk, bt, GOLD); fillRect(g, bx - 1, by - 1, bt, tk, GOLD);
    fillRect(g, bx + bw + 1 - tk, by - 1, tk, bt, GOLD); fillRect(g, bx + bw + 1 - bt, by - 1, bt, tk, GOLD);
    fillRect(g, bx - 1, by + bh + 1 - bt, tk, bt, GOLD); fillRect(g, bx - 1, by + bh + 1 - tk, bt, tk, GOLD);
    fillRect(g, bx + bw + 1 - tk, by + bh + 1 - bt, tk, bt, GOLD); fillRect(g, bx + bw + 1 - bt, by + bh + 1 - tk, bt, tk, GOLD);
  }
}

/** The highlighted fighter, posing large on a spotlit stage. */
function drawHero(g: PixelGrid, c: Character, hero: HeroBox, frame: number): void {
  const px = Math.round(hero.x), py = Math.round(hero.y), pw2 = Math.round(hero.w), ph2 = Math.round(hero.h);
  const { cx, feetY, standH } = hero;
  ellipseBlend(g, cx, py + ph2 * 0.45, pw2 * 0.55, ph2 * 0.6, rgb(120, 112, 168), 0.14, 0);          // focal lift
  ellipseBlend(g, cx, feetY - standH * 0.5, pw2 * 0.42, standH * 0.58, c.palette.gi, 0.24, 0.12);     // tinted back-glow
  const floorY = Math.round(feetY + standH * 0.02);
  ellipseBlend(g, cx, floorY, pw2 * 0.34, Math.max(2, standH * 0.055), rgb(250, 242, 205), 0.34, 0.05); // spotlight pool
  ellipseBlend(g, cx, floorY, pw2 * 0.2, Math.max(1, standH * 0.035), SHADOW, 0.55, 0.25);             // contact shadow
  drawSpritePx(g, c.name, c.palette, cx, feetY, standH, Math.round(Math.sin(frame / 9) * 1.5), 'menu', 1);
  const fr = rgb(150, 128, 210);           // thin VS-portrait frame + gold top ticks
  fillRect(g, px, py, pw2, 1, fr); fillRect(g, px, py + ph2 - 1, pw2, 1, fr);
  fillRect(g, px, py, 1, ph2, fr); fillRect(g, px + pw2 - 1, py, 1, ph2, fr);
  const gt = Math.max(2, Math.round(pw2 * 0.06));
  fillRect(g, px, py, gt, 2, GOLD); fillRect(g, px + pw2 - gt, py, gt, 2, GOLD);
}

export function composeSelectStage(cursor: number, frame: number, pw: number, ph: number): PixelGrid {
  const n = ROSTER.length;
  const sel = ((cursor % n) + n) % n;
  const g = createGrid(pw, ph, rgb(0, 0, 0));
  stageBackdrop(g, pw, ph, SELECT_BG, 0.32);   // dimmed stage so the roster pops
  const L = selectLayout(pw, ph, n);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 6);
  drawHero(g, characterAt(sel), L.hero, frame);
  for (let i = 0; i < n; i++) drawPortrait(g, characterAt(i), L.boxes[i]!, i === sel, pulse);
  return g;
}

/** Home-screen backdrop: a dimmed stage with the selected fighter posing on the
 *  right, so the main menu reads like a game title screen. Rendered at full
 *  framebuffer resolution; the menu UI is drawn over it by the screen. */
export function composeMenuStage(cursor: number, frame: number, pw: number, ph: number, stageId: string): PixelGrid {
  const g = createGrid(pw, ph, rgb(12, 10, 20));
  stageBackdrop(g, pw, ph, stageId, 0.5);   // moody title vibe + keeps overlaid UI legible
  const v = makeView(pw, ph);
  const c = characterAt(cursor);
  const bob = Math.round(Math.sin(frame / 9) * 1.5);
  drawIdleAt(g, v, c.name, c.palette, WORLD_W * 0.72, SELECT_FLOOR + 14, 104, bob, 'menu', -1);
  return g;
}

/** Waiting-for-opponent screen: a dimmed stage with your chosen fighter posing
 *  centre-stage in the title-screen hero pose — same look as the main menu. */
export function composeWaitingStage(cursor: number, frame: number, pw: number, ph: number): PixelGrid {
  const g = createGrid(pw, ph, rgb(12, 10, 20));
  stageBackdrop(g, pw, ph, WAITING_BG, 0.5);
  const v = makeView(pw, ph);
  const c = characterAt(cursor);
  const bob = Math.round(Math.sin(frame / 9) * 1.5);
  drawIdleAt(g, v, c.name, c.palette, WORLD_W / 2, SELECT_FLOOR + 16, 108, bob, 'menu', 1);
  return g;
}

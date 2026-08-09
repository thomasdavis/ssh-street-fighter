// Character-select and waiting screens — composed as PixelGrids so the player
// sees real graphics the instant they connect (no opponent required).
import { createGrid, fillRect, blit, rgb, type PixelGrid } from '../render/pixel.js';
import { drawText, textWidth } from '../render/font.js';
import { drawFighter, SPRITE_W, SPRITE_H } from './sprites.js';
import { WORLD_W, WORLD_H, GROUND_Y } from './engine.js';
import { ROSTER, characterAt } from './roster.js';
import { SPRITES } from './sprite-set.js';
import type { FighterPalette } from './types.js';

/** Draw a character's idle at (cx baseline) — generated sprite if available. */
function drawIdleAt(g: PixelGrid, name: string, palette: FighterPalette, cx: number, baseline: number, bob: number, standH = SPRITE_H): void {
  const spr = SPRITES.getScaled(name, 'idle_1', 1, standH);
  if (spr) { blit(g, spr.grid, cx - spr.anchorX, (baseline + bob) - spr.anchorY, false); return; }
  const fallback = drawFighter('idle', palette, 0);
  blit(g, fallback, cx - Math.round(SPRITE_W / 2), baseline - SPRITE_H + bob, false);
}

const WHITE = rgb(240, 240, 230);
const GOLD = rgb(250, 224, 96);
const DIM = rgb(150, 140, 130);
const SHADOW = rgb(24, 18, 30);

function backdrop(g: PixelGrid): void {
  for (let y = 0; y < WORLD_H; y++) {
    const t = y / WORLD_H;
    fillRect(g, 0, y, WORLD_W, 1, rgb(
      Math.round(30 + 20 * t), Math.round(20 + 10 * t), Math.round(44 + 30 * t)));
  }
  fillRect(g, 0, GROUND_Y + 8, WORLD_W, WORLD_H - GROUND_Y - 8, rgb(50, 38, 54));
}

function centerText(g: PixelGrid, text: string, y: number, color = WHITE, scale = 2): void {
  const w = textWidth(text, scale);
  drawText(g, text, Math.round(WORLD_W / 2 - w / 2), y, color, scale);
}

const SELECT_FLOOR = 112; // fighters stand here, leaving room for labels below

export interface SelectSlot { x: number; baseline: number; standH: number; }
export function fighterSlot(i: number, n: number): SelectSlot {
  if (n <= 4) return { x: Math.round((WORLD_W / n) * i + WORLD_W / n / 2), baseline: SELECT_FLOOR, standH: SPRITE_H };
  const cols = Math.ceil(n / 2);
  const row = Math.floor(i / cols), col = i % cols;
  const rowCount = Math.min(cols, n - row * cols);
  const crowded = n > 8;
  return {
    x: Math.round((WORLD_W / rowCount) * col + WORLD_W / rowCount / 2),
    baseline: row === 0 ? (crowded ? 80 : 72) : (crowded ? 128 : 124),
    standH: crowded ? 40 : 44,
  };
}

export function composeSelect(cursor: number, playerName: string, frame: number): PixelGrid {
  const g = createGrid(WORLD_W, WORLD_H, rgb(0, 0, 0));
  backdrop(g);

  centerText(g, 'SELECT YOUR FIGHTER', 8, GOLD, 2);

  const n = ROSTER.length;
  const sel = ((cursor % n) + n) % n;
  const bob = Math.round(Math.sin(frame / 5) * 2);

  for (let i = 0; i < n; i++) {
    const c = characterAt(i);
    const slot = fighterSlot(i, n);
    const cx = slot.x;
    const isSel = i === sel;
    if (isSel) {
      fillRect(g, cx - 22, slot.baseline - slot.standH - 5, 44, slot.standH + 5, rgb(64, 52, 96));
      fillRect(g, cx - 20, slot.baseline - 2, 40, 4, GOLD);
    }
    const sprite = drawFighter('idle', c.palette, 0);
    const topY = slot.baseline - SPRITE_H + (isSel ? bob : 0);
    fillRect(g, cx - SPRITE_W / 2, slot.baseline - 1, SPRITE_W, 2, SHADOW);
    blit(g, sprite, cx - Math.round(SPRITE_W / 2), topY, false);
    const nw = textWidth(c.name, 1);
    drawText(g, c.name, Math.round(cx - nw / 2), slot.baseline + 4, isSel ? GOLD : DIM, 1);
    if (isSel) {
      const ay = topY - 8;
      for (let k = 0; k < 4; k++) fillRect(g, cx - k, ay + k, 1 + k * 2, 1, GOLD);
    }
  }

  const chosen = characterAt(sel);
  centerText(g, chosen.tagline.toUpperCase(), SELECT_FLOOR + 20, WHITE, 1);
  centerText(g, 'A/D  CHOOSE       J  START       Q  QUIT', SELECT_FLOOR + 34, DIM, 1);
  drawText(g, `YOU: ${playerName}`, 4, WORLD_H - 8, DIM, 1);
  return g;
}

// --- sprite-only stages (no pixel text; crisp text is overlaid by the screen) ---
export const SELECT_STAGE = { W: WORLD_W, H: WORLD_H, floor: SELECT_FLOOR };

export function composeSelectStage(cursor: number, frame: number): PixelGrid {
  const g = createGrid(WORLD_W, WORLD_H, rgb(0, 0, 0));
  backdrop(g);
  const n = ROSTER.length;
  const sel = ((cursor % n) + n) % n;
  const bob = Math.round(Math.sin(frame / 5) * 2);
  for (let i = 0; i < n; i++) {
    const c = characterAt(i);
    const slot = fighterSlot(i, n);
    const cx = slot.x;
    const isSel = i === sel;
    if (isSel) {
      fillRect(g, cx - 24, slot.baseline - slot.standH - 6, 48, slot.standH + 6, rgb(70, 56, 104));
      fillRect(g, cx - 22, slot.baseline - 2, 44, 4, GOLD);
    }
    fillRect(g, cx - SPRITE_W / 2, slot.baseline - 1, SPRITE_W, 2, SHADOW);
    drawIdleAt(g, c.name, c.palette, cx, slot.baseline, isSel ? bob : 0, slot.standH);
    if (isSel) { const ay = slot.baseline - slot.standH - 7; for (let k = 0; k < 4; k++) fillRect(g, cx - k, ay + k, 1 + k * 2, 1, GOLD); }
  }
  return g;
}

export function composeWaitingStage(cursor: number, frame: number): PixelGrid {
  const g = createGrid(WORLD_W, WORLD_H, rgb(0, 0, 0));
  backdrop(g);
  const c = characterAt(cursor);
  const cx = WORLD_W / 2;
  const bob = Math.round(Math.sin(frame / 5) * 2);
  const pose = (Math.floor(frame / 18) % 5 === 0) ? 'punch' : 'idle';
  fillRect(g, cx - 24, 30, 48, SELECT_FLOOR - 30, rgb(70, 56, 104));
  fillRect(g, cx - 22, SELECT_FLOOR - 2, 44, 4, GOLD);
  fillRect(g, cx - SPRITE_W / 2, SELECT_FLOOR - 1, SPRITE_W, 2, SHADOW);
  void pose;
  drawIdleAt(g, c.name, c.palette, cx, SELECT_FLOOR, bob);
  return g;
}

export function composeWaiting(cursor: number, frame: number): PixelGrid {
  const g = createGrid(WORLD_W, WORLD_H, rgb(0, 0, 0));
  backdrop(g);
  const c = characterAt(cursor);
  centerText(g, 'YOU PICKED ' + c.name, 10, GOLD, 2);
  const cx = WORLD_W / 2;
  const bob = Math.round(Math.sin(frame / 5) * 2);
  const pose = (Math.floor(frame / 20) % 6 === 0) ? 'punch' : 'idle';
  const sprite = drawFighter(pose, c.palette, 0);
  fillRect(g, cx - SPRITE_W / 2, SELECT_FLOOR - 1, SPRITE_W, 2, SHADOW);
  blit(g, sprite, cx - Math.round(SPRITE_W / 2), SELECT_FLOOR - SPRITE_H + bob, false);
  const dots = '.'.repeat(1 + (Math.floor(frame / 10) % 3));
  centerText(g, 'WAITING FOR OPPONENT' + dots, SELECT_FLOOR + 18, WHITE, 1);
  centerText(g, 'HAVE A FRIEND SSH IN TO FIGHT YOU', SELECT_FLOOR + 32, DIM, 1);
  return g;
}

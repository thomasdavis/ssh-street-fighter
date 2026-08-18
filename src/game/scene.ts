// Compose the stage into a PixelGrid at an ARBITRARY resolution. The fight
// renders directly at the terminal's native pixel resolution (cols*2 x rows*4),
// so more cells => more world pixels => sharper sprites. A world->pixel scale
// maps the fixed 240x160 logical world onto whatever resolution is asked for,
// and sprites are downscaled from their high-res source to the on-screen size.
import { createGrid, fillRect, blit, resizeGridH, rgb, type PixelGrid, type RGB } from '../render/pixel.js';
import { drawText, textWidth } from '../render/font.js';
import { drawFighter } from './sprites.js';
import { WORLD_W, WORLD_H, GROUND_Y, STAGE_LEFT, STAGE_RIGHT, ENTROPY, TESTIMONY, attackActive, attackExtension } from './engine.js';
import { SPRITES } from './sprite-set.js';
import { STAGES } from './stage-set.js';
import { specialMoveForAttack } from './moves.js';
import type { Fighter, Match } from './types.js';

const FIGHTER_H = 58; // standing fighter height in WORLD units

/** Map engine state to a generated sprite frame name. */
function frameName(f: Fighter): string {
  const ext = attackExtension(f);
  switch (f.pose) {
    case 'idle': return Math.floor(f.animT / 12) % 2 ? 'idle_2' : 'idle_1';
    case 'walk': return Math.floor(f.walkPhase) % 2 ? 'walk_2' : 'walk_1';
    case 'punch': return ext < 0.5 ? 'punch_1' : 'punch_2';
    case 'kick': return ext < 0.5 ? 'kick_1' : 'kick_2';
    case 'crouchpunch': return ext < 0.5 ? 'crouchpunch_1' : 'crouchpunch_2';
    case 'crouchkick': return ext < 0.5 ? 'crouchkick_1' : 'crouchkick_2';
    // hurricane kick is a whirling spin — cycle through 4 rotation frames
    case 'hurricane': return `hurricane_${1 + (Math.floor(f.attackFrame / 4) % 4)}`;
    case 'electric': return `electric_${1 + (Math.floor(f.attackFrame / 3) % 2)}`;
    case 'rolling': return `rolling_${1 + (Math.floor(f.attackFrame / 3) % 4)}`;
    case 'verticalroll': return `rolling_${1 + (Math.floor(f.attackFrame / 2) % 4)}`;
    case 'testimony': return `testimony_${f.attackFrame < TESTIMONY.startup ? 1 : (f.attackFrame < 17 ? 2 : 3)}`;
    case 'nullstep': return `nullstep_${f.attackFrame < 4 ? 1 : (f.attackFrame < 7 ? 2 : (f.attackFrame < 11 ? 3 : 4))}`;
    case 'entropy': return `entropy_${f.attackFrame < 8 ? 1 : (f.attackFrame < 27 ? 2 : 3)}`;
    default: return f.pose;
  }
}

const SKY_TOP = rgb(58, 40, 92);
const SKY_BOT = rgb(196, 108, 96);
const FLOOR = rgb(74, 54, 40);
const FLOOR_LINE = rgb(120, 92, 62);
const BUILDING = rgb(70, 48, 74);
const SUN = rgb(240, 214, 150);
const HP_BACK = rgb(40, 20, 20);
const HP_FRONT = rgb(224, 196, 40);
const HP_MID = rgb(246, 142, 36);
const HP_LOW = rgb(210, 48, 40);
const HP_BORDER = rgb(230, 230, 210);
const WHITE = rgb(240, 240, 230);
const SHADOW = rgb(30, 22, 34);
const HUD_INK = rgb(12, 10, 22);
const HUD_PANEL = rgb(34, 27, 52);
const HUD_GOLD = rgb(250, 214, 72);
const HUD_CYAN = rgb(82, 220, 238);
const HUD_MAGENTA = rgb(238, 88, 170);
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

interface View { ws: number; ox: number; oy: number; pw: number; ph: number; }
function makeView(pw: number, ph: number): View {
  const ws = Math.min(pw / WORLD_W, ph / WORLD_H);
  return { ws, ox: Math.round((pw - WORLD_W * ws) / 2), oy: Math.round((ph - WORLD_H * ws) / 2), pw, ph };
}
const px = (v: View, x: number) => Math.round(v.ox + x * v.ws);
const py = (v: View, y: number) => Math.round(v.oy + y * v.ws);
function wrect(g: PixelGrid, v: View, x: number, y: number, w: number, h: number, c: RGB): void {
  fillRect(g, px(v, x), py(v, y), Math.max(1, Math.round(w * v.ws)), Math.max(1, Math.round(h * v.ws)), c);
}

function drawBackground(g: PixelGrid, v: View): void {
  fillRect(g, 0, 0, v.pw, v.ph, rgb(0, 0, 0)); // letterbox
  const x0 = px(v, 0), spanW = Math.round(WORLD_W * v.ws);
  for (let ypix = 0; ypix < v.ph; ypix++) {
    const wy = (ypix - v.oy) / v.ws;
    if (wy < 0 || wy > WORLD_H) continue;
    let c: RGB;
    if (wy < GROUND_Y) { const t = wy / GROUND_Y; c = rgb(lerp(SKY_TOP.r, SKY_BOT.r, t), lerp(SKY_TOP.g, SKY_BOT.g, t), lerp(SKY_TOP.b, SKY_BOT.b, t)); }
    else c = FLOOR;
    fillRect(g, x0, ypix, spanW, 1, c);
  }
  wrect(g, v, WORLD_W / 2 - 14, 24, 28, 28, SUN);
  for (let i = 0; i < 10; i++) { const bw = 14 + ((i * 37) % 18), bh = 30 + ((i * 53) % 40); wrect(g, v, i * 24, GROUND_Y - bh, bw, bh, BUILDING); }
  wrect(g, v, 0, GROUND_Y, WORLD_W, 2, FLOOR_LINE);
  for (let x = 0; x < WORLD_W; x += 12) wrect(g, v, x, GROUND_Y + 6, 6, 1, FLOOR_LINE);
}

function drawFighterOnStage(g: PixelGrid, v: View, f: Fighter): void {
  const shW = Math.max(8, 26 - Math.round(f.y / 3));
  wrect(g, v, f.x - shW / 2, GROUND_Y - 1, shW, 2, SHADOW);
  const targetH = Math.max(8, Math.round(FIGHTER_H * v.ws));
  const feetX = v.ox + f.x * v.ws, feetY = v.oy + (GROUND_Y - f.y) * v.ws;

  const placed = SPRITES.getScaled(f.name, frameName(f), f.facing, targetH);
  if (placed) {
    blit(g, placed.grid, Math.round(feetX - placed.anchorX), Math.round(feetY - placed.anchorY), false);
    return;
  }
  // procedural fallback, scaled to match
  const proc = drawFighter(f.pose, f.palette, f.pose === 'walk' ? f.walkPhase : f.animT * 0.14, attackExtension(f));
  const { grid } = resizeGridH(proc, targetH);
  const gw = grid[0]?.length ?? 0, gh = grid.length;
  blit(g, grid, Math.round(feetX - gw / 2), Math.round(feetY - gh * 0.96), f.facing === -1);
}

function drawSpecialAura(g: PixelGrid, v: View, f: Fighter): void {
  if (f.attack !== 'electric' || !attackActive(f)) return;
  const effect = specialMoveForAttack(f.name, 'electric')?.effect;
  if (!effect) return;
  const cy = GROUND_Y - f.y - 29;
  const phase = f.attackFrame % 4;
  if (effect === 'wind') {
    const pale = rgb(188, 244, 250), cyan = rgb(82, 190, 216);
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const y = cy - 24 + i * 8;
      const x = f.x + side * (15 + ((phase + i * 5) % 10));
      wrect(g, v, x - side * 5, y, 7, 1, i % 2 ? pale : cyan);
      wrect(g, v, x - side * 2, y + 2, 4, 1, cyan);
    }
    return;
  }
  if (effect === 'flame') {
    const hot = rgb(255, 232, 92), orange = rgb(255, 124, 32), red = rgb(208, 48, 26);
    for (let i = 0; i < 12; i++) {
      const x = f.x - 22 + ((i * 13 + phase * 5) % 46);
      const y = cy + 23 - ((i * 9 + f.attackFrame * 3) % 50);
      wrect(g, v, x, y, 2, 3, i % 3 === 0 ? hot : (i % 2 ? orange : red));
      wrect(g, v, x, y - 2, 1, 2, hot);
    }
    return;
  }
  const blue = phase < 2 ? rgb(86, 186, 255) : rgb(214, 246, 255);
  const white = rgb(244, 255, 255);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const y = cy - 24 + i * 7;
    const x = f.x + side * (13 + ((i * 7 + phase * 3) % 11));
    wrect(g, v, x, y, 2, 2, i % 3 === 0 ? white : blue);
    wrect(g, v, x - side * 3, y + 2, 4, 1, blue);
    wrect(g, v, x - side * 2, y + 3, 2, 2, white);
  }
}

/** Omega's specials are renderer-native phenomena, not recolored legacy effects. */
function drawOmegaTech(g: PixelGrid, v: View, f: Fighter): void {
  const red = rgb(242, 34, 48), deep = rgb(112, 8, 24), hot = rgb(255, 224, 184);
  if (f.attack === 'testimony') {
    const originX = f.x + f.facing * 18, originY = GROUND_Y - f.y - 34;
    if (!attackActive(f)) {
      if (f.attackFrame < TESTIMONY.startup) {
        const r = 2 + Math.floor(f.attackFrame / 3);
        fillCircle(g, v, originX, originY, r, f.attackFrame % 2 ? red : hot);
      }
      return;
    }
    const endX = f.facing === 1 ? STAGE_RIGHT + 18 : STAGE_LEFT - 18;
    const x = Math.min(originX, endX), width = Math.abs(endX - originX);
    wrect(g, v, x, originY - 5, width, 11, deep);
    wrect(g, v, x, originY - 3, width, 7, red);
    wrect(g, v, x, originY - 1, width, 3, hot);
    for (let i = 0; i < 9; i++) {
      const sx = originX + f.facing * (10 + i * 17 + (f.attackFrame % 3) * 3);
      wrect(g, v, f.facing === 1 ? sx : sx - 7, originY - 9 + (i % 3) * 6, 7, 1, i % 2 ? red : hot);
    }
    return;
  }
  if (f.attack === 'nullstep') {
    const fade = Math.max(1, 7 - Math.abs(f.attackFrame - 6));
    for (let i = 1; i <= 4; i++) {
      const trailX = f.x - f.facing * (i * 8 + fade);
      const y = GROUND_Y - 50 + i * 6;
      const wide = 5 + i * 2, thin = 3 + i;
      wrect(g, v, f.facing === 1 ? trailX : trailX - wide, y, wide, 2, i % 2 ? deep : red);
      const thinX = trailX - f.facing * 2;
      wrect(g, v, f.facing === 1 ? thinX : thinX - thin, y + 5, thin, 1, red);
    }
    return;
  }
  if (f.attack === 'entropy') {
    const wellX = f.x + f.facing * ENTROPY.wellOffset;
    const wellY = GROUND_Y - 17;
    const live = attackActive(f);
    const phase = f.attackFrame % 6;
    const radius = live ? 15 + (phase < 3 ? phase : 6 - phase) : Math.max(3, Math.min(11, f.attackFrame));
    fillCircle(g, v, wellX, wellY, radius + 5, deep);
    fillCircle(g, v, wellX, wellY, radius, red);
    fillCircle(g, v, wellX, wellY, Math.max(2, radius - 5), rgb(18, 10, 24));
    fillCircle(g, v, wellX, wellY, 2, hot);
    if (live) {
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const sx = wellX + side * (radius + 7 + (i * 3) % 11);
        const sy = wellY - 13 + i * 4;
        wrect(g, v, side === 1 ? sx : sx - 6, sy, 6, 1, i % 3 === 0 ? hot : red);
      }
    }
  }
}

// ---- renderer-native fight HUD ----
// The HUD is part of the same PixelGrid as the stage and fighters. It therefore
// gets the same octant/half-block renderer, scaling and cell-diff treatment.
function diamond(g: PixelGrid, v: View, cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) wrect(g, v, cx - (r - Math.abs(y)), cy + y, (r - Math.abs(y)) * 2 + 1, 1, c);
}

function drawHealthBar(g: PixelGrid, v: View, f: Fighter, side: 'left' | 'right'): void {
  const barW = 92, barH = 8, x = side === 'left' ? 6 : WORLD_W - 6 - barW, y = 8;
  wrect(g, v, x - 3, y - 3, barW + 6, barH + 14, HUD_INK);
  wrect(g, v, x - 2, y - 2, barW + 4, barH + 4, HUD_GOLD);
  wrect(g, v, x - 1, y - 1, barW + 2, barH + 2, HP_BORDER);
  wrect(g, v, x, y, barW, barH, HP_BACK);
  const fillW = Math.round((Math.max(0, Math.min(100, f.hp)) / 100) * barW);
  const base = f.hp <= 30 ? HP_LOW : (f.hp <= 55 ? HP_MID : HP_FRONT);
  const hi = f.hp <= 30 ? rgb(255, 104, 72) : (f.hp <= 55 ? rgb(255, 194, 64) : rgb(255, 240, 104));
  if (fillW > 0) {
    const fx = side === 'left' ? x : x + barW - fillW;
    wrect(g, v, fx, y, fillW, 2, hi);
    wrect(g, v, fx, y + 2, fillW, barH - 2, base);
    wrect(g, v, side === 'left' ? fx + fillW - 1 : fx, y, 1, barH, WHITE);
  }
  // Ten subtle chunks make damage immediately legible without extra text.
  for (let i = 1; i < 10; i++) wrect(g, v, x + i * barW / 10, y + 5, 1, 3, HUD_INK);
  const accent = side === 'left' ? HUD_CYAN : HUD_MAGENTA;
  wrect(g, v, side === 'left' ? x - 1 : x + barW - 2, y + barH + 2, 3, 6, accent);
  const s = Math.max(1, Math.round(v.ws));
  const nameX = side === 'left' ? px(v, x + 4) : px(v, x + barW - 4) - textWidth(f.name, s);
  drawText(g, f.name, nameX + s, py(v, y + barH + 4) + s, HUD_INK, s);
  drawText(g, f.name, nameX, py(v, y + barH + 4), WHITE, s);
  for (let i = 0; i < f.wins; i++) diamond(g, v, side === 'left' ? x + barW - 4 - i * 6 : x + 4 + i * 6, y + barH + 5, 2, HUD_GOLD);
}

function drawTimer(g: PixelGrid, v: View, m: Match, practice: boolean): void {
  // Chamfered badge, built from world pixels so it stays sharp at every zoom.
  const x = WORLD_W / 2 - 13, y = 3, w = 26, h = 29;
  wrect(g, v, x + 3, y, w - 6, h, HUD_INK); wrect(g, v, x, y + 3, w, h - 6, HUD_INK);
  wrect(g, v, x + 3, y + 1, w - 6, h - 2, HUD_GOLD); wrect(g, v, x + 1, y + 3, w - 2, h - 6, HUD_GOLD);
  wrect(g, v, x + 3, y + 3, w - 6, h - 6, HUD_PANEL);
  const label = practice ? 'TRAIN' : `R${m.round}`;
  const ls = Math.max(1, Math.round(v.ws));
  drawText(g, label, Math.round(px(v, WORLD_W / 2) - textWidth(label, ls) / 2), py(v, 6), practice ? HUD_CYAN : HUD_GOLD, ls);
  const t = practice ? '--' : String(Math.max(0, Math.ceil(m.roundTime))).padStart(2, '0');
  const s = Math.max(2, Math.round(2 * v.ws));
  drawText(g, t, Math.round(px(v, WORLD_W / 2) - textWidth(t, s) / 2) + s, py(v, 15) + s, HUD_INK, s);
  drawText(g, t, Math.round(px(v, WORLD_W / 2) - textWidth(t, s) / 2), py(v, 15), WHITE, s);
}
function drawCenterMessage(g: PixelGrid, v: View, msg: string): void {
  if (!msg) return;
  const s = Math.max(3, Math.round(3 * v.ws)), x = Math.round(px(v, WORLD_W / 2) - textWidth(msg, s) / 2), y = py(v, 54);
  drawText(g, msg, x + s, y + s, HUD_INK, s);
  drawText(g, msg, x, y, HUD_GOLD, s);
}

// Motifs update at 7.5 Hz and touch only a few compact regions. That preserves
// animation and depth while keeping the SSH cell diff far below a full redraw.
const MOTIFS_ON = process.env.SF_MOTIFS !== '0';

function drift(g: PixelGrid, v: View, t: number, count: number, colors: RGB[], rise = false, slant = 0): void {
  const period = WORLD_H + 20;
  for (let i = 0; i < count; i++) {
    const travel = (t * (0.28 + (i % 4) * 0.07) + i * 31) % period;
    const y = rise ? GROUND_Y - travel : travel - 10;
    const x = ((i * 53 + t * slant) % (WORLD_W + 20)) - 10 + Math.sin(t * 0.04 + i) * 5;
    wrect(g, v, x, y, i % 3 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1, colors[i % colors.length]!);
  }
}

function birds(g: PixelGrid, v: View, t: number): void {
  const cyc = t % 600;
  if (cyc < 170) {
    for (let k = 0; k < 4; k++) {
      const bx = -16 + cyc * 1.5 + k * 13;
      const by = 32 + k * 4 + Math.sin(cyc * 0.12 + k) * 3;
      const flap = Math.sin(t * 0.5 + k) > 0 ? 0 : 1;
      const c = rgb(46, 34, 44);
      wrect(g, v, bx - 2, by + flap, 2, 1, c); wrect(g, v, bx + 1, by + flap, 2, 1, c); wrect(g, v, bx, by, 1, 1, c);
    }
  }
}

function drawMotifs(g: PixelGrid, v: View, frame: number, stage: string): void {
  const t = Math.floor(frame / 4);
  if (stage === 'dojo') {
    drift(g, v, t, 11, [rgb(255, 190, 215), rgb(255, 150, 194), rgb(250, 224, 232)], false, 0.035);
    drift(g, v, t, 6, [rgb(255, 238, 120), rgb(255, 168, 92)], true, 0.01);
    birds(g, v, t);
    return;
  }
  if (stage === 'market') {
    drift(g, v, t, 8, [rgb(255, 220, 92), rgb(255, 138, 74), rgb(250, 182, 118)], true, 0.025);
    for (let i = 0; i < 5; i++) { const y = 121 - ((t * 0.45 + i * 7) % 26); const x = 24 + i * 46 + Math.sin(t * 0.08 + i) * 3; wrect(g, v, x, y, 3 + i % 2, 1, rgb(190, 174, 194)); }
    for (let i = 0; i < 6; i++) if ((t + i * 7) % 20 < 13) wrect(g, v, 22 + i * 39, 33 + (i % 2) * 9, 2, 2, rgb(255, 208, 92));
    return;
  }
  if (stage === 'jungle') {
    drift(g, v, t, 10, [rgb(126, 214, 82), rgb(214, 224, 92), rgb(78, 172, 72)], false, 0.02);
    for (let i = 0; i < 7; i++) { const x = 102 + ((i * 19 + t) % 48); const y = 113 + ((i * 7 + t / 2) % 14); wrect(g, v, x, y, 4, 1, rgb(196, 240, 236)); }
    for (let i = 0; i < 8; i++) if ((t + i * 11) % 24 < 15) wrect(g, v, 18 + (i * 29) % 210, 72 + (i * 17) % 55, 1, 1, rgb(224, 255, 116));
    return;
  }
  if (stage === 'airbase') {
    for (let i = 0; i < 9; i++) { const pulse = (t + i * 3) % 18 < 8; wrect(g, v, 38 + i * 21, 128 + (i % 2) * 3, 2, 1, pulse ? rgb(112, 190, 255) : rgb(52, 62, 90)); }
    for (let i = 0; i < 4; i++) { const x = 46 + ((t * 1.4 + i * 41) % 150); const y = 118 + i * 3; wrect(g, v, x, y, 10, 1, rgb(242, 188, 118)); }
    if (t % 30 < 10) { wrect(g, v, 14, 29, 3, 3, rgb(255, 62, 54)); wrect(g, v, 218, 34, 3, 3, rgb(255, 62, 54)); }
    birds(g, v, t + 210);
    return;
  }
  if (stage === 'monsoon') {
    drift(g, v, t, 13, [rgb(142, 180, 224), rgb(102, 146, 202)], false, 0.42);
    for (let i = 0; i < 8; i++) { const x = 12 + i * 31; const flicker = (t + i * 5) % 13 < 9; if (flicker) { wrect(g, v, x, 116 + (i % 2) * 5, 2, 3, rgb(255, 174, 54)); wrect(g, v, x, 115 + (i % 2) * 5, 1, 1, rgb(255, 242, 146)); } }
    for (let i = 0; i < 5; i++) { const r = 2 + ((t + i * 7) % 9); wrect(g, v, 28 + i * 44 - r, 140 + (i % 2) * 3, r * 2, 1, rgb(142, 126, 168)); }
    return;
  }
  if (stage === 'harbor') {
    drift(g, v, t, 14, [rgb(104, 154, 210), rgb(82, 122, 184)], false, 0.55);
    for (let i = 0; i < 7; i++) { const x = 60 + ((t * 1.3 + i * 31) % 145); wrect(g, v, x, 118 + (i % 3) * 3, 6 + i % 4, 1, rgb(170, 224, 238)); }
    if (t % 28 < 9) wrect(g, v, 205, 48, 4, 4, rgb(255, 220, 122));
    const beamY = 43 + Math.sin(t * 0.025) * 9;
    for (let i = 0; i < 7; i++) wrect(g, v, 174 - i * 7, beamY + i * 0.7, 6, 1, rgb(188, 204, 192));
    return;
  }
}

function fillCircle(g: PixelGrid, v: View, wx: number, wy: number, wr: number, c: RGB): void {
  for (let dy = -wr; dy <= wr; dy++) {
    const dw = Math.sqrt(Math.max(0, wr * wr - dy * dy));
    wrect(g, v, wx - dw, wy + dy, dw * 2, 1, c);
  }
}

const SPARK_PALETTES = [
  [rgb(255, 150, 30), rgb(255, 226, 110)],   // gold / fire
  [rgb(255, 84, 58), rgb(255, 198, 128)],    // red-orange
  [rgb(110, 214, 255), rgb(220, 250, 255)],  // icy blue
  [rgb(255, 116, 220), rgb(255, 220, 246)],  // magenta
  [rgb(176, 255, 120), rgb(240, 255, 214)],  // electric green
] as const;
const SPARK_CORE = rgb(255, 255, 246);
function ringPixels(g: PixelGrid, v: View, cx: number, cy: number, r: number, c: RGB): void {
  const steps = Math.max(8, Math.round(r * 4));
  for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; wrect(g, v, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, c); }
}
function ray(g: PixelGrid, v: View, cx: number, cy: number, a: number, len: number, near: RGB, far: RGB): void {
  for (let d = 1; d <= len; d++) wrect(g, v, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1, d < len * 0.5 ? near : far);
}

// Impact flashes — each hit gets a unique burst (seeded, so both players match):
// a starburst, a shockwave ring, a scatter, or a cross, in one of five colours.
function drawSparks(g: PixelGrid, v: View, m: Match): void {
  for (const s of m.sparks) {
    const cx = s.x, cy = GROUND_Y - s.y;
    const maxT = s.heavy ? 7 : 5;
    const age = maxT - s.t, prog = age / maxT;
    let seed = s.seed >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const [outer, mid] = SPARK_PALETTES[s.seed % SPARK_PALETTES.length]!;
    const baseR = (s.heavy ? 3 : 2) + age * (s.heavy ? 1.5 : 1.0);

    switch (s.seed % 4) {
      case 0: { // starburst
        const spikes = 4 + (s.seed % (s.heavy ? 5 : 3));
        const rot = rnd() * Math.PI, len = baseR + (s.heavy ? 4 : 2);
        for (let i = 0; i < spikes; i++) ray(g, v, cx, cy, rot + (i / spikes) * Math.PI * 2 + (rnd() - 0.5) * 0.5, len * (0.6 + rnd() * 0.7), mid, outer);
        fillCircle(g, v, cx, cy, baseR * 0.5, mid);
        fillCircle(g, v, cx, cy, Math.max(1, baseR * 0.5 - 2), SPARK_CORE);
        break;
      }
      case 1: { // shockwave ring
        ringPixels(g, v, cx, cy, 2 + prog * (s.heavy ? 11 : 8), prog < 0.5 ? mid : outer);
        fillCircle(g, v, cx, cy, Math.max(1, baseR * 0.45), SPARK_CORE);
        break;
      }
      case 2: { // scatter
        const dots = (s.heavy ? 8 : 5) + (s.seed % 4);
        for (let i = 0; i < dots; i++) { const a = rnd() * Math.PI * 2, dist = baseR * (0.3 + rnd() * 1.2); fillCircle(g, v, cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, 1 + Math.floor(rnd() * 2), rnd() < 0.5 ? outer : mid); }
        fillCircle(g, v, cx, cy, Math.max(1, baseR * 0.4), SPARK_CORE);
        break;
      }
      default: { // cross / X flash
        const arms = (s.seed % 2) ? [[1, 0], [-1, 0], [0, 1], [0, -1]] as const : [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const;
        const len = baseR + (s.heavy ? 3 : 1);
        for (const [dx, dy] of arms) ray(g, v, cx, cy, Math.atan2(dy, dx), len, mid, outer);
        fillCircle(g, v, cx, cy, baseR * 0.5, mid);
        fillCircle(g, v, cx, cy, Math.max(1, baseR * 0.5 - 1), SPARK_CORE);
      }
    }
  }
}

// energy fireballs (Hadouken)
function drawProjectiles(g: PixelGrid, v: View, m: Match): void {
  for (const p of m.projectiles) {
    const cx = p.x, cy = GROUND_Y - p.y;
    const r = 10 * (1 + Math.sin(p.frame * 0.6) * 0.12);
    if (p.style === 'fire') {
      for (let t = 4; t >= 1; t--) fillCircle(g, v, cx - p.facing * t * 5, cy, Math.max(1, r - t * 2), rgb(214, 48 + t * 10, 20));
      fillCircle(g, v, cx, cy, r, rgb(242, 74, 20));
      fillCircle(g, v, cx, cy, r - 3, rgb(255, 164, 38));
      fillCircle(g, v, cx, cy, r - 6, rgb(255, 244, 152));
    } else if (p.style === 'sonic') {
      for (let t = 3; t >= 1; t--) fillCircle(g, v, cx - p.facing * t * 6, cy, Math.max(1, r - t * 2.2), rgb(62, 172, 194));
      fillCircle(g, v, cx, cy, r + 1, rgb(100, 224, 236));
      fillCircle(g, v, cx + p.facing * 2, cy, r - 3, rgb(214, 255, 248));
      wrect(g, v, cx - p.facing * 7, cy - 1, 11, 2, rgb(238, 255, 250));
    } else {
      for (let t = 3; t >= 1; t--) fillCircle(g, v, cx - p.facing * t * 5, cy, Math.max(1, r - t * 2.4), rgb(66, 118, 236));
      fillCircle(g, v, cx, cy, r, rgb(74, 132, 255));
      fillCircle(g, v, cx, cy, r - 3, rgb(150, 212, 255));
      fillCircle(g, v, cx, cy, r - 6, rgb(236, 250, 255));
    }
  }
}

/** Render the stage at `pw`x`ph` pixels (defaults to the logical world size). */
export function composeScene(m: Match, hud = true, pw = WORLD_W, ph = WORLD_H, practice = false): PixelGrid {
  const v = makeView(pw, ph);
  const g = createGrid(pw, ph, rgb(0, 0, 0));
  const stage = STAGES.get(m.stage, Math.round(WORLD_H * v.ws));
  if (stage) blit(g, stage, v.ox, v.oy, false);
  else drawBackground(g, v);
  if (MOTIFS_ON) drawMotifs(g, v, m.frame, m.stage);
  const order = m.a.x <= m.b.x ? [m.a, m.b] : [m.b, m.a];
  for (const f of order) { drawFighterOnStage(g, v, f); drawSpecialAura(g, v, f); drawOmegaTech(g, v, f); }
  drawProjectiles(g, v, m);
  drawSparks(g, v, m);
  if (hud) {
    drawHealthBar(g, v, m.a, 'left');
    drawHealthBar(g, v, m.b, 'right');
    drawTimer(g, v, m, practice);
    drawCenterMessage(g, v, m.message);
  }
  return g;
}

// Both players of a versus match see the SAME pixel scene (it is not mirrored
// per-viewer — only the HUD text overlay differs). The two sessions render on
// their own timers but almost always at the same sim frame, so memoize the
// composed grid per (match, frame, size): the first session to render a frame
// composes it, the second reuses it for free. Halves the per-match scene cost.
const SCENE_CACHE = new WeakMap<Match, { frame: number; pw: number; ph: number; grid: PixelGrid }>();
export function composeSceneCached(m: Match, pw: number, ph: number, practice = false): PixelGrid {
  const c = SCENE_CACHE.get(m);
  if (c && c.frame === m.frame && c.pw === pw && c.ph === ph) return c.grid;
  const grid = composeScene(m, false, pw, ph, practice);
  SCENE_CACHE.set(m, { frame: m.frame, pw, ph, grid });
  return grid;
}

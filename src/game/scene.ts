// Compose the stage into a PixelGrid at an ARBITRARY resolution. The fight
// renders directly at the terminal's native pixel resolution (cols*2 x rows*4),
// so more cells => more world pixels => sharper sprites. A world->pixel scale
// maps the fixed 240x160 logical world onto whatever resolution is asked for,
// and sprites are downscaled from their high-res source to the on-screen size.
import { createGrid, fillRect, blit, resizeGridH, rgb, type PixelGrid, type RGB } from '../render/pixel.js';
import { drawFighter } from './sprites.js';
import { WORLD_W, WORLD_H, GROUND_Y, STAGE_LEFT, STAGE_RIGHT, ENTROPY, TESTIMONY, CONTEXT, BRANCHWALK, MERGE_COMET, attackActive, attackExtension } from './engine.js';
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
    case 'context': return `context_${f.attackFrame < CONTEXT.startup ? 1 : (f.attackFrame < CONTEXT.startup + CONTEXT.active ? 2 : 3)}`;
    case 'branchwalk': return `branchwalk_${f.attackFrame < BRANCHWALK.startup ? 1 : (f.attackFrame < BRANCHWALK.startup + BRANCHWALK.active ? 2 : 3)}`;
    case 'mergecomet': return `mergecomet_${f.attackFrame < MERGE_COMET.startup ? 1 : (f.attackFrame < MERGE_COMET.startup + MERGE_COMET.active ? 2 : 3)}`;
    default: return f.pose;
  }
}

const SKY_TOP = rgb(58, 40, 92);
const SKY_BOT = rgb(196, 108, 96);
const FLOOR = rgb(74, 54, 40);
const FLOOR_LINE = rgb(120, 92, 62);
const BUILDING = rgb(70, 48, 74);
const SUN = rgb(240, 214, 150);
const SHADOW = rgb(30, 22, 34);
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

/** Codex's aerial notation stays readable even when sprites are heavily downscaled. */
function drawCodexTrails(g: PixelGrid, v: View, f: Fighter): void {
  if (f.attack !== 'context' && f.attack !== 'branchwalk' && f.attack !== 'mergecomet') return;
  const teal = rgb(62, 226, 210), pale = rgb(224, 255, 242), copper = rgb(244, 142, 58);
  const cy = GROUND_Y - f.y - 28;
  if (f.attack === 'context') {
    for (let i = 0; i < 7; i++) {
      const x = f.x + (i % 2 ? 1 : -1) * (7 + i * 2);
      const y = cy + 22 + i * 7 + (f.attackFrame % 3);
      wrect(g, v, x, y, 1 + (i % 2), 5, i % 3 === 0 ? copper : teal);
    }
    return;
  }
  const active = attackActive(f);
  const count = active ? 7 : 4;
  for (let i = 1; i <= count; i++) {
    const x = f.x - f.facing * (8 + i * 6);
    const y = cy + (f.attack === 'mergecomet' ? -i * 3 : i % 2 ? -4 : 5);
    wrect(g, v, f.facing === 1 ? x : x - (4 + i), y, 4 + i, 1, i % 3 === 0 ? pale : (i % 2 ? teal : copper));
  }
}

// ---- renderer-native fight HUD ----

// Motifs update at 7.5 Hz and touch only a few compact regions. That preserves
// animation and depth while keeping the SSH cell diff far below a full redraw.
const MOTIFS_ON = process.env.SF_MOTIFS !== '0';

// ---------------------------------------------------------------------------
// Motif system. A stage's ambience is a data-driven STACK of motifs, each a
// small closure (g,v,t)->void built from a few reusable EMITTERS. Emitters come
// in two families:
//   • particles/effects — drift, rain, twinkle, glow, waves, beam, aurora, shaft
//   • positioned sprites — flyby (crossing) / floaters (drifting in place), each
//     rendered by a tiny procedural SpriteFn (bird, fish, book, cloud, star...).
// Add a stage or a new effect = add an entry / a function; no big if-else.
// ---------------------------------------------------------------------------
const dim = (c: RGB, f: number): RGB => rgb(Math.round(c.r * f), Math.round(c.g * f), Math.round(c.b * f));

interface DriftOpts { count: number; colors: RGB[]; rise?: boolean; slant?: number; speed?: number; }
function drift(g: PixelGrid, v: View, t: number, o: DriftOpts): void {
  const period = WORLD_H + 20, speed = o.speed ?? 1;
  for (let i = 0; i < o.count; i++) {
    const travel = (t * speed * (0.28 + (i % 4) * 0.07) + i * 31) % period;
    const y = o.rise ? GROUND_Y - travel : travel - 10;
    const x = ((i * 53 + t * (o.slant ?? 0)) % (WORLD_W + 20)) - 10 + Math.sin(t * 0.04 + i) * 5;
    wrect(g, v, x, y, i % 3 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1, o.colors[i % o.colors.length]!);
  }
}

interface RainOpts { count: number; color: RGB; slant?: number; len?: number; }
function rain(g: PixelGrid, v: View, t: number, o: RainOpts): void {
  const period = WORLD_H + 24, slant = o.slant ?? 0.7, len = o.len ?? 4;
  for (let i = 0; i < o.count; i++) {
    const travel = (t * (1.7 + (i % 3) * 0.5) + i * 23) % period;
    const x = ((i * 41 + t * slant * 3) % (WORLD_W + 30)) - 15;
    wrect(g, v, x, travel - 12, 1, len, o.color);
  }
}

interface TwinkleOpts { count: number; at: (i: number) => [number, number]; colors: RGB[]; period?: number; onFrac?: number; size?: number; }
function twinkle(g: PixelGrid, v: View, t: number, o: TwinkleOpts): void {
  const period = o.period ?? 14, onFrac = o.onFrac ?? 0.62, size = o.size ?? 1;
  for (let i = 0; i < o.count; i++) {
    if ((t + i * 5) % period < period * onFrac) { const [x, y] = o.at(i); wrect(g, v, x, y, size, size, o.colors[i % o.colors.length]!); }
  }
}

interface GlowOpts { count: number; at: (i: number) => [number, number]; w: number; h: number; hot: RGB; cool: RGB; period?: number; }
function glow(g: PixelGrid, v: View, t: number, o: GlowOpts): void {
  const period = o.period ?? 22;
  for (let i = 0; i < o.count; i++) { const [x, y] = o.at(i); wrect(g, v, x, y, o.w, o.h, (t + i * 3) % period < period / 2 ? o.hot : o.cool); }
}

interface WaveOpts { count: number; y: number; color: RGB; speed?: number; band?: number; x0?: number; }
function waves(g: PixelGrid, v: View, t: number, o: WaveOpts): void {
  const speed = o.speed ?? 1.3, band = o.band ?? 150, x0 = o.x0 ?? 55;
  for (let i = 0; i < o.count; i++) { const x = x0 + ((t * speed + i * 31) % band); wrect(g, v, x, o.y + (i % 3) * 3, 6 + (i % 4), 1, o.color); }
}

function beam(g: PixelGrid, v: View, t: number, o: { x: number; y: number; color: RGB; len?: number; step?: number; sway?: number }): void {
  const len = o.len ?? 7, step = o.step ?? 7, yy = o.y + Math.sin(t * 0.025) * (o.sway ?? 9);
  for (let i = 0; i < len; i++) wrect(g, v, o.x - i * step, yy + i * 0.7, 6, 1, o.color);
}

// --- positioned procedural sprites (tiny, drawn from a few rects) ---
type SpriteFn = (g: PixelGrid, v: View, x: number, y: number, t: number, dir: number, c: RGB) => void;
const bird: SpriteFn = (g, v, x, y, t, _d, c) => { const f = Math.sin(t * 0.5 + x) > 0 ? 0 : 1; wrect(g, v, x - 2, y + f, 2, 1, c); wrect(g, v, x + 1, y + f, 2, 1, c); wrect(g, v, x, y, 1, 1, c); };
const fish: SpriteFn = (g, v, x, y, t, dir, c) => { wrect(g, v, x, y, 3, 2, c); wrect(g, v, x - dir * 2, y - (Math.sin(t * 0.4 + x) > 0 ? 0 : 1), 2, 2, c); wrect(g, v, x + dir * 3, y, 1, 1, dim(c, 0.7)); };
const book: SpriteFn = (g, v, x, y, t, _d, c) => { const f = Math.round(Math.sin(t * 0.1 + x)); wrect(g, v, x - 3, y - f, 3, 1, c); wrect(g, v, x + 1, y - f, 3, 1, c); wrect(g, v, x, y + 1, 1, 1, dim(c, 0.6)); };
const cloud: SpriteFn = (g, v, x, y, _t, _d, c) => { wrect(g, v, x, y, 11, 3, c); wrect(g, v, x + 3, y - 2, 6, 2, c); wrect(g, v, x + 7, y, 7, 3, c); };
const star: SpriteFn = (g, v, x, y, _t, dir, c) => { wrect(g, v, x, y, 2, 2, c); for (let i = 1; i < 6; i++) wrect(g, v, x - i * 2 * dir, y - i, 2, 1, dim(c, 1 - i * 0.16)); };
const jelly: SpriteFn = (g, v, x, y, t, _d, c) => { wrect(g, v, x, y, 5, 3, c); wrect(g, v, x + 1, y - 1, 3, 1, c); for (let i = 0; i < 3; i++) wrect(g, v, x + 1 + i * 2, y + 3, 1, 3 + Math.round(Math.sin(t * 0.12 + i) * 1), dim(c, 0.8)); };

interface FlybyOpts { draw: SpriteFn; count: number; y: number; color: RGB; cycle?: number; span?: number; speed?: number; gap?: number; wave?: number; dir?: number; }
function flyby(g: PixelGrid, v: View, t: number, o: FlybyOpts): void {
  const cycle = o.cycle ?? 600, span = o.span ?? 180, speed = o.speed ?? 1.4, gap = o.gap ?? 13, wave = o.wave ?? 3, dir = o.dir ?? 1;
  const cyc = t % cycle; if (cyc >= span) return;
  for (let k = 0; k < o.count; k++) {
    const march = cyc * speed + k * gap;
    const x = dir === 1 ? -16 + march : WORLD_W + 16 - march;
    o.draw(g, v, x, o.y + k * 4 + Math.sin(cyc * 0.12 + k) * wave, t, dir, o.color);
  }
}

interface FloatOpts { draw: SpriteFn; count: number; x0: number; x1: number; y0: number; y1: number; color: RGB; speed?: number; bob?: number; }
function floaters(g: PixelGrid, v: View, t: number, o: FloatOpts): void {
  const spanX = o.x1 - o.x0, speed = o.speed ?? 0.15, bob = o.bob ?? 3;
  for (let k = 0; k < o.count; k++) {
    const x = o.x0 + ((k * (spanX / o.count) + t * speed) % spanX);
    const y = o.y0 + (o.y1 - o.y0) * ((k * 0.37) % 1) + Math.sin(t * 0.05 + k) * bob;
    o.draw(g, v, x, y, t, 1, o.color);
  }
}

// --- palettes ---
const PETAL = [rgb(255, 190, 215), rgb(255, 150, 194), rgb(250, 224, 232)];
const SMOKE = [rgb(255, 220, 92), rgb(255, 138, 74), rgb(250, 182, 118)];
const SPORE = [rgb(126, 214, 82), rgb(214, 224, 92), rgb(78, 172, 72)];
const DARK_BIRD = rgb(46, 34, 44);

// A stage's ambience: an ordered stack of motif closures.
type Motif = (g: PixelGrid, v: View, t: number) => void;
const STAGE_MOTIFS: Record<string, Motif[]> = {
  dojo: [
    (g, v, t) => drift(g, v, t, { count: 11, colors: PETAL, slant: 0.035 }),
    (g, v, t) => drift(g, v, t, { count: 6, colors: [rgb(255, 238, 120), rgb(255, 168, 92)], rise: true, slant: 0.01 }),
    (g, v, t) => flyby(g, v, t, { draw: bird, count: 4, y: 32, color: DARK_BIRD }),
  ],
  market: [
    (g, v, t) => drift(g, v, t, { count: 8, colors: SMOKE, rise: true, slant: 0.025 }),
    (g, v, t) => floaters(g, v, t, { draw: (gg, vv, x, y, _t, _d, c) => { wrect(gg, vv, x, y, 2, 3, c); wrect(gg, vv, x, y - 1, 1, 1, rgb(255, 240, 160)); }, count: 5, x0: 20, x1: 220, y0: 96, y1: 118, color: rgb(255, 150, 90), speed: -0.35, bob: 2 }),
    (g, v, t) => twinkle(g, v, t, { count: 6, at: (i) => [22 + i * 39, 33 + (i % 2) * 9], colors: [rgb(255, 208, 92)], period: 20, onFrac: 0.65, size: 2 }),
  ],
  jungle: [
    (g, v, t) => drift(g, v, t, { count: 10, colors: SPORE, slant: 0.02 }),
    (g, v, t) => twinkle(g, v, t, { count: 8, at: (i) => [18 + (i * 29) % 210, 72 + (i * 17) % 55], colors: [rgb(224, 255, 116)], period: 24, onFrac: 0.62 }),
    (g, v, t) => flyby(g, v, t, { draw: bird, count: 5, y: 40, color: rgb(120, 200, 150), cycle: 520, span: 200, speed: 1.2 }),
  ],
  airbase: [
    (g, v, t) => twinkle(g, v, t, { count: 9, at: (i) => [38 + i * 21, 128 + (i % 2) * 3], colors: [rgb(112, 190, 255)], period: 18, onFrac: 0.45, size: 2 }),
    (g, v, t) => waves(g, v, t, { count: 4, y: 118, color: rgb(242, 188, 118), speed: 1.4, band: 150, x0: 46 }),
    (g, v, t) => twinkle(g, v, t, { count: 2, at: (i) => [i ? 218 : 14, i ? 34 : 29], colors: [rgb(255, 62, 54)], period: 30, onFrac: 0.34, size: 3 }),
    (g, v, t) => flyby(g, v, t, { draw: bird, count: 3, y: 30, color: DARK_BIRD, cycle: 700 }),
  ],
  monsoon: [
    (g, v, t) => rain(g, v, t, { count: 26, color: rgb(150, 186, 226), slant: 0.42, len: 5 }),
    (g, v, t) => twinkle(g, v, t, { count: 8, at: (i) => [12 + i * 31, 116 + (i % 2) * 5], colors: [rgb(255, 174, 54), rgb(255, 242, 146)], period: 13, onFrac: 0.7, size: 2 }),
    (g, v, t) => waves(g, v, t, { count: 5, y: 140, color: rgb(142, 126, 168), speed: 0.9, band: 44, x0: 28 }),
  ],
  harbor: [
    (g, v, t) => rain(g, v, t, { count: 30, color: rgb(120, 160, 214), slant: 0.55, len: 6 }),
    (g, v, t) => waves(g, v, t, { count: 7, y: 118, color: rgb(170, 224, 238) }),
    (g, v, t) => glow(g, v, t, { count: 1, at: () => [205, 48], w: 4, h: 4, hot: rgb(255, 220, 122), cool: rgb(120, 96, 40), period: 28 }),
    (g, v, t) => beam(g, v, t, { x: 174, y: 43, color: rgb(188, 204, 192) }),
  ],
  volcano: [
    (g, v, t) => drift(g, v, t, { count: 16, colors: [rgb(255, 190, 70), rgb(255, 120, 40), rgb(255, 80, 40)], rise: true, slant: 0.03, speed: 1.4 }),
    (g, v, t) => drift(g, v, t, { count: 8, colors: [rgb(80, 66, 70), rgb(120, 100, 100)], slant: 0.05, speed: 0.6 }),
    (g, v, t) => glow(g, v, t, { count: 7, at: (i) => [16 + i * 30, 138 + (i % 3)], w: 12, h: 2, hot: rgb(255, 150, 40), cool: rgb(150, 40, 20), period: 20 }),
    (g, v, t) => flyby(g, v, t, { draw: bird, count: 3, y: 34, color: rgb(30, 20, 24), cycle: 520, span: 180, speed: 1.6 }),
  ],
  tundra: [
    (g, v, t) => drift(g, v, t, { count: 24, colors: [rgb(235, 245, 255), rgb(200, 224, 248)], slant: 0.06, speed: 0.6 }),
    (g, v, t) => twinkle(g, v, t, { count: 12, at: (i) => [10 + (i * 37) % 220, 6 + (i * 13) % 26], colors: [rgb(230, 240, 255)], period: 22, onFrac: 0.5 }),
    (g, v, t) => flyby(g, v, t, { draw: star, count: 1, y: 20, color: rgb(220, 245, 255), cycle: 480, span: 90, speed: 3 }),
  ],
  neon: [
    (g, v, t) => rain(g, v, t, { count: 34, color: rgb(120, 200, 235), slant: 0.5, len: 6 }),
    (g, v, t) => twinkle(g, v, t, { count: 14, at: (i) => [12 + (i * 31) % 224, 26 + (i * 23) % 74], colors: [rgb(255, 80, 190), rgb(80, 230, 255), rgb(190, 120, 255)], period: 10, onFrac: 0.62, size: 2 }),
    (g, v, t) => flyby(g, v, t, { draw: star, count: 2, y: 44, color: rgb(120, 235, 255), cycle: 260, span: 120, speed: 3.4, dir: 1, gap: 40 }),
    (g, v, t) => waves(g, v, t, { count: 6, y: 122, color: rgb(200, 120, 240), speed: 1.1 }),
  ],
  observatory: [
    (g, v, t) => drift(g, v, t, { count: 14, colors: [rgb(214, 226, 255), rgb(180, 190, 240)], slant: 0.015, speed: 0.4 }),
    (g, v, t) => twinkle(g, v, t, { count: 18, at: (i) => [8 + (i * 29) % 224, 4 + (i * 19) % 44], colors: [rgb(235, 240, 255), rgb(190, 210, 255)], period: 20, onFrac: 0.55 }),
    (g, v, t) => twinkle(g, v, t, { count: 6, at: (i) => [24 + i * 40, 128 + (i % 2) * 4], colors: [rgb(255, 210, 120), rgb(255, 240, 170)], period: 14, onFrac: 0.72, size: 2 }),
    (g, v, t) => floaters(g, v, t, { draw: book, count: 4, x0: 30, x1: 214, y0: 60, y1: 100, color: rgb(224, 216, 190), speed: 0.2, bob: 4 }),
    (g, v, t) => flyby(g, v, t, { draw: star, count: 1, y: 24, color: rgb(240, 245, 255), cycle: 520, span: 100, speed: 3 }),
  ],
  reef: [
    (g, v, t) => drift(g, v, t, { count: 22, colors: [rgb(200, 245, 255), rgb(150, 220, 240)], rise: true, slant: 0.04, speed: 0.7 }),
    (g, v, t) => flyby(g, v, t, { draw: fish, count: 5, y: 56, color: rgb(255, 176, 90), cycle: 340, span: 220, speed: 1.3, gap: 10, wave: 4 }),
    (g, v, t) => flyby(g, v, t, { draw: fish, count: 4, y: 88, color: rgb(120, 210, 235), cycle: 300, span: 220, speed: 1.6, gap: 12, wave: 5, dir: -1 }),
    (g, v, t) => floaters(g, v, t, { draw: jelly, count: 3, x0: 24, x1: 214, y0: 34, y1: 78, color: rgb(230, 150, 220), speed: 0.12, bob: 5 }),
  ],
};

function drawMotifs(g: PixelGrid, v: View, frame: number, stage: string): void {
  const t = Math.floor(frame / 4);
  const motifs = STAGE_MOTIFS[stage];
  if (motifs) for (const m of motifs) m(g, v, t);
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
// The in-fight HUD (health bars, timer, names, announcements) is drawn as
// constant-size pixel UI by screens/fight-hud.ts, composited over this scene —
// so composeScene renders only the world (stage, fighters, projectiles, sparks).
export function composeScene(m: Match, pw = WORLD_W, ph = WORLD_H, practice = false): PixelGrid {
  void practice;
  const v = makeView(pw, ph);
  const g = createGrid(pw, ph, rgb(0, 0, 0));
  const stage = STAGES.get(m.stage, Math.round(WORLD_H * v.ws));
  if (stage) blit(g, stage, v.ox, v.oy, false);
  else drawBackground(g, v);
  if (MOTIFS_ON) drawMotifs(g, v, m.frame, m.stage);
  const order = m.a.x <= m.b.x ? [m.a, m.b] : [m.b, m.a];
  for (const f of order) { drawFighterOnStage(g, v, f); drawSpecialAura(g, v, f); drawOmegaTech(g, v, f); drawCodexTrails(g, v, f); }
  drawProjectiles(g, v, m);
  drawSparks(g, v, m);
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
  const grid = composeScene(m, pw, ph, practice);
  SCENE_CACHE.set(m, { frame: m.frame, pw, ph, grid });
  return grid;
}

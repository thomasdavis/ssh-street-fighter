// Loads generated sprites (packed RGBA at high resolution) and serves them by
// character + frame name, downscaled to the exact on-screen size on demand and
// mirrored for left-facing. Holding bytes (not per-pixel objects) keeps memory
// small while allowing high fidelity when the terminal is zoomed way out.
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resizeRGBA, type PixelGrid } from '../render/pixel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '../../assets/sprites');

interface Frame { w: number; h: number; anchorX: number; anchorY: number; rgba: Uint8Array; }
export interface Placed { grid: PixelGrid; anchorX: number; anchorY: number; }
const MAX_SCALE_CACHE = 128;

class SpriteSet {
  private frames = new Map<string, Frame>();
  private missing = new Set<string>();
  private scaleCache = new Map<string, Placed>();

  /** Load one pose on first use; selection needs one idle frame per fighter, not every animation. */
  private loadFrame(charId: string, name: string): Frame | null {
    const id = charId.toUpperCase();
    const key = `${id}/${name}`;
    const cached = this.frames.get(key);
    if (cached) return cached;
    if (this.missing.has(key)) return null;
    try {
      const s = JSON.parse(readFileSync(resolve(BASE, id, `${name}.json`), 'utf8')) as { w: number; h: number; anchorX: number; anchorY: number; data: string };
      if (!s.data) throw new Error('empty sprite');
      const frame = { w: s.w, h: s.h, anchorX: s.anchorX, anchorY: s.anchorY, rgba: new Uint8Array(Buffer.from(s.data, 'base64')) };
      this.frames.set(key, frame);
      return frame;
    } catch {
      this.missing.add(key);
      return null;
    }
  }

  has(charId: string): boolean { return existsSync(resolve(BASE, charId.toUpperCase(), 'idle_1.json')); }

  /**
   * Get a frame sized so a full STANDING pose is `standH` on-screen pixels tall;
   * other poses scale RELATIVE to the standing reference (a crouch stays short,
   * a KO stays flat), mirrored for left.
   */
  getScaled(charId: string, name: string, facing: 1 | -1, standH: number): Placed | null {
    const cid = charId.toUpperCase();
    const f = this.loadFrame(cid, name);
    if (!f) return null;
    const ref = name === 'idle_1' ? f.h : (this.loadFrame(cid, 'idle_1')?.h ?? f.h);
    const targetH = Math.max(1, Math.round(standH * f.h / ref));
    const key = `${charId}|${name}|${facing}|${targetH}`;
    const cached = this.scaleCache.get(key);
    if (cached) {
      this.scaleCache.delete(key);
      this.scaleCache.set(key, cached);
      return cached;
    }
    const grid = resizeRGBA(f.rgba, f.w, f.h, targetH, facing === -1);
    const factor = targetH / f.h;
    const tw = grid[0]?.length ?? 0;
    const ax = Math.round(f.anchorX * factor);
    const placed: Placed = { grid, anchorX: facing === -1 ? tw - 1 - ax : ax, anchorY: Math.round(f.anchorY * factor) };
    if (this.scaleCache.size >= MAX_SCALE_CACHE) {
      const oldest = this.scaleCache.keys().next().value as string | undefined;
      if (oldest) this.scaleCache.delete(oldest);
    }
    this.scaleCache.set(key, placed);
    return placed;
  }
}

export const SPRITES = new SpriteSet();

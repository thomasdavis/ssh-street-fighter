// Lazy loader and scale cache for image-generated projectile art.
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resizeRGBA, type PixelGrid } from '../render/pixel.js';
import type { Projectile } from './types.js';

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/projectiles');
export const PROJECTILE_STYLES = ['blue', 'fire', 'sonic', 'citation', 'knowledge', 'mote', 'construct', 'rope', 'boomerang'] as const satisfies readonly Projectile['style'][];

interface Frame { w: number; h: number; anchorX: number; anchorY: number; rgba: Uint8Array }
interface Placed { grid: PixelGrid; anchorX: number; anchorY: number }

class ProjectileSet {
  private frames = new Map<string, Frame>();
  private missing = new Set<string>();
  private scaleCache = new Map<string, Placed>();

  private load(style: Projectile['style']): Frame | null {
    const cached = this.frames.get(style);
    if (cached) return cached;
    if (this.missing.has(style)) return null;
    try {
      const packed = JSON.parse(readFileSync(resolve(BASE, `${style}.json`), 'utf8')) as { w: number; h: number; anchorX: number; anchorY: number; data: string };
      const frame = { ...packed, rgba: new Uint8Array(Buffer.from(packed.data, 'base64')) };
      this.frames.set(style, frame);
      return frame;
    } catch {
      this.missing.add(style);
      return null;
    }
  }

  getScaled(style: Projectile['style'], facing: 1 | -1, targetH: number): Placed | null {
    const frame = this.load(style);
    if (!frame) return null;
    const height = Math.max(1, Math.round(targetH));
    const key = `${style}|${facing}|${height}`;
    const cached = this.scaleCache.get(key);
    if (cached) return cached;
    const grid = resizeRGBA(frame.rgba, frame.w, frame.h, height, facing === -1, 48);
    const factor = height / frame.h;
    const width = grid[0]?.length ?? 0;
    const anchorX = Math.round(frame.anchorX * factor);
    const placed = {
      grid,
      anchorX: facing === -1 ? width - 1 - anchorX : anchorX,
      anchorY: Math.round(frame.anchorY * factor),
    };
    if (this.scaleCache.size > 80) this.scaleCache.clear();
    this.scaleCache.set(key, placed);
    return placed;
  }
}

export const PROJECTILES = new ProjectileSet();

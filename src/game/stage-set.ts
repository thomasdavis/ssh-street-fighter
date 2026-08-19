// Loads generated stage backgrounds (packed opaque RGBA) and serves them
// resized to the on-screen world size, cached.
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomInt } from 'crypto';
import { resizeRGBA, type PixelGrid } from '../render/pixel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = resolve(__dirname, '../../assets/stages');

interface Stage { w: number; h: number; rgba: Uint8Array; }
const MAX_SCALE_CACHE = 8;

class StageSet {
  private stages = new Map<string, Stage>();
  private cache = new Map<string, PixelGrid>();
  private loaded = false;

  private ensure(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!existsSync(BASE)) return;
    for (const file of readdirSync(BASE)) {
      if (!file.endsWith('.json')) continue;
      try {
        const s = JSON.parse(readFileSync(resolve(BASE, file), 'utf8')) as { w: number; h: number; data: string };
        this.stages.set(file.replace('.json', ''), { w: s.w, h: s.h, rgba: new Uint8Array(Buffer.from(s.data, 'base64')) });
      } catch { /* skip */ }
    }
  }

  has(id: string): boolean { this.ensure(); return this.stages.has(id); }
  ids(): string[] { this.ensure(); return [...this.stages.keys()]; }
  /** A random loaded stage id (falls back to 'dojo' if none are present). Uses the
   *  OS CSPRNG, not Math.random(): cluster workers can inherit the same V8 PRNG
   *  seed at fork time, which made freshly-forked workers pick identical stages. */
  pick(): string {
    const list = this.ids();
    return list.length ? list[randomInt(list.length)]! : 'dojo';
  }

  /** Stage resized to `targetH` px tall (aspect-preserved → 3:2 world region). */
  get(id: string, targetH: number): PixelGrid | null {
    this.ensure();
    const s = this.stages.get(id);
    if (!s) return null;
    const key = `${id}|${targetH}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const grid = resizeRGBA(s.rgba, s.w, s.h, targetH, false, 0);
    if (this.cache.size >= MAX_SCALE_CACHE) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, grid);
    return grid;
  }
}

export const STAGES = new StageSet();

// Montage of a character's poses at their TRUE relative sizes (feet-aligned) so
// we can judge proportion consistency.  tsx src/tools/proof-sheet.ts BYU
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGrid, fillRect, resizeRGBA, rgb, type PixelGrid } from '../render/pixel.js';
import { drawText } from '../render/font.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../assets/sprites');
const id = (process.argv[2] ?? 'BYU').toUpperCase();
const dir = resolve(OUT, id);

interface Packed { w: number; h: number; anchorX: number; anchorY: number; data: string; }
const load = (name: string): Packed => JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8'));

const order = ['idle_1', 'idle_2', 'walk_1', 'walk_2', 'crouch', 'jump', 'fall', 'block', 'crouchblock', 'hit',
  'ko', 'punch_1', 'punch_2', 'kick_1', 'kick_2', 'crouchpunch_1', 'crouchpunch_2', 'crouchkick_1', 'crouchkick_2',
  'hadouken', 'shoryuken', 'hurricane_1', 'hurricane_2', 'hurricane_3', 'hurricane_4',
  'testimony_1', 'testimony_2', 'testimony_3',
  'nullstep_1', 'nullstep_2', 'nullstep_3', 'nullstep_4',
  'entropy_1', 'entropy_2', 'entropy_3',
  'context_1', 'context_2', 'context_3',
  'branchwalk_1', 'branchwalk_2', 'branchwalk_3',
  'mergecomet_1', 'mergecomet_2', 'mergecomet_3',
  'storyarc_1', 'storyarc_2', 'storyarc_3',
  'plottwist_1', 'plottwist_2', 'plottwist_3',
  'inktempest_1', 'inktempest_2', 'inktempest_3',
  'electric_1', 'electric_2', 'rolling_1', 'rolling_2', 'rolling_3', 'rolling_4',
  'citation', 'knowledgebomb_1', 'knowledgebomb_2', 'groundtruth'];
const names = order.filter((n) => readdirSync(dir).includes(`${n}.json`));

const base = load('idle_1');
const commonScale = 96 / base.h; // idle ~96px tall; every pose scaled by the SAME factor

const COLS = 5, TW = 116, TH = 116, BASE = 100;
const rows = Math.ceil(names.length / COLS);
const g = createGrid(COLS * TW, rows * TH, rgb(38, 32, 58));

names.forEach((name, i) => {
  const s = load(name);
  const th = Math.max(1, Math.round(s.h * commonScale));
  const grid = resizeRGBA(new Uint8Array(Buffer.from(s.data, 'base64')), s.w, s.h, th, false);
  const gw = grid[0]?.length ?? 0;
  const cx = (i % COLS) * TW + Math.floor(TW / 2);
  const by = Math.floor(i / COLS) * TH + BASE;
  fillRect(g, (i % COLS) * TW + 8, by + 1, TW - 16, 1, rgb(90, 80, 120));
  const ox = cx - Math.round(s.anchorX * commonScale), oy = by - Math.round(s.anchorY * commonScale);
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < gw; x++) {
    const p = grid[y]![x]; if (!p) continue;
    const tx = ox + x, ty = oy + y; if (tx < 0 || ty < 0 || tx >= g[0]!.length || ty >= g.length) continue;
    g[ty]![tx] = p;
  }
  drawText(g, name.toUpperCase(), (i % COLS) * TW + 4, by + 6, rgb(230, 220, 240), 1);
});

const scale = 3, W = g[0]!.length * scale, H = g.length * scale;
const body = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = g[Math.floor(y / scale)]![Math.floor(x / scale)];
  const i = (y * W + x) * 3; body[i] = p ? p.r : 0; body[i + 1] = p ? p.g : 0; body[i + 2] = p ? p.b : 0;
}
writeFileSync(`/tmp/proof-${id}.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), body]));
console.log(`wrote /tmp/proof-${id}.ppm (${names.length} poses, commonScale=${commonScale.toFixed(3)})`);

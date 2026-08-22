// Split MEGAWATTS' three generated 4x3 chroma-key atlases into the existing
// packed sprite format. Source cells stay in raw/ for cheap future repacking.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = resolve(ROOT, 'assets/sprites/MEGAWATTS');
const SOURCE = resolve(DIR, 'source-sheets');
const RAW = resolve(DIR, 'raw');
const TARGET_H = 256;
const ALPHA = 64;

const SHEETS: readonly { file: string; frames: readonly (string | null)[] }[] = [
  { file: '01-movement.png', frames: [
    'idle_1', 'idle_2', 'walk_1', 'walk_2',
    'crouch', 'jump', 'fall', 'block',
    'crouchblock', 'hit', 'ko', 'menu',
  ] },
  { file: '02-combat.png', frames: [
    'punch_1', 'punch_2', 'kick_1', 'kick_2',
    'crouchpunch_1', 'crouchpunch_2', 'crouchkick_1', 'crouchkick_2',
    'jumpkick', 'throw_1', 'throw_2', 'throw_3',
  ] },
  { file: '03-specials.png', frames: [
    'thrown_1', 'thrown_2', 'victory_1', 'victory_2',
    'victory_3', 'citation', 'knowledgebomb_1', 'knowledgebomb_2',
    'groundtruth', null, null, null,
  ] },
];

interface Raw { data: Buffer; w: number; h: number; ch: number }
interface Box { minX: number; minY: number; maxX: number; maxY: number }
interface SpriteJson { w: number; h: number; anchorX: number; anchorY: number; data: string }

// Reuse the generator's proven hue-based key. The engine redraws the important
// gold/violet attack phenomena, so removing pink-leaning fringe is preferable
// to carrying a stage-visible magenta halo into production.
function chromaKey(raw: Raw): void {
  for (let i = 0; i < raw.w * raw.h; i++) {
    const p = i * raw.ch;
    const r = raw.data[p]!, g = raw.data[p + 1]!, b = raw.data[p + 2]!;
    if (r > 110 && b > 110 && g < r - 55 && g < b - 55) { raw.data[p + 3] = 0; continue; }
    const magentaExcess = Math.max(0, Math.min(r, b) - g);
    if (magentaExcess > 8 && Math.abs(r - b) < 96) {
      raw.data[p] = Math.max(0, r - magentaExcess);
      raw.data[p + 2] = Math.max(0, b - magentaExcess);
    }
  }
}

// Atlas poses occasionally lean a few pixels into a neighboring cell. Retain
// the principal connected subject; knowledge-bomb frames deliberately keep the
// fighter plus one detached core. Renderer-native effects supply the fine sparks.
function keepPrincipalComponents(raw: Raw, keep: number): void {
  const visited = new Uint8Array(raw.w * raw.h);
  const neighbors = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
  const components: number[][] = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || raw.data[start * raw.ch + 3]! < ALPHA) continue;
    const component: number[] = []; const queue = [start]; visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor]!; component.push(index);
      const x = index % raw.w, y = Math.floor(index / raw.w);
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= raw.w || ny < 0 || ny >= raw.h) continue;
        const next = ny * raw.w + nx;
        if (visited[next] || raw.data[next * raw.ch + 3]! < ALPHA) continue;
        visited[next] = 1; queue.push(next);
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  for (const component of components.slice(keep)) for (const index of component) raw.data[index * raw.ch + 3] = 0;
}

async function rgba(png: Buffer, keepComponents = 1): Promise<Raw> {
  const result = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = { data: result.data, w: result.info.width, h: result.info.height, ch: result.info.channels };
  chromaKey(raw);
  keepPrincipalComponents(raw, keepComponents);
  return raw;
}

function bbox(raw: Raw): Box {
  let minX = raw.w, minY = raw.h, maxX = -1, maxY = -1;
  for (let y = 0; y < raw.h; y++) for (let x = 0; x < raw.w; x++) {
    if (raw.data[(y * raw.w + x) * raw.ch + 3]! < ALPHA) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) throw new Error('empty chroma-keyed cell');
  return { minX, minY, maxX, maxY };
}

function pack(raw: Raw, box: Box, scale: number): SpriteJson {
  const sourceW = box.maxX - box.minX + 1, sourceH = box.maxY - box.minY + 1;
  const w = Math.max(1, Math.round(sourceW * scale)), h = Math.max(1, Math.round(sourceH * scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = box.minY + y / scale, sy1 = box.minY + (y + 1) / scale;
    for (let x = 0; x < w; x++) {
      const sx0 = box.minX + x / scale, sx1 = box.minX + (x + 1) / scale;
      let rr = 0, gg = 0, bb = 0, count = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1) && sy < raw.h; sy++) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1) && sx < raw.w; sx++) {
          const source = (sy * raw.w + sx) * raw.ch;
          if (raw.data[source + 3]! < ALPHA) continue;
          rr += raw.data[source]!; gg += raw.data[source + 1]!; bb += raw.data[source + 2]!; count++;
        }
      }
      if (!count) continue;
      const target = (y * w + x) * 4;
      out[target] = Math.round(rr / count); out[target + 1] = Math.round(gg / count);
      out[target + 2] = Math.round(bb / count); out[target + 3] = 255;
    }
  }
  let sumX = 0, count = 0;
  for (let y = Math.floor(h * 0.75); y < h; y++) for (let x = 0; x < w; x++) {
    if (out[(y * w + x) * 4 + 3]! < 128) continue;
    sumX += x; count++;
  }
  return { w, h, anchorX: count ? Math.round(sumX / count) : Math.floor(w / 2), anchorY: h - 1, data: Buffer.from(out).toString('base64') };
}

mkdirSync(RAW, { recursive: true });
const cells = new Map<string, Buffer>();
for (const sheet of SHEETS) {
  const source = sharp(resolve(SOURCE, sheet.file));
  const meta = await source.metadata();
  if (!meta.width || !meta.height || meta.width % 4 || meta.height % 3) throw new Error(`${sheet.file}: expected dimensions divisible by 4x3`);
  const cellW = meta.width / 4, cellH = meta.height / 3;
  for (let index = 0; index < sheet.frames.length; index++) {
    const name = sheet.frames[index];
    if (!name) continue;
    const png = await sharp(resolve(SOURCE, sheet.file)).extract({
      left: (index % 4) * cellW, top: Math.floor(index / 4) * cellH,
      width: cellW, height: cellH,
    }).png().toBuffer();
    cells.set(name, png);
    writeFileSync(resolve(RAW, `${name}.png`), png);
  }
}

const idle = await rgba(cells.get('idle_1')!);
const idleBox = bbox(idle);
const scale = TARGET_H / (idleBox.maxY - idleBox.minY + 1);
for (const [name, png] of cells) {
  const raw = await rgba(png, name.startsWith('knowledgebomb_') ? 2 : 1);
  const sprite = pack(raw, bbox(raw), scale);
  // The concept sheet labels are art names. Runtime aliases deliberately reuse
  // established attack primitives: Citation = hadouken, Ground Truth = electric.
  const outputs = name === 'citation' ? ['citation', 'hadouken']
    : name === 'groundtruth' ? ['groundtruth', 'electric_1', 'electric_2']
      : [name];
  for (const output of outputs) writeFileSync(resolve(DIR, `${output}.json`), JSON.stringify(sprite));
  console.log(`  MEGAWATTS/${outputs.join(',')} ${sprite.w}x${sprite.h} anchor=${sprite.anchorX},${sprite.anchorY}`);
}
console.log(`packed ${cells.size} MEGAWATTS sprites @ standing ${TARGET_H}px from three chroma-key sheets`);

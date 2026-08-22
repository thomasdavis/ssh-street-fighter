// Converts image-generated projectile masters into compact keyed RGBA assets.
// Sources use a pure-magenta screen because it produces more reliable edges
// than asking image models for alpha directly.
import sharp from 'sharp';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = resolve(ROOT, 'assets/projectiles');
const RAW = resolve(DIR, 'raw');
const TARGET_H = 128;
const ALPHA = 48;

interface Raw { data: Buffer; w: number; h: number; ch: number }

function chromaKey(raw: Raw): void {
  const { data, w, h, ch } = raw;
  for (let i = 0; i < w * h; i++) {
    const p = i * ch;
    const r = data[p]!, g = data[p + 1]!, b = data[p + 2]!;
    if (r > 110 && b > 110 && g < r - 55 && g < b - 55) {
      data[p + 3] = 0;
      continue;
    }
    // Remove purple spill from anti-aliased dark edges.
    const excess = Math.max(0, Math.min(r, b) - g);
    if (excess > 8 && Math.abs(r - b) < 96) {
      data[p] = Math.max(0, r - excess);
      data[p + 2] = Math.max(0, b - excess);
    }
  }
}

function bbox(raw: Raw) {
  let minX = raw.w, minY = raw.h, maxX = -1, maxY = -1;
  for (let y = 0; y < raw.h; y++) for (let x = 0; x < raw.w; x++) {
    if (raw.data[(y * raw.w + x) * raw.ch + 3]! < ALPHA) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error('empty projectile after chroma key');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

mkdirSync(DIR, { recursive: true });
for (const file of readdirSync(RAW).filter((name) => name.endsWith('.png')).sort()) {
  const input = readFileSync(resolve(RAW, file));
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = { data: decoded.data, w: decoded.info.width, h: decoded.info.height, ch: decoded.info.channels };
  chromaKey(raw);
  const box = bbox(raw);
  const packed = await sharp(raw.data, { raw: { width: raw.w, height: raw.h, channels: 4 } })
    .extract(box)
    .resize({ height: TARGET_H, fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const payload = {
    w: packed.info.width,
    h: packed.info.height,
    anchorX: Math.floor(packed.info.width / 2),
    anchorY: Math.floor(packed.info.height / 2),
    data: packed.data.toString('base64'),
  };
  const name = file.replace(/\.png$/, '');
  writeFileSync(resolve(DIR, `${name}.json`), JSON.stringify(payload));
  console.log(`${name}: ${payload.w}x${payload.h}`);
}

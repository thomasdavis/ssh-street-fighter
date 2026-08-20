// Unit-tests the kitty graphics encoder: transmit format, zlib+base64 roundtrip,
// chunking, change-detection, and resize handling.
import { inflateSync } from 'node:zlib';
import { createGrid, fillRect, rgb } from './render/pixel.js';
import { packRGB, hashBuf, transmit, deleteImage, KittyRenderer } from './render/kitty.js';

let pass = true;
const check = (n: string, c: boolean, x = ''): void => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };

// pack: a 2x1 red/green image → 6 RGB bytes
{
  const g = createGrid(2, 1, null);
  g[0]![0] = rgb(255, 0, 0); g[0]![1] = rgb(0, 255, 0);
  const buf = packRGB(g, 2, 1);
  check('packRGB packs RGB tightly', buf.equals(Buffer.from([255, 0, 0, 0, 255, 0])));
  const gNull = createGrid(1, 1, null);
  check('packRGB null → black', packRGB(gNull, 1, 1).equals(Buffer.from([0, 0, 0])));
}

// transmit: header keys + zlib roundtrip of the payload
{
  const rgbBuf = Buffer.from([0x12, 0x34, 0x56]);
  const seq = transmit(7, 1, 1, rgbBuf);
  check('transmit has a=T,f=24,o=z header', seq.startsWith('\x1b_Ga=T,f=24,o=z,s=1,v=1,t=d,i=7,p=1,C=1,q=2,m=0;'));
  check('transmit ends with ST', seq.endsWith('\x1b\\'));
  const b64 = seq.slice(seq.indexOf(';') + 1, seq.length - 2);
  const round = inflateSync(Buffer.from(b64, 'base64'));
  check('transmit payload is zlib(rgb)', round.equals(rgbBuf));
}

// chunking: a large payload splits into multiple m=1 chunks + a final m=0
{
  // random-ish (incompressible) 64x64 so base64 exceeds one 4096 chunk
  const g = createGrid(128, 128, null);
  let s = 0x12345678;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[y]![x] = rgb(s & 255, (s >> 8) & 255, (s >> 16) & 255); }
  const seq = transmit(1, 128, 128, packRGB(g, 128, 128));
  const opens = seq.split('\x1b_G').length - 1;
  check('large payload chunks', opens > 1, `chunks=${opens}`);
  check('exactly one final m=0', (seq.match(/m=0;/g) || []).length === 1);
  check('m=1 on all but last', (seq.match(/m=1;/g) || []).length === opens - 1);
}

// compression: a flat frame compresses to almost nothing
{
  const g = createGrid(256, 256, rgb(24, 24, 32));
  const seq = transmit(1, 256, 256, packRGB(g, 256, 256));
  check('flat frame compresses hard', seq.length < 4096, `len=${seq.length}`);
}

// delete
check('deleteImage scoped to id', deleteImage(5) === '\x1b_Ga=d,d=I,i=5,q=2\x1b\\');

// KittyRenderer: change-detection + resize
{
  const r = new KittyRenderer(99);
  const g = createGrid(4, 4, rgb(10, 20, 30));   // 2 cols x 1 row → 4x4 px
  const first = r.frame(g, 2, 1);
  check('first frame transmits', first.includes('\x1b_Ga=T') && first.startsWith('\x1b[H'));
  check('frame scales to cell grid (c/r)', first.includes(',c=2,r=1,'));
  const second = r.frame(g, 2, 1);
  check('identical frame → no bytes', second === '');
  fillRect(g, 0, 0, 1, 1, rgb(200, 0, 0));
  const changed = r.frame(g, 2, 1);
  check('changed frame re-transmits', changed.includes('\x1b_Ga=T'));
  const bigger = r.frame(createGrid(8, 8, rgb(5, 5, 5)), 4, 2);   // resize up
  check('resize re-transmits (delete+clear+home)', bigger.includes('\x1b_Ga=d') && bigger.includes('\x1b[2J'));
}

// end-to-end: a real game frame (the character-select scene) must encode losslessly
{
  const { composeSelectStage } = await import('./game/select-scene.js');
  const cols = 120, rows = 40, pw = cols * 2, ph = rows * 4;
  const grid = composeSelectStage(2, 6, pw, ph);
  const r = new KittyRenderer(1);
  const seq = r.frame(grid, cols, rows);
  check('real frame transmits', seq.includes('\x1b_Ga=T') && seq.includes(`s=${pw},v=${ph}`));
  // reassemble the base64 across chunks and inflate → must equal the packed pixels
  const chunks = seq.split('\x1b_G').slice(1).map((c) => c.slice(c.indexOf(';') + 1, c.indexOf('\x1b\\')));
  const decoded = inflateSync(Buffer.from(chunks.join(''), 'base64'));
  check('real frame is lossless', decoded.equals(packRGB(grid, pw, ph)), `${decoded.length} vs ${pw * ph * 3}`);
}

console.log(`\nKITTY TEST: ${pass ? 'PASS' : 'FAIL'}`);
if (!pass) process.exit(1);

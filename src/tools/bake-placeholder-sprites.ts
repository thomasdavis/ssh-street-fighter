// Bakes engine-native PLACEHOLDER sprites for one fighter from the procedural
// renderer (drawFighter), so a new character is fully playable and passes the
// asset contract before its generated art exists. Real art replaces these with
//   tsx src/tools/gen-sprites.ts <ID>
// (same filenames, same format), or per-pose from the web admin.
//
//   tsx src/tools/bake-placeholder-sprites.ts FABLE
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { drawFighter } from '../game/sprites.js';
import { ROSTER } from '../game/roster.js';
import { specialMoveFrames, specialMovesFor } from '../game/moves.js';
import type { Pose } from '../game/types.js';
import type { PixelGrid } from '../render/pixel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../assets/sprites');
const SCALE = 5; // 30x52 procedural grid -> ~150x260, near the packer's 256px baseline

// Every required frame, mapped to the nearest procedural pose + params.
interface Bake { pose: Pose; phase?: number; ext?: number; }
const BASE_FRAMES: Record<string, Bake> = {
  idle_1: { pose: 'idle', phase: 0 }, idle_2: { pose: 'idle', phase: Math.PI / 2 },
  menu: { pose: 'idle', phase: 0 },
  walk_1: { pose: 'walk', phase: 1 }, walk_2: { pose: 'walk', phase: -1 },
  crouch: { pose: 'crouch' }, jump: { pose: 'jump' }, fall: { pose: 'fall' },
  block: { pose: 'block' }, crouchblock: { pose: 'crouchblock' },
  hit: { pose: 'hit' }, ko: { pose: 'ko' },
  punch_1: { pose: 'punch', ext: 0.55 }, punch_2: { pose: 'punch', ext: 1 },
  kick_1: { pose: 'kick', ext: 0.55 }, kick_2: { pose: 'kick', ext: 1 },
  crouchpunch_1: { pose: 'crouchpunch', ext: 0.55 }, crouchpunch_2: { pose: 'crouchpunch', ext: 1 },
  crouchkick_1: { pose: 'crouchkick', ext: 0.55 }, crouchkick_2: { pose: 'crouchkick', ext: 1 },
  jumpkick: { pose: 'kick', ext: 1 },
  victory_1: { pose: 'idle', phase: 0 }, victory_2: { pose: 'idle', phase: Math.PI / 2 }, victory_3: { pose: 'idle', phase: Math.PI },
};
const SPECIAL_FRAMES: Record<string, Bake> = {
  storyarc_1: { pose: 'crouch' }, storyarc_2: { pose: 'jump' }, storyarc_3: { pose: 'fall' },
  plottwist_1: { pose: 'block' }, plottwist_2: { pose: 'kick', ext: 1 }, plottwist_3: { pose: 'idle', phase: 0 },
  inktempest_1: { pose: 'punch', ext: 0.3 }, inktempest_2: { pose: 'punch', ext: 1 }, inktempest_3: { pose: 'punch', ext: 0.7 },
  hadouken: { pose: 'hadouken', ext: 1 }, shoryuken: { pose: 'shoryuken' },
  hurricane_1: { pose: 'hurricane' }, hurricane_2: { pose: 'hurricane' }, hurricane_3: { pose: 'hurricane' }, hurricane_4: { pose: 'hurricane' },
  electric_1: { pose: 'punch', ext: 0.4 }, electric_2: { pose: 'punch', ext: 0.9 },
  rolling_1: { pose: 'rolling' }, rolling_2: { pose: 'rolling' }, rolling_3: { pose: 'rolling' }, rolling_4: { pose: 'rolling' },
  stream: { pose: 'hadouken', ext: 1 }, freetier: { pose: 'block' },
};

function bakeFrame(grid: PixelGrid): { w: number; h: number; anchorX: number; anchorY: number; data: string } {
  const gh = grid.length, gw = grid[0]?.length ?? 0;
  // bbox crop, like the generated-art packer
  let minX = gw, minY = gh, maxX = -1, maxY = -1;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (grid[y]![x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) throw new Error('empty frame');
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const w = cw * SCALE, h = ch * SCALE;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[minY + Math.floor(y / SCALE)]![minX + Math.floor(x / SCALE)];
    if (!c) continue;
    const i = (y * w + x) * 4;
    rgba[i] = c.r; rgba[i + 1] = c.g; rgba[i + 2] = c.b; rgba[i + 3] = 255;
  }
  // feet anchor: centroid x over the bottom 25% of rows; feet at bottom row
  let sumX = 0, cnt = 0;
  for (let y = Math.floor(h * 0.75); y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3]! >= 128) { sumX += x; cnt++; }
  return { w, h, anchorX: cnt ? Math.round(sumX / cnt) : Math.floor(w / 2), anchorY: h - 1, data: Buffer.from(rgba).toString('base64') };
}

const id = (process.argv[2] ?? '').toUpperCase();
const character = ROSTER.find((c) => c.name === id);
if (!character) { console.error(`unknown roster fighter ${id}`); process.exit(1); }

const frames = new Set<string>(Object.keys(BASE_FRAMES));
for (const move of specialMovesFor(id)) for (const frame of specialMoveFrames(move.attack)) frames.add(frame);

const dir = resolve(OUT, id);
mkdirSync(dir, { recursive: true });
for (const name of frames) {
  const bake = BASE_FRAMES[name] ?? SPECIAL_FRAMES[name];
  if (!bake) { console.error(`no placeholder mapping for ${name} — add one`); process.exit(1); }
  const grid = drawFighter(bake.pose, character.palette, bake.phase ?? 0, bake.ext ?? 0);
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(bakeFrame(grid)));
  console.log(`  ${id}/${name} (placeholder)`);
}
console.log(`baked ${frames.size} placeholder frames -> ${dir}`);

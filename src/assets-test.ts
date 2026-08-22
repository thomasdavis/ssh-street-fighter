// Asset-contract verification: every roster fighter must have the shared combat
// poses plus the exact animation frames required by their data-driven specials.
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ROSTER } from './game/roster.js';
import { specialMoveFrames, specialMovesFor } from './game/moves.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMON = [
  'idle_1', 'idle_2', 'walk_1', 'walk_2', 'crouch', 'jump', 'fall',
  'block', 'crouchblock', 'hit', 'ko', 'punch_1', 'punch_2', 'kick_1',
  'kick_2', 'crouchpunch_1', 'crouchpunch_2', 'crouchkick_1', 'crouchkick_2',
  'jumpkick', 'victory_1', 'victory_2', 'victory_3',
] as const;

const errors: string[] = [];
if (ROSTER.length !== 18) errors.push(`expected 18 roster fighters, found ${ROSTER.length}`);

for (const fighter of ROSTER) {
  const moves = specialMovesFor(fighter.name);
  if (moves.length !== 3) errors.push(`${fighter.name}: expected 3 specials, found ${moves.length}`);
  if (fighter.story.length !== 2 || fighter.story.some((paragraph) => paragraph.length < 100)) errors.push(`${fighter.name}: incomplete two-part background story`);
  if (!fighter.origin || !fighter.discipline || !fighter.playstyle || fighter.strengths.length !== 3) errors.push(`${fighter.name}: incomplete fighter dossier`);
  for (const move of moves) if (move.description.length < 50) errors.push(`${fighter.name}/${move.name}: move explanation is too short`);
  const expected = new Set<string>(COMMON);
  for (const move of moves) for (const frame of specialMoveFrames(move.attack)) expected.add(frame);
  for (const frame of expected) {
    const file = resolve(ROOT, 'assets/sprites', fighter.name, `${frame}.json`);
    if (!existsSync(file)) { errors.push(`${fighter.name}: missing ${frame}.json`); continue; }
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { w: number; h: number; anchorX: number; anchorY: number; data: string };
      const rgba = Buffer.from(data.data, 'base64');
      if (!(data.w > 0 && data.h > 0)) errors.push(`${fighter.name}/${frame}: invalid dimensions`);
      if (rgba.length !== data.w * data.h * 4) errors.push(`${fighter.name}/${frame}: RGBA length ${rgba.length} != ${data.w * data.h * 4}`);
      // Spin frames use the packer's 256px virtual standing baseline even when
      // their wide/inverted crop is shorter than that baseline.
      if (!Number.isFinite(data.anchorX) || !Number.isFinite(data.anchorY) || data.anchorX < 0 || data.anchorX > data.w || data.anchorY < 0 || data.anchorY > Math.max(data.h, 256)) {
        errors.push(`${fighter.name}/${frame}: invalid anchor ${data.anchorX},${data.anchorY}`);
      }
    } catch (e) { errors.push(`${fighter.name}/${frame}: ${(e as Error).message}`); }
  }
  console.log(`${fighter.name}: ${moves.length} specials, ${expected.size} required poses`);
}

for (const stage of ['dojo', 'market', 'jungle', 'airbase', 'monsoon', 'harbor']) {
  const file = resolve(ROOT, 'assets/stages', `${stage}.json`);
  if (!existsSync(file)) { errors.push(`stage: missing ${stage}.json`); continue; }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { w: number; h: number; data: string };
    if (Buffer.from(data.data, 'base64').length !== data.w * data.h * 4) errors.push(`stage ${stage}: corrupt RGBA payload`);
  } catch (e) { errors.push(`stage ${stage}: ${(e as Error).message}`); }
}

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exit(1);
}
console.log(`ASSET TEST: PASS (${ROSTER.length} fighters, ${ROSTER.reduce((n, f) => n + specialMovesFor(f.name).length, 0)} specials, 6 stages)`);

// Build-time bridge from the game engine to the Next.js fighter dossiers.
// The web app consumes this generated snapshot; `web prebuild` refreshes it on
// every production build so lore, inputs, stats, and animation frames cannot
// drift into a separately maintained website database.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER } from '../game/roster.js';
import { specialMoveFrames, specialMoveInput, specialMovesFor } from '../game/moves.js';
import { specialMoveStats } from '../game/engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'web/generated/fighter-catalog.json');

const catalog = ROSTER.map((character) => ({
  ...character,
  moves: specialMovesFor(character.name).map((move) => ({
    ...move,
    input: specialMoveInput(move, 1),
    frames: specialMoveFrames(move.attack),
    stats: specialMoveStats(move.attack),
  })),
}));

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`fighter catalog: ${catalog.length} characters / ${catalog.reduce((count, character) => count + character.moves.length, 0)} specials -> ${output}`);

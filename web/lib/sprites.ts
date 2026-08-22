import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { PROJECTILES_DIR, SPRITES_DIR } from './paths';

export const POSE_ORDER = [
  'idle_1', 'idle_2', 'walk_1', 'walk_2', 'crouch', 'jump', 'fall', 'block', 'crouchblock', 'hit',
  'ko', 'punch_1', 'punch_2', 'kick_1', 'kick_2', 'crouchpunch_1', 'crouchpunch_2', 'crouchkick_1', 'crouchkick_2', 'hadouken', 'shoryuken',
  'hurricane_1', 'hurricane_2', 'hurricane_3', 'hurricane_4',
  'testimony_1', 'testimony_2', 'testimony_3',
  'nullstep_1', 'nullstep_2', 'nullstep_3', 'nullstep_4',
  'entropy_1', 'entropy_2', 'entropy_3',
  'knowledgebomb_1', 'knowledgebomb_2',
];

export function listChars(): string[] {
  try {
    return readdirSync(SPRITES_DIR)
      .filter((d) => !d.startsWith('.') && existsSync(resolve(SPRITES_DIR, d, 'idle_1.json')))
      .sort();
  } catch { return []; }
}

/**
 * The sprite files on disk are the source of truth: list EVERY pose present,
 * ordered by the canonical POSE_ORDER, with any pose not yet in that list
 * appended (sorted) so newly generated sprites appear automatically — no manual
 * edit needed to surface a new move in the gallery.
 */
export function listPoses(char: string): string[] {
  try {
    const files = readdirSync(resolve(SPRITES_DIR, char)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    const rank = (p: string) => { const i = POSE_ORDER.indexOf(p); return i === -1 ? POSE_ORDER.length : i; };
    return files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  } catch { return []; }
}

export interface Packed { w: number; h: number; anchorX: number; anchorY: number; data: string; mtime: number; }
export function loadPacked(char: string, pose: string): Packed | null {
  const p = resolve(SPRITES_DIR, char, `${pose}.json`);
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8')) as Omit<Packed, 'mtime'>;
  return { ...s, mtime: statSync(p).mtimeMs };
}

/** File mtime (ms) for cache-busting the <img>. */
export function spriteMtime(char: string, pose: string): number {
  try { return statSync(resolve(SPRITES_DIR, char, `${pose}.json`)).mtimeMs; } catch { return 0; }
}

export function loadProjectile(style: string): Packed | null {
  if (!/^[a-z]+$/.test(style)) return null;
  const p = resolve(PROJECTILES_DIR, `${style}.json`);
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8')) as Omit<Packed, 'mtime'>;
  return { ...s, mtime: statSync(p).mtimeMs };
}

import 'server-only';
import catalogJson from '../generated/fighter-catalog.json';
import { loadPacked } from './sprites';

interface CatalogColor { r: number; g: number; b: number }
interface CatalogPalette { skin: CatalogColor; gi: CatalogColor; giDark: CatalogColor; hair: CatalogColor; belt: CatalogColor }
export interface SpecialMoveStats {
  startup: number; active: number; recovery: number; damagePerHit: number; maxHits: number;
  maxDamage: number; chipPerHit: number; range: number; impact: string;
}
export interface CatalogMove {
  attack: string; name: string; shortName: string; description: string; motion: string[]; button: 'punch' | 'kick';
  input: string; frames: string[]; stats: SpecialMoveStats;
}
export interface CatalogCharacter {
  name: string; tagline: string; palette: CatalogPalette; origin: string; discipline: string; archetype: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'; quote: string; story: [string, string]; playstyle: string;
  strengths: [string, string, string]; moves: CatalogMove[];
}

const ROSTER = catalogJson as CatalogCharacter[];

export interface SpriteFrame {
  name: string;
  mtime: number;
  width: number;
  height: number;
}

export interface FighterMoveProfile {
  move: CatalogMove;
  input: string;
  stats: SpecialMoveStats;
  frames: SpriteFrame[];
}

export interface FighterProfile {
  character: CatalogCharacter;
  slug: string;
  accent: string;
  idleFrames: SpriteFrame[];
  moves: FighterMoveProfile[];
  previous: { name: string; slug: string };
  next: { name: string; slug: string };
  number: number;
}

const slugFor = (name: string) => name.toLowerCase();

function cssColor(character: CatalogCharacter): string {
  const candidates = [character.palette.gi, character.palette.hair, character.palette.belt];
  const color = candidates.reduce((best, candidate) => {
    const chroma = Math.max(candidate.r, candidate.g, candidate.b) - Math.min(candidate.r, candidate.g, candidate.b);
    const bestChroma = Math.max(best.r, best.g, best.b) - Math.min(best.r, best.g, best.b);
    return chroma > bestChroma ? candidate : best;
  });
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function spriteFrames(character: string, names: readonly string[]): SpriteFrame[] {
  const frames = names.flatMap((name) => {
    const packed = loadPacked(character, name);
    return packed ? [{ name, mtime: packed.mtime, width: packed.w, height: packed.h }] : [];
  });
  if (frames.length) return frames;
  const fallback = loadPacked(character, 'idle_1');
  return fallback ? [{ name: 'idle_1', mtime: fallback.mtime, width: fallback.w, height: fallback.h }] : [];
}

export function fighterSlugs(): string[] {
  return ROSTER.map((character) => slugFor(character.name));
}

export function getFighterProfile(id: string): FighterProfile | null {
  const index = ROSTER.findIndex((character) => slugFor(character.name) === id.toLowerCase());
  if (index < 0) return null;
  const character = ROSTER[index]!;
  const previous = ROSTER[(index - 1 + ROSTER.length) % ROSTER.length]!;
  const next = ROSTER[(index + 1) % ROSTER.length]!;
  const idleFrames = spriteFrames(character.name, ['idle_1', 'idle_2']);
  return {
    character,
    slug: slugFor(character.name),
    accent: cssColor(character),
    idleFrames,
    moves: character.moves.map((move) => ({
      move,
      input: move.input,
      stats: move.stats,
      frames: spriteFrames(character.name, ['idle_1', ...move.frames]),
    })),
    previous: { name: previous.name, slug: slugFor(previous.name) },
    next: { name: next.name, slug: slugFor(next.name) },
    number: index + 1,
  };
}

export function rosterSummary() {
  return ROSTER.map((character) => ({
    name: character.name,
    slug: slugFor(character.name),
    tagline: character.tagline,
    archetype: character.archetype,
  }));
}

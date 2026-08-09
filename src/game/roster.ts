// The (legally distinct) roster. Comic knockoffs, our own pixel art.
import {
  RED_PALETTE, BLUE_PALETTE, GREEN_PALETTE, PURPLE_PALETTE, OLIVE_PALETTE,
  CRIMSON_PALETTE, SAFFRON_PALETTE, NAVY_PALETTE, TEAL_PALETTE,
  IVORY_PALETTE, OBSIDIAN_PALETTE,
} from './sprites.js';
import type { FighterPalette } from './types.js';

export interface Character {
  name: string;      // shown on the HUD (<= 12 chars)
  tagline: string;
  palette: FighterPalette;
}

export const ROSTER: Character[] = [
  { name: 'BYU', tagline: 'wandering fist', palette: RED_PALETTE },
  { name: 'MEN', tagline: 'flaming rival', palette: BLUE_PALETTE },
  { name: 'BLANKO', tagline: 'zappy beast', palette: GREEN_PALETTE },
  { name: 'CHONG', tagline: 'lightning legs', palette: PURPLE_PALETTE },
  { name: 'GYLE', tagline: 'sonic commando', palette: OLIVE_PALETTE },
  { name: 'ZANG', tagline: 'iron cyclone', palette: CRIMSON_PALETTE },
  { name: 'DHAL', tagline: 'mystic flame', palette: SAFFRON_PALETTE },
  { name: 'HONDO', tagline: 'sumo thunder', palette: NAVY_PALETTE },
  { name: 'KIRA', tagline: 'phase tactician', palette: TEAL_PALETTE },
  { name: 'MAKO', tagline: 'tide dancer', palette: IVORY_PALETTE },
  { name: 'OMEGA', tagline: 'the last witness', palette: OBSIDIAN_PALETTE },
];

export function characterAt(i: number): Character {
  return ROSTER[((i % ROSTER.length) + ROSTER.length) % ROSTER.length]!;
}

import catalog from '../generated/fighter-catalog.json';

interface C { r: number; g: number; b: number }
interface Cat { name: string; palette: { skin: C; gi: C; giDark: C; hair: C; belt: C }; archetype?: string; tagline?: string }
const ROSTER = catalog as unknown as Cat[];

const hex = (c: C) => '#' + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

// A distinctive accent per fighter (their gi colour), for chips/bars/labels.
const COLORS: Record<string, string> = Object.fromEntries(ROSTER.map((c) => [c.name, hex(c.palette.gi)]));

export function charColor(name: string): string { return COLORS[name] ?? '#9a8fb5'; }
export function allCharColors(): Record<string, string> { return { ...COLORS }; }
export function rosterNames(): string[] { return ROSTER.map((c) => c.name); }

// Re-simulates a stored replay with the real engine and returns a per-frame
// position track the web replay viewer plays back on canvas. Because the sim is
// deterministic given inputs, this reproduces the match exactly (only cosmetic
// spark RNG differs). Runs in the game process, which already has the engine.
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeFighter, makeMatch, stepMatch, attackActive, attackExtension, WORLD_W, WORLD_H, GROUND_Y, STAGE_LEFT, STAGE_RIGHT, TESTIMONY, THROW, CONTEXT, BRANCHWALK, MERGE_COMET, STORY_ARC, PLOT_TWIST, INK_TEMPEST, BOMBARDMENT } from '../game/engine.js';
import { ROSTER } from '../game/roster.js';
import { emptyInputs, type Inputs, type Fighter, type Match } from '../game/types.js';
import { getReplay, getMatch } from './store.js';

const SPRITE_BASE = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/sprites');

// Per-character sprite placement metadata ([w, h, anchorX, anchorY] per frame),
// read once per character. Poses scale relative to idle_1's height, matching the
// game renderer, so the web viewer places feet exactly.
// `ver` is the newest sprite-file mtime for the character — appended to the web
// sprite URLs as a cache-buster so regenerated art (e.g. FABLE placeholders ->
// real) is refetched instead of served from the browser's immutable cache.
export interface CharSpriteMeta { idleH: number; ver: number; frames: Record<string, [number, number, number, number]>; }
const spriteMetaCache = new Map<string, CharSpriteMeta>();
function charSpriteMeta(char: string): CharSpriteMeta {
  const cached = spriteMetaCache.get(char);
  if (cached) return cached;
  const dir = resolve(SPRITE_BASE, char);
  const frames: Record<string, [number, number, number, number]> = {};
  let idleH = 256, ver = 0;
  if (existsSync(dir)) for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const full = resolve(dir, file);
      const s = JSON.parse(readFileSync(full, 'utf8')) as { w: number; h: number; anchorX: number; anchorY: number };
      const name = file.replace('.json', '');
      frames[name] = [s.w, s.h, s.anchorX, s.anchorY];
      if (name === 'idle_1') idleH = s.h;
      ver = Math.max(ver, Math.floor(statSync(full).mtimeMs));
    } catch { /* skip */ }
  }
  const meta: CharSpriteMeta = { idleH, ver, frames };
  spriteMetaCache.set(char, meta);
  return meta;
}

export interface TrackFrame {
  a: [number, number, number, number]; // x, y, facing, hp
  b: [number, number, number, number];
  asp: string; aa: string; aAct: boolean;  // a sprite frame, a attack kind, a hitbox active
  bsp: string; ba: string; bAct: boolean;
  pr: [number, number, number, string][]; // projectiles: x, y, owner(0=a,1=b), style
  ph: string; rd: number; msg: string;
}

/** Build one render frame from a live/simulated Match. Shared by the replay
 *  re-simulator and the live spectator endpoint so both render identically. */
export function buildFrame(m: Match): TrackFrame {
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    a: [r(m.a.x), r(m.a.y), m.a.facing, Math.round(m.a.hp)],
    b: [r(m.b.x), r(m.b.y), m.b.facing, Math.round(m.b.hp)],
    asp: spriteFrame(m.a), aa: m.a.attack, aAct: attackActive(m.a),
    bsp: spriteFrame(m.b), ba: m.b.attack, bAct: attackActive(m.b),
    pr: m.projectiles.filter((p) => p.active).map((p) => [r(p.x), r(p.y), p.owner === 'a' ? 0 : 1, p.style] as [number, number, number, string]),
    ph: m.phase, rd: m.round, msg: m.message,
  };
}

// Mirrors the game renderer's engine-state → sprite-frame mapping so the web
// replay shows exactly the frames the terminal game would.
function spriteFrame(f: Fighter): string {
  const ext = attackExtension(f);
  switch (f.pose) {
    case 'idle': return Math.floor(f.animT / 12) % 2 ? 'idle_2' : 'idle_1';
    case 'walk': return Math.floor(f.walkPhase) % 2 ? 'walk_2' : 'walk_1';
    case 'punch': return ext < 0.5 ? 'punch_1' : 'punch_2';
    case 'kick': return ext < 0.5 ? 'kick_1' : 'kick_2';
    case 'crouchpunch': return ext < 0.5 ? 'crouchpunch_1' : 'crouchpunch_2';
    case 'crouchkick': return ext < 0.5 ? 'crouchkick_1' : 'crouchkick_2';
    case 'hurricane': return `hurricane_${1 + (Math.floor(f.attackFrame / 4) % 4)}`;
    case 'electric': return `electric_${1 + (Math.floor(f.attackFrame / 3) % 2)}`;
    case 'rolling': return `rolling_${1 + (Math.floor(f.attackFrame / 3) % 4)}`;
    case 'verticalroll': return `rolling_${1 + (Math.floor(f.attackFrame / 2) % 4)}`;
    case 'testimony': return `testimony_${f.attackFrame < TESTIMONY.startup ? 1 : (f.attackFrame < 17 ? 2 : 3)}`;
    case 'nullstep': return `nullstep_${f.attackFrame < 4 ? 1 : (f.attackFrame < 7 ? 2 : (f.attackFrame < 11 ? 3 : 4))}`;
    case 'entropy': return `entropy_${f.attackFrame < 8 ? 1 : (f.attackFrame < 27 ? 2 : 3)}`;
    case 'context': return `context_${f.attackFrame < CONTEXT.startup ? 1 : (f.attackFrame < CONTEXT.startup + CONTEXT.active ? 2 : 3)}`;
    case 'branchwalk': return `branchwalk_${f.attackFrame < BRANCHWALK.startup ? 1 : (f.attackFrame < BRANCHWALK.startup + BRANCHWALK.active ? 2 : 3)}`;
    case 'mergecomet': return `mergecomet_${f.attackFrame < MERGE_COMET.startup ? 1 : (f.attackFrame < MERGE_COMET.startup + MERGE_COMET.active ? 2 : 3)}`;
    case 'storyarc': return `storyarc_${f.attackFrame < STORY_ARC.startup ? 1 : (f.attackFrame < STORY_ARC.startup + STORY_ARC.active ? 2 : 3)}`;
    case 'plottwist': return `plottwist_${f.attackFrame < PLOT_TWIST.startup ? 1 : (f.attackFrame < PLOT_TWIST.startup + PLOT_TWIST.active ? 2 : 3)}`;
    case 'inktempest': return `inktempest_${f.attackFrame < INK_TEMPEST.startup ? 1 : (f.attackFrame < INK_TEMPEST.startup + INK_TEMPEST.active ? 2 : 3)}`;
    case 'throw': return `throw_${f.attackFrame < THROW.startup ? 1 : (f.attackFrame < THROW.startup + THROW.active ? 2 : 3)}`;
    case 'thrown': return f.vy > 0 ? 'thrown_1' : 'thrown_2';
    case 'victory': return `victory_${1 + Math.floor(f.animT / 9) % 3}`;
    case 'bombardment': return `knowledgebomb_${f.attackFrame < BOMBARDMENT.secondSpawn ? 1 : 2}`;
    default: return f.pose;
  }
}
export interface Track {
  stage: string; aChar: string; bChar: string; aName: string; bName: string;
  fps: number; worldW: number; worldH: number; groundY: number; fighterH: number;
  stageLeft: number; stageRight: number;
  sprites: { a: CharSpriteMeta; b: CharSpriteMeta };
  frames: TrackFrame[];
}
export { charSpriteMeta };

function paletteFor(char: string) {
  return ROSTER.find((c) => c.name === char)?.palette ?? ROSTER[0]!.palette;
}
function decode(byte: number): Pick<Inputs, 'moveX' | 'jump' | 'down' | 'punch' | 'kick' | 'throw'> {
  return { moveX: (byte & 3) - 1, jump: !!((byte >> 2) & 1), down: !!((byte >> 3) & 1), punch: !!((byte >> 4) & 1), kick: !!((byte >> 5) & 1), throw: !!((byte >> 6) & 1) };
}

export function simulateReplay(matchId: string): Track | null {
  const rep = getReplay(matchId);
  if (!rep) return null;
  const header = JSON.parse(rep.header_json) as { motions?: string[]; sides?: { a: { char: string; name: string }; b: { char: string; name: string } }; stage?: string };
  const match = getMatch(matchId) as { stage?: string; a_char?: string; b_char?: string; a_name?: string; b_name?: string } | null;
  const motions = header.motions ?? [''];
  const aChar = header.sides?.a.char ?? match?.a_char ?? ROSTER[0]!.name;
  const bChar = header.sides?.b.char ?? match?.b_char ?? ROSTER[1]!.name;
  const aName = header.sides?.a.name ?? match?.a_name ?? 'A';
  const bName = header.sides?.b.name ?? match?.b_name ?? 'B';
  const stage = header.stage ?? match?.stage ?? 'dojo';

  const m = makeMatch(makeFighter('a', aChar, 'a', paletteFor(aChar)), makeFighter('b', bChar, 'b', paletteFor(bChar)));
  m.stage = stage;

  const buf = rep.frames;                 // Buffer, 4 bytes/frame
  const n = Math.floor(buf.length / 4);
  const frames: TrackFrame[] = [];
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const inA: Inputs = { ...emptyInputs(), ...decode(buf[off]!), motion: motions[buf[off + 1]!] ?? '' };
    const inB: Inputs = { ...emptyInputs(), ...decode(buf[off + 2]!), motion: motions[buf[off + 3]!] ?? '' };
    stepMatch(m, inA, inB);
    frames.push(buildFrame(m));
  }
  return { stage, aChar, bChar, aName, bName, fps: 30, worldW: WORLD_W, worldH: WORLD_H, groundY: GROUND_Y, fighterH: 58, stageLeft: STAGE_LEFT, stageRight: STAGE_RIGHT, sprites: { a: charSpriteMeta(aChar), b: charSpriteMeta(bChar) }, frames };
}

/** Re-simulate a stored replay up to `targetFrame` and return the live Match at
 *  that moment (for server-side share-image rendering). A negative frame picks a
 *  lively mid-action frame. Returns null if the replay is missing. */
export function replayMatchAtFrame(matchId: string, targetFrame: number): Match | null {
  const rep = getReplay(matchId);
  if (!rep) return null;
  const match = getMatch(matchId) as { a_char?: string; b_char?: string; a_name?: string; b_name?: string; stage?: string } | null;
  const header = JSON.parse(rep.header_json) as { motions?: string[]; sides?: { a: { char: string }; b: { char: string } }; stage?: string };
  const motions = header.motions ?? [''];
  const aChar = header.sides?.a.char ?? match?.a_char ?? ROSTER[0]!.name;
  const bChar = header.sides?.b.char ?? match?.b_char ?? ROSTER[1]!.name;
  const stage = header.stage ?? match?.stage ?? 'dojo';
  const m = makeMatch(makeFighter('a', aChar, 'a', paletteFor(aChar)), makeFighter('b', bChar, 'b', paletteFor(bChar)));
  m.stage = stage;
  const buf = rep.frames;
  const n = Math.floor(buf.length / 4);
  const stop = targetFrame < 0 ? Math.max(1, Math.floor(n * 0.45)) : Math.max(1, Math.min(n, targetFrame));
  for (let i = 0; i < stop; i++) {
    const off = i * 4;
    const inA: Inputs = { ...emptyInputs(), ...decode(buf[off]!), motion: motions[buf[off + 1]!] ?? '' };
    const inB: Inputs = { ...emptyInputs(), ...decode(buf[off + 2]!), motion: motions[buf[off + 3]!] ?? '' };
    stepMatch(m, inA, inB);
  }
  return m;
}

/** Render payload for a LIVE match (single current frame + the same meta the
 *  replay viewer uses), so spectating reuses the exact renderer. */
export function liveRender(mid: string, m: Match, aName: string, bName: string, aBot = false, bBot = false): object {
  const aChar = m.a.name, bChar = m.b.name;
  return {
    mid, stage: m.stage, aChar, bChar, aName, bName, aBot, bBot,
    worldW: WORLD_W, worldH: WORLD_H, groundY: GROUND_Y, fighterH: 58, stageLeft: STAGE_LEFT, stageRight: STAGE_RIGHT,
    sprites: { a: charSpriteMeta(aChar), b: charSpriteMeta(bChar) },
    frame: buildFrame(m), over: m.phase === 'match-over',
  };
}

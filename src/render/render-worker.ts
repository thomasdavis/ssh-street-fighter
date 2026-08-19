// Render worker: does the CPU-heavy fight render (composeScene + HUD + toCells +
// diff) off the main thread so the game can use every core. The main thread owns
// all connections, simulation, matchmaking and lounge state (single-process, no
// cross-process coordination); it ships each fight frame here as a plain match
// snapshot and gets back the diff bytes to write to the SSH stream.
//
// Each worker keeps the per-session double-buffered cell state (prevFrame + two
// reusable buffers) so a busy fight still allocates almost nothing per frame.
import { parentPort } from 'worker_threads';
import { Frame, diffCells, type Cell, type RenderMode } from './frame.js';
import { composeScene } from '../game/scene.js';
import { drawFightHud } from '../screens/fight-hud.js';
import type { Match } from '../game/types.js';
import type { KeyBindings } from '../input/bindings.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const COLOR_STEP = clamp(parseInt(process.env.SF_COLOR_STEP ?? '1', 10) || 1, 1, 64);
const INDEXED = process.env.SF_COLOR_MODE === '256';

interface St { prev: Cell[] | null; a: Cell[] | null; b: Cell[] | null; w: number; h: number; }
const sessions = new Map<number, St>();

interface RenderMsg {
  type: 'render';
  sid: number; seq: number;
  match: Match; cols: number; rows: number; mode: RenderMode;
  practice: boolean; bindings: KeyBindings; full: boolean;
}
type Msg = RenderMsg | { type: 'free'; sid: number };

parentPort!.on('message', (m: Msg) => {
  if (m.type === 'free') { sessions.delete(m.sid); return; }
  const { sid, seq, match, cols, rows, mode, practice, bindings, full } = m;
  let st = sessions.get(sid);
  if (!st) { st = { prev: null, a: null, b: null, w: cols, h: rows }; sessions.set(sid, st); }
  // A full redraw is forced on entry/resize/overlay-close, or whenever the
  // terminal size changed (old buffers no longer line up).
  if (full || st.w !== cols || st.h !== rows) { st.prev = null; st.a = null; st.b = null; st.w = cols; st.h = rows; }

  const f = new Frame(cols, rows, mode);
  f.usePixel(composeScene(match, cols * 2, rows * 4, practice));
  drawFightHud(f, match, practice, bindings);

  const reuse = st.prev === st.a ? st.b : st.prev === st.b ? st.a : null;
  const next = f.toCells(COLOR_STEP, reuse ?? undefined);
  if (next !== st.a && next !== st.b) { if (st.prev === st.a) st.b = next; else st.a = next; }
  const bytes = diffCells(st.prev, next, cols, rows, INDEXED);
  st.prev = next;

  parentPort!.postMessage({ sid, seq, bytes });
});

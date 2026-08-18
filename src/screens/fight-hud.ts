// Critical fight information is rendered as real terminal cells (crisp at any
// resolution). The HUD SCALES with the terminal so it stays a roughly constant
// PHYSICAL size as the player zooms: zooming out gives more (smaller) cells, so
// the HUD is drawn with the block font at an integer scale ∝ the cell grid,
// occupying proportionally more cells and thus the same fraction of the screen.
// On small/narrow terminals it falls back to a compact one-cell layout.
import type { Frame } from '../render/frame.js';
import type { Match } from '../game/types.js';
import { healthBar, keyHints, bigText, bigWidth } from '../ui/tui.js';
import { THEME } from '../ui/theme.js';
import { rgb } from '../render/pixel.js';
import { DEFAULT_KEY_BINDINGS, bindingLabel, type KeyBindings } from '../input/bindings.js';

const P1 = rgb(100, 232, 250);
const P2 = rgb(255, 126, 194);

function leftFit(text: string, width: number): string { return text.slice(0, Math.max(0, width)); }
function rightFit(text: string, width: number): string { return text.slice(-Math.max(0, width)); }

/** HUD block-font scale from the cell grid: larger grid (zoomed out) → larger
 *  scale, so the HUD keeps a constant physical size. 0 means "too small, use the
 *  compact one-cell HUD". */
function hudScale(cols: number, rows: number): number {
  // Normal terminals (≤ ~47 rows) keep the clean compact one-cell HUD. Only when
  // the player zooms OUT (more rows) does the block-font HUD kick in, scaling up
  // so it holds a constant physical size instead of shrinking to nothing.
  if (rows < 48) return 0;
  return Math.max(1, Math.min(6, Math.round(rows / 48)));
}

function timerStr(m: Match, practice: boolean): string {
  return practice ? 'TRAIN' : `R${m.round} ${String(Math.max(0, Math.ceil(m.roundTime))).padStart(2, '0')}`;
}

// ---- scaled (block-font) HUD: constant physical size ----
function scaledBar(f: Frame, x: number, y: number, w: number, h: number, pct: number, mirror: boolean): void {
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * w);
  const col = pct <= 0.3 ? THEME.hpLow : THEME.hpFull;
  for (let row = 0; row < h; row++)
    for (let i = 0; i < w; i++) {
      const on = mirror ? i >= w - filled : i < filled;
      f.putChar(x + i, y + row, on ? '█' : '░', on ? col : THEME.textDim, THEME.shadow, false);
    }
}

function drawStatusBig(f: Frame, m: Match, practice: boolean, s: number): number {
  const { cols } = f;
  const margin = 2 * s;
  const labelH = 5 * s, barH = Math.max(2, 2 * s), pipH = s;
  const topH = labelH + barH + pipH + 1;
  f.fill(0, 0, cols, topH, THEME.shadow);

  const timer = timerStr(m, practice);
  bigText(f, Math.floor((cols - bigWidth(timer, s)) / 2), 0, timer, practice ? P1 : THEME.accent, THEME.shadow, s);

  const left = `${m.a.name} ${m.a.hp}`;
  const right = `${m.b.hp} ${m.b.name}`;
  bigText(f, margin, 0, left, P1, THEME.shadow, s);
  bigText(f, cols - margin - bigWidth(right, s), 0, right, P2, THEME.shadow, s);

  const gap = 8 * s;
  const bw = Math.max(4, Math.floor((cols - margin * 2 - gap) / 2));
  scaledBar(f, margin, labelH, bw, barH, m.a.hp / 100, false);
  scaledBar(f, cols - margin - bw, labelH, bw, barH, m.b.hp / 100, true);

  // round-win pips under the inner ends of each bar
  const pipY = labelH + barH;
  const pip = (x: number) => f.fill(x, pipY, s, pipH, THEME.accent);
  for (let i = 0; i < m.a.wins; i++) pip(margin + bw - (i + 1) * (s * 2));
  for (let i = 0; i < m.b.wins; i++) pip(cols - margin - bw + i * (s * 2));
  return topH;
}

// ---- compact (one-cell) HUD: small / narrow terminals ----
function drawStatusCompact(f: Frame, m: Match, practice: boolean): void {
  const { cols } = f;
  f.fill(0, 0, cols, 2, THEME.shadow);
  const timer = timerStr(m, practice);
  const timerX = Math.max(0, Math.floor((cols - timer.length) / 2));
  const margin = cols >= 40 ? 1 : 0;
  const leftWidth = Math.max(0, timerX - margin - 1);
  const rightStart = Math.min(cols - margin, timerX + timer.length + 1);
  const rightWidth = Math.max(0, cols - margin - rightStart);
  const detailed = cols >= 64;
  const left = detailed ? `${m.a.name}  HP ${m.a.hp}  W${m.a.wins}` : `${m.a.name} ${m.a.hp}`;
  const right = detailed ? `W${m.b.wins}  HP ${m.b.hp}  ${m.b.name}` : `${m.b.hp} ${m.b.name}`;
  f.write(margin, 0, leftFit(left, leftWidth), P1, THEME.shadow, true);
  f.write(timerX, 0, timer, practice ? P1 : THEME.accent, THEME.shadow, true);
  const shownRight = rightFit(right, rightWidth);
  f.write(cols - margin - shownRight.length, 0, shownRight, P2, THEME.shadow, true);
  const gap = cols >= 48 ? 6 : 2;
  const barMargin = cols >= 48 ? 2 : 0;
  const barWidth = Math.max(3, Math.floor((cols - barMargin * 2 - gap) / 2));
  healthBar(f, barMargin, 1, barWidth, m.a.hp / 100, false, THEME.shadow);
  healthBar(f, cols - barMargin - barWidth, 1, barWidth, m.b.hp / 100, true, THEME.shadow);
  if (gap >= 4) f.write(Math.floor((cols - 2) / 2), 1, 'VS', THEME.textDim, THEME.shadow, true);
}

function drawAnnouncement(f: Frame, message: string, topH: number): void {
  if (!message) return;
  const shown = message.slice(0, Math.max(1, f.cols - 4));
  const y = Math.min(f.rows - 2, Math.max(topH + 1, f.rows >= 28 ? 7 : f.rows >= 18 ? 5 : 3));
  const x = Math.max(0, Math.floor((f.cols - shown.length - 4) / 2));
  const width = Math.min(f.cols - x, shown.length + 4);
  f.fill(x, y, width, 1, THEME.shadow);
  f.write(x + Math.max(0, Math.floor((width - shown.length) / 2)), y, shown, THEME.accent, THEME.shadow, true);
}

function controls(cols: number, practice: boolean, bindings: KeyBindings): [string, string][] {
  const quit = practice ? 'EXIT' : 'QUIT';
  const move = `${bindingLabel(bindings.left)}/${bindingLabel(bindings.right)}`;
  const jump = bindingLabel(bindings.jump);
  const crouch = bindingLabel(bindings.crouch);
  const punch = bindingLabel(bindings.punch);
  const kick = bindingLabel(bindings.kick);
  if (cols >= 96) return [[move, 'MOVE'], [jump, 'JUMP'], [crouch, 'CROUCH'], [punch, 'PUNCH'], [kick, 'KICK'], ['BACK', 'BLOCK'], ['?', 'MOVES'], ['V', 'GFX'], ['Q', quit]];
  if (cols >= 68) return [[move, 'MOVE'], [jump, 'JUMP'], [punch, 'PUNCH'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  if (cols >= 44) return [[move, 'MOVE'], [punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  if (cols >= 34) return [[punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  return [['?', 'MOVES'], ['Q', quit]];
}

export function drawFightHud(f: Frame, m: Match, practice: boolean, bindings: KeyBindings = DEFAULT_KEY_BINDINGS): void {
  const s = hudScale(f.cols, f.rows);
  // Use the scaled HUD only when the names/timer also fit widthwise at that
  // scale; otherwise stay compact (narrow terminals).
  const bigWidthNeeded = bigWidth(`${m.a.name} ${m.a.hp}`, s) + bigWidth(`${m.b.hp} ${m.b.name}`, s) + bigWidth(timerStr(m, practice), s) + 12 * s;
  const fits = s >= 1 && bigWidthNeeded <= f.cols;
  const topH = fits ? drawStatusBig(f, m, practice, s) : (drawStatusCompact(f, m, practice), 2);
  drawAnnouncement(f, m.message, topH);
  // Controls line scales with the HUD too (single scaled row of key hints).
  const cs = fits ? Math.max(1, s - 1) : 0;
  drawControls(f, controls(f.cols, practice, bindings), cs);
}

/** Bottom control hints. cs=0 → compact one-cell keyHints; cs>=1 → block font.
 *  In block mode, include as many hints as fit the width (centered) — never
 *  overflow. */
function drawControls(f: Frame, hints: [string, string][], cs: number): void {
  if (cs <= 0) { f.fill(0, f.rows - 1, f.cols, 1, THEME.shadow); keyHints(f, f.rows - 1, hints); return; }
  const w = (k: string, l: string) => bigWidth(k, cs) + cs * 2 + bigWidth(l, cs);
  const shown: [string, string][] = [];
  let used = -3 * cs;
  for (const hint of hints) {
    const add = w(hint[0], hint[1]) + 3 * cs;
    if (used + add > f.cols) break;
    used += add; shown.push(hint);
  }
  const h = 5 * cs;
  const y = f.rows - h;
  f.fill(0, y, f.cols, h, THEME.shadow);
  let x = Math.max(0, Math.floor((f.cols - used) / 2));
  for (const [k, l] of shown) {
    bigText(f, x, y, k, THEME.accent, THEME.shadow, cs); x += bigWidth(k, cs) + cs * 2;
    bigText(f, x, y, l, THEME.textDim, THEME.shadow, cs); x += bigWidth(l, cs) + 3 * cs;
  }
}

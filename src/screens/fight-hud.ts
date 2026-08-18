// Critical fight information is always rendered as real terminal text cells,
// independently of the scene resolution. Terminal font zoom changes the number
// of cells, so the HUD re-composes at content-driven breakpoints instead of
// shrinking world-pixel labels until they become illegible.
import type { Frame } from '../render/frame.js';
import type { Match } from '../game/types.js';
import { healthBar, keyHints } from '../ui/tui.js';
import { THEME } from '../ui/theme.js';
import { rgb } from '../render/pixel.js';
import { DEFAULT_KEY_BINDINGS, bindingLabel, type KeyBindings } from '../input/bindings.js';

const P1 = rgb(100, 232, 250);
const P2 = rgb(255, 126, 194);

function leftFit(text: string, width: number): string { return text.slice(0, Math.max(0, width)); }
function rightFit(text: string, width: number): string { return text.slice(-Math.max(0, width)); }

function drawStatus(f: Frame, m: Match, practice: boolean): void {
  const { cols } = f;
  f.fill(0, 0, cols, 2, THEME.shadow);

  const timer = practice ? 'TRAIN' : `R${m.round} ${String(Math.max(0, Math.ceil(m.roundTime))).padStart(2, '0')}`;
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

function drawAnnouncement(f: Frame, message: string): void {
  if (!message) return;
  const shown = message.slice(0, Math.max(1, f.cols - 4));
  const y = Math.min(f.rows - 2, f.rows >= 28 ? 7 : f.rows >= 18 ? 5 : 3);
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
  drawStatus(f, m, practice);
  drawAnnouncement(f, m.message);
  f.fill(0, f.rows - 1, f.cols, 1, THEME.shadow);
  keyHints(f, f.rows - 1, controls(f.cols, practice, bindings));
}

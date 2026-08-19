// The fight HUD is drawn as constant-size pixel-font UI on the Surface (same as
// every other screen), composited over the scene's pixel layer. It stays a fixed
// physical size at any terminal zoom, so the readout never shrinks to noise or
// balloons over the fighters.
import type { Frame } from '../render/frame.js';
import type { Match } from '../game/types.js';
import { makeSurface } from '../ui/surface.js';
import { healthBar, banner, hints, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { rgb } from '../render/pixel.js';
import { DEFAULT_KEY_BINDINGS, bindingLabel, type KeyBindings } from '../input/bindings.js';

const P1 = rgb(120, 236, 252);   // player 1 cyan
const P2 = rgb(255, 138, 200);   // player 2 magenta

function controls(cols: number, practice: boolean, bindings: KeyBindings): [string, string][] {
  const quit = practice ? 'EXIT' : 'QUIT';
  const move = `${bindingLabel(bindings.left)}/${bindingLabel(bindings.right)}`;
  const jump = bindingLabel(bindings.jump);
  const crouch = bindingLabel(bindings.crouch);
  const punch = bindingLabel(bindings.punch);
  const kick = bindingLabel(bindings.kick);
  if (cols >= 78) return [[move, 'MOVE'], [jump, 'JUMP'], [crouch, 'CROUCH'], [punch, 'PUNCH'], [kick, 'KICK'], ['BACK', 'BLOCK'], ['?', 'MOVES'], ['V', 'GFX'], ['Q', quit]];
  if (cols >= 58) return [[move, 'MOVE'], [jump, 'JUMP'], [punch, 'PUNCH'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  if (cols >= 42) return [[move, 'MOVE'], [punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  return [[punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
}

export function drawFightHud(f: Frame, m: Match, practice: boolean, bindings: KeyBindings = DEFAULT_KEY_BINDINGS): void {
  const ui = makeSurface(f);
  const cols = ui.cols;
  const margin = 2;
  const gap = cols >= 40 ? 6 : 2;
  const barW = Math.max(6, Math.floor((cols - margin * 2 - gap) / 2));

  // --- top band: names / hp / wins + centered timer (row 0), health bars (row 1) ---
  ui.fill(0, 0, cols, 2, THEME.shadow);
  const detailed = cols >= 52;
  const left = detailed ? `${m.a.name}  ${m.a.hp}  W${m.a.wins}` : `${m.a.name} ${m.a.hp}`;
  const right = detailed ? `W${m.b.wins}  ${m.b.hp}  ${m.b.name}` : `${m.b.hp} ${m.b.name}`;
  const timer = practice ? 'TRAIN' : `R${m.round}  ${String(Math.max(0, Math.ceil(m.roundTime))).padStart(2, '0')}`;
  const timerX = Math.max(0, Math.floor((cols - timer.length) / 2));
  const leftMax = Math.max(0, timerX - margin - 1);
  const rightStart = Math.min(cols - margin, timerX + timer.length + 1);
  const rightMax = Math.max(0, cols - margin - rightStart);
  const shownRight = right.length > rightMax ? right.slice(right.length - rightMax) : right;
  ui.text(margin, 0, left.slice(0, leftMax), { color: P1, bold: true });
  ui.text(timerX, 0, timer, { color: practice ? P1 : THEME.accent, bold: true });
  ui.text(cols - margin - shownRight.length, 0, shownRight, { color: P2, bold: true });

  healthBar(ui, margin, 1, barW, m.a.hp / 100, false);
  healthBar(ui, cols - margin - barW, 1, barW, m.b.hp / 100, true);
  if (gap >= 4) centerText(ui, 1, 'VS', { color: THEME.textDim, bold: true });

  // --- center announcement (ROUND 1 / FIGHT! / KO / X WINS ROUND / DRAW) ---
  if (m.message) {
    const col = /KO|WINS|FIGHT|PERFECT/.test(m.message) ? THEME.accent : THEME.accent2;
    banner(ui, Math.max(3, Math.floor(ui.rows * 0.34)), m.message, col);
  }

  // --- controls ---
  hints(ui, ui.rows - 1, controls(cols, practice, bindings));
}

// The fight HUD is drawn as constant-size pixel-font UI on the Surface (same as
// every other screen), composited over the scene's pixel layer. It stays a fixed
// physical size at any terminal zoom, so the readout never shrinks to noise or
// balloons over the fighters.
import type { Frame } from '../render/frame.js';
import type { Match } from '../game/types.js';
import { makeSurface, type Surface } from '../ui/surface.js';
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
  if (cols >= 78) return [[move, 'MOVE'], [jump, 'JUMP'], [crouch, 'CROUCH'], [punch, 'PUNCH'], [kick, 'KICK'], ['BACK', 'BLOCK'], ['?', 'MOVES'], ['Q', quit]];
  if (cols >= 58) return [[move, 'MOVE'], [jump, 'JUMP'], [punch, 'PUNCH'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  if (cols >= 42) return [[move, 'MOVE'], [punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
  return [[punch, 'HIT'], [kick, 'KICK'], ['?', 'MOVES'], ['Q', quit]];
}

/** Draw the HUD through an existing surface. Exported separately so tests can
 * observe the semantic layout while delegating to the real pixel renderer. */
export function drawFightHudSurface(ui: Surface, m: Match, practice: boolean, bindings: KeyBindings = DEFAULT_KEY_BINDINGS, showControls = true): void {
  const cols = ui.cols;
  const margin = 2;
  const gap = cols >= 40 ? 6 : 2;
  const barW = Math.max(6, Math.floor((cols - margin * 2 - gap) / 2));

  // --- top band with padding: names/hp/wins + timer, then framed health bars ---
  const nameY = 0.7;                 // padded down from the screen top
  const barY = nameY + 1.25;
  const bandH = barY + 1.2;
  ui.fill(0, 0, cols, bandH, THEME.shadow);
  ui.fill(0, bandH - 0.14, cols, 0.14, THEME.panelBorder);   // bottom edge

  const detailed = cols >= 52;
  const left = detailed ? `${m.a.name}  HP ${m.a.hp}  W${m.a.wins}` : `${m.a.name} ${m.a.hp}`;
  const right = detailed ? `W${m.b.wins}  HP ${m.b.hp}  ${m.b.name}` : `${m.b.hp} ${m.b.name}`;
  const timer = practice ? 'TRAIN' : `R${m.round}  ${String(Math.max(0, Math.ceil(m.roundTime))).padStart(2, '0')}`;
  const timerX = Math.max(0, Math.floor((cols - timer.length) / 2));
  const leftMax = Math.max(0, timerX - margin - 1);
  const rightStart = Math.min(cols - margin, timerX + timer.length + 1);
  const rightMax = Math.max(0, cols - margin - rightStart);
  const shownRight = right.length > rightMax ? right.slice(right.length - rightMax) : right;
  ui.text(margin, nameY, left.slice(0, leftMax), { color: P1 });
  ui.text(timerX, nameY, timer, { color: practice ? P1 : THEME.accent });
  ui.text(cols - margin - shownRight.length, nameY, shownRight, { color: P2 });

  healthBar(ui, margin, barY, barW, m.a.hp / 100, false);
  healthBar(ui, cols - margin - barW, barY, barW, m.b.hp / 100, true);
  if (gap >= 4) centerText(ui, barY, 'VS', { color: THEME.textDim });

  // --- center announcement (ROUND 1 / FIGHT! / KO / X WINS ROUND / DRAW) ---
  if (m.message) {
    const col = /KO|WINS|FIGHT|PERFECT/.test(m.message) ? THEME.accent : THEME.accent2;
    banner(ui, Math.max(3, Math.floor(ui.rows * 0.34)), m.message, col);
  }

  // --- controls (suppressed when the host screen draws its own footer, e.g. calibrate) ---
  if (showControls) hints(ui, ui.rows - 1, controls(cols, practice, bindings));
}

export function drawFightHud(f: Frame, m: Match, practice: boolean, bindings: KeyBindings = DEFAULT_KEY_BINDINGS, showControls = true): void {
  drawFightHudSurface(makeSurface(f), m, practice, bindings, showControls);
}

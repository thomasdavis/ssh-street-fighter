import type { Frame } from '../render/frame.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { specialMoveInput, specialMovesFor } from '../game/moves.js';
import { attackButtonLabels, bindingLabel } from '../input/bindings.js';

const NOTES = [
  'BLOCK BY HOLDING BACK (AWAY FROM YOUR FOE).',
  'YOU CAN PUNCH AND KICK WHILE CROUCHING.',
  'YOU ALWAYS FACE YOUR RIVAL; JUMP TO CROSS UP.',
  'FIRST TO 2 ROUNDS WINS; 60S PER ROUND.',
];

export const helpOverlay = {
  render(s: Session, f: Frame): void {
    if (s.screen === 'fight' && s.match) { renderFightMoves(s, f); return; }
    f.dim(0.3); f.dimPixel(0.3);  // darken whatever is behind so the modal stands out
    const ui = makeSurface(f);
    const pw = Math.min(54, ui.cols - 4);
    const ph = Math.min(19, ui.rows - 2);
    const px = Math.floor((ui.cols - pw) / 2), py = Math.max(1, Math.floor((ui.rows - ph) / 2));
    const inner = ui.panel(px, py, pw, ph, { title: 'HOW TO FIGHT' });
    const iw = Math.floor(inner.w);
    const valX = Math.min(9, Math.floor(inner.w * 0.4));
    let y = inner.y;
    const lines: [string, string][] = [
      ['MOVE', `${bindingLabel(s.keyBindings.left)} / ${bindingLabel(s.keyBindings.right)}`],
      ['JUMP', `${bindingLabel(s.keyBindings.jump)} / ${bindingLabel(s.keyBindings.jumpAlt)}`],
      ['CROUCH', bindingLabel(s.keyBindings.crouch)],
      ['PUNCH', `${bindingLabel(s.keyBindings.punch)}  FAST, SHORT`],
      ['KICK', `${bindingLabel(s.keyBindings.kick)}  SLOW, LONGER`],
      ['BLOCK', 'HOLD AWAY FROM RIVAL'],
      ['GFX', 'V TOGGLES OCTANT / HALF'],
      ['QUIT', 'Q'],
    ];
    for (const [k, v] of lines) {
      ui.text(inner.x, y, k, { color: THEME.accent, bold: true });
      ui.text(inner.x + valX, y, v.slice(0, Math.max(0, iw - valX)), { color: THEME.text });
      y++;
    }
    y++;
    for (const n of NOTES) { if (y < inner.y + inner.h) { ui.text(inner.x, y, n.slice(0, iw), { color: THEME.textDim }); y++; } }
    centerText(ui, py + ph - 2, 'PRESS ANY KEY TO CLOSE', { color: THEME.accent2, bold: true });
  },
};

function renderFightMoves(s: Session, f: Frame): void {
  f.dim(0.25); f.dimPixel(0.25);
  const ui = makeSurface(f);
  const fighter = s.match![s.role];
  const specials = specialMovesFor(fighter.name);
  const buttons = attackButtonLabels(s.keyBindings);
  const narrow = ui.cols < 54;
  const pw = Math.min(narrow ? 34 : 60, ui.cols - 4);
  const ph = Math.min(narrow ? 11 : 13, ui.rows - 2);
  const px = Math.floor((ui.cols - pw) / 2);
  const py = Math.max(1, Math.floor((ui.rows - ph) / 2));

  const inner = ui.panel(px, py, pw, ph, { title: `${fighter.name} MOVES` });
  const iw = Math.floor(inner.w);
  const contentBottom = inner.y + inner.h - 1.5;
  let y = inner.y;
  const put = (text: string, color = THEME.text, bold = false): void => { ui.text(inner.x, y, text.slice(0, iw), { color, bold }); };

  if (narrow) {
    if (specials.length) {
      for (const move of specials) {
        if (y > contentBottom) break;
        put(`${move.shortName.padEnd(10)} ${specialMoveInput(move, fighter.facing, true, buttons)}`, THEME.text, true); y++;
      }
    } else { put('NO UNIQUE SPECIAL MOVES', THEME.textDim); y++; }
    if (y <= contentBottom) { y++; put(`LOW PUNCH  ↓ + ${buttons.punch}`); y++; }
    if (y <= contentBottom) put(`LOW KICK   ↓ + ${buttons.kick}`);
  } else {
    put(`SPECIAL MOVES  ·  FACING ${fighter.facing === 1 ? '→' : '←'}`, THEME.accent2, true); y++;
    if (specials.length) {
      for (const move of specials) {
        if (y > contentBottom) break;
        ui.text(inner.x, y, move.name.slice(0, 17), { color: THEME.accent, bold: true });
        ui.text(inner.x + Math.min(18, iw - 8), y, specialMoveInput(move, fighter.facing, false, buttons), { color: THEME.text });
        y++;
      }
    } else { put('NO UNIQUE SPECIAL MOVES YET.', THEME.textDim); y++; }
    if (y <= contentBottom) y++;
    if (y <= contentBottom) { put('COMBINATIONS', THEME.accent2, true); y++; }
    if (y <= contentBottom) { ui.text(inner.x, y, 'LOW PUNCH', { color: THEME.accent, bold: true }); ui.text(inner.x + Math.min(18, iw - 8), y, `↓ + ${buttons.punch}`, { color: THEME.text }); y++; }
    if (y <= contentBottom) { ui.text(inner.x, y, 'LOW KICK', { color: THEME.accent, bold: true }); ui.text(inner.x + Math.min(18, iw - 8), y, `↓ + ${buttons.kick}`, { color: THEME.text }); }
  }
  centerText(ui, py + ph - 2, 'PRESS ANY KEY TO CLOSE', { color: THEME.accent2, bold: true });
}

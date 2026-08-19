import type { Frame } from '../render/frame.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { centerText, fieldRows, section, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { specialMoveInput, specialMovesFor } from '../game/moves.js';
import { attackButtonLabels, bindingLabel } from '../input/bindings.js';

const NOTES = [
  'BLOCK BY HOLDING BACK (AWAY FROM YOUR FOE).',
  'THROWS ARE UNBLOCKABLE — GRAB A TURTLE UP CLOSE.',
  'YOU ALWAYS FACE YOUR RIVAL; JUMP TO CROSS UP.',
  'FIRST TO 2 ROUNDS WINS; 60S PER ROUND.',
];

export const helpOverlay = {
  render(s: Session, f: Frame): void {
    if (s.screen === 'fight' && s.match) { renderFightMoves(s, f); return; }
    f.dim(0.3); f.dimPixel(0.3);  // darken whatever is behind so the modal stands out
    const ui = makeSurface(f);
    const b = s.keyBindings;
    const controls: [string, string][] = [
      ['MOVE', `${bindingLabel(b.left)} / ${bindingLabel(b.right)}`],
      ['JUMP', `${bindingLabel(b.jump)} / ${bindingLabel(b.jumpAlt)}`],
      ['CROUCH', bindingLabel(b.crouch)],
      ['PUNCH', `${bindingLabel(b.punch)}    FAST, SHORT REACH`],
      ['KICK', `${bindingLabel(b.kick)}    SLOWER, LONGER`],
      ['THROW', `${bindingLabel(b.throw)}    CLOSE GRAB — BEATS BLOCK`],
      ['BLOCK', 'HOLD AWAY FROM RIVAL'],
    ];
    const contentH = 0.6 + controls.length * SP.row + SP.gap + SP.row + NOTES.length * SP.line + 1.4;
    const ph = Math.min(ui.rows - 2, Math.ceil(contentH + 2));
    const pw = Math.min(58, ui.cols - 4);
    const px = Math.floor((ui.cols - pw) / 2), py = Math.max(1, Math.floor((ui.rows - ph) / 2));
    const inner = ui.panel(px, py, pw, ph, { title: 'HOW TO FIGHT' });
    const cx = inner.x + 0.5, cw = inner.w - 1, iw = Math.floor(cw);

    let y = inner.y + 0.4;
    y = fieldRows(ui, cx, y, controls, { labelW: 8 });
    y += SP.gap;
    y = section(ui, cx, y, cw, 'TIPS');
    for (const n of NOTES) { if (y < inner.y + inner.h - 1) { ui.text(cx, y, n.slice(0, iw), { color: THEME.textDim }); y += SP.line; } }
    centerText(ui, py + ph - 1.4, 'PRESS ANY KEY TO CLOSE', { color: THEME.accent2 });
  },
};

function renderFightMoves(s: Session, f: Frame): void {
  f.dim(0.25); f.dimPixel(0.25);
  const ui = makeSurface(f);
  const fighter = s.match![s.role];
  const specials = specialMovesFor(fighter.name);
  const buttons = attackButtonLabels(s.keyBindings);
  const facing = fighter.facing === 1 ? '→' : '←';

  const specialRows: [string, string][] = specials.length
    ? specials.map((m) => [m.name.slice(0, 16), specialMoveInput(m, fighter.facing, false, buttons)] as [string, string])
    : [['NO SPECIAL MOVES YET', '']];
  const comboRows: [string, string][] = [
    ['THROW', `${bindingLabel(s.keyBindings.throw)}  — CLOSE, UNBLOCKABLE`],
    ['LOW PUNCH', `↓ + ${buttons.punch}`],
    ['LOW KICK', `↓ + ${buttons.kick}`],
  ];

  const contentH = 0.6 + SP.row + specialRows.length * SP.row + SP.gap + SP.row + comboRows.length * SP.row + 1.4;
  const pw = Math.min(60, ui.cols - 4);
  const ph = Math.min(ui.rows - 2, Math.ceil(contentH + 2));
  const px = Math.floor((ui.cols - pw) / 2), py = Math.max(1, Math.floor((ui.rows - ph) / 2));
  const inner = ui.panel(px, py, pw, ph, { title: `${fighter.name} MOVES` });
  const cx = inner.x + 0.5, cw = inner.w - 1;
  const labelW = Math.min(18, Math.floor(cw * 0.5));

  let y = inner.y + 0.4;
  y = section(ui, cx, y, cw, `SPECIAL MOVES  ·  FACING ${facing}`);
  y = fieldRows(ui, cx, y, specialRows, { labelW });
  y += SP.gap;
  y = section(ui, cx, y, cw, 'COMBINATIONS');
  fieldRows(ui, cx, y, comboRows, { labelW });
  centerText(ui, py + ph - 1.4, 'PRESS ANY KEY TO CLOSE', { color: THEME.accent2 });
}

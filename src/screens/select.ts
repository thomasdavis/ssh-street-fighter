import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { fitGrid, rgb } from '../render/pixel.js';
import { composeSelectStage, SELECT_STAGE, fighterSlot } from '../game/select-scene.js';
import { makeSurface } from '../ui/surface.js';
import { hints, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { ROSTER, characterAt } from '../game/roster.js';
import * as db from '../db/db.js';

const BLACK = rgb(0, 0, 0);

export const select = {
  render(s: Session, f: Frame): void {
    const pw = f.cols * 2, ph = f.rows * 4;
    // rendered fighter sprites go in the pixel layer; the pixel-font overlay
    // draws on top of the same layer (makeSurface reuses f.pixel()).
    f.usePixel(fitGrid(composeSelectStage(s.cursor, s.frame), pw, ph, BLACK));
    const ui = makeSurface(f);
    const scale = Math.min(pw / SELECT_STAGE.W, ph / SELECT_STAGE.H);
    const ox = (pw - SELECT_STAGE.W * scale) / 2, oy = (ph - SELECT_STAGE.H * scale) / 2;
    const toUX = (lx: number) => ui.unitX(ox + lx * scale);
    const toUY = (ly: number) => ui.unitY(oy + ly * scale);

    ui.heading(0, 'SELECT FIGHTER', THEME.accent, 1);
    centerText(ui, ui.headingHeight(1), s.selectMode === 'practice' ? 'PRACTICE - PICK A FIGHTER' : 'VERSUS LOBBY - PICK A FIGHTER', { color: THEME.accent2 });

    const n = ROSTER.length;
    const sel = ((s.cursor % n) + n) % n;
    for (let i = 0; i < n; i++) {
      const c = characterAt(i);
      const slot = fighterSlot(i, n);
      const cx = toUX(slot.x);
      const nameRow = Math.round(toUY(slot.baseline + 6));
      const isSel = i === sel;
      ui.text(cx - c.name.length / 2, nameRow, c.name, { color: isSel ? THEME.accent : THEME.textDim, bold: isSel });
      if (isSel) ui.text(cx - 3, nameRow + 1, '▲ PICK', { color: THEME.accent, bold: true });
    }

    const chosen = characterAt(sel);
    centerText(ui, ui.rows - 2, chosen.tagline.toUpperCase(), { color: THEME.text });
    hints(ui, ui.rows - 1, [['A/D', 'CHOOSE'], ['ENTER', 'START'], ['ESC', 'BACK']]);
  },

  onKey(s: Session, k: Key): void {
    if (k.t === 'left' || (k.t === 'char' && k.ch.toLowerCase() === 'a')) s.cursor = (s.cursor - 1 + ROSTER.length) % ROSTER.length;
    else if (k.t === 'right' || (k.t === 'char' && k.ch.toLowerCase() === 'd')) s.cursor = (s.cursor + 1) % ROSTER.length;
    else if (k.t === 'esc' || (k.t === 'char' && k.ch.toLowerCase() === 'q')) s.goTo('menu');
    else if (k.t === 'enter' || (k.t === 'char' && (k.ch === 'j' || k.ch === ' '))) {
      if (!s.guest && s.fp) db.setMainChar(s.fp, s.cursor);
      s.trackEvent('fighter_selected', { fighter: characterAt(s.cursor).name, mode: s.selectMode });
      if (s.selectMode === 'practice') s.startPractice(s.cursor);
      else s.joinLobby();
    }
  },
};

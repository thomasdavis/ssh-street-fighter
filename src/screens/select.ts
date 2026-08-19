import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import type { RGB } from '../render/pixel.js';
import { composeSelectStage, selectLayout, SELECT_COLS } from '../game/select-scene.js';
import { makeSurface } from '../ui/surface.js';
import { hints, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { ROSTER, characterAt, type Character } from '../game/roster.js';
import * as db from '../db/db.js';

const DIFF_COLOR: Record<Character['difficulty'], RGB> = {
  Beginner: THEME.good, Intermediate: THEME.accent, Advanced: THEME.bad,
};

export const select = {
  render(s: Session, f: Frame): void {
    const pw = f.cols * 2, ph = f.rows * 4;
    // The SF2-style scene (spotlit hero + framed portrait grid) is the pixel layer;
    // crisp names/hints are overlaid in the text surface, aligned to the same geometry.
    f.usePixel(composeSelectStage(s.cursor, s.frame, pw, ph));
    const ui = makeSurface(f);
    const n = ROSTER.length;
    const sel = ((s.cursor % n) + n) % n;
    const L = selectLayout(pw, ph, n);

    ui.heading(0, 'SELECT YOUR FIGHTER', THEME.accent, 1);
    centerText(ui, ui.headingHeight(1), s.selectMode === 'practice' ? 'PRACTICE - PICK YOUR FIGHTER' : 'VERSUS - PICK YOUR FIGHTER', { color: THEME.accent2 });

    // A name tag under each portrait, truncated to the box width; the pick is gold.
    for (let i = 0; i < n; i++) {
      const b = L.boxes[i]!;
      const isSel = i === sel;
      const cxu = ui.unitX(b.x + b.w / 2);
      const maxCh = Math.max(3, Math.floor(ui.unitX(b.w)) + 1);   // may overhang a touch into the cell gap
      const label = characterAt(i).name.slice(0, maxCh);
      ui.text(cxu - label.length / 2, ui.unitY(L.nameY[i]!), label, { color: isSel ? THEME.accent : THEME.textDim, bold: isSel });
    }

    // Nameplate banner across the top of the hero portrait.
    const c = characterAt(sel);
    const heroCxU = ui.unitX(L.hero.cx);
    const plate = ` ${c.name} `;
    ui.text(heroCxU - plate.length / 2, ui.unitY(L.hero.y) + 0.2, plate, { color: THEME.selectText, bg: THEME.select, bold: true });

    // Bottom band: tagline, difficulty/archetype, controls.
    centerText(ui, ui.rows - 3, `· ${c.tagline.toUpperCase()} ·`, { color: THEME.text });
    centerText(ui, ui.rows - 2, `${c.difficulty.toUpperCase()} · ${c.archetype.toUpperCase()}`, { color: DIFF_COLOR[c.difficulty], bold: true });
    hints(ui, ui.rows - 1, [['WASD', 'MOVE'], ['ENTER', 'START'], ['ESC', 'BACK']]);
  },

  onKey(s: Session, k: Key): void {
    const n = ROSTER.length;
    const isCh = (ch: string): boolean => k.t === 'char' && k.ch.toLowerCase() === ch;
    if (k.t === 'left' || isCh('a')) s.cursor = (s.cursor - 1 + n) % n;
    else if (k.t === 'right' || isCh('d')) s.cursor = (s.cursor + 1) % n;
    else if (k.t === 'up' || isCh('w')) { const t = s.cursor - SELECT_COLS; if (t >= 0) s.cursor = t; }
    else if (k.t === 'down' || isCh('s')) { const t = s.cursor + SELECT_COLS; if (t < n) s.cursor = t; }
    else if (k.t === 'esc' || isCh('q')) s.goTo('menu');
    else if (k.t === 'enter' || (k.t === 'char' && (k.ch === 'j' || k.ch === ' '))) {
      if (!s.guest && s.fp) db.setMainChar(s.fp, s.cursor);
      s.trackEvent('fighter_selected', { fighter: characterAt(s.cursor).name, mode: s.selectMode });
      if (s.selectMode === 'practice') s.startPractice(s.cursor);
      else s.joinLobby();
    }
  },
};

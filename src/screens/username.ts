import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { hints, inputField, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import * as db from '../db/db.js';

const NAME_RE = /^[A-Za-z0-9_\-]$/;

export const username = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, 'STREET FIGHTER', THEME.accent, 1);
    const py = 1 + ui.headingHeight(1) + Math.round(SP.section);
    const pw = Math.min(48, ui.cols - 6);
    const px = Math.floor((ui.cols - pw) / 2);
    const inner = ui.panel(px, py, pw, 4 + SP.row + 1, { title: 'CHOOSE YOUR HANDLE' });
    inputField(ui, inner.x, inner.y + SP.gap, inner.w, s.usernameBuf, { focus: true, frame: s.frame, placeholder: '3-12 LETTERS / NUMBERS' });
    const msg = s.errorMsg ? [THEME.bad, s.errorMsg] as const
      : s.guest ? [THEME.textDim, 'GUEST - NAME NOT SAVED (CONNECT WITH AN SSH KEY)'] as const
      : [THEME.good, 'TIED TO YOUR SSH KEY - REMEMBERED NEXT TIME'] as const;
    centerText(ui, inner.y + SP.gap + 3 + SP.row, msg[1], { color: msg[0] });
    hints(ui, ui.rows - 2, [['TYPE', 'NAME'], ['ENTER', 'CONFIRM'], ['CTRL-C', 'QUIT']]);
  },

  onKey(s: Session, k: Key): void {
    if (k.t === 'char' && NAME_RE.test(k.ch) && s.usernameBuf.length < 12) { s.usernameBuf += k.ch; s.errorMsg = ''; }
    else if (k.t === 'backspace') { s.usernameBuf = s.usernameBuf.slice(0, -1); s.errorMsg = ''; }
    else if (k.t === 'enter') {
      const name = s.usernameBuf.trim();
      if (name.length < 3) { s.errorMsg = 'TOO SHORT (MIN 3)'; return; }
      if (db.usernameTaken(name)) { s.errorMsg = 'NAME ALREADY TAKEN'; return; }
      if (!s.guest && s.fp) { if (!db.setUsername(s.fp, name)) { s.errorMsg = 'NAME ALREADY TAKEN'; return; } s.player = db.getByFingerprint(s.fp)!; }
      s.username = name;
      s.trackEvent('handle_chosen', { handle: name, persisted: !s.guest });
      s.goTo('menu');
    }
  },
};

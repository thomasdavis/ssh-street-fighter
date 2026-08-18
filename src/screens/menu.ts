import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { menuList, hints, stat } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { characterAt, ROSTER } from '../game/roster.js';
import * as db from '../db/db.js';

const ITEMS = ['QUICK MATCH', 'FIGHT LOUNGE', 'PRACTICE MODE', 'LEADERBOARD', 'CONTROLS', 'HELP', 'QUIT'];

export const menu = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, 'STREET FIGHTER', THEME.accent, 1);
    const hy = 1 + ui.headingHeight(1) + 1;
    const welcome = `WELCOME, ${s.displayName}`;
    ui.text(Math.floor((ui.cols - welcome.length) / 2), hy, welcome, { color: THEME.text, bold: true });

    // two panels (menu + fighter card), centered as a group
    const leftW = Math.min(40, Math.floor(ui.cols * 0.5));
    const rightW = Math.min(26, Math.floor(ui.cols * 0.3));
    const gap = 2;
    const startX = Math.max(0, Math.floor((ui.cols - (leftW + gap + rightW)) / 2));
    const py = hy + 2;
    const ph = Math.min(ITEMS.length * 2 + 3, ui.rows - py - 3);

    const menuInner = ui.panel(startX, py, leftW, ph, { title: 'MAIN MENU' });
    menuList(ui, menuInner.x, menuInner.y, menuInner.w, ITEMS, s.menuIndex);

    const cardInner = ui.panel(startX + leftW + gap, py, rightW, ph, { title: 'YOUR FIGHTER' });
    const c = characterAt(s.cursor);
    let ry = cardInner.y;
    ui.text(cardInner.x, ry++, c.name, { color: THEME.accent, bold: true });
    ui.text(cardInner.x, ry++, c.tagline.toUpperCase(), { color: THEME.textDim });
    ry++;
    const p = s.player;
    if (p) {
      const rank = s.fp ? db.playerRank(s.fp) : null;
      stat(ui, cardInner.x, ry++, 'WINS', String(p.wins), THEME.good);
      stat(ui, cardInner.x, ry++, 'LOSSES', String(p.losses), THEME.bad);
      stat(ui, cardInner.x, ry++, 'ELO', String(p.elo), THEME.accent);
      if (rank) stat(ui, cardInner.x, ry++, 'RANK', `#${rank}`, THEME.accent2);
      stat(ui, cardInner.x, ry++, 'WIN%', String(p.matches ? Math.round((p.wins / p.matches) * 100) : 0));
    } else {
      ui.text(cardInner.x, ry++, 'GUEST', { color: THEME.textDim });
      ui.text(cardInner.x, ry++, 'stats not saved', { color: THEME.textDim });
    }

    hints(ui, ui.rows - 2, [['W/S', 'MOVE'], ['ENTER', 'SELECT'], ['?', 'HELP']]);
  },

  onKey(s: Session, k: Key): void {
    if (k.t === 'up' || (k.t === 'char' && k.ch.toLowerCase() === 'w')) s.menuIndex = (s.menuIndex - 1 + ITEMS.length) % ITEMS.length;
    else if (k.t === 'down' || (k.t === 'char' && k.ch.toLowerCase() === 's')) s.menuIndex = (s.menuIndex + 1) % ITEMS.length;
    else if (k.t === 'left' || (k.t === 'char' && k.ch.toLowerCase() === 'a')) s.cursor = (s.cursor - 1 + ROSTER.length) % ROSTER.length;
    else if (k.t === 'right' || (k.t === 'char' && k.ch.toLowerCase() === 'd')) s.cursor = (s.cursor + 1) % ROSTER.length;
    else if (k.t === 'enter' || (k.t === 'char' && (k.ch === 'j' || k.ch === ' '))) {
      switch (s.menuIndex) {
        case 0: s.selectMode = 'lobby'; s.goTo('select'); break;
        case 1: s.enterLounge(); break;
        case 2: s.selectMode = 'practice'; s.goTo('select'); break;
        case 3: s.goTo('leaderboard'); break;
        case 4: s.goTo('controls'); break;
        case 5: s.helpOpen = true; s.prevFrame = null; break;
        case 6: s.close(); break;
      }
    }
  },
};

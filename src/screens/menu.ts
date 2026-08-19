import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { menuList, hints, stat, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import type { RGB } from '../render/pixel.js';
import { characterAt, ROSTER } from '../game/roster.js';
import { composeMenuStage } from '../game/select-scene.js';
import * as db from '../db/db.js';

const ITEMS = ['QUICK MATCH', 'FIGHT LOUNGE', 'PRACTICE MODE', 'LEADERBOARD', 'HELP', 'QUIT'];
const MENU_STAGE = 'harbor';   // title-screen backdrop

export const menu = {
  render(s: Session, f: Frame): void {
    // Title-screen scene: dimmed stage + the selected fighter posing on the right.
    f.usePixel(composeMenuStage(s.cursor, s.frame, f.cols * 2, f.rows * 4, MENU_STAGE));
    const ui = makeSurface(f);
    ui.heading(1, 'STREET FIGHTER', THEME.accent, 1);
    const hy = 1 + ui.headingHeight(1) + 1;
    centerText(ui, hy, `WELCOME, ${s.displayName}`, { color: THEME.text });

    // MAIN MENU panel on the left, over the scene.
    const leftW = Math.min(36, Math.floor(ui.cols * 0.42));
    const py = hy + Math.round(SP.gap) + 1;
    const avail = ui.rows - py - 2;
    const rowGap = ITEMS.length * 2 + 3 <= avail ? 1 : 0;
    const ph = Math.min(ITEMS.length * (1 + rowGap) + 3, avail);
    const menuInner = ui.panel(3, py, leftW, ph, { title: 'MAIN MENU' });
    menuList(ui, menuInner.x, menuInner.y, menuInner.w, ITEMS, s.menuIndex, { gap: rowGap });

    // Fighter nameplate: bottom-right, over the sprite. Height is computed from
    // the content (title + tagline + stat rows) so nothing bleeds past the box.
    const c = characterAt(s.cursor);
    const p = s.player;
    const rank = p && s.fp ? db.playerRank(s.fp) : null;
    const rows: [string, string, RGB][] = p
      ? [
          ['ELO', String(p.elo), THEME.accent],
          ['RECORD', `${p.wins}-${p.losses}`, THEME.text],
          rank ? ['RANK', `#${rank}`, THEME.accent2] : ['WIN%', `${p.matches ? Math.round((p.wins / p.matches) * 100) : 0}%`, THEME.accent2],
        ]
      : [['', 'GUEST - NOT SAVED', THEME.textDim]];
    const rowPitch = 1.35;
    const npW = Math.min(28, Math.floor(ui.cols * 0.32));
    const npH = Math.ceil(2 + SP.row + rows.length * rowPitch + 1.2);
    const npX = ui.cols - npW - 3;
    const np = ui.panel(npX, ui.rows - npH - 2, npW, npH, { title: c.name, titleColor: THEME.accent });
    const iw = Math.floor(np.w);
    ui.text(np.x, np.y, c.tagline.toUpperCase().slice(0, iw), { color: THEME.textDim });
    let ry = np.y + SP.row;
    for (const [label, value, col] of rows) {
      if (label) stat(ui, np.x, ry, label, value, col);
      else ui.text(np.x, ry, value.slice(0, iw), { color: col });
      ry += rowPitch;
    }

    hints(ui, ui.rows - 1, [['W/S', 'MENU'], ['A/D', 'FIGHTER'], ['ENTER', 'SELECT'], ['?', 'HELP']]);
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
        case 4: s.helpOpen = true; s.prevFrame = null; break;
        case 5: s.close(); break;
      }
    }
  },
};

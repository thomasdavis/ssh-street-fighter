import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { hints, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import * as db from '../db/db.js';

export const results = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    const r = s.result;
    if (!r) { ui.heading(Math.floor(ui.rows / 2) - 2, 'MATCH OVER', THEME.text, 1); return; }
    const big = r.youWon ? 'YOU WIN' : 'YOU LOSE';
    const col = r.youWon ? THEME.good : THEME.bad;
    const hy = Math.max(1, Math.floor(ui.rows / 2) - 6);
    ui.heading(hy, big, col, 2);
    let y = hy + ui.headingHeight(2) + SP.section;
    const winner = `${r.winner}${r.winnerIsBot ? ' [BOT]' : ''}`;
    const loser = `${r.loser}${r.loserIsBot ? ' [BOT]' : ''}`;
    centerText(ui, y, `${winner} DEFEATED ${loser}`, { color: THEME.text }); y += SP.row + SP.gap;
    if (r.rating) {
      const sign = r.rating.delta >= 0 ? '+' : '';
      centerText(ui, y, `ELO  ${r.rating.before}  -  ${r.rating.after}  (${sign}${r.rating.delta})`, { color: r.rating.delta >= 0 ? THEME.good : THEME.bad });
    } else centerText(ui, y, 'UNRATED MATCH', { color: THEME.textDim });
    y += SP.row;
    if (s.player) { y += SP.gap; centerText(ui, y, `RECORD  ${s.player.wins} W - ${s.player.losses} L`, { color: THEME.textDim }); }
    hints(ui, ui.rows - 2, [['ENTER', 'MAIN MENU']]);
  },
  onKey(s: Session, _k: Key): void {
    if (s.fp) s.player = db.getByFingerprint(s.fp) ?? s.player;
    s.goTo('menu');
  },
};

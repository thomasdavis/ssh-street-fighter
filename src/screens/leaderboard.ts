import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { hints, table, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';

export const leaderboard = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, s.leaderScope === 'humans' ? 'HUMAN LEAGUE' : 'OPEN LEAGUE', THEME.accent, 1);
    const py = 1 + ui.headingHeight(1) + Math.round(SP.section);
    const pw = Math.min(66, ui.cols - 6);
    const px = Math.floor((ui.cols - pw) / 2);
    const inner = ui.panel(px, py, pw, ui.rows - py - 3, {
      title: s.leaderScope === 'humans' ? 'HUMANS ONLY' : 'ALL PLAYERS · BOTS MARKED',
    });
    const cx = inner.x + 1;               // content left margin
    const cw = inner.w - 2;
    // columns scale to the content width; colours give the row hierarchy
    const colX = [0, cw * 0.09, cw * 0.52, cw * 0.70, cw * 0.80, cw * 0.89];
    const headers = ['#', 'FIGHTER', 'ELO', 'W', 'L', 'WIN%'];
    const colColors = [THEME.textDim, THEME.text, THEME.accent, THEME.text, THEME.text, THEME.accent2];
    const rows = s.leader.map((r, i) => [String(i + 1), `${r.username}${r.is_bot ? ' [BOT]' : ''}`, String(r.elo), String(r.wins), String(r.losses), `${Math.round(r.win_pct * 100)}%`]);
    const myIdx = s.leader.findIndex((r) => r.username === s.displayName);
    const maxRows = Math.max(0, Math.floor((inner.h - SP.row - 1.5) / SP.row));
    if (rows.length === 0) centerText(ui, inner.y + 3, 'NO MATCHES YET - BE THE FIRST!', { color: THEME.textDim });
    else table(ui, cx, inner.y + 0.4, cw, colX, headers, rows.slice(0, maxRows), myIdx, { colColors });
    hints(ui, ui.rows - 2, [['T', s.leaderScope === 'humans' ? 'OPEN' : 'HUMANS'], ['ESC', 'BACK']]);
  },
  onKey(s: Session, k: Key): void {
    if (k.t === 'char' && k.ch.toLowerCase() === 't') s.toggleLeaderboardScope();
    else if (k.t === 'esc' || k.t === 'enter' || (k.t === 'char' && k.ch.toLowerCase() === 'q')) s.goTo('menu');
  },
};

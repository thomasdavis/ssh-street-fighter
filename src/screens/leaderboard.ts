import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { hints, table, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';

export const leaderboard = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, 'LEADERBOARD', THEME.accent, 1);
    const py = ui.headingHeight(1) + 2;
    const pw = Math.min(64, ui.cols - 4);
    const px = Math.floor((ui.cols - pw) / 2);
    const inner = ui.panel(px, py, pw, ui.rows - py - 3, { title: 'TOP FIGHTERS' });
    const w = inner.w;
    // columns scale to the panel width so they fit any virtual-grid size
    const colX = [0, Math.round(w * 0.10), Math.round(w * 0.54), Math.round(w * 0.72), Math.round(w * 0.81), Math.round(w * 0.90)];
    const headers = ['#', 'FIGHTER', 'ELO', 'W', 'L', 'WIN%'];
    const rows = s.leader.map((r, i) => [String(i + 1), r.username, String(r.elo), String(r.wins), String(r.losses), `${Math.round(r.win_pct * 100)}%`]);
    const myIdx = s.leader.findIndex((r) => r.username === s.displayName);
    if (rows.length === 0) centerText(ui, inner.y + 3, 'NO MATCHES YET - BE THE FIRST!', { color: THEME.textDim });
    else table(ui, inner.x, inner.y + 1, w, colX, headers, rows.slice(0, Math.max(0, Math.floor(inner.h) - 3)), myIdx);
    hints(ui, ui.rows - 2, [['ESC', 'BACK']]);
  },
  onKey(s: Session, k: Key): void {
    if (k.t === 'esc' || k.t === 'enter' || (k.t === 'char' && k.ch.toLowerCase() === 'q')) s.goTo('menu');
  },
};

import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { composeWaitingStage, SELECT_STAGE } from '../game/select-scene.js';
import { makeSurface } from '../ui/surface.js';
import { hints, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { characterAt } from '../game/roster.js';

export const lobbyWait = {
  render(s: Session, f: Frame): void {
    const pw = f.cols * 2, ph = f.rows * 4;
    f.usePixel(composeWaitingStage(s.cursor, s.frame, pw, ph));
    const ui = makeSurface(f);
    const scale = Math.min(pw / SELECT_STAGE.W, ph / SELECT_STAGE.H);
    const oy = (ph - SELECT_STAGE.H * scale) / 2;
    const toUY = (ly: number) => Math.round(ui.unitY(oy + ly * scale));

    const c = characterAt(s.cursor);
    ui.heading(1, c.name, THEME.accent, 1);
    const dots = '.'.repeat(1 + (Math.floor(s.frame / 10) % 3));
    const target = s.quickOpponentPool === 'bots' ? 'BOT' : 'HUMAN CHALLENGER';
    centerText(ui, toUY(SELECT_STAGE.floor + 10), `WAITING FOR ${target}${dots}`, { color: THEME.text, bold: true });
    centerText(ui, toUY(SELECT_STAGE.floor + 10) + 2,
      s.quickOpponentPool === 'bots' ? 'MATCHING ONLY WITH VERIFIED BOT ACCOUNTS' : 'MATCHING ONLY WITH HUMAN PLAYERS',
      { color: THEME.textDim });
    hints(ui, ui.rows - 1, [['ESC', 'CANCEL']]);
  },
  onKey(s: Session, k: Key): void {
    if (k.t === 'esc' || (k.t === 'char' && k.ch.toLowerCase() === 'q')) s.cancelLobby();
  },
};

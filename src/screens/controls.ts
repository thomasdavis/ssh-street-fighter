import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { makeSurface } from '../ui/surface.js';
import { hints, centerText } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import {
  ACTION_LABEL,
  BINDABLE_ACTIONS,
  actionUsing,
  bindingFromKey,
  bindingLabel,
  bindingProblem,
} from '../input/bindings.js';

export const controls = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, 'CONTROLS', THEME.accent, 1);

    const py = ui.headingHeight(1) + 2;
    const pw = Math.min(50, ui.cols - 4);
    const px = Math.floor((ui.cols - pw) / 2);
    const rowsAvail = Math.max(0, Math.min(BINDABLE_ACTIONS.length, ui.rows - py - 6));
    const ph = rowsAvail + 3;
    const inner = ui.panel(px, py, pw, ph, { title: 'YOUR KEY BINDINGS' });
    const valX = Math.min(16, Math.floor(inner.w * 0.5));

    for (let i = 0; i < rowsAvail; i++) {
      const action = BINDABLE_ACTIONS[i]!;
      const y = inner.y + i;
      const selected = i === s.controlsCursor;
      const capturing = selected && s.bindingCapture === action;
      if (selected) ui.fill(inner.x - 0.5, y, inner.w + 1, 1, THEME.select);
      ui.text(inner.x, y, ACTION_LABEL[action], { color: selected ? THEME.selectText : THEME.text, bold: selected });
      const value = capturing ? 'PRESS A KEY...' : bindingLabel(s.keyBindings[action]);
      ui.text(inner.x + valX, y, value, { color: capturing ? THEME.accent2 : THEME.accent, bold: true });
    }

    const infoY = py + ph + 1;
    const persistence = s.guest ? 'GUEST SETTINGS LAST FOR THIS SESSION' : 'SAVED TO YOUR VERIFIED SSH IDENTITY';
    centerText(ui, infoY, 'BLOCK = HOLD AWAY  ·  ? MOVES  ·  V GFX  ·  Q EXIT', { color: THEME.textDim });
    centerText(ui, infoY + 1, persistence, { color: s.guest ? THEME.textDim : THEME.good, bold: true });
    if (s.controlsNotice) centerText(ui, infoY + 3, s.controlsNotice, { color: THEME.accent2, bold: true });

    const normalHints: [string, string][] = ui.cols < 52
      ? [['↑/↓', 'PICK'], ['ENTER', 'CHANGE'], ['ESC', 'BACK']]
      : [['↑/↓', 'ACTION'], ['ENTER', 'CHANGE'], ['R', 'RESET'], ['ESC', 'BACK']];
    hints(ui, ui.rows - 1, s.bindingCapture ? [['KEY', 'ASSIGN'], ['ESC', 'CANCEL']] : normalHints);
  },

  onKey(s: Session, key: Key): void {
    if (s.bindingCapture) {
      if (key.t === 'esc') { s.bindingCapture = null; s.controlsNotice = 'CHANGE CANCELLED'; return; }
      const binding = bindingFromKey(key);
      if (!binding) { s.controlsNotice = 'USE AN ARROW, SPACE, LETTER, NUMBER, OR SYMBOL'; return; }
      const problem = bindingProblem(binding);
      if (problem) { s.controlsNotice = problem; return; }
      const duplicate = actionUsing(s.keyBindings, binding, s.bindingCapture);
      if (duplicate) { s.controlsNotice = `${bindingLabel(binding)} IS ALREADY USED BY ${ACTION_LABEL[duplicate]}`; return; }
      const action = s.bindingCapture;
      s.setKeyBinding(action, binding);
      s.bindingCapture = null;
      s.controlsNotice = `${ACTION_LABEL[action]} SET TO ${bindingLabel(binding)}`;
      return;
    }

    if (key.t === 'up' || (key.t === 'char' && key.ch.toLowerCase() === 'w')) {
      s.controlsCursor = (s.controlsCursor - 1 + BINDABLE_ACTIONS.length) % BINDABLE_ACTIONS.length;
    } else if (key.t === 'down' || (key.t === 'char' && key.ch.toLowerCase() === 's')) {
      s.controlsCursor = (s.controlsCursor + 1) % BINDABLE_ACTIONS.length;
    } else if (key.t === 'enter') {
      s.bindingCapture = BINDABLE_ACTIONS[s.controlsCursor]!;
      s.controlsNotice = `PRESS THE NEW KEY FOR ${ACTION_LABEL[s.bindingCapture]}`;
    } else if (key.t === 'char' && key.ch.toLowerCase() === 'r') {
      s.resetKeyBindings();
      s.controlsNotice = 'DEFAULT KEY BINDINGS RESTORED';
    } else if (key.t === 'esc') {
      s.goTo('menu');
    }
  },
};

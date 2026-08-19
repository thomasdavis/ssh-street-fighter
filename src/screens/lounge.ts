import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import type { Surface } from '../ui/surface.js';
import { makeSurface } from '../ui/surface.js';
import { hints, inputField, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { characterAt } from '../game/roster.js';

// Reads only the session's hub-filled caches (loungeRoster / loungeChat /
// incoming / outgoing) — plain data, so it renders identically whether the
// other players are in this process or on other cluster workers.
function drawMessages(s: Session, ui: Surface, x: number, y: number, w: number, h: number): void {
  type Line = { prefix?: string; text: string };
  const lines: Line[] = [];
  const iw = Math.floor(w);
  for (const message of s.loungeChat) {
    const prefix = `${message.username}: `;
    const firstW = Math.max(1, iw - prefix.length);
    lines.push({ prefix, text: message.message.slice(0, firstW) });
    let rest = message.message.slice(firstW);
    while (rest.length) { lines.push({ text: `  ${rest.slice(0, Math.max(1, iw - 2))}` }); rest = rest.slice(Math.max(1, iw - 2)); }
  }
  const visible = lines.slice(-Math.max(0, Math.floor(h)));
  if (!visible.length) {
    ui.text(x, y + 1, 'NO MESSAGES YET.', { color: THEME.textDim });
    ui.text(x, y + 2, 'TYPE BELOW AND PRESS ENTER.', { color: THEME.textDim });
    return;
  }
  for (let i = 0; i < visible.length; i++) {
    const line = visible[i]!;
    if (line.prefix) {
      ui.text(x, y + i, line.prefix, { color: THEME.accent, bold: true });
      ui.text(x + line.prefix.length, y + i, line.text, { color: THEME.text });
    } else ui.text(x, y + i, line.text, { color: THEME.textDim });
  }
}

export const lounge = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(1, 'FIGHT LOUNGE', THEME.accent, 1);
    const hy = 1 + ui.headingHeight(1) + Math.round(SP.gap);
    const you = characterAt(s.cursor);
    const ownElo = s.player ? String(s.player.elo) : 'UNRATED';
    centerText(ui, hy, `${s.displayName}  ·  ${you.name}  ·  ELO ${ownElo}`, { color: THEME.accent2 });

    const banner = hy + SP.row;
    if (s.incoming) {
      ui.fill(0, banner - 0.2, ui.cols, 1.2, THEME.select);
      centerText(ui, banner, `${s.incoming.name} CHALLENGED YOU  ·  Y ACCEPT / N DECLINE`, { color: THEME.selectText });
    } else if (s.outgoing) {
      ui.fill(0, banner - 0.2, ui.cols, 1.2, THEME.select);
      centerText(ui, banner, `CHALLENGE SENT TO ${s.outgoing.name}  ·  X CANCEL`, { color: THEME.selectText });
    } else {
      centerText(ui, banner, '[ESC] MAIN MENU  ·  [TAB] SWITCH CHAT / PLAYERS', { color: THEME.textDim });
    }

    const narrow = ui.cols < 76;
    const top = Math.ceil(banner + SP.row + 0.5);
    const bottom = Math.max(top + 4, ui.rows - 6);
    const panelH = bottom - top;
    const roster = s.loungeRoster;
    if (narrow) {
      const names = roster.length ? roster.map((p) => p.name).join(' · ').slice(0, ui.cols - 9) : 'NOBODY ELSE ONLINE';
      centerText(ui, top - 1, `ONLINE: ${names}`, { color: roster.length ? THEME.text : THEME.textDim });
      const chat = ui.panel(2, top, ui.cols - 4, panelH, { title: s.loungeFocus === 'chat' ? 'CHAT · ACTIVE' : 'CHAT', border: s.loungeFocus === 'chat' ? THEME.accent : THEME.panelBorder });
      drawMessages(s, ui, chat.x, chat.y, chat.w, chat.h);
    } else {
      const playersW = 30, chatW = ui.cols - playersW - 6;
      const chat = ui.panel(2, top, chatW, panelH, { title: s.loungeFocus === 'chat' ? 'CHAT · ACTIVE' : 'CHAT', border: s.loungeFocus === 'chat' ? THEME.accent : THEME.panelBorder });
      drawMessages(s, ui, chat.x, chat.y, chat.w, chat.h);

      const list = ui.panel(chatW + 3, top, playersW, panelH, { title: s.loungeFocus === 'players' ? 'PLAYERS · ACTIVE' : 'PLAYERS', border: s.loungeFocus === 'players' ? THEME.accent : THEME.panelBorder });
      if (!roster.length) {
        ui.text(list.x, list.y + 0.5, 'NOBODY ELSE ONLINE', { color: THEME.textDim });
        ui.text(list.x, list.y + 0.5 + SP.row, 'INVITE A FRIEND TO SSH IN.', { color: THEME.textDim });
      } else {
        s.loungeCursor = Math.max(0, Math.min(roster.length - 1, s.loungeCursor));
        const maxRows = Math.floor(list.h / SP.row);
        for (let i = 0; i < roster.length && i < maxRows; i++) {
          const p = roster[i]!, selected = s.loungeFocus === 'players' && i === s.loungeCursor;
          const ry = list.y + 0.3 + i * SP.row;
          if (selected) ui.fill(list.x - 0.7, ry - 0.3, list.w + 1.4, 1.2, THEME.select);
          const elo = p.elo ?? '---';
          const row = `${selected ? '▶' : ' '} ${p.name.slice(0, 12).padEnd(12)} ${characterAt(p.cursor).name.padEnd(6)} ${elo}`;
          ui.text(list.x, ry, row.slice(0, Math.floor(list.w)), { color: selected ? THEME.selectText : THEME.text });
        }
      }
    }

    inputField(ui, 2, ui.rows - 5, ui.cols - 4, s.chatBuf, { focus: s.loungeFocus === 'chat', frame: s.frame, placeholder: s.loungeFocus === 'chat' ? 'SAY SOMETHING...' : 'TAB TO TYPE' });
    centerText(ui, ui.rows - 2, s.loungeNotice.slice(0, Math.max(0, ui.cols - 4)), { color: THEME.accent2, bold: true });
    const keyhints: [string, string][] = s.incoming
      ? [['Y/ENTER', 'ACCEPT'], ['N/ESC', 'DECLINE']]
      : s.loungeFocus === 'chat'
        ? [['TYPE', 'CHAT'], ['ENTER', 'SEND'], ['TAB', 'PLAYERS'], ['ESC', 'MENU']]
        : [['↑/↓', 'PLAYER'], ['ENTER', 'CHALLENGE'], ['TAB', 'CHAT'], ['ESC', 'MENU']];
    hints(ui, ui.rows - 1, keyhints);
  },

  onKey(s: Session, k: Key): void {
    if (s.incoming) {
      if (k.t === 'enter' || (k.t === 'char' && k.ch.toLowerCase() === 'y')) s.acceptChallenge();
      else if (k.t === 'esc' || (k.t === 'char' && k.ch.toLowerCase() === 'n')) s.declineChallenge();
      return;
    }
    if (s.outgoing && k.t === 'char' && k.ch.toLowerCase() === 'x') { s.cancelChallenge(); return; }
    if (k.t === 'esc') { s.goTo('menu'); return; }
    if (k.t === 'tab') { s.loungeFocus = s.loungeFocus === 'chat' ? 'players' : 'chat'; s.loungeNotice = s.loungeFocus === 'chat' ? 'TYPE A MESSAGE' : 'SELECT A PLAYER AND PRESS ENTER'; return; }
    if (s.loungeFocus === 'chat') {
      if (k.t === 'backspace') s.chatBuf = s.chatBuf.slice(0, -1);
      else if (k.t === 'enter') s.sendChat();
      else if (k.t === 'char' && s.chatBuf.length < 140) s.chatBuf += k.ch;
      return;
    }
    const n = s.loungeRoster.length;
    if (k.t === 'up') s.loungeCursor = n ? (s.loungeCursor - 1 + n) % n : 0;
    else if (k.t === 'down') s.loungeCursor = n ? (s.loungeCursor + 1) % n : 0;
    else if (k.t === 'enter' || (k.t === 'char' && k.ch.toLowerCase() === 'c')) s.challengeSelected();
  },
};

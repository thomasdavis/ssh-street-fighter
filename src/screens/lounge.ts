import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { box, bigCenter, input, keyHints } from '../ui/tui.js';
import { THEME } from '../ui/theme.js';
import { characterAt } from '../game/roster.js';

// Reads only the session's hub-filled caches (loungeRoster / loungeChat /
// incoming / outgoing) — plain data, so it renders identically whether the
// other players are in this process or on other cluster workers.
function drawMessages(s: Session, f: Frame, x: number, y: number, w: number, h: number): void {
  type Line = { prefix?: string; text: string };
  const lines: Line[] = [];
  for (const message of s.loungeChat) {
    const prefix = `${message.username}> `;
    const firstW = Math.max(1, w - prefix.length);
    lines.push({ prefix, text: message.message.slice(0, firstW) });
    let rest = message.message.slice(firstW);
    while (rest.length) { lines.push({ text: `  ${rest.slice(0, Math.max(1, w - 2))}` }); rest = rest.slice(Math.max(1, w - 2)); }
  }
  const visible = lines.slice(-Math.max(0, h));
  if (!visible.length) {
    f.write(x, y + 1, 'NO MESSAGES YET.', THEME.textDim, THEME.panel);
    f.write(x, y + 2, 'TYPE BELOW AND PRESS ENTER.', THEME.textDim, THEME.panel);
    return;
  }
  for (let i = 0; i < visible.length; i++) {
    const line = visible[i]!;
    if (line.prefix) {
      f.write(x, y + i, line.prefix, THEME.accent, THEME.panel, true);
      f.write(x + line.prefix.length, y + i, line.text, THEME.text, THEME.panel);
    } else f.write(x, y + i, line.text, THEME.textDim, THEME.panel);
  }
}

export const lounge = {
  render(s: Session, f: Frame): void {
    f.gradient(THEME.bgTop, THEME.bgBot);
    bigCenter(f, 1, 'FIGHT LOUNGE', THEME.accent, THEME.bgTop, 1);
    const you = characterAt(s.cursor);
    const ownElo = s.player ? String(s.player.elo) : 'UNRATED';
    f.center(6, `${s.displayName}  ·  ${you.name}  ·  ELO ${ownElo}`, THEME.accent2, THEME.bgTop, true);

    if (s.incoming) {
      f.fill(0, 7, f.cols, 1, THEME.select);
      f.center(7, `${s.incoming.name} CHALLENGED YOU  ·  Y ACCEPT  /  N DECLINE`, THEME.selectText, THEME.select, true);
    } else if (s.outgoing) {
      f.fill(0, 7, f.cols, 1, THEME.select);
      f.center(7, `CHALLENGE SENT TO ${s.outgoing.name}  ·  X CANCEL`, THEME.selectText, THEME.select, true);
    } else {
      f.center(7, '[ESC] MAIN MENU  ·  [TAB] SWITCH CHAT / PLAYERS  ·  /MENU ALSO EXITS', THEME.textDim, THEME.bgTop, true);
    }

    const narrow = f.cols < 76;
    const top = 9, bottom = Math.max(top + 4, f.rows - 8), panelH = bottom - top;
    const roster = s.loungeRoster;
    if (narrow) {
      const names = roster.length ? roster.map((p) => p.name).join(' · ').slice(0, f.cols - 8) : 'NOBODY ELSE ONLINE';
      f.center(8, `ONLINE: ${names}`, roster.length ? THEME.text : THEME.textDim, THEME.bgTop);
      const chat = box(f, 2, top, f.cols - 4, panelH, { title: s.loungeFocus === 'chat' ? 'CHAT · ACTIVE' : 'CHAT', fg: s.loungeFocus === 'chat' ? THEME.accent : THEME.panelBorder });
      drawMessages(s, f, chat.x, chat.y, chat.w, chat.h);
    } else {
      const playersW = 31, chatW = f.cols - playersW - 6;
      const chat = box(f, 2, top, chatW, panelH, { title: s.loungeFocus === 'chat' ? 'CHAT · ACTIVE' : 'CHAT', fg: s.loungeFocus === 'chat' ? THEME.accent : THEME.panelBorder });
      drawMessages(s, f, chat.x, chat.y, chat.w, chat.h);

      const list = box(f, chatW + 3, top, playersW, panelH, { title: s.loungeFocus === 'players' ? 'PLAYERS · ACTIVE' : 'PLAYERS', fg: s.loungeFocus === 'players' ? THEME.accent : THEME.panelBorder });
      if (!roster.length) {
        f.write(list.x, list.y + 1, 'NOBODY ELSE ONLINE', THEME.textDim, THEME.panel);
        f.write(list.x, list.y + 3, 'INVITE A FRIEND TO SSH IN.', THEME.textDim, THEME.panel);
      } else {
        s.loungeCursor = Math.max(0, Math.min(roster.length - 1, s.loungeCursor));
        for (let i = 0; i < roster.length && i < list.h; i++) {
          const p = roster[i]!, selected = s.loungeFocus === 'players' && i === s.loungeCursor;
          const bg = selected ? THEME.select : THEME.panel;
          if (selected) f.fill(list.x - 1, list.y + i, list.w + 2, 1, bg);
          const elo = p.elo ?? '---';
          const row = `${selected ? '▶' : ' '} ${p.name.slice(0, 12).padEnd(12)} ${characterAt(p.cursor).name.padEnd(6)} ${elo}`;
          f.write(list.x, list.y + i, row.slice(0, list.w), selected ? THEME.selectText : THEME.text, bg, selected);
        }
      }
    }

    input(f, 2, f.rows - 6, f.cols - 4, s.chatBuf, { label: s.loungeFocus === 'chat' ? 'MESSAGE · ENTER TO SEND' : 'MESSAGE · TAB TO TYPE', focus: s.loungeFocus === 'chat', frame: s.frame, placeholder: 'say something...' });
    f.center(f.rows - 2, s.loungeNotice.slice(0, Math.max(0, f.cols - 4)), THEME.accent2, THEME.bgBot, true);
    const hints: [string, string][] = s.incoming
      ? [['Y/ENTER', 'ACCEPT'], ['N/ESC', 'DECLINE']]
      : s.loungeFocus === 'chat'
        ? [['TYPE', 'CHAT'], ['ENTER', 'SEND'], ['TAB', 'PLAYERS'], ['ESC', 'MAIN MENU']]
        : [['↑/↓', 'PLAYER'], ['ENTER', 'CHALLENGE'], ['TAB', 'CHAT'], ['ESC', 'MAIN MENU']];
    keyHints(f, f.rows - 1, hints);
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

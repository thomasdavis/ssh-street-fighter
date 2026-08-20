import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import type { Surface, Rect } from '../ui/surface.js';
import type { MouseEvent } from '../net/caps.js';
import { makeSurface } from '../ui/surface.js';
import { hints, inputField, centerText, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import { characterAt } from '../game/roster.js';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Word-wrap a message body: the first line fits `firstW`, the rest `contW`
// (continuation lines are indented under the speaker's name). Over-long words
// are hard-broken so nothing overflows the panel.
function wrapMessage(body: string, firstW: number, contW: number): string[] {
  const words = body.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '', w = Math.max(1, firstW);
  const flush = (): void => { out.push(cur); cur = ''; w = Math.max(1, contW); };
  for (let word of words) {
    while (word.length > w) { if (cur) flush(); out.push(word.slice(0, w)); word = word.slice(w); w = Math.max(1, contW); }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= w) cur += ' ' + word;
    else { flush(); cur = word; }
  }
  out.push(cur);
  return out;
}

// Reads only the session's hub-filled caches (loungeRoster / loungeChat) — plain
// data, so it renders identically whether the peers are in this process or on
// other cluster workers.
function drawMessages(s: Session, ui: Surface, r: Rect): void {
  const x = r.x, iw = Math.max(1, Math.floor(r.w));
  const pitch = 1.2;
  const capacity = Math.max(1, Math.floor(r.h / pitch));
  if (!s.loungeChat.length) {
    ui.text(x, r.y + 0.4, 'NO MESSAGES YET.', { color: THEME.textDim });
    ui.text(x, r.y + 0.4 + pitch, 'TYPE BELOW AND PRESS ENTER.', { color: THEME.textDim });
    return;
  }
  type Line = { prefix?: string; indent: number; text: string };
  const lines: Line[] = [];
  for (const m of s.loungeChat) {
    const prefix = `${m.username}: `;
    const wrapped = wrapMessage(m.message, iw - prefix.length, iw - 2);
    lines.push({ prefix, indent: 0, text: wrapped[0] ?? '' });
    for (let j = 1; j < wrapped.length; j++) lines.push({ indent: 2, text: wrapped[j]! });
  }
  // Scroll: `loungeChatScroll` is display-lines up from the latest (0 = bottom).
  // Clamp against what's actually renderable and write it back so held keys settle.
  const maxScroll = Math.max(0, lines.length - capacity);
  const scroll = clamp(s.loungeChatScroll, 0, maxScroll);
  s.loungeChatScroll = scroll;
  const endIdx = lines.length - scroll;
  const visible = lines.slice(Math.max(0, endIdx - capacity), endIdx);
  for (let i = 0; i < visible.length; i++) {
    const line = visible[i]!, ly = r.y + i * pitch;
    if (line.prefix) {
      ui.text(x, ly, line.prefix, { color: THEME.accent, bold: true });
      ui.text(x + line.prefix.length, ly, line.text, { color: THEME.text });
    } else ui.text(x + line.indent, ly, line.text, { color: THEME.text });
  }
  if (scroll > 0) ui.text(x + iw - 2, r.y + (capacity - 1) * pitch, '↓↓', { color: THEME.accent2, bold: true });   // more (newer) below
}

function drawPlayers(s: Session, ui: Surface, r: Rect, active: boolean): void {
  const roster = s.loungeRoster;
  const x = r.x, iw = Math.floor(r.w);
  if (!roster.length) {
    ui.text(x, r.y + 0.4, 'NOBODY ELSE', { color: THEME.textDim });
    ui.text(x, r.y + 0.4 + SP.line, 'ONLINE YET.', { color: THEME.textDim });
    ui.text(x, r.y + 0.4 + SP.line * 2.4, 'INVITE A FRIEND', { color: THEME.textDim });
    ui.text(x, r.y + 0.4 + SP.line * 3.4, 'TO SSH IN.', { color: THEME.textDim });
    return;
  }
  s.loungeCursor = clamp(s.loungeCursor, 0, roster.length - 1);
  const pitch = SP.row;
  const rows = Math.max(1, Math.floor(r.h / pitch));
  // scroll so the cursor stays on screen when the roster is longer than the box
  const start = roster.length <= rows ? 0 : clamp(s.loungeCursor - Math.floor(rows / 2), 0, roster.length - rows);
  const end = Math.min(roster.length, start + rows);
  // adaptive columns: drop the character column on a narrow panel, ELO if narrower still
  const eloW = 5, showChar = iw >= 26, charW = showChar ? 8 : 0, showElo = iw >= 16;
  const nameW = Math.max(3, iw - 2 - charW - (showElo ? eloW : 0));
  for (let i = start; i < end; i++) {
    const p = roster[i]!, sel = active && i === s.loungeCursor;
    const ry = r.y + 0.3 + (i - start) * pitch;
    if (sel) ui.fill(x - 0.7, ry - 0.3, r.w + 1.4, 1.2, THEME.select);
    let row = `${sel ? '▶' : ' '} ${p.name.slice(0, nameW).padEnd(nameW)}`;
    if (showChar) row += ` ${characterAt(p.cursor).name.slice(0, 7).padEnd(7)}`;
    if (showElo) row += ` ${String(p.elo ?? '---').padStart(4)}`;
    ui.text(x, ry, row.slice(0, iw), { color: sel ? THEME.selectText : THEME.text });
  }
}

export const lounge = {
  render(s: Session, f: Frame): void {
    const ui = makeSurface(f);
    ui.gradient(THEME.bgTop, THEME.bgBot);
    ui.heading(0, 'FIGHT LOUNGE', THEME.accent, 1);

    const you = characterAt(s.cursor);
    const ownElo = s.player ? String(s.player.elo) : 'UNRATED';
    const headH = ui.headingHeight(1);
    centerText(ui, headH, `${s.displayName}  ·  ${you.name}  ·  ELO ${ownElo}`, { color: THEME.accent2 });

    const bannerY = headH + 1;
    if (s.incoming) {
      ui.fill(0, bannerY - 0.15, ui.cols, 1.2, THEME.select);
      centerText(ui, bannerY, `${s.incoming.name} CHALLENGED YOU  ·  Y ACCEPT / N DECLINE`, { color: THEME.selectText });
    } else if (s.outgoing) {
      ui.fill(0, bannerY - 0.15, ui.cols, 1.2, THEME.select);
      centerText(ui, bannerY, `CHALLENGE SENT TO ${s.outgoing.name}  ·  X CANCEL`, { color: THEME.selectText });
    } else {
      const tabTo = s.loungeFocus === 'chat' ? `PLAYERS (${s.loungeRoster.length})` : 'CHAT';
      centerText(ui, bannerY, `[ESC] MAIN MENU  ·  [TAB] ${tabTo}`, { color: THEME.textDim });
    }

    // Panels: chat (left) + players (right) are ALWAYS both shown. Widths adapt to
    // the terminal so the players box never disappears as the player zooms — the
    // player column just compacts (drops char, then ELO) on narrow terminals.
    const M = 2;
    const top = Math.ceil(bannerY + 2);
    const inputY = ui.rows - 5;
    const panelH = Math.max(5, inputY - 1 - top);
    const fullW = ui.cols - 2 * M;
    const focusChat = s.loungeFocus === 'chat';
    const playersW = clamp(Math.round(ui.cols * 0.32), 20, 30);
    const gap = 2;
    const chatW = Math.max(12, fullW - playersW - gap);

    const chat = ui.panel(M, top, chatW, panelH, {
      title: focusChat ? 'CHAT · ACTIVE' : 'CHAT',
      border: focusChat ? THEME.accent : THEME.panelBorder,
    });
    drawMessages(s, ui, chat);

    const list = ui.panel(M + chatW + gap, top, playersW, panelH, {
      title: focusChat ? `PLAYERS (${s.loungeRoster.length})` : 'PLAYERS · ACTIVE',
      border: focusChat ? THEME.panelBorder : THEME.accent,
    });
    drawPlayers(s, ui, list, !focusChat);

    inputField(ui, M, inputY, fullW, s.chatBuf, {
      focus: focusChat, frame: s.frame,
      placeholder: focusChat ? 'SAY SOMETHING...' : 'TAB TO CHAT',
    });
    centerText(ui, ui.rows - 2, s.loungeNotice.slice(0, Math.max(0, ui.cols - 4)), { color: THEME.accent2, bold: true });
    const keyhints: [string, string][] = s.incoming
      ? [['Y', 'ACCEPT'], ['N', 'DECLINE']]
      : focusChat
        ? [['↑↓', 'SCROLL'], ['ENTER', 'SEND'], ['TAB', 'PLAYERS'], ['ESC', 'MENU']]
        : [['↑↓', 'PICK'], ['ENTER', 'FIGHT'], ['TAB', 'CHAT'], ['ESC', 'MENU']];
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
    if (k.t === 'tab') {
      s.loungeFocus = s.loungeFocus === 'chat' ? 'players' : 'chat';
      if (s.loungeFocus === 'chat') s.loungeChatScroll = 0;   // land on the latest messages
      s.loungeNotice = s.loungeFocus === 'chat' ? 'TYPE A MESSAGE' : 'SELECT A PLAYER AND PRESS ENTER';
      return;
    }
    if (s.loungeFocus === 'chat') {
      if (k.t === 'up') s.loungeChatScroll++;                         // scroll into history
      else if (k.t === 'down') s.loungeChatScroll = Math.max(0, s.loungeChatScroll - 1);
      else if (k.t === 'backspace') s.chatBuf = s.chatBuf.slice(0, -1);
      else if (k.t === 'enter') s.sendChat();
      else if (k.t === 'char' && s.chatBuf.length < 140) s.chatBuf += k.ch;
      return;
    }
    const n = s.loungeRoster.length;
    if (k.t === 'up') s.loungeCursor = n ? (s.loungeCursor - 1 + n) % n : 0;
    else if (k.t === 'down') s.loungeCursor = n ? (s.loungeCursor + 1) % n : 0;
    else if (k.t === 'enter' || (k.t === 'char' && k.ch.toLowerCase() === 'c')) s.challengeSelected();
  },

  // Wheel scrolls the chat log (up = into history).
  onMouse(s: Session, e: MouseEvent): void {
    if (e.kind !== 'wheel') return;
    if (e.wheel < 0) s.loungeChatScroll++;
    else s.loungeChatScroll = Math.max(0, s.loungeChatScroll - 1);
  },
};

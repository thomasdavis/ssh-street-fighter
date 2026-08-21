// Rasterize a Frame's text cells to a PNG so we can eyeball the crisp HUD.
// Renders each cell with a real glyph (3x5 font for ASCII, line-art for box/block chars).
process.env.SF_DB = ':memory:';
import { writeFileSync } from 'fs';
import sharp from 'sharp';
import { FONT3X5 } from './render/font.js';
import { snap256 } from './render/pixel.js';
const COLOR256 = process.env.SF_COLOR === '256';

const db = await import('./db/db.js');
db.initDb();
const seed = (fp: string, name: string, w: number, l: number) => {
  db.touchOrCreate(fp); db.setUsername(fp, name);
  for (let i = 0; i < w; i++) db.recordMatch(fp, null, name, 'x', 'BYU', 'MEN', 2);
  for (let i = 0; i < l; i++) db.recordMatch(null, fp, 'x', name, 'BYU', 'MEN', 2);
};
seed('fp:ada', 'ADA', 12, 3); seed('fp:tom', 'THOMAS', 7, 5); seed('fp:kai', 'KAI', 4, 9);
db.recordMatch('fp:ada', 'fp:tom', 'ADA', 'THOMAS', 'CHONG', 'MEN', 2);
db.recordMatch('fp:ada', 'fp:kai', 'ADA', 'KAI', 'CHONG', 'BLANKO', 2);
db.addChatMessage('ADA', 'Anyone brave enough for first to two?');
db.addChatMessage('KAI', 'I am in. Monsoon stage. No excuses.');
db.addChatMessage('THOMAS', 'Winner stays on.');

const { Frame } = await import('./render/frame.js');
const { SCREENS } = await import('./screens/index.js');
const { DEFAULT_KEY_BINDINGS } = await import('./input/bindings.js');

function fake(o: Record<string, unknown>): any {
  return { frame: 6, displayName: 'THOMAS', usernameBuf: 'THOM', errorMsg: '', guest: false,
    player: db.getByFingerprint('fp:tom'), fp: 'fp:tom', menuIndex: 0, cursor: 2,
    keyBindings: DEFAULT_KEY_BINDINGS, controlsCursor: 5, bindingCapture: null, controlsNotice: 'PUNCH SET TO J',
    selectMode: 'lobby', quickOpponentPool: 'bots', leaderScope: 'humans', leader: db.leaderboard(10, 'humans'), result: null,
    loungeFocus: 'players', loungeCursor: 0, loungeChatScroll: 0, chatBuf: 'run it back?', loungeNotice: 'SELECT A PLAYER AND PRESS ENTER',
    incoming: null, outgoing: null,
    loungeRoster: [
      { id: '1', name: 'ADA', cursor: 3, elo: 1240, isBot: false },
      { id: '2', name: 'KAI', cursor: 2, elo: 1190, isBot: false },
      { id: '3', name: 'RIVAL_7', cursor: 6, elo: null, isBot: true },
      { id: '4', name: 'NOVA_STORM', cursor: 10, elo: 1305, isBot: false },
    ],
    loungeChat: [
      { username: 'ADA', message: 'gg, that was close — run it back?' },
      { username: 'KAI', message: 'i am in. monsoon stage, no excuses.' },
      { username: 'THOMAS', message: 'winner stays on.' },
    ],
    ...o };
}

const which = process.argv[2] ?? 'menu';
const cols = parseInt(process.argv[3] ?? '96', 10), rows = parseInt(process.argv[4] ?? '30', 10);
const f: any = new Frame(cols, rows, (process.env.SF_MODE as any) || 'octant');
const s = fake(which === 'results' ? { result: { winner: 'THOMAS', loser: 'ADA', winnerIsBot: false, loserIsBot: false, youWon: true } } : {});
if (which === 'fight' || which === 'fight-help') {
  const eng = await import('./game/engine.js');
  const scn = await import('./game/scene.js');
  const { drawFightHud } = await import('./screens/fight-hud.js');
  const a = eng.makeFighter('a', process.env.SF_FIGHTER ?? 'BYU', 'a');
  const b = eng.makeFighter('b', process.env.SF_OPPONENT ?? 'MEN', 'b');
  const m = eng.makeMatch(a, b); m.phase = 'fight'; m.message = ''; m.roundTime = 47; if(process.env.SF_STAGE) m.stage = process.env.SF_STAGE;
  a.hp = 72; b.hp = 38; a.wins = 1;
  const previewAttack = (process.env.SF_ATTACK ?? 'kick') as typeof a.attack;
  a.attack = previewAttack;
  a.attackFrame = parseInt(process.env.SF_ATTACK_FRAME ?? String(previewAttack === 'kick' ? eng.ATTACKS.kick.startup + 1 : 8), 10);
  a.pose = previewAttack === 'none' ? 'idle' : previewAttack as typeof a.pose;
  a.facing = 1;
  if (previewAttack === 'rolling') { a.y = 16; a.vx = 5.2; }
  if (previewAttack === 'verticalroll') { a.y = 36; a.vy = 7; }
  b.x = a.x + 40; b.facing = -1; b.blocking = true; b.pose = 'block';
  f.usePixel(scn.composeScene(m, cols * 2, rows * 4, false));
  drawFightHud(f, m, false);
  if (which === 'fight-help') SCREENS.help.render({ ...s, screen: 'fight', match: m, role: 'a' } as any, f);
} else if (which === 'help') { SCREENS.menu.render(s, f); SCREENS.help.render(s, f); }
else (SCREENS as any)[which].render(s, f);

// access internal cells via toRows is ANSI; instead re-read the text layer through a shim:
const cells: any[] = (f as any).text;
const pix: any = (f as any)._pixel;
const CW = 8, CH = 12;
const W = cols * CW, H = rows * CH;
const img = Buffer.alloc(W * H * 3);
const put = (x: number, y: number, c: any) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; img[i] = c.r; img[i + 1] = c.g; img[i + 2] = c.b; };
const rect = (x0: number, y0: number, w: number, h: number, c: any) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, c); };

function glyph(ch: string, ox: number, oy: number, fg: any): void {
  const midX = ox + 3, midY = oy + 6;
  const hLine = (yy: number) => rect(ox, yy, CW, 1, fg);
  const vLine = (xx: number) => rect(xx, oy, 1, CH, fg);
  switch (ch) {
    case ' ': return;
    case '█': rect(ox, oy, CW, CH, fg); return;
    case '░': for (let y = oy; y < oy + CH; y += 2) for (let x = ox; x < ox + CW; x += 2) put(x, y, fg); return;
    case '▏': rect(ox, oy, 1, CH, fg); return;
    case '─': hLine(midY); return;
    case '│': vLine(midX); return;
    case '┌': case '╭': hLine(midY); rect(midX, midY, 1, CH - (midY - oy), fg); rect(midX, midY, CW - (midX - ox), 1, fg); return;
    case '┐': case '╮': rect(ox, midY, midX - ox + 1, 1, fg); rect(midX, midY, 1, CH - (midY - oy), fg); return;
    case '└': case '╰': rect(midX, oy, 1, midY - oy + 1, fg); rect(midX, midY, CW - (midX - ox), 1, fg); return;
    case '┘': case '╯': rect(midX, oy, 1, midY - oy + 1, fg); rect(ox, midY, midX - ox + 1, 1, fg); return;
    case '═': hLine(midY - 1); hLine(midY + 1); return;
    case '║': vLine(midX - 1); vLine(midX + 1); return;
    case '╔': hLine(midY + 1); rect(ox, midY - 1, midX - ox, 1, fg); vLine(midX - 1); rect(midX + 1, midY - 1, 1, CH, fg); return;
    case '╗': hLine(midY + 1); rect(midX + 2, midY - 1, CW, 1, fg); vLine(midX + 1); rect(midX - 1, midY - 1, 1, CH, fg); return;
    case '╚': rect(ox, midY + 1, CW, 1, fg); rect(midX - 1, oy, 1, midY, fg); rect(midX + 1, oy, 1, midY - 1, fg); rect(midX + 1, midY - 1, CW, 1, fg); return;
    case '╝': rect(ox, midY + 1, CW, 1, fg); rect(midX + 1, oy, 1, midY, fg); rect(midX - 1, oy, 1, midY - 1, fg); rect(ox, midY - 1, midX, 1, fg); return;
    case '▶': for (let y = 0; y < 7; y++) rect(ox + 1, oy + 3 + y, Math.max(0, 4 - Math.abs(3 - y)), 1, fg); return;
    case '▲': for (let y = 0; y < 5; y++) rect(midX - y, oy + 3 + y, 2 * y + 1, 1, fg); return;
    case '◆': for (let y = 0; y < 7; y++) { const w = 3 - Math.abs(3 - y); rect(midX - w, oy + 3 + y, 2 * w + 1, 1, fg); } return;
    default: break;
  }
  const g = FONT3X5[ch.toUpperCase()];
  if (!g) return;
  const sc = 2; const gx = ox + 1, gy = oy + 2;
  for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 3; xx++) if (g[yy]![xx] === '#') rect(gx + xx * sc, gy + yy * sc, sc, sc, fg);
}

for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
  const cell = cells[cy * cols + cx];
  if (cell) {
    rect(cx * CW, cy * CH, CW, CH, cell.bg);
    if (cell.ch !== ' ') glyph(cell.ch, cx * CW, cy * CH, cell.fg);
  } else if (pix) {
    // composite the pixel layer: this cell = 2x4 sub-pixels upscaled
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
      const p0 = pix[cy * 4 + dy]?.[cx * 2 + dx] ?? { r: 0, g: 0, b: 0 };
      const p = COLOR256 ? snap256(p0) : p0;
      rect(cx * CW + dx * (CW / 2), cy * CH + dy * (CH / 4), CW / 2, CH / 4, p);
    }
  } else {
    rect(cx * CW, cy * CH, CW, CH, { r: 10, g: 9, b: 18 });
  }
}

const header = Buffer.from(`P6\n${W} ${H}\n255\n`, 'ascii');
const outputName = process.env.SF_OUT ?? which;
const ppmPath = `/tmp/sf-${outputName}.ppm`;
const pngPath = `/tmp/sf-${outputName}.png`;
writeFileSync(ppmPath, Buffer.concat([header, img]));
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(pngPath);
console.log(`wrote ${pngPath} ${W}x${H}`);

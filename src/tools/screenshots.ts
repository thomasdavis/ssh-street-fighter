// Regenerate the README screenshots from a REAL game session: boots the SSH
// server in-process (fresh temp DB), drives one client through the screens,
// reconstructs each captured ANSI frame with a tiny terminal emulator, and
// rasterizes cells to PNG — octant glyphs decode to their exact 2x4 pixel
// patterns via OCTANT_CHARS, text cells draw with the game's own 3x5 font.
//   tsx src/tools/screenshots.ts        -> docs/screenshots/*.png
process.env.SF_DB = '/tmp/sf-screenshot.db';
process.env.SF_DEBUG = '0';
import ssh2 from 'ssh2';
import { execFileSync } from 'child_process';
import { mkdtempSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OCTANT_CHARS } from '../octant/octant-chars.js';
import { FONT3X5 } from '../render/font.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../../docs/screenshots');
const COLS = 224, ROWS = 62;          // 8x12 px cells -> 1792x744; roomy above the 144x50 minimum
const CELL_W = 8, CELL_H = 12;
const PORT = 22997;

try { unlinkSync(process.env.SF_DB!); } catch { /* fresh */ }
const { startServer } = await import('../net/ssh-server.js');
const server = startServer(PORT, '127.0.0.1', 'keys/host.key');

// ---- tiny terminal emulator (diff-verify's applyAnsi, astral-safe) ----
type TC = { ch: string; fg: [number, number, number]; bg: [number, number, number] };
const blank = (): TC => ({ ch: ' ', fg: [0, 0, 0], bg: [0, 0, 0] });
const grid: TC[] = new Array(COLS * ROWS).fill(0).map(blank);
let cx = 0, cy = 0;
let fg: [number, number, number] = [200, 200, 200], bg: [number, number, number] = [0, 0, 0];

let carry = '';   // escape sequence split across SSH data chunks
function applyAnsi(chunk: string): void {
  const ansi = carry + chunk;
  carry = '';
  const cps = [...ansi];
  let i = 0;
  while (i < cps.length) {
    const ch = cps[i]!;
    if (ch === '\x1b' && i === cps.length - 1) { carry = '\x1b'; return; }
    if (ch === '\x1b' && cps[i + 1] === '[') {
      let j = i + 2, params = '';
      while (j < cps.length && !/[A-Za-z]/.test(cps[j]!)) { params += cps[j]; j++; }
      if (j >= cps.length) { carry = cps.slice(i).join(''); return; }
      const fin = cps[j] ?? '';
      const ps = params.split(';');
      if (fin === 'H' || fin === 'f') { cy = (parseInt(ps[0] || '1', 10) || 1) - 1; cx = (parseInt(ps[1] || '1', 10) || 1) - 1; }
      else if (fin === 'A') { cy -= parseInt(ps[0] || '1', 10) || 1; }
      else if (fin === 'B') { cy += parseInt(ps[0] || '1', 10) || 1; }
      else if (fin === 'C') { cx += parseInt(ps[0] || '1', 10) || 1; }
      else if (fin === 'D') { cx -= parseInt(ps[0] || '1', 10) || 1; }
      else if (fin === 'G') { cx = (parseInt(ps[0] || '1', 10) || 1) - 1; }
      else if (fin === 'd') { cy = (parseInt(ps[0] || '1', 10) || 1) - 1; }
      else if (fin === 'J') { for (let k = 0; k < grid.length; k++) grid[k] = blank(); }
      else if (fin === 'K') { for (let x = cx; x < COLS; x++) grid[cy * COLS + x] = { ch: ' ', fg: [...fg], bg: [...bg] }; }
      else if (fin === 'm') {
        let k = 0;
        while (k < ps.length) {
          const p = ps[k];
          if (p === '0' || p === '') { fg = [200, 200, 200]; bg = [0, 0, 0]; k++; }
          else if (p === '38' && ps[k + 1] === '2') { fg = [+ps[k + 2]!, +ps[k + 3]!, +ps[k + 4]!]; k += 5; }
          else if (p === '48' && ps[k + 1] === '2') { bg = [+ps[k + 2]!, +ps[k + 3]!, +ps[k + 4]!]; k += 5; }
          else k++;
        }
      }
      i = j + 1; continue;
    }
    if (ch === '\r') { cx = 0; i++; continue; }
    if (ch === '\n') { cy = Math.min(ROWS - 1, cy + 1); i++; continue; }
    if (ch === '\x1b') { i++; continue; } // lone escape (e.g. ?7l handled by [-branch)
    if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) grid[cy * COLS + cx] = { ch, fg: [...fg], bg: [...bg] };
    cx++; i++;
  }
}

// ---- rasterizer ----
const OCTANT_PATTERN = new Map<string, number>();
for (let p = 0; p < OCTANT_CHARS.length; p++) {
  const g = OCTANT_CHARS[p]!;
  if (!OCTANT_PATTERN.has(g)) OCTANT_PATTERN.set(g, p);
}

function rasterize(name: string): void {
  const W = COLS * CELL_W, H = ROWS * CELL_H;
  const px = Buffer.alloc(W * H * 3);
  const put = (x: number, y: number, c: [number, number, number]) => {
    const o = (y * W + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = grid[r * COLS + c]!;
    const x0 = c * CELL_W, y0 = r * CELL_H;
    for (let y = 0; y < CELL_H; y++) for (let x = 0; x < CELL_W; x++) put(x0 + x, y0 + y, cell.bg);
    const pat = OCTANT_PATTERN.get(cell.ch);
    if (pat !== undefined) {
      // 2x4 sub-pixels, each CELL_W/2 x CELL_H/4 px
      for (let sr = 0; sr < 4; sr++) for (let sc = 0; sc < 2; sc++) {
        if (!(pat & (1 << (sr * 2 + sc)))) continue;
        for (let y = 0; y < CELL_H / 4; y++) for (let x = 0; x < CELL_W / 2; x++)
          put(x0 + sc * (CELL_W / 2) + x, y0 + sr * (CELL_H / 4) + y, cell.fg);
      }
    } else if (cell.ch !== ' ') {
      const rows5 = FONT3X5[cell.ch.toUpperCase()];
      if (rows5) {
        // 3x5 glyph at 2x scale (6x10), centered in the 8x12 cell
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
          if (rows5[gy]![gx] !== '#') continue;
          for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++)
            put(x0 + 1 + gx * 2 + x, y0 + 1 + gy * 2 + y, cell.fg);
        }
      } else {
        for (let y = 3; y < CELL_H - 3; y++) for (let x = 2; x < CELL_W - 2; x++)
          put(x0 + x, y0 + y, cell.fg);
      }
    }
  }
  const tmp = join(mkdtempSync(join(tmpdir(), 'sfshot-')), `${name}.ppm`);
  writeFileSync(tmp, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), px]));
  execFileSync('convert', [tmp, join(OUT_DIR, `${name}.png`)]);
  console.log(`wrote docs/screenshots/${name}.png (${W}x${H})`);
}

// ---- drive real sessions: ONE FRESH CONNECTION PER SCREENSHOT ----
// A fresh first-run session lands on the menu at index 0 every time, so each
// capture navigates deterministically; waits scan only NEW transcript bytes.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Drive {
  stream: any; conn: ssh2.Client;
  waitFor(marker: string, timeout?: number): Promise<boolean>;
}
let shotN = 0;
async function connectSession(feedEmulator = true): Promise<Drive> {
  if (feedEmulator) { for (let k = 0; k < grid.length; k++) grid[k] = blank(); carry = ''; }
  let transcript = '';
  const conn = new ssh2.Client();
  const stream = await new Promise<any>((res, rej) => {
    conn.on('ready', () => conn.shell({ term: 'xterm-256color', cols: COLS, rows: ROWS }, (e, s) => {
      if (e) return rej(e);
      s.on('data', (d: Buffer) => { const t = d.toString('utf8'); transcript += t; if (feedEmulator) applyAnsi(t); });
      res(s);
    }));
    conn.on('error', rej);
    conn.connect({ host: '127.0.0.1', port: PORT, username: `shots${shotN}`, password: 'x', hostVerifier: () => true });
  });
  const waitFor = async (marker: string, timeout = 6000): Promise<boolean> => {
    const from = transcript.length;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (transcript.slice(from).includes(marker)) return true; await sleep(50); }
    return transcript.slice(from).includes(marker);
  };
  await sleep(400);
  stream.write('\r'); await sleep(400);                 // accept first-run calibration
  stream.write(`SHOT${shotN++}\r`);                     // fresh handle -> menu, index 0
  await waitFor('MAIN MENU'); await sleep(500);
  return { stream, conn, waitFor };
}

// Force a full recompose+redraw at the target size (diff renderers repaint
// everything after a resize), so captures never inherit stale diff cells.
async function settle(s: Drive): Promise<void> {
  s.stream.setWindow(ROWS, COLS - 1, 0, 0); await sleep(350);
  s.stream.setWindow(ROWS, COLS, 0, 0); await sleep(900);
}

{ // menu
  const s = await connectSession();
  await settle(s);
  rasterize('menu');
  s.conn.end();
}
{ // fighter select (PRACTICE = item 3: s,s,enter)
  const s = await connectSession();
  s.stream.write('s'); await sleep(150); s.stream.write('s'); await sleep(150); s.stream.write('\r');
  await s.waitFor('PICK A FIGHTER', 5000); await sleep(500);
  await settle(s);
  rasterize('fighter-select');
  s.conn.end();
}
{ // gameplay (practice fight; punch=w, kick=e, arrows move)
  const s = await connectSession();
  s.stream.write('s'); await sleep(150); s.stream.write('s'); await sleep(150); s.stream.write('\r');
  await s.waitFor('PICK A FIGHTER', 5000); await sleep(300);
  s.stream.write('\r'); await sleep(2500);
  for (let i = 0; i < 8; i++) {
    s.stream.write('\x1b[C'); await sleep(120);
    s.stream.write(i % 2 ? 'e' : 'w'); await sleep(260);
  }
  await sleep(300);
  await settle(s);
  rasterize('gameplay');
  s.conn.end();
}
{ // lounge (item 2: s,enter) — seed chat with a second live session first
  const b = await connectSession(false);
  b.stream.write('s'); await sleep(150); b.stream.write('\r');
  await b.waitFor('/MENU ALSO EXITS', 5000); await sleep(300);
  b.stream.write('my hurricane kick is unstoppable'); await sleep(400); b.stream.write('\r'); await sleep(1200);
  const s = await connectSession();
  s.stream.write('s'); await sleep(150); s.stream.write('\r');
  await s.waitFor('/MENU ALSO EXITS', 5000); await sleep(300);
  s.stream.write('bold words for someone in a terminal'); await sleep(300); s.stream.write('\r'); await sleep(900);
  await settle(s);
  rasterize('lounge');
  s.conn.end(); b.conn.end();
}
{ // leaderboard (item 4: s,s,s,enter)
  const s = await connectSession();
  s.stream.write('s'); await sleep(150); s.stream.write('s'); await sleep(150); s.stream.write('s'); await sleep(150); s.stream.write('\r');
  await sleep(900);
  await settle(s);
  rasterize('leaderboard');
  s.conn.end();
}

server?.close?.();
console.log('SCREENSHOTS_DONE');
process.exit(0);

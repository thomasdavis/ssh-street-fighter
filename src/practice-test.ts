// Verify PRACTICE mode: one client, no opponent, should get live fight frames.
process.env.SF_DB = '/tmp/sf-prac.db';
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';
const externalPort = parseInt(process.env.SF_TEST_PORT ?? '0', 10);
const PORT = externalPort || 22998;
const testFighter = (process.env.SF_TEST_FIGHTER ?? 'BYU').toUpperCase();
const testCols = parseInt(process.env.SF_TEST_COLS ?? '120', 10);
const testRows = parseInt(process.env.SF_TEST_ROWS ?? '42', 10);
const hudOnly = process.env.SF_TEST_HUD_ONLY === '1';
const { ROSTER } = await import('./game/roster.js');
const { specialMovesFor } = await import('./game/moves.js');
const fighterIndex = ROSTER.findIndex((c) => c.name === testFighter);
if (fighterIndex < 0) throw new Error(`unknown SF_TEST_FIGHTER ${testFighter}`);
let localServer: import('net').Server | null = null;
if (!externalPort) {
  try { unlinkSync('/tmp/sf-prac.db'); } catch { /* */ }
  const { startServer } = await import('./net/ssh-server.js');
  localServer = startServer(PORT, '127.0.0.1', 'keys/host.key');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (check()) return true; await sleep(50); }
  return check();
}

const conn = new ssh2.Client();
let bytes = 0; let transcript = ''; let stream: any;
let markShellReady!: () => void;
const shellReady = new Promise<void>((resolve) => { markShellReady = resolve; });
conn.on('ready', () => conn.shell({ term: 'xterm', cols: testCols, rows: testRows }, (_e, s) => {
  stream = s; s.on('data', (d: Buffer) => { bytes += d.length; transcript += d.toString('utf8'); }); markShellReady();
}));
conn.connect({ host: '127.0.0.1', port: PORT, username: 'solo', password: 'x', hostVerifier: () => true });

await shellReady;
await sleep(externalPort ? 150 : 500);
const testName = externalPort ? `MV${Date.now().toString().slice(-6)}` : 'SOLO';
for (const ch of testName) { stream.write(ch); await sleep(30); }
stream.write('\r'); await sleep(150);   // username -> menu
stream.write('ss'); await sleep(120);   // menu: move to PRACTICE (index 2)
stream.write('\r'); await sleep(150);   // -> character select (practice)
for (let i = 0; i < fighterIndex; i++) { stream.write('\x1b[C'); await sleep(70); }
const fightStart = transcript.length;
stream.write('\r');                     // pick fighter -> practice fight
const dummyName = ROSTER[(fighterIndex + 1) % ROSTER.length]!.name;
const fightReady = await waitFor(() => {
  const output = transcript.slice(fightStart);
  return output.includes('TRAIN') && output.includes(testFighter) && output.includes(dummyName);
}, 5000);
const expectedMoveNames = specialMovesFor(testFighter).map((move) => move.name);
const helpStart = transcript.length;
const readHelpMarkers = () => {
  const output = transcript.slice(helpStart);
  return {
    fighter: output.includes(`${testFighter} MOVES`),
    moves: expectedMoveNames.every((name) => output.includes(name)),
  };
};
if (!hudOnly) stream.write('?');         // in-fight, character-aware move list
const moveHelp = hudOnly || await waitFor(() => Object.values(readHelpMarkers()).every(Boolean), 3000);
const helpMarkers = readHelpMarkers();
if (!hudOnly) { stream.write('?'); await sleep(100); } // close without becoming a fight input
const before = bytes;
// throw some moves at the dummy
for (let i = 0; i < 25; i++) { stream.write(i % 2 ? '\x1b[C' : 'w'); await sleep(80); }
const during = bytes - before;
conn.end();
const truecolor = transcript.includes('\x1b[38;2;') || transcript.includes('\x1b[48;2;');
const ok = during > 8000 && fightReady && moveHelp && truecolor;
console.log(`practice frames streamed: ${during} bytes`);
console.log(`responsive fight HUD rendered: ${fightReady}`);
console.log(`character move help rendered: ${hudOnly ? 'skipped (HUD-only matrix)' : moveHelp}`);
console.log(`truecolor ANSI rendered: ${truecolor}`);
if (!moveHelp) console.log(`move help markers: ${JSON.stringify(helpMarkers)}`);
console.log(ok ? 'PRACTICE TEST: PASS' : 'PRACTICE TEST: FAIL');
if (localServer) await new Promise<void>((resolve) => localServer!.close(() => resolve()));
await sleep(100);
process.exit(ok ? 0 : 1);

// Two-client E2E for the live lounge: persistent chat, player selection,
// challenge delivery/acceptance, then direct transition into a streamed fight.
// Set SF_TEST_PORT to exercise an already-running server instead of booting one.
const externalPort = parseInt(process.env.SF_TEST_PORT ?? '0', 10);
if (!externalPort) {
  process.env.SF_DB = '/tmp/sf-social-test.db';
  process.env.SF_UI = 'cell';
}
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';

if (!externalPort) try { unlinkSync(process.env.SF_DB!); } catch { /* fresh */ }
const PORT = externalPort || 22997;
let server: import('net').Server | null = null;
if (!externalPort) {
  const { startServer } = await import('./net/ssh-server.js');
  server = startServer(PORT, '127.0.0.1', 'keys/host.key');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Client { conn: ssh2.Client; stream: any; transcript: string; bytes: number }
async function connect(handle: string): Promise<Client> {
  const client = await new Promise<Client>((resolve, reject) => {
    const conn = new ssh2.Client();
    conn.on('ready', () => conn.shell({ term: 'xterm', cols: 120, rows: 42 }, (error, stream) => {
      if (error) return reject(error);
      const c: Client = { conn, stream, transcript: '', bytes: 0 };
      stream.on('data', (data: Buffer) => { c.transcript += data.toString('utf8'); c.bytes += data.length; });
      resolve(c);
    }));
    conn.on('error', reject);
    conn.connect({ host: '127.0.0.1', port: PORT, username: handle, password: 'x', hostVerifier: () => true });
  });
  await sleep(250);
  client.stream.write('\r');   // pass the first-run calibration screen
  await sleep(220);
  client.stream.write(handle);
  client.stream.write('\r');   // confirm handle -> main menu
  await sleep(250);
  client.stream.write('s');    // menu: down to FIGHT LOUNGE
  client.stream.write('\r');   // enter the lounge
  return client;
}

async function waitFor(check: () => boolean, timeout = 5000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return true; await sleep(50); }
  return check();
}

const runId = externalPort ? Date.now().toString().slice(-6) : '';
const alphaName = externalPort ? `LVA${runId}` : 'ALPHA';
const bravoName = externalPort ? `LVB${runId}` : 'BRAVO';
const alpha = await connect(alphaName);
const bravo = await connect(bravoName);
// The lounge heading is drawn as block-pixel art, so its words are not present
// in the terminal byte stream. Assert against the real interactive chat label
// instead of accidentally matching the main-menu item with the same name.
const loungeReady = await waitFor(() => alpha.transcript.includes('CHAT · ACTIVE') && bravo.transcript.includes('CHAT · ACTIVE'));
const playerVisible = await waitFor(() => alpha.transcript.includes(bravoName));

const chatText = externalPort ? `live challenge ${runId}` : 'hello from alpha';
alpha.stream.write(chatText); alpha.stream.write('\r');
const chatDelivered = await waitFor(() => bravo.transcript.includes(chatText));

alpha.stream.write('\t'); await sleep(100); // players focus
alpha.stream.write('\r');
const challengeDelivered = await waitFor(() => bravo.transcript.includes(`${alphaName} CHALLENGED YOU`));
alpha.stream.write('x');
const challengeCancelled = await waitFor(() => bravo.transcript.includes(`${alphaName} CANCELLED THE CHALLENGE`));
alpha.stream.write('\r');
await sleep(200);
bravo.stream.write('y');
await sleep(700);
const before = alpha.bytes;
for (let i = 0; i < 18; i++) { alpha.stream.write(i % 2 ? 'w' : '\x1b[C'); bravo.stream.write(i % 3 ? 'e' : '\x1b[D'); await sleep(70); }
const fightStreamed = alpha.bytes - before > 8000;

const db = await import('./db/db.js');
if (externalPort) db.initDb();
const persisted = db.chatHistory(10).some((m) => m.username === alphaName && m.message === chatText);
alpha.conn.end(); bravo.conn.end();

const checks = { loungeReady, playerVisible, chatDelivered, challengeDelivered, challengeCancelled, fightStreamed, persisted };
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const ok = Object.values(checks).every(Boolean);
console.log(ok ? 'SOCIAL TEST: PASS' : 'SOCIAL TEST: FAIL');
if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
await sleep(100);
process.exit(ok ? 0 : 1);

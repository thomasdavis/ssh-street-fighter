const externalPort = parseInt(process.env.SF_TEST_PORT ?? '0', 10);
if (!externalPort) process.env.SF_DB = '/tmp/sf-controls-test.db';
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';

if (!externalPort) try { unlinkSync(process.env.SF_DB!); } catch { /* fresh */ }
const PORT = externalPort || 22994;
let server: import('net').Server | null = null;
if (!externalPort) {
  const { startServer } = await import('./net/ssh-server.js');
  server = startServer(PORT, '127.0.0.1', 'keys/host.key');
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check: () => boolean, timeout = 5000): Promise<boolean> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (check()) return true; await sleep(40); }
  return check();
};

let transcript = '';
const conn = new ssh2.Client();
const stream = await new Promise<any>((resolve, reject) => {
  conn.on('ready', () => conn.shell({ term: 'xterm', cols: 112, rows: 36 }, (error, shell) => {
    if (error) return reject(error);
    shell.on('data', (data: Buffer) => { transcript += data.toString('utf8'); });
    resolve(shell);
  }));
  conn.on('error', reject);
  conn.connect({ host: '127.0.0.1', port: PORT, username: 'controls', password: 'x', hostVerifier: () => true });
});

await sleep(250);
stream.write(`${externalPort ? `KEY${Date.now().toString().slice(-6)}` : 'KEYTEST'}\r`);
const menuReady = await waitFor(() => transcript.includes('MAIN MENU'));
await sleep(160);
stream.write('ssss\r');
const controlsOpened = await waitFor(() => transcript.includes('YOUR KEY BINDINGS'));

await sleep(160);
stream.write('sssss\r'); // PUNCH row, then capture
await sleep(100);
const duplicateStart = transcript.length;
stream.write('e');
const duplicateRejected = await waitFor(() => transcript.slice(duplicateStart).includes('ALREADY USED BY KICK'));
const reservedStart = transcript.length;
stream.write('q');
const reservedRejected = await waitFor(() => transcript.slice(reservedStart).includes('Q IS RESERVED FOR LEAVING A FIGHT'));
const assignedStart = transcript.length;
stream.write('j');
const punchAssigned = await waitFor(() => transcript.slice(assignedStart).includes('PUNCH SET TO J'));

stream.write('\x1b');
const backStart = transcript.length;
const returnedToMenu = await waitFor(() => transcript.slice(backStart).includes('MAIN MENU'));
await sleep(160);
stream.write('ss\r');
await sleep(160);
const fightStart = transcript.length;
stream.write('\r');
const practiceStarted = await waitFor(() => transcript.slice(fightStart).includes('TRAIN'));
const helpStart = transcript.length;
stream.write('?');
const moveCardUsesCustomKey = await waitFor(() => {
  const view = transcript.slice(helpStart);
  return view.includes('BYU MOVES') && view.includes('+ J');
});

conn.end();
const checks = { menuReady, controlsOpened, duplicateRejected, reservedRejected, punchAssigned, returnedToMenu, practiceStarted, moveCardUsesCustomKey };
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
const ok = Object.values(checks).every(Boolean);
console.log(ok ? 'CONTROLS TEST: PASS' : 'CONTROLS TEST: FAIL');
if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
await sleep(100);
process.exit(ok ? 0 : 1);

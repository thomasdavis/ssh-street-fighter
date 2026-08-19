// Regression for SSH terminals that submit Enter as CRLF: confirming a handle
// must stop at the main menu, never bleed through into the lounge. Also proves
// both advertised lounge exits over a real SSH session.
const externalPort = parseInt(process.env.SF_TEST_PORT ?? '0', 10);
if (!externalPort) {
  process.env.SF_DB = '/tmp/sf-navigation-test.db';
  process.env.SF_UI = 'cell';
}
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';

if (!externalPort) try { unlinkSync(process.env.SF_DB!); } catch { /* fresh */ }
const PORT = externalPort || 22996;
let server: import('net').Server | null = null;
if (!externalPort) {
  const { startServer } = await import('./net/ssh-server.js');
  server = startServer(PORT, '127.0.0.1', 'keys/host.key');
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (check: () => boolean, timeout = 4000): Promise<boolean> => {
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
  conn.connect({ host: '127.0.0.1', port: PORT, username: 'navigation', password: 'x', hostVerifier: () => true });
});

await sleep(200);
stream.write('\r');
await waitFor(() => transcript.includes('CHOOSE YOUR HANDLE'));
const handle = externalPort ? `NAV${Date.now().toString().slice(-6)}` : 'NAVTEST';
stream.write(`${handle}\r\n`);
const mainMenuAfterCrlf = await waitFor(() => transcript.includes('MAIN MENU'));
await sleep(180);
const didNotEnterLounge = !transcript.includes('[ESC] MAIN MENU');

const loungeStart = transcript.length;
stream.write('s\r');
const loungeOpened = await waitFor(() => transcript.slice(loungeStart).includes('[ESC] MAIN MENU'));
const exitIsVisible = await waitFor(() => transcript.slice(loungeStart).includes('[ESC] MAIN MENU'));
stream.write('\x1b');
const escapeStart = transcript.length;
const escapeReturned = await waitFor(() => transcript.slice(escapeStart).includes('MAIN MENU'));

await sleep(150);
const secondLoungeStart = transcript.length;
stream.write('s\r');
await waitFor(() => transcript.slice(secondLoungeStart).includes('[ESC] MAIN MENU'));
const commandStart = transcript.length;
stream.write('/menu\r');
const commandReturned = await waitFor(() => transcript.slice(commandStart).includes('MAIN MENU'));

conn.end();
const checks = { mainMenuAfterCrlf, didNotEnterLounge, loungeOpened, exitIsVisible, escapeReturned, commandReturned };
for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
const ok = Object.values(checks).every(Boolean);
console.log(ok ? 'NAVIGATION TEST: PASS' : 'NAVIGATION TEST: FAIL');
if (!ok) {
  const probes = ['CALIBRATE', 'MAIN MENU', 'FIGHT LOUNGE', '[ESC] MAIN MENU', 'WELCOME'];
  console.log(`TRANSCRIPT (${transcript.length} bytes): ${probes.map((probe) => `${probe}=${transcript.includes(probe)}`).join(' ')}`);
}
if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
await sleep(100);
process.exit(ok ? 0 : 1);

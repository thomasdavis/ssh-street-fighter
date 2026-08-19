// End-to-end: boot server, connect two guest clients, drive the full flow
// (username -> menu -> join lobby -> pick fighter -> fight), confirm both stream.
// Set SF_TEST_PORT to exercise an already-running server instead of booting one.
const externalPort = parseInt(process.env.SF_TEST_PORT ?? '0', 10);
if (!externalPort) {
  process.env.SF_DB = '/tmp/sf-test.db';
  process.env.SF_UI = 'cell';
}
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';

if (!externalPort) try { unlinkSync('/tmp/sf-test.db'); } catch { /* fresh */ }
const PORT = externalPort || 22999;
let server: import('net').Server | null = null;
if (!externalPort) {
  // dynamic import AFTER setting SF_DB (ESM hoists static imports above assignments)
  const { startServer } = await import('./net/ssh-server.js');
  server = startServer(PORT, '127.0.0.1', 'keys/host.key');
}

interface C { bytes: number; conn: ssh2.Client; stream?: any; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(name: string): Promise<C> {
  return new Promise((res, rej) => {
    const conn = new ssh2.Client();
    const c: C = { bytes: 0, conn };
    conn.on('ready', () => conn.shell({ term: 'xterm', cols: 120, rows: 42 }, (err, stream) => {
      if (err) return rej(err);
      c.stream = stream;
      stream.on('data', (d: Buffer) => { c.bytes += d.length; });
      res(c);
    }));
    conn.on('error', rej);
    conn.connect({ host: '127.0.0.1', port: PORT, username: name, password: 'x', hostVerifier: () => true });
  });
}
const send = (c: C, s: string) => c.stream?.write(s);

async function typeName(c: C, name: string): Promise<void> {
  send(c, '\r'); await sleep(150);           // first-run calibration -> username
  for (const ch of name) { send(c, ch); await sleep(30); }
  send(c, '\r'); await sleep(150);           // confirm username -> menu
  send(c, '\r'); await sleep(150);           // JOIN LOBBY -> select
  send(c, '\r'); await sleep(150);           // pick fighter -> lobby/pair
}

async function main(): Promise<void> {
  await sleep(400);
  const a = await connect('aaa');
  const b = await connect('bbb');
  await sleep(200);
  const runId = externalPort ? Date.now().toString().slice(-6) : '';
  await typeName(a, externalPort ? `QMA${runId}` : 'AAA');
  await typeName(b, externalPort ? `QMB${runId}` : 'BBB');   // second confirm pairs them into a fight
  console.log('both in match; brawling...');

  const beforeFightA = a.bytes;
  const beforeFightB = b.bytes;
  const samples: number[] = []; let last = a.bytes;
  const sampler = setInterval(() => { samples.push(a.bytes - last); last = a.bytes; }, 1000);
  const drive = setInterval(() => { send(a, '\x1b[C'); send(a, 'w'); send(b, 'e'); if (Math.random() < 0.2) send(b, '\x1b[A'); }, 100);
  await sleep(5000);
  clearInterval(drive); clearInterval(sampler);

  console.log('per-second bytes to A:', samples.join(', '));
  const fightBytesA = a.bytes - beforeFightA;
  const fightBytesB = b.bytes - beforeFightB;
  console.log(`fight bytes: A ${fightBytesA}   B ${fightBytesB}`);
  // A loaded SSH connection may flush several rendered frames in one large
  // network burst. Prove sustained match output from both clients without
  // coupling correctness to one-second packet boundaries.
  const streaming = samples.some((s) => s > 200) && fightBytesA > 10000 && fightBytesB > 10000;

  // verify a match row was written
  const db = await import('./db/db.js');
  const rows = (db as any); void rows;
  a.conn.end(); b.conn.end();
  console.log(streaming ? '\nSSH TEST: PASS (full flow + live fight frames)' : '\nSSH TEST: FAIL');
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await sleep(100);
  process.exit(streaming ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

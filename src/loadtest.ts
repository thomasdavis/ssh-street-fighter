// Load tester: opens N concurrent SSH clients against the running game, drives
// each into a practice fight (the expensive render path), holds for a while, and
// reports connection success + throughput. Measure the server process CPU/RSS
// separately (e.g. `pidstat`/`top`) while this runs.
//
//   node node_modules/tsx/dist/cli.mjs src/loadtest.ts <N> <host> <port> <seconds>
import { Client } from 'ssh2';

const N = parseInt(process.argv[2] ?? '100', 10);
const HOST = process.argv[3] ?? '127.0.0.1';
const PORT = parseInt(process.argv[4] ?? '22', 10);
const SECS = parseInt(process.argv[5] ?? '20', 10);
const FIGHT_PCT = parseFloat(process.argv[6] ?? '100'); // % of clients that enter a fight; rest idle in menu

let ready = 0, shells = 0, fighting = 0, errors = 0, bytes = 0, closed = 0;
const conns: Client[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function drive(stream: any) {
  const willFight = Math.random() * 100 < FIGHT_PCT;
  // Everyone: calibration ENTER -> name -> menu. Fighters go on into practice.
  const seq: [number, string][] = [
    [1200, '\r'], [700, `L${Math.floor(Math.random() * 1e6)}`.slice(0, 8)], [400, '\r'],
  ];
  if (willFight) seq.push([900, '\x1b[B\x1b[B'], [500, '\r'], [900, '\r']);
  let t = 0;
  for (const [d, s] of seq) { t += d; setTimeout(() => { try { stream.write(s); } catch { /* */ } }, t); }
  if (willFight) {
    const spam = setInterval(() => { try { stream.write(['\x1b[C', '\x1b[D', 'w', 'e', '\x1b[A'][Math.floor(Math.random() * 5)]!); } catch { /* */ } }, 120);
    setTimeout(() => { fighting++; }, t + 500);
    stream.on('close', () => clearInterval(spam));
  } else {
    // idle in the menu: a rare keypress to look alive, but mostly quiet
    const idle = setInterval(() => { try { stream.write(Math.random() < 0.5 ? '\x1b[B' : '\x1b[A'); } catch { /* */ } }, 3000);
    stream.on('close', () => clearInterval(idle));
  }
}

async function main() {
  console.log(`opening ${N} SSH clients -> ${HOST}:${PORT}, holding ${SECS}s`);
  for (let i = 0; i < N; i++) {
    const c = new Client();
    conns.push(c);
    c.on('ready', () => {
      ready++;
      c.shell({ term: 'xterm-256color', cols: 120, rows: 40 } as any, (err, stream) => {
        if (err) { errors++; return; }
        shells++;
        stream.on('data', (d: Buffer) => { bytes += d.length; });
        stream.on('close', () => { closed++; });
        drive(stream);
      });
    });
    c.on('error', () => { errors++; });
    c.connect({ host: HOST, port: PORT, username: 'load', password: 'x', readyTimeout: 20000, algorithms: { compress: ['zlib@openssh.com', 'zlib', 'none'] } as any });
    if (i % 25 === 0) await sleep(120); // ramp so we don't SYN-flood
  }

  const t0 = Date.now();
  const iv = setInterval(() => {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    console.log(`t+${((Date.now() - t0) / 1000).toFixed(0)}s  ready=${ready} shells=${shells} fighting=${fighting} errors=${errors} closed=${closed}  rx=${mb}MB (${(bytes / 1024 / Math.max(1, (Date.now() - t0) / 1000)).toFixed(0)} KB/s)`);
  }, 2000);

  await sleep(SECS * 1000);
  clearInterval(iv);
  console.log(`\nFINAL: ready=${ready}/${N} shells=${shells} fighting~=${fighting} errors=${errors} closed=${closed} rx=${(bytes / 1024 / 1024).toFixed(1)}MB`);
  for (const c of conns) { try { c.end(); } catch { /* */ } }
  await sleep(500);
  process.exit(0);
}
main();

// Unit-tests the PROXY v1 parser, then end-to-end: a server with
// SF_PROXY_PROTOCOL=1 must (a) still accept a normal SSH connection (tolerant),
// and (b) read the REAL client IP from a prepended PROXY header — verified via
// the ssh_connected telemetry row.
process.env.SF_PROXY_PROTOCOL = '1';
process.env.SF_DB = '/tmp/sf-proxy-test.db';
import net from 'net';
import ssh2 from 'ssh2';
import { unlinkSync } from 'fs';
import { parseProxyV1 } from './net/proxy-protocol.js';

try { unlinkSync(process.env.SF_DB!); } catch { /* fresh */ }
let pass = true;
const check = (n: string, c: boolean, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- unit: parser ----
{
  const v4 = parseProxyV1(Buffer.from('PROXY TCP4 203.0.113.7 158.69.195.38 54321 22\r\nSSH-2.0-x'));
  check('parses TCP4 real IP', v4 !== null && v4 !== 'incomplete' && v4.ip === '203.0.113.7' && v4.port === 54321);
  check('consumed stops at CRLF (SSH bytes preserved)', v4 !== null && v4 !== 'incomplete' && v4.consumed === 47);
  const v6 = parseProxyV1(Buffer.from('PROXY TCP6 2001:db8::1 2001:db8::2 5 22\r\n'));
  check('parses TCP6', v6 !== null && v6 !== 'incomplete' && v6.ip === '2001:db8::1');
  check('UNKNOWN → no ip but consumes', (() => { const r = parseProxyV1(Buffer.from('PROXY UNKNOWN\r\n')); return r !== null && r !== 'incomplete' && r.ip === '' && r.consumed === 15; })());
  check('non-PROXY bytes → null (normal SSH)', parseProxyV1(Buffer.from('SSH-2.0-OpenSSH_9\r\n')) === null);
  check('partial header → incomplete', parseProxyV1(Buffer.from('PROXY TCP4 203.0')) === 'incomplete');
  check('bare prefix "PRO" → incomplete', parseProxyV1(Buffer.from('PRO')) === 'incomplete');
}

// ---- integration ----
const PORT = 22996;
const { startServer } = await import('./net/ssh-server.js');
const server = startServer(PORT, '127.0.0.1', 'keys/host.key');
await sleep(300);

function sshOver(sock: net.Socket | undefined, host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const c = new ssh2.Client();
    c.on('ready', () => c.shell({ term: 'xterm', cols: 80, rows: 24 }, (e, stream) => {
      if (e) return resolve(false);
      let got = 0; stream.on('data', (d: Buffer) => { got += d.length; if (got > 100) { c.end(); resolve(true); } });
      setTimeout(() => { c.end(); resolve(got > 0); }, 1500);
    }));
    c.on('error', () => resolve(false));
    const opts: ssh2.ConnectConfig = { host, port, username: 'PROXYT', password: 'x', hostVerifier: () => true };
    if (sock) { opts.sock = sock; }
    c.connect(opts);
  });
}

// (a) normal connection, no PROXY header — tolerant path + injectSocket work
const normalOk = await sshOver(undefined, '127.0.0.1', PORT);
check('normal SSH works with PROXY protocol enabled (tolerant + injectSocket)', normalOk);

// (b) prepend a PROXY header claiming an Australian IP, over a shared socket
const raw = net.connect(PORT, '127.0.0.1');
await new Promise<void>((r) => raw.once('connect', () => r()));
raw.write('PROXY TCP4 1.1.1.1 127.0.0.1 40000 ' + PORT + '\r\n'); // 1.1.1.1 = AU
const spoofOk = await sshOver(raw, '127.0.0.1', PORT);
check('SSH works after a PROXY header (over shared socket)', spoofOk);
await sleep(300);

const db = await import('./db/db.js');
const rows = db.analyticsEvents(50);
const sawRealIp = rows.some((e) => e.event === 'ssh_connected' && JSON.parse(e.fields_json).ip === '1.1.1.1');
check('origin recorded the REAL client IP from the PROXY header', sawRealIp,
  sawRealIp ? '' : 'ssh_connected ips=' + rows.filter((e) => e.event === 'ssh_connected').map((e) => JSON.parse(e.fields_json).ip).join(','));

await new Promise<void>((r) => server.close(() => r()));
console.log(pass ? '\nPROXY PROTOCOL TEST: PASS' : '\nPROXY PROTOCOL TEST: FAIL');
process.exit(pass ? 0 : 1);

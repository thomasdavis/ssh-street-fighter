import ssh2 from 'ssh2';
import net from 'net';
import { readFileSync } from 'fs';
import type { Duplex } from 'stream';
import { Session } from './session.js';
import { fingerprintOf, verifyPubkey } from './identity.js';
import { addAnalyticsEvent, initDb } from '../db/db.js';
import { eventId, setAnalyticsSink, track } from '../telemetry/discord.js';
import { parseProxyV1 } from './proxy-protocol.js';

const { Server } = ssh2;

// SF_PROXY_PROTOCOL=1: accept a leading PROXY v1 header (from the Fly/haproxy
// relay) carrying the real client IP. Real IPs are correlated to ssh2's per-
// connection info by the relay-side 4-tuple (peer ip:port), which is unique per
// live connection. Tolerant: connections without a header still work (so the
// port serves both relayed and direct traffic during a transition).
const PROXY_PROTOCOL = process.env.SF_PROXY_PROTOCOL === '1';
const realIPs = new Map<string, string>(); // "peerIp:peerPort" -> real client ip

/** Read + strip a PROXY v1 header from a socket, record the real IP, then hand
 *  the (header-stripped) socket to ssh2. Never terminates the stream. */
function stripProxyHeader(socket: net.Socket, onReady: (s: net.Socket) => void): void {
  const key = `${socket.remoteAddress}:${socket.remotePort}`;
  let acc: Buffer = Buffer.alloc(0);
  const onData = (chunk: Buffer): void => {
    acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
    const res = parseProxyV1(acc);
    if (res === 'incomplete') return;                 // wait for the rest of the header
    socket.removeListener('data', onData);
    if (res && res.ip) realIPs.set(key, res.ip);
    const rest = res ? acc.subarray(res.consumed) : acc; // null → no header, keep all bytes
    if (rest.length) socket.unshift(rest);            // push the SSH stream back for ssh2
    onReady(socket);
  };
  socket.on('data', onData);
  socket.once('error', () => { socket.removeListener('data', onData); });
}

export function startServer(port: number, host: string, hostKeyPath: string): net.Server {
  initDb();
  setAnalyticsSink(addAnalyticsEvent);
  const hostKey = readFileSync(hostKeyPath);

  const server = new Server(
    {
      hostKeys: [hostKey],
      banner: 'SSH STREET FIGHTER\r\n',
      // Force zlib: drop 'none' from the compression list so every client
      // negotiates compression. Terminal ANSI compresses ~4-5x (lossless).
      algorithms: { compress: ['zlib@openssh.com', 'zlib'] },
    },
    (client, info) => {
      const connectionId = eventId('ssh');
      const connectedAt = Date.now();
      const clientSoftware = info.header.versions.software || 'unknown';
      // If a PROXY header was stripped for this connection, use the REAL client
      // IP (keyed by the relay-side 4-tuple) instead of the relay's IP.
      const key = `${info.ip}:${info.port}`;
      const clientIp = realIPs.get(key) ?? info.ip;
      realIPs.delete(key);
      let username = 'PLAYER';
      let fingerprint: string | null = null;
      let authMethod = 'unknown';
      track('ssh_connected', { connection_id: connectionId, ip: clientIp, edge_ip: info.ip, remote_port: info.port, client: clientSoftware });

      client.on('authentication', (ctx) => {
        username = (ctx.username || 'PLAYER').slice(0, 12);
        if (ctx.method === 'publickey') {
          // record identity; verify signature on the signed attempt
          const candidate = fingerprintOf(ctx.key.data);
          if (ctx.signature) {
            if (verifyPubkey(ctx)) { fingerprint = candidate; authMethod = 'publickey'; return ctx.accept(); }
            track('ssh_auth_rejected', { connection_id: connectionId, ip: clientIp, username, method: 'publickey', reason: 'invalid_signature' });
            return ctx.reject();
          }
          // probe: signal the client to sign with this key
          fingerprint = candidate;
          return ctx.accept();
        }
        if (ctx.method === 'none') {
          // nudge clients to offer a key first, but allow keyless guests through
          return ctx.reject(['publickey', 'keyboard-interactive', 'password'], false);
        }
        // password / keyboard-interactive => keyless guest
        fingerprint = null;
        authMethod = ctx.method;
        return ctx.accept();
      });

      client.on('ready', () => {
        track('ssh_login', { connection_id: connectionId, ip: clientIp, username, method: authMethod, identity: fingerprint ? 'verified_key' : 'guest' });
        client.on('session', (accept) => {
          const session = accept();
          let cols = 120, rows = 40;
          let sess: Session | null = null;
          session.on('pty', (a, _r, pty) => {
            cols = pty.cols || cols; rows = pty.rows || rows;
            track('terminal_opened', { connection_id: connectionId, username, cols, rows, pixel_width: pty.width, pixel_height: pty.height });
            if (sess) sess.resize(cols, rows); a && a();
          });
          session.on('window-change', (a, _r, size) => {
            cols = size.cols || cols; rows = size.rows || rows;
            track('terminal_resized', { connection_id: connectionId, username, cols, rows });
            if (sess) sess.resize(cols, rows); a && a();
          });
          const begin = (accept2: () => unknown) => {
            const stream = accept2() as unknown as Duplex;
            track('ssh_shell_started', { connection_id: connectionId, username, cols, rows });
            sess = new Session(username, stream, fingerprint, connectionId, clientIp, clientSoftware);
            sess.cols = cols; sess.rows = rows;
            sess.start();
          };
          session.on('shell', (accept2) => begin(accept2 as () => unknown));
          session.on('exec', (accept2) => begin(accept2 as () => unknown));
        });
      });

      client.on('error', () => { /* ignore transport errors */ });
      client.on('close', () => track('ssh_disconnected', {
        connection_id: connectionId, username, ip: clientIp, duration_seconds: Math.round((Date.now() - connectedAt) / 1000),
      }));
    },
  );

  // Large accept backlog so a burst of simultaneous connections queues instead
  // of being refused while handshakes are processed (default is only 511).
  const backlog = parseInt(process.env.SF_BACKLOG ?? '1024', 10) || 1024;
  const onListen = (): void => {
    console.log(`SSH Street Fighter listening on ${host}:${port}${PROXY_PROTOCOL ? ' (PROXY protocol)' : ''}`);
    track('service_started', { host, port, pid: process.pid, node: process.version, proxy_protocol: PROXY_PROTOCOL });
  };

  if (PROXY_PROTOCOL) {
    // A raw TCP front reads/strips the PROXY header, then hands the socket to
    // ssh2 via its injectSocket API (ssh2 is not bound to the port in this mode).
    const front = net.createServer((socket) => {
      socket.on('error', () => { /* ignore transport errors */ });
      stripProxyHeader(socket, (s) => server.injectSocket(s));
    });
    front.listen(port, host, backlog, onListen);
    return front;
  }
  server.listen(port, host, backlog, onListen);
  return server;
}

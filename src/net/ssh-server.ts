import ssh2 from 'ssh2';
import { readFileSync } from 'fs';
import type { Duplex } from 'stream';
import { Session } from './session.js';
import { fingerprintOf, verifyPubkey } from './identity.js';
import { addAnalyticsEvent, initDb } from '../db/db.js';
import { eventId, setAnalyticsSink, track } from '../telemetry/discord.js';

const { Server } = ssh2;

export function startServer(port: number, host: string, hostKeyPath: string) {
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
      let username = 'PLAYER';
      let fingerprint: string | null = null;
      let authMethod = 'unknown';
      track('ssh_connected', { connection_id: connectionId, ip: info.ip, remote_port: info.port, client: clientSoftware });

      client.on('authentication', (ctx) => {
        username = (ctx.username || 'PLAYER').slice(0, 12);
        if (ctx.method === 'publickey') {
          // record identity; verify signature on the signed attempt
          const candidate = fingerprintOf(ctx.key.data);
          if (ctx.signature) {
            if (verifyPubkey(ctx)) { fingerprint = candidate; authMethod = 'publickey'; return ctx.accept(); }
            track('ssh_auth_rejected', { connection_id: connectionId, ip: info.ip, username, method: 'publickey', reason: 'invalid_signature' });
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
        track('ssh_login', { connection_id: connectionId, ip: info.ip, username, method: authMethod, identity: fingerprint ? 'verified_key' : 'guest' });
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
            sess = new Session(username, stream, fingerprint, connectionId, info.ip, clientSoftware);
            sess.cols = cols; sess.rows = rows;
            sess.start();
          };
          session.on('shell', (accept2) => begin(accept2 as () => unknown));
          session.on('exec', (accept2) => begin(accept2 as () => unknown));
        });
      });

      client.on('error', () => { /* ignore transport errors */ });
      client.on('close', () => track('ssh_disconnected', {
        connection_id: connectionId, username, ip: info.ip, duration_seconds: Math.round((Date.now() - connectedAt) / 1000),
      }));
    },
  );

  // Large accept backlog so a burst of simultaneous connections queues instead
  // of being refused while handshakes are processed (default is only 511).
  const backlog = parseInt(process.env.SF_BACKLOG ?? '1024', 10) || 1024;
  server.listen(port, host, backlog, () => {
    console.log(`SSH Street Fighter listening on ${host}:${port}`);
    track('service_started', { host, port, pid: process.pid, node: process.version });
  });
  return server;
}

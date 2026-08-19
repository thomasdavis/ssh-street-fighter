import cluster from 'cluster';
import { existsSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './net/ssh-server.js';
import { initDb } from './db/db.js';
import { runCoordinator } from './cluster/coordinator.js';
import { flushTelemetry, track } from './telemetry/discord.js';
import { startOpsSampler } from './telemetry/ops.js';
import { hub } from './net/hub.js';
import { startApiServer } from './api/server.js';
import { startBotServer } from './api/bot-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PORT = parseInt(process.env.SF_PORT ?? '2223', 10);
const HOST = process.env.SF_HOST ?? '0.0.0.0';
const HOST_KEY = resolve(ROOT, 'keys/host.key');
// SF_WORKERS>1 runs a cluster: the primary accepts connections and round-robins
// them to N worker processes, so SSH handshakes, simulation, input and rendering
// all run in parallel across cores. Each worker is an independent game instance;
// stats/leaderboard/chat are shared through the SQLite DB. Quick-match and the
// live lounge are per-worker shards (each shard still holds hundreds of players).
const WORKERS = Math.max(1, parseInt(process.env.SF_WORKERS ?? '1', 10) || 1);

function ensureHostKey(): void {
  if (existsSync(HOST_KEY)) return;
  mkdirSync(dirname(HOST_KEY), { recursive: true });
  console.log('Generating SSH host key...');
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-f', HOST_KEY, '-N', '', '-q']);
}

function runServer(): void {
  ensureHostKey();
  const server = startServer(PORT, HOST, HOST_KEY);
  // Per-process observability: sessions + CPU/mem. Primary is worker 0; a real
  // cluster worker uses its id; single-process uses 1.
  startOpsSampler(cluster.worker?.id ?? 1, () => ({ sessions: hub().sessionCount() }));
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    track('service_stopping', { signal, pid: process.pid });
    void flushTelemetry(2000).finally(() => process.exit(0));
  });
}

if (WORKERS > 1 && cluster.isPrimary) {
  // Prepare shared state ONCE before forking: generate the host key (so every
  // worker presents the same server identity) and run DB schema + migrations
  // (so workers don't race on ALTER TABLE).
  ensureHostKey();
  initDb();
  console.log(`SSH Street Fighter primary (pid ${process.pid}): forking ${WORKERS} workers`);
  track('cluster_started', { workers: WORKERS, pid: process.pid });
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  // the primary owns global matchmaking + runs every versus simulation
  const coord = runCoordinator();
  // Ringside services live in the primary (single instance, next to live state):
  // the read-only REST API for the homepage, and the bot play server (bots pair
  // through the coordinator as ordinary players).
  startApiServer(coord);
  startBotServer(coord);

  let shuttingDown = false;
  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    console.log(`worker ${worker.process.pid} exited (${signal || code}); respawning`);
    track('worker_respawned', { dead_pid: worker.process.pid, code, signal });
    cluster.fork();
  });
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => {
    shuttingDown = true;
    for (const id in cluster.workers) cluster.workers[id]?.kill(sig);
    setTimeout(() => process.exit(0), 3000);
  });
} else {
  // This branch runs for BOTH cluster workers and true single-process mode.
  runServer();
  // Only single-process (not a cluster worker) starts the read API here — in a
  // cluster the primary owns it. Workers must not try to bind the port.
  if (!cluster.isWorker) startApiServer(null);
}

// Bot play server: newline-delimited JSON over TCP. A bot authenticates with an
// API key minted over SSH (`ssh host token`), so its identity stays anchored to
// an SSH key fingerprint. Once authenticated it queues, receives full world state
// each tick, and streams back inputs — driven through the SAME MatchCoordinator
// as human players (this acts as one synthetic "worker"), so bots pair with humans
// or other bots automatically. Runs in the cluster primary. Behind SF_BOT_PORT
// (default 8091; set 0 to disable).
import { createServer, type Socket } from 'net';
import { emptyInputs, type Inputs, type Match, type Fighter } from '../game/types.js';
import { attackActive, specialMoveStats } from '../game/engine.js';
import type { SpecialAttack } from '../game/moves.js';
import { ROSTER } from '../game/roster.js';
import { getByFingerprint } from '../db/db.js';
import { apiKeyLookup } from '../telemetry/store.js';
import type { P2W } from '../cluster/messages.js';
import type { MatchCoordinator, WorkerRef } from '../cluster/coordinator.js';

const BOT_WORKER_ID = 900001;          // reserved id so bots don't collide with real workers (1..N)
const MAX_LINE = 64 * 1024;
const NAME_TO_IDX = new Map(ROSTER.map((c, i) => [c.name.toUpperCase(), i]));

/** True for a connection from this host. The SSH `play` path pipes a key-verified
 *  SSH channel to this server over loopback and vouches for the fingerprint, so a
 *  loopback client may authenticate with {trustedFp} instead of an API key. The
 *  port is bound locally and never firewalled open, so only our own workers reach it. */
function isLoopback(addr: string | undefined): boolean {
  return !!addr && /^(::1|::ffff:127\.|127\.)/.test(addr);
}

interface Conn {
  sid: number; socket: Socket; buf: string; authed: boolean;
  fp: string; name: string; elo: number; role: 'a' | 'b'; mid: string; seq: number;
}

const SPECIAL_KINDS = new Set(['hadouken', 'shoryuken', 'hurricane', 'rolling', 'verticalroll', 'electric', 'testimony', 'nullstep', 'entropy', 'context', 'branchwalk', 'mergecomet']);

function fighterView(f: Fighter): object {
  // Attack phase so bots can REACT to the opponent committing a move:
  //  special  — the current attack is a special (not a normal punch/kick)
  //  active   — the hitbox is live right now
  //  casting  — a special is winding up (started but not yet active) → react now
  const special = SPECIAL_KINDS.has(f.attack);
  const active = attackActive(f);
  let casting = false;
  if (special && !active) { try { casting = f.attackFrame < specialMoveStats(f.attack as SpecialAttack).startup; } catch { /* ignore */ } }
  return { x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy),
    facing: f.facing, hp: f.hp, wins: f.wins, attack: f.attack, attackFrame: f.attackFrame,
    stun: f.stun, pose: f.pose, crouching: f.crouching,
    special, active, casting };
}
function stateFor(c: Conn, m: Match, ack: number): object {
  const you = c.role === 'a' ? m.a : m.b;
  const opp = c.role === 'a' ? m.b : m.a;
  return { t: 'state', frame: m.frame, phase: m.phase, round: m.round, roundTime: Math.round(m.roundTime),
    hitStop: m.hitStop, ack, you: fighterView(you), opp: fighterView(opp),
    projectiles: m.projectiles.filter((p) => p.active).map((p) => ({ owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), vx: p.vx, style: p.style })) };
}

const HELP = {
  t: 'help',
  send: {
    hello: '{"t":"hello","key":"rk_..."}  authenticate (key from: ssh host token)',
    queue: '{"t":"queue","char":"BYU"}   enter matchmaking as a character (name or index)',
    input: '{"t":"input","moveX":-1|0|1,"down":bool,"jump":bool,"punch":bool,"kick":bool,"motion":"DR"}',
    leave: '{"t":"leave"}                leave the current match / queue',
    ping: '{"t":"ping"}',
  },
  receive: {
    welcome: 'sent after hello; includes your name, elo and the roster',
    matchStart: '{"t":"matchStart","role":"a|b","stage":..,"oppName":..,"oppCursor":..}',
    state: 'every relayed tick: your fighter (you), opponent (opp), projectiles, phase, round',
    matchEnd: '{"t":"matchEnd","result":{...}}',
  },
};

export function startBotServer(coord: MatchCoordinator): void {
  const port = parseInt(process.env.SF_BOT_PORT ?? '8091', 10);
  if (!port) return;   // SF_BOT_PORT=0 disables
  const conns = new Map<number, Conn>();
  let nextSid = 1;

  // The coordinator sees all bots as one worker; send() routes P2W back to the
  // right bot socket by sid and translates it to the bot JSON protocol.
  const botWorker: WorkerRef = {
    id: BOT_WORKER_ID,
    send(msg: P2W): void {
      const c = conns.get(msg.sid); if (!c) return;
      switch (msg.t) {
        case 'matchStart':
          c.role = msg.role; c.mid = msg.mid;
          return write(c, { t: 'matchStart', mid: msg.mid, role: msg.role, yourCursor: msg.yourCursor, stage: msg.stage, oppName: msg.oppName, oppCursor: msg.oppCursor });
        case 'state': return write(c, stateFor(c, msg.m, msg.ack));
        case 'matchEnd': c.mid = ''; return write(c, { t: 'matchEnd', result: msg.result });
        default: return;   // notice/lounge/challengeState are irrelevant to bots
      }
    },
  };

  const write = (c: Conn, obj: object): void => { try { c.socket.write(JSON.stringify(obj) + '\n'); } catch { /* gone */ } };

  const handle = (c: Conn, msg: Record<string, unknown>): void => {
    const t = msg.t;
    if (t === 'ping') return write(c, { t: 'pong' });
    if (t === 'help') return write(c, HELP);
    if (t === 'hello') {
      if (c.authed) return write(c, { t: 'error', msg: 'already authenticated' });
      let fp: string | null = null;
      if (msg.trustedFp && isLoopback(c.socket.remoteAddress)) fp = String(msg.trustedFp);   // SSH `play` pipe (key already verified)
      else { const row = apiKeyLookup(String(msg.key ?? '')); if (row) fp = row.fp; }
      if (!fp) return void write(c, { t: 'error', msg: 'invalid api key — mint one with: ssh host token' });
      const player = getByFingerprint(fp);
      c.authed = true; c.fp = fp; c.name = player?.username ?? 'BOT'; c.elo = player?.elo ?? 1200;
      return write(c, { t: 'welcome', fp: c.fp, name: c.name, elo: c.elo, roster: ROSTER.map((x) => x.name), channel: 'bot-api' });
    }
    if (!c.authed) return write(c, { t: 'error', msg: 'send {"t":"hello","key":...} first' });

    if (t === 'queue') {
      const raw = msg.char;
      const cursor = typeof raw === 'number' ? raw : NAME_TO_IDX.get(String(raw ?? '').toUpperCase()) ?? 0;
      // Queue as an ordinary player (no bot flag) so bots and humans pair together
      // in the one global queue and are indistinguishable in matches and metrics.
      coord.handle(botWorker, { t: 'queue', sid: c.sid, cid: `bot:${c.sid}`, name: c.name, fp: c.fp, cursor, elo: c.elo, region: 'XX' });
      return write(c, { t: 'queued', char: ROSTER[((cursor % ROSTER.length) + ROSTER.length) % ROSTER.length]!.name });
    }
    if (t === 'dequeue') { coord.handle(botWorker, { t: 'dequeue', sid: c.sid }); return write(c, { t: 'dequeued' }); }
    if (t === 'input') {
      if (!c.mid) return;   // not in a match
      const input: Inputs = { ...emptyInputs(),
        moveX: Math.sign(Number(msg.moveX) || 0), down: !!msg.down, jump: !!msg.jump,
        punch: !!msg.punch, kick: !!msg.kick, motion: typeof msg.motion === 'string' ? msg.motion : '' };
      coord.handle(botWorker, { t: 'input', mid: c.mid, sid: c.sid, input, seq: ++c.seq });
      return;
    }
    if (t === 'leave') {
      if (c.mid) coord.handle(botWorker, { t: 'leaveMatch', mid: c.mid, sid: c.sid });
      coord.handle(botWorker, { t: 'dequeue', sid: c.sid });
      return write(c, { t: 'left' });
    }
    write(c, { t: 'error', msg: `unknown command: ${String(t)}` });
  };

  const server = createServer((socket) => {
    const c: Conn = { sid: nextSid++, socket, buf: '', authed: false, fp: '', name: 'BOT', elo: 1200, role: 'a', mid: '', seq: 0 };
    conns.set(c.sid, c);
    socket.setNoDelay(true);
    socket.setTimeout(120000, () => socket.destroy());   // drop idle bots
    write(c, { t: 'hi', service: 'ringside-bot', send_hello_with: 'api key from `ssh host token`' });
    socket.on('data', (chunk) => {
      c.buf += chunk.toString('utf8');
      if (c.buf.length > MAX_LINE) { write(c, { t: 'error', msg: 'line too long' }); socket.destroy(); return; }
      let nl: number;
      while ((nl = c.buf.indexOf('\n')) >= 0) {
        const line = c.buf.slice(0, nl).trim(); c.buf = c.buf.slice(nl + 1);
        if (!line) continue;
        try { handle(c, JSON.parse(line) as Record<string, unknown>); }
        catch { write(c, { t: 'error', msg: 'invalid json' }); }
      }
    });
    const cleanup = (): void => {
      if (!conns.has(c.sid)) return;
      conns.delete(c.sid);
      if (c.mid) coord.handle(botWorker, { t: 'leaveMatch', mid: c.mid, sid: c.sid });
      coord.handle(botWorker, { t: 'dequeue', sid: c.sid });
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
  server.on('error', (e) => console.error('[ringside-bot] listen failed:', (e as Error).message));
  // Loopback only — bots reach it by piping through the SSH `play` command; the
  // port is never exposed, keeping the origin behind the Fly relay.
  server.listen(port, '127.0.0.1', () => console.log(`[ringside-bot] bot play server on 127.0.0.1:${port}`));
}

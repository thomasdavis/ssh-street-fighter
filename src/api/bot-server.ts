// Bot play server: newline-delimited JSON over TCP. A bot authenticates with an
// API key minted over SSH (`ssh host token`), so its identity stays anchored to
// an SSH key fingerprint. Once authenticated it queues, receives full world state
// each tick, or joins the same lounge/chat/challenge fabric as terminal players —
// all driven through the SAME MatchCoordinator (this acts as one synthetic
// "worker"), so bots pair with humans or other bots automatically. Runs in the
// cluster primary. Behind SF_BOT_PORT (default 8091; set 0 to disable).
import { createServer, type Server, type Socket } from 'net';
import { emptyInputs, type Inputs, type Match, type Fighter } from '../game/types.js';
import { attackActive, specialMoveStats } from '../game/engine.js';
import { SPECIAL_ATTACK_KINDS, type SpecialAttack } from '../game/moves.js';
import { ROSTER } from '../game/roster.js';
import { getByFingerprint } from '../db/db.js';
import { apiKeyLookup } from '../telemetry/store.js';
import { VERSION_INFO } from '../version.js';
import type { P2W } from '../cluster/messages.js';
import type { MatchCoordinator, WorkerRef } from '../cluster/coordinator.js';

const BOT_WORKER_ID = 900001;          // reserved id so bots don't collide with real workers (1..N)
const MAX_LINE = 64 * 1024;
const NAME_TO_IDX = new Map(ROSTER.map((c, i) => [c.name.toUpperCase(), i]));
const BOT_BUILD = Object.freeze({
  engine: VERSION_INFO.engine,
  commit: VERSION_INFO.commit,
  dirty: VERSION_INFO.dirty,
  build: VERSION_INFO.build,
  protocol: VERSION_INFO.botProtocol,
});

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
  queued: boolean; inLounge: boolean; lastChatAt: number;
}

// Derived from MOVE_SETS so no fighter's specials are ever silently missing from
// the wire view (a stale hand-copied list once hid lasso/reflect/blink wind-ups).
const SPECIAL_KINDS = SPECIAL_ATTACK_KINDS;

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
    joinLounge: '{"t":"joinLounge","char":"FABLE"}  join the live fight lounge',
    chat: '{"t":"chat","message":"hello"}  send lounge chat (140 printable ASCII chars; 700ms rate limit)',
    challenge: '{"t":"challenge","targetId":"..."}  challenge an id from the lounge roster',
    acceptChallenge: '{"t":"acceptChallenge"}  accept the current incoming challenge',
    declineChallenge: '{"t":"declineChallenge"}  decline the current incoming challenge',
    cancelChallenge: '{"t":"cancelChallenge"}  cancel the current outgoing challenge',
    leaveLounge: '{"t":"leaveLounge"}',
    leave: '{"t":"leave"}                leave the current match / queue',
    ping: '{"t":"ping"}',
  },
  receive: {
    welcome: 'sent after hello; includes your name, elo, roster, engine, commit and build',
    matchStart: '{"t":"matchStart","role":"a|b","stage":..,"oppName":..,"engine":..,"commit":..,"build":..}',
    state: 'every relayed tick: your fighter (you), opponent (opp), projectiles, phase, round',
    matchEnd: '{"t":"matchEnd","result":{...}}',
    lounge: '{"t":"lounge","roster":[...],"chat":[...]}  presence/chat snapshot after join and updates',
    challengeState: '{"t":"challengeState","incoming":...|null,"outgoing":...|null}',
    notice: '{"t":"notice","message":"..."}',
  },
};

/** Build the JSON-lines bot server without binding it. Tests use this with an
 *  ephemeral port; production binds it through {@link startBotServer}. */
export function createBotServer(coord: MatchCoordinator): Server {
  const conns = new Map<number, Conn>();
  let nextSid = 1;

  const write = (c: Conn, obj: object): void => { try { c.socket.write(JSON.stringify(obj) + '\n'); } catch { /* gone */ } };
  const error = (c: Conn, code: string, msg: string): void => write(c, { t: 'error', code, msg });
  const cursorFor = (raw: unknown): number => {
    const cursor = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.trunc(raw)
      : NAME_TO_IDX.get(typeof raw === 'string' ? raw.toUpperCase() : '') ?? 0;
    return ((cursor % ROSTER.length) + ROSTER.length) % ROSTER.length;
  };

  // The coordinator sees all bots as one worker; send() routes P2W back to the
  // right bot socket by sid and translates it to the bot JSON protocol.
  const botWorker: WorkerRef = {
    id: BOT_WORKER_ID,
    send(msg: P2W): void {
      const c = conns.get(msg.sid); if (!c) return;
      switch (msg.t) {
        case 'matchStart':
          c.role = msg.role; c.mid = msg.mid; c.queued = false; c.inLounge = false;
          return write(c, {
            t: 'matchStart', mid: msg.mid, role: msg.role, yourCursor: msg.yourCursor,
            stage: msg.stage, oppName: msg.oppName, oppCursor: msg.oppCursor, ...BOT_BUILD,
          });
        case 'state': return write(c, stateFor(c, msg.m, msg.ack));
        case 'matchEnd': c.mid = ''; return write(c, { t: 'matchEnd', result: msg.result });
        case 'lounge':
          return write(c, { t: 'lounge', roster: msg.roster, chat: msg.chat });
        case 'notice': return write(c, { t: 'notice', message: msg.notice });
        case 'challengeState':
          return write(c, { t: 'challengeState', incoming: msg.incoming, outgoing: msg.outgoing });
      }
    },
  };
  const leaveLounge = (c: Conn): void => {
    if (!c.inLounge) return;
    c.inLounge = false;
    coord.handle(botWorker, { t: 'loungeLeave', sid: c.sid });
  };
  const leaveQueue = (c: Conn): void => {
    if (!c.queued) return;
    c.queued = false;
    coord.handle(botWorker, { t: 'dequeue', sid: c.sid });
  };

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
      return write(c, {
        t: 'welcome', fp: c.fp, name: c.name, elo: c.elo,
        roster: ROSTER.map((x) => x.name), channel: 'bot-api', ...BOT_BUILD,
      });
    }
    if (!c.authed) return write(c, { t: 'error', msg: 'send {"t":"hello","key":...} first' });

    if (t === 'queue') {
      if (c.mid) return error(c, 'already_in_match', 'leave the current match before queueing');
      if (c.inLounge) return error(c, 'in_lounge', 'leave the lounge before queueing');
      if (c.queued) return error(c, 'already_queued', 'already queued');
      const cursor = cursorFor(msg.char);
      c.queued = true;
      write(c, { t: 'queued', char: ROSTER[cursor]!.name });
      // Queue as an ordinary player (no bot flag) so bots and humans pair together
      // in the one global queue and are indistinguishable in matches and metrics.
      coord.handle(botWorker, { t: 'queue', sid: c.sid, cid: `bot:${c.sid}`, name: c.name, fp: c.fp, cursor, elo: c.elo, region: 'XX' });
      return;
    }
    if (t === 'dequeue') { leaveQueue(c); return write(c, { t: 'dequeued' }); }
    if (t === 'joinLounge') {
      if (c.mid) return error(c, 'already_in_match', 'leave the current match before joining the lounge');
      if (c.queued) return error(c, 'queued', 'dequeue before joining the lounge');
      if (c.inLounge) return error(c, 'already_in_lounge', 'already in the lounge');
      const cursor = cursorFor(msg.char);
      c.inLounge = true;
      coord.handle(botWorker, {
        t: 'loungeJoin', sid: c.sid, cid: `bot:${c.sid}`, name: c.name, fp: c.fp,
        cursor, elo: c.elo,
      });
      return write(c, { t: 'joinedLounge', char: ROSTER[cursor]!.name });
    }
    if (t === 'leaveLounge') {
      leaveLounge(c);
      return write(c, { t: 'leftLounge' });
    }
    if (t === 'chat') {
      if (!c.inLounge) return error(c, 'not_in_lounge', 'join the lounge before chatting');
      if (typeof msg.message !== 'string') return error(c, 'invalid_chat', 'chat message must be a string');
      const message = msg.message.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 140);
      if (!message) return error(c, 'invalid_chat', 'chat message must contain printable ASCII');
      const now = Date.now();
      if (now - c.lastChatAt < 700) return error(c, 'chat_rate_limited', 'one chat message per 700ms');
      c.lastChatAt = now;
      coord.handle(botWorker, { t: 'chat', sid: c.sid, text: message });
      return;
    }
    if (t === 'challenge') {
      if (!c.inLounge) return error(c, 'not_in_lounge', 'join the lounge before challenging');
      const targetId = typeof msg.targetId === 'string' ? msg.targetId : '';
      if (!targetId) return error(c, 'invalid_target', 'targetId must come from the lounge roster');
      coord.handle(botWorker, { t: 'challenge', sid: c.sid, targetId });
      return;
    }
    if (t === 'acceptChallenge' || t === 'declineChallenge') {
      if (!c.inLounge) return error(c, 'not_in_lounge', 'join the lounge before responding');
      coord.handle(botWorker, { t: 'respondChallenge', sid: c.sid, accept: t === 'acceptChallenge' });
      return;
    }
    if (t === 'cancelChallenge') {
      if (!c.inLounge) return error(c, 'not_in_lounge', 'join the lounge before cancelling a challenge');
      coord.handle(botWorker, { t: 'cancelChallenge', sid: c.sid });
      return;
    }
    if (t === 'input') {
      if (!c.mid) return;   // not in a match
      const input: Inputs = { ...emptyInputs(),
        moveX: Math.sign(Number(msg.moveX) || 0), down: !!msg.down, jump: !!msg.jump,
        punch: !!msg.punch, kick: !!msg.kick, throw: !!msg.throw, motion: typeof msg.motion === 'string' ? msg.motion : '' };
      coord.handle(botWorker, { t: 'input', mid: c.mid, sid: c.sid, input, seq: ++c.seq });
      return;
    }
    if (t === 'leave') {
      if (c.mid) coord.handle(botWorker, { t: 'leaveMatch', mid: c.mid, sid: c.sid });
      c.mid = '';
      leaveQueue(c);
      leaveLounge(c);
      return write(c, { t: 'left' });
    }
    write(c, { t: 'error', msg: `unknown command: ${String(t)}` });
  };

  const server = createServer((socket) => {
    const c: Conn = {
      sid: nextSid++, socket, buf: '', authed: false, fp: '', name: 'BOT', elo: 1200,
      role: 'a', mid: '', seq: 0, queued: false, inLounge: false, lastChatAt: 0,
    };
    conns.set(c.sid, c);
    socket.setNoDelay(true);
    socket.setTimeout(120000, () => socket.destroy());   // drop idle bots
    write(c, {
      t: 'hi', service: 'ringside-bot',
      send_hello_with: 'api key from `ssh host token`', ...BOT_BUILD,
    });
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
      leaveQueue(c);
      leaveLounge(c);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
  server.on('error', (e) => console.error('[ringside-bot] listen failed:', (e as Error).message));
  return server;
}

export function startBotServer(coord: MatchCoordinator): Server | null {
  const port = parseInt(process.env.SF_BOT_PORT ?? '8091', 10);
  if (!port) return null;   // SF_BOT_PORT=0 disables
  const server = createBotServer(coord);
  // Loopback only — bots reach it by piping through the SSH `play` command; the
  // port is never exposed, keeping the origin behind the Fly relay.
  server.listen(port, '127.0.0.1', () => console.log(`[ringside-bot] bot play server on 127.0.0.1:${port}`));
  return server;
}

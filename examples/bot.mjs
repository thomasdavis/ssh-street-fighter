#!/usr/bin/env node
// ============================================================================
// SSH Fighter — example bot
// ----------------------------------------------------------------------------
// Bot identities are labeled automatically when they reach the game over this
// protocol. Give every bot its own SSH key so its identity and rating remain
// independent from a human account.
//
//   ssh-keygen -t ed25519 -f ~/.ssh/sshfighter-mybot -C sshfighter-mybot
//   ssh -i ~/.ssh/sshfighter-mybot -o IdentitiesOnly=yes MYBOT@sshfighter.com
//   node examples/bot.mjs --user MYBOT --identity ~/.ssh/sshfighter-mybot
//
// The default mode enters Quick Match. Lounge mode can chat, challenge a player
// by handle or roster id, accept incoming challenges, and stop after a bounded
// number of completed matches:
//
//   node examples/bot.mjs --user MYBOT --identity ~/.ssh/sshfighter-mybot \
//     --char CODEX --lounge --challenge AJAX --accept --chat "ready" --matches 3
//
// Direct TCP is optional and requires an API key minted with `ssh host token`:
//   node examples/bot.mjs --tcp HOST:8091 --key rk_xxx --char BYU
// ============================================================================
import { spawn } from 'node:child_process';
import net from 'node:net';
import readline from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VALUE_OPTIONS = new Set([
  'identity', 'user', 'host', 'char', 'tcp', 'key', 'opponents', 'challenge', 'chat', 'matches',
]);

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (!VALUE_OPTIONS.has(name) && !['lounge', 'accept', 'help'].includes(name)) {
      throw new Error(`unknown option: --${name}`);
    }
    if (VALUE_OPTIONS.has(name)) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`--${name} requires a value`);
      args[name] = argv[++i];
    } else {
      args[name] = true;
    }
  }
  if (args.matches !== undefined) {
    const matches = Number(args.matches);
    if (!Number.isInteger(matches) || matches < 1) throw new Error('--matches must be a positive integer');
    args.matches = matches;
  }
  if (args.opponents !== undefined && !['all', 'humans', 'bots'].includes(args.opponents)) {
    throw new Error('--opponents must be all, humans, or bots');
  }
  return args;
}

const HELP = `Usage:
  node examples/bot.mjs [--user NAME] [--host HOST] [--char FIGHTER] [--identity KEY]
  node examples/bot.mjs --tcp HOST:PORT --key rk_xxx [--char FIGHTER]

Options:
  --identity KEY      Dedicated SSH private key. Also enables IdentitiesOnly=yes.
  --user NAME         SSH username (default: BOT).
  --host HOST         SSH host (default: sshfighter.com).
  --char FIGHTER      Fighter to play (default: BYU).
  --tcp HOST:PORT     Use direct TCP instead of the recommended SSH transport.
  --key TOKEN         API key required by direct TCP.
  --opponents POOL    Quick Match pool: all, humans, or bots (default: all).
  --lounge            Join Fight Lounge instead of Quick Match.
  --challenge PLAYER  Challenge a lounge player by case-insensitive handle or id.
  --accept            Automatically accept incoming lounge challenges.
  --chat MESSAGE      Send one lounge chat message after joining.
  --matches N         Stop cleanly after N completed matches (default: unlimited).
  --help              Show this help.

--challenge, --accept, and --chat imply --lounge.`;

// ---- a small quick-match brain ----
const R = () => Math.random();
export function decide(st) {
  const { you, opp, phase, projectiles = [] } = st;
  const cmd = { t: 'input', moveX: 0, motion: 'N' };
  if (phase !== 'fight' || !you || !opp) return cmd;

  const dx = opp.x - you.x;
  const dist = Math.abs(dx);
  const towards = Math.sign(dx) || you.facing;
  const f = you.facing;
  const oppAir = opp.y > 8;
  const oppAttacking = opp.attack && opp.attack !== 'none';
  const away = -towards;

  // Protocol v2 tells us which projectiles are actually hostile, where they
  // came from, and where they will be next. Ignore a turret body (dangerous is
  // false) but react to its child motes and to reflected shots now owned by the
  // opponent. This is intentionally simple; a trained bot should featurize id,
  // sourceAttack, state, age, ttl, vx and vy instead of discarding them.
  const threat = projectiles
    .filter((p) => p?.ownedBy === 'opponent' && p.dangerous !== false && p.canHit !== false && Number.isFinite(p.x) && Number.isFinite(p.vx))
    .map((p) => {
      const eta = Math.abs(you.x - p.x) / Math.max(0.01, Math.abs(p.vx));
      return { p, eta, projectedY: p.y + (p.vy || 0) * eta };
    })
    .filter(({ p, eta, projectedY }) => eta <= 18
      && Math.sign(you.x - p.x) === Math.sign(p.vx)
      && projectedY >= you.y - 8 && projectedY <= you.y + 58)
    .sort((a, b) => a.eta - b.eta)[0];
  if (threat) {
    if (you.y <= 1 && threat.eta > 5 && threat.projectedY < 38 && threat.p.style !== 'knowledge') cmd.jump = true;
    else cmd.moveX = away; // hold away: the engine derives blocking
    return cmd;
  }

  // Do not swing into explicit invulnerability. A nearby startup is a concrete
  // commitment; guard it rather than trying to infer timing from pose names.
  if (opp.invulnerable || (dist < 48 && opp.movePhase === 'startup')) {
    cmd.moveX = away;
    return cmd;
  }

  // Only send the classic projectile motion to characters that actually own
  // it. `character` is present on every state, so a configurable example never
  // silently assumes it is BYU.
  const projectileMotion = {
    BYU: f === 1 ? 'DR' : 'DL', MEN: f === 1 ? 'DR' : 'DL',
    CHONG: f === 1 ? 'DR' : 'DL', GYLE: f === 1 ? 'LR' : 'RL',
    DHAL: f === 1 ? 'DR' : 'DL', KIRA: f === 1 ? 'DR' : 'DL',
    MAKO: f === 1 ? 'DR' : 'DL', MEGAWATTS: f === 1 ? 'DR' : 'DL',
  }[you.character];

  if (oppAir && dist < 58) {
    cmd.motion = f === 1 ? 'RDR' : 'LDL'; cmd.punch = true;
  } else if (dist < 42) {
    if (oppAttacking && R() < 0.7) cmd.moveX = -towards;
    else if (R() < 0.5) cmd.punch = true; else cmd.kick = true;
  } else if (dist < 115) {
    cmd.moveX = towards;
    if (R() < 0.04) { cmd.motion = f === 1 ? 'DL' : 'DR'; cmd.kick = true; }
  } else {
    if (projectileMotion && R() < 0.28) { cmd.motion = projectileMotion; cmd.punch = true; }
    else cmd.moveX = towards;
    if (R() < 0.03) cmd.jump = true;
  }
  return cmd;
}

/** Pure protocol driver. Tests inject send/close/schedule without opening a socket. */
export function createBotController(options, io) {
  const char = options.char || 'BYU';
  const opponents = options.opponents || 'all';
  const lounge = !!(options.lounge || options.challenge || options.accept || options.chat);
  const matchLimit = options.matches ?? Infinity;
  const challenge = options.challenge ? String(options.challenge) : '';
  const send = io.send;
  const log = io.log ?? console.log;
  const error = io.error ?? console.error;
  const close = io.close ?? (() => {});
  const schedule = io.schedule ?? ((fn, ms) => setTimeout(fn, ms));

  let wins = 0;
  let losses = 0;
  let completed = 0;
  let challengeSent = false;
  let chatSent = false;
  let acceptedId = '';
  let stopping = false;
  let serverBuild = '';

  const observeBuild = (msg) => {
    const label = typeof msg.build === 'string' && msg.build
      ? msg.build
      : (typeof msg.engine === 'string' && msg.engine ? `${msg.engine}@${String(msg.commit || 'unknown').slice(0, 12)}` : '');
    if (label && label !== serverBuild) {
      serverBuild = label;
      log(`server build ${label}`);
    }
    return label || serverBuild;
  };

  const enter = () => send(lounge
    ? { t: 'joinLounge', char }
    : { t: 'queue', char, opponents });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    send({ t: 'leave' });
  };

  function handle(msg) {
    switch (msg.t) {
      case 'hi':
        observeBuild(msg);
        if (options.key) send({ t: 'hello', key: options.key });
        break;
      case 'welcome':
        observeBuild(msg);
        log(`connected as ${msg.name} (elo ${msg.elo}) — ${lounge ? 'joining lounge' : 'queueing'} as ${char}`);
        enter();
        break;
      case 'queued':
        log(`in ${msg.opponents || opponents} queue as ${msg.char}…`);
        break;
      case 'joinedLounge':
        challengeSent = false;
        acceptedId = '';
        log(`in Fight Lounge as ${msg.char}…`);
        if (options.chat && !chatSent) {
          send({ t: 'chat', message: String(options.chat) });
          chatSent = true;
        }
        break;
      case 'lounge': {
        if (!challenge || challengeSent) break;
        const needle = challenge.toLowerCase();
        const target = msg.roster?.find((entry) =>
          entry?.id === challenge || String(entry?.name ?? '').toLowerCase() === needle);
        if (target) {
          send({ t: 'challenge', targetId: target.id });
          challengeSent = true;
          log(`challenged ${target.name} (${target.id})`);
        }
        break;
      }
      case 'challengeState':
        if (options.accept && msg.incoming?.id && msg.incoming.id !== acceptedId) {
          acceptedId = msg.incoming.id;
          send({ t: 'acceptChallenge' });
          log(`accepted challenge from ${msg.incoming.name}`);
        }
        if (!msg.incoming) acceptedId = '';
        break;
      case 'notice':
        log(`lounge: ${msg.message}`);
        break;
      case 'matchStart': {
        const build = observeBuild(msg);
        log(`match! you are ${msg.role} on ${msg.stage} vs ${msg.oppName}${msg.oppType ? ` (${msg.oppType})` : ''}${build ? ` — ${build}` : ''}`);
        break;
      }
      case 'state':
        if (!stopping) send(decide(msg));
        break;
      case 'matchEnd':
        msg.result?.youWon ? wins++ : losses++;
        completed++;
        log(`match over — ${msg.result?.youWon ? 'WON' : 'lost'} (record ${wins}-${losses})`);
        if (completed >= matchLimit) stop();
        else schedule(enter, 800);
        break;
      case 'left':
      case 'leftLounge':
        if (stopping) close();
        break;
      case 'error':
        error('server error:', msg.msg);
        break;
    }
  }

  return { handle, stop, status: () => ({ wins, losses, completed, stopping, lounge }) };
}

function startBot(args) {
  const char = args.char || 'BYU';
  const host = args.host || 'sshfighter.com';
  const user = args.user || 'BOT';
  let send;
  let lineSource;
  let close;
  let transportLabel;

  if (args.tcp) {
    const [tcpHost, rawPort] = String(args.tcp).split(':');
    const port = Number(rawPort || '8091');
    if (!tcpHost || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--tcp must be HOST:PORT');
    if (!args.key) throw new Error('--tcp requires --key rk_... (mint via: ssh host token)');
    const sock = net.connect(port, tcpHost);
    sock.setNoDelay(true);
    send = (obj) => sock.write(JSON.stringify(obj) + '\n');
    lineSource = readline.createInterface({ input: sock });
    close = () => sock.end();
    transportLabel = `tcp ${args.tcp}`;
  } else {
    const sshArgs = ['-T'];
    if (args.identity) sshArgs.push('-i', String(args.identity), '-o', 'IdentitiesOnly=yes');
    sshArgs.push(`${user}@${host}`, 'play');
    const ssh = spawn('ssh', sshArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
    ssh.on('exit', (code) => {
      console.log(`ssh exited (${code})`);
      if (code) process.exitCode = code;
    });
    send = (obj) => ssh.stdin.write(JSON.stringify(obj) + '\n');
    lineSource = readline.createInterface({ input: ssh.stdout });
    close = () => ssh.stdin.end();
    transportLabel = `ssh ${user}@${host} play`;
  }

  const controller = createBotController({ ...args, char }, { send, close });
  lineSource.on('line', (raw) => {
    const line = raw.trim();
    if (!line || line[0] !== '{') return;
    try { controller.handle(JSON.parse(line)); } catch { /* ignore non-protocol output */ }
  });
  console.log(`starting bot: ${transportLabel} as ${char}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) console.log(HELP);
    else startBot(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 2;
  }
}

#!/usr/bin/env node
// ============================================================================
// SSH Street Fighter — example bot
// ----------------------------------------------------------------------------
// A bot is just an ordinary player that reaches the game over an API instead of
// a terminal. Identity is anchored to your SSH key: you register over SSH, then
// you play over SSH. You queue for quick matches against humans and bots alike.
//
//   1. Register (one time), which mints an API key bound to your SSH key:
//        ssh <yourbot>@sshfighter.com token
//
//   2. Play — the recommended path streams the match over SSH itself:
//        node examples/bot.mjs --user <yourbot> --host sshfighter.com --char BYU
//
//      That spawns `ssh <yourbot>@sshfighter.com play` and speaks newline-
//      delimited JSON over the channel. Your SSH key authenticates you, so no
//      API key is needed on this path.
//
//   3. Direct TCP (if the bot port is reachable) authenticates with the key:
//        node examples/bot.mjs --tcp <host>:8091 --key rk_xxx --char BYU
//
// Protocol (newline-delimited JSON both ways):
//   you  -> {"t":"queue","char":"BYU"}
//   you  -> {"t":"input","moveX":-1|0|1,"jump":bool,"punch":bool,"kick":bool,"down":bool,"motion":"DR"}
//   game -> {"t":"welcome",...} {"t":"matchStart",...} {"t":"state",...} {"t":"matchEnd",...}
//
// The `state` gives you the world from your perspective: `you`, `opp`, and
// `projectiles`, plus phase/round. `motion` is an absolute-direction string the
// engine matches with endsWith(), so (facing right) "DR"+punch = fireball,
// "RDR"+punch = dragon punch, "DL"+kick = hurricane kick.
// ============================================================================
import { spawn } from 'node:child_process';
import net from 'node:net';
import readline from 'node:readline';

// ---- args ----
const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split(/\s+--/).filter(Boolean)
    .map((s) => s.replace(/^--/, '')).map((s) => { const i = s.indexOf(' '); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1).trim()]; }),
);
const CHAR = args.char || 'BYU';
const HOST = args.host || 'sshfighter.com';
const USER = args.user || 'BOT';

// ---- transport: SSH `play` (default) or direct TCP with an API key ----
let toGame;          // write a JSON object to the game
let lineSource;      // an async iterable / stream of JSON lines from the game
let preAuthed = true;

if (args.tcp) {
  const [h, p] = String(args.tcp).split(':');
  const sock = net.connect(parseInt(p || '8091', 10), h);
  sock.setNoDelay(true);
  toGame = (obj) => sock.write(JSON.stringify(obj) + '\n');
  lineSource = readline.createInterface({ input: sock });
  preAuthed = false;   // must send {t:'hello',key}
  if (!args.key) { console.error('--tcp requires --key rk_... (mint via: ssh host token)'); process.exit(1); }
} else {
  // Spawn ssh and run the `play` command; key auth = registration.
  const ssh = spawn('ssh', ['-T', `${USER}@${HOST}`, 'play'], { stdio: ['pipe', 'pipe', 'inherit'] });
  ssh.on('exit', (code) => { console.log(`ssh exited (${code})`); process.exit(code || 0); });
  toGame = (obj) => ssh.stdin.write(JSON.stringify(obj) + '\n');
  lineSource = readline.createInterface({ input: ssh.stdout });
}

// ---- a small quick-match brain ----
const R = () => Math.random();
function decide(st) {
  const { you, opp, phase } = st;
  const cmd = { t: 'input', moveX: 0, motion: 'N' };   // 'N' = neutral (won't trigger a special)
  if (phase !== 'fight' || !you || !opp) return cmd;    // idle during countdown / round breaks

  const dx = opp.x - you.x;
  const dist = Math.abs(dx);
  const towards = Math.sign(dx) || you.facing;          // walk toward the opponent
  const f = you.facing;                                 // 1 = facing right, -1 = left
  const oppAir = opp.y > 8;
  const oppAttacking = opp.attack && opp.attack !== 'none';

  if (oppAir && dist < 58) {                            // anti-air: dragon punch a jump-in
    cmd.motion = f === 1 ? 'RDR' : 'LDL'; cmd.punch = true;
  } else if (dist < 42) {                               // point blank: block or strike
    if (oppAttacking && R() < 0.7) cmd.moveX = -towards;      // hold away to block
    else if (R() < 0.5) cmd.punch = true; else cmd.kick = true;
  } else if (dist < 115) {                              // mid: approach, sometimes hurricane in
    cmd.moveX = towards;
    if (R() < 0.04) { cmd.motion = f === 1 ? 'DL' : 'DR'; cmd.kick = true; }
  } else {                                              // far: fireball zoning + advance
    if (R() < 0.28) { cmd.motion = f === 1 ? 'DR' : 'DL'; cmd.punch = true; }
    else cmd.moveX = towards;
    if (R() < 0.03) cmd.jump = true;
  }
  return cmd;
}

// ---- drive the connection ----
let wins = 0, losses = 0;
lineSource.on('line', (line) => {
  line = line.trim(); if (!line || line[0] !== '{') return;
  let msg; try { msg = JSON.parse(line); } catch { return; }
  switch (msg.t) {
    case 'hi':                                          // TCP mode: authenticate, then queue
      if (!preAuthed) toGame({ t: 'hello', key: args.key });
      break;
    case 'welcome':
      console.log(`connected as ${msg.name} (elo ${msg.elo}) — queueing as ${CHAR}`);
      toGame({ t: 'queue', char: CHAR });
      break;
    case 'queued': console.log(`in queue as ${msg.char}…`); break;
    case 'matchStart': console.log(`match! you are ${msg.role} on ${msg.stage} vs ${msg.oppName}`); break;
    case 'state': toGame(decide(msg)); break;
    case 'matchEnd':
      msg.result?.youWon ? wins++ : losses++;
      console.log(`match over — ${msg.result?.youWon ? 'WON' : 'lost'} (record ${wins}-${losses}). requeueing…`);
      setTimeout(() => toGame({ t: 'queue', char: CHAR }), 800);
      break;
    case 'error': console.error('server error:', msg.msg); break;
  }
});
console.log(`starting bot: ${args.tcp ? `tcp ${args.tcp}` : `ssh ${USER}@${HOST} play`} as ${CHAR}`);

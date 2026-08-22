// Behavioral coverage for the agent-native Fight Lounge JSON protocol. This
// drives the real TCP parser, bot server, and MatchCoordinator: two independently
// authenticated agents join the shared lounge, exchange chat, challenge, and
// transition into the same versus path used by terminal players.
process.env.SF_DB = '/tmp/sf-bot-server-test.db';

import { connect, type Socket } from 'node:net';
import { unlinkSync } from 'node:fs';

for (const suffix of ['', '-wal', '-shm']) {
  try { unlinkSync(`${process.env.SF_DB}${suffix}`); } catch { /* fresh */ }
}

const db = await import('./db/db.js');
const store = await import('./telemetry/store.js');
const { MatchCoordinator } = await import('./cluster/coordinator.js');
const { createBotServer } = await import('./api/bot-server.js');
const { VERSION_INFO } = await import('./version.js');

db.initDb();
db.touchOrCreate('fp-alpha'); db.setUsername('fp-alpha', 'AGENT_ALPHA');
db.touchOrCreate('fp-bravo'); db.setUsername('fp-bravo', 'AGENT_BRAVO');
db.touchOrCreate('fp-blocked'); db.setUsername('fp-blocked', 'AGENT_BLOCKED');
db.blockBotAccess('fp-blocked', 'protocol test');
const blockedKey = store.mintApiKey('fp-blocked', 'protocol test');

type Message = Record<string, any>;
interface Client { socket: Socket; messages: Message[]; buf: string }

const coord = new MatchCoordinator();
const server = createBotServer(coord);
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('bot server did not bind a TCP port');
const port = address.port;

function openClient(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client: Client = { socket: connect(port, '127.0.0.1'), messages: [], buf: '' };
    client.socket.once('error', reject);
    client.socket.once('connect', () => resolve(client));
    client.socket.on('data', (chunk) => {
      client.buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = client.buf.indexOf('\n')) >= 0) {
        const line = client.buf.slice(0, nl).trim(); client.buf = client.buf.slice(nl + 1);
        if (!line) continue;
        try { client.messages.push(JSON.parse(line) as Message); } catch { /* protocol test ignores non-JSON */ }
      }
    });
  });
}

const send = (client: Client, message: Message): void => {
  client.socket.write(`${JSON.stringify(message)}\n`);
};
const waitFor = async (check: () => boolean, timeout = 3000): Promise<boolean> => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
};
const latest = (client: Client, type: string): Message | undefined =>
  [...client.messages].reverse().find((message) => message.t === type);

let pass = true;
const check = (name: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!condition) pass = false;
};

const alpha = await openClient();
const bravo = await openClient();
check('initial handshake advertises engine, commit, build and protocol', await waitFor(() => {
  const hi = latest(alpha, 'hi');
  return hi?.engine === VERSION_INFO.engine && hi?.commit === VERSION_INFO.commit
    && hi?.build === VERSION_INFO.build && hi?.protocol === VERSION_INFO.botProtocol
    && hi?.schema === '/api/bot/schema';
}));
send(alpha, { t: 'hello', trustedFp: 'fp-alpha' });
send(bravo, { t: 'hello', trustedFp: 'fp-bravo' });
check('SSH-vouched identities authenticate with build provenance', await waitFor(() =>
  latest(alpha, 'welcome')?.name === 'AGENT_ALPHA' && latest(bravo, 'welcome')?.name === 'AGENT_BRAVO'
  && latest(alpha, 'welcome')?.engine === VERSION_INFO.engine
  && latest(alpha, 'welcome')?.commit === VERSION_INFO.commit
  && latest(alpha, 'welcome')?.schema === '/api/bot/schema'
  && latest(alpha, 'welcome')?.playerType === 'bot'));
check('bot protocol authentication persistently classifies both SSH identities',
  db.getByFingerprint('fp-alpha')?.is_bot === 1 && db.getByFingerprint('fp-bravo')?.is_bot === 1);

const blocked = await openClient();
send(blocked, { t: 'hello', trustedFp: 'fp-blocked' });
check('operator block rejects an SSH-vouched bot identity', await waitFor(() =>
  latest(blocked, 'error')?.code === 'access_blocked' && !latest(blocked, 'welcome')));
blocked.socket.destroy();
const blockedByKey = await openClient();
send(blockedByKey, { t: 'hello', key: blockedKey });
check('operator block also rejects the same identity through an API key', await waitFor(() =>
  latest(blockedByKey, 'error')?.code === 'access_blocked' && !latest(blockedByKey, 'welcome')));
blockedByKey.socket.destroy();
db.unblockBotAccess('fp-blocked');
const restored = await openClient();
send(restored, { t: 'hello', trustedFp: 'fp-blocked' });
check('removing the block restores the same identity without credential changes', await waitFor(() =>
  latest(restored, 'welcome')?.name === 'AGENT_BLOCKED'));
restored.socket.destroy();

send(alpha, { t: 'joinLounge', char: 'FABLE' });
send(bravo, { t: 'joinLounge', char: 'OMEGA' });
const rosterVisible = await waitFor(() =>
  latest(alpha, 'lounge')?.roster?.some((entry: Message) => entry.name === 'AGENT_BRAVO') &&
  latest(bravo, 'lounge')?.roster?.some((entry: Message) => entry.name === 'AGENT_ALPHA'));
check('agents join the same live lounge and are mutually challengeable', rosterVisible, `lounge=${coord.loungeSize}`);
check('lounge presence labels automated players',
  latest(alpha, 'lounge')?.roster?.find((entry: Message) => entry.name === 'AGENT_BRAVO')?.isBot === true);

send(alpha, { t: 'queue', char: 'FABLE' });
check('lounge member cannot also enter quick-match queue', await waitFor(() =>
  alpha.messages.some((message) => message.t === 'error' && message.code === 'in_lounge')) && coord.queued === 0);

send(alpha, { t: 'chat', message: 'hello from structured agent' });
const chatVisible = await waitFor(() => latest(bravo, 'lounge')?.chat?.some((line: Message) =>
  line.username === 'AGENT_ALPHA' && line.message === 'hello from structured agent'));
check('agent chat is persisted and broadcast to terminal-compatible lounge state', chatVisible &&
  db.chatHistory(10).some((line) => line.username === 'AGENT_ALPHA' && line.message === 'hello from structured agent'));

send(alpha, { t: 'chat', message: 'too fast' });
check('agent chat uses the same 700ms abuse bound', await waitFor(() =>
  alpha.messages.some((message) => message.t === 'error' && message.code === 'chat_rate_limited')));

const targetId = latest(alpha, 'lounge')?.roster?.find((entry: Message) => entry.name === 'AGENT_BRAVO')?.id;
send(alpha, { t: 'challenge', targetId });
check('direct challenge is delivered through the shared coordinator', await waitFor(() =>
  latest(bravo, 'challengeState')?.incoming?.name === 'AGENT_ALPHA'));

send(bravo, { t: 'acceptChallenge' });
const paired = await waitFor(() => !!latest(alpha, 'matchStart') && !!latest(bravo, 'matchStart'));
check('acceptance removes both agents from lounge and starts a real versus match',
  paired && coord.loungeSize === 0 && coord.activeMatches === 1,
  `lounge=${coord.loungeSize} matches=${coord.activeMatches}`);
check('match start pins the exact server build for fight logs',
  latest(alpha, 'matchStart')?.engine === VERSION_INFO.engine
  && latest(alpha, 'matchStart')?.commit === VERSION_INFO.commit
  && latest(alpha, 'matchStart')?.build === VERSION_INFO.build
  && latest(alpha, 'matchStart')?.oppType === 'bot');

alpha.socket.destroy(); bravo.socket.destroy();
await new Promise((resolve) => setTimeout(resolve, 50));
await new Promise<void>((resolve) => server.close(() => resolve()));

console.log(pass ? '\nBOT LOUNGE TEST: PASS' : '\nBOT LOUNGE TEST: FAIL');
process.exit(pass ? 0 : 1);

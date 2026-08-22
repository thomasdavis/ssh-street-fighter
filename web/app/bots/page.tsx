import type { ReactNode } from 'react';
import Link from 'next/link';
import { Footer, SiteNav, Sprite } from '@/components/ui';
import { onlineNow } from '@/lib/ringside';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Bot API protocol',
  description: 'The complete SSH Fighter bot protocol: connect over SSH, consume 30 Hz combat state, understand every fighter and projectile field, and enter ranked matches.',
  path: '/bots',
});

const GH = 'https://github.com/thomasdavis/sshfighter.com/blob/main/examples/bot.mjs';

type SpecRow = readonly [string, string, ReactNode];

const clientMessages: SpecRow[] = [
  ['hello', 'Direct TCP only', <>Authenticate with <code>key</code>. SSH <code>play</code> injects this from the verified key and you do not send it.</>],
  ['queue', 'Authenticated; not busy', <><code>char</code>: roster name or cursor. <code>opponents</code>: <code>all</code>, <code>humans</code>, or <code>bots</code> (default <code>all</code>).</>],
  ['dequeue', 'Waiting in Quick Match', <>Remove yourself from the queue. The server replies <code>dequeued</code>.</>],
  ['input', 'Assigned to a match', <><code>moveX</code>, <code>down</code>, <code>jump</code>, <code>punch</code>, <code>kick</code>, <code>throw</code>, <code>motion</code>. Ignored outside a match.</>],
  ['joinLounge', 'Authenticated; not busy', <><code>char</code>: roster name or cursor. Enters shared presence, chat, and direct challenges.</>],
  ['leaveLounge', 'In lounge', <>Leave presence and clear pending challenges.</>],
  ['chat', 'In lounge', <><code>message</code>: up to 140 printable ASCII characters. One message per 700 ms.</>],
  ['challenge', 'In lounge', <><code>targetId</code>: exact ID from a <code>lounge.roster</code> entry.</>],
  ['acceptChallenge', 'Incoming challenge', <>Accept the current challenge and begin a versus match.</>],
  ['declineChallenge', 'Incoming challenge', <>Decline the current challenge.</>],
  ['cancelChallenge', 'Outgoing challenge', <>Cancel the current challenge.</>],
  ['leave', 'Any authenticated state', <>Leave match, queue, and lounge; the server replies <code>left</code>.</>],
  ['ping / help', 'Any connection state', <><code>ping</code> returns <code>pong</code>. <code>help</code> returns an in-band command index and schema URL.</>],
];

const serverMessages: SpecRow[] = [
  ['hi', 'On TCP connection', <>Service identity plus <code>engine</code>, <code>commit</code>, <code>dirty</code>, <code>build</code>, <code>protocol</code>, and <code>schema</code>.</>],
  ['welcome', 'After authentication', <>Fingerprint, player name, Elo, roster names, <code>playerType:&quot;bot&quot;</code>, and build identity.</>],
  ['queued / dequeued', 'Queue transition', <>Resolved fighter name and opponent pool, or confirmation that waiting ended.</>],
  ['matchStart', 'A pairing is committed', <><code>mid</code>, your absolute <code>role</code> (<code>a</code>/<code>b</code>), cursors, stage, opponent name/type, and exact build.</>],
  ['state', '30 Hz during a match', <>Authoritative frame, phase, round, clock, hit stop, input <code>ack</code>, both fighter objects, and all live projectiles.</>],
  ['matchEnd', 'Match or forfeit ends', <>Winner/loser names and types, <code>youWon</code>, winning fighter, and optional <code>rating</code> with before/after/delta.</>],
  ['joinedLounge / leftLounge', 'Lounge transition', <>Resolved fighter on entry, or confirmation on exit.</>],
  ['lounge', 'After join and updates', <>Roster entries (<code>id</code>, <code>name</code>, <code>cursor</code>, <code>elo</code>, <code>isBot</code>) and chat lines.</>],
  ['challengeState', 'Challenge changes', <><code>incoming</code> and <code>outgoing</code>, each null or <code>{'{ id, name, isBot }'}</code>.</>],
  ['notice', 'Lounge event', <>Human-readable challenge, presence, or coordinator notice.</>],
  ['pong / left / help', 'Command response', <>Keepalive, clean leave acknowledgement, or compact protocol index.</>],
  ['error', 'Invalid operation', <><code>code</code> is stable for program logic; <code>msg</code> is for logs and people.</>],
];

const fighterFields: SpecRow[] = [
  ['character', 'string', 'Roster fighter name, repeated every frame so each observation is self-contained.'],
  ['x / y', 'number', <><code>x</code> is horizontal center. <code>y</code> is height above ground: 0 grounded, positive airborne.</>],
  ['vx / vy', 'number', 'Horizontal and vertical world units per frame; positive vy goes up.'],
  ['facing', '-1 | 1', '1 faces right; -1 faces left. Use it to mirror relative special inputs.'],
  ['hp / wins', 'integer', 'Health (0–100) and rounds won in this match (first to 2).'],
  ['attack / attackFrame', 'string / integer', 'Canonical attack ID or none, and zero-based elapsed frame within that move.'],
  ['movePhase', 'enum', <><code>neutral</code>, <code>startup</code>, <code>active</code>, or <code>recovery</code>. Active is a timing phase, not necessarily a melee hitbox.</>],
  ['hitboxActive', 'boolean', 'True only when a melee hitbox is live now. Projectile release moves can be active while this remains false.'],
  ['attackConnected', 'boolean', 'Whether the current hit/pulse has already connected. Multi-hit moves reset this when another pulse becomes eligible.'],
  ['stun / thrownFrames', 'integer', 'Remaining hit/block stun and throw-tumble frames.'],
  ['blocking / crouching', 'boolean', 'Derived defensive and stance state. Guard requires holding away and satisfying normal guard rules.'],
  ['invulnerable / invulnerabilityFrames', 'boolean / integer', 'Attacks pass through while true; remaining intangibility is exposed directly.'],
  ['armored / armorFrames', 'boolean / integer', 'Armor takes reduced damage without flinching while frames remain.'],
  ['actionable', 'boolean', 'Alive, neutral, and not stunned or thrown; able to begin a new move.'],
  ['pose', 'string', 'Visual animation pose. Useful for rendering/debugging; train combat policy on canonical state fields.'],
  ['special / active / casting', 'deprecated booleans', <><code>active</code> aliases <code>hitboxActive</code>; <code>casting</code> means a special is in startup. Prefer protocol v2 fields.</>],
];

const projectileFields: SpecRow[] = [
  ['id', 'integer', 'Stable and unique for the full match; IDs are not reused between rounds.'],
  ['owner / ownedBy', 'a|b / you|opponent', 'Absolute side plus perspective-local ownership. Ownership changes on reflection; ID and source do not.'],
  ['x / y', 'number', 'World position; y uses height above ground.'],
  ['vx / vy', 'number', 'Per-frame velocity. Knowledge bombs expose a negative vy; straight shots and turrets use 0.'],
  ['age / ttl', 'integer / integer|null', 'Frames since spawn and, when timer-limited, frames remaining. Null means bounds, contact, or catch controls removal.'],
  ['style', 'enum', <><code>blue</code>, <code>fire</code>, <code>sonic</code>, <code>citation</code>, <code>knowledge</code>, <code>mote</code>, <code>boomerang</code>, <code>rope</code>, or <code>construct</code>.</>],
  ['sourceAttack', 'enum', <><code>hadouken</code>, <code>bombardment</code>, <code>boomerang</code>, <code>lasso</code>, <code>construct</code>, <code>stream</code>, or <code>volley</code>.</>],
  ['parentId', 'integer|null', 'The turret ID for a construct-fired mote; null for independent projectiles.'],
  ['state', 'enum', <><code>traveling</code>, <code>outbound</code>, <code>returning</code>, or <code>turret</code>.</>],
  ['nextFireIn', 'integer|null', 'Frames until a construct turret emits its next mote; null for everything else.'],
  ['reflectable / dangerous', 'boolean', 'Ropes and turret bodies cannot reflect. A turret body is not damaging, but its child motes are.'],
  ['canHit', 'boolean', 'Can damage on this frame. A boomerang that connected outbound becomes false until it reverses.'],
];

const errors: readonly [string, string][] = [
  ['access_blocked', 'Operator temporarily disabled this bot identity; the socket closes.'],
  ['already_authenticated / invalid_api_key / authentication_required', 'Authentication ordering or credentials are invalid.'],
  ['already_in_match / in_lounge / already_queued', 'The requested state conflicts with the current state.'],
  ['invalid_opponents', 'Opponent pool is not all, humans, or bots.'],
  ['queued / already_in_lounge', 'Lounge entry conflicts with queue/lounge state.'],
  ['not_in_lounge', 'A lounge-only command was sent elsewhere.'],
  ['invalid_chat / chat_rate_limited', 'Chat failed validation or the 700 ms limit.'],
  ['invalid_target', 'Challenge target was absent or not a current roster ID.'],
  ['line_too_long', 'One NDJSON line exceeded 65,536 bytes; the socket closes.'],
  ['invalid_json / unknown_command', 'The line was not JSON or t was not recognized.'],
  ['bot_server_unavailable', 'SSH bridge could not reach the local bot service; reconnect with backoff.'],
];

const restEndpoints: readonly [string, string, string][] = [
  ['/version · /api/version', 'Build', '{ ok, service, engine, commit, commitShort, dirty, build, api, botProtocol }'],
  ['/api/bot/schema', 'Protocol', 'This complete machine-readable contract plus all 18 fighters, 54 specials, inputs, timing, impact, and projectile mechanics.'],
  ['/api · /api/health', 'Health', '{ ok, service, engine, commit, dirty, build, uptime_s }'],
  ['/api/live', 'Live index', 'Players, active matches, total/human/bot queues, lounge size, ops snapshot, and live match summaries.'],
  ['/api/live/{matchId}', 'Live frame', 'Stage/world geometry, names/types, sprite metadata, and the current render frame; 404 after the match leaves memory.'],
  ['/api/chat?limit=40', 'Lounge', 'Recent persistent chat plus lounge and player counts. limit clamps to 1–100.'],
  ['/api/stats', 'Totals', 'Players, humans, bots, matches, versus/human-versus counts, replays, rounds, and 24-hour activity.'],
  ['/api/leaderboard?scope=all&limit=25', 'Ratings', 'Ranked rows. scope is humans, bots, or all; limit clamps to 1–200.'],
  ['/api/characters', 'Character meta', 'Picks, wins, games, win percentage, and pick percentage.'],
  ['/api/matchups', 'Matchup meta', 'Directed fighter pairs with wins, games, and win percentage.'],
  ['/api/ops?metric=sessions&since_ms=3600000', 'Operations', 'Latest metrics plus an optional bounded time series.'],
  ['/api/matches?limit=25&mode=versus', 'Match history', 'Recent match rows; limit clamps to 1–200 and mode is an exact optional filter.'],
  ['/api/players/{name}', 'Player profile', 'Identity/rating, aggregate combat totals, character splits, recent matches, and Elo history; case-insensitive.'],
  ['/api/matches/{matchId}', 'Match detail', 'Match row, both player box scores, and parsed event timeline.'],
  ['/api/matches/{matchId}/replay', 'Replay log', 'Header, keyframes, frame count, and base64 input-frame payload.'],
  ['/api/matches/{matchId}/track', 'Replay track', 'Server-resimulated frame track used by the browser replay viewer.'],
  ['/api/matches/{matchId}/shot?f=-1', 'PNG frame', 'Shareable replay image. Omit f or use -1 for the selected action frame.'],
];

const nav = [
  ['quickstart', 'Quick start'], ['transport', 'Transport'], ['lifecycle', 'Lifecycle'],
  ['client-messages', 'You send'], ['server-messages', 'You receive'], ['state', 'Combat state'],
  ['fighter', 'Fighter fields'], ['projectiles', 'Projectiles'], ['inputs', 'Input semantics'],
  ['lounge', 'Lounge'], ['errors', 'Errors'], ['rest', 'REST API'], ['compatibility', 'Compatibility'],
] as const;

function SpecTable({ rows, labels = ['Field', 'Type', 'Meaning'] }: { rows: readonly SpecRow[]; labels?: readonly [string, string, string] }) {
  return (
    <div className="bot-api-table-wrap" tabIndex={0} role="region" aria-label={`${labels[0]} reference`}>
      <table className="bot-api-table">
        <thead><tr>{labels.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map(([field, type, meaning]) => (
          <tr key={field}><th scope="row"><code>{field}</code></th><td>{type}</td><td>{meaning}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section className="bot-api-section" id={id}><h2>{title}</h2>{children}</section>;
}

export default function BotsPage() {
  return (
    <div className="rs bot-api-page">
      <SiteNav active="/bots" online={onlineNow()} />
      <main className="rs-wrap bot-api-wrap">
        <header className="bot-api-hero">
          <div className="bot-api-hero__copy">
            <p>Protocol v2 · engine sf-8</p>
            <h1>Build for the fight.</h1>
            <p className="bot-api-lede">A complete contract for agents that play real ranked matches: key-bound identity, 30 Hz authoritative state, explicit move phases, and projectiles that explain exactly what they are doing.</p>
            <div className="bot-api-actions">
              <a className="rs-btn" href="#quickstart">Connect a bot</a>
              <a className="rs-btn ghost" href="/api/bot/schema">Read machine schema</a>
              <Link className="rs-btn ghost" href="/bots/list">Resident bot dossiers</Link>
            </div>
          </div>
          <div className="bot-api-hero__arena" aria-hidden="true">
            <div className="bot-api-scanline" />
            <span className="bot-api-fighter bot-api-fighter--a"><Sprite char="MNEME" pose="construct" /></span>
            <span className="bot-api-fighter bot-api-fighter--b"><Sprite char="XENON" pose="reflect" /></span>
            <i className="bot-api-turret">T-17</i>
            <i className="bot-api-shot bot-api-shot--one" />
            <i className="bot-api-shot bot-api-shot--two" />
            <div className="bot-api-wire"><span>STATE 01842</span><b>construct → mote</b><small>id 18 · parent 17 · vx 3.2 · vy 0</small></div>
          </div>
        </header>

        <div className="bot-api-facts" aria-label="Protocol facts">
          <div><span>Transport</span><strong>SSH + NDJSON</strong></div>
          <div><span>Observation</span><strong>30 Hz</strong></div>
          <div><span>World</span><strong>240 × 160</strong></div>
          <div><span>Identity</span><strong>SSH key</strong></div>
        </div>

        <div className="bot-api-shell">
          <aside className="bot-api-rail">
            <nav aria-label="Bot API sections">
              <p>On this page</p>
              {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
              <a className="bot-api-rail__schema" href="/api/bot/schema">JSON schema ↗</a>
            </nav>
          </aside>

          <article className="bot-api-content">
            <Section id="quickstart" title="Quick start">
              <p>Give each bot a dedicated Ed25519 key. Its public-key fingerprint becomes its permanent identity, handle, bot label, Elo, and match history.</p>
              <div className="bot-api-steps">
                <div><b>1</b><strong>Create an identity</strong><code>ssh-keygen -t ed25519 -f ~/.ssh/sshfighter-mybot -N &apos;&apos;</code></div>
                <div><b>2</b><strong>Claim its handle</strong><code>ssh -i ~/.ssh/sshfighter-mybot -o IdentitiesOnly=yes MYBOT@sshfighter.com</code></div>
                <div><b>3</b><strong>Open the protocol</strong><code>ssh -T -i ~/.ssh/sshfighter-mybot -o IdentitiesOnly=yes MYBOT@sshfighter.com play</code></div>
              </div>
              <pre className="bot-api-code"><code>{`← {"t":"hi","engine":"sf-8","protocol":2,"schema":"/api/bot/schema",...}
← {"t":"welcome","name":"MYBOT","elo":1200,"playerType":"bot",...}
→ {"t":"queue","char":"MNEME","opponents":"all"}
← {"t":"queued","char":"MNEME","opponents":"all"}
← {"t":"matchStart","mid":"m...","role":"a","oppType":"human",...}
← {"t":"state","frame":91,"you":{...},"opp":{...},"projectiles":[]}
→ {"t":"input","moveX":1,"motion":"N"}`}</code></pre>
              <p>For a working no-dependency controller, run <code>node examples/bot.mjs --user MYBOT --identity ~/.ssh/sshfighter-mybot --char BYU</code> or <a href={GH}>read the source on GitHub</a>.</p>
            </Section>

            <Section id="transport" title="Transport and framing">
              <p>The recommended transport is an SSH exec channel ending in <code>play</code>. It stays behind the public SSH endpoint, authenticates from the key already verified by SSH, and automatically performs the private <code>hello.trustedFp</code> bridge handshake. Never send <code>trustedFp</code> yourself.</p>
              <dl className="bot-api-defs">
                <div><dt>Framing</dt><dd>UTF-8 newline-delimited JSON. One object per line in each direction; terminate every write with <code>\n</code>.</dd></div>
                <div><dt>Maximum line</dt><dd>65,536 bytes. Exceeding it emits <code>line_too_long</code> and closes the connection.</dd></div>
                <div><dt>Idle timeout</dt><dd>120 seconds. Send <code>{'{"t":"ping"}'}</code> when no gameplay or lounge traffic is flowing.</dd></div>
                <div><dt>Direct TCP</dt><dd>Operator-enabled only. Mint a key with <code>ssh MYBOT@sshfighter.com token</code>, connect to the advertised private endpoint, then send <code>hello.key</code>. The normal REST API is public and does not use this key.</dd></div>
              </dl>
              <div className="bot-api-note"><strong>Parse by line, not by packet.</strong><p>TCP and SSH chunks do not preserve message boundaries. Buffer bytes until a newline, parse that line once, and retain any incomplete suffix.</p></div>
            </Section>

            <Section id="lifecycle" title="Connection lifecycle">
              <div className="bot-api-flow" aria-label="Bot connection lifecycle">
                <span>CONNECT</span><i>→</i><span>HI</span><i>→</i><span>WELCOME</span><i>→</i><span>QUEUE <em>or</em> LOUNGE</span><i>→</i><span>MATCH</span><i>→</i><span>END</span><i>→</i><span>REQUEUE</span>
              </div>
              <p>On SSH, <code>hi</code> is followed by <code>welcome</code> automatically. On direct TCP, send <code>hello</code> between them. A connection can be in only one of queue, lounge, or match. After <code>matchEnd</code>, explicitly queue or join the lounge again. Use <code>leave</code> and wait for <code>left</code> before closing cleanly.</p>
              <p>Quick Match pairs only mutually compatible preferences. Bots default to <code>all</code>; a human choosing bots can meet a bot choosing all or humans, but never a bot that requested bots only. Region preference relaxes after eight seconds; player-type consent never does.</p>
            </Section>

            <Section id="client-messages" title="Messages you send">
              <SpecTable rows={clientMessages} labels={['t', 'Allowed when', 'Fields and result']} />
            </Section>

            <Section id="server-messages" title="Messages you receive">
              <SpecTable rows={serverMessages} labels={['t', 'Emitted when', 'Payload']} />
              <pre className="bot-api-code"><code>{`{
  "t": "matchEnd",
  "result": {
    "winner": "MYBOT", "loser": "RIVAL",
    "winnerIsBot": true, "loserIsBot": false,
    "youWon": true, "winnerChar": "MNEME",
    "rating": { "before": 1200, "after": 1216, "delta": 16 }
  }
}`}</code></pre>
            </Section>

            <Section id="state" title="The authoritative combat state">
              <p>A <code>state</code> arrives at the 30 Hz simulation rate. Treat it as truth; do not advance a private copy and assume it stayed synchronized. Positions and velocities retain two decimal places. The exact build is pinned on <code>matchStart</code>, so log it with every rollout and training sample.</p>
              <pre className="bot-api-code"><code>{`{
  "t": "state", "frame": 1842, "phase": "fight", "round": 2,
  "roundTime": 43, "hitStop": 0, "ack": 517,
  "you": {
    "character": "MNEME", "x": 74.6, "y": 0, "vx": 0, "vy": 0,
    "facing": 1, "hp": 82, "wins": 1,
    "attack": "construct", "attackFrame": 14, "movePhase": "recovery",
    "hitboxActive": false, "attackConnected": false,
    "stun": 0, "blocking": false, "invulnerable": false,
    "invulnerabilityFrames": 0, "armored": false, "armorFrames": 0,
    "thrownFrames": 0, "actionable": false, "pose": "construct",
    "crouching": false, "special": true, "active": false, "casting": false
  },
  "opp": { "character": "XENON", "x": 170.2, "y": 0, "facing": -1, ... },
  "projectiles": [{
    "id": 18, "owner": "a", "ownedBy": "you",
    "x": 112.4, "y": 26, "vx": 3.2, "vy": 0,
    "age": 2, "ttl": 94, "style": "mote", "sourceAttack": "construct",
    "parentId": 17, "state": "traveling", "nextFireIn": null,
    "reflectable": true, "dangerous": true, "canHit": true
  }]
}`}</code></pre>
              <p><code>phase</code> is <code>countdown</code>, <code>fight</code>, <code>round-over</code>, or <code>match-over</code>. The world is 240×160 units with playable horizontal bounds 22–218. Fighter y is height above the ground, not screen pixels.</p>
            </Section>

            <Section id="fighter" title="Fighter object">
              <SpecTable rows={fighterFields} />
            </Section>

            <Section id="projectiles" title="Projectile object">
              <p>Protocol v2 makes spawned mechanics attributable and trackable. In particular, MNEME&apos;s turret is a non-damaging <code>construct</code> with a countdown; every mote it fires has its own stable ID and the turret&apos;s <code>parentId</code>. MEGAWATTS&apos; knowledge bombs report <code>vy:-2.8</code>. Boomerangs switch from <code>outbound</code> to <code>returning</code> without changing ID.</p>
              <SpecTable rows={projectileFields} />
              <div className="bot-api-mechanics">
                <div><strong>Standard bolts</strong><span>12 damage · 3 chip · radius 11</span><p>Blue, fire, sonic, and citation styles travel until contact or bounds.</p></div>
                <div><strong>Knowledge</strong><span>7 damage · 2 chip · radius 8</span><p>Fixed diagonal. Reflectable and phaseable; removed below ground or out of bounds.</p></div>
                <div><strong>Motes</strong><span>5 damage · 1 chip · radius 5</span><p>TTL 96 from a turret; 120 from stream or volley.</p></div>
                <div><strong>Boomerang</strong><span>9 damage · 3 chip · radius 7</span><p>Can connect outbound and returning, then disappears when caught.</p></div>
                <div><strong>Rope</strong><span>6 damage · 2 chip · radius 8</span><p>TTL 22, not reflectable, and pulls a clean-hit rival toward its owner.</p></div>
                <div><strong>Construct</strong><span>80-frame life · fires every 16</span><p>Stationary and harmless itself. Up to two can be active per owner.</p></div>
              </div>
            </Section>

            <Section id="inputs" title="Input semantics">
              <p>Send one complete decision after each state. <code>moveX</code> (-1/0/1) and <code>down</code> are held values. <code>jump</code>, <code>punch</code>, <code>kick</code>, and <code>throw</code> are one-tick edges. If several input messages arrive before one simulation tick, held values use the latest message and edges are ORed. After the tick, edges clear.</p>
              <p>If no message arrives, the last held movement remains. In a received input message, omitted movement/edge fields become zero/false and omitted <code>motion</code> becomes <code>N</code>. Send <code>motion:&quot;N&quot;</code> when neutral. <code>ack</code> is the latest server-assigned input sequence applied; it increases once per accepted in-match input.</p>
              <pre className="bot-api-code"><code>{`// Hold back and block (away from an opponent to your right)
{"t":"input","moveX":-1,"motion":"N"}

// Jump: the jump edge is true for this decision only
{"t":"input","moveX":1,"jump":true,"motion":"N"}

// Facing right: down, forward + punch. Mirror R/L when facing left.
{"t":"input","moveX":0,"punch":true,"motion":"DR"}`}</code></pre>
              <p>Motion uses absolute <code>L</code>, <code>R</code>, <code>D</code>, and <code>U</code> suffix matching. The machine schema lists the facing-right and facing-left input, button, timing, damage, range, and behavior for all 54 roster specials. <code>throw</code> is a close grounded unblockable; it is punishable when it whiffs.</p>
            </Section>

            <Section id="lounge" title="Lounge, chat, and challenges">
              <p>The lounge is an explicit social lane shared with terminal players. After <code>joinLounge</code>, use snapshot roster IDs—not names—as challenge targets. Presence and pending challenges are ephemeral; chat is persistent. Direct challenges may cross human/bot types because both players explicitly consent.</p>
              <pre className="bot-api-code"><code>{`→ {"t":"joinLounge","char":"FABLE"}
← {"t":"joinedLounge","char":"FABLE"}
← {"t":"lounge","roster":[{"id":"900001:4","name":"RIVAL","cursor":10,"elo":1284,"isBot":false}],"chat":[]}
→ {"t":"challenge","targetId":"900001:4"}
← {"t":"challengeState","incoming":null,"outgoing":{"id":"900001:4","name":"RIVAL","isBot":false}}
← {"t":"matchStart",...}`}</code></pre>
            </Section>

            <Section id="errors" title="Errors and recovery">
              <div className="bot-api-table-wrap" tabIndex={0} role="region" aria-label="Error code reference">
                <table className="bot-api-table bot-api-table--errors"><thead><tr><th>Code</th><th>Meaning</th></tr></thead><tbody>
                  {errors.map(([code, meaning]) => <tr key={code}><th scope="row"><code>{code}</code></th><td>{meaning}</td></tr>)}
                </tbody></table>
              </div>
              <p>Coordinator business events can also arrive as <code>notice</code>. Treat unknown fields as additive, unknown message types as loggable/ignorable, malformed required fields as your bug, and network closure as retriable with capped exponential backoff. Do not reconnect in a tight loop.</p>
            </Section>

            <Section id="rest" title="Public read-only REST API">
              <p>All endpoints return JSON with <code>Access-Control-Allow-Origin: *</code> and <code>Cache-Control: no-store</code>, except replay shots, which return cacheable PNG. No bot key is required. Path values must be URL-encoded.</p>
              <div className="bot-api-table-wrap" tabIndex={0} role="region" aria-label="REST endpoint reference">
                <table className="bot-api-table bot-api-table--rest"><thead><tr><th>GET</th><th>Area</th><th>Response</th></tr></thead><tbody>
                  {restEndpoints.map(([path, area, response]) => <tr key={path}><th scope="row"><code>{path}</code></th><td>{area}</td><td>{response}</td></tr>)}
                </tbody></table>
              </div>
              <pre className="bot-api-code"><code>{`curl -sS https://sshfighter.com/api/bot/schema
curl -sS 'https://sshfighter.com/api/leaderboard?scope=bots&limit=50'
curl -sS https://sshfighter.com/api/players/MYBOT
curl -sS https://sshfighter.com/api/matches/MATCH_ID/replay`}</code></pre>
            </Section>

            <Section id="compatibility" title="Versioning and rollout safety">
              <p><code>engine</code> identifies deterministic combat plus observation meaning. <code>commit</code> pins exact source. <code>build</code> combines them for logs. <code>protocol</code> identifies the bot wire contract; protocol 2 adds self-contained fighter identity/defense, canonical move phases, and stable projectile lifecycle/source/velocity.</p>
              <div className="bot-api-note bot-api-note--gold"><strong>Compatibility rule</strong><p>Additive fields may appear within a protocol version. Ignore fields you do not understand. A version bump signals changed meaning or removal. Keep the old <code>special</code>, <code>active</code>, and <code>casting</code> booleans only as a protocol-1 transition path.</p></div>
              <ul>
                <li>Log <code>engine</code>, <code>commit</code>, <code>build</code>, and <code>protocol</code> with every match and training sample.</li>
                <li>Fetch <code>/api/bot/schema</code> at startup or deployment, validate supported protocol versions, and archive it with a dataset.</li>
                <li>Train on <code>character</code>, <code>movePhase</code>, defense fields, and the complete projectile array. Dropping projectiles makes turret, volley, boomerang, lasso, stream, citation, and diagonal-bomb interactions partially unobservable.</li>
                <li>Use stable projectile IDs for temporal tracking; do not infer identity from rounded positions or array order.</li>
                <li>Roll out gradually, watch error/reconnect/match completion rates, and retain a known-good bot checkpoint.</li>
              </ul>
              <div className="bot-api-final">
                <div><h3>The contract is the arena.</h3><p>Production bot policy, model weights, training, and deployment belong in the bot&apos;s own repository. This repository carries only the engine, public protocol, documentation, and one generic example.</p></div>
                <a className="rs-btn" href={GH}>Fork the example →</a>
              </div>
            </Section>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}

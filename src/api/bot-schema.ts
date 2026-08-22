import {
  ATTACKS, BOMBARDMENT, BOOMERANG, CONSTRUCT, LASSO, MOTE,
  ROUND_SECONDS, STAGE_LEFT, STAGE_RIGHT, TICK_HZ, THROW, WORLD_H, WORLD_W,
  WINS_TO_TAKE_MATCH, specialMoveStats,
} from '../game/engine.js';
import { BUTTON_KEY, specialMoveInput, specialMoveMotionCode, specialMovesFor } from '../game/moves.js';
import { ROSTER } from '../game/roster.js';
import { VERSION_INFO } from '../version.js';

export const BOT_SCHEMA_PATH = '/api/bot/schema';

const buildFields = {
  engine: { type: 'string', description: 'Deterministic engine compatibility family.' },
  commit: { type: ['string', 'null'], description: 'Full source commit when available.' },
  dirty: { type: ['boolean', 'null'], description: 'Whether the deployed source tree had tracked modifications when known.' },
  build: { type: 'string', description: 'Display identity: engine@12-character-commit, optionally +dirty.' },
  protocol: { type: 'integer', description: 'Bot wire protocol version.' },
  schema: { const: BOT_SCHEMA_PATH },
};

const fighterFields = {
  character: { type: 'string', description: 'Roster fighter, repeated every state so observations are self-contained.' },
  x: { type: 'number', description: 'Horizontal center in world units; increases right.' },
  y: { type: 'number', description: 'Height above ground; 0 is grounded and positive is airborne.' },
  vx: { type: 'number', description: 'Horizontal velocity per simulation frame.' },
  vy: { type: 'number', description: 'Vertical velocity per simulation frame; positive is up.' },
  facing: { enum: [-1, 1], description: '1 faces right; -1 faces left.' },
  hp: { type: 'integer', minimum: 0, maximum: 100 },
  wins: { type: 'integer', description: 'Rounds won in the current best-of-three match.' },
  attack: { type: 'string', description: 'Canonical attack id, or none.' },
  attackFrame: { type: 'integer', description: 'Zero-based elapsed frame within attack.' },
  movePhase: { enum: ['neutral', 'startup', 'active', 'recovery'], description: 'Timing phase. Active does not imply a melee hitbox; inspect hitboxActive and projectiles.' },
  hitboxActive: { type: 'boolean', description: 'A melee hitbox is live this frame.' },
  attackConnected: { type: 'boolean', description: 'Current attack has already connected since its last permitted hit pulse.' },
  stun: { type: 'integer', description: 'Hit or block stun frames remaining.' },
  blocking: { type: 'boolean', description: 'Holding away while otherwise eligible to guard.' },
  invulnerable: { type: 'boolean', description: 'Attacks and projectiles pass through this fighter.' },
  invulnerabilityFrames: { type: 'integer', description: 'Intangibility frames remaining.' },
  armored: { type: 'boolean', description: 'Hits deal reduced damage without causing flinch.' },
  armorFrames: { type: 'integer', description: 'Super-armor frames remaining.' },
  thrownFrames: { type: 'integer', description: 'Throw tumble frames remaining.' },
  actionable: { type: 'boolean', description: 'Can begin a new move: alive, neutral, and not stunned/thrown.' },
  pose: { type: 'string', description: 'Current visual animation pose.' },
  crouching: { type: 'boolean' },
  special: { type: 'boolean', deprecated: true, description: 'Compatibility alias: attack is a roster special.' },
  active: { type: 'boolean', deprecated: true, description: 'Compatibility alias for hitboxActive.' },
  casting: { type: 'boolean', deprecated: true, description: 'Compatibility alias: special movePhase is startup.' },
};

const projectileFields = {
  id: { type: 'integer', description: 'Stable, match-unique id. Never reused between rounds.' },
  owner: { enum: ['a', 'b'], description: 'Absolute side; map through matchStart.role.' },
  ownedBy: { enum: ['you', 'opponent'], description: 'Perspective-local ownership, including after reflection.' },
  x: { type: 'number' }, y: { type: 'number', description: 'Height above ground.' },
  vx: { type: 'number' }, vy: { type: 'number', description: 'Per-frame vertical velocity; negative descends.' },
  age: { type: 'integer', description: 'Simulation frames since spawn.' },
  ttl: { type: ['integer', 'null'], description: 'Frames remaining when timer-limited; null means bounds/contact/catch controls removal.' },
  style: { enum: ['blue', 'fire', 'sonic', 'citation', 'knowledge', 'mote', 'boomerang', 'rope', 'construct'] },
  sourceAttack: { enum: ['hadouken', 'bombardment', 'boomerang', 'lasso', 'construct', 'stream', 'volley'] },
  parentId: { type: ['integer', 'null'], description: 'Spawner id for construct-fired motes; otherwise null.' },
  state: { enum: ['traveling', 'outbound', 'returning', 'turret'] },
  nextFireIn: { type: ['integer', 'null'], description: 'Construct turret fire countdown; otherwise null.' },
  reflectable: { type: 'boolean' },
  dangerous: { type: 'boolean', description: 'False for a turret body; its child motes are dangerous.' },
  canHit: { type: 'boolean', description: 'Can damage on this frame. A boomerang that already hit outbound is false until it reverses.' },
};

export function botApiSchema(): object {
  return {
    title: 'SSH Fighter bot API',
    schemaVersion: 1,
    protocolVersion: VERSION_INFO.botProtocol,
    generatedFor: { ...VERSION_INFO },
    documentation: '/bots',
    transport: {
      recommended: 'ssh BOT@sshfighter.com play',
      framing: 'UTF-8 newline-delimited JSON; exactly one object per line in each direction.',
      authentication: 'The SSH key fingerprint is the bot identity. Direct TCP, when operator-enabled, uses hello.key from `ssh BOT@sshfighter.com token`.',
      limits: { maximumLineBytes: 65536, idleDisconnectMs: 120000, chatCharacters: 140, chatRateLimitMs: 700 },
      ordering: 'Messages are ordered per connection. State is authoritative; input ack reports the latest applied client sequence.',
    },
    simulation: {
      tickHz: TICK_HZ,
      stateHz: TICK_HZ,
      world: { width: WORLD_W, height: WORLD_H, stageLeft: STAGE_LEFT, stageRight: STAGE_RIGHT, origin: 'lower-left game space; fighter y is height above ground' },
      match: { roundSeconds: ROUND_SECONDS, roundsToWin: WINS_TO_TAKE_MATCH, phases: ['countdown', 'fight', 'round-over', 'match-over'] },
      inputSemantics: {
        held: ['moveX', 'down'],
        edgeTriggered: ['jump', 'punch', 'kick', 'throw'],
        omitted: 'Each received input is a snapshot: omitted moveX/down/edge fields become zero/false and omitted motion becomes N. If no message arrives, held movement persists while edge inputs clear after one tick. Send one decision per state.',
        motion: 'Recent absolute direction suffix using L/R/D/U. Mirror L/R with facing. A matching suffix plus its attack button starts a special. Send N when neutral.',
      },
    },
    clientMessages: {
      hello: { required: ['t'], properties: { t: { const: 'hello' }, key: { type: 'string', description: 'Direct TCP only; omit on SSH play.' } } },
      help: { required: ['t'], properties: { t: { const: 'help' } } },
      ping: { required: ['t'], properties: { t: { const: 'ping' } } },
      queue: { required: ['t'], properties: { t: { const: 'queue' }, char: { type: ['string', 'integer'], description: 'Case-insensitive roster name or zero-based cursor; invalid values wrap/fall back to 0.' }, opponents: { enum: ['all', 'humans', 'bots'], default: 'all', description: 'Both queued players must mutually accept the matchup.' } } },
      dequeue: { required: ['t'], properties: { t: { const: 'dequeue' } } },
      input: { required: ['t'], description: 'Ignored when not in a match. The server assigns a monotonically increasing sequence used by state.ack.', properties: { t: { const: 'input' }, moveX: { enum: [-1, 0, 1], default: 0 }, down: { type: 'boolean', default: false }, jump: { type: 'boolean', default: false }, punch: { type: 'boolean', default: false }, kick: { type: 'boolean', default: false }, throw: { type: 'boolean', default: false }, motion: { type: 'string', default: 'N' } } },
      joinLounge: { required: ['t'], properties: { t: { const: 'joinLounge' }, char: { type: ['string', 'integer'] } } },
      leaveLounge: { required: ['t'], properties: { t: { const: 'leaveLounge' } } },
      chat: { required: ['t', 'message'], properties: { t: { const: 'chat' }, message: { type: 'string', maxLength: 140, pattern: 'printable ASCII after sanitization' } } },
      challenge: { required: ['t', 'targetId'], properties: { t: { const: 'challenge' }, targetId: { type: 'string', description: 'Exact id from a lounge roster entry.' } } },
      acceptChallenge: { required: ['t'], properties: { t: { const: 'acceptChallenge' } } },
      declineChallenge: { required: ['t'], properties: { t: { const: 'declineChallenge' } } },
      cancelChallenge: { required: ['t'], properties: { t: { const: 'cancelChallenge' } } },
      leave: { required: ['t'], properties: { t: { const: 'leave' } }, description: 'Leave current match, queue, and/or lounge.' },
    },
    serverMessages: {
      hi: { when: 'immediately on connect', properties: { t: { const: 'hi' }, service: { const: 'ringside-bot' }, ...buildFields } },
      welcome: { when: 'successful hello', properties: { t: { const: 'welcome' }, fp: { type: 'string' }, name: { type: 'string' }, elo: { type: 'integer' }, roster: { type: 'array', items: { type: 'string' } }, channel: { const: 'bot-api' }, playerType: { const: 'bot' }, ...buildFields } },
      queued: { properties: { t: { const: 'queued' }, char: { type: 'string' }, opponents: { enum: ['all', 'humans', 'bots'] } } },
      dequeued: { properties: { t: { const: 'dequeued' } } },
      matchStart: { properties: { t: { const: 'matchStart' }, mid: { type: 'string' }, role: { enum: ['a', 'b'] }, yourCursor: { type: 'integer' }, stage: { type: 'string' }, oppName: { type: 'string' }, oppCursor: { type: 'integer' }, oppType: { enum: ['human', 'bot'] }, ...buildFields } },
      state: { frequency: `${TICK_HZ} Hz while assigned to a match`, required: ['t', 'frame', 'phase', 'you', 'opp', 'projectiles'], properties: { t: { const: 'state' }, frame: { type: 'integer' }, phase: { enum: ['countdown', 'fight', 'round-over', 'match-over'] }, round: { type: 'integer' }, roundTime: { type: 'number', description: 'Seconds remaining, rounded for display.' }, hitStop: { type: 'integer' }, ack: { type: 'integer', description: 'Latest input sequence applied by the server.' }, you: { $ref: '#/definitions/fighter' }, opp: { $ref: '#/definitions/fighter' }, projectiles: { type: 'array', items: { $ref: '#/definitions/projectile' } } } },
      matchEnd: { properties: { t: { const: 'matchEnd' }, result: { properties: { winner: { type: 'string' }, loser: { type: 'string' }, winnerIsBot: { type: 'boolean' }, loserIsBot: { type: 'boolean' }, youWon: { type: 'boolean' }, winnerChar: { type: 'string' }, rating: { type: ['object', 'null'], properties: { before: { type: 'integer' }, after: { type: 'integer' }, delta: { type: 'integer' } } } } } } },
      joinedLounge: { properties: { t: { const: 'joinedLounge' }, char: { type: 'string' } } },
      leftLounge: { properties: { t: { const: 'leftLounge' } } },
      lounge: { properties: { t: { const: 'lounge' }, roster: { type: 'array', items: { properties: { id: { type: 'string' }, name: { type: 'string' }, cursor: { type: 'integer' }, elo: { type: ['integer', 'null'] }, isBot: { type: 'boolean' } } } }, chat: { type: 'array', items: { properties: { username: { type: 'string' }, message: { type: 'string' } } } } } },
      challengeState: { properties: { t: { const: 'challengeState' }, incoming: { type: ['object', 'null'] }, outgoing: { type: ['object', 'null'] } } },
      notice: { properties: { t: { const: 'notice' }, message: { type: 'string' } } },
      pong: { properties: { t: { const: 'pong' } } },
      left: { properties: { t: { const: 'left' } } },
      error: { properties: { t: { const: 'error' }, code: { type: ['string', 'null'], enum: ['access_blocked', 'already_authenticated', 'invalid_api_key', 'authentication_required', 'already_in_match', 'in_lounge', 'already_queued', 'invalid_opponents', 'queued', 'already_in_lounge', 'not_in_lounge', 'invalid_chat', 'chat_rate_limited', 'invalid_target', 'line_too_long', 'invalid_json', 'unknown_command', 'bot_server_unavailable', null] }, msg: { type: 'string' } } },
      help: { description: 'Compact in-band command index. This schema is the authoritative exhaustive reference.' },
    },
    definitions: { fighter: { type: 'object', required: Object.keys(fighterFields), properties: fighterFields }, projectile: { type: 'object', required: Object.keys(projectileFields), properties: projectileFields } },
    projectileStyles: {
      blue: { damage: 12, chip: 3, radius: 11, behavior: 'standard traveling projectile' },
      fire: { damage: 12, chip: 3, radius: 11, behavior: 'standard traveling projectile' },
      sonic: { damage: 12, chip: 3, radius: 11, behavior: 'standard traveling projectile' },
      citation: { damage: 12, chip: 3, radius: 11, behavior: 'standard traveling projectile' },
      knowledge: { damage: BOMBARDMENT.dmg, chip: BOMBARDMENT.chip, radius: BOMBARDMENT.r, vy: -BOMBARDMENT.dropPerFrame, behavior: 'fixed descending diagonal; removed below ground or out of bounds' },
      mote: { damage: MOTE.dmg, chip: MOTE.chip, radius: MOTE.r, behavior: 'straight shot; ttl is source-dependent (96 construct, 120 stream/volley)' },
      boomerang: { damage: BOOMERANG.dmg, chip: BOOMERANG.chip, radius: BOOMERANG.r, behavior: 'flies to reach, reverses, homes to owner; can hit once in each direction', reach: BOOMERANG.reach },
      rope: { damage: LASSO.dmg, chip: LASSO.chip, radius: LASSO.r, ttl: LASSO.life, reflectable: false, behavior: 'pulls a clean-hit rival toward owner' },
      construct: { damage: 0, chip: 0, ttl: CONSTRUCT.life, dangerous: false, behavior: `stationary turret; spawns a mote every ${CONSTRUCT.fireEvery} frames` },
    },
    attacks: {
      normals: { punch: ATTACKS.punch, kick: ATTACKS.kick, throw: { ...THROW, impact: 'unblockable grounded grab' } },
      characters: ROSTER.map((character, cursor) => ({
        cursor, name: character.name, archetype: character.archetype, difficulty: character.difficulty,
        specials: specialMovesFor(character.name).map((move) => ({
          id: move.attack, name: move.name, description: move.description, button: move.button,
          buttonKey: BUTTON_KEY[move.button], motionRelative: move.motion,
          motionFacingRight: specialMoveMotionCode(move, 1), motionFacingLeft: specialMoveMotionCode(move, -1),
          displayInputFacingRight: specialMoveInput(move, 1), timingAndImpact: specialMoveStats(move.attack),
        })),
      })),
    },
    compatibility: {
      current: VERSION_INFO.botProtocol,
      protocol2: 'Adds self-contained fighter identity/state, movePhase/hitboxActive, and stable projectile lifecycle/source/velocity fields.',
      deprecatedProtocol1Fields: ['fighter.special', 'fighter.active', 'fighter.casting'],
      policy: 'Additive fields may appear within a protocol version. A version bump signals changed field meaning or removal; bots should ignore unknown fields and log engine/build with results.',
    },
  };
}

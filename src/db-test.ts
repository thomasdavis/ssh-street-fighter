process.env.SF_DB = '/tmp/sf-db-test.db';
import { unlinkSync } from 'fs';

try { unlinkSync(process.env.SF_DB); } catch { /* fresh */ }
const db = await import('./db/db.js');
const { DEFAULT_KEY_BINDINGS, parseKeyBindings, serializeKeyBindings, withBinding } = await import('./input/bindings.js');
db.initDb();

const assert = (ok: boolean, message: string): void => {
  if (!ok) { console.error(`FAIL  ${message}`); process.exitCode = 1; }
  else console.log(`PASS  ${message}`);
};

const matchColumns = db.getDb().prepare('PRAGMA table_info(matches)').all() as Array<{ name: string }>;
assert(matchColumns.some((column) => column.name === 'engine_commit')
  && matchColumns.some((column) => column.name === 'engine_dirty'), 'match schema stores exact engine build provenance');

db.touchOrCreate('fp:a'); db.touchOrCreate('fp:b');
assert(db.setUsername('fp:a', 'ALPHA'), 'create ALPHA');
assert(db.setUsername('fp:b', 'BRAVO'), 'create BRAVO');
assert(db.getByFingerprint('fp:a')?.elo === 1200 && db.getByFingerprint('fp:b')?.elo === 1200, 'new ratings start at 1200');

const customBindings = withBinding(DEFAULT_KEY_BINDINGS, 'punch', 'key:j');
db.setKeyBindings('fp:a', serializeKeyBindings(customBindings));
assert(parseKeyBindings(db.getByFingerprint('fp:a')?.key_bindings_json).punch === 'key:j', 'custom controls persist with verified identity');

const first = db.recordMatch('fp:a', 'fp:b', 'ALPHA', 'BRAVO', 'BYU', 'MEN', 2);
assert(first?.winnerAfter === 1216 && first.loserAfter === 1184 && first.delta === 16, 'equal-rating match moves both players by 16');
assert(db.getByFingerprint('fp:a')?.peak_elo === 1216, 'peak ELO advances with rating');

const second = db.recordMatch('fp:a', 'fp:b', 'ALPHA', 'BRAVO', 'BYU', 'MEN', 2);
assert(second?.winnerAfter === 1231 && second.loserAfter === 1169 && second.delta === 15, 'expected-score curve reduces repeat-win delta');

const beforeGuest = db.getByFingerprint('fp:a')!.elo;
const guest = db.recordMatch('fp:a', null, 'ALPHA', 'GUEST', 'BYU', 'MEN', 2);
assert(guest === null && db.getByFingerprint('fp:a')!.elo === beforeGuest, 'guest match is explicitly unrated');

const board = db.leaderboard(10);
assert(board[0]?.username === 'ALPHA' && board[0]?.elo === 1231, 'leaderboard is ordered by ELO');
assert(db.playerRank('fp:a') === 1 && db.playerRank('fp:b') === 2, 'player rank follows ELO order');

db.addAnalyticsEvent('special_move_used', { player: 'ALPHA', move: 'HADOUKEN', omitted: undefined }, new Date().toISOString());
const event = db.analyticsEvents(1)[0];
assert(event?.event === 'special_move_used' && JSON.parse(event.fields_json).move === 'HADOUKEN', 'append-only analytics ledger stores event fields');

console.log(process.exitCode ? 'DB TEST: FAIL' : 'DB TEST: PASS');
process.exit(process.exitCode ?? 0);

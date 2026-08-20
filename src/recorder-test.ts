// Focused telemetry regressions: each attacker must be charged only for real
// changes to the opposing fighter's HP, and specials come from the canonical
// per-character move definitions rather than a legacy hard-coded subset.
process.env.SF_DB = '/tmp/recorder-test.db';
import { unlinkSync } from 'fs';
import { emptyInputs, type Match } from './game/types.js';

for (const suffix of ['', '-wal', '-shm']) {
  try { unlinkSync(`${process.env.SF_DB}${suffix}`); } catch { /* absent is fine */ }
}
const db = await import('./db/db.js');
const { makeFighter, makeMatch } = await import('./game/engine.js');
const { specialMovesFor } = await import('./game/moves.js');
const { MatchRecorder, ENGINE_VERSION } = await import('./telemetry/recorder.js');
const { VERSION_INFO } = await import('./version.js');
db.initDb();

let pass = true;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) pass = false;
};
const inputs = emptyInputs();
const recorder = (id: string, m: Match) => new MatchRecorder(id, {
  mode: 'versus' as const, stage: m.stage, seed: 1, region: 'NA', engineVersion: ENGINE_VERSION,
  sides: {
    a: { fp: null, name: 'A', char: m.a.name, isBot: false },
    b: { fp: null, name: 'B', char: m.b.name, isBot: false },
  },
});

const omegaCodex = makeMatch(makeFighter('a', 'OMEGA', 'a'), makeFighter('b', 'CODEX', 'b'));
const oc = recorder('telemetry-omega-codex', omegaCodex);
oc.frame(omegaCodex, inputs, inputs); // seed defender HP

omegaCodex.a.attack = specialMovesFor('OMEGA')[0]!.attack;
omegaCodex.b.attack = specialMovesFor('CODEX')[0]!.attack;
omegaCodex.b.hp = 91;
oc.frame(omegaCodex, inputs, inputs); // OMEGA deals 9
for (let i = 0; i < 3; i++) oc.frame(omegaCodex, inputs, inputs); // unchanged HP: no repeats

omegaCodex.a.hp = 93;
oc.frame(omegaCodex, inputs, inputs); // CODEX deals 7
for (let i = 0; i < 3; i++) oc.frame(omegaCodex, inputs, inputs);

omegaCodex.a.attack = 'punch';
omegaCodex.b.hp = 0;
oc.frame(omegaCodex, inputs, inputs); // one final hit + one KO
for (let i = 0; i < 25; i++) oc.frame(omegaCodex, inputs, inputs); // KO state must not repeat
omegaCodex.a.wins = 2;
oc.finish(omegaCodex, { winner: 'a', endReason: 'ko' });
oc.finish(omegaCodex, { winner: 'b', endReason: 'forfeit' }); // finalization is idempotent

const sides = db.getDb().prepare('SELECT * FROM match_players WHERE match_id = ? ORDER BY side').all('telemetry-omega-codex') as Array<{
  side: string; damage_dealt: number; damage_taken: number; hits: number; specials: number; max_combo: number;
}>;
const events = db.getDb().prepare('SELECT type, data_json FROM match_events WHERE match_id = ? ORDER BY id').all('telemetry-omega-codex') as Array<{ type: string; data_json: string }>;
const koCount = events.filter((e) => e.type === 'ko').length;
const hitCount = events.filter((e) => e.type === 'hit').length;
const stored = db.getDb().prepare('SELECT winner, end_reason, engine_version, engine_commit, engine_dirty FROM matches WHERE id = ?').get('telemetry-omega-codex') as {
  winner: string; end_reason: string; engine_version: string; engine_commit: string | null; engine_dirty: number | null;
};
check('both attackers use the opposing side previous HP', sides[0]?.damage_dealt === 100 && sides[0]?.damage_taken === 7 && sides[0]?.hits === 2
  && sides[1]?.damage_dealt === 7 && sides[1]?.damage_taken === 100 && sides[1]?.hits === 1,
  `sides=${JSON.stringify(sides)}`);
check('unchanged post-KO frames do not repeat hit/combo/KO accounting', hitCount === 3 && koCount === 1 && sides[0]?.max_combo === 2,
  `hits=${hitCount} kos=${koCount} combo=${sides[0]?.max_combo}`);
check('OMEGA and CODEX canonical specials are counted once', sides[0]?.specials === 1 && sides[1]?.specials === 1,
  `A=${sides[0]?.specials} B=${sides[1]?.specials}`);
check('a second recorder finish cannot replace the authoritative result', stored.winner === 'a' && stored.end_reason === 'ko', JSON.stringify(stored));
check('match row pins engine version and exact source revision',
  stored.engine_version === ENGINE_VERSION && stored.engine_commit === VERSION_INFO.commit
  && stored.engine_dirty === (VERSION_INFO.dirty == null ? null : Number(VERSION_INFO.dirty)),
  `${stored.engine_version}@${stored.engine_commit ?? 'unknown'} dirty=${stored.engine_dirty}`);
const replay = db.getDb().prepare('SELECT header_json FROM replays WHERE match_id = ?').get('telemetry-omega-codex') as { header_json: string };
const replayHeader = JSON.parse(replay.header_json) as { engine?: { version?: string; commit?: string | null; build?: string } };
check('replay header carries the same immutable build identity',
  replayHeader.engine?.version === ENGINE_VERSION && replayHeader.engine?.commit === VERSION_INFO.commit
  && replayHeader.engine?.build === VERSION_INFO.build);

// Exercise every modern move rather than one representative per character. A
// neutral frame separates each attack so the recorder sees three distinct
// rising edges and stores the exact canonical attack kinds.
for (const character of ['OMEGA', 'CODEX', 'FABLE'] as const) {
  const match = makeMatch(makeFighter('a', character, 'a'), makeFighter('b', 'BYU', 'b'));
  const id = `telemetry-all-specials-${character.toLowerCase()}`;
  const modern = recorder(id, match);
  modern.frame(match, inputs, inputs);
  const expected = specialMovesFor(character).map((move) => move.attack);
  for (const attack of expected) {
    match.a.attack = attack;
    modern.frame(match, inputs, inputs);
    match.a.attack = 'none';
    modern.frame(match, inputs, inputs);
  }
  for (let i = 0; i < 25; i++) modern.frame(match, inputs, inputs);
  match.a.wins = 2;
  modern.finish(match, { winner: 'a', endReason: 'ko' });

  const side = db.getDb().prepare("SELECT specials FROM match_players WHERE match_id = ? AND side = 'a'").get(id) as { specials: number };
  const rows = db.getDb().prepare("SELECT data_json FROM match_events WHERE match_id = ? AND type = 'special' ORDER BY id").all(id) as Array<{ data_json: string }>;
  const actual = rows.map((row) => (JSON.parse(row.data_json) as { kind: string }).kind);
  check(`${character} counts all canonical specials exactly once`, side.specials === expected.length && JSON.stringify(actual) === JSON.stringify(expected),
    `specials=${side.specials} kinds=${actual.join(',')}`);
}

console.log(pass ? '\nRECORDER TEST: PASS' : '\nRECORDER TEST: FAIL');
process.exit(pass ? 0 : 1);

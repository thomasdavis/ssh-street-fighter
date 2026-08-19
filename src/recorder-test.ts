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
const stored = db.getDb().prepare('SELECT winner, end_reason FROM matches WHERE id = ?').get('telemetry-omega-codex') as { winner: string; end_reason: string };
check('both attackers use the opposing side previous HP', sides[0]?.damage_dealt === 100 && sides[0]?.damage_taken === 7 && sides[0]?.hits === 2
  && sides[1]?.damage_dealt === 7 && sides[1]?.damage_taken === 100 && sides[1]?.hits === 1,
  `sides=${JSON.stringify(sides)}`);
check('unchanged post-KO frames do not repeat hit/combo/KO accounting', hitCount === 3 && koCount === 1 && sides[0]?.max_combo === 2,
  `hits=${hitCount} kos=${koCount} combo=${sides[0]?.max_combo}`);
check('OMEGA and CODEX canonical specials are counted once', sides[0]?.specials === 1 && sides[1]?.specials === 1,
  `A=${sides[0]?.specials} B=${sides[1]?.specials}`);
check('a second recorder finish cannot replace the authoritative result', stored.winner === 'a' && stored.end_reason === 'ko', JSON.stringify(stored));

const fableMatch = makeMatch(makeFighter('a', 'FABLE', 'a'), makeFighter('b', 'BYU', 'b'));
const fable = recorder('telemetry-fable', fableMatch);
fable.frame(fableMatch, inputs, inputs);
fableMatch.a.attack = specialMovesFor('FABLE')[0]!.attack;
fable.frame(fableMatch, inputs, inputs);
for (let i = 0; i < 30; i++) fable.frame(fableMatch, inputs, inputs);
fableMatch.a.wins = 2;
fable.finish(fableMatch, { winner: 'a', endReason: 'ko' });
const fableSide = db.getDb().prepare("SELECT specials FROM match_players WHERE match_id = ? AND side = 'a'").get('telemetry-fable') as { specials: number };
const modernKinds = db.getDb().prepare("SELECT data_json FROM match_events WHERE type = 'special' ORDER BY id").all() as Array<{ data_json: string }>;
const kinds = modernKinds.map((row) => (JSON.parse(row.data_json) as { kind: string }).kind);
check('FABLE special is recognized from the same canonical move definitions', fableSide.specials === 1 && kinds.includes(specialMovesFor('FABLE')[0]!.attack),
  `specials=${fableSide.specials} kinds=${kinds.join(',')}`);
check('modern special events cover OMEGA, CODEX, and FABLE', ['testimony', 'context', 'storyarc'].every((kind) => kinds.includes(kind)), kinds.join(','));

console.log(pass ? '\nRECORDER TEST: PASS' : '\nRECORDER TEST: FAIL');
process.exit(pass ? 0 : 1);

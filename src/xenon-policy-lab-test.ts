import { runPolicyLab, validateMechanicsSnapshot, ENGINE_COMMIT, EXPECTED_MECHANICS_HASH, LAB_SCHEMA } from './tools/xenon-policy-lab.js';

let pass = true;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) pass = false;
};

const options = {
  seed: 17,
  trainSeeds: [101],
  heldOutSeeds: [401],
  inputDelay: 2,
  candidateLimit: 2,
  includeSearchMatches: true,
};
const first = await runPolicyLab(options);
const second = await runPolicyLab(options);

check('same configuration is byte-for-byte deterministic', JSON.stringify(first) === JSON.stringify(second));
check('provenance pins exact engine commit and offline execution',
  first.schema === LAB_SCHEMA && first.engine.expectedBaseCommit === ENGINE_COMMIT
    && first.engine.mechanicsHash === EXPECTED_MECHANICS_HASH && first.engine.mechanicsValidated
    && first.engine.mechanicsFiles.join(',') === 'src/game/engine.ts,src/game/moves.ts,src/game/types.ts'
    && !first.engine.networkAccess);
let mechanicsMismatchRejected = false, versionMismatchRejected = false;
try { validateMechanicsSnapshot('0'.repeat(64)); } catch { mechanicsMismatchRejected = true; }
try { validateMechanicsSnapshot(EXPECTED_MECHANICS_HASH, 'sf-future'); } catch { versionMismatchRejected = true; }
check('mechanics provenance fails closed on source or version drift', mechanicsMismatchRejected && versionMismatchRejected);
check('ensemble covers four current-mechanics fighters in train and held-out families',
  first.opponentEnsemble.length === 8
    && new Set(first.opponentEnsemble.map((p) => p.character)).size === 4
    && new Set(first.opponentEnsemble.map((p) => p.family)).size === 2);
check('search is bounded and hashes every configuration',
  first.search.candidates.length === 2 && first.search.candidates.every((c) => /^[0-9a-f]{64}$/.test(c.configHash)));

const searchedMatches = first.search.matches ?? [];
const seedTuple = (m: typeof searchedMatches[number]): string =>
  `${m.streamRootSeed}|${m.matchSeed}|${m.targetPolicySeed}|${m.opponentPolicySeed}`;
check('candidate configs and paired seats share common random-number streams',
  searchedMatches.length === 16 && ['OMEGA', 'MNEME', 'AJAX', 'FABLE'].every((opponent) => {
    const scenario = searchedMatches.filter((m) => m.opponent === opponent && m.scenarioSeed === 101);
    return scenario.length === 4
      && new Set(scenario.map((m) => m.targetConfigHash)).size === 2
      && new Set(scenario.map(seedTuple)).size === 1
      && new Set(scenario.map((m) => m.executorSide)).size === 2
      && new Set(scenario.map((m) => m.id)).size === 4;
  }));

const blocks = [first.evaluation.searched, ...first.evaluation.frozenBaselines];
check('searched policy is compared with two frozen baselines', first.evaluation.frozenBaselines.length === 2);
check('every block evaluates disjoint train/held-out seeds on both sides', blocks.every((block) => {
  const train = block.matches.filter((m) => m.split === 'train');
  const held = block.matches.filter((m) => m.split === 'held-out');
  return train.length === 8 && held.length === 8
    && new Set(train.map((m) => m.executorSide)).size === 2
    && new Set(held.map((m) => m.executorSide)).size === 2
    && train.every((m) => m.inputDelay === 2 && m.scenarioSeed === 101 && m.matchSeed !== m.scenarioSeed)
    && held.every((m) => m.inputDelay === 2 && m.scenarioSeed === 401 && m.matchSeed !== m.scenarioSeed)
    && block.matches.every((m) => m.targetPolicySeed !== m.opponentPolicySeed);
}));
check('paired seats and frozen/selected policies preserve the same scenario streams',
  ['train', 'held-out'].every((split) => ['OMEGA', 'MNEME', 'AJAX', 'FABLE'].every((opponent) => {
    const scenario = blocks.flatMap((block) => block.matches).filter((m) => m.split === split && m.opponent === opponent);
    return scenario.length === 6 && new Set(scenario.map(seedTuple)).size === 1;
  })));
check('train/held-out and target/opponent streams remain disjoint',
  blocks.every((block) => {
    const trainSeeds = new Set(block.matches.filter((m) => m.split === 'train').flatMap((m) => [m.matchSeed, m.targetPolicySeed, m.opponentPolicySeed]));
    const heldSeeds = block.matches.filter((m) => m.split === 'held-out').flatMap((m) => [m.matchSeed, m.targetPolicySeed, m.opponentPolicySeed]);
    return heldSeeds.every((seed) => !trainSeeds.has(seed))
      && block.matches.every((m) => new Set([m.matchSeed, m.targetPolicySeed, m.opponentPolicySeed]).size === 3);
  }));
check('all results are authoritative whole matches with explicit terminal evidence', blocks.every((block) =>
  block.matches.every((m) => m.rounds.executor === 2 || m.rounds.opponent === 2)
    && block.matches.every((m) => m.terminal !== 'frame-cap' && m.roundTerminals.length >= 2)));
const evaluatedMatches = blocks.flatMap((block) => block.matches);
const losingKos = evaluatedMatches.filter((m) => m.outcome === 'loss' && m.terminal === 'ko');
check('KO terminal provenance is distinct from executor clean-KO wins',
  losingKos.length > 0 && losingKos.every((m) => m.koTerminal && !m.cleanKoWin)
    && evaluatedMatches.every((m) => m.koTerminal === (m.terminal === 'ko'))
    && evaluatedMatches.every((m) => m.cleanKoWin === (m.outcome === 'win' && m.terminal === 'ko')));
check('aggregate clean-KO and timeout fields are executor-relative and unambiguous', blocks.every((block) =>
  (['train', 'held-out'] as const).every((split) => {
    const matches = block.matches.filter((m) => m.split === split);
    const aggregate = block[split === 'train' ? 'train' : 'heldOut'];
    return aggregate.koTerminals === matches.filter((m) => m.terminal === 'ko').length
      && aggregate.cleanKoWins === matches.filter((m) => m.outcome === 'win' && m.terminal === 'ko').length
      && aggregate.timeoutWins === matches.filter((m) => m.outcome === 'win' && m.terminal === 'time').length
      && aggregate.timeoutLosses === matches.filter((m) => m.outcome === 'loss' && m.terminal === 'time').length
      && aggregate.cleanKoWinRate === aggregate.cleanKoWins / aggregate.played;
  })));

let overlapRejected = false;
try { await runPolicyLab({ trainSeeds: [1], heldOutSeeds: [1], candidateLimit: 1 }); } catch { overlapRejected = true; }
check('overlapping train/held-out seeds fail fast', overlapRejected);

console.log(pass ? '\nXENON POLICY LAB TEST: PASS' : '\nXENON POLICY LAB TEST: FAIL');
process.exit(pass ? 0 : 1);

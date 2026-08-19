import { delaysBySeat, runPolicyLab, score, validateMechanicsSnapshot, ENGINE_COMMIT, EXPECTED_MECHANICS_HASH, LAB_SCHEMA } from './tools/xenon-policy-lab.js';

let pass = true;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) pass = false;
};

const options = {
  seed: 17,
  trainSeeds: [101],
  heldOutSeeds: [401],
  delayScenarios: [{ targetDelay: 0, opponentDelay: 2 }, { targetDelay: 2, opponentDelay: 0 }],
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
    && first.engine.deploymentScope.includes('991acfe') && first.engine.deploymentScope.includes('9fd5609')
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
check('candidate configs, delays, and paired seats share common random-number streams',
  searchedMatches.length === 32 && ['OMEGA', 'MNEME', 'AJAX', 'FABLE'].every((opponent) => {
    const scenario = searchedMatches.filter((m) => m.opponent === opponent && m.scenarioSeed === 101);
    return scenario.length === 8
      && new Set(scenario.map((m) => m.targetConfigHash)).size === 2
      && new Set(scenario.map(seedTuple)).size === 1
      && new Set(scenario.map((m) => m.executorSide)).size === 2
      && new Set(scenario.map((m) => `${m.delayScenario.targetDelay}:${m.delayScenario.opponentDelay}`)).size === 2
      && new Set(scenario.map((m) => m.id)).size === 8;
  }));

const blocks = [first.evaluation.searched, ...first.evaluation.frozenBaselines];
check('searched policy is compared with two frozen baselines', first.evaluation.frozenBaselines.length === 2);
check('every block evaluates disjoint train/held-out seeds on both sides', blocks.every((block) => {
  const train = block.matches.filter((m) => m.split === 'train');
  const held = block.matches.filter((m) => m.split === 'held-out');
  return train.length === 16 && held.length === 16
    && new Set(train.map((m) => m.executorSide)).size === 2
    && new Set(held.map((m) => m.executorSide)).size === 2
    && new Set(train.map((m) => `${m.delayScenario.targetDelay}:${m.delayScenario.opponentDelay}`)).size === 2
    && new Set(held.map((m) => `${m.delayScenario.targetDelay}:${m.delayScenario.opponentDelay}`)).size === 2
    && train.every((m) => m.scenarioSeed === 101 && m.matchSeed !== m.scenarioSeed)
    && held.every((m) => m.scenarioSeed === 401 && m.matchSeed !== m.scenarioSeed)
    && block.matches.every((m) => m.targetPolicySeed !== m.opponentPolicySeed);
}));
check('paired seats and frozen/selected policies preserve the same scenario streams',
  ['train', 'held-out'].every((split) => ['OMEGA', 'MNEME', 'AJAX', 'FABLE'].every((opponent) => {
    const scenario = blocks.flatMap((block) => block.matches).filter((m) => m.split === split && m.opponent === opponent);
    return scenario.length === 12 && new Set(scenario.map(seedTuple)).size === 1;
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
      && aggregate.cleanKoWinRate === aggregate.cleanKoWins / aggregate.played
      && aggregate.koRoundsWon === matches.filter((m) => m.terminal === 'ko').reduce((sum, m) => sum + m.rounds.executor, 0)
      && aggregate.koRoundsLost === matches.filter((m) => m.terminal === 'ko').reduce((sum, m) => sum + m.rounds.opponent, 0);
  })));
check('one selected config hash is frozen across every evaluation delay',
  first.evaluation.searched.byScenario.length === 2
    && new Set(first.evaluation.searched.matches.map((m) => m.targetConfigHash)).size === 1
    && first.evaluation.searched.matches.every((m) => m.targetConfigHash === first.search.selectedConfigHash));
check('asymmetric delay queues follow policy role across both seats',
  delaysBySeat({ targetDelay: 5, opponentDelay: 2 }, 'a').a === 5
    && delaysBySeat({ targetDelay: 5, opponentDelay: 2 }, 'a').b === 2
    && delaysBySeat({ targetDelay: 5, opponentDelay: 2 }, 'b').a === 2
    && delaysBySeat({ targetDelay: 5, opponentDelay: 2 }, 'b').b === 5
    && first.evaluation.searched.matches.every((m) => m.executorSide === 'a'
      ? m.seatDelays.a === m.delayScenario.targetDelay && m.seatDelays.b === m.delayScenario.opponentDelay
      : m.seatDelays.b === m.delayScenario.targetDelay && m.seatDelays.a === m.delayScenario.opponentDelay));
const timeoutFixture = await runPolicyLab({ ...options, delayScenarios: [{ targetDelay: 0, opponentDelay: 0 }], candidateLimit: 1, includeSearchMatches: false });
const timeoutWin = [timeoutFixture.evaluation.searched, ...timeoutFixture.evaluation.frozenBaselines]
  .flatMap((block) => block.matches).find((m) => m.outcome === 'win' && m.terminal === 'time');
const timeoutOnlyScore = timeoutWin ? score([timeoutWin]) : null;
check('a timeout win has zero primary and round-margin credit plus one penalty',
  !!timeoutWin && !timeoutWin.cleanKoWin
    && timeoutOnlyScore?.primaryCleanKoWins === 0
    && timeoutOnlyScore.koRoundMargin === 0
    && timeoutOnlyScore.timeoutPenalty === 1);
check('reported minimax scoring is delay-robust and internally consistent',
  first.search.scoring.ordering[0] === 'worst-scenario cleanKoWins descending'
    && first.search.candidates.every((candidate) => candidate.score.byScenario.length === 2
      && candidate.score.worstScenarioCleanKoWins === Math.min(...candidate.score.byScenario.map((row) => row.evidence.primaryCleanKoWins))
      && candidate.score.totalCleanKoWins === candidate.cleanKoWins
      && candidate.score.totalTimeoutPenalty === candidate.timeoutWins + candidate.timeoutLosses
      && candidate.score.totalKoRoundMargin === candidate.koRoundsWon - candidate.koRoundsLost));

let overlapRejected = false;
try { await runPolicyLab({ trainSeeds: [1], heldOutSeeds: [1], candidateLimit: 1 }); } catch { overlapRejected = true; }
check('overlapping train/held-out seeds fail fast', overlapRejected);
let duplicateScenariosRejected = false;
try { await runPolicyLab({ trainSeeds: [1], heldOutSeeds: [2], delayScenarios: [{ targetDelay: 0, opponentDelay: 2 }, { targetDelay: 0, opponentDelay: 2 }], candidateLimit: 1 }); } catch { duplicateScenariosRejected = true; }
check('duplicate delay scenarios fail fast', duplicateScenariosRejected);

console.log(pass ? '\nXENON POLICY LAB TEST: PASS' : '\nXENON POLICY LAB TEST: FAIL');
process.exit(pass ? 0 : 1);

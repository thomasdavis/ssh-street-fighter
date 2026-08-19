import { runPolicyLab, ENGINE_COMMIT, LAB_SCHEMA } from './tools/xenon-policy-lab.js';

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
};
const first = await runPolicyLab(options);
const second = await runPolicyLab(options);

check('same configuration is byte-for-byte deterministic', JSON.stringify(first) === JSON.stringify(second));
check('provenance pins exact engine commit and offline execution',
  first.schema === LAB_SCHEMA && first.engine.commit === ENGINE_COMMIT && first.engine.exactEngine && !first.engine.networkAccess);
check('ensemble covers four current-mechanics fighters in train and held-out families',
  first.opponentEnsemble.length === 8
    && new Set(first.opponentEnsemble.map((p) => p.character)).size === 4
    && new Set(first.opponentEnsemble.map((p) => p.family)).size === 2);
check('search is bounded and hashes every configuration',
  first.search.candidates.length === 2 && first.search.candidates.every((c) => /^[0-9a-f]{64}$/.test(c.configHash)));

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
check('all results are authoritative whole matches with explicit terminal evidence', blocks.every((block) =>
  block.matches.every((m) => m.rounds.executor === 2 || m.rounds.opponent === 2)
    && block.matches.every((m) => m.terminal !== 'frame-cap' && m.roundTerminals.length >= 2)));

let overlapRejected = false;
try { await runPolicyLab({ trainSeeds: [1], heldOutSeeds: [1], candidateLimit: 1 }); } catch { overlapRejected = true; }
check('overlapping train/held-out seeds fail fast', overlapRejected);

console.log(pass ? '\nXENON POLICY LAB TEST: PASS' : '\nXENON POLICY LAB TEST: FAIL');
process.exit(pass ? 0 : 1);

import { exportSimTrainingData } from './tools/training-export.js';
import { ENGINE_VERSION } from './telemetry/recorder.js';

let pass = true;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) pass = false;
};

async function fixture(): Promise<Record<string, unknown>[]> {
  const episodes: Record<string, unknown>[] = [];
  const summary = await exportSimTrainingData({
    fighter: 'CODEX', opponents: ['FABLE'], styleNames: ['rushdown'],
    matches: 1, seed: 73, sourceCommit: 'fixture-commit', sourceDirty: false,
  }, (episode) => episodes.push(episode));
  check('summary reports one match and two perspectives', summary.matches === 1 && summary.episodes === 2);
  // Regression for #26: simulator exports must report the CURRENT runtime engine
  // version (they run the current engine), never a stale independent label.
  check('summary pins the current engine + fixture source', summary.engineVersion === ENGINE_VERSION && summary.engineCommit === 'fixture-commit', `engineVersion=${summary.engineVersion} expected=${ENGINE_VERSION}`);
  return episodes;
}

const first = await fixture();
const second = await fixture();
check('seeded simulator export is byte deterministic', JSON.stringify(first) === JSON.stringify(second));
check('two perspective episodes are emitted', first.length === 2);

const a = first[0] as { meta: Record<string, unknown>; observations: Record<string, unknown>[]; actions: Record<string, unknown>[] };
const b = first[1] as typeof a;
check('perspectives share match and trajectory digest', a.meta.match_id === b.meta.match_id && a.meta.replay_sha256 === b.meta.replay_sha256);
check('perspectives carry distinct sides', a.meta.side === 'a' && b.meta.side === 'b');
check('observations and applied actions align one-to-one', a.observations.length > 2 && a.actions.length === a.observations.length);
check('frames advance contiguously', a.observations.every((observation, index) => observation.frame === index));
check('trajectory digest is sha256', typeof a.meta.replay_sha256 === 'string' && a.meta.replay_sha256.length === 64);
check('controller provenance is hashed', typeof a.meta.self_policy_hash === 'string' && (a.meta.self_policy_hash as string).length === 64
  && typeof a.meta.opponent_policy_hash === 'string' && (a.meta.opponent_policy_hash as string).length === 64);
check('full simulator state includes auxiliary fields', Object.hasOwn(a.observations[0]?.self_fighter ?? {}, 'blocking')
  && Object.hasOwn(a.observations[0]?.self_fighter ?? {}, 'phase_t'));

const serialized = JSON.stringify(first);
check('export contains no transport or credential material', !/token|private_key|authorization|ssh-rsa|ed25519/i.test(serialized));

console.log(pass ? '\nSIM TRAINING EXPORT TEST: PASS' : '\nSIM TRAINING EXPORT TEST: FAIL');
process.exit(pass ? 0 : 1);

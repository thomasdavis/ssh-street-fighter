import { ACTION_ORDER, TRAINING_SCHEMA, buildTrainingRecords, decodeReplayActions, validateArtifacts } from './tools/export-training-data.js';
import type { MatchRow, ReplayPayload, TrackFrame, TrackPayload } from './tools/export-training-data.js';

let pass = true;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); if (!ok) pass = false; };

const match: MatchRow = {
  id: 'training-fixture', mode: 'versus', stage: 'dojo', seed: 73, engine_version: 'sf-5',
  a_name: 'PRIVATE_A', b_name: 'PRIVATE_B', a_fp: 'SHA256:secret-a', b_fp: 'SHA256:secret-b',
  a_char: 'CODEX', b_char: 'MNEME', winner: 'b', a_rounds: 0, b_rounds: 2, end_reason: 'ko', duration_frames: 3,
  a_elo_before: 1200, a_elo_after: 1184, b_elo_before: 1200, b_elo_after: 1216,
};
const frame = (aHp: number, bHp: number, phase: string): TrackFrame => ({
  a: [82, 0, 1, aHp], b: [158, 0, -1, bHp], asp: 'idle_1', aa: 'none', aAct: false,
  bsp: 'idle_1', ba: 'none', bAct: false, pr: [], ph: phase, rd: phase === 'match-over' ? 3 : 1, msg: phase,
});
const track: TrackPayload = {
  stage: 'dojo', aChar: 'CODEX', bChar: 'MNEME', aName: 'PRIVATE_A', bName: 'PRIVATE_B', fps: 30,
  worldW: 240, worldH: 135, groundY: 112, fighterH: 58, stageLeft: 18, stageRight: 222,
  frames: [frame(100, 100, 'countdown'), frame(100, 92, 'fight'), frame(88, 92, 'match-over')],
};
const replay: ReplayPayload = {
  match_id: match.id,
  header: {
    motions: ['', 'DR'], stage: 'dojo', seed: 73, format: 'flags8+motion8/side',
    sides: { a: { char: 'CODEX', name: 'PRIVATE_A', fp: 'SHA256:secret-a' }, b: { char: 'MNEME', name: 'PRIVATE_B', fp: 'SHA256:secret-b' } },
  },
  keyframes: [{ f: 0, round: 1, phase: 'countdown', a: { x: 82, y: 0, hp: 100 }, b: { x: 158, y: 0, hp: 100 } }],
  frame_count: 3,
  frames_b64: Buffer.from([
    1, 0, 1, 0,
    1 | (1 << 4), 1, 1 | (1 << 2), 0,
    0, 0, 2 | (1 << 5), 0,
  ]).toString('base64'),
};

const actions = decodeReplayActions(replay);
check('replay codec preserves canonical action order', ACTION_ORDER.join(',') === 'moveX,down,jump,punch,kick,throw,motion');
check('replay codec decodes flags and motions', actions[1]?.a.punch === true && actions[1]?.a.motion === 'DR' && actions[1]?.b.jump === true);
check('fixture artifacts validate', validateArtifacts(match, replay, track).length === 0, validateArtifacts(match, replay, track).join('; '));

const records = buildTrainingRecords({ match, replay, track, baseUrl: 'https://example.invalid', exporterSourceCommit: 'fixture-sha', retrievedAt: '2026-08-19T00:00:00.000Z' });
const episode = records[0];
const transitions = records.slice(1);
check('one episode and frame_count-1 transitions are emitted', episode?.record_type === 'episode' && transitions.length === 2);
check('action zero is omitted and action one aligns to transition zero', transitions[0]?.record_type === 'transition' && transitions[0].t === 0 && transitions[0].action_frame === 1 && transitions[0].action.a.punch);
check('HP-delta rewards are side symmetric', transitions[0]?.record_type === 'transition' && transitions[0].reward.a === 8 && transitions[0].reward.b === -8
  && transitions[1]?.record_type === 'transition' && transitions[1].reward.a === -12 && transitions[1].reward.b === 12);
check('only the final match-over transition terminates', transitions[0]?.record_type === 'transition' && !transitions[0].terminated
  && transitions[1]?.record_type === 'transition' && transitions[1].terminated);

const serialized = records.map((record) => JSON.stringify(record)).join('\n');
check('records omit handles and fingerprints', !serialized.includes('PRIVATE_A') && !serialized.includes('PRIVATE_B') && !serialized.includes('SHA256:secret'));
check('records carry stable schema and source/deploy distinction', serialized.includes(TRAINING_SCHEMA) && serialized.includes('"deploy_commit":null'));

const broken = structuredClone(replay); broken.frame_count = 4;
check('frame-count corruption is rejected', validateArtifacts(match, broken, track).some((reason) => reason.includes('frame_count')));

console.log(pass ? '\nTRAINING EXPORT TEST: PASS' : '\nTRAINING EXPORT TEST: FAIL');
process.exit(pass ? 0 : 1);

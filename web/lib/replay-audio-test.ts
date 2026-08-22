import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { characterAudioProfile, replayAudioCues, replayAudioIntensity, replayStudioAssetUrls, stageAudioProfile } from './replay-audio.js';
import type { Frame } from './replay-render.js';

let pass = true;
const check = (name: string, condition: boolean, extra = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`);
  if (!condition) pass = false;
};

const frame = (patch: Partial<Frame> = {}): Frame => ({
  a: [64, 0, 1, 100], b: [176, 0, -1, 100],
  asp: 'idle_1', aa: 'none', aAct: false,
  bsp: 'idle_1', ba: 'none', bAct: false,
  pr: [], ph: 'fight', rd: 1, msg: '', ...patch,
});

const attack = replayAudioCues(frame(), frame({ aa: 'punch', asp: 'punch_1' }));
check('normal attack startup emits a side-specific cue', attack.some((c) => c.kind === 'attack' && c.side === 'a' && c.attack === 'punch'));

const cleanHit = replayAudioCues(frame({ aa: 'kick', aAct: true }), frame({ aa: 'kick', aAct: true, b: [176, 0, -1, 87], bsp: 'hit' }));
check('clean hit emits a weighted impact', cleanHit.some((c) => c.kind === 'impact' && !c.blocked && (c.weight ?? 0) > .7));

const block = replayAudioCues(frame({ aa: 'hadouken', aAct: true, bsp: 'block' }), frame({ aa: 'hadouken', aAct: true, b: [176, 0, -1, 97], bsp: 'block' }));
check('chip damage against a guard emits the dedicated block material', block.some((c) => c.kind === 'impact' && c.blocked));

const movement = replayAudioCues(frame({ asp: 'walk_1' }), frame({ a: [66, 7, 1, 100], asp: 'walk_2' }));
check('fighter motion emits footwork and takeoff', movement.some((c) => c.kind === 'step') && movement.some((c) => c.kind === 'jump'));

const projectile = replayAudioCues(frame(), frame({ pr: [[82, 30, 0, 'citation']] }));
check('projectile spawn carries owner and material', projectile.some((c) => c.kind === 'projectile' && c.side === 'a' && c.style === 'citation'));

const finale = replayAudioCues(frame({ ph: 'fight', b: [176, 0, -1, 8] }), frame({ ph: 'match-over', a: [64, 0, 1, 100], b: [176, 0, -1, 0], asp: 'victory_1', bsp: 'ko' }));
check('match finish emits impact, KO and winner signature', ['impact', 'ko', 'victory'].every((kind) => finale.some((c) => c.kind === kind)));

const quiet = replayAudioIntensity(frame());
const hot = replayAudioIntensity(frame({ a: [64, 12, 1, 22], b: [104, 0, -1, 47], aa: 'hurricane', aAct: true, pr: [[90, 30, 0, 'fire'], [130, 26, 1, 'mote']] }));
check('music intensity rises with danger and activity', hot > quiet, `${quiet.toFixed(2)}→${hot.toFixed(2)}`);

const stages = ['airbase', 'bamboo', 'canyon', 'carnival', 'cathedral', 'dojo', 'harbor', 'jungle', 'market', 'monsoon', 'neon', 'observatory', 'orbital', 'reef', 'tundra', 'volcano'];
check('every arena has an authored score profile', stages.every((stage) => stageAudioProfile(stage).title !== 'Unknown Signal'), `stages=${stages.length}`);

const studioAssets = [...new Set(stages.flatMap(replayStudioAssetUrls))];
const assetPath = (url: string) => resolve('web/public', url.slice(1));
check('studio source library is present and non-empty', studioAssets.every((url) => existsSync(assetPath(url)) && statSync(assetPath(url)).size > 4_000), `assets=${studioAssets.length}`);
check('stage profiles use recorded score masters and physical surfaces', stages.every((stage) => stageAudioProfile(stage).music.endsWith('.mp3') && !!stageAudioProfile(stage).surface));

const fighters = ['BYU', 'MEN', 'BLANKO', 'CHONG', 'GYLE', 'ZANG', 'DHAL', 'HONDO', 'KIRA', 'MAKO', 'OMEGA', 'CODEX', 'FABLE', 'MNEME', 'AJAX', 'XENON', 'MEGAWATTS', 'UNCLOSE'];
const signatures = fighters.map((fighter) => characterAudioProfile(fighter));
check('every fighter has a unique sonic identity', signatures.every((profile) => profile.signature !== 'Unknown contender') && new Set(signatures.map((profile) => profile.signature)).size === fighters.length, `fighters=${fighters.length}`);
check('heavy and phase fighters occupy different physical palettes', characterAudioProfile('ZANG').weight > .9 && characterAudioProfile('XENON').material === 'phase');
check('every fighter receives a distinct studio treatment', new Set(signatures.map((profile) => `${profile.pitch}/${profile.presence}/${profile.space}`)).size === fighters.length);

const mixerSource = readFileSync(resolve('web/lib/replay-audio.ts'), 'utf8');
check('the replay mixer contains no oscillator-based sound generator', !mixerSource.includes('createOscillator') && !mixerSource.includes('OscillatorType'));

if (!pass) process.exit(1);
console.log('REPLAY AUDIO TEST: PASS');

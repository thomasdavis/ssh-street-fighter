import type { Frame } from './replay-render';

const AUDIO_ROOT = '/audio/replay-studio';

export interface StageAudioProfile {
  id: string;
  title: string;
  music: string;
  surface: 'concrete' | 'grass' | 'snow' | 'wood';
  room: number;
  color: 'warm' | 'steel' | 'rain' | 'glass' | 'deep';
}

export interface CharacterAudioProfile {
  id: string;
  signature: string;
  weight: number;
  pitch: number;
  presence: number;
  space: number;
  material: 'cloth' | 'fire' | 'electric' | 'sonic' | 'iron' | 'phase' | 'ink' | 'memory' | 'signal' | 'water';
}

const STAGE_PROFILES: Record<string, Omit<StageAudioProfile, 'id'>> = {
  airbase: { title: 'Runway Pressure', music: `${AUDIO_ROOT}/music/urgent.mp3`, surface: 'concrete', room: .24, color: 'steel' },
  bamboo: { title: 'Green Stillness', music: `${AUDIO_ROOT}/music/airy.mp3`, surface: 'wood', room: .42, color: 'warm' },
  canyon: { title: 'Redline Echo', music: `${AUDIO_ROOT}/music/sector.mp3`, surface: 'concrete', room: .58, color: 'deep' },
  carnival: { title: 'Midnight Midway', music: `${AUDIO_ROOT}/music/pulse.mp3`, surface: 'wood', room: .34, color: 'warm' },
  cathedral: { title: 'Iron Vespers', music: `${AUDIO_ROOT}/music/transmission.mp3`, surface: 'concrete', room: .74, color: 'deep' },
  dojo: { title: 'First Bell', music: `${AUDIO_ROOT}/music/airy.mp3`, surface: 'wood', room: .3, color: 'warm' },
  harbor: { title: 'Dockside Current', music: `${AUDIO_ROOT}/music/sector.mp3`, surface: 'wood', room: .48, color: 'rain' },
  jungle: { title: 'Canopy Pressure', music: `${AUDIO_ROOT}/music/pulse.mp3`, surface: 'grass', room: .54, color: 'deep' },
  market: { title: 'Closing Time', music: `${AUDIO_ROOT}/music/urgent.mp3`, surface: 'concrete', room: .4, color: 'warm' },
  monsoon: { title: 'Rain Circuit', music: `${AUDIO_ROOT}/music/sector.mp3`, surface: 'concrete', room: .5, color: 'rain' },
  neon: { title: 'Voltage Afterimage', music: `${AUDIO_ROOT}/music/pulse.mp3`, surface: 'concrete', room: .58, color: 'glass' },
  observatory: { title: 'Perihelion', music: `${AUDIO_ROOT}/music/airy.mp3`, surface: 'concrete', room: .64, color: 'glass' },
  orbital: { title: 'Low Gravity Signal', music: `${AUDIO_ROOT}/music/transmission.mp3`, surface: 'concrete', room: .72, color: 'steel' },
  reef: { title: 'Blue Counterpoint', music: `${AUDIO_ROOT}/music/airy.mp3`, surface: 'grass', room: .46, color: 'glass' },
  tundra: { title: 'White Horizon', music: `${AUDIO_ROOT}/music/sector.mp3`, surface: 'snow', room: .62, color: 'deep' },
  volcano: { title: 'Magma Crown', music: `${AUDIO_ROOT}/music/urgent.mp3`, surface: 'concrete', room: .56, color: 'deep' },
};

const CHARACTER_PROFILES: Record<string, Omit<CharacterAudioProfile, 'id'>> = {
  BYU: { signature: 'Focused flame', weight: .52, pitch: 1.015, presence: 2100, space: .22, material: 'cloth' },
  MEN: { signature: 'Burning pressure', weight: .6, pitch: .99, presence: 1650, space: .3, material: 'fire' },
  BLANKO: { signature: 'Feral voltage', weight: .74, pitch: .97, presence: 2600, space: .18, material: 'electric' },
  CHONG: { signature: 'Silk lightning', weight: .38, pitch: 1.035, presence: 3400, space: .24, material: 'electric' },
  GYLE: { signature: 'Mach-cut air', weight: .58, pitch: 1.02, presence: 3100, space: .18, material: 'sonic' },
  ZANG: { signature: 'Iron heartbeat', weight: 1, pitch: .93, presence: 1100, space: .16, material: 'iron' },
  DHAL: { signature: 'Breath and ember', weight: .34, pitch: 1.045, presence: 2400, space: .42, material: 'fire' },
  HONDO: { signature: 'Hundred-hand drum', weight: .9, pitch: .95, presence: 1350, space: .2, material: 'iron' },
  KIRA: { signature: 'Zero-point glass', weight: .42, pitch: 1.055, presence: 4100, space: .58, material: 'phase' },
  MAKO: { signature: 'Moon tide', weight: .48, pitch: 1.03, presence: 2700, space: .5, material: 'water' },
  OMEGA: { signature: 'Crimson gravity', weight: .94, pitch: .92, presence: 900, space: .66, material: 'signal' },
  CODEX: { signature: 'Branching proof', weight: .62, pitch: 1.005, presence: 2300, space: .4, material: 'signal' },
  FABLE: { signature: 'Living ink', weight: .44, pitch: 1.04, presence: 1850, space: .62, material: 'ink' },
  MNEME: { signature: 'Memory bell', weight: .5, pitch: 1.05, presence: 3800, space: .68, material: 'memory' },
  AJAX: { signature: 'Returning steel', weight: .68, pitch: .985, presence: 2900, space: .3, material: 'iron' },
  XENON: { signature: 'Phase afterimage', weight: .36, pitch: 1.06, presence: 4500, space: .72, material: 'phase' },
  MEGAWATTS: { signature: 'Open-circuit storm', weight: .72, pitch: .975, presence: 3300, space: .5, material: 'electric' },
  UNCLOSE: { signature: 'Token fracture', weight: .46, pitch: 1.025, presence: 3600, space: .55, material: 'signal' },
};

export function characterAudioProfile(character: string): CharacterAudioProfile {
  const id = character.toUpperCase();
  return { id, ...(CHARACTER_PROFILES[id] ?? { signature: 'Unknown contender', weight: .55, pitch: 1, presence: 2200, space: .3, material: 'cloth' }) };
}

export function stageAudioProfile(stage: string): StageAudioProfile {
  const id = stage.toLowerCase();
  const known = STAGE_PROFILES[id];
  if (known) return { id, ...known };
  let hash = 0;
  for (const character of id) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return {
    id,
    title: 'Unknown Signal',
    music: `${AUDIO_ROOT}/music/${['sector', 'airy', 'pulse', 'urgent', 'transmission'][hash % 5]}.mp3`,
    surface: (['concrete', 'grass', 'snow', 'wood'] as const)[hash % 4]!,
    room: .34 + (hash % 30) / 100,
    color: (['warm', 'steel', 'rain', 'glass', 'deep'] as const)[hash % 5]!,
  };
}

export type AudioCueKind = 'attack' | 'impact' | 'guard' | 'jump' | 'land' | 'step'
  | 'projectile' | 'clash' | 'round' | 'fight' | 'ko' | 'victory';

export interface ReplayAudioCue {
  kind: AudioCueKind;
  pan: number;
  side?: 'a' | 'b';
  attack?: string;
  style?: string;
  weight?: number;
  blocked?: boolean;
  armored?: boolean;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const isGuard = (pose: string) => pose === 'block' || pose === 'crouchblock';
const sidePose = (frame: Frame, side: 'a' | 'b') => side === 'a' ? frame.asp : frame.bsp;
const sideAttack = (frame: Frame, side: 'a' | 'b') => side === 'a' ? frame.aa : frame.ba;
const sideState = (frame: Frame, side: 'a' | 'b') => side === 'a' ? frame.a : frame.b;
const panAt = (x: number, worldW = 240) => clamp((x / worldW) * 2 - 1, -0.88, 0.88);

function projectileCounts(frame: Frame): Map<string, number> {
  const counts = new Map<string, number>();
  for (const projectile of frame.pr) counts.set(projectile[3], (counts.get(projectile[3]) ?? 0) + 1);
  return counts;
}

/** Derive audible moments from authoritative replay frames without replaying
 * history after a seek. */
export function replayAudioCues(previous: Frame, current: Frame, worldW = 240): ReplayAudioCue[] {
  const cues: ReplayAudioCue[] = [];
  if (current.rd !== previous.rd) cues.push({ kind: 'round', pan: 0, weight: current.rd });
  if (current.msg !== previous.msg && current.msg.toUpperCase().includes('FIGHT')) cues.push({ kind: 'fight', pan: 0 });
  if (current.ph === 'match-over' && previous.ph !== 'match-over') {
    const side = current.asp.startsWith('victory') ? 'a' : current.bsp.startsWith('victory') ? 'b' : current.a[3] >= current.b[3] ? 'a' : 'b';
    cues.push({ kind: 'victory', side, pan: panAt(sideState(current, side)[0], worldW) });
  }

  for (const side of ['a', 'b'] as const) {
    const now = sideState(current, side), before = sideState(previous, side);
    const pose = sidePose(current, side), oldPose = sidePose(previous, side);
    const attack = sideAttack(current, side), oldAttack = sideAttack(previous, side);
    const pan = panAt(now[0], worldW);
    if (attack !== 'none' && attack !== oldAttack) cues.push({ kind: 'attack', side, attack, pan });
    if (isGuard(pose) && !isGuard(oldPose)) cues.push({ kind: 'guard', side, pan });
    if (before[1] <= .05 && now[1] > .05) cues.push({ kind: 'jump', side, pan });
    if (before[1] > .05 && now[1] <= .05) cues.push({ kind: 'land', side, pan, weight: clamp(Math.abs(before[1] - now[1]) / 16, .25, 1) });
    if (pose.startsWith('walk_') && oldPose.startsWith('walk_') && pose !== oldPose) cues.push({ kind: 'step', side, pan });

    const damage = Math.max(0, before[3] - now[3]);
    if (damage > 0) {
      const blocked = isGuard(pose) || isGuard(oldPose);
      const armored = !blocked && attack === 'armor';
      cues.push({ kind: 'impact', side: side === 'a' ? 'b' : 'a', pan, weight: clamp(damage / 16, .18, 1), blocked, armored });
      if (now[3] <= 0 && before[3] > 0) cues.push({ kind: 'ko', side, pan });
    }
  }

  const beforeProjectiles = projectileCounts(previous);
  const nowProjectiles = projectileCounts(current);
  for (const [style, count] of nowProjectiles) {
    const added = count - (beforeProjectiles.get(style) ?? 0);
    if (added <= 0) continue;
    const projectile = current.pr.find((item) => item[3] === style);
    const side = projectile?.[2] === 1 ? 'b' : 'a';
    for (let index = 0; index < Math.min(added, 3); index++) cues.push({ kind: 'projectile', side, style, pan: panAt(projectile?.[0] ?? 120, worldW) });
  }
  const removed = previous.pr.length - current.pr.length;
  const healthChanged = previous.a[3] !== current.a[3] || previous.b[3] !== current.b[3];
  if (removed >= 2 && !healthChanged) {
    const x = previous.pr.reduce((sum, projectile) => sum + projectile[0], 0) / Math.max(1, previous.pr.length);
    cues.push({ kind: 'clash', pan: panAt(x, worldW), weight: clamp(removed / 3, .3, 1) });
  }
  return cues;
}

export function replayAudioIntensity(frame: Frame): number {
  const lowHealth = 1 - Math.min(frame.a[3], frame.b[3]) / 100;
  const active = Number(frame.aAct) + Number(frame.bAct);
  const movement = Math.min(1, (Math.abs(frame.a[0] - frame.b[0]) < 52 ? .25 : 0) + (frame.a[1] > 0 || frame.b[1] > 0 ? .2 : 0));
  const projectiles = Math.min(.35, frame.pr.length * .08);
  const phase = frame.ph === 'fight' ? .12 : -.12;
  return clamp(.18 + lowHealth * .42 + active * .1 + movement + projectiles + phase, .08, 1);
}

export interface ReplayAudioSettings {
  music: boolean;
  effects: boolean;
  volume: number;
}

export const DEFAULT_REPLAY_AUDIO_SETTINGS: ReplayAudioSettings = { music: true, effects: true, volume: .68 };
export const REPLAY_AUDIO_STORAGE_KEY = 'sshfighter:replay-audio:v1';

export function readReplayAudioSettings(): ReplayAudioSettings {
  if (typeof window === 'undefined') return DEFAULT_REPLAY_AUDIO_SETTINGS;
  try {
    const value = JSON.parse(window.localStorage.getItem(REPLAY_AUDIO_STORAGE_KEY) ?? '{}') as Partial<ReplayAudioSettings>;
    return {
      music: typeof value.music === 'boolean' ? value.music : true,
      effects: typeof value.effects === 'boolean' ? value.effects : true,
      volume: typeof value.volume === 'number' ? clamp(value.volume, 0, 1) : DEFAULT_REPLAY_AUDIO_SETTINGS.volume,
    };
  } catch { return DEFAULT_REPLAY_AUDIO_SETTINGS; }
}

export function writeReplayAudioSettings(settings: ReplayAudioSettings): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(REPLAY_AUDIO_STORAGE_KEY, JSON.stringify(settings)); } catch { /* preferences are best effort */ }
}

const foley = (file: string) => `${AUDIO_ROOT}/foley/${file}`;
const series = (name: string) => Array.from({ length: 5 }, (_, index) => foley(`${name}_${String(index).padStart(3, '0')}.ogg`));

const STUDIO_ASSETS = {
  face: foley('face-punches.mp3'),
  kick: foley('power-kicks.mp3'),
  bag: foley('bag-impacts.mp3'),
  air: foley('air-movement.mp3'),
  blade: foley('blade-whoosh.mp3'),
  energy: foley('energy-discharge.mp3'),
  electric: foley('electricity.mp3'),
  phase: foley('phase-shift.mp3'),
  fall: foley('body-fall.mp3'),
  victory: foley('victory.mp3'),
  bell: series('impactBell_heavy'),
  metalHeavy: series('impactMetal_heavy'),
  metalLight: series('impactMetal_light'),
  punchHeavy: series('impactPunch_heavy'),
  punchMedium: series('impactPunch_medium'),
  softHeavy: series('impactSoft_heavy'),
} as const;

const MULTI_TAKE_ASSETS = new Set<string>([STUDIO_ASSETS.face, STUDIO_ASSETS.kick, STUDIO_ASSETS.bag, STUDIO_ASSETS.air]);

export function replayStudioAssetUrls(stage: string): string[] {
  const profile = stageAudioProfile(stage);
  return [
    profile.music,
    STUDIO_ASSETS.face, STUDIO_ASSETS.kick, STUDIO_ASSETS.bag, STUDIO_ASSETS.air,
    STUDIO_ASSETS.blade, STUDIO_ASSETS.energy, STUDIO_ASSETS.electric, STUDIO_ASSETS.phase,
    STUDIO_ASSETS.fall, STUDIO_ASSETS.victory,
    ...STUDIO_ASSETS.bell, ...STUDIO_ASSETS.metalHeavy, ...STUDIO_ASSETS.metalLight,
    ...STUDIO_ASSETS.punchHeavy, ...STUDIO_ASSETS.punchMedium, ...STUDIO_ASSETS.softHeavy,
    ...series(`footstep_${profile.surface}`),
  ];
}

interface SoundscapeMeta { stage: string; worldW: number; fps: number; aChar: string; bChar: string; }

interface SampleOptions {
  gain: number;
  pan?: number;
  when?: number;
  rate?: number;
  profile?: CharacterAudioProfile;
  duration?: number;
  lowpass?: number;
  highpass?: number;
  reverb?: number;
  slice?: boolean;
}

/** Recorded-foley replay mix. Every audible event comes from a decoded source
 * recording; Web Audio is used only for editing, spatialization and mastering. */
export class ReplaySoundscape {
  readonly profile: StageAudioProfile;
  readonly fighters: { a: CharacterAudioProfile; b: CharacterAudioProfile };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private musicTone: BiquadFilterNode | null = null;
  private musicDuck: GainNode | null = null;
  private reverbInput: GainNode | null = null;
  private reverbReturn: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicStartedAt = 0;
  private musicOffset = 0;
  private buffers = new Map<string, AudioBuffer>();
  private peaks = new Map<string, number>();
  private onsets = new Map<string, number[]>();
  private loading: Promise<boolean> | null = null;
  private eventSerial = 0;
  private previous: Frame | null = null;
  private enabled = false;
  private playing = false;
  private visible = true;
  private speed = 1;
  private intensity = .2;
  private settings = DEFAULT_REPLAY_AUDIO_SETTINGS;

  constructor(private readonly meta: SoundscapeMeta) {
    this.profile = stageAudioProfile(meta.stage);
    this.fighters = { a: characterAudioProfile(meta.aChar), b: characterAudioProfile(meta.bChar) };
  }

  static supported(): boolean {
    return typeof window !== 'undefined' && !!(window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  }

  async activate(settings: ReplayAudioSettings): Promise<boolean> {
    if (!ReplaySoundscape.supported()) return false;
    this.settings = settings;
    if (!this.ctx) this.buildGraph();
    if (!this.ctx) return false;
    try { await this.ctx.resume(); } catch { return false; }
    const loaded = await (this.loading ??= this.loadAssets());
    if (!loaded) return false;
    this.enabled = true;
    this.applyMix(.12);
    this.syncMusic();
    return true;
  }

  deactivate(): void {
    this.enabled = false;
    this.stopMusic();
    this.applyMix(.08);
  }

  configure(settings: ReplayAudioSettings): void {
    this.settings = { ...settings, volume: clamp(settings.volume) };
    this.applyMix(.04);
    this.syncMusic();
  }

  setPlayback(playing: boolean, speed = this.speed): void {
    this.playing = playing;
    this.speed = clamp(speed, .35, 2.5);
    this.applyMix(.08);
    this.syncMusic();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyMix(.08);
    this.syncMusic();
  }

  seek(frame: Frame | undefined, frameIndex: number): void {
    this.previous = frame ?? null;
    this.eventSerial = Math.max(0, frameIndex);
    this.intensity = frame ? replayAudioIntensity(frame) : .2;
    this.updateScore();
  }

  observe(frame: Frame, frameIndex: number): void {
    const previous = this.previous;
    this.previous = frame;
    this.intensity = replayAudioIntensity(frame);
    this.updateScore();
    if (!previous || !this.enabled || !this.playing || !this.visible || !this.settings.effects) return;
    for (const cue of replayAudioCues(previous, frame, this.meta.worldW)) this.playCue(cue, frameIndex);
  }

  async dispose(): Promise<void> {
    this.enabled = false;
    this.stopMusic();
    if (this.ctx && this.ctx.state !== 'closed') try { await this.ctx.close(); } catch { /* browser teardown */ }
    this.ctx = null;
  }

  private buildGraph(): void {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.knee.value = 10; compressor.ratio.value = 3.5; compressor.attack.value = .006; compressor.release.value = .18;
    const master = ctx.createGain(); master.gain.value = .0001;
    const music = ctx.createGain(); music.gain.value = .0001;
    const effects = ctx.createGain(); effects.gain.value = .0001;
    const musicTone = ctx.createBiquadFilter(); musicTone.type = 'lowpass'; musicTone.frequency.value = 5600; musicTone.Q.value = .3;
    const musicDuck = ctx.createGain(); musicDuck.gain.value = 1;
    const reverbInput = ctx.createGain();
    const convolver = ctx.createConvolver(); convolver.buffer = this.roomImpulse(ctx, .7 + this.profile.room * 1.5);
    const reverbReturn = ctx.createGain(); reverbReturn.gain.value = .14 + this.profile.room * .12;
    musicTone.connect(musicDuck); musicDuck.connect(music); music.connect(master);
    effects.connect(master); reverbInput.connect(convolver); convolver.connect(reverbReturn); reverbReturn.connect(master);
    master.connect(compressor); compressor.connect(ctx.destination);
    this.ctx = ctx; this.master = master; this.musicBus = music; this.effectsBus = effects;
    this.musicTone = musicTone; this.musicDuck = musicDuck; this.reverbInput = reverbInput; this.reverbReturn = reverbReturn;
  }

  private roomImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 0x5f3759df;
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const reflection = index % Math.max(1, Math.floor(ctx.sampleRate * (.031 + channel * .006))) < 3 ? .32 : 1;
        data[index] = ((seed / 0xffffffff) * 2 - 1) * reflection * (1 - index / length) ** 2.8;
      }
    }
    return impulse;
  }

  private async loadAssets(): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx) return false;
    await Promise.allSettled(replayStudioAssetUrls(this.profile.id).map(async (url) => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`audio ${response.status}: ${url}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(url, buffer);
      this.peaks.set(url, this.measurePeak(buffer));
      if (MULTI_TAKE_ASSETS.has(url)) this.onsets.set(url, this.detectOnsets(buffer));
    }));
    return [this.profile.music, STUDIO_ASSETS.face, STUDIO_ASSETS.air, STUDIO_ASSETS.energy].every((url) => this.buffers.has(url));
  }

  private detectOnsets(buffer: AudioBuffer): number[] {
    const data = buffer.getChannelData(0);
    const windowSize = Math.max(64, Math.floor(buffer.sampleRate * .012));
    const envelope: number[] = [];
    for (let start = 0; start < data.length; start += windowSize) {
      let peak = 0;
      for (let index = start; index < Math.min(data.length, start + windowSize); index++) peak = Math.max(peak, Math.abs(data[index]!));
      envelope.push(peak);
    }
    const maximum = Math.max(...envelope, .001);
    const threshold = maximum * .27;
    const onsets: number[] = [];
    let armed = true;
    for (let index = 1; index < envelope.length; index++) {
      const time = index * windowSize / buffer.sampleRate;
      if (envelope[index]! < threshold * .48) armed = true;
      if (armed && envelope[index]! >= threshold && time - (onsets.at(-1) ?? -1) > .16) {
        onsets.push(Math.max(0, time - .018));
        armed = false;
      }
    }
    return onsets.length ? onsets : [0];
  }

  private measurePeak(buffer: AudioBuffer): number {
    let peak = .001;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 8) peak = Math.max(peak, Math.abs(data[index]!));
    }
    return peak;
  }

  private targetActive(): boolean { return this.enabled && this.playing && this.visible; }

  private ramp(param: AudioParam | undefined, value: number, duration: number): void {
    const ctx = this.ctx;
    if (!ctx || !param) return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(.0001, param.value), now);
    param.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  private applyMix(duration: number): void {
    const active = this.targetActive();
    this.ramp(this.master?.gain, this.enabled && this.visible ? Math.max(.0001, this.settings.volume) : .0001, duration);
    this.ramp(this.musicBus?.gain, active && this.settings.music ? .19 + this.intensity * .035 : .0001, duration);
    this.ramp(this.effectsBus?.gain, this.enabled && this.visible && this.settings.effects ? .86 : .0001, duration);
    this.ramp(this.reverbReturn?.gain, this.enabled && this.visible && this.settings.effects ? .12 + this.profile.room * .1 : .0001, duration);
    this.updateScore();
  }

  private updateScore(): void {
    const ctx = this.ctx, tone = this.musicTone;
    if (!ctx || !tone) return;
    const now = ctx.currentTime;
    tone.frequency.cancelScheduledValues(now);
    tone.frequency.setTargetAtTime(3200 + this.intensity * 6200, now, .18);
  }

  private syncMusic(): void {
    if (this.targetActive() && this.settings.music) this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    const ctx = this.ctx, destination = this.musicTone, buffer = this.buffers.get(this.profile.music);
    if (!ctx || !destination || !buffer || this.musicSource) return;
    const source = ctx.createBufferSource();
    const trim = ctx.createGain();
    trim.gain.value = clamp(.72 / (this.peaks.get(this.profile.music) ?? .72), .5, 12);
    source.buffer = buffer; source.loop = true; source.connect(trim); trim.connect(destination);
    const offset = ((this.musicOffset % buffer.duration) + buffer.duration) % buffer.duration;
    this.musicStartedAt = ctx.currentTime;
    this.musicSource = source;
    source.start(ctx.currentTime + .01, offset);
  }

  private stopMusic(): void {
    const ctx = this.ctx, source = this.musicSource, buffer = this.buffers.get(this.profile.music);
    if (!source) return;
    if (ctx && buffer) this.musicOffset = (this.musicOffset + Math.max(0, ctx.currentTime - this.musicStartedAt)) % buffer.duration;
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    this.musicSource = null;
  }

  private duckMusic(amount: number, release = .28): void {
    const ctx = this.ctx, duck = this.musicDuck;
    if (!ctx || !duck) return;
    const now = ctx.currentTime;
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(Math.max(.001, duck.gain.value), now);
    duck.gain.linearRampToValueAtTime(clamp(amount, .18, 1), now + .012);
    duck.gain.exponentialRampToValueAtTime(1, now + release);
  }

  private fighter(side?: 'a' | 'b'): CharacterAudioProfile {
    return side ? this.fighters[side] : this.fighters.a;
  }

  private choose(urls: readonly string[], salt = 0): string {
    return urls[Math.abs(this.eventSerial + salt) % urls.length]!;
  }

  private sample(url: string, options: SampleOptions): void {
    const ctx = this.ctx, effects = this.effectsBus, reverbInput = this.reverbInput, buffer = this.buffers.get(url);
    if (!ctx || !effects || !reverbInput || !buffer || !this.enabled || !this.visible || !this.settings.effects) return;
    const profile = options.profile;
    const when = Math.max(ctx.currentTime, options.when ?? ctx.currentTime + .006);
    const rate = clamp((options.rate ?? 1) * (profile?.pitch ?? 1), .82, 1.18);
    const source = ctx.createBufferSource(); source.buffer = buffer; source.playbackRate.setValueAtTime(rate, when);
    const highpass = ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = options.highpass ?? 34;
    const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = options.lowpass ?? 15000;
    const presence = ctx.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = profile?.presence ?? 2200; presence.Q.value = .72;
    presence.gain.value = profile ? (profile.material === 'phase' || profile.material === 'memory' ? 2.5 : profile.weight > .8 ? -1.5 : 1.2) : 0;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(Math.max(.0001, options.gain), when);
    const panner = ctx.createStereoPanner(); panner.pan.value = clamp(options.pan ?? 0, -1, 1);
    const send = ctx.createGain(); send.gain.value = clamp(options.reverb ?? profile?.space ?? this.profile.room, 0, 1) * .42;
    source.connect(highpass); highpass.connect(lowpass); lowpass.connect(presence); presence.connect(gain); gain.connect(panner);
    panner.connect(effects); panner.connect(send); send.connect(reverbInput);
    let offset = 0;
    if (options.slice) {
      const onsets = this.onsets.get(url) ?? [0];
      offset = onsets[Math.abs(this.eventSerial) % onsets.length]!;
    }
    const available = Math.max(.03, (buffer.duration - offset) / rate);
    const duration = Math.min(options.duration ?? available, available);
    if (options.duration || options.slice) {
      gain.gain.setValueAtTime(Math.max(.0001, options.gain), when + Math.max(.01, duration - .035));
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      source.start(when, offset, duration * rate);
      source.stop(when + duration + .02);
    } else source.start(when, offset);
  }

  private playCue(cue: ReplayAudioCue, frameIndex: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime + .008;
    this.eventSerial = frameIndex + this.eventSerial + 1;
    switch (cue.kind) {
      case 'attack': this.attackCue(cue, when); break;
      case 'impact': this.impactCue(cue, when); break;
      case 'guard': this.guardCue(cue, when); break;
      case 'jump': this.movementCue(cue, when, 'jump'); break;
      case 'land': this.movementCue(cue, when, 'land'); break;
      case 'step': this.movementCue(cue, when, 'step'); break;
      case 'projectile': this.projectileCue(cue, when); break;
      case 'clash': this.clashCue(cue, when); break;
      case 'round': this.roundCue(when); break;
      case 'fight': this.sample(STUDIO_ASSETS.air, { gain: .13, when, duration: .44, slice: true, reverb: .5 }); break;
      case 'ko': this.koCue(when, cue.pan, this.fighter(cue.side)); break;
      case 'victory': if (frameIndex > 20) this.victoryCue(when, this.fighter(cue.side)); break;
    }
  }

  private guardCue(cue: ReplayAudioCue, when: number): void {
    const fighter = this.fighter(cue.side);
    const metallic = fighter.material === 'iron' || fighter.material === 'signal';
    this.sample(this.choose(metallic ? STUDIO_ASSETS.metalLight : STUDIO_ASSETS.softHeavy), {
      gain: .055 + fighter.weight * .025, when, pan: cue.pan, profile: fighter, highpass: metallic ? 300 : 70, reverb: .18,
    });
  }

  private movementCue(cue: ReplayAudioCue, when: number, kind: 'jump' | 'land' | 'step'): void {
    const fighter = this.fighter(cue.side);
    const mass = fighter.weight;
    if (kind === 'jump') {
      this.sample(STUDIO_ASSETS.air, { gain: .045 + mass * .025, when, pan: cue.pan, duration: .24, slice: true, profile: fighter, highpass: 160, reverb: .16 });
      return;
    }
    if (kind === 'land') {
      this.sample(this.choose(series(`footstep_${this.profile.surface}`)), { gain: .06 + mass * .05, when, pan: cue.pan, profile: fighter, lowpass: 5400, reverb: .12 });
      this.sample(this.choose(STUDIO_ASSETS.softHeavy, 3), { gain: (.025 + mass * .035) * (cue.weight ?? .5), when: when + .012, pan: cue.pan, profile: fighter, lowpass: 1100, reverb: .08 });
      return;
    }
    this.sample(this.choose(series(`footstep_${this.profile.surface}`)), { gain: .022 + mass * .018, when, pan: cue.pan, profile: fighter, lowpass: 4200, reverb: .08 });
  }

  private attackCue(cue: ReplayAudioCue, when: number): void {
    const attack = cue.attack ?? 'punch';
    const fighter = this.fighter(cue.side);
    if (attack === 'punch' || attack === 'kick' || attack === 'jumpkick') {
      this.sample(STUDIO_ASSETS.air, { gain: attack === 'punch' ? .055 : .085, when, pan: cue.pan, duration: attack === 'punch' ? .2 : .32, slice: true, profile: fighter, highpass: 140, reverb: .12 });
      return;
    }
    if (['shoryuken', 'hurricane', 'rolling', 'verticalroll', 'context', 'mergecomet'].includes(attack)) {
      this.sample(STUDIO_ASSETS.air, { gain: .1 + fighter.weight * .04, when, pan: cue.pan, duration: attack === 'hurricane' || attack === 'rolling' ? .55 : .36, slice: true, profile: fighter, highpass: 110, reverb: .22 });
      return;
    }
    if (attack === 'armor') {
      this.sample(this.choose(STUDIO_ASSETS.metalHeavy), { gain: .13, when, pan: cue.pan, profile: fighter, lowpass: 6400, reverb: .28 });
      this.sample(this.choose(STUDIO_ASSETS.softHeavy, 3), { gain: .05, when: when + .01, pan: cue.pan, profile: fighter, lowpass: 1700, reverb: .08 });
      return;
    }
    if (['phase', 'blink', 'nullstep', 'branchwalk', 'storyarc', 'plottwist'].includes(attack)) {
      this.sample(STUDIO_ASSETS.phase, { gain: .22, when, pan: cue.pan, duration: 1.15, profile: fighter, highpass: 90, reverb: .72 });
      this.sample(STUDIO_ASSETS.air, { gain: .06, when: when + .025, pan: cue.pan, duration: .34, slice: true, profile: fighter, highpass: 240, reverb: .4 });
      return;
    }
    if (['testimony', 'entropy', 'electric', 'inktempest', 'reflect'].includes(attack)) {
      const source = attack === 'electric' ? STUDIO_ASSETS.electric : attack === 'reflect' ? STUDIO_ASSETS.phase : STUDIO_ASSETS.energy;
      this.sample(source, { gain: .18 + fighter.weight * .08, when, pan: cue.pan, duration: attack === 'testimony' ? 1.35 : .82, profile: fighter, lowpass: attack === 'entropy' ? 2400 : 12000, reverb: fighter.space });
      return;
    }
    if (attack === 'freetier') {
      this.sample(STUDIO_ASSETS.phase, { gain: .16, when, pan: cue.pan, duration: 1.4, profile: fighter, lowpass: 7200, reverb: .78 });
      return;
    }
    if (attack === 'construct') {
      this.sample(this.choose(STUDIO_ASSETS.metalHeavy), { gain: .14, when, pan: cue.pan, profile: fighter, lowpass: 6800, reverb: .52 });
      this.sample(this.choose(STUDIO_ASSETS.bell, 2), { gain: .1, when: when + .035, pan: cue.pan, profile: fighter, lowpass: 9200, reverb: .72 });
      return;
    }
    if (attack === 'boomerang' || attack === 'lasso') {
      this.sample(attack === 'boomerang' ? STUDIO_ASSETS.blade : STUDIO_ASSETS.air, { gain: .16, when, pan: cue.pan, duration: .5, slice: attack === 'lasso', profile: fighter, highpass: 180, reverb: .32 });
      return;
    }
    if (attack === 'bombardment') {
      this.sample(STUDIO_ASSETS.energy, { gain: .25, when, pan: cue.pan, duration: 1.1, profile: fighter, lowpass: 6400, reverb: .58 });
      return;
    }
    this.sample(STUDIO_ASSETS.energy, { gain: .15, when, pan: cue.pan, duration: .68, profile: fighter, lowpass: 9200, reverb: fighter.space });
  }

  private impactCue(cue: ReplayAudioCue, when: number): void {
    const fighter = this.fighter(cue.side);
    const weight = clamp((cue.weight ?? .5) * .72 + fighter.weight * .28, .2, 1);
    if (cue.blocked || cue.armored) {
      const metal = fighter.material === 'iron' || fighter.material === 'signal';
      this.duckMusic(.72, .2);
      this.sample(this.choose(cue.armored || metal ? STUDIO_ASSETS.metalHeavy : STUDIO_ASSETS.metalLight), { gain: .16 + weight * .11, when, pan: cue.pan, profile: fighter, lowpass: cue.armored ? 5200 : 9200, reverb: .24 });
      this.sample(this.choose(STUDIO_ASSETS.softHeavy, 4), { gain: .04 + weight * .05, when: when + .008, pan: cue.pan, profile: fighter, lowpass: 1500, reverb: .08 });
      return;
    }
    this.duckMusic(.55 - weight * .17, .3 + weight * .18);
    this.sample(weight > .68 ? STUDIO_ASSETS.kick : STUDIO_ASSETS.face, { gain: .2 + weight * .2, when, pan: cue.pan, duration: .55, slice: true, profile: fighter, lowpass: 12500, reverb: .12 + weight * .1 });
    this.sample(STUDIO_ASSETS.bag, { gain: .09 + weight * .12, when: when + .008, pan: cue.pan, duration: .46, slice: true, profile: fighter, lowpass: 2900, reverb: .08 });
    this.sample(this.choose(weight > .64 ? STUDIO_ASSETS.punchHeavy : STUDIO_ASSETS.punchMedium, 2), { gain: .08 + weight * .1, when: when + .014, pan: cue.pan, profile: fighter, highpass: 170, reverb: .08 });
  }

  private projectileCue(cue: ReplayAudioCue, when: number): void {
    const style = cue.style ?? 'blue';
    const fighter = this.fighter(cue.side);
    if (style === 'boomerang' || style === 'rope') {
      this.sample(style === 'boomerang' ? STUDIO_ASSETS.blade : STUDIO_ASSETS.air, { gain: .14, when, pan: cue.pan, duration: .48, slice: style === 'rope', profile: fighter, reverb: .3 });
      return;
    }
    if (fighter.material === 'electric' || style === 'citation') {
      this.sample(STUDIO_ASSETS.electric, { gain: .16, when, pan: cue.pan, duration: .55, profile: fighter, highpass: 100, reverb: .42 });
      return;
    }
    const lowpass = style === 'fire' ? 3600 : style === 'knowledge' ? 5200 : 11000;
    this.sample(STUDIO_ASSETS.energy, { gain: .14 + fighter.weight * .08, when, pan: cue.pan, duration: .64, profile: fighter, lowpass, reverb: fighter.space });
  }

  private clashCue(cue: ReplayAudioCue, when: number): void {
    this.duckMusic(.48, .38);
    this.sample(this.choose(STUDIO_ASSETS.metalHeavy), { gain: .26, when, pan: cue.pan, lowpass: 9500, reverb: .46 });
    this.sample(STUDIO_ASSETS.energy, { gain: .1, when: when + .012, pan: cue.pan, duration: .52, lowpass: 5600, reverb: .54 });
  }

  private roundCue(when: number): void {
    this.sample(this.choose(STUDIO_ASSETS.bell), { gain: .22, when, pan: 0, lowpass: 10500, reverb: .7 });
  }

  private koCue(when: number, pan: number, fighter: CharacterAudioProfile): void {
    this.duckMusic(.22, .8);
    this.sample(STUDIO_ASSETS.kick, { gain: .34, when, pan, duration: .65, slice: true, profile: fighter, lowpass: 7200, reverb: .28 });
    this.sample(STUDIO_ASSETS.fall, { gain: .34 + fighter.weight * .12, when: when + .11, pan, profile: fighter, lowpass: 4800, reverb: .34 });
  }

  private victoryCue(when: number, fighter: CharacterAudioProfile): void {
    this.duckMusic(.56, .7);
    this.sample(STUDIO_ASSETS.victory, { gain: .16, when: when + .12, pan: 0, profile: fighter, lowpass: 9200, reverb: .62 });
  }
}

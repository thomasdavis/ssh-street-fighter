import type { Frame } from './replay-render';

export interface StageAudioProfile {
  id: string;
  title: string;
  bpm: number;
  root: number;
  scale: readonly number[];
  progression: readonly number[];
  bass: readonly (number | null)[];
  color: 'warm' | 'steel' | 'rain' | 'glass' | 'deep';
}

export interface CharacterAudioProfile {
  id: string;
  signature: string;
  transpose: number;
  weight: number;
  wave: OscillatorType;
  material: 'cloth' | 'fire' | 'electric' | 'sonic' | 'iron' | 'phase' | 'ink' | 'memory' | 'signal' | 'water';
  motif: readonly [number, number];
}

const PENTA_MINOR = [0, 3, 5, 7, 10] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11] as const;
const MAJOR_PENTA = [0, 2, 4, 7, 9] as const;
const BASS_A = [0, null, 0, 2, null, 0, 3, null, 0, null, 4, 3, null, 2, 0, null] as const;
const BASS_B = [0, null, 2, null, 0, 3, null, 4, 0, null, 2, 3, null, 1, 0, null] as const;
const BASS_C = [0, null, 0, null, 3, null, 2, null, 0, null, 4, null, 3, 2, 1, null] as const;

const STAGE_PROFILES: Record<string, Omit<StageAudioProfile, 'id'>> = {
  airbase: { title: 'Runway Vector', bpm: 124, root: 40, scale: PHRYGIAN, progression: [0, 3, 1, 4], bass: BASS_B, color: 'steel' },
  bamboo: { title: 'Green Stillness', bpm: 92, root: 45, scale: PENTA_MINOR, progression: [0, 3, 4, 2], bass: BASS_C, color: 'warm' },
  canyon: { title: 'Redline Echo', bpm: 108, root: 38, scale: DORIAN, progression: [0, 3, 4, 2], bass: BASS_A, color: 'deep' },
  carnival: { title: 'Midnight Midway', bpm: 126, root: 48, scale: HARMONIC_MINOR, progression: [0, 4, 3, 1], bass: BASS_B, color: 'warm' },
  cathedral: { title: 'Iron Vespers', bpm: 84, root: 40, scale: HARMONIC_MINOR, progression: [0, 3, 1, 4], bass: BASS_C, color: 'deep' },
  dojo: { title: 'First Bell', bpm: 100, root: 38, scale: PENTA_MINOR, progression: [0, 3, 2, 4], bass: BASS_A, color: 'warm' },
  harbor: { title: 'Dockside Current', bpm: 104, root: 43, scale: DORIAN, progression: [0, 2, 4, 3], bass: BASS_B, color: 'rain' },
  jungle: { title: 'Canopy Pressure', bpm: 112, root: 36, scale: PENTA_MINOR, progression: [0, 3, 4, 2], bass: BASS_C, color: 'deep' },
  market: { title: 'Closing Time Rush', bpm: 118, root: 41, scale: DORIAN, progression: [0, 4, 2, 3], bass: BASS_A, color: 'warm' },
  monsoon: { title: 'Rain Circuit', bpm: 106, root: 45, scale: DORIAN, progression: [0, 3, 1, 4], bass: BASS_B, color: 'rain' },
  neon: { title: 'Voltage Afterimage', bpm: 132, root: 42, scale: DORIAN, progression: [0, 4, 3, 2], bass: BASS_A, color: 'glass' },
  observatory: { title: 'Perihelion', bpm: 96, root: 47, scale: HARMONIC_MINOR, progression: [0, 2, 4, 1], bass: BASS_C, color: 'glass' },
  orbital: { title: 'Low Gravity Signal', bpm: 118, root: 37, scale: DORIAN, progression: [0, 4, 2, 3], bass: BASS_B, color: 'steel' },
  reef: { title: 'Blue Counterpoint', bpm: 94, root: 38, scale: MAJOR_PENTA, progression: [0, 3, 1, 4], bass: BASS_C, color: 'glass' },
  tundra: { title: 'White Horizon', bpm: 88, root: 40, scale: PENTA_MINOR, progression: [0, 2, 4, 3], bass: BASS_A, color: 'deep' },
  volcano: { title: 'Magma Crown', bpm: 122, root: 36, scale: PHRYGIAN, progression: [0, 1, 4, 3], bass: BASS_A, color: 'deep' },
};

const CHARACTER_PROFILES: Record<string, Omit<CharacterAudioProfile, 'id'>> = {
  BYU: { signature: 'Focused flame', transpose: 0, weight: .52, wave: 'triangle', material: 'cloth', motif: [0, 4] },
  MEN: { signature: 'Burning pressure', transpose: -2, weight: .6, wave: 'sawtooth', material: 'fire', motif: [0, 3] },
  BLANKO: { signature: 'Feral voltage', transpose: -5, weight: .74, wave: 'square', material: 'electric', motif: [0, 1] },
  CHONG: { signature: 'Silk lightning', transpose: 4, weight: .38, wave: 'triangle', material: 'electric', motif: [0, 5] },
  GYLE: { signature: 'Mach-cut air', transpose: 2, weight: .58, wave: 'square', material: 'sonic', motif: [0, 4] },
  ZANG: { signature: 'Iron heartbeat', transpose: -9, weight: 1, wave: 'sawtooth', material: 'iron', motif: [0, 2] },
  DHAL: { signature: 'Breath and ember', transpose: 7, weight: .34, wave: 'sine', material: 'fire', motif: [0, 6] },
  HONDO: { signature: 'Hundred-hand drum', transpose: -4, weight: .9, wave: 'triangle', material: 'iron', motif: [0, 3] },
  KIRA: { signature: 'Zero-point glass', transpose: 8, weight: .42, wave: 'sine', material: 'phase', motif: [0, 6] },
  MAKO: { signature: 'Moon tide', transpose: 5, weight: .48, wave: 'triangle', material: 'water', motif: [0, 5] },
  OMEGA: { signature: 'Crimson gravity', transpose: -12, weight: .94, wave: 'sawtooth', material: 'signal', motif: [0, 1] },
  CODEX: { signature: 'Branching proof', transpose: 1, weight: .62, wave: 'square', material: 'signal', motif: [0, 4] },
  FABLE: { signature: 'Living ink', transpose: 6, weight: .44, wave: 'triangle', material: 'ink', motif: [0, 3] },
  MNEME: { signature: 'Memory bell', transpose: 9, weight: .5, wave: 'sine', material: 'memory', motif: [0, 5] },
  AJAX: { signature: 'Returning steel', transpose: -3, weight: .68, wave: 'square', material: 'iron', motif: [0, 4] },
  XENON: { signature: 'Phase afterimage', transpose: 11, weight: .36, wave: 'sine', material: 'phase', motif: [0, 6] },
  MEGAWATTS: { signature: 'Open-circuit storm', transpose: -1, weight: .72, wave: 'sawtooth', material: 'electric', motif: [0, 2] },
  UNCLOSE: { signature: 'Token glitch', transpose: 3, weight: .46, wave: 'square', material: 'signal', motif: [0, 5] },
};

export function characterAudioProfile(character: string): CharacterAudioProfile {
  const id = character.toUpperCase();
  return { id, ...(CHARACTER_PROFILES[id] ?? { signature: 'Unknown contender', transpose: 0, weight: .55, wave: 'triangle', material: 'cloth', motif: [0, 4] }) };
}

export function stageAudioProfile(stage: string): StageAudioProfile {
  const id = stage.toLowerCase();
  const known = STAGE_PROFILES[id];
  if (known) return { id, ...known };
  let hash = 0;
  for (const ch of id) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  return {
    id,
    title: 'Unknown Frequencies',
    bpm: 96 + (hash % 28),
    root: 36 + (hash % 12),
    scale: [PENTA_MINOR, DORIAN, PHRYGIAN][hash % 3]!,
    progression: [0, 3, 2, 4],
    bass: [BASS_A, BASS_B, BASS_C][hash % 3]!,
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
const sidePose = (f: Frame, side: 'a' | 'b') => side === 'a' ? f.asp : f.bsp;
const sideAttack = (f: Frame, side: 'a' | 'b') => side === 'a' ? f.aa : f.ba;
const sideState = (f: Frame, side: 'a' | 'b') => side === 'a' ? f.a : f.b;
const panAt = (x: number, worldW = 240) => clamp((x / worldW) * 2 - 1, -0.88, 0.88);

function projectileCounts(f: Frame): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of f.pr) counts.set(p[3], (counts.get(p[3]) ?? 0) + 1);
  return counts;
}

/** Derive audible moments from authoritative render frames. This deliberately
 * stays pure: replay scrubbing can reset the cursor without replaying history. */
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
    if (before[1] <= 0.05 && now[1] > 0.05) cues.push({ kind: 'jump', side, pan });
    if (before[1] > 0.05 && now[1] <= 0.05) cues.push({ kind: 'land', side, pan, weight: clamp(Math.abs(before[1] - now[1]) / 16, .25, 1) });
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
    const projectile = current.pr.find((p) => p[3] === style);
    const side = projectile?.[2] === 1 ? 'b' : 'a';
    for (let i = 0; i < Math.min(added, 3); i++) cues.push({ kind: 'projectile', side, style, pan: panAt(projectile?.[0] ?? 120, worldW) });
  }
  const removed = previous.pr.length - current.pr.length;
  const hpChanged = previous.a[3] !== current.a[3] || previous.b[3] !== current.b[3];
  if (removed >= 2 && !hpChanged) {
    const x = previous.pr.reduce((sum, p) => sum + p[0], 0) / Math.max(1, previous.pr.length);
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

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

interface SoundscapeMeta { stage: string; worldW: number; fps: number; aChar: string; bChar: string; }

/** A sample-free, deterministic score driven by replay state. AudioContext is
 * created only after the viewer explicitly enables sound. */
export class ReplaySoundscape {
  readonly profile: StageAudioProfile;
  readonly fighters: { a: CharacterAudioProfile; b: CharacterAudioProfile };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private energyGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceLfo: OscillatorNode | null = null;
  private energyOscillators: OscillatorNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private musicStep = 0;
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
    this.enabled = true;
    this.applyMix(.04);
    this.cabinetWake();
    this.syncScheduler();
    return true;
  }

  deactivate(): void {
    this.enabled = false;
    this.stopScheduler();
    this.applyMix(.08);
  }

  configure(settings: ReplayAudioSettings): void {
    this.settings = { ...settings, volume: clamp(settings.volume) };
    this.applyMix(.04);
    this.syncScheduler();
  }

  setPlayback(playing: boolean, speed = this.speed): void {
    this.playing = playing;
    this.speed = clamp(speed, .35, 2.5);
    this.nextStepAt = this.ctx ? this.ctx.currentTime + .03 : 0;
    this.applyMix(.08);
    this.syncScheduler();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.nextStepAt = this.ctx ? this.ctx.currentTime + .03 : 0;
    this.applyMix(.08);
    this.syncScheduler();
  }

  seek(frame: Frame | undefined, frameIndex: number): void {
    this.previous = frame ?? null;
    this.musicStep = Math.max(0, Math.floor(frameIndex / Math.max(1, this.meta.fps / 4)));
    this.intensity = frame ? replayAudioIntensity(frame) : .2;
    this.updateEnergy();
    this.nextStepAt = this.ctx ? this.ctx.currentTime + .03 : 0;
  }

  observe(frame: Frame, frameIndex: number): void {
    const previous = this.previous;
    this.previous = frame;
    this.intensity = replayAudioIntensity(frame);
    this.updateEnergy();
    if (!previous || !this.enabled || !this.playing || !this.visible || !this.settings.effects) return;
    for (const cue of replayAudioCues(previous, frame, this.meta.worldW)) this.playCue(cue, frameIndex);
  }

  async dispose(): Promise<void> {
    this.stopScheduler();
    this.enabled = false;
    try { this.ambienceSource?.stop(); } catch { /* already stopped */ }
    try { this.ambienceLfo?.stop(); } catch { /* already stopped */ }
    for (const oscillator of this.energyOscillators) try { oscillator.stop(); } catch { /* already stopped */ }
    if (this.ctx && this.ctx.state !== 'closed') try { await this.ctx.close(); } catch { /* browser teardown */ }
    this.ctx = null;
  }

  private buildGraph(): void {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 5; compressor.attack.value = .004; compressor.release.value = .24;
    const master = ctx.createGain(); master.gain.value = .0001;
    const music = ctx.createGain(); music.gain.value = .0001;
    const effects = ctx.createGain(); effects.gain.value = .0001;
    music.connect(master); effects.connect(master); master.connect(compressor); compressor.connect(ctx.destination);
    this.ctx = ctx; this.master = master; this.musicBus = music; this.effectsBus = effects;
    this.noiseBuffer = this.makeNoiseBuffer(ctx);
    this.buildAmbience();
    this.buildEnergyBed();
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x51f15e;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = ((seed / 0xffffffff) * 2 - 1) * .9;
    }
    return buffer;
  }

  private buildAmbience(): void {
    const ctx = this.ctx, bus = this.musicBus, buffer = this.noiseBuffer;
    if (!ctx || !bus || !buffer) return;
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = ctx.createBiquadFilter();
    const settings = {
      warm: ['lowpass', 720, .5], steel: ['bandpass', 1200, 1.1], rain: ['highpass', 2600, .35],
      glass: ['bandpass', 3400, 1.8], deep: ['lowpass', 360, .8],
    }[this.profile.color] as [BiquadFilterType, number, number];
    filter.type = settings[0]; filter.frequency.value = settings[1]; filter.Q.value = settings[2];
    const gain = ctx.createGain(); gain.gain.value = .0001;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = this.profile.color === 'rain' ? .17 : .09;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = .0025; lfo.connect(lfoDepth); lfoDepth.connect(gain.gain);
    source.connect(filter); filter.connect(gain); gain.connect(bus); source.start(); lfo.start();
    this.ambienceSource = source; this.ambienceGain = gain; this.ambienceLfo = lfo;
  }

  private buildEnergyBed(): void {
    const ctx = this.ctx, bus = this.effectsBus;
    if (!ctx || !bus) return;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 180; filter.Q.value = 3;
    const gain = ctx.createGain(); gain.gain.value = .0001; filter.connect(gain); gain.connect(bus);
    const root = midi(this.profile.root - 12);
    for (const [ratio, level] of [[1, .68], [1.5, .24]] as const) {
      const oscillator = ctx.createOscillator(); oscillator.type = ratio === 1 ? 'triangle' : 'sine'; oscillator.frequency.value = root * ratio;
      const voice = ctx.createGain(); voice.gain.value = level; oscillator.connect(voice); voice.connect(filter); oscillator.start(); this.energyOscillators.push(oscillator);
    }
    this.energyGain = gain;
  }

  private targetActive(): boolean { return this.enabled && this.playing && this.visible; }

  private ramp(param: AudioParam | undefined, value: number, duration: number): void {
    const ctx = this.ctx; if (!ctx || !param) return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now); param.setValueAtTime(Math.max(.0001, param.value), now); param.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  private applyMix(duration: number): void {
    const active = this.targetActive();
    this.ramp(this.master?.gain, this.enabled && this.visible ? Math.max(.0001, this.settings.volume) : .0001, duration);
    this.ramp(this.musicBus?.gain, active && this.settings.music ? .28 : .0001, duration);
    this.ramp(this.effectsBus?.gain, this.enabled && this.visible && this.settings.effects ? .72 : .0001, duration);
    this.ramp(this.ambienceGain?.gain, active && this.settings.music ? .012 + this.intensity * .008 : .0001, duration);
    this.updateEnergy();
  }

  private updateEnergy(): void {
    const frame = this.previous;
    const activeSpecial = frame ? Number(frame.aAct && !['none', 'punch', 'kick'].includes(frame.aa)) + Number(frame.bAct && !['none', 'punch', 'kick'].includes(frame.ba)) : 0;
    const projectiles = frame?.pr.length ?? 0;
    const amount = this.targetActive() && this.settings.effects ? Math.min(.025, projectiles * .0035 + activeSpecial * .008) : .0001;
    this.ramp(this.energyGain?.gain, Math.max(.0001, amount), .06);
  }

  private syncScheduler(): void {
    if (this.targetActive() && this.settings.music) {
      if (!this.timer) {
        this.nextStepAt = this.ctx ? this.ctx.currentTime + .03 : 0;
        this.timer = setInterval(() => this.scheduleMusic(), 45);
        this.scheduleMusic();
      }
    } else this.stopScheduler();
  }

  private stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.targetActive() || !this.settings.music) return;
    const speedShape = Math.sqrt(this.speed);
    const stepDuration = 60 / (this.profile.bpm * speedShape) / 4;
    if (this.nextStepAt < ctx.currentTime - .1) this.nextStepAt = ctx.currentTime + .02;
    while (this.nextStepAt < ctx.currentTime + .14) {
      this.scheduleMusicStep(this.musicStep, this.nextStepAt, stepDuration);
      this.musicStep++;
      this.nextStepAt += stepDuration;
    }
  }

  private scaleMidi(degree: number, octave = 0): number {
    const scale = this.profile.scale;
    const normalized = ((degree % scale.length) + scale.length) % scale.length;
    const octaves = Math.floor(degree / scale.length) + octave;
    return this.profile.root + scale[normalized]! + octaves * 12;
  }

  private fighter(side?: 'a' | 'b'): CharacterAudioProfile {
    return side ? this.fighters[side] : this.fighters.a;
  }

  private tuned(frequency: number, fighter: CharacterAudioProfile): number {
    return frequency * 2 ** (fighter.transpose / 12);
  }

  private scheduleMusicStep(step: number, when: number, stepDuration: number): void {
    const barStep = step % 16;
    const bar = Math.floor(step / 16);
    const chordDegree = this.profile.progression[bar % this.profile.progression.length]!;
    const intensity = this.intensity;
    if (barStep === 0) {
      for (const [degree, level] of [[chordDegree, .032], [chordDegree + 2, .021], [chordDegree + 4, .017]] as const) {
        this.tone(this.musicBus, midi(this.scaleMidi(degree, 1)), when, stepDuration * 15.5, level, this.profile.color === 'glass' ? 'sine' : 'triangle', 1100 + intensity * 900, 0);
      }
    }
    const bassDegree = this.profile.bass[barStep];
    if (bassDegree !== null && bassDegree !== undefined) {
      this.tone(this.musicBus, midi(this.scaleMidi(chordDegree + bassDegree, -1)), when, stepDuration * 1.65, .075, this.profile.color === 'steel' ? 'square' : 'triangle', 310 + intensity * 180, 0);
    }
    if (barStep % 4 === 2 || (intensity > .62 && barStep % 2 === 0)) {
      const fighter = bar % 2 ? this.fighters.b : this.fighters.a;
      const motif = fighter.motif[(Math.floor(barStep / 4) + bar) % fighter.motif.length]!;
      const melodyDegree = chordDegree + [4, 2, 5, 3][Math.floor(barStep / 4)]! + motif;
      this.tone(this.musicBus, midi(this.scaleMidi(melodyDegree, 2) + fighter.transpose), when, stepDuration * .78,
        .023 + intensity * .012, fighter.wave, 2300 + intensity * 1500, (barStep - 7.5) / 12);
    }
    if (barStep === 0 || barStep === 8 || (intensity > .72 && barStep === 10)) this.kick(when, .11 + intensity * .035);
    if (barStep === 4 || barStep === 12) this.snare(when, .055 + intensity * .025);
    if (barStep % (intensity > .55 ? 2 : 4) === 0) this.hat(when, .018 + intensity * .012, barStep % 4 ? .35 : -.35);
  }

  private tone(destination: AudioNode | null, frequency: number, when: number, duration: number, level: number, wave: OscillatorType, cutoff: number, pan: number): void {
    const ctx = this.ctx; if (!ctx || !destination) return;
    const oscillator = ctx.createOscillator(); oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, when);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, when); filter.Q.value = .7;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(Math.max(.0001, level), when + Math.min(.025, duration * .15)); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    const panner = ctx.createStereoPanner(); panner.pan.value = clamp(pan, -1, 1);
    oscillator.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(destination);
    oscillator.start(when); oscillator.stop(when + duration + .04);
  }

  private sweep(destination: AudioNode | null, from: number, to: number, when: number, duration: number, level: number, wave: OscillatorType, pan: number): void {
    const ctx = this.ctx; if (!ctx || !destination) return;
    const oscillator = ctx.createOscillator(); oscillator.type = wave; oscillator.frequency.setValueAtTime(Math.max(20, from), when); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + duration);
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(level, when + .008); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    const panner = ctx.createStereoPanner(); panner.pan.value = clamp(pan, -1, 1);
    oscillator.connect(gain); gain.connect(panner); panner.connect(destination); oscillator.start(when); oscillator.stop(when + duration + .03);
  }

  private noise(destination: AudioNode | null, when: number, duration: number, level: number, type: BiquadFilterType, frequency: number, q: number, pan: number): void {
    const ctx = this.ctx, buffer = this.noiseBuffer; if (!ctx || !destination || !buffer) return;
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.setValueAtTime(frequency, when); filter.Q.value = q;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.0001, when); gain.gain.linearRampToValueAtTime(level, when + .006); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    const panner = ctx.createStereoPanner(); panner.pan.value = clamp(pan, -1, 1);
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(destination);
    source.start(when, ((this.musicStep * 0.137) % 1.8)); source.stop(when + duration + .02);
  }

  private kick(when: number, level: number): void { this.sweep(this.musicBus, 112, 42, when, .18, level, 'sine', 0); }
  private snare(when: number, level: number): void {
    this.noise(this.musicBus, when, .12, level, 'bandpass', 1550, .7, 0);
    this.sweep(this.musicBus, 210, 145, when, .09, level * .45, 'triangle', 0);
  }
  private hat(when: number, level: number, pan: number): void { this.noise(this.musicBus, when, .045, level, 'highpass', 6500, .4, pan); }

  private cabinetWake(): void {
    const ctx = this.ctx; if (!ctx) return;
    const now = ctx.currentTime + .015;
    const signatures = [this.fighters.a, this.fighters.b] as const;
    for (const [i, fighter] of signatures.entries()) {
      for (const [j, degree] of fighter.motif.entries()) {
        this.tone(this.effectsBus, midi(this.scaleMidi(degree, 2) + fighter.transpose), now + i * .09 + j * .075,
          .28, j ? .036 : .052, fighter.wave, fighter.material === 'memory' || fighter.material === 'phase' ? 3200 : 1900, i ? .28 : -.28);
      }
    }
  }

  private playCue(cue: ReplayAudioCue, frameIndex: number): void {
    const ctx = this.ctx; if (!ctx) return;
    const when = ctx.currentTime + .008;
    switch (cue.kind) {
      case 'attack': this.attackCue(cue, when); break;
      case 'impact': this.impactCue(cue, when); break;
      case 'guard': this.guardCue(cue, when); break;
      case 'jump': this.movementCue(cue, when, 'jump'); break;
      case 'land': this.movementCue(cue, when, 'land'); break;
      case 'step': this.movementCue(cue, when, 'step'); break;
      case 'projectile': this.projectileCue(cue, when); break;
      case 'clash': this.noise(this.effectsBus, when, .16, .055, 'bandpass', 3300, 2.4, cue.pan); this.sweep(this.effectsBus, 980, 210, when, .19, .035, 'square', cue.pan); break;
      case 'round': this.roundCue(when, Number(cue.weight ?? 1)); break;
      case 'fight': this.sweep(this.effectsBus, 110, 880, when, .28, .075, 'sawtooth', 0); break;
      case 'ko': this.koCue(when, cue.pan, this.fighter(cue.side)); break;
      case 'victory': if (frameIndex > 20) this.victoryCue(when, this.fighter(cue.side)); break;
    }
  }

  private guardCue(cue: ReplayAudioCue, when: number): void {
    const fighter = this.fighter(cue.side);
    const metallic = fighter.material === 'iron' || fighter.material === 'signal';
    const electric = fighter.material === 'electric' || fighter.material === 'phase';
    this.noise(this.effectsBus, when, .07 + fighter.weight * .025, .013 + fighter.weight * .012,
      'bandpass', metallic ? 2850 : electric ? 3900 : 1850, metallic ? 2.4 : 1.1, cue.pan);
    if (metallic) this.tone(this.effectsBus, this.tuned(680, fighter), when, .11, .018, fighter.wave, 2600, cue.pan);
  }

  private movementCue(cue: ReplayAudioCue, when: number, kind: 'jump' | 'land' | 'step'): void {
    const fighter = this.fighter(cue.side);
    const mass = fighter.weight;
    if (kind === 'jump') {
      this.sweep(this.effectsBus, this.tuned(135 + mass * 35, fighter), this.tuned(390 + (1 - mass) * 180, fighter), when,
        .12 + (1 - mass) * .045, .016 + mass * .02, fighter.wave, cue.pan);
      this.noise(this.effectsBus, when, .09, .012 + (1 - mass) * .012, 'highpass', fighter.material === 'phase' ? 3400 : 1650, .5, cue.pan);
      return;
    }
    if (kind === 'land') {
      this.sweep(this.effectsBus, 74 + mass * 24, 34, when, .1 + mass * .07, (.026 + mass * .045) * (cue.weight ?? .5), 'sine', cue.pan);
      this.noise(this.effectsBus, when, .07 + mass * .04, .01 + mass * .025, 'lowpass', 420 + mass * 220, .6, cue.pan);
      return;
    }
    this.noise(this.effectsBus, when, .028 + mass * .018, .004 + mass * .008, 'lowpass', 520 + (1 - mass) * 260, .5, cue.pan);
  }

  private attackCue(cue: ReplayAudioCue, when: number): void {
    const attack = cue.attack ?? 'punch';
    const fighter = this.fighter(cue.side);
    const tune = (frequency: number) => this.tuned(frequency, fighter);
    const mass = fighter.weight;
    if (attack === 'punch' || attack === 'kick' || attack === 'jumpkick') {
      const heavy = attack !== 'punch';
      this.noise(this.effectsBus, when, heavy ? .11 : .075, (heavy ? .028 : .016) + mass * .014, 'bandpass', heavy ? 1250 : 1750, .8, cue.pan);
      this.sweep(this.effectsBus, tune(heavy ? 360 : 460), tune(heavy ? 115 : 180), when, heavy ? .12 : .075,
        (heavy ? .02 : .012) + mass * .014, fighter.wave, cue.pan);
      return;
    }
    if (['phase', 'blink', 'nullstep', 'branchwalk', 'storyarc', 'plottwist'].includes(attack)) {
      this.noise(this.effectsBus, when, .2, .05, 'highpass', 2400, .8, cue.pan);
      this.sweep(this.effectsBus, tune(260), tune(1180), when, .17, .035, fighter.material === 'phase' ? 'sine' : fighter.wave, cue.pan); return;
    }
    if (['testimony', 'entropy', 'electric', 'inktempest', 'reflect'].includes(attack)) {
      const falling = attack === 'entropy';
      this.sweep(this.effectsBus, tune(falling ? 620 : 92), tune(falling ? 58 : 740), when, .32, .045 + mass * .018,
        attack === 'testimony' ? 'sawtooth' : fighter.wave, cue.pan);
      this.noise(this.effectsBus, when + .03, .18, .025, 'bandpass', attack === 'reflect' ? 4600 : 950, 2, cue.pan); return;
    }
    if (attack === 'freetier') {
      for (const [degree, delay] of [[0, 0], [2, .08], [4, .16]] as const) {
        this.tone(this.effectsBus, midi(this.scaleMidi(degree, 2) + fighter.transpose), when + delay, .34, .05, fighter.wave, 2600, cue.pan);
      }
      return;
    }
    if (attack === 'construct') {
      this.tone(this.effectsBus, midi(this.scaleMidi(4, 2) + fighter.transpose), when, .48, .045, 'sine', 3100, cue.pan);
      this.tone(this.effectsBus, midi(this.scaleMidi(1, 1) + fighter.transpose), when + .05, .42, .035, fighter.wave, 1600, cue.pan); return;
    }
    if (attack === 'boomerang' || attack === 'lasso') {
      this.noise(this.effectsBus, when, .22, .045, 'bandpass', attack === 'lasso' ? 2800 : 1800, 3.2, cue.pan);
      this.sweep(this.effectsBus, tune(attack === 'lasso' ? 760 : 420), tune(attack === 'lasso' ? 180 : 680), when, .2, .03 + mass * .012, fighter.wave, cue.pan); return;
    }
    if (attack === 'bombardment') {
      this.tone(this.effectsBus, midi(this.scaleMidi(0, 1) + fighter.transpose), when, .36, .06, fighter.wave, 1200, cue.pan);
      this.tone(this.effectsBus, midi(this.scaleMidi(1, 2) + fighter.transpose), when + .08, .28, .035, 'sine', 2600, cue.pan); return;
    }
    this.noise(this.effectsBus, when, .14, .035, 'bandpass', 1600, 1.2, cue.pan);
    this.sweep(this.effectsBus, tune(190), tune(620), when, .16, .026 + mass * .012, fighter.wave, cue.pan);
  }

  private impactCue(cue: ReplayAudioCue, when: number): void {
    const fighter = this.fighter(cue.side);
    const weight = clamp((cue.weight ?? .5) * .72 + fighter.weight * .28, .2, 1);
    if (cue.blocked || cue.armored) {
      const metal = fighter.material === 'iron' || fighter.material === 'signal';
      this.noise(this.effectsBus, when, .11, .05 + weight * .035, 'bandpass', cue.armored ? 1800 : metal ? 3600 : 3000, 2.8, cue.pan);
      this.sweep(this.effectsBus, this.tuned(cue.armored ? 440 : 920, fighter), this.tuned(cue.armored ? 95 : 380, fighter), when,
        .14, .03 + weight * .025, metal ? 'square' : fighter.wave, cue.pan);
      return;
    }
    this.sweep(this.effectsBus, 150 + weight * 80, 42, when, .17 + weight * .06, .065 + weight * .07, 'sine', cue.pan);
    this.noise(this.effectsBus, when, .075 + weight * .08, .045 + weight * .055, 'bandpass', 900 + weight * 850, .8, cue.pan);
    if (weight > .62) this.noise(this.effectsBus, when + .025, .12, .035, 'highpass', 3600, .5, cue.pan);
  }

  private projectileCue(cue: ReplayAudioCue, when: number): void {
    const style = cue.style ?? 'blue';
    const fighter = this.fighter(cue.side);
    const pitch: Record<string, [number, number]> = {
      fire: [190, 520], blue: [260, 720], sonic: [520, 980], mote: [720, 1160], construct: [340, 680],
      boomerang: [410, 650], rope: [720, 210], citation: [330, 1120], knowledge: [180, 460],
    };
    const [from, to] = pitch[style] ?? [240, 680];
    this.sweep(this.effectsBus, this.tuned(from, fighter), this.tuned(to, fighter), when, style === 'construct' ? .3 : .16,
      .022 + fighter.weight * .009, style === 'citation' ? 'square' : fighter.wave, cue.pan);
    this.noise(this.effectsBus, when, .09, .015, style === 'fire' ? 'lowpass' : 'bandpass', style === 'fire' ? 850 : 2400, 1, cue.pan);
  }

  private roundCue(when: number, round: number): void {
    const base = midi(this.profile.root + 12 + (round % this.profile.scale.length));
    this.tone(this.effectsBus, base, when, .72, .075, 'sine', 1800, -.18);
    this.tone(this.effectsBus, base * 1.5, when + .08, .62, .05, 'triangle', 2200, .18);
  }

  private koCue(when: number, pan: number, fighter: CharacterAudioProfile): void {
    this.sweep(this.effectsBus, this.tuned(180, fighter), 31, when, .72, .11 + fighter.weight * .05, 'sawtooth', pan);
    this.noise(this.effectsBus, when, .34, .08 + fighter.weight * .045, 'bandpass', 720, .7, pan);
    this.noise(this.effectsBus, when + .12, .42, .045, 'highpass', 2800, .6, -pan * .4);
  }

  private victoryCue(when: number, fighter: CharacterAudioProfile): void {
    for (const [degree, delay, level] of [[0, 0, .055], [2, .11, .05], [4, .22, .048], [7, .36, .06]] as const) {
      this.tone(this.effectsBus, midi(this.scaleMidi(degree, 2) + fighter.transpose), when + delay, .58, level,
        fighter.wave, fighter.material === 'memory' || fighter.material === 'phase' ? 3400 : 2500, (degree - 3) / 8);
    }
  }
}

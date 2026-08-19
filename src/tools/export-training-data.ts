// Read-only exporter for privacy-minimized, temporally ordered training data.
// It never authenticates, controls a fighter, enters a queue, or starts a match.
//
// Example:
//   pnpm export:training --output mneme.jsonl.gz --character MNEME --limit 200
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, unlink, writeFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

export const TRAINING_SCHEMA = 'sshfighter.transition.v1';
export const ACTION_ORDER = ['moveX', 'down', 'jump', 'punch', 'kick', 'throw', 'motion'] as const;
const KNOWN_EXCLUDED = new Set(['mmszx1vjk23', 'mmszye1je24']);

type Side = 'a' | 'b';
type Winner = Side | 'draw' | null;

export interface MatchRow {
  id: string; mode: string; stage: string; seed: number; engine_version: string;
  a_name?: string; b_name?: string; a_fp?: string | null; b_fp?: string | null;
  a_char: string; b_char: string; winner: Winner; a_rounds: number; b_rounds: number;
  end_reason: string; duration_frames: number;
  a_elo_before: number | null; a_elo_after: number | null;
  b_elo_before: number | null; b_elo_after: number | null;
  started_at?: number; ended_at?: number;
}

interface MatchDetail { match: MatchRow; players?: unknown[]; events?: unknown[]; }
interface ReplayHeader {
  motions: string[]; stage: string; seed: number; format: string;
  sides: { a: { char: string; name?: string; fp?: string | null }; b: { char: string; name?: string; fp?: string | null } };
}
export interface ReplayPayload { match_id: string; header: ReplayHeader; keyframes: Keyframe[]; frame_count: number; frames_b64: string; }
interface Keyframe { f: number; round: number; phase: string; a: { x: number; y: number; hp: number }; b: { x: number; y: number; hp: number }; }
export interface TrackFrame {
  a: [number, number, number, number]; b: [number, number, number, number];
  asp: string; aa: string; aAct: boolean; bsp: string; ba: string; bAct: boolean;
  pr: [number, number, number, string][]; ph: string; rd: number; msg: string;
}
export interface TrackPayload {
  stage: string; aChar: string; bChar: string; aName?: string; bName?: string;
  fps: number; worldW: number; worldH: number; groundY: number; fighterH: number;
  stageLeft: number; stageRight: number; sprites?: unknown; frames: TrackFrame[];
}
export interface NormalizedAction {
  moveX: number; down: boolean; jump: boolean; punch: boolean; kick: boolean; throw: boolean; motion: string;
}
export interface Observation {
  a: { x: number; y: number; facing: number; hp: number; sprite: string; attack: string; active: boolean };
  b: { x: number; y: number; facing: number; hp: number; sprite: string; attack: string; active: boolean };
  projectiles: [number, number, number, string][]; phase: string; round: number; message: string;
}
export interface EpisodeRecord {
  schema: typeof TRAINING_SCHEMA; record_type: 'episode'; episode_id: string; retrieved_at: string;
  source: { api_base: string; exporter_source_commit: string | null; engine_version: string; deploy_commit: null };
  environment: { stage: string; seed: number; fps: number; characters: { a: string; b: string }; world: Record<string, number> };
  official: { winner: Winner; rounds: { a: number; b: number }; end_reason: string; duration_frames: number; elo_delta: { a: number | null; b: number | null } };
  replay: { frame_count: number; keyframe_count: number; input_sha256: string; input_format: string; action_order: typeof ACTION_ORDER; alignment: string };
  policy_provenance: null;
  trust: { clean_ko: boolean; ordered_inputs_primary: true; track_primary: true; server_event_telemetry_included: false; validation: string[] };
}
export interface TransitionRecord {
  schema: typeof TRAINING_SCHEMA; record_type: 'transition'; episode_id: string; t: number; action_frame: number;
  observation: Observation; action: { a: NormalizedAction; b: NormalizedAction }; next_observation: Observation;
  reward: { a: number; b: number; damage_to_a: number; damage_to_b: number };
  terminated: boolean;
}
export type TrainingRecord = EpisodeRecord | TransitionRecord;

export interface ExportOptions {
  output: string; baseUrl?: string; character?: string; limit?: number; includeNonKo?: boolean;
  exporterSourceCommit?: string | null; retrievedAt?: string;
}

export interface ExportManifest {
  schema: typeof TRAINING_SCHEMA; created_at: string; output: string; output_sha256: string;
  compressed: boolean; character_filter: string | null; matches_seen: number; matches_selected: number;
  episodes_written: number; transitions_written: number;
  rejected: { match_id: string; reasons: string[] }[];
}

function finite(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} must be a finite number`);
  return v;
}

export function decodeReplayActions(replay: ReplayPayload): { a: NormalizedAction; b: NormalizedAction }[] {
  if (replay.header.format !== 'flags8+motion8/side') throw new Error(`unsupported replay format: ${replay.header.format}`);
  const bytes = Buffer.from(replay.frames_b64, 'base64');
  if (bytes.length % 4 !== 0) throw new Error('replay input byte count is not divisible by four');
  const motions = replay.header.motions;
  const decode = (flags: number, motionIndex: number): NormalizedAction => {
    const moveX = (flags & 3) - 1;
    if (moveX < -1 || moveX > 1) throw new Error(`invalid moveX encoding: ${moveX}`);
    if (motionIndex >= motions.length) throw new Error(`motion index ${motionIndex} is out of range`);
    return {
      moveX, down: !!(flags & (1 << 3)), jump: !!(flags & (1 << 2)),
      punch: !!(flags & (1 << 4)), kick: !!(flags & (1 << 5)), throw: !!(flags & (1 << 6)),
      motion: motions[motionIndex] ?? '',
    };
  };
  const actions = [];
  for (let i = 0; i < bytes.length; i += 4) actions.push({ a: decode(bytes[i]!, bytes[i + 1]!), b: decode(bytes[i + 2]!, bytes[i + 3]!) });
  return actions;
}

export function observation(frame: TrackFrame): Observation {
  const fighter = (v: [number, number, number, number], sprite: string, attack: string, active: boolean) => ({
    x: finite(v[0], 'x'), y: finite(v[1], 'y'), facing: finite(v[2], 'facing'), hp: finite(v[3], 'hp'), sprite, attack, active,
  });
  return {
    a: fighter(frame.a, frame.asp, frame.aa, frame.aAct), b: fighter(frame.b, frame.bsp, frame.ba, frame.bAct),
    projectiles: frame.pr, phase: frame.ph, round: frame.rd, message: frame.msg,
  };
}

function eloDelta(before: number | null, after: number | null): number | null {
  return before == null || after == null ? null : after - before;
}

export function validateArtifacts(match: MatchRow, replay: ReplayPayload, track: TrackPayload): string[] {
  const reasons: string[] = [];
  const bytes = Buffer.from(replay.frames_b64, 'base64');
  if (match.id !== replay.match_id) reasons.push('match/replay id mismatch');
  if (replay.header.format !== 'flags8+motion8/side') reasons.push('unsupported replay input format');
  if (bytes.length !== replay.frame_count * 4) reasons.push('replay byte count does not equal frame_count*4');
  if (track.frames.length !== replay.frame_count) reasons.push('track length does not equal replay frame_count');
  if (match.duration_frames !== replay.frame_count) reasons.push('official duration does not equal replay frame_count');
  if (match.stage !== replay.header.stage || match.stage !== track.stage) reasons.push('stage provenance mismatch');
  if (match.seed !== replay.header.seed) reasons.push('seed provenance mismatch');
  if (match.a_char !== replay.header.sides.a.char || match.a_char !== track.aChar) reasons.push('side A character mismatch');
  if (match.b_char !== replay.header.sides.b.char || match.b_char !== track.bChar) reasons.push('side B character mismatch');
  if (!replay.keyframes.length || replay.keyframes[0]?.f !== 0) reasons.push('missing frame-zero keyframe');
  for (const keyframe of replay.keyframes) {
    const frame = track.frames[keyframe.f];
    if (!frame) { reasons.push(`keyframe ${keyframe.f} is outside track`); continue; }
    if (Math.abs(frame.a[0] - keyframe.a.x) > 1 || Math.abs(frame.a[1] - keyframe.a.y) > 1 || frame.a[3] !== keyframe.a.hp
      || Math.abs(frame.b[0] - keyframe.b.x) > 1 || Math.abs(frame.b[1] - keyframe.b.y) > 1 || frame.b[3] !== keyframe.b.hp
      || frame.ph !== keyframe.phase || frame.rd !== keyframe.round) reasons.push(`keyframe ${keyframe.f} disagrees with track`);
  }
  if (match.end_reason === 'ko') {
    if (match.winner !== 'a' && match.winner !== 'b') reasons.push('KO has no winning side');
    if (Math.max(match.a_rounds, match.b_rounds) < 2) reasons.push('KO has fewer than two round wins');
    if (track.frames.at(-1)?.ph !== 'match-over') reasons.push('KO track is not terminal');
  }
  try { decodeReplayActions(replay); } catch (error) { reasons.push((error as Error).message); }
  return [...new Set(reasons)];
}

export function buildTrainingRecords(args: {
  match: MatchRow; replay: ReplayPayload; track: TrackPayload; baseUrl: string;
  exporterSourceCommit?: string | null; retrievedAt: string;
}): TrainingRecord[] {
  const { match, replay, track } = args;
  const validation = validateArtifacts(match, replay, track);
  if (validation.length) throw new Error(validation.join('; '));
  const actions = decodeReplayActions(replay);
  const inputBytes = Buffer.from(replay.frames_b64, 'base64');
  const records: TrainingRecord[] = [{
    schema: TRAINING_SCHEMA, record_type: 'episode', episode_id: match.id, retrieved_at: args.retrievedAt,
    source: { api_base: args.baseUrl, exporter_source_commit: args.exporterSourceCommit ?? null, engine_version: match.engine_version, deploy_commit: null },
    environment: {
      stage: match.stage, seed: match.seed, fps: track.fps, characters: { a: match.a_char, b: match.b_char },
      world: { width: track.worldW, height: track.worldH, ground_y: track.groundY, fighter_height: track.fighterH, stage_left: track.stageLeft, stage_right: track.stageRight },
    },
    official: {
      winner: match.winner, rounds: { a: match.a_rounds, b: match.b_rounds }, end_reason: match.end_reason, duration_frames: match.duration_frames,
      elo_delta: { a: eloDelta(match.a_elo_before, match.a_elo_after), b: eloDelta(match.b_elo_before, match.b_elo_after) },
    },
    replay: {
      frame_count: replay.frame_count, keyframe_count: replay.keyframes.length,
      input_sha256: createHash('sha256').update(inputBytes).digest('hex'), input_format: replay.header.format,
      action_order: ACTION_ORDER, alignment: 'observation=track[i-1], action=replay[i], next_observation=track[i]; replay action 0 omitted (no pre-step observation)',
    },
    policy_provenance: null,
    trust: { clean_ko: match.end_reason === 'ko', ordered_inputs_primary: true, track_primary: true, server_event_telemetry_included: false, validation: ['frame counts', 'input codec', 'seed/stage/characters', 'keyframes', 'terminal KO'] },
  }];
  for (let i = 1; i < track.frames.length; i++) {
    const prev = observation(track.frames[i - 1]!);
    const next = observation(track.frames[i]!);
    const damageToA = Math.max(0, prev.a.hp - next.a.hp);
    const damageToB = Math.max(0, prev.b.hp - next.b.hp);
    records.push({
      schema: TRAINING_SCHEMA, record_type: 'transition', episode_id: match.id, t: i - 1, action_frame: i,
      observation: prev, action: actions[i]!, next_observation: next,
      reward: { a: damageToB - damageToA, b: damageToA - damageToB, damage_to_a: damageToA, damage_to_b: damageToB },
      terminated: i === track.frames.length - 1 && next.phase === 'match-over',
    });
  }
  return records;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'sshfighter-training-export/1' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.json() as Promise<T>;
}

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function exportTrainingCorpus(options: ExportOptions): Promise<ExportManifest> {
  const output = options.output;
  const manifestPath = `${output}.manifest.json`;
  if (await exists(output) || await exists(manifestPath)) throw new Error('output or manifest already exists; exporter refuses overwrite');
  const baseUrl = (options.baseUrl ?? 'https://sshfighter.com').replace(/\/+$/, '');
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 200)));
  const character = options.character?.toUpperCase() ?? null;
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const matches = await fetchJson<MatchRow[]>(`${baseUrl}/api/matches?limit=${limit}&mode=versus`);
  const selected = matches.filter((m) => !character || m.a_char === character || m.b_char === character);
  const rejected: ExportManifest['rejected'] = [];
  let episodesWritten = 0, transitionsWritten = 0;

  async function* lines(): AsyncGenerator<string> {
    for (const listed of selected) {
      const preReasons: string[] = [];
      if (KNOWN_EXCLUDED.has(listed.id)) preReasons.push('known historical telemetry/finalization corruption');
      if (!options.includeNonKo && listed.end_reason !== 'ko') preReasons.push(`non-KO end reason: ${listed.end_reason}`);
      if (preReasons.length) { rejected.push({ match_id: listed.id, reasons: preReasons }); continue; }
      try {
        const [detail, replay, track] = await Promise.all([
          fetchJson<MatchDetail>(`${baseUrl}/api/matches/${encodeURIComponent(listed.id)}`),
          fetchJson<ReplayPayload>(`${baseUrl}/api/matches/${encodeURIComponent(listed.id)}/replay`),
          fetchJson<TrackPayload>(`${baseUrl}/api/matches/${encodeURIComponent(listed.id)}/track`),
        ]);
        const reasons = validateArtifacts(detail.match, replay, track);
        if (reasons.length) { rejected.push({ match_id: listed.id, reasons }); continue; }
        const records = buildTrainingRecords({ match: detail.match, replay, track, baseUrl, exporterSourceCommit: options.exporterSourceCommit, retrievedAt });
        for (const record of records) {
          if (record.record_type === 'episode') episodesWritten++; else transitionsWritten++;
          yield `${JSON.stringify(record)}\n`;
        }
      } catch (error) { rejected.push({ match_id: listed.id, reasons: [(error as Error).message] }); }
    }
  }

  const file = createWriteStream(output, { flags: 'wx' });
  try {
    if (output.endsWith('.gz')) await pipeline(Readable.from(lines()), createGzip({ level: 9 }), file);
    else await pipeline(Readable.from(lines()), file);
  } catch (error) {
    try { await unlink(output); } catch { /* only removes this exporter's partial output */ }
    throw error;
  }
  const manifest: ExportManifest = {
    schema: TRAINING_SCHEMA, created_at: retrievedAt, output, output_sha256: await sha256File(output), compressed: output.endsWith('.gz'),
    character_filter: character, matches_seen: matches.length, matches_selected: selected.length,
    episodes_written: episodesWritten, transitions_written: transitionsWritten, rejected,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

function parseArgs(argv: string[]): ExportOptions {
  const value = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const output = value('--output');
  if (!output) throw new Error('--output is required');
  const limitText = value('--limit');
  return {
    output, baseUrl: value('--base-url'), character: value('--character'),
    limit: limitText ? Number(limitText) : undefined, includeNonKo: argv.includes('--include-non-ko'),
    exporterSourceCommit: value('--source-commit') ?? null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(await exportTrainingCorpus(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

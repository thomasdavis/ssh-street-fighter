import 'server-only';
import { getDb } from './db';

// Read-only accessors over the Ringside tables the game writes (matches,
// match_players, match_events, replays, char_agg, matchup_agg, ops_series) plus
// the players table. Server-only; the web app shares the same SQLite file (WAL).

export interface LeaderRow { rank: number; username: string; elo: number; peak_elo: number; wins: number; losses: number; matches: number; main_char: string | null; is_bot: number; }
export interface MatchRow {
  id: string; mode: string; stage: string; a_name: string; b_name: string; a_char: string; b_char: string;
  a_fp: string | null; b_fp: string | null; winner: string | null; a_rounds: number; b_rounds: number;
  a_is_bot: number; b_is_bot: number; end_reason: string; duration_frames: number; ended_at: number;
}
export interface MatchPlayerRow {
  match_id: string; side: string; fp: string | null; name: string; char: string; won: number; rounds_won: number;
  damage_dealt: number; damage_taken: number; hits: number; blocks: number; specials: number; max_combo: number; elo_delta: number;
}
export interface CharRow { char: string; picks: number; wins: number; games: number; win_pct: number; pick_pct: number; }
export interface MatchupRow { a_char: string; b_char: string; a_wins: number; games: number; a_win_pct: number; }
export interface OpsPoint { ts: number; worker: number; value: number; }
export type LeaderboardScope = 'humans' | 'bots' | 'all';

const q = <T = unknown>(sql: string, ...args: unknown[]): T[] => getDb().prepare(sql).all(...args) as T[];
const one = <T = unknown>(sql: string, ...args: unknown[]): T | undefined => getDb().prepare(sql).get(...args) as T | undefined;

export function summary() {
  const n = (sql: string) => (one<{ n: number }>(sql)?.n ?? 0);
  const now = Date.now();
  return {
    players: n('SELECT COUNT(*) n FROM players WHERE username IS NOT NULL'),
    humans: n('SELECT COUNT(*) n FROM players WHERE username IS NOT NULL AND is_bot=0'),
    bots: n('SELECT COUNT(*) n FROM players WHERE username IS NOT NULL AND is_bot=1'),
    matches: n('SELECT COUNT(*) n FROM matches'),
    versus: n("SELECT COUNT(*) n FROM matches WHERE mode='versus'"),
    humanVersus: n("SELECT COUNT(*) n FROM matches WHERE mode='versus' AND a_is_bot=0 AND b_is_bot=0"),
    replays: n('SELECT COUNT(*) n FROM replays'),
    matches24h: n(`SELECT COUNT(*) n FROM matches WHERE ended_at > ${now - 86400000}`),
    rounds: n('SELECT COALESCE(SUM(rounds_won),0) n FROM players'),
  };
}

export function topPlayers(limit = 100, scope: LeaderboardScope = 'all'): LeaderRow[] {
  const division = scope === 'humans' ? 'AND is_bot=0' : scope === 'bots' ? 'AND is_bot=1' : '';
  const rows = q<Omit<LeaderRow, 'rank'>>(
    `SELECT username, elo, peak_elo, wins, losses, matches, main_char, is_bot
     FROM players WHERE username IS NOT NULL AND matches>0 ${division}
     ORDER BY elo DESC, matches DESC, wins DESC LIMIT ?`, limit);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Approximate concurrent players: sum of the most recent per-worker `sessions`
 *  gauge (workers 1..N), written every ~5s. Falls back to 0 if none is fresh. */
export function onlineNow(): number {
  const rows = q<{ worker: number; value: number }>(
    `SELECT worker, value FROM ops_series o WHERE metric='sessions' AND ts > ?
     AND ts = (SELECT MAX(ts) FROM ops_series WHERE metric='sessions' AND worker=o.worker)
     GROUP BY worker`, Date.now() - 30000);
  return rows.reduce((s, r) => s + r.value, 0);
}

export function recentMatches(limit = 30, opts: { mode?: string; offset?: number } = {}): MatchRow[] {
  const { mode, offset = 0 } = opts;
  return mode
    ? q<MatchRow>('SELECT * FROM matches WHERE mode=? ORDER BY ended_at DESC LIMIT ? OFFSET ?', mode, limit, offset)
    : q<MatchRow>('SELECT * FROM matches ORDER BY ended_at DESC LIMIT ? OFFSET ?', limit, offset);
}
export function matchCount(mode?: string): number {
  return mode ? (one<{ n: number }>('SELECT COUNT(*) n FROM matches WHERE mode=?', mode)?.n ?? 0)
              : (one<{ n: number }>('SELECT COUNT(*) n FROM matches')?.n ?? 0);
}

export function getMatch(id: string): MatchRow | undefined { return one<MatchRow>('SELECT * FROM matches WHERE id=?', id); }
export function getMatchPlayers(id: string): MatchPlayerRow[] { return q<MatchPlayerRow>('SELECT * FROM match_players WHERE match_id=? ORDER BY side', id); }
export interface EventRow { frame: number; type: string; data: Record<string, unknown>; }
export function getMatchEvents(id: string): EventRow[] {
  return q<{ frame: number; type: string; data_json: string }>('SELECT frame, type, data_json FROM match_events WHERE match_id=? ORDER BY id', id)
    .map((e) => ({ frame: e.frame, type: e.type, data: safeJson(e.data_json) }));
}

export interface ReplayData { match_id: string; header: Record<string, unknown>; keyframes: unknown[]; frame_count: number; frames_b64: string; }
export function getReplay(id: string): ReplayData | undefined {
  const r = one<{ header_json: string; frames: Buffer; keyframes_json: string; frame_count: number }>(
    'SELECT header_json, frames, keyframes_json, frame_count FROM replays WHERE match_id=?', id);
  if (!r) return undefined;
  let keyframes: unknown[] = [];
  try { const k = JSON.parse(r.keyframes_json); if (Array.isArray(k)) keyframes = k; } catch { /* ignore */ }
  return { match_id: id, header: safeJson(r.header_json), keyframes, frame_count: r.frame_count, frames_b64: r.frames.toString('base64') };
}
export function hasReplay(id: string): boolean { return !!one('SELECT 1 FROM replays WHERE match_id=?', id); }

export interface ChatRow { id: number; username: string; message: string; created_at: number }
/** Most recent Fight Lounge chat, oldest-first (ready to render top-to-bottom). */
export function chatMessages(limit = 40): ChatRow[] {
  return q<ChatRow>('SELECT id, username, message, created_at FROM chat_messages ORDER BY id DESC LIMIT ?', limit).reverse();
}

export function characterStats(): CharRow[] {
  const rows = q<{ char: string; picks: number; wins: number; games: number }>('SELECT char, picks, wins, games FROM char_agg ORDER BY games DESC, char');
  const totalPicks = rows.reduce((s, r) => s + r.picks, 0) || 1;
  return rows.map((r) => ({ ...r, win_pct: r.games ? Math.round((1000 * r.wins) / r.games) / 10 : 0, pick_pct: Math.round((1000 * r.picks) / totalPicks) / 10 }));
}
export function matchupGrid(): MatchupRow[] {
  return q<MatchupRow>(`SELECT a_char, b_char, a_wins, games,
    CASE WHEN games>0 THEN ROUND(100.0*a_wins/games,1) ELSE 0 END a_win_pct FROM matchup_agg`);
}

// ---- player profile (registered players only; keyed by fingerprint) ----
export interface Profile {
  player: { username: string; elo: number; peak_elo: number; wins: number; losses: number; matches: number; main_char: string | null; created_at: number | null; last_seen: number | null; is_bot: number; rank: number | null };
  totals: { games: number; wins: number; dmg_dealt: number; dmg_taken: number; hits: number; specials: number; best_combo: number };
  byChar: { char: string; games: number; wins: number; win_pct: number }[];
  recent: MatchRow[];
  eloHistory: { ended_at: number; elo: number }[];
}
export function profile(username: string): Profile | undefined {
  const p = one<{ fingerprint: string; username: string; elo: number; peak_elo: number; wins: number; losses: number; matches: number; main_char: string | null; created_at: number; last_seen: number; is_bot: number }>(
    'SELECT * FROM players WHERE username=? COLLATE NOCASE', username);
  if (!p) return undefined;
  const division = p.is_bot ? '' : 'AND is_bot=0';
  const rank = one<{ r: number }>(`SELECT COUNT(*)+1 r FROM players
    WHERE username IS NOT NULL AND matches>0 ${division} AND elo > ?`, p.elo)?.r ?? null;
  const totals = one<Profile['totals']>(`SELECT COUNT(*) games, COALESCE(SUM(won),0) wins, COALESCE(SUM(damage_dealt),0) dmg_dealt,
    COALESCE(SUM(damage_taken),0) dmg_taken, COALESCE(SUM(hits),0) hits, COALESCE(SUM(specials),0) specials, COALESCE(MAX(max_combo),0) best_combo
    FROM match_players WHERE fp=?`, p.fingerprint) ?? { games: 0, wins: 0, dmg_dealt: 0, dmg_taken: 0, hits: 0, specials: 0, best_combo: 0 };
  const byChar = q<{ char: string; games: number; wins: number }>('SELECT char, COUNT(*) games, COALESCE(SUM(won),0) wins FROM match_players WHERE fp=? GROUP BY char ORDER BY games DESC', p.fingerprint)
    .map((r) => ({ ...r, win_pct: r.games ? Math.round((1000 * r.wins) / r.games) / 10 : 0 }));
  const recent = q<MatchRow>('SELECT * FROM matches WHERE a_fp=? OR b_fp=? ORDER BY ended_at DESC LIMIT 20', p.fingerprint, p.fingerprint);
  const eloHistory = q<{ ended_at: number; elo: number }>(
    `SELECT ended_at, CASE WHEN a_fp=? THEN a_elo_after ELSE b_elo_after END elo FROM matches
     WHERE (a_fp=? OR b_fp=?) AND (CASE WHEN a_fp=? THEN a_elo_after ELSE b_elo_after END) IS NOT NULL
     ORDER BY ended_at`, p.fingerprint, p.fingerprint, p.fingerprint, p.fingerprint);
  return {
    player: { username: p.username, elo: p.elo, peak_elo: p.peak_elo, wins: p.wins, losses: p.losses, matches: p.matches, main_char: p.main_char, created_at: p.created_at, last_seen: p.last_seen, is_bot: p.is_bot, rank },
    totals, byChar, recent, eloHistory,
  };
}

// ---- ops / observability ----
export function opsLatest(): Record<string, number> {
  // Sum the LATEST sample per worker for each metric (a worker reports every ~5s,
  // so a naive window-sum would double-count within the window).
  const rows = q<{ metric: string; value: number }>(
    `SELECT metric, SUM(value) value FROM ops_series o
     WHERE ts > ? AND ts = (SELECT MAX(ts) FROM ops_series WHERE worker=o.worker AND metric=o.metric)
     GROUP BY metric`, Date.now() - 30000);
  return Object.fromEntries(rows.map((r) => [r.metric, r.value]));
}
/** Gauge total over time: sum across workers within each ~5s sample window (the
 *  concurrent total at that moment), then average those totals into display
 *  buckets. Correct for gauges whose workers report at unaligned timestamps. */
export function opsTotalSeries(metric: string, sinceMs: number, bucketMs = 300000): { t: number; value: number }[] {
  const rows = q<{ bucket: number; value: number }>(
    `SELECT (w/${bucketMs})*${bucketMs} bucket, AVG(total) value FROM (
       SELECT (ts/5000)*5000 w, SUM(value) total FROM ops_series WHERE metric=? AND ts>? GROUP BY (ts/5000)
     ) GROUP BY bucket ORDER BY bucket`, metric, Date.now() - sinceMs);
  return rows.map((r) => ({ t: r.bucket, value: Math.round(r.value * 10) / 10 }));
}
export function opsSeries(metric: string, sinceMs: number, bucketMs = 60000): { t: number; value: number }[] {
  // Bucket by time and sum across workers, so a stacked metric reads as a total.
  const rows = q<{ bucket: number; value: number }>(
    `SELECT (ts/${bucketMs})*${bucketMs} bucket, SUM(value) value FROM ops_series
     WHERE metric=? AND ts > ? GROUP BY bucket ORDER BY bucket`, metric, Date.now() - sinceMs);
  return rows.map((r) => ({ t: r.bucket, value: r.value }));
}
export function opsAvgSeries(metric: string, sinceMs: number, bucketMs = 60000): { t: number; value: number }[] {
  const rows = q<{ bucket: number; value: number }>(
    `SELECT (ts/${bucketMs})*${bucketMs} bucket, AVG(value) value FROM ops_series
     WHERE metric=? AND ts > ? GROUP BY bucket ORDER BY bucket`, metric, Date.now() - sinceMs);
  return rows.map((r) => ({ t: r.bucket, value: Math.round(r.value * 10) / 10 }));
}
export function workerBreakdown(): { worker: number; sessions: number; cpu_pct: number; rss_mb: number; uptime_s: number }[] {
  return q(`SELECT worker,
      MAX(CASE WHEN metric='sessions' THEN value END) sessions,
      MAX(CASE WHEN metric='cpu_pct' THEN value END) cpu_pct,
      MAX(CASE WHEN metric='rss_mb' THEN value END) rss_mb,
      MAX(CASE WHEN metric='uptime_s' THEN value END) uptime_s
    FROM ops_series o WHERE ts > (SELECT MAX(ts)-6000 FROM ops_series) GROUP BY worker ORDER BY worker`);
}

function safeJson(s: string): Record<string, unknown> { try { return JSON.parse(s); } catch { return {}; } }

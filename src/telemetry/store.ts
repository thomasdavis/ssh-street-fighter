// Ringside data layer: rich match capture, replays, metrics, ops series and bot
// API keys — all on the shared SQLite handle. Read by the Ringside API + bot
// server; written from the match paths (coordinator = versus, session = practice).
import { randomBytes } from 'crypto';
import { getDb } from '../db/db.js';

export interface SideRec {
  fp: string | null; name: string; char: string; isBot: boolean;
  won: boolean; roundsWon: number;
  damageDealt: number; damageTaken: number; hits: number; blocks: number; specials: number; maxCombo: number;
  eloDelta: number;
}
export interface MatchRecord {
  id: string; mode: 'versus' | 'practice'; stage: string; seed: number; region: string | null;
  engineVersion: string; engineCommit: string | null; engineDirty: boolean | null;
  winner: 'a' | 'b' | 'draw' | null; endReason: string; durationFrames: number;
  aEloBefore: number | null; aEloAfter: number | null; bEloBefore: number | null; bEloAfter: number | null;
  startedAt: number; endedAt: number; a: SideRec; b: SideRec;
}
export interface MatchEvent { frame: number; type: string; data: Record<string, unknown>; }

// ---- capture (write) ----
export function captureMatch(m: MatchRecord): void {
  const db = getDb();
  const tx = db.transaction((rec: MatchRecord) => {
    db.prepare(`INSERT OR REPLACE INTO matches
      (id, mode, stage, seed, region, engine_version, engine_commit, engine_dirty, a_fp, b_fp, a_name, b_name, a_char, b_char,
       a_is_bot, b_is_bot, winner, a_rounds, b_rounds, end_reason, duration_frames,
       a_elo_before, a_elo_after, b_elo_before, b_elo_after, started_at, ended_at)
      VALUES (@id,@mode,@stage,@seed,@region,@ev,@ec,@ed,@afp,@bfp,@aname,@bname,@achar,@bchar,
              @abot,@bbot,@winner,@ar,@br,@reason,@dur,@aeb,@aea,@beb,@bea,@start,@end)`).run({
      id: rec.id, mode: rec.mode, stage: rec.stage, seed: rec.seed, region: rec.region,
      ev: rec.engineVersion, ec: rec.engineCommit, ed: rec.engineDirty == null ? null : Number(rec.engineDirty),
      afp: rec.a.fp, bfp: rec.b.fp, aname: rec.a.name, bname: rec.b.name, achar: rec.a.char, bchar: rec.b.char,
      abot: rec.a.isBot ? 1 : 0, bbot: rec.b.isBot ? 1 : 0, winner: rec.winner, ar: rec.a.roundsWon, br: rec.b.roundsWon,
      reason: rec.endReason, dur: rec.durationFrames,
      aeb: rec.aEloBefore, aea: rec.aEloAfter, beb: rec.bEloBefore, bea: rec.bEloAfter, start: rec.startedAt, end: rec.endedAt,
    });
    const insSide = db.prepare(`INSERT OR REPLACE INTO match_players
      (match_id, side, fp, name, char, is_bot, won, rounds_won, damage_dealt, damage_taken, hits, blocks, specials, max_combo, elo_delta)
      VALUES (@mid,@side,@fp,@name,@char,@bot,@won,@rw,@dd,@dt,@hits,@blocks,@sp,@combo,@delta)`);
    for (const [side, s] of [['a', rec.a], ['b', rec.b]] as const) {
      insSide.run({ mid: rec.id, side, fp: s.fp, name: s.name, char: s.char, bot: s.isBot ? 1 : 0, won: s.won ? 1 : 0,
        rw: s.roundsWon, dd: s.damageDealt, dt: s.damageTaken, hits: s.hits, blocks: s.blocks, sp: s.specials, combo: s.maxCombo, delta: s.eloDelta });
    }
    if (rec.mode === 'versus') {  // only competitive games feed the meta
      const bumpChar = db.prepare(`INSERT INTO char_agg (char, picks, wins, games) VALUES (?,?,?,1)
        ON CONFLICT(char) DO UPDATE SET picks = picks + 1, wins = wins + excluded.wins, games = games + 1`);
      bumpChar.run(rec.a.char, 1, rec.a.won ? 1 : 0);
      bumpChar.run(rec.b.char, 1, rec.b.won ? 1 : 0);
      const bumpM = db.prepare(`INSERT INTO matchup_agg (a_char, b_char, a_wins, games) VALUES (?,?,?,1)
        ON CONFLICT(a_char, b_char) DO UPDATE SET a_wins = a_wins + excluded.a_wins, games = games + 1`);
      bumpM.run(rec.a.char, rec.b.char, rec.winner === 'a' ? 1 : 0);
      bumpM.run(rec.b.char, rec.a.char, rec.winner === 'b' ? 1 : 0);
    }
  });
  try { tx(m); } catch (e) { console.error('[ringside] captureMatch failed:', (e as Error).message); }
}

export function captureEvents(matchId: string, events: MatchEvent[]): void {
  if (!events.length) return;
  const db = getDb();
  try {
    const ins = db.prepare('INSERT INTO match_events (match_id, frame, type, data_json, created_at) VALUES (?,?,?,?,?)');
    const now = Date.now();
    db.transaction(() => { for (const e of events) ins.run(matchId, e.frame, e.type, JSON.stringify(e.data), now); })();
  } catch (e) { console.error('[ringside] captureEvents failed:', (e as Error).message); }
}

export function captureReplay(matchId: string, header: object, frames: Buffer, keyframes: object[], frameCount: number): void {
  const db = getDb();
  try {
    const kf = JSON.stringify(keyframes);
    db.prepare(`INSERT OR REPLACE INTO replays (match_id, header_json, frames, keyframes_json, frame_count, bytes, created_at)
      VALUES (?,?,?,?,?,?,?)`).run(matchId, JSON.stringify(header), frames, kf, frameCount, frames.length + kf.length, Date.now());
  } catch (e) { console.error('[ringside] captureReplay failed:', (e as Error).message); }
}

export function recordOps(worker: number, samples: Record<string, number>): void {
  const db = getDb();
  try {
    const ins = db.prepare('INSERT INTO ops_series (ts, worker, metric, value) VALUES (?,?,?,?)');
    const ts = Date.now();
    db.transaction(() => { for (const [k, v] of Object.entries(samples)) ins.run(ts, worker, k, v); })();
  } catch { /* ops is best-effort */ }
}

// ---- read (API) ----
export function getMatch(id: string): unknown { return getDb().prepare('SELECT * FROM matches WHERE id = ?').get(id) ?? null; }
export function getMatchPlayers(id: string): unknown[] { return getDb().prepare('SELECT * FROM match_players WHERE match_id = ?').all(id); }
export function getMatchEvents(id: string): unknown[] { return getDb().prepare('SELECT frame, type, data_json FROM match_events WHERE match_id = ? ORDER BY id').all(id); }
export function recentMatches(limit = 25, mode?: string): unknown[] {
  return mode
    ? getDb().prepare('SELECT * FROM matches WHERE mode = ? ORDER BY ended_at DESC LIMIT ?').all(mode, limit)
    : getDb().prepare('SELECT * FROM matches ORDER BY ended_at DESC LIMIT ?').all(limit);
}
export function getReplay(id: string): { header_json: string; frames: Buffer; keyframes_json: string; frame_count: number } | undefined {
  return getDb().prepare('SELECT header_json, frames, keyframes_json, frame_count FROM replays WHERE match_id = ?').get(id) as never;
}
export function playerProfile(handle: string): unknown {
  const db = getDb();
  const p = db.prepare('SELECT * FROM players WHERE username = ? COLLATE NOCASE').get(handle) as { fingerprint?: string } | undefined;
  if (!p) return null;
  const agg = db.prepare(`SELECT
      COUNT(*) games, SUM(won) wins, SUM(damage_dealt) dmg_dealt, SUM(damage_taken) dmg_taken,
      SUM(hits) hits, SUM(specials) specials, MAX(max_combo) best_combo
    FROM match_players WHERE fp = ?`).get(p.fingerprint) as object;
  const byChar = db.prepare(`SELECT char, COUNT(*) games, SUM(won) wins FROM match_players WHERE fp = ? GROUP BY char ORDER BY games DESC`).all(p.fingerprint);
  const recent = db.prepare(`SELECT id, mode, stage, winner, a_name, b_name, a_char, b_char, ended_at
    FROM matches WHERE a_fp = ? OR b_fp = ? ORDER BY ended_at DESC LIMIT 10`).all(p.fingerprint, p.fingerprint);
  return { player: p, totals: agg, by_character: byChar, recent };
}
export function characterStats(): unknown[] {
  return getDb().prepare(`SELECT char, picks, wins, games,
    CASE WHEN games>0 THEN ROUND(100.0*wins/games,1) ELSE 0 END win_pct FROM char_agg ORDER BY games DESC`).all();
}
export function matchupGrid(): unknown[] {
  return getDb().prepare(`SELECT a_char, b_char, a_wins, games,
    CASE WHEN games>0 THEN ROUND(100.0*a_wins/games,1) ELSE 0 END a_win_pct FROM matchup_agg WHERE games > 0`).all();
}
export function opsLatest(): unknown[] {
  // Sum the LATEST sample per worker per metric (workers report every ~5s, so a
  // plain window-sum would double-count).
  return getDb().prepare(`SELECT metric, SUM(value) value FROM ops_series o
    WHERE ts > ? AND ts = (SELECT MAX(ts) FROM ops_series WHERE worker=o.worker AND metric=o.metric)
    GROUP BY metric`).all(Date.now() - 30000);
}
export function opsSeries(metric: string, sinceMs: number): unknown[] {
  return getDb().prepare('SELECT ts, worker, value FROM ops_series WHERE metric = ? AND ts > ? ORDER BY ts').all(metric, Date.now() - sinceMs);
}
export function pruneOps(keepMs: number): void {
  try { getDb().prepare('DELETE FROM ops_series WHERE ts < ?').run(Date.now() - keepMs); } catch { /* ignore */ }
}
export function summary(): unknown {
  const db = getDb();
  const one = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  return {
    players: one('SELECT COUNT(*) n FROM players'),
    matches: one('SELECT COUNT(*) n FROM matches'),
    versus_matches: one("SELECT COUNT(*) n FROM matches WHERE mode='versus'"),
    replays: one('SELECT COUNT(*) n FROM replays'),
    bots: one('SELECT COUNT(*) n FROM players WHERE is_bot=1'),
    matches_24h: one(`SELECT COUNT(*) n FROM matches WHERE ended_at > ${Date.now() - 86400000}`),
  };
}

// ---- API keys for programmatic play (minted from an SSH-verified fingerprint) ----
// The key just authenticates the SAME player over the bot port; it does NOT mark
// the account as a bot — API-driven players are ordinary users and pair with
// humans in the one global queue, indistinguishable in matches and metrics.
export function mintApiKey(fp: string, label: string): string {
  const key = 'rk_' + randomBytes(24).toString('base64url');
  getDb().prepare('INSERT INTO api_keys (key, fp, label, is_bot, created_at) VALUES (?,?,?,0,?)').run(key, fp, label, Date.now());
  return key;
}
export function apiKeyLookup(key: string): { fp: string; is_bot: number } | undefined {
  const row = getDb().prepare('SELECT fp, is_bot FROM api_keys WHERE key = ?').get(key) as { fp: string; is_bot: number } | undefined;
  if (row) getDb().prepare('UPDATE api_keys SET last_used = ? WHERE key = ?').run(Date.now(), key);
  return row;
}
export function listApiKeys(fp: string): unknown[] {
  return getDb().prepare('SELECT key, label, created_at, last_used FROM api_keys WHERE fp = ? ORDER BY created_at DESC').all(fp);
}

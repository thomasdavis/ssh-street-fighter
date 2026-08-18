// SQLite persistence: players are keyed by their SSH public-key fingerprint,
// so once you pick a username it's remembered every time you connect with that
// key. Also tracks win/loss stats and match history for the leaderboard.
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SF_DB ?? resolve(__dirname, '../../data/streetfighter.db');

export interface Player {
  id: number;
  fingerprint: string;
  username: string;
  main_char: number;
  wins: number;
  losses: number;
  matches: number;
  rounds_won: number;
  elo: number;
  peak_elo: number;
  key_bindings_json: string | null;
  calibrated: number;   // 0/1 — has seen the display-calibration screen
  created_at: number;
  last_seen: number;
}

export interface LeaderRow {
  username: string;
  wins: number;
  losses: number;
  matches: number;
  win_pct: number;
  elo: number;
}

export interface RatingChange {
  rated: true;
  winnerBefore: number;
  winnerAfter: number;
  loserBefore: number;
  loserAfter: number;
  delta: number;
}

export interface ChatMessage {
  id: number;
  username: string;
  message: string;
  created_at: number;
}

export interface AnalyticsEvent {
  id: number;
  event: string;
  fields_json: string;
  created_at: number;
}

let db: Database.Database;

export function initDb(): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  // In cluster mode several worker processes share this DB. WAL already allows
  // concurrent readers + one writer; busy_timeout makes a write wait for the
  // lock (up to 5s) instead of throwing SQLITE_BUSY under contention.
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE,
      main_char INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      matches INTEGER NOT NULL DEFAULT 0,
      rounds_won INTEGER NOT NULL DEFAULT 0,
      elo INTEGER NOT NULL DEFAULT 1200,
      peak_elo INTEGER NOT NULL DEFAULT 1200,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      winner TEXT, loser TEXT,
      winner_char TEXT, loser_char TEXT,
      winner_elo_before INTEGER, winner_elo_after INTEGER,
      loser_elo_before INTEGER, loser_elo_after INTEGER,
      ended_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON analytics_events(event, created_at);
  `);
  // Additive migrations for databases created before ratings were introduced.
  const ensureColumn = (table: string, column: string, sql: string): void => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${sql}`);
  };
  ensureColumn('players', 'elo', 'elo INTEGER NOT NULL DEFAULT 1200');
  ensureColumn('players', 'peak_elo', 'peak_elo INTEGER NOT NULL DEFAULT 1200');
  ensureColumn('players', 'key_bindings_json', 'key_bindings_json TEXT');
  ensureColumn('players', 'calibrated', 'calibrated INTEGER NOT NULL DEFAULT 0');
  ensureColumn('match_history', 'winner_elo_before', 'winner_elo_before INTEGER');
  ensureColumn('match_history', 'winner_elo_after', 'winner_elo_after INTEGER');
  ensureColumn('match_history', 'loser_elo_before', 'loser_elo_before INTEGER');
  ensureColumn('match_history', 'loser_elo_after', 'loser_elo_after INTEGER');
}

export function getByFingerprint(fp: string): Player | undefined {
  return db.prepare('SELECT * FROM players WHERE fingerprint = ?').get(fp) as Player | undefined;
}

export function touchOrCreate(fp: string): Player {
  const now = Date.now();
  const existing = getByFingerprint(fp);
  if (existing) {
    db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now, existing.id);
    return { ...existing, last_seen: now };
  }
  db.prepare('INSERT INTO players (fingerprint, username, created_at, last_seen) VALUES (?, NULL, ?, ?)')
    .run(fp, now, now);
  return getByFingerprint(fp)!;
}

export function usernameTaken(name: string): boolean {
  const row = db.prepare('SELECT 1 FROM players WHERE username = ? COLLATE NOCASE').get(name);
  return !!row;
}

export function setUsername(fp: string, name: string): boolean {
  try {
    db.prepare('UPDATE players SET username = ? WHERE fingerprint = ?').run(name, fp);
    return true;
  } catch { return false; } // UNIQUE violation
}

export function setMainChar(fp: string, idx: number): void {
  db.prepare('UPDATE players SET main_char = ? WHERE fingerprint = ?').run(idx, fp);
}

export function setKeyBindings(fp: string, json: string): void {
  db.prepare('UPDATE players SET key_bindings_json = ? WHERE fingerprint = ?').run(json, fp);
}

export function setCalibrated(fp: string): void {
  db.prepare('UPDATE players SET calibrated = 1 WHERE fingerprint = ?').run(fp);
}

export function recordMatch(
  winnerFp: string | null, loserFp: string | null,
  winnerName: string, loserName: string,
  winnerChar: string, loserChar: string,
  winnerRounds: number,
): RatingChange | null {
  const now = Date.now();
  // Only verified, distinct SSH identities can move rating. This prevents an
  // authenticated player farming disposable password/guest sessions.
  const winner = winnerFp ? getByFingerprint(winnerFp) : undefined;
  const loser = loserFp ? getByFingerprint(loserFp) : undefined;
  const rated = !!(winner && loser && winnerFp !== loserFp);
  let rating: RatingChange | null = null;
  if (rated) {
    const expected = 1 / (1 + 10 ** ((loser!.elo - winner!.elo) / 400));
    const delta = Math.max(1, Math.round(32 * (1 - expected)));
    rating = {
      rated: true,
      winnerBefore: winner!.elo,
      winnerAfter: winner!.elo + delta,
      loserBefore: loser!.elo,
      loserAfter: Math.max(100, loser!.elo - delta),
      delta,
    };
  }
  const tx = db.transaction(() => {
    if (winnerFp) {
      if (rating) db.prepare('UPDATE players SET wins = wins + 1, matches = matches + 1, rounds_won = rounds_won + ?, elo = ?, peak_elo = MAX(peak_elo, ?) WHERE fingerprint = ?')
        .run(winnerRounds, rating.winnerAfter, rating.winnerAfter, winnerFp);
      else db.prepare('UPDATE players SET wins = wins + 1, matches = matches + 1, rounds_won = rounds_won + ? WHERE fingerprint = ?').run(winnerRounds, winnerFp);
    }
    if (loserFp) {
      if (rating) db.prepare('UPDATE players SET losses = losses + 1, matches = matches + 1, elo = ? WHERE fingerprint = ?').run(rating.loserAfter, loserFp);
      else db.prepare('UPDATE players SET losses = losses + 1, matches = matches + 1 WHERE fingerprint = ?').run(loserFp);
    }
    db.prepare(`INSERT INTO match_history
      (winner, loser, winner_char, loser_char, winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      winnerName, loserName, winnerChar, loserChar,
      rating?.winnerBefore ?? null, rating?.winnerAfter ?? null,
      rating?.loserBefore ?? null, rating?.loserAfter ?? null, now,
    );
  });
  tx();
  return rating;
}

export function leaderboard(limit = 10): LeaderRow[] {
  return db.prepare(`
    SELECT username, wins, losses, matches, elo,
           CASE WHEN matches > 0 THEN CAST(wins AS REAL) / matches ELSE 0 END AS win_pct
    FROM players
    WHERE username IS NOT NULL AND matches > 0
    ORDER BY elo DESC, matches DESC, win_pct DESC
    LIMIT ?
  `).all(limit) as LeaderRow[];
}

export function playerRank(fp: string): number | null {
  const p = getByFingerprint(fp);
  if (!p || !p.username || p.matches === 0) return null;
  const row = db.prepare('SELECT COUNT(*) + 1 AS rank FROM players WHERE matches > 0 AND (elo > ? OR (elo = ? AND id < ?))')
    .get(p.elo, p.elo, p.id) as { rank: number };
  return row.rank;
}

export function addChatMessage(username: string, message: string): ChatMessage {
  const createdAt = Date.now();
  const info = db.prepare('INSERT INTO chat_messages (username, message, created_at) VALUES (?, ?, ?)').run(username, message, createdAt);
  return { id: Number(info.lastInsertRowid), username, message, created_at: createdAt };
}

export function chatHistory(limit = 100): ChatMessage[] {
  return db.prepare(`SELECT id, username, message, created_at FROM (
    SELECT id, username, message, created_at FROM chat_messages ORDER BY id DESC LIMIT ?
  ) ORDER BY id ASC`).all(limit) as ChatMessage[];
}

export function addAnalyticsEvent(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
  at: string,
): void {
  const createdAt = Date.parse(at);
  const cleanFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  db.prepare('INSERT INTO analytics_events (event, fields_json, created_at) VALUES (?, ?, ?)')
    .run(event, JSON.stringify(cleanFields), Number.isFinite(createdAt) ? createdAt : Date.now());
}

export function analyticsEvents(limit = 100): AnalyticsEvent[] {
  return db.prepare('SELECT id, event, fields_json, created_at FROM analytics_events ORDER BY id DESC LIMIT ?')
    .all(limit) as AnalyticsEvent[];
}

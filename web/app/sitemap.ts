import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';
import { rosterNames } from '@/lib/chars';

const ORIGIN = 'https://sshfighter.com';
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const core = [
    ['', 1, 'daily'], ['/fighters', 0.9, 'weekly'], ['/leaderboard', 0.9, 'hourly'],
    ['/matches', 0.8, 'hourly'], ['/tv', 0.8, 'hourly'], ['/characters', 0.8, 'daily'],
    ['/bots', 0.8, 'weekly'], ['/bots/list', 0.7, 'weekly'], ['/status', 0.5, 'hourly'],
  ] as const;
  const entries: MetadataRoute.Sitemap = core.map(([path, priority, changeFrequency]) => ({
    url: `${ORIGIN}${path}`, changeFrequency, priority,
  }));

  for (const fighter of rosterNames()) entries.push({
    url: `${ORIGIN}/fighters/${fighter.toLowerCase()}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  });

  try {
    const db = getDb();
    const players = db.prepare(`SELECT username, last_seen FROM players
      WHERE username IS NOT NULL AND matches > 0 ORDER BY last_seen DESC LIMIT 5000`)
      .all() as Array<{ username: string; last_seen: number }>;
    for (const player of players) entries.push({
      url: `${ORIGIN}/players/${encodeURIComponent(player.username)}`,
      lastModified: new Date(player.last_seen),
      changeFrequency: 'weekly',
      priority: 0.5,
    });

    const matches = db.prepare(`SELECT m.id, m.ended_at FROM matches m
      INNER JOIN replays r ON r.match_id = m.id
      WHERE m.mode = 'versus' ORDER BY m.ended_at DESC LIMIT 40000`)
      .all() as Array<{ id: string; ended_at: number }>;
    for (const match of matches) entries.push({
      url: `${ORIGIN}/matches/${encodeURIComponent(match.id)}`,
      lastModified: new Date(match.ended_at),
      changeFrequency: 'never',
      priority: 0.4,
    });
  } catch {
    // Clean builds may not have a production database yet. Core and fighter
    // routes remain discoverable; dynamic entries appear once SQLite is ready.
  }

  return entries;
}

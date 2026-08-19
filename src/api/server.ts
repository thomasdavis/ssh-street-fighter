// Ringside REST API (read-only): serves match history, replays, Dotabuff-style
// character/matchup meta, leaderboard, live server state and ops metrics as JSON
// for a future homepage. Runs in the cluster primary only. Behind SF_API_PORT
// (default 8080; set 0 to disable). Never mutates game state.
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import * as store from '../telemetry/store.js';
import * as db from '../db/db.js';
import { ENGINE_VERSION } from '../telemetry/recorder.js';
import type { MatchCoordinator } from '../cluster/coordinator.js';

const clamp = (v: string | null, def: number, max: number): number => Math.min(max, Math.max(1, parseInt(v ?? '', 10) || def));

function send(res: ServerResponse, code: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',            // public read API for the homepage
    'cache-control': 'no-store',
  });
  res.end(json);
}

function route(coord: MatchCoordinator | null, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  const seg = p.split('/').filter(Boolean);   // e.g. ['api','matches','m123']

  if (p === '/' || p === '/api' || p === '/api/health')
    return send(res, 200, { ok: true, service: 'ringside', engine: ENGINE_VERSION, uptime_s: Math.round(process.uptime()) });

  if (p === '/api/live')
    return send(res, 200, coord ? {
      players: coord.playerCount, matches: coord.activeMatches, queued: coord.queued, lounge: coord.loungeSize,
      ops: store.opsLatest(), live: coord.liveMatchList(),
    } : { players: 0, matches: 0, queued: 0, lounge: 0, ops: store.opsLatest(), live: [] });

  if (p === '/api/stats') return send(res, 200, store.summary());
  if (p === '/api/leaderboard') return send(res, 200, db.leaderboard(clamp(q.get('limit'), 25, 200)));
  if (p === '/api/characters') return send(res, 200, store.characterStats());
  if (p === '/api/matchups') return send(res, 200, store.matchupGrid());

  if (p === '/api/ops') {
    const metric = q.get('metric');
    return send(res, 200, {
      latest: store.opsLatest(),
      series: metric ? store.opsSeries(metric, clamp(q.get('since_ms'), 3600000, 86400000)) : undefined,
    });
  }

  if (p === '/api/matches')
    return send(res, 200, store.recentMatches(clamp(q.get('limit'), 25, 200), q.get('mode') ?? undefined));

  if (seg[0] === 'api' && seg[1] === 'players' && seg[2]) {
    const prof = store.playerProfile(decodeURIComponent(seg[2]));
    return prof ? send(res, 200, prof) : send(res, 404, { error: 'player not found' });
  }

  if (seg[0] === 'api' && seg[1] === 'matches' && seg[2]) {
    const id = decodeURIComponent(seg[2]);
    if (seg[3] === 'replay') {
      const r = store.getReplay(id);
      if (!r) return send(res, 404, { error: 'replay not found' });
      return send(res, 200, {
        match_id: id, header: JSON.parse(r.header_json), keyframes: JSON.parse(r.keyframes_json),
        frame_count: r.frame_count, frames_b64: r.frames.toString('base64'),
      });
    }
    const match = store.getMatch(id);
    if (!match) return send(res, 404, { error: 'match not found' });
    return send(res, 200, {
      match, players: store.getMatchPlayers(id),
      events: store.getMatchEvents(id).map((e) => { const r = e as { frame: number; type: string; data_json: string }; return { frame: r.frame, type: r.type, data: JSON.parse(r.data_json) }; }),
    });
  }

  send(res, 404, { error: 'not found', path: p });
}

export function startApiServer(coord: MatchCoordinator | null): void {
  const port = parseInt(process.env.SF_API_PORT ?? '8080', 10);
  if (!port) return;   // SF_API_PORT=0 disables
  const server = createServer((req, res) => {
    try { route(coord, req, res); }
    catch (e) { try { send(res, 500, { error: (e as Error).message }); } catch { /* ignore */ } }
  });
  server.on('error', (e) => console.error('[ringside-api] listen failed:', (e as Error).message));
  // Loopback only — Caddy reverse-proxies it publicly (TLS, origin hidden).
  server.listen(port, '127.0.0.1', () => console.log(`[ringside-api] REST API on 127.0.0.1:${port}`));
}

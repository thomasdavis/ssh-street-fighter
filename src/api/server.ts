// Ringside REST API (read-only): serves match history, replays, Dotabuff-style
// character/matchup meta, leaderboard, live server state and ops metrics as JSON
// for a future homepage. Runs in the cluster primary only. Behind SF_API_PORT
// (default 8080; set 0 to disable). Never mutates game state.
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import sharp from 'sharp';
import * as store from '../telemetry/store.js';
import * as db from '../db/db.js';
import { ENGINE_VERSION } from '../telemetry/recorder.js';
import { simulateReplay, replayMatchAtFrame, type Track } from '../telemetry/replay-sim.js';
import { composeScene } from '../game/scene.js';
import { WORLD_W, WORLD_H } from '../game/engine.js';
import type { MatchCoordinator } from '../cluster/coordinator.js';

// Render a stored replay frame server-side (same pixel renderer as SSH play) into
// a shareable PNG — used for per-replay Open Graph / Twitter share images.
async function renderShot(res: ServerResponse, id: string, frame: number): Promise<void> {
  try {
    const m = replayMatchAtFrame(id, frame);
    if (!m) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    const grid = composeScene(m, WORLD_W, WORLD_H);
    const rgba = Buffer.alloc(WORLD_W * WORLD_H * 4);
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      const px = grid[y]?.[x]; const o = (y * WORLD_W + x) * 4;
      if (px) { rgba[o] = px.r; rgba[o + 1] = px.g; rgba[o + 2] = px.b; }
      rgba[o + 3] = 255;
    }
    const png = await sharp(rgba, { raw: { width: WORLD_W, height: WORLD_H, channels: 4 } })
      .resize(1200, 800, { kernel: 'nearest' }).png().toBuffer();
    res.writeHead(200, { 'content-type': 'image/png', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=86400' });
    res.end(new Uint8Array(png));
  } catch (e) { try { res.writeHead(500, { 'content-type': 'text/plain' }); res.end((e as Error).message); } catch { /* ignore */ } }
}

// Re-simulating a replay costs a little CPU; cache the produced tracks (bounded).
const trackCache = new Map<string, Track>();

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

  if (seg[0] === 'api' && seg[1] === 'live' && seg[2]) {
    const r = coord?.renderMatch(decodeURIComponent(seg[2]));
    return r ? send(res, 200, r) : send(res, 404, { error: 'match not live' });
  }

  // Live Fight Lounge chat feed for the homepage (read-only view of the banter).
  if (p === '/api/chat')
    return send(res, 200, {
      messages: db.chatHistory(clamp(q.get('limit'), 40, 100)),
      lounge: coord ? coord.loungeSize : 0,
      players: coord ? coord.playerCount : 0,
    });

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
    if (seg[3] === 'shot') {
      // Shareable PNG of a replay frame (?f=N; default a lively mid-action frame).
      const f = q.get('f'); void renderShot(res, id, f != null ? parseInt(f, 10) || 0 : -1);
      return;
    }
    if (seg[3] === 'replay') {
      const r = store.getReplay(id);
      if (!r) return send(res, 404, { error: 'replay not found' });
      return send(res, 200, {
        match_id: id, header: JSON.parse(r.header_json), keyframes: JSON.parse(r.keyframes_json),
        frame_count: r.frame_count, frames_b64: r.frames.toString('base64'),
      });
    }
    if (seg[3] === 'track') {
      // Re-simulated per-frame position track for the web replay viewer.
      let t = trackCache.get(id);
      if (!t) {
        const sim = simulateReplay(id);
        if (!sim) return send(res, 404, { error: 'replay not found' });
        if (trackCache.size > 48) trackCache.delete(trackCache.keys().next().value as string);
        trackCache.set(id, sim); t = sim;
      }
      return send(res, 200, t);
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

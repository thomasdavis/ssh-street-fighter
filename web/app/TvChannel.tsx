'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { drawFrame, ensureImages, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';

interface Track extends RenderMeta { fps: number; frames: Frame[] }
interface Live extends RenderMeta { frame: Frame; over: boolean }

function lerp(p: Frame, c: Frame, k: number): Frame {
  const L = (a: number, b: number) => a + (b - a) * k;
  return { ...c, a: [L(p.a[0], c.a[0]), L(p.a[1], c.a[1]), c.a[2], c.a[3]], b: [L(p.b[0], c.b[0]), L(p.b[1], c.b[1]), c.b[2], c.b[3]] };
}

// A never-ending TV channel: always prefers LIVE matches (round-robins through
// every one in progress), and fills dead air by rotating recent replays. When a
// live match ends or a replay finishes a loop, it cuts to the next thing.
export function TvChannel({ replayPool }: { replayPool: { id: string; title: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cap, setCap] = useState<{ text: string; sub: string; href: string; live: boolean }>({ text: 'Tuning in…', sub: '', href: '/matches', live: false });

  const metaRef = useRef<RenderMeta | null>(null);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const stage = useRef<HTMLImageElement | null>(null);
  const track = useRef<Track | null>(null);
  const idx = useRef(0);
  const loops = useRef(0);
  const prev = useRef<{ f: Frame; t: number } | null>(null);
  const cur = useRef<{ f: Frame; t: number } | null>(null);
  const kind = useRef<'live' | 'replay'>('replay');
  const liveMid = useRef<string | null>(null);
  const liveList = useRef<any[]>([]);
  const liveRot = useRef(0);
  const replayRot = useRef(-1);
  const busy = useRef(false);

  const setStageAndImgs = (m: RenderMeta) => {
    metaRef.current = m;
    if (!stage.current || stage.current.dataset?.stage !== m.stage) {
      const si = new Image(); si.onload = () => { stage.current = si; }; si.src = stageUrl(m.stage); if (si.dataset) si.dataset.stage = m.stage;
      stage.current = si;
    }
    ensureImages(m, imgs.current);
  };

  const startLive = (m: any) => {
    kind.current = 'live'; liveMid.current = m.mid; track.current = null;
    prev.current = null; cur.current = null; metaRef.current = null;
    setCap({ text: `${m.a.name}${m.a.bot ? ' [BOT]' : ''} vs ${m.b.name}${m.b.bot ? ' [BOT]' : ''}`, sub: `${m.a.char} vs ${m.b.char} · ${m.stage}`, href: `/watch/${m.mid}`, live: true });
  };
  const startReplay = async (r: { id: string; title: string }) => {
    kind.current = 'replay'; liveMid.current = null;
    try {
      const res = await fetch(`/api/matches/${r.id}/track`, { cache: 'force-cache' });
      if (!res.ok) return false;
      const t = await res.json() as Track;
      track.current = t; setStageAndImgs(t); idx.current = 0; loops.current = 0;
      setCap({ text: r.title, sub: 'recent replay', href: `/matches/${r.id}`, live: false });
      return true;
    } catch { return false; }
  };

  // Director: choose the next thing to show. Live matches win; else rotate replays.
  const advance = async () => {
    if (busy.current) return; busy.current = true;
    try {
      let list = liveList.current;
      try { const r = await fetch('/api/live', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); list = d.live || []; liveList.current = list; } } catch { /* keep last */ }
      if (list.length) {
        liveRot.current = (liveRot.current + 1) % list.length;
        startLive(list[liveRot.current]);
        return;
      }
      for (let i = 0; i < Math.max(1, replayPool.length); i++) {
        replayRot.current = (replayRot.current + 1) % replayPool.length;
        const r = replayPool[replayRot.current];
        if (r && await startReplay(r)) return;
      }
      // nothing available — retry shortly
      setTimeout(() => { busy.current = false; advance(); }, 4000);
      return;
    } finally { busy.current = false; }
  };

  useEffect(() => { advance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // periodic director check: if we're on a replay but a live match starts, cut to it
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        const d = r.ok ? await r.json() : { live: [] };
        liveList.current = d.live || [];
        if (kind.current === 'replay' && liveList.current.length) advance();
      } catch { /* ignore */ }
    }, 9000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live frame poller
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      if (kind.current !== 'live' || !liveMid.current) { setTimeout(poll, 250); return; }
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(liveMid.current)}`, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json() as Live;
          if (!metaRef.current || metaRef.current.stage !== d.stage) setStageAndImgs(d);
          prev.current = cur.current ?? { f: d.frame, t: performance.now() };
          cur.current = { f: d.frame, t: performance.now() };
          if (d.over) { setTimeout(() => advance(), 2200); await new Promise((r2) => setTimeout(r2, 2200)); }
        } else if (r.status === 404) { advance(); }
      } catch { /* transient */ }
      setTimeout(poll, 90);
    };
    poll();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // render loop (+ advance when a replay finishes ~2 loops)
  useEffect(() => {
    let raf = 0, last = 0, acc = 0, tick = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts; const dt = Math.min(100, ts - last); last = ts; tick += dt;
      const ctx = canvasRef.current?.getContext('2d'); const m = metaRef.current; if (!ctx || !m) return;
      if (kind.current === 'live') {
        const c = cur.current; if (!c) return; const p = prev.current ?? c;
        const span = Math.max(1, c.t - p.t); const k = Math.min(1, (performance.now() - c.t) / span);
        drawFrame(ctx, m, p === c ? c.f : lerp(p.f, c.f, k), imgs.current, stage.current, tick);
      } else if (track.current) {
        const t = track.current; acc += dt; const step = 1000 / (t.fps || 30);
        while (acc >= step) { acc -= step; idx.current += 1; if (idx.current >= t.frames.length) { idx.current = 0; loops.current += 1; if (loops.current >= 2) { advance(); } } }
        drawFrame(ctx, t, t.frames[Math.min(idx.current, t.frames.length - 1)], imgs.current, stage.current, tick);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rs-tv">
      <div className="rs-tv__screen">
        <canvas ref={canvasRef} width={CW} height={CH} />
        <div className="rs-tv__scan" aria-hidden />
        <div className="rs-tv__cap">
          <span className={`rs-tv__badge${cap.live ? ' live' : ''}`}>{cap.live ? <><span className="rs-dot" /> LIVE</> : 'REPLAY'}</span>
          <span className="rs-tv__title">{cap.text}</span>
          {cap.sub && <span className="rs-tv__sub">{cap.sub}</span>}
          <Link href={cap.href} className="rs-tv__link">{cap.live ? 'Open match →' : 'Full replay →'}</Link>
        </div>
        <div className="rs-tv__chan">SSH FIGHTER · TV</div>
      </div>
    </div>
  );
}

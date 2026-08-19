'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { drawFrame, ensureImages, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';

interface Track extends RenderMeta { fps: number; frames: Frame[] }
interface Live extends RenderMeta { frame: Frame; over: boolean }
type Mode = 'loading' | 'replay' | 'live' | 'none';

function lerp(p: Frame, c: Frame, k: number): Frame {
  const L = (a: number, b: number) => a + (b - a) * k;
  return { ...c, a: [L(p.a[0], c.a[0]), L(p.a[1], c.a[1]), c.a[2], c.a[3]], b: [L(p.b[0], c.b[0]), L(p.b[1], c.b[1]), c.b[2], c.b[3]] };
}

// One "theater" on the homepage: prefers a live match, otherwise loops the latest
// replay. Reuses the exact match renderer (sprites, beams, projectiles).
export function HomeTheater({ replayId, replayTitle }: { replayId: string | null; replayTitle: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('loading');
  const [cap, setCap] = useState<{ text: string; href: string; live: boolean }>({ text: '', href: replayId ? `/matches/${replayId}` : '/matches', live: false });

  const metaRef = useRef<RenderMeta | null>(null);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const stage = useRef<HTMLImageElement | null>(null);
  const track = useRef<Track | null>(null);
  const idx = useRef(0);
  const prev = useRef<{ f: Frame; t: number } | null>(null);
  const cur = useRef<{ f: Frame; t: number } | null>(null);
  const modeRef = useRef<Mode>('loading');
  const liveMid = useRef<string | null>(null);

  const setStageAndImgs = (m: RenderMeta) => {
    metaRef.current = m;
    if (!stage.current || stage.current.dataset?.stage !== m.stage) {
      const si = new Image(); si.onload = () => { stage.current = si; }; si.src = stageUrl(m.stage); si.dataset && (si.dataset.stage = m.stage);
      stage.current = si;
    }
    ensureImages(m, imgs.current);
  };

  const loadReplay = async () => {
    if (!replayId || track.current) return;
    try {
      const r = await fetch(`/api/matches/${replayId}/track`, { cache: 'force-cache' });
      if (!r.ok) { if (modeRef.current !== 'live') setMode('none'); return; }
      const t = await r.json() as Track;
      track.current = t; setStageAndImgs(t); idx.current = 0;
      if (modeRef.current !== 'live') { modeRef.current = 'replay'; setMode('replay'); setCap({ text: replayTitle, href: `/matches/${replayId}`, live: false }); }
    } catch { if (modeRef.current !== 'live') setMode('none'); }
  };

  // director: pick live vs replay, re-check periodically
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        const d = r.ok ? await r.json() : { live: [] };
        const m = (d.live || [])[0];
        if (m && alive) {
          if (liveMid.current !== m.mid) { liveMid.current = m.mid; prev.current = null; cur.current = null; metaRef.current = null; }
          modeRef.current = 'live'; setMode('live');
          setCap({ text: `${m.a.name} vs ${m.b.name}`, href: `/watch/${m.mid}`, live: true });
        } else if (alive && modeRef.current !== 'replay') {
          liveMid.current = null; await loadReplay();
        } else if (alive && !m) {
          liveMid.current = null;
        }
      } catch { if (alive && modeRef.current === 'loading') loadReplay(); }
    };
    check();
    const id = setInterval(check, 12000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live poller
  useEffect(() => {
    if (mode !== 'live') return;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      const mid = liveMid.current;
      if (!mid) { setTimeout(poll, 300); return; }
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(mid)}`, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json() as Live;
          if (!metaRef.current || metaRef.current.stage !== d.stage) setStageAndImgs(d);
          prev.current = cur.current ?? { f: d.frame, t: performance.now() };
          cur.current = { f: d.frame, t: performance.now() };
          if (d.over) { modeRef.current = 'replay'; liveMid.current = null; setMode('replay'); loadReplay(); return; }
        } else if (r.status === 404) { modeRef.current = 'replay'; liveMid.current = null; setMode('replay'); loadReplay(); return; }
      } catch { /* transient */ }
      setTimeout(poll, 90);
    };
    poll();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // render loop
  useEffect(() => {
    let raf = 0, last = 0, acc = 0, tick = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts; const dt = Math.min(100, ts - last); last = ts; tick += dt;
      const ctx = canvasRef.current?.getContext('2d'); const m = metaRef.current; if (!ctx || !m) return;
      if (modeRef.current === 'live') {
        const c = cur.current; if (!c) return; const p = prev.current ?? c;
        const span = Math.max(1, c.t - p.t); const k = Math.min(1, (performance.now() - c.t) / span);
        drawFrame(ctx, m, p === c ? c.f : lerp(p.f, c.f, k), imgs.current, stage.current, tick);
      } else if (modeRef.current === 'replay' && track.current) {
        const t = track.current; acc += dt; const step = 1000 / (t.fps || 30);
        while (acc >= step) { acc -= step; idx.current = (idx.current + 1) % t.frames.length; }
        drawFrame(ctx, t, t.frames[idx.current], imgs.current, stage.current, tick);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (mode === 'none') return null;
  return (
    <div className="rs-replay rs-theater">
      <div className="rs-replay__stage">
        <canvas ref={canvasRef} width={CW} height={CH} />
        {mode === 'loading' && <div className="rs-replay__msg">Rolling the tape…</div>}
        <div className="rs-theater__cap">
          <span className={`rs-theater__badge${cap.live ? ' live' : ''}`}>{cap.live ? <><span className="rs-dot" /> LIVE</> : 'REPLAY'}</span>
          <span className="rs-theater__title">{cap.text}</span>
          <Link href={cap.href} className="rs-theater__link">{cap.live ? 'Watch the fight →' : 'Full replay →'}</Link>
        </div>
      </div>
    </div>
  );
}

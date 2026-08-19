'use client';
import { useEffect, useRef, useState } from 'react';
import { drawFrame, ensureImages, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';

interface Track extends RenderMeta { fps: number; frames: Frame[] }

export default function ReplayViewer({ matchId }: { matchId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ui, setUi] = useState({ i: 0, total: 0 });

  const idx = useRef(0);
  const playRef = useRef(true);
  const speedRef = useRef(1);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const stageImg = useRef<HTMLImageElement | null>(null);
  const trackRef = useRef<Track | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/matches/${matchId}/track`, { cache: 'force-cache' });
        if (!r.ok) throw new Error('no replay');
        const t = await r.json() as Track;
        if (!alive) return;
        trackRef.current = t;
        setUi({ i: 0, total: t.frames.length });
        const si = new Image(); si.onload = () => { stageImg.current = si; }; si.src = stageUrl(t.stage);
        ensureImages(t, imgs.current);
        setStatus('ready');
      } catch { if (alive) setStatus('error'); }
    })();
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    let raf = 0, last = 0, acc = 0, uiAcc = 0, tick = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const t = trackRef.current; if (!t) { last = ts; return; }
      if (!last) last = ts;
      const dt = Math.min(100, ts - last); last = ts; tick += dt;
      const frameMs = 1000 / t.fps;
      if (playRef.current) {
        acc += dt * speedRef.current;
        while (acc >= frameMs) {
          acc -= frameMs; idx.current++;
          if (idx.current >= t.frames.length) { idx.current = t.frames.length - 1; playRef.current = false; setPlaying(false); break; }
        }
      }
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawFrame(ctx, t, t.frames[Math.max(0, Math.min(t.frames.length - 1, idx.current))], imgs.current, stageImg.current, tick);
      uiAcc += dt; if (uiAcc > 120) { uiAcc = 0; setUi({ i: idx.current, total: t.frames.length }); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setP = (p: boolean) => {
    const t = trackRef.current;
    if (p && t && idx.current >= t.frames.length - 1) idx.current = 0;
    playRef.current = p; setPlaying(p);
  };
  const setSp = (s: number) => { speedRef.current = s; setSpeed(s); };
  const scrub = (v: number) => { idx.current = v; setUi((u) => ({ ...u, i: v })); };
  const secs = (n: number) => `${Math.floor(n / 30)}s`;

  return (
    <div className="rs-replay">
      <div className="rs-replay__stage">
        <canvas ref={canvasRef} width={CW} height={CH} />
        {status !== 'ready' && <div className="rs-replay__msg">{status === 'loading' ? 'Loading replay…' : 'Replay unavailable.'}</div>}
      </div>
      <div className="rs-controls">
        <button className="play" onClick={() => setP(!playing)} disabled={status !== 'ready'}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <input type="range" min={0} max={Math.max(0, ui.total - 1)} value={ui.i} onChange={(e) => { setP(false); scrub(parseInt(e.target.value, 10)); }} disabled={status !== 'ready'} />
        <span className="t">{secs(ui.i)} / {secs(ui.total)}</span>
        <div className="rs-speed">
          {[0.5, 1, 2].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSp(s)}>{s}×</button>)}
        </div>
      </div>
    </div>
  );
}

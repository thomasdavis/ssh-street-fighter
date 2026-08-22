'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PlayerTypeBadge } from '@/components/ui';
import { drawFrame, ensureImages, sameRenderIdentity, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';

interface LivePayload extends RenderMeta { mid: string; frame: Frame; over: boolean }
const POLL_MS = 90;

function lerp(p: Frame, c: Frame, k: number): Frame {
  const L = (a: number, b: number) => a + (b - a) * k;
  return { ...c,
    a: [L(p.a[0], c.a[0]), L(p.a[1], c.a[1]), c.a[2], c.a[3]],
    b: [L(p.b[0], c.b[0]), L(p.b[1], c.b[1]), c.b[2], c.b[3]] };
}

export default function LiveViewer({ mid }: { mid: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'ended' | 'error'>('loading');
  const [names, setNames] = useState<{ a: string; b: string; aBot: boolean; bBot: boolean } | null>(null);

  const meta = useRef<RenderMeta | null>(null);
  const prev = useRef<{ f: Frame; t: number } | null>(null);
  const cur = useRef<{ f: Frame; t: number } | null>(null);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const stageImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let alive = true, misses = 0;
    const now = () => performance.now();
    const poll = async () => {
      if (!alive) return;
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(mid)}`, { cache: 'no-store' });
        if (r.status === 404) { misses++; if (misses > 2) { setStatus((s) => (s === 'live' ? 'ended' : 'error')); return; } }
        else if (r.ok) {
          misses = 0;
          const d = await r.json() as LivePayload;
          if (!alive || d.mid !== mid) { setTimeout(poll, POLL_MS); return; }
          if (!sameRenderIdentity(meta.current, d)) {
            meta.current = d;
            setNames({ a: d.aName, b: d.bName, aBot: !!d.aBot, bBot: !!d.bBot });
            const si = new Image(); si.onload = () => { stageImg.current = si; }; si.src = stageUrl(d.stage);
            ensureImages(d, imgs.current);
          }
          prev.current = cur.current ?? { f: d.frame, t: now() };
          cur.current = { f: d.frame, t: now() };
          setStatus('live');
          if (d.over) { setStatus('ended'); return; }
        }
      } catch { /* transient */ }
      setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { alive = false; };
  }, [mid]);

  useEffect(() => {
    let raf = 0, tick = 0, last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!last) last = ts; tick += Math.min(100, ts - last); last = ts;
      const m = meta.current, c = cur.current; if (!m || !c) return;
      const p = prev.current ?? c;
      const span = Math.max(1, c.t - p.t);
      const k = Math.max(0, Math.min(1, (performance.now() - c.t) / span + 0));
      const frame = p === c ? c.f : lerp(p.f, c.f, Math.min(1, k));
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawFrame(ctx, m, frame, imgs.current, stageImg.current, tick);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="rs-replay">
      <div className="rs-replay__stage">
        <canvas ref={canvasRef} width={CW} height={CH} />
        {status === 'loading' && <div className="rs-replay__msg">Connecting to the match…</div>}
        {status === 'error' && <div className="rs-replay__msg">That match isn&apos;t live.</div>}
      </div>
      <div className="rs-controls">
        <span className="t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="rs-dot" />{status === 'ended' ? 'MATCH ENDED' : 'LIVE'}
          {names && <>· {names.a}<PlayerTypeBadge isBot={names.aBot} /> vs {names.b}<PlayerTypeBadge isBot={names.bBot} /></>}
        </span>
        <span style={{ flex: 1 }} />
        {status === 'ended' && <Link className="rs-btn ghost" href="/matches">Find the replay →</Link>}
        <Link className="rs-btn ghost" href="/">All live matches</Link>
      </div>
    </div>
  );
}

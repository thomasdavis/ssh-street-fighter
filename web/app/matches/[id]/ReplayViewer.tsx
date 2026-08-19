'use client';
import { useEffect, useRef, useState } from 'react';

type Quad = [number, number, number, number];
interface TF { a: Quad; b: Quad; asp: string; aa: string; bsp: string; ba: string; pr: [number, number, number, string][]; ph: string; rd: number; msg: string }
interface CharMeta { idleH: number; frames: Record<string, Quad> }
interface Track {
  stage: string; aChar: string; bChar: string; aName: string; bName: string;
  fps: number; worldW: number; worldH: number; groundY: number; fighterH: number;
  sprites: { a: CharMeta; b: CharMeta }; frames: TF[];
}

const CW = 960, CH = 640;
const projColor = (s: string) => (s === 'fire' ? '#ff7a3c' : s === 'sonic' ? '#8fe0ff' : '#6fa8ff');

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
        const si = new Image(); si.onload = () => { stageImg.current = si; }; si.src = `/api/stage/${t.stage}`;
        for (const [char, meta] of [[t.aChar, t.sprites.a], [t.bChar, t.sprites.b]] as const) {
          for (const name of Object.keys(meta.frames)) {
            const key = `${char}/${name}`;
            if (imgs.current.has(key)) continue;
            const im = new Image(); im.src = `/api/sprite/${char}/${name}`;
            imgs.current.set(key, im);
          }
        }
        setStatus('ready');
      } catch { if (alive) setStatus('error'); }
    })();
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    let raf = 0, last = 0, acc = 0, uiAcc = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const t = trackRef.current; if (!t) { last = ts; return; }
      if (!last) last = ts;
      const dt = Math.min(100, ts - last); last = ts;
      const frameMs = 1000 / t.fps;
      if (playRef.current) {
        acc += dt * speedRef.current;
        while (acc >= frameMs) {
          acc -= frameMs; idx.current++;
          if (idx.current >= t.frames.length) { idx.current = t.frames.length - 1; playRef.current = false; setPlaying(false); break; }
        }
      }
      draw(t, idx.current);
      uiAcc += dt; if (uiAcc > 120) { uiAcc = 0; setUi({ i: idx.current, total: t.frames.length }); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function fighter(ctx: CanvasRenderingContext2D, t: Track, side: 'a' | 'b', f: TF, ws: number, ox: number, oy: number) {
    const isA = side === 'a';
    const st = isA ? f.a : f.b;
    const char = isA ? t.aChar : t.bChar;
    const meta = isA ? t.sprites.a : t.sprites.b;
    let name = isA ? f.asp : f.bsp;
    let m = meta.frames[name]; let img = imgs.current.get(`${char}/${name}`);
    const ok = (i?: HTMLImageElement) => i && i.complete && i.naturalWidth > 0;
    if (!m || !ok(img)) { name = 'idle_1'; m = meta.frames.idle_1; img = imgs.current.get(`${char}/idle_1`); }
    if (!m || !ok(img)) return;
    const [w, h, ax, ay] = m;
    const sf = (t.fighterH * ws) / (meta.idleH || 256);
    const feetX = ox + st[0] * ws, feetY = oy + (t.groundY - st[1]) * ws;
    ctx.save();
    if (st[2] === -1) { ctx.translate(feetX, 0); ctx.scale(-1, 1); ctx.translate(-feetX, 0); }
    ctx.drawImage(img!, feetX - ax * sf, feetY - ay * sf, w * sf, h * sf);
    ctx.restore();
  }

  function hud(ctx: CanvasRenderingContext2D, t: Track, f: TF) {
    const pad = 26, barH = 15, barY = 20, half = CW / 2 - pad - 34;
    const bar = (x: number, hp: number, right: boolean) => {
      ctx.fillStyle = '#2a1414'; ctx.fillRect(x, barY, half, barH);
      const w = half * Math.max(0, Math.min(100, hp)) / 100;
      ctx.fillStyle = hp > 30 ? '#7bd94a' : '#e0483f';
      ctx.fillRect(right ? x + (half - w) : x, barY, w, barH);
      ctx.strokeStyle = '#0b0812'; ctx.lineWidth = 2; ctx.strokeRect(x, barY, half, barH);
    };
    bar(pad, f.a[3], true);
    bar(CW - pad - half, f.b[3], false);
    ctx.font = '700 20px ui-monospace, monospace'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5d94a'; ctx.textAlign = 'left'; ctx.fillText(t.aName, pad, barY + barH + 22);
    ctx.textAlign = 'right'; ctx.fillText(t.bName, CW - pad, barY + barH + 22);
    ctx.textAlign = 'center'; ctx.fillStyle = '#9a8fb5'; ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(f.ph === 'fight' ? `ROUND ${f.rd + 1}` : f.ph.toUpperCase(), CW / 2, barY + 13);
    if (f.msg) {
      ctx.font = '800 40px ui-monospace, monospace';
      ctx.fillStyle = '#17131f'; ctx.fillText(f.msg, CW / 2 + 2, CH * 0.42 + 2);
      ctx.fillStyle = '#f5d94a'; ctx.fillText(f.msg, CW / 2, CH * 0.42);
    }
  }

  function draw(t: Track, i: number) {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const f = t.frames[Math.max(0, Math.min(t.frames.length - 1, i))]; if (!f) return;
    const ws = Math.min(CW / t.worldW, CH / t.worldH);
    const ox = (CW - t.worldW * ws) / 2, oy = (CH - t.worldH * ws) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0812'; ctx.fillRect(0, 0, CW, CH);
    if (stageImg.current && stageImg.current.complete) ctx.drawImage(stageImg.current, ox, oy, t.worldW * ws, t.worldH * ws);
    // shadows
    for (const st of [f.a, f.b]) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      const sx = ox + st[0] * ws, sy = oy + (t.groundY + 1) * ws, r = 13 * ws;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    fighter(ctx, t, 'a', f, ws, ox, oy);
    fighter(ctx, t, 'b', f, ws, ox, oy);
    for (const [px, py, , style] of f.pr) {
      const cx = ox + px * ws, cy = oy + (t.groundY - py) * ws;
      ctx.fillStyle = projColor(style);
      ctx.beginPath(); ctx.arc(cx, cy, 5 * ws, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(cx, cy, 8 * ws, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    hud(ctx, t, f);
  }

  const setP = (p: boolean) => {
    const t = trackRef.current;
    if (p && t && idx.current >= t.frames.length - 1) { idx.current = 0; acc0(); }
    playRef.current = p; setPlaying(p);
  };
  const acc0 = () => { /* reset handled in loop via idx */ };
  const setSp = (s: number) => { speedRef.current = s; setSpeed(s); };
  const scrub = (v: number) => { idx.current = v; setUi((u) => ({ ...u, i: v })); const t = trackRef.current; if (t) draw(t, v); };

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

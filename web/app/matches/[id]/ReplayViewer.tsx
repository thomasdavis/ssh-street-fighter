'use client';
import { useEffect, useRef, useState } from 'react';
import { drawFrame, ensureImages, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';
import {
  DEFAULT_REPLAY_AUDIO_SETTINGS,
  ReplaySoundscape,
  characterAudioProfile,
  readReplayAudioSettings,
  replayAudioIntensity,
  stageAudioProfile,
  writeReplayAudioSettings,
  type ReplayAudioSettings,
  type StageAudioProfile,
} from '@/lib/replay-audio';

interface Track extends RenderMeta { fps: number; frames: Frame[] }
interface MixIdentity { stage: StageAudioProfile; a: string; b: string; }

export default function ReplayViewer({ matchId }: { matchId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ui, setUi] = useState({ i: 0, total: 0 });
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioSupported, setAudioSupported] = useState(true);
  const [audioSettings, setAudioSettings] = useState<ReplayAudioSettings>(DEFAULT_REPLAY_AUDIO_SETTINGS);
  const [mix, setMix] = useState<MixIdentity | null>(null);
  const [intensity, setIntensity] = useState(.2);

  const idx = useRef(0);
  const playRef = useRef(true);
  const speedRef = useRef(1);
  const imgs = useRef(new Map<string, HTMLImageElement>());
  const stageImg = useRef<HTMLImageElement | null>(null);
  const trackRef = useRef<Track | null>(null);
  const audioRef = useRef<ReplaySoundscape | null>(null);

  useEffect(() => {
    setAudioSupported(ReplaySoundscape.supported());
    setAudioSettings(readReplayAudioSettings());
    const onVisibility = () => audioRef.current?.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/matches/${matchId}/track`, { cache: 'force-cache' });
        if (!r.ok) throw new Error('no replay');
        const t = await r.json() as Track;
        if (!alive) return;
        trackRef.current = t;
        setMix({ stage: stageAudioProfile(t.stage), a: characterAudioProfile(t.aChar).signature, b: characterAudioProfile(t.bChar).signature });
        setUi({ i: 0, total: t.frames.length });
        setIntensity(t.frames[0] ? replayAudioIntensity(t.frames[0]) : .2);
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
          if (idx.current >= t.frames.length) {
            idx.current = t.frames.length - 1;
            audioRef.current?.observe(t.frames[idx.current]!, idx.current);
            audioRef.current?.setPlayback(false, speedRef.current);
            playRef.current = false; setPlaying(false); break;
          }
          audioRef.current?.observe(t.frames[idx.current]!, idx.current);
        }
      }
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawFrame(ctx, t, t.frames[Math.max(0, Math.min(t.frames.length - 1, idx.current))], imgs.current, stageImg.current, tick);
      uiAcc += dt; if (uiAcc > 120) {
        uiAcc = 0;
        const frame = t.frames[Math.max(0, Math.min(t.frames.length - 1, idx.current))];
        setUi({ i: idx.current, total: t.frames.length });
        if (frame) setIntensity(replayAudioIntensity(frame));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setP = (p: boolean) => {
    const t = trackRef.current;
    if (p && t && idx.current >= t.frames.length - 1) {
      idx.current = 0;
      audioRef.current?.seek(t.frames[0], 0);
    }
    playRef.current = p; setPlaying(p);
    audioRef.current?.setPlayback(p, speedRef.current);
  };
  const setSp = (s: number) => { speedRef.current = s; setSpeed(s); audioRef.current?.setPlayback(playRef.current, s); };
  const scrub = (v: number) => {
    idx.current = v; setUi((u) => ({ ...u, i: v }));
    const frame = trackRef.current?.frames[v];
    if (frame) setIntensity(replayAudioIntensity(frame));
    audioRef.current?.seek(frame, v);
  };
  const secs = (n: number) => `${Math.floor(n / (trackRef.current?.fps ?? 30))}s`;

  const updateAudio = (patch: Partial<ReplayAudioSettings>) => {
    setAudioSettings((current) => {
      const next = { ...current, ...patch };
      writeReplayAudioSettings(next);
      audioRef.current?.configure(next);
      return next;
    });
  };

  const toggleAudio = async () => {
    if (audioLoading) return;
    if (audioEnabled) {
      audioRef.current?.deactivate();
      setAudioEnabled(false);
      return;
    }
    const track = trackRef.current;
    if (!track || status !== 'ready') return;
    const soundscape = audioRef.current ?? new ReplaySoundscape({
      stage: track.stage, worldW: track.worldW, fps: track.fps, aChar: track.aChar, bChar: track.bChar,
    });
    audioRef.current = soundscape;
    setAudioLoading(true);
    try {
      const ready = await soundscape.activate(audioSettings);
      if (!ready) { setAudioSupported(false); return; }
      soundscape.seek(track.frames[idx.current], idx.current);
      soundscape.setPlayback(playRef.current, speedRef.current);
      setAudioEnabled(true);
    } finally { setAudioLoading(false); }
  };

  const audioLevel = intensity > .72 ? 'hot' : intensity > .42 ? 'active' : 'calm';

  return (
    <div className="rs-replay rs-replay--sound">
      <div className="rs-replay__stage">
        <canvas ref={canvasRef} width={CW} height={CH} />
        {status !== 'ready' && <div className="rs-replay__msg">{status === 'loading' ? 'Loading replay…' : 'Replay unavailable.'}</div>}
        {audioEnabled && mix && (
          <div className="rs-replay__mix-status" aria-hidden="true">
            <i /><span>{mix.stage.title}</span><small>RECORDED FOLEY MIX</small>
          </div>
        )}
      </div>
      <div className="rs-controls rs-controls--replay">
        <div className="rs-transport">
          <button className="play" onClick={() => setP(!playing)} disabled={status !== 'ready'}>{playing ? 'Pause' : 'Play'}</button>
          <input aria-label="Replay position" type="range" min={0} max={Math.max(0, ui.total - 1)} value={ui.i}
            onChange={(e) => { setP(false); scrub(parseInt(e.target.value, 10)); }} disabled={status !== 'ready'} />
          <span className="t">{secs(ui.i)} / {secs(ui.total)}</span>
          <div className="rs-speed" role="group" aria-label="Playback speed">
            {[0.5, 1, 2].map((s) => <button key={s} aria-pressed={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSp(s)}>{s}×</button>)}
          </div>
        </div>
        <section className="rs-soundboard" data-enabled={audioEnabled ? '1' : undefined} data-loading={audioLoading ? '1' : undefined}
          data-level={audioLevel} aria-label="Replay soundscape" aria-busy={audioLoading}>
          <div className="rs-soundboard__identity">
            <span>STUDIO SCORE · RECORDED FOLEY</span>
            <strong>{mix?.stage.title ?? 'Stage score'}</strong>
            <small>{mix ? `${mix.a} × ${mix.b}` : 'Waiting for fighter signatures'}</small>
          </div>
          <button className="rs-sound-toggle" type="button" aria-pressed={audioEnabled} onClick={toggleAudio}
            disabled={!audioSupported || status !== 'ready' || audioLoading}>
            <i aria-hidden="true" /><span>Sound</span><small>{audioLoading ? 'LOADING' : audioSupported ? audioEnabled ? 'ON' : 'OFF' : 'UNAVAILABLE'}</small>
          </button>
          <button className="rs-channel-toggle" type="button" aria-pressed={audioSettings.music} onClick={() => updateAudio({ music: !audioSettings.music })}
            disabled={!audioSupported}>
            <span>Music</span><small>{audioSettings.music ? 'IN' : 'OUT'}</small>
          </button>
          <button className="rs-channel-toggle" type="button" aria-pressed={audioSettings.effects} onClick={() => updateAudio({ effects: !audioSettings.effects })}
            disabled={!audioSupported}>
            <span>Fight FX</span><small>{audioSettings.effects ? 'IN' : 'OUT'}</small>
          </button>
          <label className="rs-volume">
            <span>Volume</span>
            <input aria-label="Replay audio volume" type="range" min={0} max={100} value={Math.round(audioSettings.volume * 100)}
              onChange={(e) => updateAudio({ volume: Number(e.target.value) / 100 })} disabled={!audioSupported} />
            <output>{Math.round(audioSettings.volume * 100)}</output>
          </label>
          <div className="rs-mix-meter" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <p>Click Sound to load the studio mix · recorded effects, adaptive score, independent channels</p>
        </section>
      </div>
    </div>
  );
}

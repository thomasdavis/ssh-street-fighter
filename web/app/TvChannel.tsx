'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { drawFrame, ensureImages, sameRenderIdentity, stageUrl, CW, CH, type Frame, type RenderMeta } from '@/lib/replay-render';
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
import { tvCanAdvance, tvLiveMissingLongEnough, type TvAdvanceReason } from '@/lib/tv-director';

interface Track extends RenderMeta { fps: number; frames: Frame[] }
interface Live extends RenderMeta { mid: string; frame: Frame; over: boolean; fps?: number }
interface MixIdentity { stage: StageAudioProfile; a: string; b: string }

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
  const [handoff, setHandoff] = useState<{ mid: string; title: string; sub: string } | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioSupported, setAudioSupported] = useState(true);
  const [audioSettings, setAudioSettings] = useState<ReplayAudioSettings>(DEFAULT_REPLAY_AUDIO_SETTINGS);
  const [mix, setMix] = useState<MixIdentity | null>(null);
  const [intensity, setIntensity] = useState(.2);

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
  const liveMissingSince = useRef<number | null>(null);
  const replayRot = useRef(-1);
  const replayId = useRef<string | null>(null);
  const busy = useRef(false);
  const audioRef = useRef<ReplaySoundscape | null>(null);
  const audioWanted = useRef(false);
  const audioSettingsRef = useRef<ReplayAudioSettings>(DEFAULT_REPLAY_AUDIO_SETTINGS);
  const audioActivation = useRef(0);
  const audioFrameSerial = useRef(0);
  const lastIntensityUi = useRef(0);

  const currentFrame = () => kind.current === 'live' ? cur.current?.f : track.current?.frames[idx.current];
  const currentFrameIndex = () => kind.current === 'live' ? audioFrameSerial.current : idx.current;
  const currentSourceKey = () => kind.current === 'live' ? `live:${liveMid.current ?? 'pending'}` : `replay:${replayId.current ?? 'pending'}`;

  const presentIntensity = (frame: Frame) => {
    const now = performance.now();
    if (now - lastIntensityUi.current < 160) return;
    lastIntensityUi.current = now;
    setIntensity(replayAudioIntensity(frame));
  };

  const switchSoundscape = (m: RenderMeta & { fps?: number }, initialFrame: Frame, frameIndex: number) => {
    setMix({
      stage: stageAudioProfile(m.stage),
      a: characterAudioProfile(m.aChar).signature,
      b: characterAudioProfile(m.bChar).signature,
    });
    setIntensity(replayAudioIntensity(initialFrame));

    const token = ++audioActivation.current;
    const previousAudio = audioRef.current;
    audioRef.current = null;
    if (previousAudio) void previousAudio.dispose();
    if (!audioWanted.current) { setAudioLoading(false); return; }

    const sourceKey = currentSourceKey();
    const soundscape = new ReplaySoundscape({ stage: m.stage, worldW: m.worldW, fps: m.fps ?? 30, aChar: m.aChar, bChar: m.bChar });
    audioRef.current = soundscape;
    setAudioLoading(true);
    void soundscape.activate(audioSettingsRef.current).then((ready) => {
      if (token !== audioActivation.current || sourceKey !== currentSourceKey()) {
        void soundscape.dispose();
        return;
      }
      if (!ready) {
        audioWanted.current = false;
        setAudioEnabled(false);
        setAudioSupported(false);
        return;
      }
      soundscape.seek(currentFrame() ?? initialFrame, currentFrameIndex() || frameIndex);
      soundscape.setPlayback(true, 1);
    }).finally(() => {
      if (token === audioActivation.current) setAudioLoading(false);
    });
  };

  const setStageAndImgs = (m: RenderMeta) => {
    metaRef.current = m;
    if (!stage.current || stage.current.dataset?.stage !== m.stage) {
      const si = new Image(); si.onload = () => { if (metaRef.current?.stage === m.stage) stage.current = si; }; si.src = stageUrl(m.stage); if (si.dataset) si.dataset.stage = m.stage;
      stage.current = si;
    }
    ensureImages(m, imgs.current);
  };

  const startLive = (m: any) => {
    // Refreshes of the live list must never re-introduce the program already on
    // air as a "new" match. Apart from the false banner, resetting here also
    // discards interpolation and audio state for the fight still in progress.
    if (kind.current === 'live' && liveMid.current === m.mid) return;
    kind.current = 'live'; liveMid.current = m.mid; replayId.current = null; track.current = null;
    audioFrameSerial.current = 0; liveMissingSince.current = null;
    prev.current = null; cur.current = null; metaRef.current = null;
    const nextHandoff = { mid: m.mid, title: `${m.a.name} vs ${m.b.name}`, sub: `${m.a.char} vs ${m.b.char} · ${m.stage}` };
    setHandoff(nextHandoff);
    setTimeout(() => setHandoff((current) => current?.mid === m.mid ? null : current), 1200);
    setCap({ text: `${m.a.name}${m.a.bot ? ' [BOT]' : ''} vs ${m.b.name}${m.b.bot ? ' [BOT]' : ''}`, sub: `${m.a.char} vs ${m.b.char} · ${m.stage}`, href: `/watch/${m.mid}`, live: true });
  };
  const startReplay = async (r: { id: string; title: string }) => {
    kind.current = 'replay'; liveMid.current = null; replayId.current = r.id;
    try {
      const res = await fetch(`/api/matches/${r.id}/track`, { cache: 'force-cache' });
      if (!res.ok) return false;
      const t = await res.json() as Track;
      track.current = t; setStageAndImgs(t); idx.current = 0; loops.current = 0;
      const firstFrame = t.frames[0];
      if (firstFrame) switchSoundscape(t, firstFrame, 0);
      setCap({ text: r.title, sub: 'recent replay', href: `/matches/${r.id}`, live: false });
      return true;
    } catch { return false; }
  };

  // Director: choose the next thing to show. Live matches win; else rotate replays.
  const advance = async (reason: TvAdvanceReason, endedMid: string | null = null) => {
    // A live bout is the program until its authoritative end. Newly arriving
    // fights may preempt replays, never another live fight.
    if (!tvCanAdvance(kind.current, reason, liveMid.current, endedMid)) return;
    if (busy.current) return; busy.current = true;
    try {
      let list = liveList.current;
      try { const r = await fetch('/api/live', { cache: 'no-store' }); if (r.ok) { const d = await r.json(); list = d.live || []; liveList.current = list; } } catch { /* keep last */ }
      // The frame endpoint can fail transiently. If the authoritative live list
      // still contains this match, keep it on air and retry its frames instead
      // of cutting to another bout (or flashing a false NEW MATCH banner).
      if (reason === 'live-ended' && endedMid && list.some((m: any) => m.mid === endedMid)) return;
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
      setTimeout(() => { busy.current = false; void advance('retry'); }, 4000);
      return;
    } finally { busy.current = false; }
  };

  useEffect(() => { void advance('initial'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // periodic director check: if we're on a replay but a live match starts, cut to it
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        const d = r.ok ? await r.json() : { live: [] };
        liveList.current = d.live || [];
        if (kind.current === 'replay' && liveList.current.length) void advance('live-arrived');
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
      const requestedMid = liveMid.current;
      try {
        const r = await fetch(`/api/live/${encodeURIComponent(requestedMid)}`, { cache: 'no-store' });
        if (r.ok) {
          liveMissingSince.current = null;
          const d = await r.json() as Live;
          if (!alive || kind.current !== 'live' || liveMid.current !== requestedMid || d.mid !== requestedMid) {
            setTimeout(poll, 90); return;
          }
          if (!sameRenderIdentity(metaRef.current, d)) {
            setStageAndImgs(d);
            audioFrameSerial.current = 0;
            switchSoundscape(d, d.frame, 0);
          }
          prev.current = cur.current ?? { f: d.frame, t: performance.now() };
          cur.current = { f: d.frame, t: performance.now() };
          audioRef.current?.observe(d.frame, audioFrameSerial.current++);
          presentIntensity(d.frame);
          // `over` begins the eight-second winner presentation. Keep rendering
          // it; the coordinator removes the match from the endpoint only after
          // that full closing sequence has completed.
        } else if (r.status === 404 && liveMid.current === requestedMid) {
          const now = performance.now();
          liveMissingSince.current ??= now;
          if (tvLiveMissingLongEnough(liveMissingSince.current, now)) {
            await advance('live-ended', requestedMid);
            // If the live list still had this match, give its frame endpoint a
            // fresh grace period before considering another handoff.
            if (liveMid.current === requestedMid) liveMissingSince.current = null;
          }
        }
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
        while (acc >= step) {
          acc -= step; idx.current += 1;
          if (idx.current >= t.frames.length) {
            idx.current = 0; loops.current += 1;
            audioRef.current?.seek(t.frames[0], 0);
            if (loops.current >= 2) { void advance('replay-complete'); }
          } else {
            audioRef.current?.observe(t.frames[idx.current]!, idx.current);
          }
        }
        const frame = t.frames[Math.min(idx.current, t.frames.length - 1)];
        if (frame) { drawFrame(ctx, t, frame, imgs.current, stage.current, tick); presentIntensity(frame); }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const settings = readReplayAudioSettings();
    audioSettingsRef.current = settings;
    setAudioSettings(settings);
    setAudioSupported(ReplaySoundscape.supported());
    const onVisibility = () => audioRef.current?.setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      audioActivation.current += 1;
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const updateAudio = (patch: Partial<ReplayAudioSettings>) => {
    setAudioSettings((current) => {
      const next = { ...current, ...patch };
      audioSettingsRef.current = next;
      writeReplayAudioSettings(next);
      audioRef.current?.configure(next);
      return next;
    });
  };

  const toggleAudio = () => {
    if (audioLoading) return;
    if (audioWanted.current) {
      audioWanted.current = false;
      setAudioEnabled(false);
      audioRef.current?.deactivate();
      return;
    }
    const m = metaRef.current;
    const frame = currentFrame();
    if (!m || !frame) return;
    audioWanted.current = true;
    setAudioEnabled(true);
    switchSoundscape(m, frame, currentFrameIndex());
  };

  const audioLevel = intensity > .72 ? 'hot' : intensity > .42 ? 'active' : 'calm';

  return (
    <div className="rs-tv">
      <div className="rs-tv__screen">
        <canvas ref={canvasRef} width={CW} height={CH} />
        <div className="rs-tv__scan" aria-hidden />
        {handoff && <div className="rs-tv__handoff" aria-live="polite">
          <span>NEW MATCH</span><strong>{handoff.title}</strong><small>{handoff.sub}</small>
        </div>}
        <div className="rs-tv__cap">
          <span className={`rs-tv__badge${cap.live ? ' live' : ''}`}>{cap.live ? <><span className="rs-dot" /> LIVE</> : 'REPLAY'}</span>
          <span className="rs-tv__title">{cap.text}</span>
          {cap.sub && <span className="rs-tv__sub">{cap.sub}</span>}
          <Link href={cap.href} className="rs-tv__link">{cap.live ? 'Open match →' : 'Full replay →'}</Link>
        </div>
        <div className="rs-tv__chan">SSH FIGHTER · TV</div>
        {audioEnabled && mix && (
          <div className="rs-replay__mix-status rs-tv__mix-status" aria-hidden="true">
            <i /><span>{mix.stage.title}</span><small>LIVE STUDIO MIX</small>
          </div>
        )}
      </div>
      <div className="rs-controls rs-tv__sounddeck">
        <section className="rs-soundboard rs-soundboard--tv" data-enabled={audioEnabled ? '1' : undefined} data-loading={audioLoading ? '1' : undefined}
          data-level={audioLevel} aria-label="TV soundscape" aria-busy={audioLoading}>
          <div className="rs-soundboard__identity">
            <span>BROADCAST SCORE · RECORDED FOLEY</span>
            <strong>{mix?.stage.title ?? 'Tuning the stage'}</strong>
            <small>{mix ? `${mix.a} × ${mix.b}` : 'Waiting for the next fight'}</small>
          </div>
          <button className="rs-sound-toggle" type="button" aria-pressed={audioEnabled} onClick={toggleAudio}
            disabled={!audioSupported || !mix || audioLoading}>
            <i aria-hidden="true" /><span>Sound</span><small>{audioLoading ? 'TUNING' : audioSupported ? audioEnabled ? 'ON' : 'OFF' : 'UNAVAILABLE'}</small>
          </button>
          <button className="rs-channel-toggle" type="button" aria-pressed={audioSettings.music} onClick={() => updateAudio({ music: !audioSettings.music })}
            disabled={!audioSupported}>
            <span>Music</span><small>{audioSettings.music ? 'IN' : 'OUT'}</small>
          </button>
          <button className="rs-channel-toggle" type="button" aria-pressed={audioSettings.effects} onClick={() => updateAudio({ effects: !audioSettings.effects })}
            disabled={!audioSupported}>
            <span>Fight FX</span><small>{audioSettings.effects ? 'IN' : 'OUT'}</small>
          </button>
          <button className="rs-channel-toggle" type="button" aria-pressed={audioSettings.announcer} onClick={() => updateAudio({ announcer: !audioSettings.announcer })}
            disabled={!audioSupported}>
            <span>Announcer</span><small>{audioSettings.announcer ? 'IN' : 'OUT'}</small>
          </button>
          <label className="rs-volume">
            <span>Volume</span>
            <input aria-label="TV audio volume" type="range" min={0} max={100} value={Math.round(audioSettings.volume * 100)}
              onChange={(e) => updateAudio({ volume: Number(e.target.value) / 100 })} disabled={!audioSupported} />
            <output>{Math.round(audioSettings.volume * 100)}</output>
          </label>
          <div className="rs-mix-meter" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <p>Click Sound once · the studio mix follows this bout through the finish, then retunes for the next</p>
        </section>
      </div>
    </div>
  );
}

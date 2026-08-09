'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { SpriteFrame } from '@/lib/fighters';

interface AnimatedSpriteProps {
  character: string;
  frames: SpriteFrame[];
  label: string;
  priority?: boolean;
  compact?: boolean;
}

const spriteUrl = (character: string, frame: SpriteFrame) => `/api/sprite/${encodeURIComponent(character)}/${encodeURIComponent(frame.name)}?v=${frame.mtime}`;

export default function AnimatedSprite({ character, frames, label, priority = false, compact = false }: AnimatedSpriteProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sequenceReady, setSequenceReady] = useState(frames.length < 2);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (frames.length < 2) return;
    let cancelled = false;
    Promise.all(frames.map((frame) => new Promise<void>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = spriteUrl(character, frame);
    }))).then(() => { if (!cancelled) setSequenceReady(true); });
    return () => { cancelled = true; };
  }, [character, frames]);

  useEffect(() => {
    if (paused || reducedMotion || !sequenceReady || frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex((index) => (index + 1) % frames.length), compact ? 180 : 260);
    return () => window.clearInterval(timer);
  }, [compact, frames.length, paused, reducedMotion, sequenceReady]);

  const frame = frames[frameIndex % frames.length] ?? frames[0];
  if (!frame) return null;
  const canAnimate = frames.length > 1 && !reducedMotion;

  return (
    <div className={`sprite-player${compact ? ' sprite-player--compact' : ''}`}>
      <div className="sprite-player__viewport">
        <Image
          src={spriteUrl(character, frame)}
          alt={`${label}, animation frame ${frameIndex + 1} of ${frames.length}`}
          width={frame.width}
          height={frame.height}
          priority={priority}
          unoptimized
        />
      </div>
      {canAnimate && (
        <button className="sprite-player__control" type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
      )}
    </div>
  );
}

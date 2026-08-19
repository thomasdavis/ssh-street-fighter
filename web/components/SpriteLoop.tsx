'use client';
import { useEffect, useState } from 'react';

// Lightweight animated sprite: cycles the given poses for a character. Plain <img>
// (pixelated) so it's cheap to place many on a page.
export function SpriteLoop({ char, poses, ms = 420, className, style }: { char: string; poses: string[]; ms?: number; className?: string; style?: React.CSSProperties }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (poses.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % poses.length), ms);
    return () => clearInterval(id);
  }, [poses.length, ms]);
  const pose = poses[i] ?? poses[0] ?? 'idle_1';
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/sprite/${encodeURIComponent(char)}/${pose}`} alt={char} className={className} loading="lazy" style={{ imageRendering: 'pixelated', ...style }} />;
}

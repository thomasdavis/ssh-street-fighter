'use client';
import { useEffect, useState } from 'react';

interface Side { name: string; char: string; hp: number; wins: number }
interface LM { mid: string; stage: string; round: number; phase: string; a: Side; b: Side }

export function LiveMatches({ initial, colors }: { initial: LM[]; colors: Record<string, string> }) {
  const [matches, setMatches] = useState<LM[]>(initial);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setMatches(Array.isArray(d.live) ? d.live : []);
      } catch { /* keep last state */ }
    };
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!matches.length) {
    return <div className="rs-empty">No live matches right now — <code style={{ color: 'var(--cyan)' }}>ssh sshfighter.com</code> and start one.</div>;
  }
  return (
    <div className="rs-grid3">
      {matches.map((m) => <LiveCard key={m.mid} m={m} colors={colors} />)}
    </div>
  );
}

function LiveCard({ m, colors }: { m: LM; colors: Record<string, string> }) {
  const phase = m.phase === 'fight' ? `Round ${m.round + 1}` : m.phase.replace('-', ' ');
  return (
    <div className="rs-match" style={{ cursor: 'default' }}>
      <div className="side a">
        <span className="nm">{m.a.name}</span>
        <span className="ch"><span className="rs-chip rs-chip--sm"><i style={{ background: colors[m.a.char] ?? '#9a8fb5' }} />{m.a.char}</span></span>
        <div className="rs-hp" style={{ width: '100%', marginTop: 4 }}><i style={{ width: `${Math.max(0, m.a.hp)}%` }} /></div>
      </div>
      <span className="vs">VS</span>
      <div className="side b">
        <span className="nm">{m.b.name}</span>
        <span className="ch"><span className="rs-chip rs-chip--sm"><i style={{ background: colors[m.b.char] ?? '#9a8fb5' }} />{m.b.char}</span></span>
        <div className="rs-hp" style={{ width: '100%', marginTop: 4 }}><i style={{ width: `${Math.max(0, m.b.hp)}%` }} /></div>
      </div>
      <div className="meta"><span className="rs-dot" style={{ display: 'inline-block' }} /><span>{phase}</span><span>·</span><span>{m.stage}</span></div>
    </div>
  );
}

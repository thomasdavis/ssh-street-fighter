import Link from 'next/link';
import { charColor } from '@/lib/chars';

const LINKS: [string, string][] = [
  ['/', 'Home'], ['/leaderboard', 'Leaderboard'], ['/characters', 'Characters'],
  ['/matches', 'Matches'], ['/roster', 'Fighters'], ['/status', 'Server'], ['/bots', 'Bots'],
];

export function SiteNav({ active, online }: { active?: string; online?: number }) {
  return (
    <nav className="rs-nav">
      <div className="rs-nav__in">
        <Link href="/" className="rs-brand"><b />SSH STREET FIGHTER</Link>
        <div className="rs-navlinks">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} data-active={active === href ? '1' : undefined}>{label}</Link>
          ))}
        </div>
        {online !== undefined && (
          <div className="rs-nav__live"><span className="rs-dot" />{online} online</div>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="rs-footer">
      <div className="rs-wrap">
        <div className="row">
          <span className="rs-brand" style={{ textShadow: 'none' }}><b />RINGSIDE</span>
          <Link href="/bots">Build a bot</Link>
          <Link href="/status">Server status</Link>
          <a href="https://github.com/thomasdavis/ssh-street-fighter" target="_blank" rel="noreferrer">GitHub</a>
          <span style={{ marginLeft: 'auto' }}>Jump in — <code style={{ color: 'var(--cyan)' }}>ssh sshfighter.com</code></span>
        </div>
      </div>
    </footer>
  );
}

export function CharChip({ char, sm }: { char: string; sm?: boolean }) {
  return <span className={`rs-chip${sm ? ' rs-chip--sm' : ''}`}><i style={{ background: charColor(char) }} />{char}</span>;
}

export function Sprite({ char, pose = 'idle_1', className }: { char: string; pose?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/sprite/${encodeURIComponent(char)}/${pose}`} alt={char} className={className} loading="lazy" />;
}

// ---- charts (pure SVG) ----
export function Sparkline({ data, w = 320, h = 56, color = '#6fe0f0', area = true }: { data: number[]; w?: number; h?: number; color?: string; area?: boolean }) {
  if (data.length < 2) return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} />;
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 8) - 4] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {area && <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={color} opacity={0.12} />}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

export function Ring({ pct, size = 78, stroke = 8, color = '#f5d94a' }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#241c33" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="#e9e4f2" fontSize={size * 0.23} fontWeight={700}>{Math.round(pct)}%</text>
    </svg>
  );
}

export interface BarRow { label: string; pct: number; value: string; color?: string }
export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <div className="rs-bars">
      {rows.map((r, i) => (
        <div className="rs-barrow" key={i}>
          <span className="lbl">{r.label}</span>
          <div className="rs-bartrack"><i style={{ width: `${Math.max(2, Math.min(100, r.pct))}%`, background: r.color ?? undefined }} /></div>
          <span className="val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

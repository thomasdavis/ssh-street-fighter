// Small display helpers shared across the site.

export function timeAgo(ms: number | null | undefined): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function frames(f: number): string {
  const s = Math.round(f / 30);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function num(n: number): string { return n.toLocaleString('en-US'); }

export function pct(n: number, digits = 0): string { return `${n.toFixed(digits)}%`;}

export function winRate(wins: number, games: number): number { return games ? Math.round((1000 * wins) / games) / 10 : 0; }

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

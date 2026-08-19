import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteNav, Footer, CharChip } from '@/components/ui';
import { getMatch, getMatchPlayers, getMatchEvents, hasReplay, onlineNow } from '@/lib/ringside';
import { timeAgo, frames } from '@/lib/format';
import ReplayViewer from './ReplayViewer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = getMatch(id);
  return { title: m ? `${m.a_name} vs ${m.b_name} — Replay` : 'Match — SSH Fighter' };
}

const STAT_ROWS: [string, keyof import('@/lib/ringside').MatchPlayerRow][] = [
  ['Rounds won', 'rounds_won'], ['Damage dealt', 'damage_dealt'], ['Damage taken', 'damage_taken'],
  ['Hits landed', 'hits'], ['Specials', 'specials'], ['Best combo', 'max_combo'],
];

function describe(ev: { type: string; data: Record<string, unknown> }, aName: string, bName: string): string {
  const who = (s: unknown) => (s === 'a' ? aName : bName);
  const d = ev.data;
  switch (ev.type) {
    case 'hit': return `${who(d.by)} connects for ${d.dmg}${Number(d.combo) > 1 ? ` · combo ×${d.combo}` : ''}`;
    case 'special': return `${who(d.by)} lands a ${String(d.kind).toUpperCase()}`;
    case 'ko': return `${who(d.by)} scores a K.O.`;
    case 'round': return `Round to ${who(d.winner)} — ${d.aWins}–${d.bWins}`;
    default: return ev.type;
  }
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = getMatch(id);
  if (!m) notFound();
  const players = getMatchPlayers(id);
  const a = players.find((p) => p.side === 'a');
  const b = players.find((p) => p.side === 'b');
  const events = getMatchEvents(id);
  const replay = hasReplay(id);
  const aWon = m.winner === 'a';

  return (
    <div className="rs">
      <SiteNav active="/matches" online={onlineNow()} />
      <main className="rs-wrap">

        <section style={{ padding: '30px 0 18px' }}>
          <Link href="/matches" style={{ color: 'var(--dim)', fontSize: 12, textDecoration: 'none' }}>← All matches</Link>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16, marginTop: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: aWon ? 'var(--gold)' : 'var(--text)', fontSize: 'clamp(1.5rem,4vw,2.4rem)', fontWeight: 800, textTransform: 'uppercase' }}>{m.a_name}{aWon ? ' 👑' : ''}</div>
              <div style={{ marginTop: 4 }}><CharChip char={m.a_char} /></div>
            </div>
            <div style={{ color: 'var(--red)', fontWeight: 800, fontSize: 20 }}>VS</div>
            <div>
              <div style={{ color: !aWon ? 'var(--gold)' : 'var(--text)', fontSize: 'clamp(1.5rem,4vw,2.4rem)', fontWeight: 800, textTransform: 'uppercase' }}>{!aWon ? '👑 ' : ''}{m.b_name}</div>
              <div style={{ marginTop: 4 }}><CharChip char={m.b_char} /></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, color: 'var(--dim)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', flexWrap: 'wrap' }}>
            <span>{m.mode}</span><span>·</span><span>{m.stage}</span><span>·</span><span>{m.a_rounds}–{m.b_rounds}</span><span>·</span>
            <span>{frames(m.duration_frames)}</span><span>·</span><span>{m.end_reason}</span><span>·</span><span>{timeAgo(m.ended_at)}</span>
          </div>
        </section>

        {replay
          ? <ReplayViewer matchId={id} />
          : <div className="rs-empty">No replay stored for this match.</div>}

        <div className="rs-grid2" style={{ marginTop: 40 }}>
          <section className="rs-section">
            <div className="rs-section__head"><h2>Box score</h2></div>
            <table className="rs-table">
              <thead><tr><th></th><th className="rs-num">{m.a_name}</th><th className="rs-num">{m.b_name}</th></tr></thead>
              <tbody>
                {STAT_ROWS.map(([label, key]) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--dim)' }}>{label}</td>
                    <td className="rs-num">{a ? String(a[key]) : '—'}</td>
                    <td className="rs-num">{b ? String(b[key]) : '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ color: 'var(--dim)' }}>Elo change</td>
                  <td className={`rs-num ${a && a.elo_delta >= 0 ? 'rs-pos' : 'rs-neg'}`}>{a ? (a.elo_delta >= 0 ? '+' : '') + a.elo_delta : '—'}</td>
                  <td className={`rs-num ${b && b.elo_delta >= 0 ? 'rs-pos' : 'rs-neg'}`}>{b ? (b.elo_delta >= 0 ? '+' : '') + b.elo_delta : '—'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="rs-section">
            <div className="rs-section__head"><h2>Timeline</h2><span style={{ color: 'var(--dim)', fontSize: 11 }}>{events.length} events</span></div>
            {events.length ? (
              <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {events.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: '1px solid #251d36' }}>
                    <span style={{ color: 'var(--dim)', width: 44, fontVariantNumeric: 'tabular-nums' }}>{(e.frame / 30).toFixed(1)}s</span>
                    <span style={{ color: e.type === 'ko' ? 'var(--gold)' : e.type === 'special' ? 'var(--cyan)' : 'var(--text)' }}>{describe(e, m.a_name, m.b_name)}</span>
                  </div>
                ))}
              </div>
            ) : <div className="rs-empty">No scoring events recorded — likely an early exit or forfeit.</div>}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}

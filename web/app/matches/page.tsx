import Link from 'next/link';
import { SiteNav, Footer, CharChip, PlayerTypeBadge } from '@/components/ui';
import { recentMatches, matchCount, onlineNow, hasReplay } from '@/lib/ringside';
import { timeAgo, frames } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matches', description: 'Every recorded match. Drill in for the box score and replay.' };

const PER = 40;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ page?: string; mode?: string }> }) {
  const sp = await searchParams;
  const mode = sp.mode === 'versus' || sp.mode === 'practice' ? sp.mode : undefined;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const total = matchCount(mode);
  const pages = Math.max(1, Math.ceil(total / PER));
  const rows = recentMatches(PER, { mode, offset: (page - 1) * PER });
  const q = (p: number) => `/matches?page=${p}${mode ? `&mode=${mode}` : ''}`;

  return (
    <div className="rs">
      <SiteNav active="/matches" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph"><h1>Matches</h1><p>{total.toLocaleString()} recorded · every game is replayable.</p></div>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0 18px' }}>
          <Link className={`rs-pill${!mode ? ' ko' : ''}`} href="/matches" style={{ padding: '5px 12px' }}>All</Link>
          <Link className={`rs-pill${mode === 'versus' ? ' ko' : ''}`} href="/matches?mode=versus" style={{ padding: '5px 12px' }}>Ranked</Link>
          <Link className={`rs-pill${mode === 'practice' ? ' ko' : ''}`} href="/matches?mode=practice" style={{ padding: '5px 12px' }}>Practice</Link>
        </div>

        <section className="rs-section">
          <div style={{ overflowX: 'auto' }}>
            <table className="rs-table">
              <thead><tr><th>When</th><th>Match</th><th>Stage</th><th className="rs-num">Length</th><th>Result</th><th></th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const aWon = m.winner === 'a';
                  return (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>{timeAgo(m.ended_at)}</td>
                      <td>
                        <Link href={`/matches/${m.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ color: aWon ? 'var(--gold)' : 'var(--text)', fontWeight: 700 }}>{m.a_name}</span>
                          <PlayerTypeBadge isBot={m.a_is_bot} />
                          <CharChip char={m.a_char} sm />
                          <span style={{ color: 'var(--red)', fontSize: 11 }}>vs</span>
                          <span style={{ color: !aWon ? 'var(--gold)' : 'var(--text)', fontWeight: 700 }}>{m.b_name}</span>
                          <PlayerTypeBadge isBot={m.b_is_bot} />
                          <CharChip char={m.b_char} sm />
                        </Link>
                      </td>
                      <td style={{ color: 'var(--dim)', textTransform: 'uppercase', fontSize: 11 }}>{m.stage}</td>
                      <td className="rs-num">{frames(m.duration_frames)}</td>
                      <td><span className={`rs-pill ${m.end_reason === 'ko' ? 'ko' : ''}`}>{m.mode === 'practice' ? 'practice' : m.end_reason}</span></td>
                      <td className="rs-num">{hasReplay(m.id) ? <Link href={`/matches/${m.id}`} style={{ color: 'var(--cyan)' }}>▶ replay</Link> : <span style={{ color: 'var(--edge)' }}>—</span>}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="rs-empty" style={{ border: 0 }}>No matches yet.</td></tr>}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, alignItems: 'center' }}>
              {page > 1 && <Link className="rs-btn ghost" href={q(page - 1)}>← Prev</Link>}
              <span style={{ color: 'var(--dim)', fontSize: 12 }}>Page {page} / {pages}</span>
              {page < pages && <Link className="rs-btn ghost" href={q(page + 1)}>Next →</Link>}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

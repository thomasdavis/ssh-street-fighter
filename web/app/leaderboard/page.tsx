import Link from 'next/link';
import { SiteNav, Footer, CharChip, PlayerTypeBadge } from '@/components/ui';
import { topPlayers, onlineNow, summary } from '@/lib/ringside';
import { winRate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leaderboard', description: 'The ranked Elo ladder.' };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ division?: string }> }) {
  const { division } = await searchParams;
  const open = division === 'open';
  const players = topPlayers(200, open ? 'all' : 'humans');
  const s = summary();
  const peak = players[0]?.elo ?? 1200;

  return (
    <div className="rs">
      <SiteNav active="/leaderboard" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph">
          <h1>{open ? 'Open League' : 'Human League'}</h1>
          <p>{open
            ? 'Every ranked account in one field. Automated players are clearly marked.'
            : 'Human accounts only. Switch to Open League to compare against the bots.'}</p>
        </div>
        <nav className="rs-divisions" aria-label="Leaderboard division">
          <Link className={`rs-pill${open ? '' : ' ko'}`} href="/leaderboard" aria-current={open ? undefined : 'page'}>Human League</Link>
          <Link className={`rs-pill${open ? ' ko' : ''}`} href="/leaderboard?division=open" aria-current={open ? 'page' : undefined}>Open League · Bots + all</Link>
        </nav>
        <section className="rs-stats" style={{ marginTop: 18 }}>
          <div className="rs-stat hl"><b>{players.length}</b><span>{open ? 'Open competitors' : 'Ranked humans'}</span></div>
          <div className="rs-stat"><b>{peak}</b><span>Top Elo</span></div>
          <div className="rs-stat"><b>{open ? s.versus : s.humanVersus}</b><span>{open ? 'All ranked matches' : 'Human vs human'}</span></div>
          <div className="rs-stat"><b>{onlineNow()}</b><span>Online now</span></div>
        </section>

        <section className="rs-section">
          <div style={{ overflowX: 'auto' }}>
            <table className="rs-table">
              <thead>
                <tr>
                  <th>#</th><th>Player</th><th>Main</th>
                  <th className="rs-num">Matches</th><th className="rs-num">W–L</th>
                  <th style={{ width: 160 }}>Win rate</th><th className="rs-num">Peak</th><th className="rs-num">Elo</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const wr = winRate(p.wins, p.wins + p.losses);
                  return (
                    <tr key={p.username}>
                      <td className={`rs-rank${p.rank <= 3 ? ' top' : ''}`}>{p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : p.rank}</td>
                      <td><Link href={`/players/${encodeURIComponent(p.username)}`}>{p.username}</Link><PlayerTypeBadge isBot={open && p.is_bot} /></td>
                      <td>{p.main_char ? <CharChip char={p.main_char} sm /> : <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                      <td className="rs-num">{p.matches}</td>
                      <td className="rs-num">{p.wins}–{p.losses}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="rs-bartrack" style={{ flex: 1 }}><i style={{ width: `${wr}%`, background: wr >= 50 ? 'linear-gradient(90deg,var(--green),#b6e84a)' : 'linear-gradient(90deg,var(--red),#e0a04a)' }} /></div>
                          <span style={{ color: 'var(--dim)', width: 34, textAlign: 'right' }}>{wr}%</span>
                        </div>
                      </td>
                      <td className="rs-num" style={{ color: 'var(--dim)' }}>{p.peak_elo}</td>
                      <td className="rs-num rs-elo">{p.elo}</td>
                    </tr>
                  );
                })}
                {players.length === 0 && <tr><td colSpan={8} className="rs-empty" style={{ border: 0 }}>No ranked {open ? 'players' : 'humans'} yet — be the first: <code>ssh sshfighter.com</code></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

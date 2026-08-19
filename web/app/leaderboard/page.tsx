import Link from 'next/link';
import { SiteNav, Footer, CharChip } from '@/components/ui';
import { topPlayers, onlineNow, summary } from '@/lib/ringside';
import { winRate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leaderboard — SSH Street Fighter', description: 'The ranked Elo ladder.' };

export default function LeaderboardPage() {
  const players = topPlayers(200);
  const s = summary();
  const peak = players[0]?.elo ?? 1200;

  return (
    <div className="rs">
      <SiteNav active="/leaderboard" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph"><h1>Leaderboard</h1><p>Ranked Elo across every versus match. Win to climb.</p></div>
        <section className="rs-stats" style={{ marginTop: 18 }}>
          <div className="rs-stat hl"><b>{players.length}</b><span>Ranked players</span></div>
          <div className="rs-stat"><b>{peak}</b><span>Top Elo</span></div>
          <div className="rs-stat"><b>{s.versus}</b><span>Ranked matches</span></div>
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
                      <td><Link href={`/players/${encodeURIComponent(p.username)}`}>{p.username}</Link></td>
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
                {players.length === 0 && <tr><td colSpan={8} className="rs-empty" style={{ border: 0 }}>No ranked players yet — be the first: <code>ssh sshfighter.com</code></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

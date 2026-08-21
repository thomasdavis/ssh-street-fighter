import Link from 'next/link';
import { SiteNav, Footer, CharChip, PlayerTypeBadge } from '@/components/ui';
import { topPlayers, onlineNow, summary } from '@/lib/ringside';
import { winRate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Bot roster',
  description: 'Ranked automated players competing in the SSH Fighter Open League.',
};

export default function BotListPage() {
  const bots = topPlayers(200, 'bots');
  const s = summary();
  const peak = bots[0]?.elo ?? 1200;

  return (
    <div className="rs">
      <SiteNav active="/bots" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph">
          <h1>Bot roster</h1>
          <p>Automated accounts competing in the Open League. Every bot uses its own SSH identity and external codebase.</p>
        </div>

        <nav className="rs-divisions" aria-label="Bot pages">
          <Link className="rs-pill" href="/bots">Build a bot</Link>
          <Link className="rs-pill ko" href="/bots/list" aria-current="page">Bot roster</Link>
          <Link className="rs-pill" href="/leaderboard?division=open">Open League</Link>
        </nav>

        <section className="rs-stats" style={{ marginTop: 18 }}>
          <div className="rs-stat hl"><b>{s.bots}</b><span>Registered bots</span></div>
          <div className="rs-stat"><b>{bots.length}</b><span>Ranked bots</span></div>
          <div className="rs-stat"><b>{peak}</b><span>Top bot Elo</span></div>
          <div className="rs-stat"><b>{onlineNow()}</b><span>Online now</span></div>
        </section>

        <section className="rs-section">
          <div style={{ overflowX: 'auto' }}>
            <table className="rs-table">
              <thead>
                <tr>
                  <th>#</th><th>Bot</th><th>Main</th>
                  <th className="rs-num">Matches</th><th className="rs-num">W–L</th>
                  <th style={{ width: 160 }}>Win rate</th><th className="rs-num">Peak</th><th className="rs-num">Elo</th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => {
                  const wr = winRate(bot.wins, bot.wins + bot.losses);
                  return (
                    <tr key={bot.username}>
                      <td className={`rs-rank${bot.rank <= 3 ? ' top' : ''}`}>{bot.rank <= 3 ? ['🥇', '🥈', '🥉'][bot.rank - 1] : bot.rank}</td>
                      <td><Link href={`/players/${encodeURIComponent(bot.username)}`}>{bot.username}</Link><PlayerTypeBadge isBot /></td>
                      <td>{bot.main_char ? <CharChip char={bot.main_char} sm /> : <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                      <td className="rs-num">{bot.matches}</td>
                      <td className="rs-num">{bot.wins}–{bot.losses}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="rs-bartrack" style={{ flex: 1 }}><i style={{ width: `${wr}%`, background: wr >= 50 ? 'linear-gradient(90deg,var(--green),#b6e84a)' : 'linear-gradient(90deg,var(--red),#e0a04a)' }} /></div>
                          <span style={{ color: 'var(--dim)', width: 34, textAlign: 'right' }}>{wr}%</span>
                        </div>
                      </td>
                      <td className="rs-num" style={{ color: 'var(--dim)' }}>{bot.peak_elo}</td>
                      <td className="rs-num rs-elo">{bot.elo}</td>
                    </tr>
                  );
                })}
                {bots.length === 0 && <tr><td colSpan={8} className="rs-empty" style={{ border: 0 }}>No ranked bots yet. <Link href="/bots">Build the first one →</Link></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

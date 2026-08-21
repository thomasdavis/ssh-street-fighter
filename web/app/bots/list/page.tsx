import Link from 'next/link';
import { SiteNav, Footer, CharChip, PlayerTypeBadge } from '@/components/ui';
import { topPlayers, onlineNow, summary } from '@/lib/ringside';
import { winRate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Bot roster',
  description: 'Technical bot dossiers and ranked automated players competing in the SSH Fighter Open League.',
};

const dossiers = [
  {
    name: 'TISSUE-0',
    identity: 'ajax-tissue',
    kind: 'Research organism',
    runtime: 'Haskell · HaskTorch',
    copy: 'A 5.54M-parameter genome grows a 12 × 12 morphogenetic control tissue, then adapts temporary immune clones and phase state during each match.',
    href: '/bots/list/tissue',
    accent: 'cyan',
  },
  {
    name: 'Ultra',
    identity: 'ajax-bot-ultra',
    kind: 'Universal learned agent',
    runtime: 'Native C · recurrent PPO',
    copy: 'One recurrent policy rotates through all 17 fighters. Its native runtime consumes exact-engine self-play weights through a shared semantic control interface.',
    href: '/bots/list/ultra',
    accent: 'gold',
  },
];

export default function BotListPage() {
  const bots = topPlayers(200, 'bots');
  const s = summary();
  const peak = bots[0]?.elo ?? 1200;
  const online = onlineNow();

  return (
    <div className="rs bots-list-page">
      <SiteNav active="/bots" online={online} />
      <main className="rs-wrap bots-list-wrap">
        <header className="bots-list-hero">
          <p>Technical dossiers · live ladder · external codebases</p>
          <h1>Bot roster</h1>
          <div>
            <p>Study two very different control systems, then compare every automated account on the live Open League ladder.</p>
            <Link href="/bots">Build your own bot →</Link>
          </div>
        </header>

        <nav className="rs-divisions" aria-label="Bot pages">
          <Link className="rs-pill" href="/bots">Build a bot</Link>
          <Link className="rs-pill ko" href="/bots/list" aria-current="page">Bot roster</Link>
          <Link className="rs-pill" href="/leaderboard?division=open">Open League</Link>
        </nav>

        <section className="bots-list-grid" aria-label="Technical bot dossiers">
          {dossiers.map((bot, index) => (
            <article className="bots-list-card" data-accent={bot.accent} key={bot.identity}>
              <div className="bots-list-card__top"><i>{String(index + 1).padStart(2, '0')}</i><span>technical dossier</span></div>
              <h2>{bot.name}</h2>
              <p className="bots-list-card__identity">@{bot.identity}</p>
              <dl>
                <div><dt>Class</dt><dd>{bot.kind}</dd></div>
                <div><dt>Runtime</dt><dd>{bot.runtime}</dd></div>
              </dl>
              <p className="bots-list-card__copy">{bot.copy}</p>
              <Link href={bot.href}>Read technical dossier <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </section>

        <section className="bots-list-note">
          <span>Repository boundary</span>
          <p>The dossiers document publicly observable systems and their evidence. Their policies, training stacks and deployment services remain in independent repositories; SSH Fighter contains only the shared protocol, generic example and public presentation.</p>
        </section>

        <section className="rs-stats">
          <div className="rs-stat hl"><b>{s.bots}</b><span>Registered bots</span></div>
          <div className="rs-stat"><b>{bots.length}</b><span>Ranked bots</span></div>
          <div className="rs-stat"><b>{peak}</b><span>Top bot Elo</span></div>
          <div className="rs-stat"><b>{online}</b><span>Online now</span></div>
        </section>

        <section className="rs-section">
          <div className="rs-section__head"><h2>Live bot ladder</h2><Link href="/leaderboard?division=open">Open League →</Link></div>
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

import Link from 'next/link';
import { SiteNav, Footer, CharChip, Sprite, Bars } from '@/components/ui';
import { summary, topPlayers, recentMatches, characterStats } from '@/lib/ringside';
import { getLive } from '@/lib/live';
import { charColor, rosterNames } from '@/lib/chars';
import { timeAgo, frames, num } from '@/lib/format';
import { LiveMatches } from './LiveMatches';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'SSH Street Fighter',
  description: 'A Street Fighter–style arcade game you play entirely over SSH. Live ladder, replays, and a bot API.',
};

export default async function Home() {
  const s = summary();
  const live = await getLive();
  const top = topPlayers(8);
  const recent = recentMatches(6);
  const chars = characterStats();
  const names = rosterNames();
  const [heroL, heroR] = [names[0] ?? 'BYU', names[1] ?? 'MEN'];
  const topByGames = [...chars].filter((c) => c.games > 0).sort((a, b) => b.games - a.games).slice(0, 6);

  return (
    <div className="rs">
      <SiteNav active="/" online={live.online} />
      <main className="rs-wrap">

        {/* hero */}
        <section className="rs-hero">
          <div>
            <p className="rs-hero__eyebrow">Fight in your terminal</p>
            <h1>SSH Street<br />Fighter</h1>
            <p className="rs-lede">A full arcade fighting game that runs entirely over SSH — pixel sprites, ranked
              matches, replays and a bot API. No install, no download. Just connect and fight.</p>
            <div className="rs-cta">
              <div className="rs-cmd">
                <span className="p">$</span>
                <code>ssh <b>sshfighter.com</b></code>
                <span className="hint">↵ to play</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="rs-btn" href="/leaderboard">View the ladder →</Link>
                <Link className="rs-btn ghost" href="/bots">Bring a bot</Link>
              </div>
            </div>
          </div>
          <div className="rs-hero__art" aria-hidden>
            <Sprite char={heroL} pose="idle_1" className="l" />
            <span className="vs">VS</span>
            <Sprite char={heroR} pose="idle_1" className="r" />
          </div>
        </section>

        {/* stat strip */}
        <section className="rs-stats">
          <div className="rs-stat hl"><b>{live.online}</b><span>Fighters online</span></div>
          <div className="rs-stat"><b>{live.activeMatches}</b><span>Live matches</span></div>
          <div className="rs-stat"><b>{num(s.players)}</b><span>Registered players</span></div>
          <div className="rs-stat"><b>{num(s.matches)}</b><span>Matches played</span></div>
          <div className="rs-stat"><b>{num(s.matches24h)}</b><span>Last 24 hours</span></div>
          <div className="rs-stat"><b>{num(s.replays)}</b><span>Replays saved</span></div>
        </section>

        {/* live now */}
        <section className="rs-section">
          <div className="rs-section__head"><h2>◉ Live now</h2><Link href="/matches">All matches →</Link></div>
          <LiveMatches initial={live.matches} colors={Object.fromEntries(names.map((n) => [n, charColor(n)]))} />
        </section>

        {/* ladder + character meta */}
        <div className="rs-grid2">
          <section className="rs-section">
            <div className="rs-section__head"><h2>Top of the ladder</h2><Link href="/leaderboard">Full ranking →</Link></div>
            <table className="rs-table">
              <thead><tr><th>#</th><th>Player</th><th>Main</th><th className="rs-num">W–L</th><th className="rs-num">Elo</th></tr></thead>
              <tbody>
                {top.map((p) => (
                  <tr key={p.username}>
                    <td className={`rs-rank${p.rank <= 3 ? ' top' : ''}`}>{p.rank}</td>
                    <td><Link href={`/players/${encodeURIComponent(p.username)}`}>{p.username}</Link></td>
                    <td>{p.main_char ? <CharChip char={p.main_char} sm /> : <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                    <td className="rs-num">{p.wins}–{p.losses}</td>
                    <td className="rs-num rs-elo">{p.elo}</td>
                  </tr>
                ))}
                {top.length === 0 && <tr><td colSpan={5} className="rs-empty" style={{ border: 0 }}>No ranked players yet.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="rs-section">
            <div className="rs-section__head"><h2>Character meta</h2><Link href="/characters">Full stats →</Link></div>
            {topByGames.length ? (
              <Bars rows={topByGames.map((c) => ({ label: c.char, pct: c.win_pct, value: `${c.win_pct}%`, color: charColor(c.char) }))} />
            ) : <div className="rs-empty">No ranked matches yet — play some versus games to seed the meta.</div>}
            <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 12 }}>Win rate across ranked matches · {chars.reduce((n, c) => n + c.games, 0)} games sampled</p>
          </section>
        </div>

        {/* recent matches */}
        <section className="rs-section">
          <div className="rs-section__head"><h2>Recent matches</h2><Link href="/matches">Browse all →</Link></div>
          {recent.length ? (
            <div className="rs-grid3">
              {recent.map((m) => {
                const aWon = m.winner === 'a';
                return (
                  <Link key={m.id} href={`/matches/${m.id}`} className="rs-match">
                    <div className={`side a${aWon ? ' win' : ''}`}><span className="nm">{m.a_name}</span><span className="ch"><CharChip char={m.a_char} sm /></span></div>
                    <span className="vs">VS</span>
                    <div className={`side b${!aWon ? ' win' : ''}`}><span className="nm">{m.b_name}</span><span className="ch"><CharChip char={m.b_char} sm /></span></div>
                    <div className="meta"><span>{m.stage}</span><span>·</span><span>{frames(m.duration_frames)}</span><span>·</span><span>{timeAgo(m.ended_at)}</span></div>
                  </Link>
                );
              })}
            </div>
          ) : <div className="rs-empty">No matches recorded yet.</div>}
        </section>

        {/* bots callout */}
        <section className="rs-section">
          <div className="rs-callout">
            <h3>⌁ Bring your own fighter — the bot API</h3>
            <p>Register over SSH, then let an agent play the ladder. Bots are ordinary players: they queue against
              humans and each other, and every match they play is recorded and ranked just the same.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="rs-btn" href="/bots">Read the bot docs →</Link>
              <a className="rs-btn ghost" href="https://github.com/thomasdavis/ssh-street-fighter/blob/main/examples/bot.mjs" target="_blank" rel="noreferrer">Example bot</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

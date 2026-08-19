import Link from 'next/link';
import { SiteNav, Footer, CharChip, Bars } from '@/components/ui';
import { SpriteLoop } from '@/components/SpriteLoop';
import { summary, topPlayers, recentMatches, characterStats, hasReplay, chatMessages } from '@/lib/ringside';
import { getLive } from '@/lib/live';
import { charColor, rosterNames, rosterCards } from '@/lib/chars';
import { timeAgo, frames, num } from '@/lib/format';
import { LiveMatches } from './LiveMatches';
import { HomeTheater } from './HomeTheater';
import { LoungeChat } from './LoungeChat';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'SSH Fighter',
  description: 'An arcade fighting game you play entirely over SSH. Live ladder, replays, character stats, and a bot API.',
};

export default async function Home() {
  const s = summary();
  const live = await getLive();
  const top = topPlayers(8);
  const recent = recentMatches(6);
  const chars = characterStats();
  const names = rosterNames();
  const cards = rosterCards();
  const [heroL, heroR] = [names[0] ?? 'BYU', names[1] ?? 'MEN'];
  const lastReplay = recentMatches(16).find((m) => hasReplay(m.id));
  const replayTitle = lastReplay ? `${lastReplay.a_name} vs ${lastReplay.b_name} · ${lastReplay.stage}` : '';
  const chat = chatMessages(40);
  const topByGames = [...chars].filter((c) => c.games > 0).sort((a, b) => b.games - a.games).slice(0, 6);

  return (
    <div className="rs">
      <SiteNav active="/" online={live.online} />
      <main className="rs-wrap">

        {/* hero */}
        <section className="rs-hero">
          <div>
            <p className="rs-hero__eyebrow">Fight in your terminal</p>
            <h1>SSH<br />Fighter</h1>
            <p className="rs-lede">An arcade fighting game that runs entirely over SSH — hand-drawn pixel sprites,
              ranked matches, replays and a bot API. No install, no download. Just connect and fight.</p>
            <div className="rs-cta">
              <div className="rs-cmd">
                <span className="p">$</span>
                <code>ssh <b>sshfighter.com</b></code>
                <span className="hint">↵ to play</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="rs-btn" href="/fighters">Choose a fighter →</Link>
                <Link className="rs-btn ghost" href="/leaderboard">The ladder</Link>
              </div>
            </div>
          </div>
          {(lastReplay || live.activeMatches > 0) ? (
            <div className="rs-hero__theater">
              <HomeTheater replayId={lastReplay?.id ?? null} replayTitle={replayTitle} />
            </div>
          ) : (
            <div className="rs-hero__art" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="rs-hero__scene" src="/api/stage/neon" alt="" />
              <SpriteLoop char={heroL} poses={['idle_1', 'idle_2']} className="l" />
              <span className="vs">VS</span>
              <SpriteLoop char={heroR} poses={['idle_1', 'idle_2']} className="r" />
            </div>
          )}
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


        {/* roster showcase */}
        <section className="rs-section">
          <div className="rs-section__head"><h2>◈ {cards.length} fighters</h2><Link href="/fighters">Meet them all →</Link></div>
          <div className="rs-ribbon">
            {cards.map((c) => (
              <Link key={c.name} href={`/fighters/${c.name.toLowerCase()}`} className="rs-fchip" style={{ ['--fc' as string]: c.color }}>
                <div className="rs-fchip__art"><SpriteLoop char={c.name} poses={['idle_1', 'idle_2']} /></div>
                <div className="rs-fchip__name">{c.name}</div>
                <div className="rs-fchip__tag">{c.archetype}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* live now */}
        <section className="rs-section">
          <div className="rs-section__head"><h2>◉ Live now</h2><Link href="/matches">All matches →</Link></div>
          <LiveMatches initial={live.matches} colors={Object.fromEntries(names.map((n) => [n, charColor(n)]))} />
        </section>

        {/* fight lounge */}
        <section className="rs-section">
          <div className="rs-section__head"><h2>⌁ The Fight Lounge</h2><Link href="/bots">Bots welcome →</Link></div>
          <div className="rs-lounge-wrap">
            <LoungeChat initial={chat} online={live.online} lounge={0} />
            <aside className="rs-lounge-side">
              <h3>Hang out between rounds</h3>
              <p>One persistent chat room shared by everyone connected — humans and bots alike. Talk strategy,
                find sparring partners, and fire off direct challenges, all from your terminal.</p>
              <ul className="rs-lounge-side__list">
                <li><span>◈</span> See a live roster of who&rsquo;s around</li>
                <li><span>⚔</span> Challenge anyone straight to a match</li>
                <li><span>⌁</span> Agents chat here too <em>— it&rsquo;s on the bot API</em></li>
              </ul>
              <div className="rs-cmd sm"><span className="p">$</span><code>ssh <b>sshfighter.com</b></code><span className="hint">↵ then open the lounge</span></div>
            </aside>
          </div>
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

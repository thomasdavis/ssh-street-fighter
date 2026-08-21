import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { SiteNav, Footer, CharChip, Sprite, Sparkline, Bars, Ring, PlayerTypeBadge } from '@/components/ui';
import { profile, onlineNow } from '@/lib/ringside';
import { charColor } from '@/lib/chars';
import { timeAgo, frames, winRate, num, ordinal } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

const getCachedProfile = cache(profile);

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const username = decodeURIComponent(name);
  const data = getCachedProfile(username);
  if (!data) return { title: 'Player not found', robots: { index: false, follow: false } };
  const { player } = data;
  const matches = player.wins + player.losses;
  return pageMetadata({
    title: `${player.username} — player profile`,
    description: `${player.username}'s SSH Fighter profile: ${player.elo} Elo, ${player.wins} wins, ${player.losses} losses across ${matches} ranked matches.`,
    path: `/players/${encodeURIComponent(player.username)}`,
  });
}

export default async function PlayerPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const p = getCachedProfile(decodeURIComponent(name));
  if (!p) notFound();
  const { player, totals, byChar, recent, eloHistory } = p;
  const wr = winRate(player.wins, player.wins + player.losses);
  const main = player.main_char ?? byChar[0]?.char ?? null;

  return (
    <div className="rs">
      <SiteNav active="/leaderboard" online={onlineNow()} />
      <main className="rs-wrap">

        <section style={{ display: 'flex', gap: 24, alignItems: 'flex-end', padding: '34px 0 20px', flexWrap: 'wrap' }}>
          {main && <div className="rs-face" style={{ width: 116, height: 116, flex: '0 0 auto' }}><Sprite char={main} pose="idle_1" /></div>}
          <div style={{ flex: 1, minWidth: 200 }}>
            <p className="rs-hero__eyebrow" style={{ margin: 0 }}>
              {player.rank ? `${ordinal(player.rank)} in the ${player.is_bot ? 'Open League' : 'Human League'}` : 'Unranked'}
              <PlayerTypeBadge isBot={player.is_bot} />
            </p>
            <h1 style={{ margin: '6px 0 0', color: 'var(--gold)', fontSize: 'clamp(2rem,5vw,3.2rem)', textTransform: 'uppercase', textShadow: '2px 2px 0 #7a1f1a' }}>{player.username}</h1>
            <p style={{ margin: '8px 0 0', color: 'var(--dim)', fontSize: 12 }}>
              {main && <>Mains <CharChip char={main} sm /> · </>}
              Joined {timeAgo(player.created_at)} · Last seen {timeAgo(player.last_seen)}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--gold)', fontSize: 44, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{player.elo}</div>
            <div style={{ color: 'var(--dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em' }}>Elo · peak {player.peak_elo}</div>
          </div>
        </section>

        <section className="rs-stats">
          <div className="rs-stat"><b>{player.wins}–{player.losses}</b><span>Win – Loss</span></div>
          <div className="rs-stat hl"><b>{wr}%</b><span>Win rate</span></div>
          <div className="rs-stat"><b>{num(totals.dmg_dealt)}</b><span>Damage dealt</span></div>
          <div className="rs-stat"><b>{totals.hits}</b><span>Hits landed</span></div>
          <div className="rs-stat"><b>{totals.specials}</b><span>Specials</span></div>
          <div className="rs-stat"><b>{totals.best_combo}</b><span>Best combo</span></div>
        </section>

        <div className="rs-grid2">
          <section className="rs-section">
            <div className="rs-section__head"><h2>Elo history</h2><span style={{ color: 'var(--dim)', fontSize: 11 }}>{eloHistory.length} matches</span></div>
            {eloHistory.length >= 2
              ? <div style={{ background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 12, padding: 16 }}><Sparkline data={eloHistory.map((h) => h.elo)} color="#f5d94a" h={90} /></div>
              : <div className="rs-empty">Not enough ranked matches yet.</div>}
          </section>
          <section className="rs-section">
            <div className="rs-section__head"><h2>Characters played</h2></div>
            {byChar.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Bars rows={byChar.map((c) => ({ label: c.char, pct: c.games ? (c.games / byChar[0].games) * 100 : 0, value: `${c.games}g`, color: charColor(c.char) }))} />
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {byChar.slice(0, 4).map((c) => (
                    <div key={c.char} style={{ textAlign: 'center' }}>
                      <Ring pct={c.win_pct} size={62} color={charColor(c.char)} />
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>{c.char}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="rs-empty">No match data yet.</div>}
          </section>
        </div>

        <section className="rs-section">
          <div className="rs-section__head"><h2>Recent matches</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="rs-table">
              <thead><tr><th>Result</th><th>Opponent</th><th>Stage</th><th className="rs-num">Length</th><th>When</th><th></th></tr></thead>
              <tbody>
                {recent.map((m) => {
                  const isA = m.a_name === player.username;
                  const won = (isA && m.winner === 'a') || (!isA && m.winner === 'b');
                  const opp = isA ? m.b_name : m.a_name;
                  const oppChar = isA ? m.b_char : m.a_char;
                  const oppIsBot = isA ? m.b_is_bot : m.a_is_bot;
                  const myChar = isA ? m.a_char : m.b_char;
                  return (
                    <tr key={m.id}>
                      <td><span className={`rs-pill ${won ? 'win' : 'loss'}`}>{won ? 'WIN' : 'LOSS'}</span> <CharChip char={myChar} sm /></td>
                      <td><Link href={`/players/${encodeURIComponent(opp)}`}>{opp}</Link><PlayerTypeBadge isBot={oppIsBot} /> <CharChip char={oppChar} sm /></td>
                      <td style={{ color: 'var(--dim)', textTransform: 'uppercase', fontSize: 11 }}>{m.stage}</td>
                      <td className="rs-num">{frames(m.duration_frames)}</td>
                      <td style={{ color: 'var(--dim)' }}>{timeAgo(m.ended_at)}</td>
                      <td><Link href={`/matches/${m.id}`} style={{ color: 'var(--cyan)' }}>▶</Link></td>
                    </tr>
                  );
                })}
                {recent.length === 0 && <tr><td colSpan={6} className="rs-empty" style={{ border: 0 }}>No matches yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

import { SiteNav, Footer, CharChip, Bars } from '@/components/ui';
import { characterStats, matchupGrid, onlineNow } from '@/lib/ringside';
import { charColor, rosterNames } from '@/lib/chars';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Character stats',
  description: 'Explore SSH Fighter character pick rates, ranked win rates, and head-to-head matchup data.',
  path: '/characters',
});

function winColor(pct: number): string {
  // red (low) → amber (even) → green (high)
  if (pct < 45) return `rgba(224,72,63,${0.25 + (45 - pct) / 90})`;
  if (pct > 55) return `rgba(100,216,120,${0.25 + (pct - 55) / 90})`;
  return 'rgba(245,217,74,0.22)';
}

export default function CharactersPage() {
  const chars = characterStats();
  const played = chars.filter((c) => c.games > 0);
  const grid = matchupGrid();
  const names = rosterNames();
  const mu = new Map(grid.map((m) => [`${m.a_char}|${m.b_char}`, m]));
  const active = names.filter((n) => played.some((c) => c.char === n));

  return (
    <div className="rs">
      <SiteNav active="/characters" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph"><h1>Character stats</h1><p>Pick and win rates across ranked matches, plus head-to-head matchups.</p></div>

        {played.length === 0 ? (
          <div className="rs-empty" style={{ marginTop: 24 }}>No ranked matches recorded yet. Play some versus games to seed the meta.</div>
        ) : (
          <>
            <div className="rs-grid2">
              <section className="rs-section">
                <div className="rs-section__head"><h2>Win rate</h2></div>
                <Bars rows={[...played].sort((a, b) => b.win_pct - a.win_pct).map((c) => ({ label: c.char, pct: c.win_pct, value: `${c.win_pct}%`, color: charColor(c.char) }))} />
              </section>
              <section className="rs-section">
                <div className="rs-section__head"><h2>Pick rate</h2></div>
                <Bars rows={[...played].sort((a, b) => b.picks - a.picks).map((c) => ({ label: c.char, pct: c.pick_pct, value: `${c.picks}`, color: charColor(c.char) }))} />
              </section>
            </div>

            <section className="rs-section">
              <div className="rs-section__head"><h2>All characters</h2></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="rs-table">
                  <thead><tr><th>Character</th><th className="rs-num">Picks</th><th className="rs-num">Games</th><th className="rs-num">Wins</th><th className="rs-num">Win %</th></tr></thead>
                  <tbody>
                    {[...chars].sort((a, b) => b.games - a.games || b.picks - a.picks).map((c) => (
                      <tr key={c.char}>
                        <td><CharChip char={c.char} /></td>
                        <td className="rs-num">{c.picks}</td>
                        <td className="rs-num">{c.games}</td>
                        <td className="rs-num">{c.wins}</td>
                        <td className="rs-num" style={{ color: c.win_pct >= 50 ? 'var(--green)' : 'var(--red)' }}>{c.games ? `${c.win_pct}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {active.length > 1 && (
              <section className="rs-section">
                <div className="rs-section__head"><h2>Matchup grid</h2><span style={{ color: 'var(--dim)', fontSize: 11 }}>row&apos;s win % vs column</span></div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="rs-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr><th></th>{active.map((n) => <th key={n} style={{ textAlign: 'center' }} title={n}>{n.slice(0, 4)}</th>)}</tr>
                    </thead>
                    <tbody>
                      {active.map((a) => (
                        <tr key={a}>
                          <td><CharChip char={a} sm /></td>
                          {active.map((b) => {
                            if (a === b) return <td key={b} style={{ textAlign: 'center', color: 'var(--edge)' }}>—</td>;
                            const m = mu.get(`${a}|${b}`);
                            return (
                              <td key={b} style={{ textAlign: 'center', background: m && m.games ? winColor(m.a_win_pct) : undefined, color: 'var(--text)' }}
                                title={m ? `${a} beat ${b} ${m.a_wins}/${m.games}` : 'no data'}>
                                {m && m.games ? `${Math.round(m.a_win_pct)}` : '·'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

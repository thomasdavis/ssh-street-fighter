import Link from 'next/link';
import { SiteNav, Footer, PlayerTypeBadge, Sprite } from '@/components/ui';
import { recentMatches, matchCount, onlineNow, hasReplay } from '@/lib/ringside';
import { timeAgo, frames } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Matches and replays',
  description: 'Browse recorded SSH Fighter matches, ranked results, box scores, and full watchable replays.',
  path: '/matches',
});

const PER = 40;

function MatchFighter({ name, char, isBot, side, won, hasWinner }: {
  name: string; char: string; isBot: number; side: 'a' | 'b'; won: boolean; hasWinner: boolean;
}) {
  return (
    <div className={`rs-match-fighter rs-match-fighter--${side}${won ? ' is-winner' : ''}`}>
      <span className="rs-match-fighter__avatar" aria-hidden="true"><Sprite char={char} /></span>
      <span className="rs-match-fighter__identity">
        <small className="rs-match-fighter__status">{won ? 'Winner' : hasWinner ? 'Challenger' : `Fighter ${side.toUpperCase()}`}</small>
        <span className="rs-match-fighter__player"><strong>{name}</strong><PlayerTypeBadge isBot={isBot} /></span>
        <span className="rs-match-fighter__pick"><small>Fighter</small><b>{char}</b></span>
      </span>
    </div>
  );
}

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

        <div className="rs-match-filters" aria-label="Filter matches">
          <Link className={`rs-pill${!mode ? ' ko' : ''}`} href="/matches">All</Link>
          <Link className={`rs-pill${mode === 'versus' ? ' ko' : ''}`} href="/matches?mode=versus">Ranked</Link>
          <Link className={`rs-pill${mode === 'practice' ? ' ko' : ''}`} href="/matches?mode=practice">Practice</Link>
        </div>

        <section className="rs-section rs-match-ledger" aria-label="Recorded matches">
          <div className="rs-match-ledger__head" aria-hidden="true">
            <span>Finished</span><span>Fight</span><span>Arena</span><span>Length</span><span>Finish</span><span>Replay</span>
          </div>
          {rows.length ? (
            <ol className="rs-match-ledger__list">
              {rows.map((m) => {
                const winner = m.winner === 'a' || m.winner === 'b' ? m.winner : null;
                const winnerName = winner === 'a' ? m.a_name : winner === 'b' ? m.b_name : null;
                const replay = hasReplay(m.id);
                const finish = m.mode === 'practice' ? 'practice' : m.end_reason;
                return (
                  <li key={m.id}>
                    <Link className="rs-match-row" data-winner={winner ?? undefined} href={`/matches/${m.id}`}
                      aria-label={`${m.a_name} versus ${m.b_name}. ${winnerName ? `${winnerName} won.` : 'No winner.'} ${replay ? 'Open replay.' : 'Open match details.'}`}>
                      <time className="rs-match-row__time" dateTime={new Date(m.ended_at).toISOString()}>{timeAgo(m.ended_at)}</time>
                      <div className="rs-match-row__bout">
                        <MatchFighter name={m.a_name} char={m.a_char} isBot={m.a_is_bot} side="a" won={winner === 'a'} hasWinner={winner !== null} />
                        <span className="rs-match-row__score" aria-label={`${m.a_rounds} rounds to ${m.b_rounds}`}>
                          <span><b className={winner === 'a' ? 'is-winner' : ''}>{m.a_rounds}</b><i>–</i><b className={winner === 'b' ? 'is-winner' : ''}>{m.b_rounds}</b></span>
                          <small>Final</small>
                        </span>
                        <MatchFighter name={m.b_name} char={m.b_char} isBot={m.b_is_bot} side="b" won={winner === 'b'} hasWinner={winner !== null} />
                      </div>
                      <span className="rs-match-row__stage"><small>Arena</small>{m.stage}</span>
                      <span className="rs-match-row__length"><small>Length</small>{frames(m.duration_frames)}</span>
                      <span className="rs-match-row__finish"><span className={`rs-pill ${m.end_reason === 'ko' ? 'ko' : ''}`}>{finish}</span></span>
                      <span className="rs-match-row__watch">{replay ? 'Watch' : 'Details'}<i aria-hidden="true">→</i></span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : <div className="rs-empty rs-match-ledger__empty">No matches yet.</div>}

          {pages > 1 && (
            <div className="rs-match-pagination">
              {page > 1 && <Link className="rs-btn ghost" href={q(page - 1)}>← Prev</Link>}
              <span>Page {page} / {pages}</span>
              {page < pages && <Link className="rs-btn ghost" href={q(page + 1)}>Next →</Link>}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

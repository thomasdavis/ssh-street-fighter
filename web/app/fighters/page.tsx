import Link from 'next/link';
import { SiteNav, Footer } from '@/components/ui';
import { SpriteLoop } from '@/components/SpriteLoop';
import { rosterCards } from '@/lib/chars';
import { characterStats, onlineNow } from '@/lib/ringside';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fighters', description: 'The roster. Pick your fighter.' };

const DIFF: Record<string, { pips: number; cls: string }> = {
  Beginner: { pips: 1, cls: 'beg' }, Intermediate: { pips: 2, cls: 'int' }, Advanced: { pips: 3, cls: 'adv' },
};

export default function FightersPage() {
  const cards = rosterCards();
  const stats = new Map(characterStats().map((c) => [c.char, c]));

  return (
    <div className="rs">
      <SiteNav active="/fighters" online={onlineNow()} />
      <main className="rs-wrap rs-wrap--wide">
        <div className="rs-ph" style={{ textAlign: 'center' }}>
          <p className="rs-hero__eyebrow" style={{ margin: '0 0 8px' }}>{cards.length} fighters · one terminal</p>
          <h1 style={{ fontSize: 'clamp(2.2rem,6vw,4rem)' }}>Select your fighter</h1>
          <p>Hand-drawn pixel warriors. Learn one, climb the ladder — or point a bot at them.</p>
        </div>

        <div className="select-grid">
          {cards.map((c) => {
            const d = DIFF[c.difficulty] ?? DIFF.Intermediate;
            const st = stats.get(c.name);
            return (
              <Link key={c.name} href={`/fighters/${c.name.toLowerCase()}`} className="fcard" style={{ ['--fc' as string]: c.color }}>
                <div className="fcard__stage">
                  <span className={`fcard__diff ${d.cls}`}>{'★'.repeat(d.pips)}{'☆'.repeat(3 - d.pips)}</span>
                  <SpriteLoop char={c.name} poses={['idle_1', 'idle_2']} className="fcard__sprite" />
                  {st && st.games > 0 && <span className="fcard__wr">{st.win_pct}% WR</span>}
                </div>
                <div className="fcard__foot">
                  <div className="fcard__name">{c.name}</div>
                  <div className="fcard__arch">{c.archetype}</div>
                  <div className="fcard__tag">{c.tagline}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}

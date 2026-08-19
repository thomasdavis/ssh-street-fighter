import { SiteNav } from '@/components/ui';
import { recentMatches, hasReplay } from '@/lib/ringside';
import { getLive } from '@/lib/live';
import { TvChannel } from '../TvChannel';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'TV',
  description: 'A never-ending channel of live SSH Fighter matches and recent replays.',
};

export default async function TvPage() {
  const live = await getLive();
  const pool = recentMatches(24)
    .filter((m) => hasReplay(m.id))
    .slice(0, 12)
    .map((m) => ({ id: m.id, title: `${m.a_name} vs ${m.b_name} · ${m.stage}` }));

  return (
    <div className="rs">
      <SiteNav active="/tv" online={live.online} />
      <main className="rs-wrap rs-tv-wrap">
        <div className="rs-ph rs-tv-ph">
          <h1>◉ SSH Fighter TV</h1>
          <p>Always on. Live fights the moment they start, recent replays in between — no need to touch a thing.</p>
        </div>
        <TvChannel replayPool={pool} />
      </main>
    </div>
  );
}

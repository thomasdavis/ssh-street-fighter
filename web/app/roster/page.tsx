import { listChars, listPoses, spriteMtime } from '@/lib/sprites';
import { ADMIN_TOKEN } from '@/lib/paths';
import { rosterSummary } from '@/lib/fighters';
import { SiteNav, Footer } from '@/components/ui';
import { onlineNow } from '@/lib/ringside';
import Gallery from '../Gallery';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Roster & Sprites — SSH Fighter' };

export default function RosterPage() {
  const available = new Set(listChars());
  const chars = rosterSummary().filter(({ name }) => available.has(name)).map(({ name, tagline, archetype }) => ({
    id: name, tagline, archetype,
    poses: listPoses(name).map((pose) => ({ name: pose, mtime: spriteMtime(name, pose) })),
  }));
  return (
    <div className="rs">
      <SiteNav active="/roster" online={onlineNow()} />
      <Gallery chars={chars} adminEnabled={ADMIN_TOKEN.length > 0} />
      <Footer />
    </div>
  );
}

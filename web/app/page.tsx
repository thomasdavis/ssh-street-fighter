import { listChars, listPoses, spriteMtime } from '@/lib/sprites';
import { ADMIN_TOKEN } from '@/lib/paths';
import { rosterSummary } from '@/lib/fighters';
import Gallery from './Gallery';

export const dynamic = 'force-dynamic';

export default function Page() {
  const available = new Set(listChars());
  const chars = rosterSummary().filter(({ name }) => available.has(name)).map(({ name, tagline, archetype }) => ({
    id: name,
    tagline,
    archetype,
    poses: listPoses(name).map((pose) => ({ name: pose, mtime: spriteMtime(name, pose) })),
  }));
  return <Gallery chars={chars} adminEnabled={ADMIN_TOKEN.length > 0} />;
}

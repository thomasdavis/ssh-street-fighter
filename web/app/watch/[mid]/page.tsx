import { SiteNav, Footer } from '@/components/ui';
import { onlineNow } from '@/lib/ringside';
import LiveViewer from './LiveViewer';
import { pageMetadata } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params;
  return pageMetadata({
    title: 'Watch a live match',
    description: 'Spectate a live SSH Fighter match in real time, including every strike, projectile, and round.',
    path: `/watch/${encodeURIComponent(mid)}`,
    robots: { index: false, follow: true },
  });
}

export default async function WatchPage({ params }: { params: Promise<{ mid: string }> }) {
  const { mid } = await params;
  return (
    <div className="rs">
      <SiteNav active="/matches" online={onlineNow()} />
      <main className="rs-wrap">
        <div className="rs-ph"><h1>Live match</h1><p>Spectating in real time — beams, projectiles and all.</p></div>
        <LiveViewer mid={mid} />
      </main>
      <Footer />
    </div>
  );
}

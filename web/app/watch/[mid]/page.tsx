import { SiteNav, Footer } from '@/components/ui';
import { onlineNow } from '@/lib/ringside';
import LiveViewer from './LiveViewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Watch live — SSH Street Fighter', description: 'Spectate a match in real time.' };

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

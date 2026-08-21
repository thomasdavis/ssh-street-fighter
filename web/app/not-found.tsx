import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, SiteNav, Sprite } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Round not found',
  description: 'That SSH Fighter page could not be found. Return to the arcade or browse the latest matches.',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="rs">
      <SiteNav />
      <main className="rs-wrap">
        <section className="rs-404">
          <div className="rs-404__fighter a" aria-hidden="true"><Sprite char="BYU" pose="ko" /></div>
          <div className="rs-404__copy">
            <span>404 · RING OUT</span>
            <h1>This round is over.</h1>
            <p>The page moved, the match ended, or the route never entered the arena.</p>
            <div>
              <Link className="rs-btn" href="/">Return home</Link>
              <Link className="rs-btn ghost" href="/matches">Watch replays</Link>
            </div>
          </div>
          <div className="rs-404__fighter b" aria-hidden="true"><Sprite char="CHONG" pose="victory_1" /></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

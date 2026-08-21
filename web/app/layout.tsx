import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';

const DESC = 'An arcade fighting game you play entirely over SSH — a live ranked ladder, watchable replays, character stats, hand-drawn pixel sprites and a bot API. No install. Just connect and fight.';

export const metadata: Metadata = {
  metadataBase: new URL('https://sshfighter.com'),
  title: { default: 'SSH Fighter', template: '%s · SSH Fighter' },
  description: DESC,
  applicationName: 'SSH Fighter',
  keywords: ['SSH', 'fighting game', 'terminal', 'arcade', 'pixel art', 'bot API', 'replays', 'street fighter'],
  authors: [{ name: 'Thomas Davis', url: 'https://ajaxdavis.dev' }],
  creator: 'Thomas Davis (@ajaxdavis)',
  publisher: 'Thomas Davis',
  category: 'games',
  openGraph: {
    type: 'website',
    siteName: 'SSH Fighter',
    locale: 'en_US',
    url: '/',
    title: 'SSH Fighter',
    description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@ajaxdavis',
    site: '@ajaxdavis',
    title: 'SSH Fighter',
    description: DESC,
  },
};

export const viewport: Viewport = {
  themeColor: '#17131f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

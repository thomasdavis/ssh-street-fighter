import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { DEFAULT_SOCIAL_IMAGE, DEFAULT_SOCIAL_IMAGE_ALT } from '@/lib/metadata';

const DESC = 'An arcade fighting game you play entirely over SSH — a live ranked ladder, watchable replays, character stats, hand-drawn pixel sprites and a bot API. No install. Just connect and fight.';
const GOOGLE_ANALYTICS_ID = 'G-H6D2K44Q8T';

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
  alternates: { canonical: '/' },
  formatDetection: { address: false, email: false, telephone: false },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'SSH Fighter',
    locale: 'en_US',
    url: '/',
    title: 'SSH Fighter',
    description: DESC,
    images: [{
      url: DEFAULT_SOCIAL_IMAGE,
      width: 1200,
      height: 630,
      alt: DEFAULT_SOCIAL_IMAGE_ALT,
      type: 'image/png',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@ajaxdavis',
    site: '@ajaxdavis',
    title: 'SSH Fighter',
    description: DESC,
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: DEFAULT_SOCIAL_IMAGE_ALT }],
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
      <GoogleAnalytics gaId={GOOGLE_ANALYTICS_ID} />
    </html>
  );
}

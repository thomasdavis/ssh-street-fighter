import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'SSH Fighter',
  description: 'An arcade fighting game you play entirely over SSH — live ladder, replays, character stats, sprites and a bot API.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

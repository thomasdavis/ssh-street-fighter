import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'SSH Street Fighter — Fighters & Sprites',
  description: 'Play a fighting game over SSH, then explore every fighter’s story, animated sprites, move inputs, damage, and frame data.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

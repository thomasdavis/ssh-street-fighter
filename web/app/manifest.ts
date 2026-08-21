import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SSH Fighter',
    short_name: 'SSH Fighter',
    description: 'An arcade fighting game played entirely over SSH.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0812',
    theme_color: '#17131f',
    categories: ['games', 'entertainment'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}

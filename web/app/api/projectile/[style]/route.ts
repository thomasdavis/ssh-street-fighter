import sharp from 'sharp';
import { loadProjectile } from '@/lib/sprites';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ style: string }> }) {
  const { style } = await params;
  const packed = loadProjectile(style.replace(/\.png$/, ''));
  if (!packed) return new Response('not found', { status: 404 });
  const rgba = Buffer.from(packed.data, 'base64');
  const png = await sharp(rgba, { raw: { width: packed.w, height: packed.h, channels: 4 } }).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}

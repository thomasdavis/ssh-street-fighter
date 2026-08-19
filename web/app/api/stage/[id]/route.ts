import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { SF_ROOT } from '@/lib/paths';

export const dynamic = 'force-dynamic';

// Serves a packed stage background (opaque RGBA) as a PNG for the replay viewer.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safe = id.replace(/[^a-z0-9_-]/gi, '');
  const file = resolve(SF_ROOT, 'assets/stages', `${safe}.json`);
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as { w: number; h: number; data: string };
    const rgba = Buffer.from(s.data, 'base64');
    const png = await sharp(rgba, { raw: { width: s.w, height: s.h, channels: 4 } }).png().toBuffer();
    return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('error', { status: 500 });
  }
}

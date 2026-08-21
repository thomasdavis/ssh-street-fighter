import { ImageResponse } from 'next/og';
import { getMatch, hasReplay } from '@/lib/ringside';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 630 };

const compact = (name: string): string => name.trim().slice(0, 22);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = getMatch(decodeURIComponent(id));
  if (!match) return new Response('Match not found', { status: 404 });

  const aName = compact(match.a_name);
  const bName = compact(match.b_name);
  const aWon = match.winner === 'a';
  const replay = hasReplay(match.id);
  const ranked = match.mode === 'versus';
  const gameApi = process.env.SF_API_URL ?? new URL(request.url).origin;
  const shot = replay
    ? `${gameApi}/api/matches/${encodeURIComponent(match.id)}/shot`
    : null;
  const stage = match.stage.replace(/[-_]+/g, ' ').toUpperCase();
  const matchLabel = `${ranked ? 'RANKED' : 'PRACTICE'} ${replay ? 'REPLAY' : 'RESULT'}`;
  const cta = replay ? 'WATCH THE FULL REPLAY →' : 'VIEW THE MATCH RESULT →';

  const player = (name: string, fighter: string, bot: boolean, won: boolean, rounds: number) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: 430 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          display: 'flex', color: won ? '#f5d94a' : '#f4f0fa', fontSize: name.length > 16 ? 39 : 48,
          fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: -1,
        }}>{name}</div>
        {bot && <div style={{
          display: 'flex', color: '#6fe0f0', border: '2px solid #315d68', borderRadius: 999,
          padding: '5px 10px', fontSize: 17, fontWeight: 700, letterSpacing: 2,
        }}>BOT</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <div style={{ display: 'flex', color: '#6fe0f0', fontSize: 25, fontWeight: 700, letterSpacing: 3 }}>{fighter}</div>
        <div style={{ display: 'flex', color: '#9a8fb5', fontSize: 21 }}>·</div>
        <div style={{ display: 'flex', color: won ? '#64d878' : '#b8aec8', fontSize: 23 }}>{won ? 'WINNER' : 'FINALIST'}</div>
        <div style={{ display: 'flex', color: '#f4f0fa', fontSize: 31, fontWeight: 800 }}>{rounds}</div>
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #100c18 0%, #21172f 58%, #341821 100%)',
        color: '#f4f0fa', fontFamily: 'monospace',
      }}>
        {shot && <img src={shot} alt="" width="1200" height="800" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.28,
        }} />}
        <div style={{
          display: 'flex', position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, rgba(16,12,24,.98) 0%, rgba(16,12,24,.92) 52%, rgba(16,12,24,.38) 100%)',
        }} />
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: '#f5d94a' }} />

        <div style={{
          display: 'flex', flexDirection: 'column', position: 'relative', width: '100%', height: '100%',
          padding: '48px 58px 42px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              <div style={{ display: 'flex', width: 17, height: 17, borderRadius: 9, background: '#ef4452' }} />
              <div style={{ display: 'flex', color: '#f5d94a', fontSize: 30, fontWeight: 800, letterSpacing: 4 }}>SSH FIGHTER</div>
            </div>
            <div style={{ display: 'flex', color: '#b8aec8', fontSize: 20, letterSpacing: 3 }}>{stage} · {matchLabel}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 72 }}>
            {player(aName, match.a_char, !!match.a_is_bot, aWon, match.a_rounds)}
            <div style={{ display: 'flex', color: '#ef4452', fontSize: 40, fontWeight: 900, padding: '0 4px' }}>VS</div>
            {player(bName, match.b_char, !!match.b_is_bot, !aWon, match.b_rounds)}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 'auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', background: '#f5d94a', color: '#17131f',
              borderRadius: 10, padding: '15px 22px', fontSize: 27, fontWeight: 900, letterSpacing: 1,
            }}>{cta}</div>
            <div style={{ display: 'flex', color: '#d5ccdf', fontSize: 23 }}>PLAY FREE ·</div>
            <div style={{ display: 'flex', color: '#6fe0f0', fontSize: 25, fontWeight: 700 }}>ssh sshfighter.com</div>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    },
  );
}

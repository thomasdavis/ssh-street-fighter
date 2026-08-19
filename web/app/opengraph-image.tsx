import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'SSH Fighter — an arcade fighting game you play over SSH';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'flex-start', padding: '72px 80px',
          background: 'linear-gradient(135deg, #17131f 0%, #241a33 60%, #2a1622 100%)',
          color: '#e9e4f2', fontFamily: 'monospace',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#9a8fb5', fontSize: 30, letterSpacing: 6, textTransform: 'uppercase' }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: '#64d878' }} />
          Fight in your terminal
        </div>
        <div style={{ display: 'flex', fontSize: 148, fontWeight: 800, letterSpacing: -2, color: '#f5d94a', lineHeight: 1, marginTop: 14 }}>
          SSH FIGHTER
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#cfc7dd', marginTop: 26, maxWidth: 940, lineHeight: 1.35 }}>
          An arcade fighting game played entirely over SSH — live ladder, replays, and a bot API.
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 16, marginTop: 44,
            background: '#0e0b16', border: '1px solid #3a2f52', borderRadius: 12, padding: '18px 26px', fontSize: 36,
          }}
        >
          <span style={{ color: '#64d878' }}>$</span>
          <span style={{ color: '#e9e4f2' }}>ssh </span>
          <span style={{ color: '#6fe0f0' }}>sshfighter.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

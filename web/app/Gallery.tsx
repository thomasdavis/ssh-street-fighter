'use client';
import { useEffect, useState, useCallback } from 'react';

interface Pose { name: string; mtime: number }
interface Char { id: string; tagline: string; archetype: string; poses: Pose[] }
type StatusMap = Record<string, { status: string; mtime: number }>;

export default function Gallery({ chars, adminEnabled }: { chars: Char[]; adminEnabled: boolean }) {
  const [token, setToken] = useState('');
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { setToken(localStorage.getItem('sf_admin_token') ?? ''); }, []);

  const poll = useCallback(async () => {
    try { const r = await fetch('/api/status', { cache: 'no-store' }); if (r.ok) setStatuses(await r.json()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { poll(); const t = setInterval(poll, 3000); return () => clearInterval(t); }, [poll]);

  const saveToken = (v: string) => { setToken(v); localStorage.setItem('sf_admin_token', v); setSaved(true); setTimeout(() => setSaved(false), 1200); };

  const regenerate = async (char: string, pose: string) => {
    let t = token;
    if (!t) { t = (window.prompt('Enter the admin token to regenerate sprites:') ?? '').trim(); if (!t) return; saveToken(t); }
    const key = `${char}|${pose}`;
    setStatuses((s) => ({ ...s, [key]: { status: 'generating', mtime: s[key]?.mtime ?? 0 } }));
    const r = await fetch('/api/regenerate', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': t },
      body: JSON.stringify({ char, pose }),
    });
    if (!r.ok) {
      const msg = await r.text();
      setStatuses((s) => ({ ...s, [key]: { status: 'error', mtime: s[key]?.mtime ?? 0 } }));
      if (r.status === 403) { saveToken(''); alert('Wrong admin token — cleared. Try again.'); }
      else alert(`Regenerate failed: ${msg}`);
    }
    setTimeout(poll, 2000);
  };

  return (
    <div className="wrap">
      <header className="hero">
        <h1>SSH STREET FIGHTER</h1>
        <p className="sub">Play it in your terminal:&nbsp; <code>ssh -p 2223 streetfighter.blah.dev</code></p>
        <p className="sub">{chars.length} fighters · character dossiers · sprite gallery</p>
      </header>

      <nav className="roster-directory" aria-label="Character profiles">
        {chars.map((character) => (
          <a href={`/fighters/${character.id.toLowerCase()}`} key={character.id}>
            <strong>{character.id}</strong>
            <span>{character.tagline}</span>
            <small>{character.archetype}</small>
          </a>
        ))}
      </nav>

      <div className="adminbar">
        <span className="off">Admin token:</span>
        <input type="password" value={token} placeholder={adminEnabled ? 'enter to enable regenerate' : 'admin disabled on server'}
          disabled={!adminEnabled} onChange={(e) => saveToken(e.target.value)} />
        {saved && <span className="ok">saved</span>}
        {!adminEnabled && <span className="off">(set SF_ADMIN_TOKEN on the server to enable)</span>}
        {adminEnabled && token.length > 0 && <span className="ok">✓ regenerate enabled</span>}
        {adminEnabled && token.length === 0 && <span className="off">click a “regen” button to enter your token</span>}
      </div>

      {chars.map((c) => (
        <section className="char" key={c.id}>
          <h2><a href={`/fighters/${c.id.toLowerCase()}`}>{c.id} dossier →</a> <span>· {c.poses.length} poses</span></h2>
          <div className="grid">
            {c.poses.map((p) => {
              const key = `${c.id}|${p.name}`;
              const st = statuses[key];
              const status = st?.status ?? 'ok';
              const v = st?.mtime ?? p.mtime;
              return (
                <div className="tile" key={p.name}>
                  <div className="frame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/sprite/${c.id}/${p.name}.png?v=${v}`} alt={`${c.id} ${p.name}`} loading="lazy" decoding="async" />
                  </div>
                  <div className="name">{p.name}</div>
                  <div className="row">
                    <span className={`badge ${status}`}>{status}</span>
                    <button className="regen" disabled={!adminEnabled || status === 'generating'}
                      onClick={() => regenerate(c.id, p.name)} title={adminEnabled ? 'regenerate this sprite' : 'admin disabled on server'}>
                      {status === 'generating' ? '…' : 'regen'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

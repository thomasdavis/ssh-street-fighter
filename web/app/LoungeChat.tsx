'use client';
import { useEffect, useRef, useState } from 'react';

interface Msg { id: number; username: string; message: string; created_at: number }

// A stable vivid colour per fighter name — so the same person keeps their hue.
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 72% 68%)`;
}
const initials = (n: string) => (n.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || '??').toUpperCase();
function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 8) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Live, read-only view of the Fight Lounge banter. Polls the game API; visitors
// join over SSH to actually talk (bots chat here too — see PR #10).
export function LoungeChat({ initial, online, lounge, full }: { initial: Msg[]; online: number; lounge: number; full?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [live, setLive] = useState({ online, lounge });
  const [pulse, setPulse] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastId = useRef(initial.length ? initial[initial.length - 1]!.id : 0);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/chat?limit=50', { cache: 'no-store' });
        if (!r.ok || stopped) return;
        const d = await r.json();
        if (stopped) return;
        setLive({ online: d.players ?? online, lounge: d.lounge ?? lounge });
        setMsgs((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = (d.messages as Msg[]).filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          const next = [...prev, ...fresh].slice(-90);
          lastId.current = next[next.length - 1]!.id;
          return next;
        });
      } catch { /* offline tick */ }
    };
    const iv = setInterval(poll, 4000);
    poll();
    return () => { stopped = true; clearInterval(iv); };
  }, [online, lounge]);

  // keep pinned to the newest line unless the reader has scrolled up
  useEffect(() => {
    const el = feedRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 500);
    return () => clearTimeout(t);
  }, [msgs.length]);

  const onScroll = () => {
    const el = feedRef.current; if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <div className={`rs-lounge${full ? ' rs-lounge--full' : ''}`} aria-label="Fight Lounge live chat">
      <div className="rs-lounge__bar">
        <span className={`rs-lounge__live${pulse ? ' pulse' : ''}`} aria-hidden />
        <b>Fight Lounge</b>
        <span className="rs-lounge__meta">
          <span className="on">{live.lounge}</span> in lounge · <span className="on">{live.online}</span> online
        </span>
      </div>

      <div className="rs-lounge__feed" ref={feedRef} onScroll={onScroll}>
        {msgs.length === 0 ? (
          <div className="rs-lounge__empty">The lounge is quiet right now.<br />Drop in over SSH and say hi.</div>
        ) : msgs.map((m) => (
          <div key={m.id} className="rs-lounge__msg">
            <span className="rs-lounge__av" style={{ background: userColor(m.username) }}>{initials(m.username)}</span>
            <div className="rs-lounge__body">
              <div className="rs-lounge__head">
                <span className="rs-lounge__u" style={{ color: userColor(m.username) }}>{m.username}</span>
                <span className="rs-lounge__t">{ago(m.created_at)}</span>
              </div>
              <div className="rs-lounge__text">{m.message}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rs-lounge__foot">
        <span className="p">$</span>
        <code>ssh <b>sshfighter.com</b></code>
        <span className="hint">→ open the lounge to chat</span>
      </div>
    </div>
  );
}

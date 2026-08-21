import { SiteNav, Footer, Sparkline } from '@/components/ui';
import { AutoRefresh } from '@/components/AutoRefresh';
import { opsLatest, opsTotalSeries, workerBreakdown, onlineNow, summary } from '@/lib/ringside';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Server status', description: 'Live concurrency, load and process metrics.' };

function uptime(s: number): string {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const WINDOW = 3 * 3600 * 1000;
const Chart = ({ title, sub, data, color }: { title: string; sub: string; data: { value: number }[]; color: string }) => (
  <div style={{ background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 12, padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ color: 'var(--dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em' }}>{title}</span>
      <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{sub}</span>
    </div>
    {data.length >= 2 ? <Sparkline data={data.map((d) => d.value)} color={color} h={70} /> : <div style={{ color: 'var(--edge)', fontSize: 12, padding: '20px 0' }}>collecting…</div>}
  </div>
);

export default function StatusPage() {
  const ops = opsLatest();
  const workers = workerBreakdown();
  const s = summary();
  const sessions = opsTotalSeries('sessions', WINDOW);
  const matchesTs = opsTotalSeries('matches', WINDOW);
  const cpu = opsTotalSeries('cpu_pct', WINDOW);
  const rss = opsTotalSeries('rss_mb', WINDOW);
  const maxUptime = Math.max(0, ...workers.map((w) => w.uptime_s || 0));
  const totalRss = ops.rss_mb ?? 0;

  return (
    <div className="rs">
      <AutoRefresh seconds={10} />
      <SiteNav active="/status" online={onlineNow()} />
      <main className="rs-wrap rs-wrap--wide">
        <div className="rs-ph"><h1>Server status</h1><p>Live concurrency and load across the cluster · auto-refreshing.</p></div>

        <section className="rs-stats">
          <div className="rs-stat hl"><b>{ops.sessions ?? 0}</b><span>Players online</span></div>
          <div className="rs-stat"><b>{ops.matches ?? 0}</b><span>Live matches</span></div>
          <div className="rs-stat"><b>{ops.queued_humans ?? 0}</b><span>Humans queued</span></div>
          <div className="rs-stat"><b>{ops.queued_bots ?? 0}</b><span>Bots queued</span></div>
          <div className="rs-stat"><b>{num(totalRss)}<span style={{ fontSize: 13 }}> MB</span></b><span>Memory (RSS)</span></div>
          <div className="rs-stat"><b>{ops.cpu_pct ?? 0}<span style={{ fontSize: 13 }}>%</span></b><span>CPU (all procs)</span></div>
          <div className="rs-stat"><b>{uptime(maxUptime)}</b><span>Uptime</span></div>
        </section>

        <section className="rs-section">
          <div className="rs-section__head"><h2>Last 3 hours</h2></div>
          <div className="rs-grid2">
            <Chart title="Concurrent players" sub={`${ops.sessions ?? 0} now`} data={sessions} color="#6fe0f0" />
            <Chart title="Active matches" sub={`${ops.matches ?? 0} now`} data={matchesTs} color="#f5d94a" />
            <Chart title="CPU % (all processes)" sub={`${ops.cpu_pct ?? 0}%`} data={cpu} color="#e0483f" />
            <Chart title="Memory MB (RSS total)" sub={`${num(totalRss)} MB`} data={rss} color="#64d878" />
          </div>
        </section>

        <section className="rs-section">
          <div className="rs-section__head"><h2>Processes</h2><span style={{ color: 'var(--dim)', fontSize: 11 }}>{workers.length} in cluster</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="rs-table">
              <thead><tr><th>Process</th><th>Role</th><th className="rs-num">Sessions</th><th className="rs-num">CPU %</th><th className="rs-num">RSS (MB)</th><th className="rs-num">Uptime</th></tr></thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.worker}>
                    <td style={{ color: 'var(--text)' }}>{w.worker === 0 ? 'primary' : `worker ${w.worker}`}</td>
                    <td style={{ color: 'var(--dim)', fontSize: 12 }}>{w.worker === 0 ? 'coordinator · API · bots' : 'SSH · render'}</td>
                    <td className="rs-num">{w.sessions ?? '—'}</td>
                    <td className="rs-num">{w.cpu_pct ?? 0}%</td>
                    <td className="rs-num">{w.rss_mb ? num(w.rss_mb) : '—'}</td>
                    <td className="rs-num">{uptime(w.uptime_s)}</td>
                  </tr>
                ))}
                {workers.length === 0 && <tr><td colSpan={6} className="rs-empty" style={{ border: 0 }}>No telemetry yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 12 }}>{num(s.matches)} matches recorded all-time · {num(s.replays)} replays stored.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

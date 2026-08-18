// Pool of render workers. Sessions are stuck to a worker for their lifetime so
// each worker keeps that session's cell buffers. A dead worker is respawned and
// its in-flight renders are failed (the session just drops that one frame).
import { Worker } from 'worker_threads';
import { availableParallelism } from 'os';
import type { Match } from '../game/types.js';
import type { RenderMode } from './frame.js';
import type { KeyBindings } from '../input/bindings.js';

const WORKER_URL = new URL('./render-worker.ts', import.meta.url);

export class RenderPool {
  private workers: Worker[] = [];
  private pending = new Map<number, (bytes: string) => void>();
  private assign = new Map<number, number>();  // sid -> worker index
  private seq = 0;
  private rr = 0;

  constructor(public readonly size: number) {
    for (let i = 0; i < size; i++) this.spawn(i);
  }

  private spawn(i: number): void {
    const w = new Worker(WORKER_URL);
    w.on('message', (m: { seq: number; bytes: string }) => {
      const resolve = this.pending.get(m.seq);
      if (resolve) { this.pending.delete(m.seq); resolve(m.bytes); }
    });
    const replace = () => { if (this.workers[i] === w) { try { w.terminate(); } catch { /* */ } this.spawn(i); } };
    w.on('error', replace);
    w.on('exit', (code) => { if (code !== 0) replace(); });
    this.workers[i] = w;
  }

  private workerFor(sid: number): { w: Worker; idx: number } {
    let idx = this.assign.get(sid);
    if (idx === undefined || !this.workers[idx]) { idx = this.rr++ % this.workers.length; this.assign.set(sid, idx); }
    return { w: this.workers[idx]!, idx };
  }

  /** Render one fight frame for a session; resolves with the diff bytes to write. */
  render(sid: number, match: Match, cols: number, rows: number, mode: RenderMode, practice: boolean, bindings: KeyBindings, full: boolean): Promise<string> {
    const seq = ++this.seq;
    const { w } = this.workerFor(sid);
    return new Promise<string>((resolve, reject) => {
      this.pending.set(seq, resolve);
      try {
        w.postMessage({ type: 'render', sid, seq, match, cols, rows, mode, practice, bindings, full });
      } catch (e) { this.pending.delete(seq); reject(e as Error); }
    });
  }

  /** Release a session's buffers on disconnect. */
  free(sid: number): void {
    const idx = this.assign.get(sid);
    if (idx !== undefined && this.workers[idx]) { try { this.workers[idx]!.postMessage({ type: 'free', sid }); } catch { /* */ } }
    this.assign.delete(sid);
  }
}

/** Build the pool from SF_RENDER_WORKERS (0/unset = disabled → inline rendering).
 *  A value of "auto" uses cores-2 (leaving headroom for the main loop + libuv). */
export function makeRenderPool(): RenderPool | null {
  const raw = (process.env.SF_RENDER_WORKERS ?? '').trim();
  if (!raw || raw === '0') return null;
  const n = raw === 'auto' ? Math.max(1, availableParallelism() - 2) : Math.max(0, parseInt(raw, 10) || 0);
  return n > 0 ? new RenderPool(n) : null;
}

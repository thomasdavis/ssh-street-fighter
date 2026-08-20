// The render backend seam. A Renderer turns a composed Frame into the bytes to
// write to the terminal for this tick (empty when nothing changed). Two backends:
//
//   OctantRenderer — the universal default. Samples the pixel layer into terminal
//     cells and emits a minimal changed-cell ANSI diff (double-buffered so a busy
//     fight allocates almost nothing per frame).
//   KittyRenderer  — optional true-pixel graphics (src/render/kitty.ts), used only
//     when the terminal supports the kitty graphics protocol AND it's opted in.
//
// Both are `Renderer`s, so the Terminal holds one active backend and swaps it when
// the view mode changes.
import { diffCells, type Cell, type Frame } from './frame.js';

export interface Renderer {
  /** Bytes to write for this frame (empty string if nothing changed). */
  render(f: Frame, cols: number, rows: number): string;
  /** Force a full repaint on the next frame (screen change / resize / mode swap). */
  reset(): void;
}

export class OctantRenderer implements Renderer {
  private prev: Cell[] | null = null;
  // two persistent cell buffers; render ping-pongs between them so steady-state
  // rendering reuses them in place (zero per-frame allocation, minimal GC).
  private a: Cell[] | null = null;
  private b: Cell[] | null = null;

  constructor(private readonly colorStep = 1, private readonly indexed = false) {}

  reset(): void { this.prev = null; this.a = null; this.b = null; }

  render(f: Frame, cols: number, rows: number): string {
    // fill the buffer that ISN'T the current prev (double-buffer); toCells reuses
    // it in place when the size matches, else allocates a fresh one.
    const reuse = this.prev === this.a ? this.b : this.prev === this.b ? this.a : null;
    const next = f.toCells(this.colorStep, reuse ?? undefined);
    if (next !== this.a && next !== this.b) { if (this.prev === this.a) this.b = next; else this.a = next; }
    const out = diffCells(this.prev, next, cols, rows, this.indexed);
    this.prev = next;
    return out;
  }
}

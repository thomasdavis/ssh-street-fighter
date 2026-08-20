// The client-terminal boundary. Owns the SSH duplex stream, backpressure-aware
// writing, capability negotiation (Caps), synchronized-output painting, and the
// two render backends (octant default + optional kitty graphics). The Session
// holds one Terminal and drives it; every "how we talk to the terminal" concern
// lives here, keeping the Session about game/UI state.
import type { Duplex } from 'stream';
import { HIDE_CURSOR, SHOW_CURSOR, CLEAR_SCREEN, RESET, SYNC_BEGIN, SYNC_END } from '../render/pixel.js';
import type { Frame } from '../render/frame.js';
import { OctantRenderer } from '../render/renderer.js';
import { KittyRenderer, deleteImage } from '../render/kitty.js';
import { Caps, SETUP, MOUSE_ON, TEARDOWN, FIGHT_KEYBOARD_ON, FIGHT_KEYBOARD_OFF, probeSequence, GRAPHICS_IMAGE_ID, type MouseEvent, type KittyKey } from './caps.js';

const NOWRAP = '\x1b[?7l';
const WRAP = '\x1b[?7h';
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const COLOR_STEP = clamp(parseInt(process.env.SF_COLOR_STEP ?? '1', 10) || 1, 1, 64);
const INDEXED_COLOR = process.env.SF_COLOR_MODE === '256';
// Terminal capability negotiation (graphics / kitty-keyboard / mouse / resize /
// mode-2026). OFF by default — the default experience is the light, universal
// octant renderer with the legacy input parser. Set SF_CAPS=1 to opt in.
export const CAPS_ENABLED = process.env.SF_CAPS === '1';

/** Everything the Session subscribes to. Real keystrokes (probe/mouse/etc. already
 *  stripped) arrive via onKeys; terminal-driven events have their own callbacks. */
export interface TerminalHandlers {
  onKeys(bytes: Buffer): void;
  onMouse(e: MouseEvent): void;
  onKittyKey(e: KittyKey): void;
  onResize(cols: number, rows: number): void;
  onProbe(caps: { graphics: boolean; kittyKeyboard: boolean }): void;
  onClose(): void;
}

export class Terminal {
  private lastWriteAt = Date.now();     // for the idle keepalive
  private outputBlocked = false;
  private alive = true;
  private readonly octant = new OctantRenderer(COLOR_STEP, INDEXED_COLOR);
  private readonly kitty = new KittyRenderer(GRAPHICS_IMAGE_ID);
  readonly caps: Caps;

  constructor(private readonly stream: Duplex, private readonly h: TerminalHandlers) {
    this.caps = new Caps({
      onProbeDone: (c) => {
        if (c.graphics || c.kittyKeyboard) this.write(MOUSE_ON);   // modern terminal → SGR mouse is safe
        this.forceRedraw();                                        // switch renderers cleanly
        this.h.onProbe(c);
      },
      onResize: (cols, rows) => this.h.onResize(cols, rows),
      onFocus: (focused) => { if (focused) this.forceRedraw(); },  // repaint a possibly-cleared terminal on refocus
      onMouse: (e) => this.h.onMouse(e),
      onKittyKey: (e) => this.h.onKittyKey(e),
    });
  }

  /** Enter the alt experience: hide cursor, no line wrap, clear, then (if opted in)
   *  enable focus/resize reporting and probe for graphics + kitty keyboard. */
  start(): void {
    this.write(HIDE_CURSOR + NOWRAP + CLEAR_SCREEN + (CAPS_ENABLED ? SETUP + probeSequence() : ''));
    this.stream.on('data', (d: Buffer) => this.onData(d));
    this.stream.on('close', () => this.h.onClose());
    this.stream.on('error', () => this.h.onClose());
  }

  private onData(d: Buffer): void {
    if (!this.alive) return;
    // Strip + dispatch terminal replies/events (probe answers, mouse, focus,
    // resize, kitty-keyboard); only real keystrokes remain.
    const rest = CAPS_ENABLED ? this.caps.consume(d) : d;
    if (rest.length) this.h.onKeys(rest);
  }

  get kittyKeyActive(): boolean { return this.caps.kittyKeyActive; }
  get graphicsSupported(): boolean { return this.caps.graphics; }
  get blocked(): boolean { return this.outputBlocked; }

  write(s: string): void {
    if (!this.alive || this.outputBlocked) return;
    this.lastWriteAt = Date.now();
    try {
      if (!this.stream.write(s)) {
        // Never queue an unbounded history of obsolete animation frames for a
        // slow SSH client. Wait for drain, then diff from the last queued frame.
        this.outputBlocked = true;
        this.stream.once('drain', () => { this.outputBlocked = false; });
      }
    } catch { /* ignore */ }
  }

  clear(): void { this.write(CLEAR_SCREEN); }

  /** Wrap a paint in synchronized-output (mode 2026) so the terminal never shows a
   *  half-drawn frame. Only when caps are opted in (byte-identical to legacy when off). */
  private paint(out: string): void { if (out) this.write(CAPS_ENABLED ? SYNC_BEGIN + out + SYNC_END : out); }

  /** Octant/quadrant/half render (default). */
  paintOctant(f: Frame, cols: number, rows: number): void { this.paint(this.octant.render(f, cols, rows)); }
  /** Kitty true-pixel graphics render (opt-in, non-fight screens). */
  paintGraphics(f: Frame, cols: number, rows: number): void { this.paint(this.kitty.render(f, cols, rows)); }
  /** Pre-rendered bytes (the render-worker-pool fast path). */
  paintBytes(bytes: string): void { this.paint(bytes); }

  /** Force a full repaint next frame (screen change / resize / mode swap). */
  forceRedraw(): void { this.octant.reset(); this.kitty.reset(); }

  deleteGraphicsImage(): void { this.write(deleteImage(GRAPHICS_IMAGE_ID)); }

  /** Push/pop the kitty keyboard protocol around a fight (real press/release events).
   *  Returns whether it is now active, so the caller can match its input parser. */
  fightKeyboard(on: boolean): boolean {
    if (!this.caps.kittyKeyboard) return false;
    if (on && !this.caps.kittyKeyActive) { this.write(FIGHT_KEYBOARD_ON); this.caps.kittyKeyActive = true; }
    else if (!on && this.caps.kittyKeyActive) { this.write(FIGHT_KEYBOARD_OFF); this.caps.kittyKeyActive = false; }
    return this.caps.kittyKeyActive;
  }

  /** Idle keepalive — re-send an invisible hide-cursor if silent, keeping a relay /
   *  NAT flow alive on a static screen. */
  keepalive(idleMs = 25_000): void { if (!this.outputBlocked && Date.now() - this.lastWriteAt > idleMs) this.write(HIDE_CURSOR); }

  /** Undo everything we turned on, then restore the cursor + wrap and end the stream. */
  shutdown(): void {
    this.alive = false;
    const undo = CAPS_ENABLED ? deleteImage(GRAPHICS_IMAGE_ID) + (this.caps.kittyKeyActive ? FIGHT_KEYBOARD_OFF : '') + TEARDOWN : '';
    try { this.stream.write(undo + SHOW_CURSOR + WRAP + RESET + '\r\n'); this.stream.end(); } catch { /* ignore */ }
  }
}

export { NOWRAP };

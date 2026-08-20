// Terminal capability detection + a single input pre-filter. On connect we probe
// the client terminal (graphics? kitty keyboard? pixel size?) and enable mouse /
// focus / in-band-resize reporting. Every reply and event the terminal then sends
// is stripped from the byte stream here and dispatched to a handler, so the game's
// key parser only ever sees real keystrokes. Everything degrades gracefully:
// terminals that ignore these escapes behave exactly as before.

export const GRAPHICS_IMAGE_ID = 4207;
const ST = '\x1b\\';
// A legit terminal reply is tiny; anything longer than this still incomplete is a
// malformed or hostile unterminated sequence and is dropped (bounds memory).
const MAX_CARRY = 4096;

export interface MouseEvent {
  col: number; row: number;          // 1-based terminal cells
  button: number;                    // 0 left, 1 middle, 2 right
  kind: 'down' | 'up' | 'move' | 'wheel';
  wheel: number;                     // -1 up, +1 down (wheel only)
}
export interface KittyKey {
  arrow?: 'A' | 'B' | 'C' | 'D';     // up / down / right / left
  ch?: string;                       // a character key
  event: 'press' | 'repeat' | 'release';
}
export interface CapsHandlers {
  onProbeDone?(caps: { graphics: boolean; kittyKeyboard: boolean }): void;
  onPixelSize?(w: number, h: number): void;
  onResize?(cols: number, rows: number): void;
  onFocus?(focused: boolean): void;
  onMouse?(e: MouseEvent): void;
  onKittyKey?(e: KittyKey): void;
}

// One-time setup written on connect: focus events (1004) + in-band resize
// notifications (2048) — both harmless on terminals that ignore them. Mouse is
// enabled separately (MOUSE_ON) only after we confirm a modern terminal, so a
// legacy-only X10 terminal never leaks click bytes. Kitty keyboard is pushed only
// around a fight (fightKeyboard) so menu input is untouched.
export const SETUP = '\x1b[?1004h\x1b[?2048h';
// SGR mouse: press/release + wheel (mode 1000, no motion flood) with SGR extended
// coords (1006). Only sent to terminals that answered a graphics/keyboard probe.
export const MOUSE_ON = '\x1b[?1000h\x1b[?1006h';
export const TEARDOWN = '\x1b[?2048l\x1b[?1004l\x1b[?1006l\x1b[?1000l';

// Kitty keyboard, pushed around the fight: 1 disambiguate | 2 report event types
// | 8 report all keys as escape codes → every key arrives as a CSI event we can
// read press AND release from. `<u` pops it back off the stack afterwards.
export const FIGHT_KEYBOARD_ON = '\x1b[>11u';
export const FIGHT_KEYBOARD_OFF = '\x1b[<u';

/** Probe: graphics support, kitty-keyboard flags, and window pixel size, then a
 *  primary-DA request as a fence — when the DA reply lands, whatever hasn't
 *  answered is unsupported. */
export function probeSequence(): string {
  return (
    `\x1b_Gi=${GRAPHICS_IMAGE_ID},a=q,t=d,f=24,s=1,v=1;AAAA${ST}` + // graphics query
    '\x1b[?u' +                                                    // kitty keyboard flags query
    '\x1b[14t' +                                                   // window pixel size
    '\x1b[c'                                                       // primary DA — the fence
  );
}

const CSI_PARAM = /[0-9;:<=>?]/;
const eventOf = (n: number): 'press' | 'repeat' | 'release' => (n === 3 ? 'release' : n === 2 ? 'repeat' : 'press');

export class Caps {
  graphics = false;
  kittyKeyboard = false;
  pixelW = 0;
  pixelH = 0;
  kittyKeyActive = false;   // true only while the fight has pushed event-types
  private carry = '';
  private probing = true;
  private sawGraphics = false;
  private sawKitty = false;

  constructor(private readonly h: CapsHandlers) {}

  /** Strip terminal replies/events from `data`, dispatch them, and return the
   *  leftover real keystrokes (as latin1 bytes in a Buffer). */
  consume(data: Buffer): Buffer {
    const s = this.carry + data.toString('latin1');
    this.carry = '';
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i]!;
      if (c !== '\x1b') { out += c; i++; continue; }
      const adv = this.matchEscape(s, i);
      if (adv === -1) { this.carry = s.slice(i); break; }   // incomplete — wait for more
      if (adv === 0) { out += c; i++; continue; }           // an ESC we don't own — pass through
      i += adv;                                             // consumed a control sequence
    }
    if (this.carry.length > MAX_CARRY) this.carry = '';     // drop a malformed/hostile unterminated sequence
    return Buffer.from(out, 'latin1');
  }

  /** Try to match a control sequence at `s[i]` (an ESC). Returns bytes consumed,
   *  0 if this ESC isn't ours (pass it through), or -1 if incomplete. */
  private matchEscape(s: string, i: number): number {
    const n1 = s[i + 1];
    if (n1 === undefined) return 0;                        // bare ESC — treat as the Escape key (no carry, no latency)
    if (n1 === '_') return this.matchApc(s, i);            // graphics reply
    if (n1 !== '[') return 0;                              // \x1bO… (SS3 arrows) etc. — not ours
    // parse a CSI: params then a final byte
    let j = i + 2;
    while (j < s.length && CSI_PARAM.test(s[j]!)) j++;
    if (j >= s.length) return -1;                          // params not finished
    const finalCh = s[j]!;
    const params = s.slice(i + 2, j);
    const consumed = j - i + 1;
    return this.classifyCsi(params, finalCh) ? consumed : 0;
  }

  private matchApc(s: string, i: number): number {
    const end = s.indexOf(ST, i);
    if (end === -1) { return s.length - i < 256 ? -1 : 0; }  // wait, unless it's clearly not ours
    const body = s.slice(i + 2, end);                        // between \x1b_ and \x1b\\
    if (body.startsWith('G')) {
      const ok = new RegExp(`Gi=${GRAPHICS_IMAGE_ID};OK`).test(s.slice(i, end));
      if (ok) { this.sawGraphics = true; this.graphics = true; }
      return end + 2 - i;
    }
    return 0;
  }

  /** Classify a CSI by its params + final byte. Returns true if we consumed it. */
  private classifyCsi(params: string, finalCh: string): boolean {
    // mouse: \x1b[<b;x;y M|m
    if (params.startsWith('<') && (finalCh === 'M' || finalCh === 'm')) {
      this.dispatchMouse(params.slice(1), finalCh === 'M'); return true;
    }
    // focus in/out: \x1b[I / \x1b[O
    if (params === '' && (finalCh === 'I' || finalCh === 'O')) {
      this.h.onFocus?.(finalCh === 'I'); return true;
    }
    // window/cell size + in-band resize: final 't'
    if (finalCh === 't') return this.classifyT(params);
    // kitty keyboard flags reply: \x1b[?<flags>u
    if (finalCh === 'u' && params.startsWith('?')) {
      this.sawKitty = true; this.kittyKeyboard = true; return true;
    }
    // primary device-attributes reply: \x1b[?…c  → the probe fence
    if (finalCh === 'c' && params.startsWith('?')) { this.finishProbe(); return true; }
    // kitty key events (only while the fight has them enabled)
    if (this.kittyKeyActive && (finalCh === 'u' || 'ABCD'.includes(finalCh))) {
      this.dispatchKittyKey(params, finalCh); return true;
    }
    return false;   // a normal key CSI (arrows in menus, etc.) — pass through
  }

  private classifyT(params: string): boolean {
    const p = params.split(';').map(Number);
    if (p[0] === 4 && p.length >= 3) { this.pixelH = p[1]!; this.pixelW = p[2]!; this.h.onPixelSize?.(p[2]!, p[1]!); return true; }
    if (p[0] === 6 && p.length >= 3) { return true; }  // cell size — accepted, unused for now
    if (p[0] === 48 && p.length >= 3) {                // in-band resize: 48;rows;cols[;ph;pw]
      const rows = p[1]!, cols = p[2]!;
      if (p.length >= 5) { this.pixelH = p[3]!; this.pixelW = p[4]!; this.h.onPixelSize?.(p[4]!, p[3]!); }
      this.h.onResize?.(cols, rows); return true;
    }
    return false;
  }

  private dispatchMouse(body: string, press: boolean): void {
    const [b, x, y] = body.split(';').map(Number);
    if (b === undefined || x === undefined || y === undefined) return;
    const wheel = (b & 64) !== 0;
    const kind: MouseEvent['kind'] = wheel ? 'wheel' : (b & 32) !== 0 ? 'move' : press ? 'down' : 'up';
    this.h.onMouse?.({ col: x, row: y, button: b & 3, kind, wheel: wheel ? (b & 1 ? 1 : -1) : 0 });
  }

  private dispatchKittyKey(params: string, finalCh: string): void {
    const fields = params.split(';');
    const code = parseInt(fields[0]!.split(':')[0] ?? '', 10);
    const evField = fields[1] ?? '';
    const event = eventOf(parseInt(evField.split(':')[1] ?? '1', 10) || 1);
    if ('ABCD'.includes(finalCh)) { this.h.onKittyKey?.({ arrow: finalCh as 'A', event }); return; }
    if (!Number.isFinite(code)) return;
    this.h.onKittyKey?.({ ch: String.fromCharCode(code), event });
  }

  private finishProbe(): void {
    if (!this.probing) return;
    this.probing = false;
    if (!this.sawGraphics) this.graphics = false;
    if (!this.sawKitty) this.kittyKeyboard = false;
    this.h.onProbeDone?.({ graphics: this.graphics, kittyKeyboard: this.kittyKeyboard });
  }
}

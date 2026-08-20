// Translate raw SSH keystrokes into fight inputs (Street-Fighter-style).
//
// Terminals send only key-DOWN bytes (auto-repeating while held), so held
// directions use a short expiry window kept alive by auto-repeat:
//   Each action is resolved through the player's key map. Defaults are arrows
//   for movement, W for punch, E for kick, and Space as a second jump key.
//   BLOCK is not a key: hold the direction AWAY from your opponent (the engine
//   derives it from movement vs. facing), exactly like the arcade games.
import { emptyInputs, type Inputs } from '../game/types.js';
import type { KittyKey } from '../net/caps.js';
import {
  DEFAULT_KEY_BINDINGS,
  bindingFromArrowCode,
  bindingFromChar,
  type BindableAction,
  type BindingToken,
  type KeyBindings,
} from './bindings.js';

const HOLD_MS = 240;
const MOTION_MS = 720; // how long a direction stays in the special-move buffer

export class InputState {
  private leftUntil = 0;
  private rightUntil = 0;
  private downUntil = 0;
  // Kitty-keyboard mode: real key-up events, so held directions are exact (no
  // auto-repeat expiry window). Used only when the terminal supports it.
  private kittyMode = false;
  private leftHeld = false;
  private rightHeld = false;
  private downHeld = false;
  private jumpEdge = false;
  private punchEdge = false;
  private kickEdge = false;
  private throwEdge = false;
  private motion: { d: string; t: number }[] = []; // recent directions for special moves
  private carry = ''; // bytes left over when a chunk split mid escape-sequence
  quit = false;

  constructor(private readonly bindings: KeyBindings = DEFAULT_KEY_BINDINGS) {}

  private pushMotion(d: string, now: number): void {
    while (this.motion.length && now - this.motion[0]!.t > MOTION_MS) this.motion.shift();
    if (this.motion.length && this.motion[this.motion.length - 1]!.d === d) { this.motion[this.motion.length - 1]!.t = now; return; }
    this.motion.push({ d, t: now });
    if (this.motion.length > 8) this.motion.shift();
  }

  private actionFor(token: BindingToken): BindableAction | null {
    for (const action of Object.keys(this.bindings) as BindableAction[]) {
      if (this.bindings[action] === token) return action;
    }
    return null;
  }

  private apply(action: BindableAction | null, now: number): void {
    if (action === 'left') { this.leftUntil = now + HOLD_MS; this.pushMotion('L', now); }
    else if (action === 'right') { this.rightUntil = now + HOLD_MS; this.pushMotion('R', now); }
    else if (action === 'jump' || action === 'jumpAlt') { this.jumpEdge = true; this.pushMotion('U', now); }
    else if (action === 'crouch') { this.downUntil = now + HOLD_MS; this.pushMotion('D', now); }
    else if (action === 'punch') this.punchEdge = true;
    else if (action === 'kick') this.kickEdge = true;
    else if (action === 'throw') this.throwEdge = true;
  }

  feed(data: Buffer): void {
    const s = this.carry + data.toString('latin1');
    this.carry = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i]!;
      const now = Date.now();
      if (c === '\x1b') {
        // Need the full 3-byte CSI sequence (ESC [ X). If it's split across
        // chunks, stash the tail and finish it when the next chunk arrives.
        if (i + 2 >= s.length) { this.carry = s.slice(i); break; }
        if (s[i + 1] === '[' || s[i + 1] === 'O') {
          const token = bindingFromArrowCode(s[i + 2]);
          if (token) this.apply(this.actionFor(token), now);
          i += 3;
          continue;
        }
        i += 1; // lone ESC / unknown — skip it
        continue;
      }
      if (c.toLowerCase() === 'q' || c === '\x03') this.quit = true;
      else {
        const token = bindingFromChar(c);
        if (token) this.apply(this.actionFor(token), now);
      }
      i++;
    }
  }

  /** Switch to (precise) kitty-keyboard holds, or back to the expiry-window model. */
  setKittyMode(on: boolean): void {
    this.kittyMode = on;
    this.leftHeld = this.rightHeld = this.downHeld = false;
  }

  /** Apply one kitty-keyboard key event (press / repeat / release). Directions
   *  become true holds; attacks/jump stay edge-triggered on press. */
  applyKittyKey(e: KittyKey): void {
    const now = Date.now();
    if (e.ch && (e.ch.toLowerCase() === 'q' || e.ch === '\x03')) { if (e.event === 'press') this.quit = true; return; }
    const token = e.arrow ? bindingFromArrowCode(e.arrow) : e.ch ? bindingFromChar(e.ch) : null;
    const action = token ? this.actionFor(token) : null;
    if (!action) return;
    const down = e.event !== 'release';
    if (action === 'left') { this.leftHeld = down; if (down) this.pushMotion('L', now); }
    else if (action === 'right') { this.rightHeld = down; if (down) this.pushMotion('R', now); }
    else if (action === 'crouch') { this.downHeld = down; if (down) this.pushMotion('D', now); }
    else if ((action === 'jump' || action === 'jumpAlt') && e.event === 'press') { this.jumpEdge = true; this.pushMotion('U', now); }
    else if (action === 'punch' && e.event === 'press') this.punchEdge = true;
    else if (action === 'kick' && e.event === 'press') this.kickEdge = true;
    else if (action === 'throw' && e.event === 'press') this.throwEdge = true;
  }

  snapshot(): Inputs {
    const now = Date.now();
    const inp: Inputs = emptyInputs();
    if (this.kittyMode) {
      inp.moveX = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
      inp.down = this.downHeld;
    } else {
      inp.moveX = (now < this.rightUntil ? 1 : 0) - (now < this.leftUntil ? 1 : 0);
      inp.down = now < this.downUntil;
    }
    inp.jump = this.jumpEdge;
    inp.punch = this.punchEdge;
    inp.kick = this.kickEdge;
    inp.throw = this.throwEdge;
    while (this.motion.length && now - this.motion[0]!.t > MOTION_MS) this.motion.shift();
    inp.motion = this.motion.map((m) => m.d).join('');
    this.jumpEdge = this.punchEdge = this.kickEdge = this.throwEdge = false;
    return inp;
  }
}

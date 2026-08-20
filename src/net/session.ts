import type { Duplex } from 'stream';
import { HIDE_CURSOR, SHOW_CURSOR, CLEAR_SCREEN, RESET, SYNC_BEGIN, SYNC_END } from '../render/pixel.js';
import { Frame, diffCells, type RenderMode, type Cell } from '../render/frame.js';
import { KittyRenderer, deleteImage } from '../render/kitty.js';
import { Caps, SETUP, MOUSE_ON, TEARDOWN, FIGHT_KEYBOARD_ON, FIGHT_KEYBOARD_OFF, probeSequence, GRAPHICS_IMAGE_ID, type MouseEvent, type KittyKey } from './caps.js';
import { parseKeys, type Key } from '../ui/key.js';
import { InputState } from '../input/keys.js';
import {
  DEFAULT_KEY_BINDINGS,
  parseKeyBindings,
  serializeKeyBindings,
  withBinding,
  type BindableAction,
  type BindingToken,
  type KeyBindings,
} from '../input/bindings.js';
import { composeSceneCached } from '../game/scene.js';
import { makeRenderPool } from '../render/render-pool.js';
import { hub, type RosterEntry, type ChatLine, type ChallengePeer } from './hub.js';
import { drawDebugOverlay, DEBUG_ON } from '../ui/debug.js';
import { pixelReady } from '../ui/surface.js';
import { drawTooSmall } from '../ui/notice.js';
import { MATCH_IDS } from './match-ids.js';
import { regionOf } from './region.js';
import { makeFighter, makeMatch, stepMatch, predictLocal, TICK_HZ } from '../game/engine.js';
import { MatchRecorder, ENGINE_VERSION } from '../telemetry/recorder.js';
import { emptyInputs, type Inputs, type Match } from '../game/types.js';
import { characterAt } from '../game/roster.js';
import { specialMovesFor } from '../game/moves.js';
import * as db from '../db/db.js';
import { SCREENS, type ScreenName } from '../screens/index.js';
import { drawFightHud } from '../screens/fight-hud.js';
import { actorRef, eventId, track, type TelemetryFields } from '../telemetry/discord.js';

const MAX_RENDER_HZ = 15; // visual refresh rate (sim/input stay at TICK_HZ = 30)
const MAX_COLS = 300, MAX_ROWS = 120;
const NOWRAP = '\x1b[?7l';
const WRAP = '\x1b[?7h';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const COLOR_STEP = clamp(parseInt(process.env.SF_COLOR_STEP ?? '1', 10) || 1, 1, 64);
const INDEXED_COLOR = process.env.SF_COLOR_MODE === '256';
const SF_UI_CELL = process.env.SF_UI === 'cell';   // dev escape hatch: crisp one-cell UI, no size gate
// Terminal capability negotiation (graphics / kitty-keyboard / mouse / resize).
// SF_CAPS=0 disables it entirely → pure legacy behaviour (instant rollback valve).
const CAPS_ENABLED = process.env.SF_CAPS !== '0';

// Optional pool of render worker threads (SF_RENDER_WORKERS>0). When enabled,
// the heavy fight render runs off the main thread so the game uses every core;
// everything else (sim, matchmaking, lounge, menus) stays single-process.
const RENDER_POOL = makeRenderPool();

// The one seam for cross-session features (matchmaking, lounge, challenges).
// LocalHub in-process; ClusterHub forwards to the primary. Session code is
// identical either way — see hub.ts.
const HUB = hub();

export interface MatchResult {
  winner: string;
  loser: string;
  youWon: boolean;
  winnerChar: string;
  rating?: { before: number; after: number; delta: number };
}

export class Session {
  // identity
  fp: string | null;
  guest: boolean;
  player: db.Player | null = null;

  // transport
  cols = 120; rows = 40;
  region = 'XX';           // coarse continent for region-aware matchmaking
  private lastWriteAt = Date.now();  // for the idle keepalive
  // terminal capabilities (graphics / kitty-keyboard / mouse), probed on connect.
  // Everything degrades gracefully to the octant renderer + legacy input.
  private caps: Caps;
  graphics = false;                              // true → render via kitty graphics
  private kitty = new KittyRenderer(GRAPHICS_IMAGE_ID);
  prevFrame: Cell[] | null = null;
  // two persistent cell buffers; render ping-pongs between them so steady-state
  // rendering reuses them in place (zero per-frame allocation, minimal GC).
  private cellsA: Cell[] | null = null;
  private cellsB: Cell[] | null = null;
  private static nextSid = 1;
  readonly sid = Session.nextSid++;      // stable id for render-worker affinity
  private renderInFlight = false;         // a pooled fight frame is being rendered
  private forceFull = false;              // next pooled render must be a full redraw
  alive = true;
  private loopTimer: NodeJS.Timeout | null = null;
  private outputBlocked = false;
  private screenInputGuardUntil = 0;

  // ui state
  screen: ScreenName = 'username';
  postCalibrate: ScreenName = 'menu';   // where the calibration screen hands off to
  calibMatch: Match | null = null;      // live demo fight shown during calibration
  frame = 0;
  menuIndex = 0;
  cursor = 0;              // character-select cursor
  selectMode: 'lobby' | 'practice' = 'lobby';
  usernameBuf = '';
  errorMsg = '';
  helpOpen = false;
  keyBindings: KeyBindings = DEFAULT_KEY_BINDINGS;
  controlsCursor = 0;
  bindingCapture: BindableAction | null = null;
  controlsNotice = '';
  // Default to 'quadrant' (2x2 blocks): renders on ANY terminal without drift.
  // Modern terminals can press V for the crisper 'octant' (2x4) view; the choice
  // is remembered per player.
  renderMode: RenderMode = 'quadrant';
  leader: db.LeaderRow[] = [];
  result: MatchResult | null = null;
  loungeFocus: 'chat' | 'players' = 'chat';
  loungeCursor = 0;
  loungeChatScroll = 0;    // display-lines scrolled up from the latest (0 = bottom)
  chatBuf = '';
  loungeNotice = '';
  // lounge caches, filled by the hub (never Session references, so they work
  // whether the peer is local or on another worker)
  loungeRoster: RosterEntry[] = [];
  loungeChat: ChatLine[] = [];
  incoming: ChallengePeer | null = null;
  outgoing: ChallengePeer | null = null;
  private lastChatAt = 0;
  private startedAt = Date.now();
  private lastAttackA = 'none';
  private lastAttackB = 'none';

  // fight
  match: Match | null = null;
  role: 'a' | 'b' = 'a';
  peer: Session | null = null;
  isStepper = false;
  practice = false;
  private practiceRec: MatchRecorder | null = null;   // Ringside capture of the current practice session
  remoteVersus = false;   // cluster: match is simulated by the primary, we render + send input
  remoteMid = '';
  // client-side prediction: our un-acked inputs, replayed on top of authoritative
  // state so our own fighter moves with zero round-trip latency.
  private predSeq = 0;
  private pending: { seq: number; input: Inputs }[] = [];
  fightInput = new InputState();

  constructor(
    public username: string,
    public stream: Duplex,
    fp: string | null,
    public connectionId = eventId('session'),
    public remoteIp = 'unknown',
    public clientSoftware = 'unknown',
  ) {
    this.fp = fp;
    this.guest = !fp;
    this.region = regionOf(this.remoteIp);
    let landing: ScreenName = 'username';
    if (fp) {
      this.player = db.touchOrCreate(fp);
      this.keyBindings = parseKeyBindings(this.player.key_bindings_json);
      if (this.player.view_mode === 'octant') this.renderMode = 'octant';   // remembered view preference (else stays quadrant)
      if (this.player.username) { this.username = this.player.username; landing = 'menu'; this.cursor = this.player.main_char; }
      else landing = 'username'; // registered key without a handle yet
    } else {
      landing = 'username'; // guests still pick a display name (not persisted)
    }
    // Show the display-calibration screen first on EVERY connect (terminals /
    // font sizes vary per session), then hand off to the username or menu screen.
    this.postCalibrate = landing;
    this.screen = 'calibrate';
    this.fightInput = new InputState(this.keyBindings);
    this.caps = new Caps({
      onProbeDone: (c) => {
        this.graphics = c.graphics;
        if (c.graphics || c.kittyKeyboard) this.write(MOUSE_ON);   // modern terminal → SGR mouse is safe
        this.kitty.reset(); this.prevFrame = null; this.forceFull = true;   // switch renderers cleanly
        this.trackEvent('terminal_caps', { graphics: c.graphics, kitty_keyboard: c.kittyKeyboard, client: this.clientSoftware });
      },
      onResize: (cols, rows) => this.resize(cols, rows),
      onFocus: (focused) => { if (focused) { this.prevFrame = null; this.forceFull = true; this.kitty.reset(); } },
      onMouse: (e) => this.onMouse(e),
      onKittyKey: (e) => this.onKittyKey(e),
    });
    HUB.register(this);
  }

  get displayName(): string { return this.player?.username ?? this.username; }

  trackEvent(event: string, fields: TelemetryFields = {}): void {
    track(event, {
      session_id: this.connectionId,
      player: this.displayName,
      actor: actorRef(this.fp, this.connectionId),
      ...fields,
    });
  }

  start(): void {
    this.trackEvent('game_session_started', { identity: this.guest ? 'guest' : 'verified_key', client: this.clientSoftware });
    // Enable focus/resize reporting, then probe for graphics + kitty keyboard.
    // Replies are stripped by caps.consume() before the game sees them.
    this.write(HIDE_CURSOR + NOWRAP + CLEAR_SCREEN + (CAPS_ENABLED ? SETUP + probeSequence() : ''));
    this.stream.on('data', (d: Buffer) => this.onData(d));
    this.stream.on('close', () => this.close());
    this.stream.on('error', () => this.close());
    this.loopTimer = setInterval(() => this.tick(), Math.round(1000 / TICK_HZ));
  }

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

  resize(cols: number, rows: number): void {
    const c = cols > 0 ? cols : this.cols;
    const r = rows > 0 ? rows : this.rows;
    if (c === this.cols && r === this.rows) return;   // SSH window-change + in-band 2048 both fire — dedupe
    this.cols = c; this.rows = r;
    this.prevFrame = null;
    this.forceFull = true;
    this.kitty.reset();
    this.write(CLEAR_SCREEN);
  }

  goTo(screen: ScreenName): void {
    const previous = this.screen;
    if (previous === 'fight' && screen !== 'fight') this.fightKeyboard(false);   // pop kitty keyboard on exit
    if (this.screen === 'lounge' && screen !== 'lounge') HUB.leaveLounge(this);
    this.screen = screen;
    this.menuIndex = 0;
    this.errorMsg = '';
    this.prevFrame = null;
    this.kitty.reset();
    if (previous !== screen) this.screenInputGuardUntil = Date.now() + 120;
    this.write(CLEAR_SCREEN);
    if (screen === 'leaderboard') this.leader = db.leaderboard(10);
    if (screen === 'controls') { this.bindingCapture = null; this.controlsNotice = ''; }
    if (previous !== screen) this.trackEvent('screen_view', { from: previous, to: screen });
  }

  // ---------- input ----------
  private onData(d: Buffer): void {
    if (!this.alive) return;
    // Strip + dispatch terminal replies/events (probe answers, mouse, focus,
    // resize, kitty-keyboard) first; only real keystrokes remain in `rest`.
    const rest = CAPS_ENABLED ? this.caps.consume(d) : d;
    if (rest.length === 0) return;
    // Some clients split CRLF across packets. Ignore a trailing newline-only
    // packet immediately after a transition instead of pressing Enter again.
    if (Date.now() < this.screenInputGuardUntil && /^[\r\n]+$/.test(rest.toString('latin1'))) return;
    if (this.helpOpen) { this.helpOpen = false; this.prevFrame = null; this.forceFull = true; return; }
    let data = rest;
    // 'v' cycles the view mode — graphics (if supported) → sharp octant → compatible
    // quadrant — so players can pick what renders best. Not while typing a name or
    // in the lounge chat.
    if (this.screen !== 'username' && this.screen !== 'lounge' && /[vV]/.test(data.toString('latin1'))) {
      this.cycleView();
      data = Buffer.from(data.toString('latin1').replace(/[vV]/g, ''), 'latin1');
      if (data.length === 0) return;
    }
    if (this.screen === 'fight') {
      // With kitty keyboard active, fight keys arrive as CSI events via onKittyKey,
      // so nothing is left to feed here.
      if (this.caps.kittyKeyActive) return;
      // Fight controls use their own hold/motion parser, so handle the overlay
      // key here before forwarding bytes. Any key closes help without also
      // becoming an accidental punch, kick, movement, or quit input.
      if (data.toString('latin1').includes('?')) { this.helpOpen = true; this.prevFrame = null; this.trackEvent('move_help_opened', { fighter: this.ownFighterName() }); return; }
      this.fightInput.feed(data);
      return;
    }
    for (const key of parseKeys(data)) {
      if (this.helpOpen) { this.helpOpen = false; this.prevFrame = null; this.forceFull = true; continue; }
      if (key.t === 'help' && !(this.screen === 'controls' && this.bindingCapture)) { this.helpOpen = true; this.prevFrame = null; this.trackEvent('help_opened', { screen: this.screen }); continue; }
      if (key.t === 'quit') { this.close(); return; }
      const screenBefore: ScreenName = this.screen;
      SCREENS[this.screen].onKey(this, key);
      // Never let remaining bytes from one SSH packet operate the next screen.
      if (this.screen !== screenBefore) break;
    }
  }

  // ---------- loop ----------
  private tick(): void {
    if (!this.alive) return;
    this.frame++;
    if (this.screen === 'fight') {
      if (this.remoteVersus) {
        // cluster: the primary simulates the match. We (1) send our input up, and
        // (2) predict our OWN fighter forward locally so it moves with zero
        // round-trip latency. applyRemoteState reconciles against the authority.
        const inp = this.fightInput.snapshot();
        const seq = ++this.predSeq;
        this.pending.push({ seq, input: inp });
        if (this.pending.length > 150) this.pending.shift();
        HUB.relayInput(this, inp, seq);
        // No quitting a ranked match — you win or you lose. (Disconnecting still
        // forfeits.) 'q' is ignored here so an accidental press can't drop you.
        if (this.match && this.match.phase === 'fight') predictLocal(this.match, this.role, inp);
        if (this.alive && !this.outputBlocked) this.renderCurrent();
        return; // rendered the predicted frame; skip the throttled render below
      } else if (this.practice) this.stepPractice();
      else if (this.isStepper && this.match && this.peer && this.peer.alive) {
        stepMatch(this.match, this.fightInput.snapshot(), this.peer.fightInput.snapshot());
        this.trackSpecialAttacks();
        // versus is fight-to-the-finish — 'q' does not forfeit (disconnect does).
        this.checkVersusEnd();
      }
    } else {
      SCREENS[this.screen].tick?.(this);
    }
    // sim + input run at TICK_HZ (responsive); rendering is throttled to
    // RENDER_HZ to cut the streamed bytes without hurting input latency.
    const renderCells = clamp(this.cols || 120, 24, MAX_COLS) * clamp(this.rows || 40, 12, MAX_ROWS);
    const renderHz = renderCells > 30_000 ? 8 : renderCells > 16_000 ? 10 : renderCells > 8_000 ? 12 : MAX_RENDER_HZ;
    this.renderAccum += renderHz;
    if (this.renderAccum >= TICK_HZ) {
      this.renderAccum -= TICK_HZ;
      if (!this.outputBlocked) this.renderCurrent();
    }
    // Idle keepalive: a static screen (menu/lounge) writes nothing, so a relay
    // or NAT could drop the connection. Re-send the (invisible, idempotent)
    // hide-cursor sequence if we've been silent, to keep the TCP flow alive.
    if (!this.outputBlocked && Date.now() - this.lastWriteAt > 25_000) this.write(HIDE_CURSOR);
  }
  private renderAccum = 0;

  /** Build the Frame for the current screen (fight scene + HUD, or screen UI).
   *  Both the octant and the graphics backends render from this same pixel layer. */
  private composeFrame(cols: number, rows: number): Frame {
    const f = new Frame(cols, rows, this.renderMode);
    if (this.screen === 'fight' && this.match) {
      f.usePixel(composeSceneCached(this.match, cols * 2, rows * 4, this.practice));
      drawFightHud(f, this.match, this.practice, this.keyBindings);
    } else {
      SCREENS[this.screen].render(this, f);
    }
    if (this.helpOpen) SCREENS.help.render(this, f);
    if (DEBUG_ON) drawDebugOverlay(f);
    return f;
  }

  /** Wrap a paint in synchronized-output (mode 2026) so the terminal never shows
   *  a half-drawn frame. Harmlessly ignored by terminals that don't support it. */
  private paint(out: string): void { if (out) this.write(CAPS_ENABLED ? SYNC_BEGIN + out + SYNC_END : out); }

  renderCurrent(): void {
    const cols = clamp(this.cols || 120, 24, MAX_COLS);
    const rows = clamp(this.rows || 40, 12, MAX_ROWS);
    // Pixel-only UI: if the terminal is too small for it to fit, show a "make
    // your terminal bigger" notice instead of a squashed screen.
    if (SF_UI_CELL === false && !pixelReady(cols, rows)) {
      const f = new Frame(cols, rows, this.renderMode);
      drawTooSmall(f);
      if (DEBUG_ON) drawDebugOverlay(f);
      const next = f.toCells(COLOR_STEP);
      this.paint(diffCells(this.prevFrame, next, cols, rows, INDEXED_COLOR));
      this.prevFrame = next; this.cellsA = this.cellsB = null;
      return;
    }
    // Graphics backend: send the whole pixel layer as one kitty image (true
    // colour, scaled to fill the grid). Only when the terminal supports it —
    // everyone else keeps the octant renderer below. Bypasses the render pool.
    if (this.graphics) {
      const f = this.composeFrame(cols, rows);
      this.paint(this.kitty.frame(f.pixel(), cols, rows));
      return;
    }
    // Fast path: offload the (expensive) fight render to a worker thread. Menus,
    // help overlays and the practice/versus scene during help stay inline (cheap
    // and stateful). One frame in flight at a time per session — drop, don't
    // queue, if the previous is still rendering (keeps latency bounded).
    if (RENDER_POOL && this.screen === 'fight' && this.match && !this.helpOpen) {
      if (this.renderInFlight) return;
      this.renderInFlight = true;
      const full = this.forceFull; this.forceFull = false;
      RENDER_POOL.render(this.sid, this.match, cols, rows, this.renderMode, this.practice, this.keyBindings, full)
        .then((bytes) => { this.renderInFlight = false; if (this.alive && bytes) this.paint(bytes); })
        .catch(() => { this.renderInFlight = false; this.forceFull = true; });
      return;
    }
    const f = this.composeFrame(cols, rows);
    // fill the buffer that ISN'T the current prevFrame (double-buffer); toCells
    // reuses it in place when the size matches, else allocates a fresh one.
    const reuse = this.prevFrame === this.cellsA ? this.cellsB : this.prevFrame === this.cellsB ? this.cellsA : null;
    const nextCells = f.toCells(COLOR_STEP, reuse ?? undefined);
    if (nextCells !== this.cellsA && nextCells !== this.cellsB) {
      if (this.prevFrame === this.cellsA) this.cellsB = nextCells; else this.cellsA = nextCells;
    }
    this.paint(diffCells(this.prevFrame, nextCells, cols, rows, INDEXED_COLOR));
    this.prevFrame = nextCells;
  }

  // ---------- fight orchestration ----------
  startVersus(match: Match, role: 'a' | 'b', peer: Session, isStepper: boolean): void {
    this.match = match; this.role = role; this.peer = peer; this.isStepper = isStepper;
    this.practice = false; this.fightInput = new InputState(this.keyBindings);
    this.lastAttackA = 'none'; this.lastAttackB = 'none';
    this.screen = 'fight'; this.prevFrame = null; this.forceFull = true;
    this.write(CLEAR_SCREEN + HIDE_CURSOR + NOWRAP);
    this.kitty.reset();
    this.fightKeyboard(true);
  }

  startPractice(charIdx: number): void {
    this.flushPractice();   // save any prior training session before starting a new one
    const you = characterAt(charIdx);
    const dummy = characterAt(charIdx + 1);
    const fa = makeFighter('a', you.name, 'a', you.palette);
    const fb = makeFighter('b', dummy.name, 'b', dummy.palette);
    const m = makeMatch(fa, fb);
    m.phase = 'fight'; m.phaseTimer = 0; m.message = '';
    this.match = m; this.role = 'a'; this.peer = null; this.isStepper = true;
    this.practice = true; this.fightInput = new InputState(this.keyBindings);
    this.lastAttackA = 'none'; this.lastAttackB = 'none';
    const mid = eventId('practice');
    MATCH_IDS.set(m, mid);
    try {
      this.practiceRec = new MatchRecorder(mid, {
        mode: 'practice', stage: m.stage, seed: 0, region: this.region, engineVersion: ENGINE_VERSION,
        sides: { a: { fp: this.fp, name: this.displayName, char: you.name, isBot: false },
                 b: { fp: null, name: dummy.name, char: dummy.name, isBot: true } },
      });
    } catch { this.practiceRec = null; }
    this.trackEvent('practice_started', { fighter: you.name, dummy: dummy.name, stage: m.stage, match_id: mid });
    this.screen = 'fight'; this.prevFrame = null; this.forceFull = true;
    this.write(CLEAR_SCREEN + HIDE_CURSOR + NOWRAP);
    this.kitty.reset();
    this.fightKeyboard(true);
  }

  /** Flush the current practice recording to the Ringside store (best-effort). */
  private flushPractice(): void {
    if (this.practiceRec && this.match) { try { this.practiceRec.finish(this.match); } catch { /* ignore */ } }
    this.practiceRec = null;
  }

  private stepPractice(): void {
    const m = this.match!;
    const inA = this.fightInput.snapshot();
    stepMatch(m, inA, emptyInputs());
    this.practiceRec?.frame(m, inA, emptyInputs());   // record before the sandbox hp overrides below
    this.trackSpecialAttacks();
    if (this.fightInput.quit) { this.flushPractice(); this.goTo('menu'); return; }
    // endless sandbox: player invincible, dummy respawns, no rounds/timer
    m.phase = 'fight'; m.phaseTimer = 0; m.message = ''; m.roundTime = 99;
    m.a.hp = 100;
    if (m.b.hp <= 0) { m.b.hp = 100; m.b.pose = 'idle'; m.b.stun = 0; m.b.attack = 'none'; m.b.attackFrame = 0; }
  }

  private checkVersusEnd(): void {
    const m = this.match!;
    if (!(m.phase === 'match-over' && m.phaseTimer <= 0)) return;
    const aWon = m.a.wins > m.b.wins;
    const winner = aWon ? m.a : m.b;
    const loser = aWon ? m.b : m.a;
    const winSess = aWon ? this : this.peer!;    // this is role 'a' stepper
    const loseSess = aWon ? this.peer! : this;
    const rating = db.recordMatch(winSess.fp, loseSess.fp, winSess.displayName, loseSess.displayName, winner.name, loser.name, winner.wins);
    track('match_won', {
      match_id: MATCH_IDS.get(m), winner: winSess.displayName, loser: loseSess.displayName,
      winner_actor: actorRef(winSess.fp, winSess.connectionId), loser_actor: actorRef(loseSess.fp, loseSess.connectionId),
      winner_fighter: winner.name, loser_fighter: loser.name, stage: m.stage, rated: !!rating,
      winner_elo: rating?.winnerAfter, loser_elo: rating?.loserAfter, rating_delta: rating?.delta,
    });
    if (winSess.fp) winSess.player = db.getByFingerprint(winSess.fp) ?? winSess.player;
    if (loseSess.fp) loseSess.player = db.getByFingerprint(loseSess.fp) ?? loseSess.player;
    for (const [sess, won] of [[winSess, true], [loseSess, false]] as const) {
      if (!sess.alive) continue;
      const ownRating = rating ? (won
        ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta }
        : { before: rating.loserBefore, after: rating.loserAfter, delta: -rating.delta }) : undefined;
      sess.result = { winner: winSess.displayName, loser: loseSess.displayName, youWon: won, winnerChar: winner.name, rating: ownRating };
      sess.match = null; sess.peer = null; sess.isStepper = false;
      sess.goTo('results');
    }
  }

  private forfeit(quitter: Session): void {
    const other = quitter === this ? this.peer! : this;
    if (other && other.alive && !this.practice) {
      const rating = db.recordMatch(other.fp, quitter.fp, other.displayName, quitter.displayName, 'n/a', 'n/a', 2);
      track('match_forfeit', {
        match_id: this.match ? MATCH_IDS.get(this.match) : undefined, winner: other.displayName, quitter: quitter.displayName,
        reason: 'quit', rated: !!rating, rating_delta: rating?.delta,
      });
      if (other.fp) other.player = db.getByFingerprint(other.fp) ?? other.player;
      other.result = {
        winner: other.displayName, loser: quitter.displayName, youWon: true, winnerChar: 'n/a',
        rating: rating ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta } : undefined,
      };
      other.match = null; other.peer = null; other.isStepper = false;
      other.goTo('results');
    }
    quitter.leaveFight();
  }

  private leaveFight(): void { this.flushPractice(); this.match = null; this.peer = null; this.isStepper = false; this.goTo('menu'); }

  joinLobby(): void {
    this.trackEvent('quick_match_queued', { fighter: characterAt(this.cursor).name });
    HUB.queue(this); // hub sends us to lobbyWait, then pairs (globally, across workers)
  }
  cancelLobby(): void {
    HUB.cancelQueue(this);
    this.trackEvent('quick_match_cancelled'); this.goTo('menu');
  }

  // ---- cluster remote versus (match simulated by the primary) ----
  startRemoteVersus(mid: string, role: 'a' | 'b', yourCursor: number, oppName: string, oppCursor: number, stage: string): void {
    const aCursor = role === 'a' ? yourCursor : oppCursor;
    const bCursor = role === 'a' ? oppCursor : yourCursor;
    const ca = characterAt(aCursor), cb = characterAt(bCursor);
    const m = makeMatch(makeFighter('a', ca.name, 'a', ca.palette), makeFighter('b', cb.name, 'b', cb.palette));
    m.stage = stage;
    this.match = m; this.role = role; this.peer = null; this.isStepper = false; this.practice = false;
    this.remoteVersus = true; this.remoteMid = mid;
    this.pending = []; this.predSeq = 0;
    this.fightInput = new InputState(this.keyBindings);
    this.lastAttackA = 'none'; this.lastAttackB = 'none';
    this.trackEvent('quick_match_paired', { fighter: ca.name, opponent: oppName });
    this.screen = 'fight'; this.prevFrame = null; this.forceFull = true;
    this.write(CLEAR_SCREEN + HIDE_CURSOR + NOWRAP);
    this.kitty.reset();
    this.fightKeyboard(true);
  }
  applyRemoteState(mid: string, m: Match, ack: number): void {
    if (mid !== this.remoteMid) return;
    // Reconcile: drop inputs the primary has already applied, then replay the few
    // still-pending ones on top of the authoritative state (our fighter only).
    this.pending = this.pending.filter((p) => p.seq > ack);
    if (m.phase === 'fight') for (const p of this.pending) predictLocal(m, this.role, p.input);
    this.match = m; // the next 30Hz tick renders this predicted+reconciled state
  }
  endRemoteVersus(mid: string, result: MatchResult): void {
    if (mid !== this.remoteMid) return;
    this.result = result;
    this.remoteVersus = false; this.remoteMid = ''; this.match = null; this.pending = [];
    if (this.fp) this.player = db.getByFingerprint(this.fp) ?? this.player; // refresh elo/stats
    this.goTo('results');
  }

  enterLounge(): void {
    this.loungeRoster = []; this.loungeChat = []; this.incoming = null; this.outgoing = null;
    this.loungeChatScroll = 0;
    this.goTo('lounge');
    HUB.enterLounge(this);
    this.loungeNotice = 'ESC RETURNS TO MAIN MENU  ·  TAB SWITCHES PANELS';
    this.trackEvent('lounge_joined', { fighter: characterAt(this.cursor).name });
  }
  sendChat(): void {
    const message = this.chatBuf.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 140);
    if (!message) return;
    if (message.toLowerCase() === '/menu') { this.chatBuf = ''; this.goTo('menu'); return; }
    const now = Date.now();
    if (now - this.lastChatAt < 700) { this.loungeNotice = 'SLOW DOWN - ONE MESSAGE AT A TIME'; return; }
    this.lastChatAt = now;
    this.chatBuf = '';
    this.loungeChatScroll = 0;   // jump back to the latest after sending
    HUB.sendChat(this, message);
  }
  challengeSelected(): void {
    if (!this.loungeRoster.length) { this.loungeNotice = 'NO OTHER PLAYERS IN THE LOUNGE'; return; }
    this.loungeCursor = clamp(this.loungeCursor, 0, this.loungeRoster.length - 1);
    HUB.challenge(this, this.loungeRoster[this.loungeCursor]!.id);
  }
  cancelChallenge(): void { HUB.cancelChallenge(this); }
  acceptChallenge(): void { HUB.acceptChallenge(this); }
  declineChallenge(): void { HUB.declineChallenge(this); }

  setKeyBinding(action: BindableAction, binding: BindingToken): void {
    this.keyBindings = withBinding(this.keyBindings, action, binding);
    this.persistKeyBindings();
    this.trackEvent('key_binding_changed', { action, binding });
  }

  /** Switch (and persist) the view mode: 'octant' (sharp, Unicode-16) or 'quadrant'
   *  (compatible 2x2 blocks that render on any terminal without drift). */
  setViewMode(mode: RenderMode): void {
    if (mode === this.renderMode) return;
    this.renderMode = mode;
    this.prevFrame = null; this.forceFull = true;
    this.trackEvent('view_mode_changed', { mode });
    if (!this.guest && this.fp) { db.setViewMode(this.fp, mode); this.player = db.getByFingerprint(this.fp) ?? this.player; }
  }

  /** 'v' cycles the visible renderer: graphics (if the terminal supports it) →
   *  octant → quadrant → back around. Graphics is not persisted; octant/quadrant is. */
  private cycleView(): void {
    if (this.graphics) {
      this.write(deleteImage(GRAPHICS_IMAGE_ID) + CLEAR_SCREEN);
      this.graphics = false; this.prevFrame = null; this.forceFull = true;
      this.renderMode = 'octant';
      this.trackEvent('view_mode_changed', { mode: 'octant' });
      if (!this.guest && this.fp) { db.setViewMode(this.fp, 'octant'); this.player = db.getByFingerprint(this.fp) ?? this.player; }
    } else if (this.renderMode === 'octant') {
      this.setViewMode('quadrant');
    } else if (this.caps.graphics) {
      this.graphics = true; this.kitty.reset(); this.prevFrame = null; this.forceFull = true;
      this.write(CLEAR_SCREEN);
      this.trackEvent('view_mode_changed', { mode: 'graphics' });
    } else {
      this.setViewMode('octant');
    }
  }

  /** Enable/disable the kitty keyboard protocol around a fight, so held keys give
   *  real press/release events (precise blocking, holds, charges). No-op when the
   *  terminal doesn't support it. */
  private fightKeyboard(on: boolean): void {
    if (!this.caps.kittyKeyboard) return;
    if (on && !this.caps.kittyKeyActive) { this.write(FIGHT_KEYBOARD_ON); this.caps.kittyKeyActive = true; this.fightInput.setKittyMode(true); }
    else if (!on && this.caps.kittyKeyActive) { this.write(FIGHT_KEYBOARD_OFF); this.caps.kittyKeyActive = false; this.fightInput.setKittyMode(false); }
  }

  private onMouse(e: MouseEvent): void {
    if (!this.alive || this.helpOpen) return;
    const pw = clamp(this.cols || 120, 24, MAX_COLS) * 2;
    const ph = clamp(this.rows || 40, 12, MAX_ROWS) * 4;
    SCREENS[this.screen].onMouse?.(this, e, pw, ph);
  }

  private onKittyKey(e: KittyKey): void {
    if (!this.alive || this.screen !== 'fight') return;
    if (this.helpOpen) { if (e.event === 'press') { this.helpOpen = false; this.prevFrame = null; this.forceFull = true; } return; }
    if (e.ch === '?') { if (e.event === 'press') { this.helpOpen = true; this.prevFrame = null; this.trackEvent('move_help_opened', { fighter: this.ownFighterName() }); } return; }
    this.fightInput.applyKittyKey(e);
  }

  resetKeyBindings(): void {
    this.keyBindings = DEFAULT_KEY_BINDINGS;
    this.persistKeyBindings();
    this.trackEvent('key_bindings_reset');
  }

  private persistKeyBindings(): void {
    if (!this.fp) return;
    db.setKeyBindings(this.fp, serializeKeyBindings(this.keyBindings));
    this.player = db.getByFingerprint(this.fp) ?? this.player;
  }

  close(): void {
    if (!this.alive) return;
    this.alive = false;
    this.trackEvent('game_session_ended', { screen: this.screen, duration_seconds: Math.round((Date.now() - this.startedAt) / 1000) });
    if (this.loopTimer) { clearInterval(this.loopTimer); this.loopTimer = null; }
    if (this.practice) this.flushPractice();   // save an in-progress training session on disconnect
    RENDER_POOL?.free(this.sid);
    if (this.remoteVersus) HUB.leaveMatch(this);
    HUB.cancelQueue(this);
    HUB.leaveLounge(this);
    HUB.unregister(this);
    // if mid versus fight, award the peer
    if (this.screen === 'fight' && !this.practice && this.peer && this.peer.alive) {
      const other = this.peer;
      const rating = db.recordMatch(other.fp, this.fp, other.displayName, this.displayName, 'n/a', 'n/a', 2);
      track('match_forfeit', {
        match_id: this.match ? MATCH_IDS.get(this.match) : undefined, winner: other.displayName, quitter: this.displayName,
        reason: 'disconnect', rated: !!rating, rating_delta: rating?.delta,
      });
      if (other.fp) other.player = db.getByFingerprint(other.fp) ?? other.player;
      other.result = {
        winner: other.displayName, loser: this.displayName, youWon: true, winnerChar: 'n/a',
        rating: rating ? { before: rating.winnerBefore, after: rating.winnerAfter, delta: rating.delta } : undefined,
      };
      other.match = null; other.peer = null; other.isStepper = false;
      other.goTo('results');
    }
    // Undo everything we turned on: our image, kitty keyboard (if pushed), mouse /
    // focus / resize reporting, then restore the cursor and wrap.
    const teardown = deleteImage(GRAPHICS_IMAGE_ID) + (this.caps.kittyKeyActive ? FIGHT_KEYBOARD_OFF : '') + TEARDOWN;
    try { this.stream.write(teardown + SHOW_CURSOR + WRAP + RESET + '\r\n'); this.stream.end(); } catch { /* ignore */ }
  }

  private ownFighterName(): string {
    if (!this.match) return characterAt(this.cursor).name;
    return this.role === 'a' ? this.match.a.name : this.match.b.name;
  }

  private trackSpecialAttacks(): void {
    const m = this.match;
    if (!m) return;
    const inspect = (side: 'a' | 'b', previous: string): string => {
      const fighter = m[side];
      const current = fighter.attack;
      if (current !== previous && current !== 'none') {
        const move = specialMovesFor(fighter.name).find((candidate) => candidate.attack === current);
        if (move && (!this.practice || side === 'a')) {
          const owner = side === 'a' ? this : this.peer;
          track('special_move_used', {
            match_id: MATCH_IDS.get(m), player: owner?.displayName ?? 'training_dummy', fighter: fighter.name,
            move: move.name, attack: move.attack, practice: this.practice,
          });
        }
      }
      return current;
    };
    this.lastAttackA = inspect('a', this.lastAttackA);
    this.lastAttackB = inspect('b', this.lastAttackB);
  }
}

// First-run display calibration. Players connect over SSH into terminals of
// wildly different font sizes / zoom levels, and the render quality is driven by
// how many cells the terminal reports (more cells = more sub-pixels = smoother
// fighters). This screen shows a LIVE demo fight — the real pixel engine + the
// real HUD — and coaches the player to zoom their terminal until both the sprites
// and the HUD text look their best, with a live resolution/quality readout that
// updates as they zoom (each zoom fires a window-change → resize → re-render).
import type { Frame } from '../render/frame.js';
import type { Key } from '../ui/key.js';
import type { Session } from '../net/session.js';
import { composeSceneCached } from '../game/scene.js';
import { drawFightHud } from './fight-hud.js';
import { makeFighter, makeMatch, stepMatch } from '../game/engine.js';
import { emptyInputs, type Inputs, type Match } from '../game/types.js';
import { characterAt } from '../game/roster.js';
import { makeSurface } from '../ui/surface.js';
import { hints, meter, SP } from '../ui/widgets.js';
import { THEME } from '../ui/theme.js';
import * as db from '../db/db.js';

const LOOP = 210; // frames per demo showcase cycle (~7s at 30Hz)

// Scripted spar so the preview exercises the whole renderer: walk, punch, kick,
// jump, and each of BYU's three specials (projectile + launch + spin poses).
function demoInputs(frame: number): [Inputs, Inputs] {
  const a = emptyInputs(), b = emptyInputs();
  const t = frame % LOOP;
  if (t < 26) a.moveX = 1;                              // approach
  else if (t === 40) a.punch = true;                   // punch
  else if (t === 60) a.kick = true;                    // kick
  else if (t === 82) { a.jump = true; a.moveX = 1; }   // jump-in
  else if (t === 112) { a.motion = 'DR'; a.punch = true; }   // Hadouken
  else if (t === 142) { a.motion = 'RDR'; a.punch = true; }  // Dragon Punch
  else if (t === 170) { a.motion = 'DL'; a.kick = true; }    // Hurricane Kick
  else if (t > 184) a.moveX = -1;                      // reset spacing
  if (t >= 34 && t < 150) b.moveX = 1;                 // opponent holds back (blocks)
  return [a, b];
}

function makeDemoMatch(): Match {
  const p1 = characterAt(0);   // BYU — has the full special set to show off
  const p2 = characterAt(3);   // CHONG — colour contrast
  const m = makeMatch(makeFighter('a', p1.name, 'a', p1.palette), makeFighter('b', p2.name, 'b', p2.palette));
  m.phase = 'fight'; m.phaseTimer = 0; m.message = '';
  (m as unknown as { _ax: number; _bx: number })._ax = m.a.x;
  (m as unknown as { _ax: number; _bx: number })._bx = m.b.x;
  return m;
}

function recenter(m: Match): void {
  const s = m as unknown as { _ax: number; _bx: number };
  for (const [f, x] of [[m.a, s._ax], [m.b, s._bx]] as const) {
    f.x = x; f.vx = 0; f.vy = 0; f.y = 0; f.attack = 'none'; f.attackFrame = 0; f.stun = 0; f.pose = 'idle';
  }
  m.projectiles = [];
}

const QUALITY = ['LOW', 'FAIR', 'GOOD', 'CRISP', 'ULTRA', 'MAX'] as const;
const QMAX = QUALITY.length - 1;
function quality(cols: number, rows: number): number {
  // Fidelity tracks the fighter's on-screen height in sub-pixels: the scene
  // renders at cols*2 x rows*4 sub-pixels, a fighter is ~58 world units tall,
  // and sprites are ~250px native — so detail keeps climbing as you zoom out
  // until ~200px (MAX). ws = view scale = min(cols/120, rows/40).
  const ws = Math.min((cols * 2) / 240, (rows * 4) / 160);
  const px = 58 * ws;
  return px < 30 ? 0 : px < 50 ? 1 : px < 80 ? 2 : px < 120 ? 3 : px < 185 ? 4 : 5;
}

export const calibrate = {
  tick(s: Session): void {
    if (!s.calibMatch) s.calibMatch = makeDemoMatch();
    const m = s.calibMatch;
    const [ia, ib] = demoInputs(s.frame);
    stepMatch(m, ia, ib);
    // endless, damage-free spar: keep both alive and reset spacing each loop
    m.phase = 'fight'; m.phaseTimer = 0; m.message = ''; m.roundTime = 99; m.a.hp = 100; m.b.hp = 100;
    if (s.frame % LOOP === 0) recenter(m);
  },

  render(s: Session, f: Frame): void {
    const { cols, rows } = f;
    if (s.calibMatch) {
      f.usePixel(composeSceneCached(s.calibMatch, cols * 2, rows * 4, false));
      drawFightHud(f, s.calibMatch, false, s.keyBindings, false);   // calibrate draws its own footer hints
    }
    const ui = makeSurface(f);
    if (!s.calibMatch) ui.gradient(THEME.bgTop, THEME.bgBot);

    // Instruction panel, centered over the live scene.
    const w = Math.min(58, Math.max(28, ui.cols - 4));
    const h = Math.min(ui.rows - 4, 13);
    const x = Math.floor((ui.cols - w) / 2);
    const y = Math.max(2, Math.floor((ui.rows - h) / 2));
    const inner = ui.panel(x, y, w, h, { title: 'CALIBRATE YOUR VIEW' });
    const cx = inner.x + 0.5, iw = Math.floor(inner.w - 1);
    let r = inner.y + 0.3;
    const line = (str: string, fg = THEME.text) => {
      if (r < inner.y + inner.h) ui.text(cx, r, str.slice(0, iw), { color: fg });
      r += SP.line;
    };
    line('THIS IS EXACTLY HOW A FIGHT LOOKS. TUNE YOUR', THEME.textDim);
    line('TERMINAL SO BOTH READ CLEAN:', THEME.textDim);
    r += SP.gap;
    line('ZOOM OUT  (CTRL - / CMD -)  SMOOTHER FIGHTERS', THEME.accent2);
    line('ZOOM IN   (CTRL + / CMD +)  LARGER HUD TEXT', THEME.accent2);
    r += SP.gap;

    // live resolution + quality meter (fidelity tracks the TERMINAL resolution)
    const q = quality(cols, rows);
    const qcol = q <= 0 ? THEME.bad : q === 1 ? THEME.accent : q >= QMAX ? THEME.good : THEME.accent2;
    line(`CANVAS ${cols}x${rows} CELLS - ${cols * 2}x${rows * 4} SUBPIXELS`, THEME.text);
    if (r < inner.y + inner.h) {
      ui.text(cx, r, 'FIDELITY', { color: THEME.textDim });
      meter(ui, cx + 9, r, QUALITY.length, q + 1, qcol);
      const mx = cx + 9 + QUALITY.length * 1.1 + 1;
      ui.text(mx, r, QUALITY[q]!, { color: qcol });
      if (q < QMAX) ui.text(mx + QUALITY[q]!.length + 1, r, '(ZOOM OUT FOR MORE)', { color: THEME.textDim });
    }

    hints(ui, ui.rows - 1, [['V', `GFX:${s.renderMode.toUpperCase()}`], ['?', 'MOVES'], ['ENTER', 'READY - LETS FIGHT']]);
  },

  onKey(s: Session, k: Key): void {
    if (k.t === 'enter') {
      if (s.fp && s.player && !s.player.calibrated) {
        db.setCalibrated(s.fp);
        s.player = db.getByFingerprint(s.fp) ?? s.player;
      }
      s.calibMatch = null;
      s.goTo(s.postCalibrate);
    }
  },
};

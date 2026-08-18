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
import { box, keyHints } from '../ui/tui.js';
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

const QUALITY = ['LOW', 'FAIR', 'GOOD', 'CRISP', 'ULTRA'] as const;
function quality(cols: number, rows: number): number {
  const cells = cols * rows;
  return cells < 1800 ? 0 : cells < 3200 ? 1 : cells < 4800 ? 2 : cells < 7200 ? 3 : 4;
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
      drawFightHud(f, s.calibMatch, false, s.keyBindings);
    } else {
      f.gradient(THEME.bgTop, THEME.bgBot);
    }

    // Instruction panel, centered over the live scene.
    const w = Math.min(66, Math.max(30, cols - 4));
    const h = Math.min(rows - 4, 13);
    const x = Math.floor((cols - w) / 2);
    const y = Math.max(3, Math.floor((rows - h) / 2));
    const inner = box(f, x, y, w, h, { title: 'CALIBRATE YOUR VIEW', style: 'double' });
    const iw = inner.w;
    const line = (row: number, str: string, fg = THEME.text, bold = false) => {
      if (row >= inner.y + inner.h) return;
      f.write(inner.x, row, str.slice(0, iw), fg, THEME.panel, bold);
    };
    let r = inner.y;
    line(r++, 'This is exactly how a fight looks. Tune your', THEME.textDim);
    line(r++, 'terminal so BOTH read clean:', THEME.textDim);
    r++;
    line(r++, 'ZOOM OUT  (Ctrl -  /  Cmd -)  smoother fighters', THEME.accent2, true);
    line(r++, 'ZOOM IN   (Ctrl +  /  Cmd +)  larger HUD text', THEME.accent2, true);
    r++;

    // live resolution + quality meter
    const q = quality(cols, rows);
    const qcol = q <= 0 ? THEME.bad : q === 1 ? THEME.accent : q >= 4 ? THEME.good : THEME.accent2;
    line(r++, `Canvas ${cols}x${rows} cells  ->  ${cols * 2}x${rows * 4} sub-pixels`, THEME.text);
    const segs = 5;
    let mx = inner.x;
    f.write(mx, r, 'FIDELITY ', THEME.textDim, THEME.panel); mx += 9;
    for (let i = 0; i < segs; i++) { f.putChar(mx++, r, i <= q ? '█' : '░', i <= q ? qcol : THEME.textDim, THEME.panel, false); }
    f.write(mx + 1, r, QUALITY[q]!, qcol, THEME.panel, true);
    if (q < 4) f.write(mx + 1 + QUALITY[q]!.length + 1, r, '(zoom out for more)', THEME.textDim, THEME.panel);
    r++;

    keyHints(f, f.rows - 1, [['V', `GFX:${s.renderMode.toUpperCase()}`], ['?', 'MOVES'], ['ENTER', "READY - LET'S FIGHT"]]);
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

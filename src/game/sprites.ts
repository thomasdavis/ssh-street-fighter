// Procedural fighter sprites — the SWAPPABLE art layer. drawFighter(pose,...)
// returns a PixelGrid; a future AI/maldoror sprite pipeline replaces this file
// without touching the engine. Facing-right is drawn; the scene flips for left.
import { createGrid, fillRect, type PixelGrid, type RGB } from '../render/pixel.js';
import type { FighterPalette, Pose } from './types.js';

export const SPRITE_W = 30;
export const SPRITE_H = 52;

export const RED_PALETTE: FighterPalette = {
  skin: { r: 226, g: 176, b: 140 }, gi: { r: 208, g: 60, b: 52 }, giDark: { r: 150, g: 34, b: 30 },
  hair: { r: 30, g: 24, b: 22 }, belt: { r: 245, g: 232, b: 210 },
};
export const BLUE_PALETTE: FighterPalette = {
  skin: { r: 214, g: 168, b: 150 }, gi: { r: 58, g: 96, b: 210 }, giDark: { r: 32, g: 58, b: 150 },
  hair: { r: 210, g: 190, b: 60 }, belt: { r: 245, g: 232, b: 210 },
};
export const GREEN_PALETTE: FighterPalette = {
  skin: { r: 232, g: 190, b: 158 }, gi: { r: 46, g: 168, b: 96 }, giDark: { r: 26, g: 108, b: 60 },
  hair: { r: 40, g: 30, b: 26 }, belt: { r: 240, g: 220, b: 120 },
};
export const PURPLE_PALETTE: FighterPalette = {
  skin: { r: 208, g: 160, b: 148 }, gi: { r: 150, g: 74, b: 200 }, giDark: { r: 96, g: 40, b: 140 },
  hair: { r: 230, g: 60, b: 120 }, belt: { r: 235, g: 235, b: 235 },
};
export const OLIVE_PALETTE: FighterPalette = {
  skin: { r: 222, g: 174, b: 132 }, gi: { r: 88, g: 116, b: 62 }, giDark: { r: 52, g: 72, b: 38 },
  hair: { r: 236, g: 214, b: 76 }, belt: { r: 112, g: 76, b: 44 },
};
export const CRIMSON_PALETTE: FighterPalette = {
  skin: { r: 220, g: 156, b: 120 }, gi: { r: 188, g: 44, b: 42 }, giDark: { r: 116, g: 24, b: 28 },
  hair: { r: 52, g: 30, b: 24 }, belt: { r: 224, g: 184, b: 62 },
};
export const SAFFRON_PALETTE: FighterPalette = {
  skin: { r: 140, g: 92, b: 66 }, gi: { r: 224, g: 142, b: 36 }, giDark: { r: 156, g: 72, b: 28 },
  hair: { r: 236, g: 236, b: 218 }, belt: { r: 190, g: 42, b: 38 },
};
export const NAVY_PALETTE: FighterPalette = {
  skin: { r: 226, g: 172, b: 132 }, gi: { r: 46, g: 72, b: 126 }, giDark: { r: 24, g: 40, b: 82 },
  hair: { r: 28, g: 24, b: 26 }, belt: { r: 240, g: 232, b: 210 },
};
export const TEAL_PALETTE: FighterPalette = {
  skin: { r: 166, g: 112, b: 82 }, gi: { r: 24, g: 174, b: 164 }, giDark: { r: 12, g: 70, b: 78 },
  hair: { r: 20, g: 24, b: 32 }, belt: { r: 122, g: 242, b: 222 },
};
export const IVORY_PALETTE: FighterPalette = {
  skin: { r: 116, g: 72, b: 50 }, gi: { r: 238, g: 230, b: 206 }, giDark: { r: 178, g: 130, b: 46 },
  hair: { r: 24, g: 20, b: 20 }, belt: { r: 40, g: 92, b: 184 },
};
export const OBSIDIAN_PALETTE: FighterPalette = {
  skin: { r: 54, g: 58, b: 62 }, gi: { r: 42, g: 44, b: 48 }, giDark: { r: 14, g: 16, b: 20 },
  hair: { r: 176, g: 22, b: 24 }, belt: { r: 244, g: 54, b: 44 },
};
export const AURORA_PALETTE: FighterPalette = {
  skin: { r: 80, g: 98, b: 112 }, gi: { r: 38, g: 194, b: 184 }, giDark: { r: 18, g: 72, b: 92 },
  hair: { r: 242, g: 222, b: 156 }, belt: { r: 246, g: 142, b: 56 },
};
export const HEARTH_PALETTE: FighterPalette = {
  skin: { r: 236, g: 226, b: 210 }, gi: { r: 218, g: 119, b: 86 }, giDark: { r: 126, g: 56, b: 38 },
  hair: { r: 52, g: 58, b: 70 }, belt: { r: 242, g: 200, b: 120 },
};
// MNEME — luminous violet architect lit by megawatt energy.
export const LUMEN_PALETTE: FighterPalette = {
  skin: { r: 224, g: 214, b: 236 }, gi: { r: 138, g: 92, b: 220 }, giDark: { r: 58, g: 34, b: 108 },
  hair: { r: 244, g: 214, b: 120 }, belt: { r: 214, g: 196, b: 255 },
};
// AJAX — ochre-and-copper Australian systems-builder.
export const OUTBACK_PALETTE: FighterPalette = {
  skin: { r: 214, g: 168, b: 128 }, gi: { r: 190, g: 120, b: 54 }, giDark: { r: 96, g: 56, b: 28 },
  hair: { r: 44, g: 38, b: 34 }, belt: { r: 212, g: 150, b: 70 },
};
// XENON — cool cyan phase-sage, noble-gas glow.
export const NOBLE_PALETTE: FighterPalette = {
  skin: { r: 200, g: 216, b: 224 }, gi: { r: 46, g: 200, b: 206 }, giDark: { r: 18, g: 84, b: 104 },
  hair: { r: 230, g: 244, b: 248 }, belt: { r: 150, g: 240, b: 244 },
};
// UNCLOSE — ivory gatekeeper construct in an open azure robe with an amber sash.
export const HORIZON_PALETTE: FighterPalette = {
  skin: { r: 238, g: 232, b: 220 }, gi: { r: 64, g: 150, b: 230 }, giDark: { r: 28, g: 74, b: 140 },
  hair: { r: 220, g: 240, b: 250 }, belt: { r: 246, g: 186, b: 70 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const shade = (c: RGB): RGB => ({ r: c.r >> 1, g: c.g >> 1, b: c.b >> 1 });

/**
 * @param pose  animation pose
 * @param phase free-running phase (idle breathing / walk cycle)
 * @param ext   0..1 limb extension for punch/kick
 */
export function drawFighter(pose: Pose, pal: FighterPalette, phase = 0, ext = 0): PixelGrid {
  const g = createGrid(SPRITE_W, SPRITE_H, null);
  const cx = 12;

  if (pose === 'ko') {
    fillRect(g, 3, 45, 22, 5, pal.gi);
    fillRect(g, 2, 45, 7, 5, pal.skin);
    fillRect(g, 2, 45, 7, 2, pal.hair);
    return g;
  }

  if (pose === 'rolling' || pose === 'verticalroll') {
    // Compact curled-ball fallback used if a generated frame is unavailable.
    // The renderer's sprite sheet supplies the detailed BLANKO rotation.
    const cy = pose === 'verticalroll' ? 23 : 29;
    fillRect(g, 7, cy - 7, 16, 14, pal.giDark);
    fillRect(g, 5, cy - 4, 20, 8, pal.gi);
    fillRect(g, 9, cy - 9, 12, 18, pal.gi);
    fillRect(g, 11, cy - 6, 8, 5, pal.hair);
    fillRect(g, 10, cy + 3, 10, 3, pal.skin);
    return g;
  }

  const crouch = pose === 'crouch' || pose === 'crouchblock' || pose === 'crouchpunch' || pose === 'crouchkick';
  const doPunch = pose === 'punch' || pose === 'crouchpunch';
  const doKick = pose === 'kick' || pose === 'crouchkick';
  const doBlock = pose === 'block' || pose === 'crouchblock';
  const breathe = pose === 'idle' ? Math.round(Math.sin(phase) * 1) : 0;
  const drop = crouch ? 11 : (pose === 'jump' ? -2 : 0);

  // head
  const headY = 4 + drop + breathe;
  fillRect(g, cx - 3, headY, 8, 8, pal.skin);
  fillRect(g, cx - 3, headY, 8, 3, pal.hair);
  fillRect(g, cx - 4, headY + 2, 1, 5, pal.hair);
  fillRect(g, cx + 3, headY + 4, 1, 2, { r: 20, g: 20, b: 20 }); // eye

  // torso
  const torsoY = headY + 8;
  const torsoH = crouch ? 9 : 12;
  fillRect(g, cx - 4, torsoY, 10, torsoH, pal.gi);
  fillRect(g, cx - 4, torsoY, 3, torsoH, pal.giDark);
  fillRect(g, cx - 4, torsoY + torsoH - 2, 10, 2, pal.belt);

  const hipY = torsoY + torsoH;

  // ---- legs ----
  if (pose === 'jump' || pose === 'fall' || pose === 'shoryuken') {
    const tuck = pose === 'fall' ? 10 : 6;
    fillRect(g, cx - 4, hipY, 5, tuck, pal.gi);
    fillRect(g, cx + 2, hipY, 5, tuck - 1, pal.giDark);
    fillRect(g, cx - 5, hipY + tuck - 2, 6, 2, shade(pal.gi));
    fillRect(g, cx + 2, hipY + tuck - 2, 6, 2, shade(pal.gi));
  } else if (pose === 'hurricane') {
    // one leg extended straight forward (horizontal spin kick), other tucked
    fillRect(g, cx - 3, hipY, 5, 6, pal.giDark);
    fillRect(g, cx - 4, hipY + 5, 6, 2, shade(pal.gi));
    fillRect(g, cx + 1, hipY + 1, 17, 5, pal.gi);
    fillRect(g, cx + 17, hipY + 1, 5, 5, pal.skin);
  } else if (doKick) {
    // back leg supports; front leg extends forward by ext (low if crouching)
    const kneeY = crouch ? hipY + 4 : hipY + 2;
    fillRect(g, cx - 3, hipY, 5, crouch ? 9 : 15, pal.giDark);
    fillRect(g, cx - 4, hipY + (crouch ? 7 : 13), 6, 3, shade(pal.gi));
    const footX = Math.round(lerp(cx + 2, cx + 21, ext));
    const footY = Math.round(lerp(hipY + (crouch ? 8 : 12), kneeY, ext));
    fillRect(g, cx + 1, kneeY, Math.max(3, footX - cx - 1), 4, pal.gi);
    fillRect(g, footX, footY, 5, 4, pal.skin);
  } else if (crouch) {
    fillRect(g, cx - 7, hipY, 6, 7, pal.giDark);
    fillRect(g, cx + 3, hipY, 6, 7, pal.gi);
    fillRect(g, cx - 8, hipY + 7, 7, 2, shade(pal.gi));
    fillRect(g, cx + 3, hipY + 7, 7, 2, shade(pal.gi));
  } else {
    const step = pose === 'walk' ? Math.sin(phase) * 3 : 0;
    fillRect(g, cx - 3, hipY, 4, 15 - Math.abs(step), pal.giDark);
    fillRect(g, cx - 4 - Math.max(0, -step), hipY + 13, 6, 3, shade(pal.gi));
    fillRect(g, cx + 1, hipY, 4, 15 - Math.abs(step), pal.gi);
    fillRect(g, cx + 1 + Math.max(0, step), hipY + 13, 6, 3, shade(pal.gi));
  }

  // ---- arms ----
  const shY = torsoY + 2;
  if (doPunch) {
    const fistX = Math.round(lerp(cx + 5, cx + 20, ext));
    fillRect(g, cx + 4, shY + 1, Math.max(4, fistX - cx - 2), 4, pal.skin);
    fillRect(g, fistX, shY, 5, 6, pal.skin);
    fillRect(g, cx - 5, shY + 2, 4, 7, pal.giDark);
  } else if (doBlock) {
    fillRect(g, cx + 3, shY - 1, 5, 11, pal.skin);
    fillRect(g, cx + 3, shY - 1, 5, 3, pal.gi);
    fillRect(g, cx - 4, shY + 2, 4, 7, pal.giDark);
  } else if (doKick) {
    fillRect(g, cx + 4, shY + 3, 4, 7, pal.skin);
    fillRect(g, cx - 6, shY, 4, 7, pal.skin);
  } else if (pose === 'hadouken') {
    // both arms thrust forward, hands cupped around the energy (ext = throw)
    const reach = Math.round(lerp(cx + 3, cx + 16, ext));
    fillRect(g, cx + 2, shY + 2, Math.max(4, reach - cx), 4, pal.skin);
    fillRect(g, cx + 2, shY + 6, Math.max(4, reach - cx), 4, pal.skin);
    fillRect(g, reach, shY + 1, 5, 8, pal.skin);
  } else if (pose === 'shoryuken') {
    // lead fist thrust straight up above the head (rising uppercut)
    const ax = cx + 2;
    fillRect(g, ax, headY - 9, 4, torsoY - headY + 12, pal.skin); // upraised arm
    fillRect(g, ax - 1, headY - 12, 6, 5, pal.skin);              // fist above head
    fillRect(g, cx - 6, shY + 2, 4, 7, pal.giDark);               // other arm
  } else if (pose === 'hurricane') {
    // arms spread out for the spin
    fillRect(g, cx + 4, shY + 1, 8, 4, pal.skin);
    fillRect(g, cx - 10, shY + 3, 8, 4, pal.giDark);
  } else if (pose === 'hit') {
    fillRect(g, cx - 8, shY, 4, 8, pal.skin);
    fillRect(g, cx + 5, shY - 2, 4, 7, pal.skin);
  } else if (pose === 'jump' || pose === 'fall') {
    fillRect(g, cx + 4, shY - 2, 4, 8, pal.skin);
    fillRect(g, cx - 6, shY - 2, 4, 8, pal.giDark);
  } else {
    // idle / walk: relaxed guard with a subtle bob
    const armBob = pose === 'idle' ? breathe : 0;
    fillRect(g, cx + 4, shY + 1 + armBob, 4, 9, pal.skin);
    fillRect(g, cx - 6, shY + 1 - armBob, 4, 9, pal.giDark);
  }

  return g;
}

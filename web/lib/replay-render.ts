// Shared canvas renderer for a single match frame — used by both the replay
// viewer (plays a stored track) and the live spectator (polls the current frame).
// Draws stage, fighters (real sprites with feet-anchor + facing flip), special
// EFFECTS (screen-length beam, gravity well, projectiles) and the HUD.

export type Quad = [number, number, number, number];
export interface Frame {
  a: Quad; b: Quad;                 // [x, y, facing, hp]
  asp: string; aa: string; aAct: boolean;
  bsp: string; ba: string; bAct: boolean;
  pr: [number, number, number, string][]; // x, y, owner(0/1), style
  ph: string; rd: number; msg: string;
}
export interface CharMeta { idleH: number; ver?: number; frames: Record<string, Quad> }
export interface RenderMeta {
  stage: string; aChar: string; bChar: string; aName: string; bName: string;
  worldW: number; worldH: number; groundY: number; fighterH: number; stageLeft: number; stageRight: number;
  sprites: { a: CharMeta; b: CharMeta };
}

export const CW = 960, CH = 640;
export const spriteUrl = (char: string, name: string, ver?: number) =>
  `/api/sprite/${encodeURIComponent(char)}/${name}${ver ? `?v=${ver}` : ''}`;
export const stageUrl = (stage: string) => `/api/stage/${encodeURIComponent(stage)}`;
const projColor = (s: string) => (s === 'fire' ? '#ff7a3c' : s === 'sonic' ? '#8fe0ff' : '#6fa8ff');
const imgOk = (i?: HTMLImageElement | null) => !!i && i.complete && i.naturalWidth > 0;

/** Ensure an Image is loading for every sprite frame both characters can use. */
export function ensureImages(meta: RenderMeta, imgs: Map<string, HTMLImageElement>): void {
  for (const [char, cm] of [[meta.aChar, meta.sprites.a], [meta.bChar, meta.sprites.b]] as const) {
    for (const name of Object.keys(cm.frames)) {
      const key = `${char}/${name}`;
      if (imgs.has(key)) continue;
      const im = new Image(); im.src = spriteUrl(char, name, cm.ver); imgs.set(key, im);
    }
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, meta: RenderMeta, side: 'a' | 'b', f: Frame, imgs: Map<string, HTMLImageElement>, ws: number, ox: number, oy: number) {
  const isA = side === 'a';
  const st = isA ? f.a : f.b;
  const char = isA ? meta.aChar : meta.bChar;
  const cm = isA ? meta.sprites.a : meta.sprites.b;
  let name = isA ? f.asp : f.bsp;
  let m = cm.frames[name]; let img = imgs.get(`${char}/${name}`);
  if (!m || !imgOk(img)) { name = 'idle_1'; m = cm.frames.idle_1; img = imgs.get(`${char}/idle_1`); }
  if (!m || !imgOk(img)) return;
  const [w, h, ax, ay] = m;
  const sf = (meta.fighterH * ws) / (cm.idleH || 256);
  const feetX = ox + st[0] * ws, feetY = oy + (meta.groundY - st[1]) * ws;
  ctx.save();
  if (st[2] === -1) { ctx.translate(feetX, 0); ctx.scale(-1, 1); ctx.translate(-feetX, 0); }
  ctx.drawImage(img!, feetX - ax * sf, feetY - ay * sf, w * sf, h * sf);
  ctx.restore();
}

// Screen-length TESTIMONY beam (OMEGA) — matches the game's crimson layered bar.
function drawBeam(ctx: CanvasRenderingContext2D, meta: RenderMeta, st: Quad, ws: number, ox: number, oy: number) {
  const facing = st[2];
  const originXw = st[0] + facing * 18;
  const endXw = facing === 1 ? meta.stageRight + 18 : meta.stageLeft - 18;
  const yW = st[1] + 34;                                   // beam height above ground
  const cy = oy + (meta.groundY - yW) * ws;
  const x1 = ox + Math.min(originXw, endXw) * ws, x2 = ox + Math.max(originXw, endXw) * ws, bw = x2 - x1;
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#ff6a5a'; ctx.fillRect(x1, cy - 9 * ws, bw, 18 * ws); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(112,8,24,0.92)'; ctx.fillRect(x1, cy - 6 * ws, bw, 12 * ws);
  ctx.fillStyle = 'rgba(242,34,48,0.96)'; ctx.fillRect(x1, cy - 3.5 * ws, bw, 7 * ws);
  ctx.fillStyle = '#ffe0b8'; ctx.fillRect(x1, cy - 1.2 * ws, bw, 3 * ws);
}

// ENTROPY gravity well (OMEGA).
function drawWell(ctx: CanvasRenderingContext2D, meta: RenderMeta, st: Quad, t: number, ws: number, ox: number, oy: number) {
  const cx = ox + (st[0] + st[2] * 42) * ws, cy = oy + (meta.groundY - 17) * ws;
  const r = (15 + 3 * Math.sin(t / 60)) * ws;
  ctx.fillStyle = 'rgba(112,8,24,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, r + 5 * ws, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(242,34,48,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#120a18'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r - 5 * ws), 0, 7); ctx.fill();
  ctx.fillStyle = '#ffe0b8'; ctx.beginPath(); ctx.arc(cx, cy, 2 * ws, 0, 7); ctx.fill();
}

// WEIGHT OF EVIDENCE (CODEX) — a compact seal whose pulse grows as the dive commits.
function drawEvidence(ctx: CanvasRenderingContext2D, meta: RenderMeta, st: Quad, active: boolean, t: number, ws: number, ox: number, oy: number) {
  const facing = st[2], sealXw = st[0] + facing * (active ? 10 : 22);
  const cx = ox + sealXw * ws, cy = oy + (meta.groundY - 4) * ws;
  const r = (active ? 13 : 8 + 2 * Math.sin(t / 55)) * ws;
  const castX = ox + (st[0] + facing * 5) * ws, castY = oy + (meta.groundY - st[1] - 10) * ws;
  ctx.save();
  ctx.strokeStyle = active ? '#e0fff2' : '#3ee2d2'; ctx.lineWidth = Math.max(2, 1.5 * ws);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#f48e3a'; ctx.lineWidth = Math.max(1, ws);
  ctx.beginPath(); ctx.arc(cx, cy, r + 4 * ws, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - 5 * ws); ctx.lineTo(cx, cy + 5 * ws); ctx.stroke();
  ctx.setLineDash([2 * ws, 3 * ws]); ctx.strokeStyle = '#3ee2d2';
  ctx.beginPath(); ctx.moveTo(castX, castY); ctx.lineTo(cx, cy); ctx.stroke();
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, meta: RenderMeta, f: Frame) {
  const pad = 26, barH = 15, barY = 20, half = CW / 2 - pad - 34;
  const bar = (x: number, hp: number, right: boolean) => {
    ctx.fillStyle = '#2a1414'; ctx.fillRect(x, barY, half, barH);
    const w = half * Math.max(0, Math.min(100, hp)) / 100;
    ctx.fillStyle = hp > 30 ? '#7bd94a' : '#e0483f';
    ctx.fillRect(right ? x + (half - w) : x, barY, w, barH);
    ctx.strokeStyle = '#0b0812'; ctx.lineWidth = 2; ctx.strokeRect(x, barY, half, barH);
  };
  bar(pad, f.a[3], true);
  bar(CW - pad - half, f.b[3], false);
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 20px ui-monospace, monospace'; ctx.fillStyle = '#f5d94a';
  ctx.textAlign = 'left'; ctx.fillText(meta.aName, pad, barY + barH + 22);
  ctx.textAlign = 'right'; ctx.fillText(meta.bName, CW - pad, barY + barH + 22);
  ctx.textAlign = 'center'; ctx.fillStyle = '#9a8fb5'; ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText(f.ph === 'fight' ? `ROUND ${f.rd + 1}` : f.ph.toUpperCase(), CW / 2, barY + 13);
  if (f.msg) {
    ctx.font = '800 40px ui-monospace, monospace';
    ctx.fillStyle = '#17131f'; ctx.fillText(f.msg, CW / 2 + 2, CH * 0.42 + 2);
    ctx.fillStyle = '#f5d94a'; ctx.fillText(f.msg, CW / 2, CH * 0.42);
  }
}

/** Draw one frame. `t` is a monotonically increasing tick used only for ambient effect motion. */
export function drawFrame(ctx: CanvasRenderingContext2D, meta: RenderMeta, f: Frame, imgs: Map<string, HTMLImageElement>, stageImg: HTMLImageElement | null, t: number) {
  const ws = Math.min(CW / meta.worldW, CH / meta.worldH);
  const ox = (CW - meta.worldW * ws) / 2, oy = (CH - meta.worldH * ws) / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0812'; ctx.fillRect(0, 0, CW, CH);
  if (imgOk(stageImg)) ctx.drawImage(stageImg!, ox, oy, meta.worldW * ws, meta.worldH * ws);
  for (const st of [f.a, f.b]) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(ox + st[0] * ws, oy + (meta.groundY + 1) * ws, 13 * ws, 4 * ws, 0, 0, 7); ctx.fill();
  }
  // wells and evidence seals behind fighters; beams + projectiles in front
  if (f.aa === 'entropy' && f.aAct) drawWell(ctx, meta, f.a, t, ws, ox, oy);
  if (f.ba === 'entropy' && f.bAct) drawWell(ctx, meta, f.b, t, ws, ox, oy);
  if (f.aa === 'mergecomet') drawEvidence(ctx, meta, f.a, f.aAct, t, ws, ox, oy);
  if (f.ba === 'mergecomet') drawEvidence(ctx, meta, f.b, f.bAct, t, ws, ox, oy);
  drawFighter(ctx, meta, 'a', f, imgs, ws, ox, oy);
  drawFighter(ctx, meta, 'b', f, imgs, ws, ox, oy);
  if (f.aa === 'testimony' && f.aAct) drawBeam(ctx, meta, f.a, ws, ox, oy);
  if (f.ba === 'testimony' && f.bAct) drawBeam(ctx, meta, f.b, ws, ox, oy);
  for (const [px, py, , style] of f.pr) {
    const cx = ox + px * ws, cy = oy + (meta.groundY - py) * ws;
    ctx.fillStyle = projColor(style);
    ctx.beginPath(); ctx.arc(cx, cy, 5 * ws, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(cx, cy, 8.5 * ws, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  drawHud(ctx, meta, f);
}

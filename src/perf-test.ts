import { makeFighter, makeMatch } from './game/engine.js';
import { composeScene } from './game/scene.js';
const a = makeFighter('a', 'BLANKO', 'a'), b = makeFighter('b', 'CHONG', 'b');
a.pose = 'kick'; b.pose = 'block';
const m = makeMatch(a, b); m.phase = 'fight';
for (const [w, h, label] of [[240, 136, '120x34 normal'], [480, 272, '240x68 zoom2x'], [720, 400, '360x100 zoom3x']] as const) {
  composeScene(m, w, h); // warm
  const t = Date.now();
  for (let i = 0; i < 30; i++) { a.animT++; composeScene(m, w, h); }
  const ms = (Date.now() - t) / 30;
  console.log(`${label} (${w}x${h}px): ${ms.toFixed(1)} ms/frame  (${(1000 / ms).toFixed(0)} fps headroom)`);
}

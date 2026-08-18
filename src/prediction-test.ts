// Verifies client-side prediction. The core correctness property: predicting the
// local fighter (with the opponent frozen at the authoritative position) yields
// the SAME result as the authoritative server sim — so when the worker reconciles
// against the authority, the local fighter doesn't jitter.
import { makeFighter, makeMatch, stepMatch, predictLocal } from './game/engine.js';
import { emptyInputs, type Match } from './game/types.js';

let pass = true;
const check = (n: string, c: boolean, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}  ${x}`); if (!c) pass = false; };
const mk = (): Match => { const m = makeMatch(makeFighter('a', 'BYU', 'a'), makeFighter('b', 'MEN', 'b')); m.phase = 'fight'; m.phaseTimer = 0; m.message = ''; m.a.x = 45; m.b.x = 205; return m; };

// 1) exactness: local prediction == authority for the local fighter (no hits, so
//    the opponent stays put in both) → reconciliation is drift-free.
{
  const auth = mk(), pred = mk();
  let drift = 0, moved = 0;
  for (let i = 0; i < 90; i++) {
    const inp = emptyInputs(); inp.moveX = (i % 24 < 12) ? 1 : -1; if (i % 17 === 0) inp.punch = true; if (i % 30 === 10) inp.jump = true;
    stepMatch(auth, inp, emptyInputs());   // server: a's input, b idle (far away → no hits)
    predictLocal(pred, 'a', inp);          // client: a's input, b frozen
    drift = Math.max(drift, Math.abs(auth.a.x - pred.a.x), Math.abs(auth.a.y - pred.a.y));
    moved = Math.max(moved, Math.abs(pred.a.x - 45));
  }
  check('prediction matches the server exactly (drift ~0)', drift < 0.001, `max drift=${drift.toFixed(5)}`);
  check('prediction actually moves the local fighter', moved > 8, `moved ${moved.toFixed(1)}px`);
}

// 2) reconcile loop: simulate a worker predicting ahead of an authority that lags
//    by `LAG` ticks, replaying un-acked inputs. The rendered local fighter should
//    track the authority with no accumulating error.
{
  const LAG = 3;
  const authMatch = mk();
  const inputs: { seq: number; input: ReturnType<typeof emptyInputs> }[] = [];
  let seq = 0, maxErr = 0;
  const authInputs: ReturnType<typeof emptyInputs>[] = [];
  for (let t = 0; t < 120; t++) {
    const inp = emptyInputs(); inp.moveX = (t % 20 < 10) ? 1 : -1;
    seq++; inputs.push({ seq, input: inp });        // client sends + buffers
    authInputs.push(inp);
    // authority applies inputs LAG ticks late
    let ack = 0;
    if (t >= LAG) { stepMatch(authMatch, authInputs[t - LAG]!, emptyInputs()); ack = seq - LAG; }
    // client reconciles: authoritative base + replay pending (seq > ack)
    const pending = inputs.filter((p) => p.seq > ack);
    const pred = mk(); pred.a.x = authMatch.a.x; pred.a.y = authMatch.a.y; pred.a.vx = authMatch.a.vx; pred.a.vy = authMatch.a.vy; pred.a.facing = authMatch.a.facing;
    for (const p of pending) predictLocal(pred, 'a', p.input);
    // once authority catches up (drop old pending) the rendered pos should lead
    // the authority by exactly LAG ticks of the same input — finite, non-growing.
    if (t > 30) maxErr = Math.max(maxErr, Math.abs(pred.a.x - authMatch.a.x));
  }
  check('reconciled prediction leads the authority by a bounded, non-growing amount', maxErr < 40, `max lead=${maxErr.toFixed(1)}px over ${LAG} ticks`);
}

console.log(pass ? '\nPREDICTION TEST: PASS' : '\nPREDICTION TEST: FAIL');
process.exit(pass ? 0 : 1);

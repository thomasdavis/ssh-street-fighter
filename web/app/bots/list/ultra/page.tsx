import Link from 'next/link';
import { Footer, SiteNav } from '@/components/ui';

export const metadata = {
  title: 'Ultra bot',
  description: 'A technical dossier for Ultra, the recurrent self-play policy fighting live on SSH Fighter.',
  alternates: { canonical: '/bots/list/ultra' },
};

const observationGroups = [
  ['Geometry', '0–5', 'Facing-canonical relative position and velocity, horizontal distance and vertical separation.'],
  ['Resources', '6–8', 'Self health, opponent health and signed health advantage, each normalized to the game scale.'],
  ['Body state', '9–16', 'Stun, airborne, active-attack, casting and crouching indicators for the two fighters.'],
  ['Opponent attack', '17–22', 'A four-way attack category plus both fighters’ normalized attack-frame counters.'],
  ['Identity', '23–24', 'Facing direction and Ultra’s current fighter index across the 17-character roster.'],
  ['Reserved', '25–27', 'Present in the ULM2 tensor contract but currently written as zero by the production encoder.'],
];

const trainingStages = [
  ['01', 'Roll out', 'Six exact-engine workers collect 70 matches each, producing 420 recurrent trajectories per training iteration. Self and opponent fighters are sampled across the full roster.'],
  ['02', 'Choose rivals', 'Prioritized fictitious self-play samples recent historical snapshots, the latest snapshot and a pinned champion. Approximate opponent weight is (1 − win rate)² + 0.03.'],
  ['03', 'Estimate credit', 'The trainer predicts values, computes generalized advantage estimates with γ = 0.997 and λ = 0.95, then normalizes advantages over the batch.'],
  ['04', 'Update', 'Five recurrent PPO epochs use 200-step truncated sequences, a 0.2 policy clip, clipped value loss, entropy bonus, Adam and a global gradient-norm cap of 1.0.'],
  ['05', 'Snapshot', 'Every third global iteration becomes a historical opponent. The league retains recent versions so improvement against one checkpoint cannot erase all older pressure.'],
  ['06', 'Challenge live', 'A candidate must beat the deployed checkpoint and clear a separate fundamentals suite before the service swaps its weight artifact. The outgoing model is archived.'],
];

const evidence = [
  ['Implemented', 'The production path is a single-layer GRU actor trained in PyTorch and evaluated by a handwritten C implementation of the same gate equations. The live artifact contains no Python or Torch runtime.'],
  ['Operational', 'ajax-bot-ultra is an active resident service. The current ULM2 artifact is used for 30 Hz wire decisions by the native runtime, whose compiler now covers all 51 specials across 17 fighters.'],
  ['Measured', 'A release-audit invariant exposed seat bias in the legacy evaluator: an identical checkpoint scored 100% against itself. The repaired evaluator scores self-play at 50%; its first live challenger also scored 50% and was correctly held.'],
  ['Not established', 'Legacy promotion percentages are therefore withdrawn as strength evidence. The repaired gate does not yet report per-matchup confidence intervals or fresh-exploiter robustness, and Ultra’s state still resets between rounds.'],
];

function UltraDiagram() {
  return (
    <div className="bots-diagram" aria-label="Ultra information flow" role="img">
      <div className="bots-diagram__input"><span>WIRE STATE · 30 HZ</span><b>28-float actor-visible observation</b><small>25 populated features + 3 reserved zeros</small></div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__split">
        <div><span>RECURRENT CORE</span><b>GRU · 384 state units</b><small>tactical memory within the current round</small></div>
        <div><span>POLICY READOUT</span><b>16 logits</b><small>9 locomotion + 7 combat</small></div>
      </div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__tissue">
        <div className="bots-diagram__cells" aria-hidden="true">
          {Array.from({ length: 36 }, (_, index) => <i key={index} />)}
        </div>
        <div><span>FACTORISED ACTION</span><b>9 × 7 = 63 semantic combinations</b><small>independent argmax heads · facing-relative movement</small></div>
      </div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__output"><span>NATIVE COMPILER</span><b>semantic commitment → SSH Fighter input</b><small>deterministic C inference and motion compilation</small></div>
    </div>
  );
}

export default function UltraPage() {
  return (
    <div className="rs bots-page bots-page--ultra">
      <SiteNav active="/bots" />
      <main className="rs-wrap bots-wrap">
        <header className="bots-hero">
          <div className="bots-hero__copy">
            <p className="bots-kicker">Live universal bot · recurrent PPO / native C inference</p>
            <h1>ULTRA</h1>
            <p className="bots-deck">A compact recurrent policy trained through exact-engine league self-play, then stripped down to a deterministic C actor that can pilot every SSH Fighter character through one semantic control interface.</p>
            <div className="bots-actions">
              <Link className="rs-btn" href="/bots/list">All resident bots</Link>
              <Link className="rs-btn ghost" href="/players/ajax-bot-ultra">Live player record</Link>
            </div>
          </div>
          <UltraDiagram />
        </header>

        <section className="bots-facts" aria-label="Ultra production artifact facts">
          <article><span>Deployed actor</span><b>483,088</b><small>float32 learned parameters</small></article>
          <article><span>Recurrent state</span><b>384</b><small>single-layer GRU units</small></article>
          <article><span>Semantic control</span><b>63</b><small>9 locomotion × 7 combat</small></article>
          <article><span>Runtime</span><b>Pure C</b><small>ULM2 artifact · no Torch</small></article>
        </section>

        <section className="bots-section bots-intro">
          <div className="bots-index">00 / ACTUAL SYSTEM</div>
          <div>
            <p className="bots-overline">The deployed model, separated from the roadmap</p>
            <h2>One recurrent actor. Seventeen bodies.</h2>
            <div className="bots-columns">
              <p>Ultra is deliberately smaller and more conventional than TISSUE-0. Its learned controller is one 384-unit gated recurrent layer followed by a linear policy head. Character identity enters as an observation feature; movement and combat leave through a shared semantic vocabulary. The same actor can therefore rotate through every fighter without maintaining 17 unrelated policies.</p>
              <p>The current live artifact is ULM2 despite retaining the historical filename <code>ultra.ulm1</code>. It is 1,932,364 bytes and has SHA-256 <code>d34e7eab…02c3d8</code>. The deployed actor has 483,088 parameters. Training adds a 385-parameter value head, bringing the actor–critic to 483,473 trainable parameters; that critic is not exported to production.</p>
            </div>
            <p className="bots-note">Ultra’s design documents describe richer projectile encoders, slower opponent memory, action masks and offline search distillation. Those remain research directions. Full 17-fighter special compilation is implemented in the current native runtime.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">01 / OBSERVATION</div>
          <div>
            <p className="bots-overline">A narrow actor-visible contract</p>
            <h2>What the recurrent core can actually see</h2>
            <div className="bots-tensors">
              {observationGroups.map(([name, indices, role]) => (
                <article key={name}><span>{name}</span><b>{indices}</b><p>{role}</p></article>
              ))}
            </div>
            <p className="bots-note">The production encoder does not currently read projectiles, acknowledgement history, round timers, hit-stop, previous actions or opponent character identity. It receives only public fighter state; no hidden simulator fields cross the deployment boundary.</p>
          </div>
        </section>

        <section className="bots-section bots-technical">
          <div className="bots-index">02 / RECURRENCE</div>
          <div>
            <p className="bots-overline">PyTorch semantics, reproduced by hand in C</p>
            <h2>The state transition is the policy’s memory</h2>
            <p>For every observation xₜ, Ultra evaluates reset, update and candidate gates in the same order as a PyTorch GRU. The hidden vector is both the temporal memory and the sole input to the policy readout.</p>
            <div className="bots-equation bots-equation--cyan" role="region" aria-label="Single-layer GRU equations" tabIndex={0}>
              <span>Single-layer GRU</span>
              <code>rₜ = σ(Wᵢᵣxₜ + bᵢᵣ + Wₕᵣhₜ₋₁ + bₕᵣ)</code>
              <code>zₜ = σ(Wᵢzxₜ + bᵢz + Wₕzhₜ₋₁ + bₕz)</code>
              <code>nₜ = tanh(Wᵢₙxₜ + bᵢₙ + rₜ ⊙ (Wₕₙhₜ₋₁ + bₕₙ))</code>
              <code>hₜ = (1 − zₜ) ⊙ nₜ + zₜ ⊙ hₜ₋₁</code>
            </div>
            <div className="bots-tensors">
              <article><span>Input weights</span><b>32,256</b><p>Three gates × 384 units × 28 observation features.</p></article>
              <article><span>Recurrent weights</span><b>442,368</b><p>Three dense 384 × 384 hidden-state transforms.</p></article>
              <article><span>Biases + policy</span><b>8,464</b><p>2,304 GRU biases and a 384 → 16 linear action head.</p></article>
            </div>
            <p className="bots-note">The state resets at match start and when a large health restoration indicates a new round. It provides short-horizon tactical memory inside a round, not persistent opponent modelling across rounds.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">03 / CONTROL</div>
          <div>
            <p className="bots-overline">Factorised semantic action space</p>
            <h2>Sixteen logits express sixty-three commitments</h2>
            <div className="bots-columns">
              <p>The first nine logits choose the Cartesian product of horizontal intent—neutral, toward or away—and vertical posture—standing, crouching or jumping. The remaining seven choose no attack, punch, kick, throw or one of three character-relative special slots.</p>
              <p>Production takes an independent argmax from each head. A deterministic compiler converts toward and away into absolute left or right from current facing, combines posture and combat, and spells supported special motions. There is no stochastic sampling once weights and recurrent state are fixed.</p>
            </div>
            <div className="bots-control-flow" aria-label="Ultra control flow" role="group" tabIndex={0}>
              <span>28 features</span><i>→</i><span>GRU 384</span><i>→</i><span>9 + 7 logits</span><i>→</i><span>two argmax choices</span><i>→</i><span>SSH input</span>
            </div>
            <p className="bots-note">The native table now compiles three canonical specials for each of all 17 fighters, including multi-step FDF and FDB motions. The runtime still lacks a learned or rule-based legal-action mask, so it can spend probability on a move that cannot take effect in the current body state.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">04 / LEAGUE</div>
          <div>
            <p className="bots-overline">Exact-engine recurrent PPO</p>
            <h2>Training against the policy’s own history</h2>
            <div className="bots-stages">
              {trainingStages.map(([number, name, body]) => (
                <article key={number}><i>{number}</i><h3>{name}</h3><p>{body}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">05 / OBJECTIVE</div>
          <div>
            <p className="bots-overline">Dense combat signal, sparse outcome signal</p>
            <h2>Damage shapes tactics; winning closes the loop</h2>
            <p>Each fight frame rewards dealt damage more strongly than it penalizes received damage and charges a small time cost. A terminal match win contributes the outcome bonus. Timeout-capped trajectories receive a smaller terminal-scale contribution so truncated data can still participate without being treated as a fully observed match.</p>
            <div className="bots-equation" role="region" aria-label="Rollout reward equations" tabIndex={0}>
              <span>Rollout reward</span>
              <code>rₜ = 0.012 · damage_dealt − 0.008 · damage_received − 0.001</code>
              <code>r_terminal += won · (1.0 if naturally complete, otherwise 0.4 at the 750-step cap)</code>
            </div>
            <div className="bots-training-grid">
              <article><span>Exploration</span><p>The learner samples both heads with temperature during data collection. Full-roster specials triggered a deliberate re-anneal at iteration 393 from 1.10 toward 0.85.</p></article>
              <article><span>Entropy</span><p>The special-expansion curriculum similarly restarted entropy near 0.040 and decays toward 0.005, forcing the policy to revisit newly effective action slots.</p></article>
              <article><span>Learning rate</span><p>Adam starts at approximately 3 × 10⁻⁴ and linearly anneals to a floor of 1 × 10⁻⁴.</p></article>
              <article><span>Opponent action</span><p>Historical opponents act greedily while the candidate samples, keeping the sampled policy likelihood attributable to the learner alone.</p></article>
            </div>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">06 / PROMOTION</div>
          <div>
            <p className="bots-overline">Automated challenger-to-incumbent release</p>
            <h2>A checkpoint must defeat what is already live</h2>
            <p>The release loop now evaluates a candidate over 100 paired-seat head-to-head games and separately runs a 40-game fundamentals suite. Every character pairing is repeated with candidate and incumbent exchanging seats; draws are half a point. Promotion requires paired score at or above 60% and fundamentals at or above 40%. A 36-minute cooldown bounds service churn, and the outgoing artifact is copied into the champion archive before replacement.</p>
            <div className="bots-gates">
              <span>Current operational gate</span>
              <ul>
                <li>candidate paired H2H ≥ 60% over 100 games</li>
                <li>fundamentals score ≥ 40% over 40 games</li>
                <li>native artifact loads before restart</li>
                <li>outgoing live model retained as champion</li>
                <li>minimum 36 minutes between promotions</li>
                <li>persistent service reconnects to the public queue</li>
              </ul>
            </div>
            <p className="bots-note">The earlier stream of 100% results is retired: candidate always occupied seat A, and self-versus-self incorrectly scored 100%. The repaired invariant is self-versus-self = 50%. Requiring 60/100 gives a Wilson 95% lower bound just above 50% when games are treated as independent, but matchup clustering still demands a stronger future analysis.</p>
          </div>
        </section>

        <section className="bots-section bots-evidence">
          <div className="bots-index">07 / EVIDENCE</div>
          <div>
            <p className="bots-overline">Claims separated by strength</p>
            <h2>What Ultra demonstrates—and what it does not</h2>
            <div className="bots-evidence-grid">
              {evidence.map(([status, body], index) => (
                <article key={status} data-state={index === 3 ? 'open' : 'done'}><span>{status}</span><p>{body}</p></article>
              ))}
            </div>
            <div className="bots-verdict">
              <b>The next scientific upgrade is evaluation, not another headline mechanism.</b>
              <p>Run at least 10,000 matched games across fighter, seat and opponent slices; publish match-clustered intervals; hold out new exploiters; measure recurrent-state interventions; and require worst-slice floors. That would separate genuine general-purpose control from repeatedly overfitting the latest league checkpoint.</p>
              <Link href="/reports">Open the research reports →</Link>
            </div>
          </div>
        </section>

        <section className="bots-section bots-runtime">
          <div className="bots-index">08 / RUNTIME</div>
          <div>
            <p className="bots-overline">A deliberately tiny production boundary</p>
            <h2>Training is Python. Fighting is C.</h2>
            <div className="bots-code">
              <code><span>receive</span> SSH JSON state at the public actor boundary</code>
              <code><span>encode</span> 28 normalized float32 observation values</code>
              <code><span>update</span> one 384-unit GRU step with ULM2 weights</code>
              <code><span>select</span> argmax locomotion and combat decisions</code>
              <code><span>compile</span> facing-relative semantics into wire input</code>
              <code><span>send</span> one JSON action and retain recurrent state</code>
            </div>
            <p>The binary stores no training graph, optimizer, replay buffer or value head. It reads packed float arrays from ULM2 and performs dense loops, sigmoid and tanh directly. At the latest inspection, the resident process used roughly 5 MB of memory. If model loading fails, the binary can fall back to a heuristic controller; the current service log confirms the ULM2 neural path loaded successfully.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">09 / FAILURE MODES</div>
          <div>
            <p className="bots-overline">Where the current version is weakest</p>
            <h2>The dossier is a specification for falsification</h2>
            <div className="bots-training-grid">
              <article><span>Projectile blindness</span><p>A universal fighter cannot be called complete while the live encoder ignores the projectile array. Add permutation-invariant projectile features, then test zoner matchups separately.</p></article>
              <article><span>Unmasked commitments</span><p>All 51 specials compile, but logits are not masked by the current body state. Measure wasted-action rate, then apply the same mask during rollout sampling and PPO likelihood evaluation.</p></article>
              <article><span>Round amnesia</span><p>Resetting hidden state protects stability but prevents opponent habits learned in one round from influencing the next. Evaluate a second slow state before adopting it.</p></article>
              <article><span>Noisy promotion</span><p>Even 100 paired-seat games can be matchup-clustered or schedule-specific. Promotion still needs slice intervals, matchup floors and rollback based on live regressions.</p></article>
            </div>
            <p className="bots-note">Ultra is currently the pragmatic bot: small enough to train continuously, simple enough to export exactly, and strong enough to serve as a moving baseline. Its technical value comes from closing the full self-play-to-native-deployment loop—not from pretending the remaining evaluation gaps are solved.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

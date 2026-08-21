import Link from 'next/link';
import { Footer, SiteNav } from '@/components/ui';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'TISSUE-0 bot',
  description: 'A technical explanation of TISSUE-0, the morphogenetic immune control policy fighting live on SSH Fighter.',
  path: '/bots/list/tissue',
});

const runtimeState = [
  ['Fine tissue', '12 × 12 × 64', 'Fast electrical state shared by local cell updates'],
  ['Morphogens', '12 × 12 × 8', 'Reaction–diffusion fields that influence cell roles'],
  ['Phase memory', '12 × 12 × 2', 'Slow complex field with a differentiable defect map'],
  ['Coarse organs', '3 × 3 × 96', 'Match-scale state with a 16-channel endocrine return path'],
  ['Immune repertoire', '32 clones', '32-D receptors, 48-D adapter codes and concentrations'],
  ['Motor vocabulary', '63 actions', '9 locomotion states × 7 combat commitments'],
];

const tickStages = [
  ['01', 'Encode', 'Parse only actor-visible wire state: both fighters, acknowledgement, phase and up to eight nearest projectiles. Projectile features include relative velocity, eight-frame projection and estimated contact time.'],
  ['02', 'Predict', 'Encode the observation and the residual against the tissue’s previous next-observation prediction. Predictable neutral frames create less internal disturbance than tactical surprise.'],
  ['03', 'Recognise', 'Turn residual plus observation into a normalized antigen. Compare it with 32 learned receptors, subtract receptor similarity and open adaptation in proportion to a learned danger gate.'],
  ['04', 'Compute', 'Run four recurrent tissue microsteps. Spatial, prediction, phase-memory and immune branches update the same 144 cells while coarse organs broadcast a narrow endocrine signal.'],
  ['05', 'Vote', 'Every territory emits semantic action evidence. A differentiable quorum accumulates geographically distributed support and hysteresis discourages frame-to-frame action chatter.'],
  ['06', 'Compile', 'Mask illegal actions, select one of 63 semantic commitments and deterministically compile it into facing-correct movement, buttons and character-specific special motions.'],
];

const evidence = [
  ['Implemented', 'The full developmental, phase-field, clone, condensate, organ and quorum paths execute in the Haskell policy and can be intervened on independently.'],
  ['Operational', 'The promoted checkpoint runs as ajax-tissue through the public SSH wire protocol. Production inference uses an asynchronous latest-observation worker.'],
  ['Measured', 'The current r8 checkpoint passed its declared paired held-out, persistent temporal-lesion and 30 Hz CUDA gates on an RTX 3070 after a 64/64 round-boundary-balanced immune repair.'],
  ['Not established', 'Static results do not yet prove opponent-specific within-match learning. Phase interventions are nearly null, and immune-removal divergence decreased rather than increased after the r8 repair.'],
];

const exampleBot = 'https://github.com/thomasdavis/sshfighter.com/blob/main/examples/bot.mjs';

function TensorDiagram() {
  return (
    <div className="bots-diagram" aria-label="TISSUE-0 information flow">
      <div className="bots-diagram__input"><span>WIRE STATE</span><b>prediction residual</b></div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__split">
        <div><span>ANTIGEN</span><b>32 immune clones</b><small>danger-gated adapters</small></div>
        <div><span>MEMORY</span><b>complex phase field</b><small>persistent defects</small></div>
      </div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__tissue">
        <div className="bots-diagram__cells" aria-hidden="true">
          {Array.from({ length: 36 }, (_, index) => <i key={index} />)}
        </div>
        <div><span>DEVELOPED TISSUE</span><b>144 cells · 4 microsteps</b><small>local branches + transient condensates + 9 coarse organs</small></div>
      </div>
      <div className="bots-diagram__arrow" aria-hidden="true">↓</div>
      <div className="bots-diagram__output"><span>DISTRIBUTED QUORUM</span><b>semantic action → SSH input</b></div>
    </div>
  );
}

export default function BotsPage() {
  return (
    <div className="rs bots-page">
      <SiteNav active="/bots" />
      <main className="rs-wrap bots-wrap">
        <header className="bots-hero">
          <div className="bots-hero__copy">
            <p className="bots-kicker">Live research bot · full Haskell / HaskTorch implementation</p>
            <h1>TISSUE<span>–0</span></h1>
            <p className="bots-deck">Its learned weights do not directly describe one fixed controller. They describe local developmental laws that grow a temporary, opponent-conditioned computational organism at the start of each match.</p>
            <div className="bots-actions">
              <Link className="rs-btn" href="/bots/list">All resident bots</Link>
              <Link className="rs-btn ghost" href="/reports">Read the experiment report</Link>
            </div>
          </div>
          <TensorDiagram />
        </header>

        <section className="bots-facts" aria-label="Production checkpoint facts">
          <article><span>Live checkpoint</span><b>r8</b><small>boundary-balanced immune repair</small></article>
          <article><span>Learned parameters</span><b>5.54M</b><small>one shared genome</small></article>
          <article><span>Development</span><b>28</b><small>pre-fight growth steps</small></article>
          <article><span>Runtime</span><b>30 Hz</b><small>four tissue microsteps / frame</small></article>
        </section>

        <section className="bots-section bots-intro">
          <div className="bots-index">00 / MODEL</div>
          <div>
            <p className="bots-overline">The central distinction</p>
            <h2>The genome is fixed. The organism is not.</h2>
            <div className="bots-columns">
              <p>A conventional policy keeps its architecture fixed and changes only activations. TISSUE-0 begins each match with fighter embeddings, coordinate signals and deterministic seed noise, then applies the same learned local rule across a 12 × 12 field. Reaction, diffusion and hysteretic role updates produce its initial cells, morphogens, phase, energy and phenotypes.</p>
              <p>During play, only temporary state changes: prediction residuals disturb the tissue, clone concentrations shift, slow phase structure accumulates and motor commitments persist. Deployed weights remain frozen—there is no public-match backpropagation and no privileged simulator state.</p>
            </div>
            <div className="bots-equation">
              <span>Developmental update</span>
              <code>mₛ₊₁ = clamp(mₛ + Δt [0.18 ∇²mₛ + tanh Rθ(hₛ, mₛ)])</code>
              <code>qₛ₊₁ = softmax(roleθ(hₛ₊₁, qₛ, mₛ₊₁) + 1.5 log qₛ)</code>
              <small>The logarithmic carry term gives soft phenotype persistence; it is an engineering analogue of fate hysteresis, not a claim of biological fidelity.</small>
            </div>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">01 / SUBSTRATE</div>
          <div>
            <p className="bots-overline">Runtime state, not extra parameters</p>
            <h2>What grows inside a match</h2>
            <div className="bots-tensors">
              {runtimeState.map(([name, shape, role]) => (
                <article key={name}><span>{name}</span><b>{shape}</b><p>{role}</p></article>
              ))}
            </div>
            <p className="bots-note">Every fine cell uses the same convolutional genome. Its function differs because of position, local fields, phenotype probabilities, metabolic state, phase history and the current immune adapter—not because the cell owns unique learned weights.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">02 / ONE FRAME</div>
          <div>
            <p className="bots-overline">Actor-visible inference path</p>
            <h2>From terminal state to fighting input</h2>
            <div className="bots-stages">
              {tickStages.map(([number, name, body]) => (
                <article key={number}><i>{number}</i><h3>{name}</h3><p>{body}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="bots-section bots-technical">
          <div className="bots-index">03 / ADAPTATION</div>
          <div>
            <p className="bots-overline">Danger-gated clonal modulation</p>
            <h2>How it can change strategy without changing weights</h2>
            <p>The antigen encoder combines the current observation with prediction error. Each learned receptor competes for that antigen, similar receptors inhibit one another, and a small concentration floor preserves dormant alternatives. The selected mixture becomes a 48-dimensional adapter that modulates the immune branch of every cell.</p>
            <div className="bots-equation bots-equation--cyan">
              <span>Clone selection</span>
              <code>sⱼ = cos(rⱼ, gₜ) − 0.22 Σₖ cₖ cos(rⱼ, rₖ) + 0.30 μⱼ + 0.40 Vⱼ(gₜ)</code>
              <code>c′ = floor + (1 − 32·floor) softmax(log c + 1.8·σ(dₜ)·s)</code>
              <small>Surprise alone cannot force rapid selection: the learned danger logit dₜ scales the update. Current clone memory decays by 0.995 and accumulates positive affinity at a danger-weighted rate of 0.02.</small>
            </div>
            <div className="bots-adapt-grid">
              <article><span>Fast</span><h3>Electrical tissue</h3><p>Cells and motor commitment react every frame. Four gated recurrent microsteps provide the short tactical timescale.</p></article>
              <article><span>Medium</span><h3>Immune repertoire</h3><p>Clone concentration and affinity memory accumulate evidence for competing opponent counterstrategies.</p></article>
              <article><span>Slow</span><h3>Phase field</h3><p>A two-component field is pumped by danger-weighted antigens and evolves through a Ginzburg–Landau-like local process.</p></article>
              <article><span>Round boundary</span><h3>Replay and mutation</h3><p>Danger-weighted replay mutates selected 48-D adapter codes by at most 0.025 while fast cell state is reduced to 20%.</p></article>
            </div>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">04 / CELL RULE</div>
          <div>
            <p className="bots-overline">One genome, four dendritic branches</p>
            <h2>Local computation with temporary long-range organs</h2>
            <div className="bots-branches">
              <article><i>S</i><div><h3>Spatial</h3><p>A padded 3 × 3 convolution reads neighboring electrical state.</p></div></article>
              <article><i>P</i><div><h3>Prediction</h3><p>A local 1 × 1 branch receives the broadcast residual encoding.</p></div></article>
              <article><i>M</i><div><h3>Memory</h3><p>Cells read complex phase plus the winding-based defect detector.</p></div></article>
              <article><i>I</i><div><h3>Immune</h3><p>The active clone mixture is decoded and broadcast into every cell.</p></div></article>
            </div>
            <p>The branches, phenotype probabilities, energy and a 16-channel endocrine field enter a shared gated soma. Eight soft condensate assignments pool compatible cells across the grid and redistribute their state; danger gates this expensive long-range path. A 3 × 3 organ field separately compresses local state and returns a narrow coarse signal.</p>
            <div className="bots-equation">
              <span>Shared soma</span>
              <code>hᵢ′ = tanh(hᵢ + 0.052 · sigmoid(gᵢ) · tanh(Δhᵢ))</code>
              <code>inputᵢ = [spatialᵢ, predictionᵢ, memoryᵢ, immuneᵢ, 0.35·danger·condensateᵢ, qᵢ, Eᵢ, endocrineᵢ]</code>
            </div>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">05 / CONTROL</div>
          <div>
            <p className="bots-overline">Collective motor readout</p>
            <h2>No single output neuron gets the last word</h2>
            <p>Motor-weighted cells vote inside nine coarse territories. Territorial categorical probabilities are pooled into action support, then mixed with a decaying commitment trace. This implements quorum and hysteresis: beginning an action requires broad support, while continuing an existing commitment is easier than switching.</p>
            <div className="bots-control-flow" aria-label="Motor control flow">
              <span>144 local logits</span><i>→</i><span>9 territorial votes</span><i>→</i><span>quorum + commitment</span><i>→</i><span>1 of 63 actions</span><i>→</i><span>wire input</span>
            </div>
            <p className="bots-note">The action space is deliberately semantic. The organism chooses “jump toward + kick” or “away + special 1”; a pinned game contract handles facing and exact motion syntax. That keeps learning focused on tactics rather than protocol spelling.</p>
          </div>
        </section>

        <section className="bots-section">
          <div className="bots-index">06 / TRAINING</div>
          <div>
            <p className="bots-overline">Optimization and release discipline</p>
            <h2>Training can be strange. Promotion cannot be casual.</h2>
            <div className="bots-training-grid">
              <article><span>Teacher data</span><p>Exact-engine trajectories provide next-state, opponent-action, contact, danger and semantic action targets across fighters and styles.</p></article>
              <article><span>Multi-objective loss</span><p>Policy, value, prediction, opponent, danger, contact, lesion repair, homeostasis, repertoire and communication terms are optimized jointly or through narrow frozen-path repairs. In r8, 157,024 immune parameters moved while the other 5.38M stayed frozen.</p></article>
              <article><span>Damage curriculum</span><p>Training masks cell state; evaluation erases both random cells and contiguous regions at 10%, 20% and 30%.</p></article>
              <article><span>Paired promotion</span><p>Incumbent and candidate must use the same data, sequence length, batch, seed, architecture, parameter count and temporal intervention protocol.</p></article>
            </div>
            <p className="bots-note">The r8 curriculum used 128 sequences of 32 frames: 64 crossed a real round boundary and 64 remained within a round. This corrects a coverage failure in the ordinary eight-frame pool, where only 2,014 of 464,850 training windows crossed rounds. It improved the release objective and opponent prediction, but did not increase causal policy dependence on immune state.</p>
            <div className="bots-gates">
              <span>Candidate release gates</span>
              <ul>
                <li>lower composite held-out loss</li>
                <li>accuracy regression ≤ 1 percentage point</li>
                <li>prediction regression ≤ 15%</li>
                <li>contact regression ≤ 10%</li>
                <li>30% lesion regressions ≤ 5 points</li>
                <li>single-sample CUDA p95 &lt; 33.33 ms</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bots-section bots-evidence">
          <div className="bots-index">07 / EVIDENCE</div>
          <div>
            <p className="bots-overline">Claims separated by strength</p>
            <h2>What exists, what works, and what remains unproved</h2>
            <div className="bots-evidence-grid">
              {evidence.map(([status, body], index) => (
                <article key={status} data-state={index === 3 ? 'open' : 'done'}><span>{status}</span><p>{body}</p></article>
              ))}
            </div>
            <div className="bots-verdict">
              <b>The decisive experiment is still ahead.</b>
              <p>Give the frozen model an unseen opponent habit in round one, then test whether rounds two and three improve. Compare against a parameter-matched GRU, ordinary NCA, no-clone tissue and phase-to-vector replacement, with match-clustered uncertainty and exact-simulator counterfactual checks.</p>
              <Link href="/reports">See current measurements, hashes and falsification criteria →</Link>
            </div>
          </div>
        </section>

        <section className="bots-section bots-runtime">
          <div className="bots-index">08 / RUNTIME</div>
          <div>
            <p className="bots-overline">Deployment boundary</p>
            <h2>Haskell all the way to the fight</h2>
            <div className="bots-code">
              <code><span>state</span>  ← receive SSH JSON</code>
              <code><span>features</span> ← encodeObservation contract state</code>
              <code><span>output</span> ← tissueStep False config genome features organism</code>
              <code><span>action</span> ← compileAction contract fighter facing (argmax policy)</code>
              <code><span>send</span> action</code>
            </div>
            <p>The live process uses Haskell concurrency to keep only the newest pending observation while inference runs. Acknowledgements are read back from the public protocol, illegal actions are masked, and the service reconnects without changing checkpoint weights. CUDA on an RTX 3070 is used for training and controlled evaluation; the promoted public worker currently runs CPU inference.</p>
          </div>
        </section>

        <section className="bots-section bots-build">
          <div className="bots-index">09 / BUILD</div>
          <div>
            <p className="bots-overline">The same public interface TISSUE-0 uses</p>
            <h2>Bring your own fighter</h2>
            <p>Bots are labeled SSH Fighter players: their identity is an SSH key, they can choose the open, human, or bot opponent pool, and their matches count in the Open League. Give each bot a dedicated key so its handle, Elo and record stay isolated.</p>
            <div className="bots-build-grid">
              <article><i>01</i><h3>Create an identity</h3><pre><code>ssh-keygen -t ed25519 -f ./mybot -N &apos;&apos;{`\n`}ssh -i ./mybot -o IdentitiesOnly=yes mybot@sshfighter.com</code></pre></article>
              <article><i>02</i><h3>Open the play channel</h3><pre><code>ssh -T -i ./mybot -o IdentitiesOnly=yes mybot@sshfighter.com play</code></pre></article>
              <article><i>03</i><h3>Stream JSON lines</h3><pre><code>{`{"t":"queue","char":"BYU","opponents":"all"}\n{"t":"input","moveX":1,"punch":true}\n{"t":"leave"}`}</code></pre></article>
            </div>
            <div className="bots-protocol">
              <div><span>Receive</span><p><code>welcome</code>, <code>matchStart</code>, a 30 Hz stream of perspective-normalized <code>state</code> objects, then <code>matchEnd</code>.</p></div>
              <div><span>Send</span><p><code>queue</code>, then per-tick <code>input</code> with movement, crouch, jump, punch, kick, throw and an optional motion string.</p></div>
              <div><span>Reproduce</span><p>Log the engine, source commit and build identifiers supplied by the server so every result remains tied to exact mechanics.</p></div>
            </div>
            <a className="rs-btn ghost" href={exampleBot} target="_blank" rel="noreferrer">Read the dependency-free example bot →</a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

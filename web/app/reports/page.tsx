import { Footer, SiteNav } from '@/components/ui';

export const metadata = {
  title: 'TISSUE-0 scientific report',
  description: 'Hypotheses, methods, results, deployment evidence and falsification criteria for the TISSUE-0 SSH Fighter bot.',
};

const sources = [
  {
    name: 'BraiNCA · arXiv 2026',
    href: 'https://arxiv.org/abs/2604.01932',
    note: 'Long-range NCA wiring is not uniformly beneficial; task-shaped topology and controlled robustness ablations matter.',
  },
  {
    name: 'HCPI · ICML 2015',
    href: 'https://proceedings.mlr.press/v37/thomas15.html',
    note: 'Policy improvement is evaluated against an explicit confidence requirement rather than an unconstrained point estimate.',
  },
  {
    name: 'Anytime Safe RL · RLC 2025',
    href: 'https://proceedings.mlr.press/v283/mestres25a.html',
    note: 'Safety constraints can be framed as requirements throughout learning, not merely at the final policy; TISSUE uses empirical gates rather than claiming these guarantees.',
  },
  {
    name: 'ATAN · TMLR 2025',
    href: 'https://proceedings.mlr.press/v304/xu26a.html',
    note: 'Continual test-time adaptation must address forgetting, motivating narrow frozen-base repair and paired evaluation.',
  },
  {
    name: 'HOP · ICML 2024',
    href: 'https://proceedings.mlr.press/v235/huang24p.html',
    note: 'Hierarchical opponent beliefs are updated within and across episodes and used for response planning.',
  },
  {
    name: 'TIPR · ICML 2025',
    href: 'https://proceedings.mlr.press/v267/jing25a.html',
    note: 'Opponent-conditioned, fixed-horizon value estimates gate test-time policy refinement.',
  },
  {
    name: 'RP-Regret · COLT 2026',
    href: 'https://proceedings.mlr.press/v336/liu26c.html',
    note: 'Repeated-game regret must account for adaptive opponents responding to interaction history.',
  },
];

const hypotheses = [
  ['H1 · temporal coverage', 'A boundary-balanced 32-frame curriculum should train replay maturation and persistent opponent state more directly than random eight-frame windows, only 0.43% of which cross rounds.'],
  ['H2 · constrained release', 'An immune-path update is insufficient for release unless paired composite, policy, prediction, contact, lesion and 30 Hz constraints also pass.'],
  ['H3 · mechanism use', 'If the repair strengthens useful clonal adaptation, persistent immune removal should cause more policy divergence than it does in the r7 incumbent.'],
];

const mechanisms = [
  ['Development', '28 learned reaction–diffusion steps grow a 12 × 12 tissue from fighter-conditioned seed signals.'],
  ['Prediction', 'Residual coding and exact-engine contact labels represent surprise and projected harm.'],
  ['Memory', 'A slow two-component phase field persists when fast electrical state resets between rounds.'],
  ['Adaptation', '32 danger-gated clones modulate the shared local rule and mature at round boundaries.'],
  ['Coordination', 'Threat-matched condensates add temporary long-range links across otherwise local tissue.'],
  ['Control', 'Geographically distinct motor regions must reach quorum before a semantic action is compiled.'],
];

export default function ReportsPage() {
  return (
    <div className="rs report">
      <SiteNav />
      <main className="rs-wrap report__wrap">
        <header className="report-hero">
          <div>
            <p className="report-kicker">Experimental report · 21 August 2026 · revision 5</p>
            <h1>TISSUE<span>–0</span></h1>
            <p className="report-deck">A morphogenetic control policy with opponent-conditioned development and within-match immune adaptation.</p>
          </div>
          <div className="report-status" aria-label="Experimental status">
            <span className="report-status__light" />
            <div><b>r8 promoted</b><small>boundary-balanced immune repair · RTX 3070</small></div>
          </div>
        </header>

        <section className="report-metrics" aria-label="Current production metrics">
          <article><span>Parameters</span><b>5,541,093</b><small>shared Haskell tissue rule</small></article>
          <article><span>Training</span><b>1.335M</b><small>cumulative sequence transitions</small></article>
          <article><span>Accuracy</span><b>58.54%</b><small>paired fresh-v5 rescore, n = 4,096</small></article>
          <article><span>CUDA p95</span><b>25.85 ms</b><small>RTX 3070 · 33.33 ms bound</small></article>
        </section>

        <section className="report-section report-abstract">
          <div className="report-index">00 / ABSTRACT</div>
          <div>
            <h2>Question, intervention, result</h2>
            <p><b>Question.</b> Can a frozen-base, boundary-balanced curriculum improve the opponent-sensitive immune path without destabilizing the other 5.38 million parameters—and does it make the policy rely more strongly on immune state?</p>
            <p><b>Intervention.</b> Candidate r8 started from production r7. It trained 157,024 parameters—clone receptors and codes, antigen and causal-prior heads, adapter decoder and local immune branch—on 64 round-crossing plus 64 within-round sequences of length 32. Sensory, phase, organ, soma, predictor, danger and motor parameters were gradient-frozen.</p>
            <p><b>Result.</b> On the same 4,096 held-out release windows, r8 reduced composite loss 0.138%, opponent loss 1.128%, policy loss 0.022% and repair loss 0.451%. Accuracy was unchanged; random and contiguous 30% lesion agreement improved 0.037 and 0.012 points. RTX 3070 p95 remained 25.85 ms.</p>
            <p className="report-caveat"><b>Conclusion.</b> r8 cleared the paired gates and was atomically promoted. H1 improved ordinary predictive and release metrics; H2 passed. H3 did not: immune-removal mean total variation fell from 0.342% to 0.328%. This release is not evidence of stronger within-match counterstrategy formation.</p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">01 / HYPOTHESES</div>
          <div>
            <h2>Claims stated before deployment</h2>
            <div className="report-hypotheses">
              {hypotheses.map(([name, body]) => (
                <article key={name}><h3>{name}</h3><p>{body}</p></article>
              ))}
            </div>
            <p className="report-caveat">These engineering hypotheses were stated before the full 4,096-window paired run but were not independently preregistered. H1 was supported only in the narrow sense of better opponent prediction and release loss; H2 passed. H3 failed directionally: the measured immune intervention effect became smaller.</p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">02 / METHODS</div>
          <div>
            <h2>Experimental protocol</h2>
            <dl className="report-methods">
              <div><dt>Model</dt><dd>12 × 12 × 64 fine tissue; 8 morphogens; 2 phase channels; 3 × 3 × 96 organ field; 32 clones; 4 microsteps; 5,541,093 parameters.</dd></div>
              <div><dt>Starting point</dt><dd>Promoted <code>balanced-v5-danger-r7a</code>, 1,331,200 cumulative transitions; genome SHA-256 <code>15ee8b7b…b0</code>.</dd></div>
              <div><dt>Corpus</dt><dd>612 exact-engine matches / 1,224 paired-side <code>sf-6</code> episodes; all 17 fighters; nine styles; deterministic match-ID 90/10 split; SHA-256 <code>f571f7e0…2256</code>.</dd></div>
              <div><dt>Coverage audit</dt><dd>464,850 sequence-8 training windows existed, but only 2,014 crossed a round boundary (0.43%). Random short windows underexposed replay maturation and persistent opponent state.</dd></div>
              <div><dt>Immune repair</dt><dd>One epoch; 128 windows × 32 frames; 64 boundary + 64 ordinary; batch 1; learning rate 1×10⁻⁵; seed 113; 157,024 immune-path parameters trainable; 4,096 added transitions.</dd></div>
              <div><dt>Evaluation</dt><dd>Same first 4,096 held-out windows; sequence 8; batch 16; seed 101; identical contract, data, architecture, parameter count and intervention code.</dd></div>
              <div><dt>Temporal ablations</dt><dd><code>persistent-off-policy-sequence-v2</code>: lesions are applied once; phase and immune clamps persist at every step; 64 batches = 1,024 sequences = 8,192 action comparisons.</dd></div>
              <div><dt>Hardware / timing</dt><dd>NVIDIA GeForce RTX 3070 8 GB; driver 575.57.08; LibTorch 2.9.1+cu128; 24 single-sample trials; p95 bound &lt; 33.333 ms.</dd></div>
            </dl>
            <h3 className="report-subhead">Evaluation objective v2</h3>
            <div className="report-equation"><code>ℒ = policy + .50 value + .15 next-state + .15 reward + .10 opponent + .10 danger + .08 contact + .02 repair + .01 homeostasis + .01 repertoire + .005 bottleneck</code></div>
            <p className="report-note">The immune-repair optimizer used the full enriched objective plus <code>.05 opponent</code>. Boundary and ordinary windows alternate deterministically without duplication. The table below re-scores both checkpoints on the ordinary release distribution; all non-immune-path parameters were loaded with gradients disabled during optimization.</p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">03 / RESULTS</div>
          <div>
            <h2>Paired held-out rescore</h2>
            <div className="report-table-wrap">
              <table className="report-table report-table--results">
                <thead><tr><th>Metric</th><th>Incumbent</th><th>Candidate</th><th>Δ candidate</th><th>Direction</th></tr></thead>
                <tbody>
                  <tr><td>Composite loss</td><td>2.320105</td><td>2.316898</td><td>−0.138%</td><td className="positive">better</td></tr>
                  <tr><td>Joint action accuracy</td><td>58.5480%</td><td>58.5480%</td><td>0.000 pp</td><td className="neutral">unchanged</td></tr>
                  <tr><td>Policy loss</td><td>1.801258</td><td>1.800862</td><td>−0.022%</td><td className="positive">better</td></tr>
                  <tr><td>Opponent loss</td><td>2.494978</td><td>2.466834</td><td>−1.128%</td><td className="positive">better</td></tr>
                  <tr><td>Anticipatory-danger loss</td><td>0.478540</td><td>0.478572</td><td>+0.0069%</td><td className="negative">worse</td></tr>
                  <tr><td>Contact loss</td><td>0.2768947</td><td>0.2768937</td><td>−0.0004%</td><td className="positive">better</td></tr>
                  <tr><td>Prediction loss</td><td>0.00992918</td><td>0.00992846</td><td>−0.0073%</td><td className="positive">better</td></tr>
                  <tr><td>Random 30% temporal lesion</td><td>99.2432%</td><td>99.2798%</td><td>+0.037 pp</td><td className="positive">better</td></tr>
                  <tr><td>Contiguous 30% temporal lesion</td><td>98.5840%</td><td>98.5962%</td><td>+0.012 pp</td><td className="positive">better</td></tr>
                  <tr><td>Immune removal · mean TV</td><td>0.3424%</td><td>0.3283%</td><td>−0.0140 pp</td><td className="negative">weaker effect</td></tr>
                  <tr><td>Phase removal · mean TV</td><td>0.00474%</td><td>0.00465%</td><td>−0.00010 pp</td><td className="neutral">near null</td></tr>
                  <tr><td>CUDA p95</td><td>25.8491 ms</td><td>25.8494 ms</td><td>+0.0003 ms</td><td className="positive">both pass</td></tr>
                </tbody>
              </table>
            </div>
            <p className="report-note"><b>Sample:</b> n = 4,096 held-out windows for losses and accuracy. Consecutive windows within matches are correlated; treating them as independent trials would understate uncertainty. No confidence interval or p-value is reported until match-clustered resampling is implemented.</p>
            <div className="report-decision">
              <span>Decision · r8 promoted</span>
              <p>The code-enforced gate required identical evaluation identity, lower composite loss, ≤1-point accuracy regression, ≤15% prediction regression, ≤10% contact regression, ≤5-point random and contiguous 30% lesion regressions, and candidate p95 &lt; 33.333 ms. r8 passed and replaced r7 atomically.</p>
            </div>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">04 / SYSTEM</div>
          <div>
            <h2>Computational mechanisms under test</h2>
            <div className="report-mechanisms">
              {mechanisms.map(([name, body], index) => (
                <article key={name}><i>{String(index + 1).padStart(2, '0')}</i><h3>{name}</h3><p>{body}</p></article>
              ))}
            </div>
            <p className="report-caveat">The biological terms describe computational mechanisms, not claims of biological fidelity. Each unusual substrate remains contingent on matched ablation evidence.</p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">05 / DEPLOYMENT</div>
          <div>
            <h2>Reproducibility and external validity</h2>
            <dl className="report-methods report-methods--compact">
              <div><dt>Runtime</dt><dd>Full Haskell/HaskTorch implementation; engine <code>sf-6</code>; semantic 63-action compiler.</dd></div>
              <div><dt>Contract</dt><dd><code>e66621deb9f8f9da04dd833695ddf6a8a2579ff9c0dee57d853192068043a862</code></dd></div>
              <div><dt>Prior incumbent r7</dt><dd><code>15ee8b7b9fa7de44351879b8616b80dc934ab781b15b46d48010537e12c3d1b0</code></dd></div>
              <div><dt>Promoted r8</dt><dd><code>e67bc07d6bad2548f7bbf01b683faa99f0dfcd16ff0861b88ee656a23b6bf06a</code></dd></div>
              <div><dt>Fresh corpus</dt><dd><code>f571f7e0f6df980144e4104e01e55904ece81b835ef39cf8ffe4382a83cc2256</code></dd></div>
              <div><dt>GPU evaluator</dt><dd><code>760a32999470a2a7ede9db6e61a064caa26126f3be160d162cf917f198c3470a</code></dd></div>
              <div><dt>Candidate report</dt><dd><code>00a88c1e9a1a0396f4b194344086b482255967efacd42a8acef2e46262e8d5b6</code></dd></div>
              <div><dt>Live identity</dt><dd><code>ajax-tissue</code>; asynchronous latest-observation worker; CPU production inference.</dd></div>
            </dl>
            <div className="report-fight">
              <div><span>Production verification · 05:34 UTC</span><b>r8 <em>live</em> as ajax-tissue</b></div>
              <p>The service loaded the promoted genome and rebuilt Haskell runtime, re-established its SSH session, emitted fresh acknowledged frame decisions and recorded zero restarts in the post-promotion check. This establishes transport and inference health only; no r8 win-rate claim is made.</p>
            </div>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">06 / PRIOR WORK</div>
          <div>
            <h2>Primary work used in this iteration</h2>
            <div className="report-sources">
              {sources.map((source) => (
                <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>
                  <span>{source.name}</span><p>{source.note}</p><b aria-hidden="true">↗</b>
                </a>
              ))}
            </div>
            <p className="report-caveat">Inference: explicit opponent intent, short-horizon adaptation gates and repeated-interaction evaluation are useful constraints here. These papers do not validate TISSUE-0&apos;s phase-field, morphogenetic or immune implementation.</p>
          </div>
        </section>

        <section className="report-section report-risks">
          <div className="report-index">07 / LIMITATIONS</div>
          <div>
            <h2>Unresolved claims and falsifiers</h2>
            <ul>
              <li><b>Topological memory</b>Persistent phase removal produced 100% action agreement and 0.0046% mean policy total variation across eight-frame sequences. Hidden-habit and cross-round memory-scramble experiments are required.</li>
              <li><b>Immune causality</b>Persistent immune removal produced 99.78% action agreement and 0.328% mean policy total variation. The effect decreased after immune repair; same-state simulator assays must show that concentrated clones causally improve returns.</li>
              <li><b>Adaptation</b>The decisive test is round-one versus later-round improvement on held-out habits and style switches, not a static imitation score.</li>
              <li><b>Strength</b>The r8 production check establishes transport and inference health, not a population win-rate estimate. Character-stratified league matches and fresh exploiters remain necessary.</li>
              <li><b>Independence</b>Window metrics are temporally clustered. Future uncertainty must resample matches, not individual frames.</li>
              <li><b>Novelty</b>This is a proposed synthesis. Absolute historical novelty requires a formal literature and patent review.</li>
            </ul>
            <div className="report-verdict"><span>Falsification rule</span><p>Remove any mechanism that cannot beat a matched simpler replacement on later-round adaptation, causal counterfactual value, lesion resilience and exploitability under equal parameter and training budgets.</p></div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

import { Footer, SiteNav } from '@/components/ui';

export const metadata = {
  title: 'TISSUE-0 scientific report',
  description: 'Hypotheses, methods, results, deployment evidence and falsification criteria for the TISSUE-0 SSH Fighter bot.',
};

const sources = [
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
  ['H1 · danger', 'Adding exact-engine contact targets at 2, 4, 8 and 16 frames will reduce held-out anticipatory-danger loss.'],
  ['H2 · repertoire', 'Supervising seven four-clone germinal families against opponent combat intent will reduce held-out opponent loss.'],
  ['H3 · lifecycle', 'Training the live replay/maturation transition at per-sample round boundaries will not materially degrade action selection.'],
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
            <p className="report-kicker">Experimental report · 20 August 2026 · revision 2</p>
            <h1>TISSUE<span>–0</span></h1>
            <p className="report-deck">A morphogenetic control policy with opponent-conditioned development and within-match immune adaptation.</p>
          </div>
          <div className="report-status report-status--caution" aria-label="Experimental status">
            <span className="report-status__light" />
            <div><b>Incumbent retained</b><small>candidate rejected after paired evaluation</small></div>
          </div>
        </header>

        <section className="report-metrics" aria-label="Current production metrics">
          <article><span>Parameters</span><b>5,541,093</b><small>shared Haskell tissue rule</small></article>
          <article><span>Training</span><b>1.245M</b><small>exact-engine transitions</small></article>
          <article><span>Accuracy</span><b>34.01%</b><small>objective-v2 rescore, n = 4,096</small></article>
          <article><span>CUDA p95</span><b>22.13 ms</b><small>33.33 ms acceptance bound</small></article>
        </section>

        <section className="report-section report-abstract">
          <div className="report-index">00 / ABSTRACT</div>
          <div>
            <h2>Question, intervention, result</h2>
            <p><b>Question.</b> Can a developed tissue learn opponent-specific danger and counterstrategy signals at round boundaries without an online weight update and without degrading its existing policy?</p>
            <p><b>Intervention.</b> Starting from the deployed checkpoint, one continuation added anticipatory danger targets, opponent-combat clone families and differentiable per-sample replay/maturation during sequence training.</p>
            <p><b>Result.</b> On 4,096 held-out windows, opponent loss fell 2.91%, danger loss fell 38.82%, and joint action accuracy changed by +0.20 percentage points. Composite loss was 0.004% higher, prediction loss rose 6.27%, and random-lesion agreement declined 2.17 points.</p>
            <p className="report-caveat"><b>Conclusion.</b> The candidate learned both targeted auxiliary signals, but did not demonstrate net policy improvement. It was rejected and did not replace the public checkpoint.</p>
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
            <p className="report-caveat">These hypotheses were specified for this iteration, but the experiment was not preregistered externally. H1 and H2 have direct static evidence; H3 still requires multi-round behavioral trials.</p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-index">02 / METHODS</div>
          <div>
            <h2>Experimental protocol</h2>
            <dl className="report-methods">
              <div><dt>Model</dt><dd>12 × 12 × 64 fine tissue; 8 morphogens; 2 phase channels; 3 × 3 × 96 organ field; 32 clones; 4 microsteps; 5,541,093 parameters.</dd></div>
              <div><dt>Starting point</dt><dd><code>balanced-v4-motor-r2</code>, epoch 7, seed 55, 1,245,184 prior transitions.</dd></div>
              <div><dt>Corpus</dt><dd>1,224 exact-engine <code>sf-6</code> episodes; deterministic episode-ID 90/10 split; corpus SHA-256 <code>5fce3575…b7c0b</code>.</dd></div>
              <div><dt>Intervention</dt><dd>8,192 windows × 8 frames = 65,536 additional transitions; batch 32; AdamW; learning rate 3×10⁻⁵; seed 71; NVIDIA A40.</dd></div>
              <div><dt>Evaluation</dt><dd>Same first 4,096 held-out windows for incumbent and candidate; evaluation seed 101; no optimization on held-out episodes.</dd></div>
              <div><dt>Ablation / timing</dt><dd>Action agreement on 128 samples; 24 single-sample CUDA latency trials; real-time bound p95 &lt; 33.33 ms.</dd></div>
            </dl>
            <h3 className="report-subhead">Objective v2</h3>
            <div className="report-equation"><code>ℒ = policy + .50 value + .15 next-state + .15 reward + .10 opponent + .10 danger + .08 contact + .02 repair + .01 homeostasis + .01 repertoire + .005 bottleneck</code></div>
            <p className="report-note">The opponent term contains <code>0.35 × clone specialization</code>. The historical 3.903 production score used objective v1 and is not compared with v2. Both models below were re-scored under identical v2 code.</p>
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
                  <tr><td>Composite loss</td><td>4.040330</td><td>4.040495</td><td>+0.000165</td><td className="negative">worse</td></tr>
                  <tr><td>Joint action accuracy</td><td>34.01%</td><td>34.21%</td><td>+0.20 pp</td><td className="neutral">near-flat</td></tr>
                  <tr><td>Opponent loss</td><td>3.6533</td><td>3.5468</td><td>−0.1064</td><td className="positive">better</td></tr>
                  <tr><td>Anticipatory-danger loss</td><td>0.2867</td><td>0.1754</td><td>−0.1113</td><td className="positive">better</td></tr>
                  <tr><td>Contact loss</td><td>0.12764</td><td>0.12751</td><td>−0.00013</td><td className="positive">better</td></tr>
                  <tr><td>Prediction loss</td><td>0.01445</td><td>0.01536</td><td>+6.27%</td><td className="negative">worse</td></tr>
                  <tr><td>Random 30% lesion agreement</td><td>98.14%</td><td>95.97%</td><td>−2.17 pp</td><td className="negative">worse</td></tr>
                  <tr><td>Contiguous 30% lesion agreement</td><td>94.53%</td><td>98.44%</td><td>+3.91 pp</td><td className="positive">better</td></tr>
                  <tr><td>CUDA p95</td><td>22.13 ms</td><td>25.45 ms</td><td>+3.31 ms</td><td className="neutral">both pass</td></tr>
                </tbody>
              </table>
            </div>
            <p className="report-note"><b>Sample:</b> n = 4,096 held-out windows for losses and accuracy. Consecutive windows within matches are correlated; treating them as independent trials would understate uncertainty. No confidence interval or p-value is reported until match-clustered resampling is implemented.</p>
            <div className="report-decision">
              <span>Decision · candidate rejected</span>
              <p>The candidate cleared absolute accuracy, lesion and 30 Hz bounds and improved the two targeted losses, but it did not clear the declared composite-loss improvement criterion. Production remains on the hashed incumbent below.</p>
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
              <div><dt>Incumbent</dt><dd><code>d377c5476b8e690bc6c1e5e20a00290e0ec2625cc111d2893b2542afd42dea4d</code></dd></div>
              <div><dt>Rejected candidate</dt><dd><code>2a470b2ff90680e93de10d6ee20760e275df53add844a15ab9c3ef47982dc67f</code></dd></div>
              <div><dt>GPU evaluator</dt><dd><code>7df79c1edd6083cd411f120335871e3452562d3a8f8bb725e438bc6ab56355df</code></dd></div>
              <div><dt>Live identity</dt><dd><code>ajax-tissue</code>; asynchronous latest-observation worker; CPU production inference.</dd></div>
            </dl>
            <div className="report-fight">
              <div><span>Bounded wire smoke · n = 1 match</span><b>ajax-tissue <em>2–0</em> BYU</b></div>
              <p>938 frames; zero damage received; opponent HP minima 1 and 7; 404 attacks, including 369 tissue-selected specials. This establishes end-to-end operability only. It is not a win-rate estimate.</p>
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
              <li><b>Topological memory</b>Immediate phase removal or scrambling left the first action unchanged in this sample. Hidden-habit and cross-round memory-scramble experiments are required.</li>
              <li><b>Immune causality</b>Immediate immune removal also produced near-perfect first-action agreement. Same-state simulator assays must show that concentrated clones causally improve returns.</li>
              <li><b>Adaptation</b>The decisive test is round-one versus later-round improvement on held-out habits and style switches, not a static imitation score.</li>
              <li><b>Strength</b>One successful live match supplies no population estimate. Character-stratified league matches and fresh exploiters remain necessary.</li>
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

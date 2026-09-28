import type React from 'react';
import { ASTEX, ASTEX_CAVEAT, ASTEX_WORDING, IMATINIB } from '../../core/home/homeFacts';

/**
 * PROOF STRIP — the benchmark and the one end-to-end drug run, as numbers.
 * Every value comes from `homeFacts` (committed evidence files). The Astex
 * caveat is printed in the card itself, never in a tooltip.
 */
export function HomeProofStrip(): React.ReactElement {
  const d = ASTEX.denominator;
  return (
    <section className="hp-section hp-proof" aria-labelledby="hp-proof-title" data-testid="home-proof">
      <p className="hp-kicker">Evidence, not adjectives</p>
      <h2 id="hp-proof-title" className="hp-h2">Docking benchmark: Astex Diverse Set, 85 known drug–protein complexes</h2>
      <p className="hp-lede">Success means the top-ranked pose lands within 2 Å of the crystal structure. Every run is kept, including the ones that failed.</p>
      <p className="hp-wording" data-testid="home-astex-wording">{ASTEX_WORDING}</p>

      <div className="hp-proof-grid">
        <article className="hp-stat hp-stat-lead" data-testid="home-astex-gnina">
          <p className="hp-stat-label">Top-1 · GNINA rescoring (Run 7)</p>
          <p className="hp-stat-value">{ASTEX.gninaTop1}<span> / {d}</span></p>
          <p className="hp-caveat" data-testid="home-astex-caveat">{ASTEX_CAVEAT}</p>
        </article>
        <article className="hp-stat" data-testid="home-astex-vina-pooled">
          <p className="hp-stat-label">Top-1 · Vina score, same poses</p>
          <p className="hp-stat-value">{ASTEX.vinaPooledTop1}<span> / {d}</span></p>
          <p className="hp-stat-note">The baseline GNINA is compared against.</p>
        </article>
        <article className="hp-stat" data-testid="home-astex-vina-prereg">
          <p className="hp-stat-label">Top-1 · Vina baseline (Run 3, preregistered)</p>
          <p className="hp-stat-value">{ASTEX.vinaPreregisteredTop1}<span> / {d}</span></p>
          <p className="hp-stat-note">Protocol fixed before the run. The canonical headline.</p>
        </article>
        <article className="hp-stat" data-testid="home-astex-ceiling">
          <p className="hp-stat-label">Sampling ceiling · not a Top-1 result</p>
          <p className="hp-stat-value">{ASTEX.samplingCeiling}<span> / {d}</span></p>
          <p className="hp-stat-note">A pose under 2 Å exists somewhere in the pool. Ranking still has to find it.</p>
        </article>
      </div>

      <div className="hp-run" data-testid="home-imatinib">
        <p className="hp-stat-label">One drug, end to end · imatinib in ABL1 (PDB {IMATINIB.pdbId})</p>
        <ul className="hp-run-facts">
          <li><strong>{IMATINIB.bestVinaKcalMol} kcal/mol</strong> best AutoDock Vina {IMATINIB.vina} score, Meeko {IMATINIB.meeko}, median {IMATINIB.medianRmsdA} Å from the crystal pose</li>
          <li><strong>{IMATINIB.routeSteps}-step route</strong> proposed by {IMATINIB.retroEngine}</li>
          <li><strong>Replay {IMATINIB.replay}</strong>: re-running the retrosynthesis reproduced the recorded route</li>
        </ul>
        <p className="hp-stat-note">Model estimates, labelled MODEL_ESTIMATE. Imatinib is an approved drug, used here because the right answer is known.</p>
      </div>
      <p className="hp-foot">Records: <code>{ASTEX.files.run3}</code>, <code>{ASTEX.files.run7}</code>, <code>{IMATINIB.files.redock}</code>, <code>{IMATINIB.files.retro}</code></p>
    </section>
  );
}

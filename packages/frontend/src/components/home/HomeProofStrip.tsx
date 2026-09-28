import type React from 'react';
import { ASTEX, ASTEX_CAVEAT, ASTEX_WORDING, IMATINIB } from '../../core/home/homeFacts';

/**
 * PROOF PANELS — the Astex benchmark as KPI tiles with bars, and the one
 * end-to-end drug run as metrics. Every value comes from `homeFacts`
 * (committed evidence files). The Astex caveat sits inside the 63/85 tile,
 * never in a tooltip; 81/85 is drawn dashed and labelled a sampling ceiling.
 */

function Kpi({ id, label, value, tag, tone, children }: {
  id: string; label: string; value: number; tag: string; tone: 'lead' | 'base' | 'ceiling'; children?: React.ReactNode;
}): React.ReactElement {
  const d = ASTEX.denominator;
  return (
    <article className={`hp-kpi hp-kpi-${tone}`} data-testid={id}>
      <p className="hp-kpi-label">{label}</p>
      <p className="hp-kpi-value">{value}<span> / {d}</span></p>
      <div className="hp-bar" role="img" aria-label={`${value} of ${d}`}><i style={{ width: `${(100 * value) / d}%` }} /></div>
      <p className="hp-kpi-tag">{tag}</p>
      {children}
    </article>
  );
}

export function HomeProofStrip(): React.ReactElement {
  return (
    <section className="hp-panel hp-span-12" aria-labelledby="hp-proof-title" data-testid="home-proof">
      <header className="hp-panel-head">
        <h2 id="hp-proof-title">Docking benchmark · Astex Diverse Set</h2>
        <span className="hp-panel-meta">85 drug–protein complexes · Top-1 pose &lt; 2 Å</span>
      </header>
      <div className="hp-kpis">
        <Kpi id="home-astex-gnina" label="GNINA rescoring · Run 7" value={ASTEX.gninaTop1} tag="Development result" tone="lead">
          <p className="hp-caveat" data-testid="home-astex-caveat">{ASTEX_CAVEAT}</p>
        </Kpi>
        <Kpi id="home-astex-vina-pooled" label="Vina · same poses" value={ASTEX.vinaPooledTop1} tag="Baseline for GNINA" tone="base" />
        <Kpi id="home-astex-vina-prereg" label="Vina · Run 3" value={ASTEX.vinaPreregisteredTop1} tag="Preregistered headline" tone="base" />
        <Kpi id="home-astex-ceiling" label="Sampling ceiling" value={ASTEX.samplingCeiling} tag="not a Top-1 result" tone="ceiling" />
      </div>
      <p className="hp-wording" data-testid="home-astex-wording">{ASTEX_WORDING}</p>
      <p className="hp-foot">Records: <code>{ASTEX.files.run3}</code> · <code>{ASTEX.files.run7}</code></p>
    </section>
  );
}

export function HomeImatinibPanel(): React.ReactElement {
  return (
    <section className="hp-panel hp-span-5" aria-labelledby="hp-imatinib-title" data-testid="home-imatinib">
      <header className="hp-panel-head">
        <h2 id="hp-imatinib-title">One drug, end to end</h2>
        <span className="hp-panel-meta">imatinib · ABL1 · PDB {IMATINIB.pdbId}</span>
      </header>
      <div className="hp-metrics">
        <div className="hp-metric"><p className="hp-metric-value">{IMATINIB.bestVinaKcalMol}</p><p className="hp-metric-label">kcal/mol · Vina {IMATINIB.vina}</p></div>
        <div className="hp-metric"><p className="hp-metric-value">{IMATINIB.medianRmsdA} Å</p><p className="hp-metric-label">median RMSD to crystal</p></div>
        <div className="hp-metric"><p className="hp-metric-value">{IMATINIB.routeSteps} steps</p><p className="hp-metric-label">route · {IMATINIB.retroEngine}</p></div>
      </div>
      <p className="hp-row"><span className="hp-pill hp-pill-ok">Replay {IMATINIB.replay}</span><span>retrosynthesis re-run reproduced the recorded route</span></p>
      <p className="hp-foot">MODEL_ESTIMATE. Imatinib is an approved drug, used because the right answer is known. Meeko {IMATINIB.meeko}.</p>
    </section>
  );
}

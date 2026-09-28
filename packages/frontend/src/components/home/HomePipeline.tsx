import type React from 'react';

/**
 * PIPELINE — the drug-discovery loop as one line of steps. Presentation only:
 * each step links to the EXISTING screen that shows it, and a step with no
 * dedicated screen is shown without a link rather than with an invented one.
 */

export interface PipelineStep { readonly label: string; readonly hash: string | null; readonly hint: string }

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { label: 'Question', hash: '#/research-console', hint: 'Research Console' },
  { label: 'Target', hash: '#/drug', hint: 'Drug Discovery' },
  { label: 'Candidates', hash: '#/drug', hint: 'Drug Discovery' },
  { label: 'RDKit', hash: '#/molecule', hint: 'Molecule Lab' },
  { label: 'ADMET / Tox', hash: '#/drug', hint: 'Drug Discovery' },
  { label: 'Docking', hash: '#/reviewer', hint: 'Reviewer Room' },
  { label: 'QM / MD', hash: null, hint: 'Worker only' },
  { label: 'Ranking', hash: '#/drug', hint: 'Drug Discovery' },
  { label: 'Falsification', hash: '#/discovery-track', hint: 'Discovery Track' },
  { label: 'Retrosynthesis', hash: '#/reviewer', hint: 'Reviewer Room' },
  { label: 'Evidence', hash: '#/evidence', hint: 'Evidence & Replay' },
  { label: 'Replay', hash: '#/evidence', hint: 'Evidence & Replay' },
  { label: 'Next experiment', hash: '#/research-console', hint: 'Research Console' },
];

export function HomePipeline(): React.ReactElement {
  return (
    <section className="hp-panel hp-span-12" aria-labelledby="hp-pipeline-title" data-testid="home-pipeline">
      <header className="hp-panel-head">
        <h2 id="hp-pipeline-title">Pipeline · question to next experiment</h2>
        <span className="hp-panel-meta">tap a step to open its screen</span>
      </header>
      <ol className="hp-pipeline">
        {PIPELINE_STEPS.map((s, i) => (
          <li key={s.label} className="hp-step">
            {s.hash
              ? <a href={s.hash} title={s.hint}><span className="hp-step-n">{String(i + 1).padStart(2, '0')}</span><span className="hp-step-label">{s.label}</span></a>
              : <span className="hp-step-static" title={s.hint}><span className="hp-step-n">{String(i + 1).padStart(2, '0')}</span><span className="hp-step-label">{s.label}</span></span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

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
    <section className="hp-section" aria-labelledby="hp-pipeline-title" data-testid="home-pipeline">
      <p className="hp-kicker">One loop, every step recorded</p>
      <h2 id="hp-pipeline-title" className="hp-h2">From a question to the next experiment</h2>
      <ol className="hp-pipeline">
        {PIPELINE_STEPS.map((s, i) => (
          <li key={s.label} className="hp-step">
            {s.hash
              ? <a href={s.hash}><span className="hp-step-n">{String(i + 1).padStart(2, '0')}</span><span className="hp-step-label">{s.label}</span></a>
              : <span className="hp-step-static"><span className="hp-step-n">{String(i + 1).padStart(2, '0')}</span><span className="hp-step-label">{s.label}</span></span>}
          </li>
        ))}
      </ol>
      <p className="hp-foot">Each step opens the screen that runs or shows it. QM / MD run in backend workers and have no screen of their own yet.</p>
    </section>
  );
}

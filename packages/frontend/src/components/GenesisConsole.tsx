import { useState } from 'react';
import type React from 'react';
import { runScientificDiscovery } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import { toyAdapters } from '../core/orchestrator/toyAdapters';
import type { DiscoveryRun } from '../core/orchestrator/contracts';
import { VerdictBanner } from './genesis-ui/VerdictBanner';
import { FingerprintChip } from './genesis-ui/FingerprintChip';

/**
 * GENESIS RESEARCH CONSOLE — a read-only projection of one
 * `runScientificDiscovery` pass. This component computes NOTHING: it
 * builds a `ProblemRecord` from the textarea via `parseProblem` (itself
 * fail-closed, no fabrication) and calls the real orchestrator. Every
 * stage shown is exactly what `runScientificDiscovery` returned.
 *
 * SANDBOX: wired to `toyAdapters` — SYNTHETIC_TEST_ONLY fixtures, not real
 * Genesis pipelines (see `toyAdapters.ts`'s own header). The chip below is
 * mandatory, not decorative: a real, PRODUCTION-mode console needs real
 * adapters wired to the actual Genesis modules, which is explicit future
 * work (docs/DECISIONS.md D-055).
 */

const DEFAULT_NL = 'Find a strategy that preserves efficacy but has a better benefit-risk profile.';

export function GenesisConsole(): React.ReactElement {
  const [nl, setNl] = useState(DEFAULT_NL);
  const [run, setRun] = useState<DiscoveryRun | null>(null);

  const start = (): void => {
    const problem = parseProblem(
      `P-${Date.now()}`,
      {
        text: nl,
        objectives: [
          { metric: 'efficacy_delta_pp', direction: 'maximize', floor: -0.1 },
          { metric: 'severe_ae_rr', direction: 'minimize' },
        ],
        constraints: ['legal', 'feasible'],
        harmAxes: ['safety', 'dependence'],
        evidenceMinimum: '>=1 DIRECT_RCT or registered head-to-head',
      },
      toyAdapters.hash,
    );
    setRun(runScientificDiscovery(problem, toyAdapters, 'SYNTHETIC_TEST_ONLY'));
  };

  return (
    <div className="settings-view">
      <section className="settings-section">
        <h2>Genesis Research Console</h2>
        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: 10 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
          <button type="button" className="chip-btn primary" onClick={start}>
            Run full scientific process
          </button>
          <FingerprintChip label="mode" value="SANDBOX: SYNTHETIC_TEST_ONLY adapters" />
        </div>
      </section>

      {run === null && (
        <section className="settings-section">
          <p className="empty-state">Nothing is computed until you click. This screen never shows a result that did not run.</p>
        </section>
      )}

      {run !== null && run.verdict === 'ABORTED' && (
        <section className="settings-section">
          <div className="gu-locked-panel">
            <div className="gu-locked-icon">⛔</div>
            <h3>ABORT: {run.abortReason}</h3>
            <p>{run.stages[0]?.note}</p>
          </div>
        </section>
      )}

      {run !== null && run.verdict !== 'ABORTED' && (
        <>
          <section className="settings-section">
            <h3 className="section-label">Stages</h3>
            <ul className="gu-conjunct-list">
              {run.stages.map((s) => (
                <li key={s.stage} className={`gu-conjunct-item ${s.status === 'OK' ? 'gu-conjunct-held' : 'gu-conjunct-failed'}`}>
                  <span className="gu-conjunct-name">
                    {s.status} — {s.stage}
                  </span>
                  <div className="gu-conjunct-detail">
                    <FingerprintChip label="fp" value={s.fingerprint.slice(0, 10)} />
                    {s.note !== undefined && <span> {s.note}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="settings-section">
            <VerdictBanner label={run.verdict} />
            <p className="gu-hint">
              {run.recipeFingerprint !== undefined
                ? <>RESEARCH RECIPE: READY — fp {run.recipeFingerprint.slice(0, 12)}…</>
                : <>RESEARCH RECIPE: LOCKED — NO_RECIPE_WITHOUT_WINNER</>}
            </p>
            {run.nextExperiment !== undefined && <p className="gu-hint">NEXT EXPERIMENT: {run.nextExperiment}</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <FingerprintChip label="run audit" value={run.auditFingerprint.slice(0, 12)} />
              <FingerprintChip label="mode" value={run.mode} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

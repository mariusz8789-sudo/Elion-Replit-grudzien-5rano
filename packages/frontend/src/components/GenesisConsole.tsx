import { useState } from 'react';
import type React from 'react';
import { runScientificDiscovery } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import { toyAdapters } from '../core/orchestrator/toyAdapters';
import { runGovLowerHarmDiscovery, type ExecutionBlockedResult } from '../core/orchestrator/govLowerHarmDiscovery';
import type { DiscoveryRun } from '../core/orchestrator/contracts';
import { VerdictBanner } from './genesis-ui/VerdictBanner';
import { FingerprintChip } from './genesis-ui/FingerprintChip';
import { EvidenceSourceStatusPanel } from './genesis-ui/EvidenceSourceStatusPanel';

/**
 * GENESIS RESEARCH CONSOLE — a read-only projection of one discovery-run
 * pass. This component computes NOTHING: every stage, verdict, and recipe
 * fingerprint shown below is exactly what the real functions it calls
 * returned — it never fabricates a `WinnerRecord`, a `Recipe`, or evidence.
 *
 * THREE SOURCES, ONE RENDERER (docs/DECISIONS.md D-058, mandate item 18 —
 * minimal UI, not a new engine):
 *  - SANDBOX: `toyAdapters` — SYNTHETIC_TEST_ONLY fixtures, no real Genesis
 *    module underneath (D-055).
 *  - REAL — LOWER-HARM (production data): `runGovLowerHarmDiscovery({mode:
 *    'PRODUCTION'})` — the real pinned ChEMBL/ClinicalTrials.gov pipeline
 *    (D-058). Its honest result is NO_WINNER; this console does not hide
 *    or dress that up.
 *  - REAL — LOWER-HARM (synthetic winner demo): the same real pipeline fed
 *    the `SYNTHETIC_TEST_ONLY`-labelled fixture engineered so a WINNER
 *    genuinely emerges (D-058) — the positive E2E demonstration.
 * All three render through the exact same stage list below; only the
 * adapters (and, for the two REAL sources, the resulting `mode` chip)
 * differ. An `EXECUTION_BLOCKED` result (a real adapter refusing to
 * proceed, e.g. no real TOP2 pair) is rendered explicitly, never silently
 * dropped.
 */

type Source = 'SANDBOX' | 'REAL_PRODUCTION' | 'REAL_SYNTHETIC_WINNER_DEMO';

const DEFAULT_NL = 'Find a strategy that preserves efficacy but has a better benefit-risk profile.';

export function GenesisConsole(): React.ReactElement {
  const [nl, setNl] = useState(DEFAULT_NL);
  const [source, setSource] = useState<Source>('SANDBOX');
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [blocked, setBlocked] = useState<ExecutionBlockedResult | null>(null);

  const start = (): void => {
    setBlocked(null);
    if (source === 'SANDBOX') {
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
      return;
    }
    const result = runGovLowerHarmDiscovery({ mode: source === 'REAL_PRODUCTION' ? 'PRODUCTION' : 'SYNTHETIC_TEST_ONLY', nl });
    if (result.kind === 'EXECUTION_BLOCKED') {
      setRun(null);
      setBlocked(result);
    } else {
      setRun(result);
    }
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
        <div className="gu-locale-switch" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
          {([
            ['SANDBOX', 'SANDBOX (toy adapters)'],
            ['REAL_PRODUCTION', 'REAL — LOWER-HARM (production data)'],
            ['REAL_SYNTHETIC_WINNER_DEMO', 'REAL — LOWER-HARM (synthetic winner demo)'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={source === value ? 'chip-btn primary' : 'chip-btn'} onClick={() => setSource(value)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
          <button type="button" className="chip-btn primary" onClick={start}>
            Run full scientific process
          </button>
          <FingerprintChip
            label="source"
            value={
              source === 'SANDBOX'
                ? 'SANDBOX: SYNTHETIC_TEST_ONLY adapters (no real module underneath)'
                : source === 'REAL_PRODUCTION'
                  ? 'REAL: real ChEMBL + ClinicalTrials.gov pinned data through the real pipeline'
                  : 'REAL PIPELINE, SYNTHETIC_TEST_ONLY evidence (engineered winner demo)'
            }
          />
        </div>
      </section>

      {blocked !== null && (
        <section className="settings-section">
          <div className="gu-locked-panel">
            <div className="gu-locked-icon">⛔</div>
            <h3>EXECUTION_BLOCKED [{blocked.code}]</h3>
            <p>{blocked.error}</p>
            <FingerprintChip label="fp" value={blocked.fingerprint} />
          </div>
        </section>
      )}

      {run === null && blocked === null && (
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

      <EvidenceSourceStatusPanel />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { getExperiment, type SavedExperiment } from '../../core/scienceMemory';
import { ProvenanceBadge } from './provenance';
import {
  buildCaseStudy, listCaseStudyCandidates, replayCaseStudy,
  type CaseStudy, type CaseStudyReplay,
} from './evidenceCaseStudy';

/**
 * EVIDENCE & REPLAY — CASE STUDY (C2, "Evidence & Replay as a product" directive).
 *
 * A standalone, one-page, print/export-friendly screen for an external audience (a pharma R&D
 * auditor, a regulator, an investor): ONE complete, real Evidence Bundle Genesis already produced,
 * shown as Question -> Hypothesis -> Falsification Criterion -> Data -> Verdict -> Provenance ->
 * Replay. This screen computes NOTHING scientific and duplicates no architecture — every field comes
 * from `evidenceCaseStudy.ts`, which itself reads only what `scienceMemory.ts` already persisted and
 * calls only the two replay functions that already exist (`replaySavedRealExperimentVerification`,
 * `replaySavedWorldDiscoveryRun`). Deliberately NOT a modification of `CellLabScreen.tsx` or
 * `RealExperimentPipeline.tsx` — a new, independent view over the same Scientific Memory those
 * screens already write to, so it cannot collide with C1's work on either file.
 *
 * Replay runs LIVE on every selection, in the browser, right before rendering — a DRIFT, BLOCKED, or
 * NOT_REPRODUCIBLE verdict is shown exactly as returned, with the same visual weight as MATCH, never
 * hidden or reworded into something more flattering.
 */

function useLiveCaseStudy(experimentId: string | null): { saved: SavedExperiment | null; caseStudy: CaseStudy | null; replay: CaseStudyReplay | null } {
  return useMemo(() => {
    if (experimentId === null) return { saved: null, caseStudy: null, replay: null };
    const saved = getExperiment(experimentId) ?? null;
    if (saved === null) return { saved: null, caseStudy: null, replay: null };
    const caseStudy = buildCaseStudy(saved);
    if (caseStudy === null) return { saved, caseStudy: null, replay: null };
    return { saved, caseStudy, replay: replayCaseStudy(saved) };
  }, [experimentId]);
}

function ReplayVerdictBlock({ replay }: { replay: CaseStudyReplay }) {
  return (
    <p className={`ecs-replay-line wd-replay-${replay.status}`} data-testid="ecs-replay-verdict">
      <b>{replay.status}</b>
      {' — '}{replay.reason}
    </p>
  );
}

export function EvidenceCaseStudyScreen() {
  // A synchronous lazy initializer, not `useEffect`, so the very first render already reflects
  // Scientific Memory — the same discipline `App.tsx` uses for onboarding state, and what makes this
  // component's real data path exercisable by `renderToStaticMarkup` in tests, not just its empty state.
  const [{ candidates, selectedId }, setPicker] = useState<{ candidates: readonly SavedExperiment[]; selectedId: string | null }>(() => {
    const found = listCaseStudyCandidates();
    return { candidates: found, selectedId: found[0]?.id ?? null };
  });

  const { caseStudy, replay } = useLiveCaseStudy(selectedId);

  return (
    <div className="ecs-screen" data-testid="evidence-case-study-screen">
      <div className="ecs-controls">
        <button type="button" className="gsc-caption" onClick={() => { window.location.hash = '#/cell-lab'; }} data-testid="ecs-back">
          ← Back to Virtual Cell Lab
        </button>
        {candidates.length > 1 && (
          <select
            className="ecs-picker"
            value={selectedId ?? ''}
            onChange={(e) => setPicker((s) => ({ ...s, selectedId: e.target.value }))}
            data-testid="ecs-picker"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.experimentName} — {new Date(c.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        )}
        {caseStudy && (
          <button type="button" onClick={() => window.print()} data-testid="ecs-print">
            Print / Export
          </button>
        )}
      </div>

      {!caseStudy ? (
        <div className="ecs-empty" data-testid="ecs-empty-state">
          <h2>No Evidence Bundle yet</h2>
          <p className="gsc-caption">
            Genesis has not produced a complete, replayable Evidence Bundle in this browser yet. Run a
            Discovery search in Virtual Cell Lab, or enter a real measurement there once a prediction
            exists, then return here — this screen shows the one Genesis actually produced, never a
            placeholder.
          </p>
        </div>
      ) : (
        <article className="ecs-print" data-testid="ecs-case-study">
          <header className="ecs-header">
            <h1>{caseStudy.title}</h1>
            <p className="gsc-caption">
              Record <code>{caseStudy.experimentId}</code> · {new Date(caseStudy.createdAt).toLocaleString()}
            </p>
            <ProvenanceBadge provenance={caseStudy.recordProvenance} testId="ecs-record-provenance" />
          </header>

          <ol className="ecs-chain">
            {caseStudy.steps.map((step) => (
              <li key={step.key} className="ecs-step" data-testid={`ecs-step-${step.key}`}>
                <span className="dl-label">{step.label}</span>
                <div className="ecs-step-body">
                  {step.lines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <section className="ecs-section" data-testid="ecs-provenance-section">
            <span className="dl-label">Provenance</span>
            <p>
              This record is tagged <ProvenanceBadge provenance={caseStudy.recordProvenance} />.
              {caseStudy.kind === 'REAL_VERIFICATION'
                ? ' The prediction it was checked against is SIMULATED (a WorldGraph forecast); the measurement it was checked against is REAL_EXPERIMENTAL (a real, physical reading someone entered) — both are shown above under Data, exactly as recorded, never blended into one number.'
                : ' Every number in this case study, including the Data step above, is SIMULATED — no physical laboratory measurement exists for this record. A real measurement, once entered against a prediction, produces a REAL_EXPERIMENTAL case study like the other kind this screen can show.'}
            </p>
          </section>

          <section className="ecs-section" data-testid="ecs-replay-section">
            <span className="dl-label">Replay</span>
            {replay && <ReplayVerdictBlock replay={replay} />}
            <p className="gsc-caption">
              Computed just now, in this browser, by re-executing the SIMULATED half of this record from
              its own stored inputs and comparing the result against itself — never by reading back a
              stored verdict. Any REAL_EXPERIMENTAL data in this record is never re-executed; a physical
              measurement cannot be replayed, only kept unchanged.
            </p>
          </section>

          <footer className="ecs-footer gsc-caption">{caseStudy.honestyNote}</footer>
        </article>
      )}
    </div>
  );
}

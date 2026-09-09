import { useMemo, useState } from 'react';
import { getExperiment, type SavedExperiment } from '../../core/scienceMemory';
import { buildIntegrityEnvelope } from '../../core/integrity';
import { ProvenanceBadge } from './provenance';
import {
  buildCaseStudy, listCaseStudyCandidates, replayCaseStudy,
  type CaseStudy, type CaseStudyReplay,
} from './evidenceShowcase';

/**
 * EVIDENCE & REPLAY SHOWCASE (C2, "Evidence & Replay as a product" directive).
 *
 * A standalone, one-page, print/export-friendly screen for an external audience (a pharma R&D
 * auditor, a regulator, an investor): ONE complete, real Evidence Bundle Genesis already produced,
 * shown as Question -> Hypothesis -> Falsification Criterion -> Data -> Verdict -> Provenance ->
 * Replay. This screen computes NOTHING scientific and duplicates no architecture — every field comes
 * from `evidenceShowcase.ts`, which itself reads only what `scienceMemory.ts`/`evidencePackStore.ts`
 * already persisted and calls only the replay functions that already exist. Deliberately NOT a
 * modification of `CellLabScreen.tsx` or `RealExperimentPipeline.tsx` — a new, independent view over
 * the same Scientific Memory those screens already write to, so it cannot collide with C1's work on
 * either file (see `docs/MASTER_PRIORITY_GENESIS.md`'s "UPDATE — 2026-09-09" section for the real
 * edit collision on `RealExperimentPipeline.tsx` this screen's own existence is designed to avoid).
 *
 * Replay runs live, in the browser, right before rendering, for the two investigation shapes whose own
 * replay functions genuinely re-execute; the older `evidencePackId` shape can only disclose the
 * verdict its own store computed at save time (`CaseStudyReplay.computedLive` says which happened, and
 * the caption under the verdict always says so in plain words). A DRIFT, BLOCKED, or NOT_REPRODUCIBLE
 * verdict is shown exactly as returned, with the same markup and the same visual weight as MATCH, never
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

function provenanceExplanation(caseStudy: Pick<CaseStudy, 'kind' | 'recordProvenance'>): string {
  switch (caseStudy.kind) {
    case 'REAL_VERIFICATION': {
      const sourceLabel = caseStudy.recordProvenance === 'REFERENCE'
        ? 'REFERENCE (a cited, published figure — not a fresh physical reading)'
        : 'REAL_EXPERIMENTAL (a real, physical reading someone entered)';
      return ` The prediction it was checked against is SIMULATED (a WorldGraph forecast); the measurement it was checked against is ${sourceLabel} — both are shown above under Data, exactly as recorded, never blended into one number.`;
    }
    case 'SIMULATED_DISCOVERY':
      return ' Every number in this case study, including the Data step above, is SIMULATED — no external measurement exists for this record. A real or cited measurement, once entered against a prediction, produces a REAL_EXPERIMENTAL or REFERENCE case study like the other kind this screen can show.';
    case 'LEGACY_EVIDENCE_PACK':
      return " This is a real-engine-executed run from Genesis's earlier Fabric-router investigation flow (the same Evidence Pack `ExperimentPilotScreen.tsx` uses) — genuinely executed, but SIMULATED: no external measurement exists for this record.";
    default:
      return '';
  }
}

/**
 * Wraps the download in an `IntegrityEnvelope` (`core/integrity`) — a SHA-256
 * hash over a canonicalized copy of the payload, so an external auditor can
 * verify the downloaded file was not altered after Genesis produced it,
 * without trusting Genesis's UI to say so. This is an integrity check, not a
 * signature: `verificationInstructions` says so explicitly, and so does the
 * caption under the Download button below.
 */
async function downloadJson(caseStudy: CaseStudy, saved: SavedExperiment): Promise<void> {
  const payload = { caseStudy, record: saved };
  const envelope = await buildIntegrityEnvelope(payload, new Date().toISOString());
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `genesis-evidence-${saved.id.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function EvidenceShowcaseScreen() {
  // A synchronous lazy initializer, not `useEffect`, so the very first render already reflects
  // Scientific Memory — the same discipline `App.tsx` uses for onboarding state, and what makes this
  // component's real data path exercisable by `renderToStaticMarkup` in tests, not just its empty state.
  const [{ candidates, selectedId }, setPicker] = useState<{ candidates: readonly SavedExperiment[]; selectedId: string | null }>(() => {
    const found = listCaseStudyCandidates();
    return { candidates: found, selectedId: found[0]?.id ?? null };
  });

  const { saved, caseStudy, replay } = useLiveCaseStudy(selectedId);

  return (
    <div className="ecs-screen" data-testid="evidence-showcase-screen">
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
          <>
            <button type="button" onClick={() => window.print()} data-testid="ecs-print">
              Print / Export
            </button>
            <button type="button" onClick={() => { if (saved) void downloadJson(caseStudy, saved); }} data-testid="ecs-download-json">
              Download JSON
            </button>
          </>
        )}
      </div>
      {caseStudy && (
        <p className="gsc-caption" data-testid="ecs-integrity-note">
          The downloaded file carries a SHA-256 integrity hash (not a signature) so a reader can verify it was not altered after export — see the file's own <code>verificationInstructions</code> field.
        </p>
      )}

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
              {provenanceExplanation(caseStudy)}
            </p>
          </section>

          <section className="ecs-section" data-testid="ecs-replay-section">
            <span className="dl-label">Replay</span>
            {replay && <ReplayVerdictBlock replay={replay} />}
            <p className="gsc-caption">
              {replay?.computedLive
                ? 'Computed just now, in this browser, by re-executing the SIMULATED half of this record from its own stored inputs and comparing the result against itself — never by reading back a stored verdict. Any REAL_EXPERIMENTAL data in this record is never re-executed; a physical measurement cannot be replayed, only kept unchanged.'
                : "Not recomputed just now: this Evidence Pack's own store only ever discloses the verdict it computed when the pack was saved — a snapshot, not a fresh in-browser re-execution. The reason above states exactly what that stored verdict was."}
            </p>
          </section>

          <footer className="ecs-footer gsc-caption">{caseStudy.honestyNote}</footer>
        </article>
      )}
    </div>
  );
}

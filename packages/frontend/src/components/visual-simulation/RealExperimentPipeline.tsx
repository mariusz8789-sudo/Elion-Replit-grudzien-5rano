import { useState, type ReactNode } from 'react';
import { createRealExperimentRun, type RawMeasurement, type DerivedMeasurement, type RealExperimentRequest } from '../../core/experimentFabric/realExperiment';
import { EXPERIMENT_FABRIC_VERSION } from '../../core/experimentFabric/types';
import type { FalsificationCriterion } from '../../core/experimentFabric/scientificDiscovery';
import type { DiscoveryLoopResult } from '../../core/agent/discoveryLoop';
import {
  buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, replaySavedRealExperimentVerification,
} from '../../core/scienceMemory';
import type { PredictionVerification } from '../../core/agent/predictionVerification';
import { ProvenanceBadge } from './provenance';

/**
 * REAL EXPERIMENT INTERFACE — frontend + wiring (C1, Real Experiment E2E) plus
 * a product/demo-readiness copy pass (C2): the rendered `note` text below is
 * written for the person looking at the live app, not for an engineer reading
 * this file — no source paths or function names in on-screen copy. Engineering
 * detail stays in this doc comment.
 *
 * Target pipeline, per `docs/MASTER_PRIORITY_GENESIS.md`:
 *
 *   Hypothesis -> Prediction -> ExperimentRequest -> Real Experiment -> Raw Data
 *     -> Derived Data -> Evidence -> Falsification/Support -> Memory -> Next Experiment
 *
 * **Now genuinely wired**, not a status placeholder: once a Discovery search on
 * the left has completed (`prediction` below is non-null), this component lets
 * a person type in a REAL, physical reading, assembles it into a
 * `RealExperimentRun` (`createRealExperimentRun`, unmodified), compares it
 * against the SIMULATED prediction (`buildSavedRealExperimentVerification` /
 * `verifyPredictionAgainstRealExperiment` — `evaluateTwoArmRelation`, the same
 * two-arm judge `worldCounterfactual.ts` already uses, against an explicit,
 * human-declared tolerance rather than a fabricated universal threshold), and
 * saves + replays it through Scientific Memory
 * (`saveRealExperimentVerificationToMemory` / `replaySavedRealExperimentVerification`
 * — the fifth investigation shape, alongside `worldDiscovery`, `hypothesisLoop`,
 * `parameterInquiry` and `mechanismComposition`).
 *
 * `prediction` is null until a search completes — every stage past Prediction
 * then stays honestly `not-modelled`, in plain product language, never a source
 * path or function name in the rendered copy. No apparatus, sensor, or
 * laboratory connection exists or is implied: a PERSON reads an instrument and
 * types the number in.
 */

export type PipelineStatus = 'real' | 'approximation' | 'not-modelled';

const STATUS_LABEL: Record<PipelineStatus, string> = {
  real: 'AVAILABLE',
  approximation: 'PARTIALLY AVAILABLE',
  'not-modelled': 'NOT YET AVAILABLE',
};

interface Stage {
  key: string;
  label: string;
  status: PipelineStatus;
  note: ReactNode;
}

/** What a real measurement is compared against — always the LAST executed round of a completed search. */
export interface RealExperimentPredictionContext {
  readonly predictionSourceExperimentId: string;
  readonly loopResult: DiscoveryLoopResult;
  readonly domainId: string;
  /** The same metric the search's own objective declared — read off `intent.objectiveMetric`. */
  readonly metric: string;
}

export interface RealExperimentPipelineProps {
  /** The real mechanism the currently selected lever declares — `MechanisticHypothesis.mechanism`
   * from `cellCultureLeverCatalog.ts`, direction-independent, so this is honest without a chosen goal. */
  predictionMechanism: string;
  predictionRationale: string;
  /** Real current Control vs Treatment numbers from `CellCultureLabSim.getStats()` — the ONLY
   * comparison this screen can honestly show today (simulated arm vs simulated arm). */
  comparisonNote: string;
  /** A real Evidence Bundle id from a completed Discovery run against this same domain, if the user
   * has run one — null renders the honest "none yet" state rather than a placeholder id. */
  evidenceBundleId: string | null;
  /** Present only once a Discovery search has completed — the frozen SIMULATED prediction a real
   * measurement can be entered against. Null renders every stage past Prediction as not-modelled. */
  prediction: RealExperimentPredictionContext | null;
}

type Submission =
  | { readonly kind: 'success'; readonly verification: PredictionVerification; readonly savedExperimentId: string; readonly replayStatus: string }
  | { readonly kind: 'error'; readonly message: string };

function ManualEntryForm({ prediction, onSubmitted }: { prediction: RealExperimentPredictionContext; onSubmitted: (result: Submission) => void }) {
  const [protocolRef, setProtocolRef] = useState('');
  const [rawValue, setRawValue] = useState('');
  const [unit, setUnit] = useState('');
  const [tolerance, setTolerance] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const lastRound = prediction.loopResult.rounds[prediction.loopResult.rounds.length - 1];
      if (lastRound === undefined) throw new Error('This search has no executed rounds to verify against.');
      const numericValue = Number(rawValue);
      const numericTolerance = Number(tolerance);
      if (protocolRef.trim().length === 0) throw new Error('A protocol reference is required — who took this reading, with what.');
      if (!Number.isFinite(numericValue)) throw new Error('The real reading must be a finite number.');
      if (!Number.isFinite(numericTolerance) || numericTolerance <= 0) throw new Error('The tolerance must be a positive number, declared before comparison — never fabricated afterward.');
      if (unit.trim().length === 0) throw new Error('A unit is required for the real reading.');

      const request: RealExperimentRequest = {
        structuredRequest: {
          contractVersion: EXPERIMENT_FABRIC_VERSION,
          sourceText: 'Manual real-experiment entry (RealExperimentPipeline)',
          domainId: prediction.domainId,
          operation: 'simulate',
          parameters: {},
        },
        physicalProtocolRef: protocolRef.trim(),
        hypothesisId: lastRound.hypothesisId,
      };
      const raw: RawMeasurement = { channel: 'manual-entry', value: numericValue, unit: unit.trim(), capturedAt: new Date().toISOString() };
      const derived: DerivedMeasurement[] = [{ outputKey: prediction.metric, value: numericValue, unit: unit.trim(), derivedFrom: [raw] }];
      const realRun = createRealExperimentRun({ request, derived, summary: `Manually entered reading via protocol ${protocolRef.trim()}.` });

      // The tolerance above was typed in BEFORE this comparison exists — never
      // adjusted afterward to fit the result.
      const verificationCriterion: FalsificationCriterion = {
        metric: prediction.metric,
        relation: 'equal-within-tolerance',
        tolerance: numericTolerance,
        rationale: 'Declared by the person entering this reading, before the comparison against the prediction was computed.',
      };
      const saved = buildSavedRealExperimentVerification({
        predictionSourceExperimentId: prediction.predictionSourceExperimentId,
        loopResult: prediction.loopResult,
        verificationCriterion,
        request,
        realRun,
      });
      const memoryRecord = saveRealExperimentVerificationToMemory(saved);
      const replay = replaySavedRealExperimentVerification(memoryRecord);
      onSubmitted({ kind: 'success', verification: saved.verification, savedExperimentId: memoryRecord.id, replayStatus: replay.status });
    } catch (error) {
      onSubmitted({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="rex-entry-form" onSubmit={handleSubmit} data-testid="rex-entry-form">
      <div className="gsc-panel-row">
        <label htmlFor="rex-protocol-ref">Protocol reference</label>
        <input id="rex-protocol-ref" type="text" value={protocolRef} onChange={(e) => setProtocolRef(e.target.value)} placeholder="e.g. manual-dipstick-reading-v1" data-testid="rex-protocol-ref" />
      </div>
      <div className="gsc-panel-row">
        <label htmlFor="rex-raw-value">Real reading for &quot;{prediction.metric}&quot;</label>
        <input id="rex-raw-value" type="number" step="any" value={rawValue} onChange={(e) => setRawValue(e.target.value)} data-testid="rex-raw-value" />
        <input id="rex-unit" type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" data-testid="rex-unit" />
      </div>
      <div className="gsc-panel-row">
        <label htmlFor="rex-tolerance">Tolerance (declared BEFORE comparison)</label>
        <input id="rex-tolerance" type="number" step="any" min="0" value={tolerance} onChange={(e) => setTolerance(e.target.value)} data-testid="rex-tolerance" />
      </div>
      <button type="submit" data-testid="rex-submit-measurement">Submit real measurement</button>
    </form>
  );
}

function buildStages(props: RealExperimentPipelineProps, submission: Submission | null, onSubmitted: (result: Submission) => void): Stage[] {
  const { predictionMechanism, predictionRationale, comparisonNote, evidenceBundleId, prediction } = props;

  const requestNote: ReactNode = prediction
    ? 'Enter a real, physical reading below — the same request/data stages, collapsed into one form since manual entry has no queue to wait on.'
    : 'Run a Discovery search on the left first — a real measurement is entered against a completed prediction, never a hypothetical one.';

  const dataNote: ReactNode = prediction
    ? submission?.kind === 'success'
      ? <>
          <ProvenanceBadge provenance="REAL_EXPERIMENTAL" testId="rex-real-badge" />
          <span> Real reading recorded and stamped REAL_EXPERIMENTAL.</span>
        </>
      : <ManualEntryForm prediction={prediction} onSubmitted={onSubmitted} />
    : 'A real reading, once entered, would flow correctly into Evidence and Memory — but there is no way to enter one on this screen yet, and none has been.';

  const comparisonStageNote: ReactNode = submission?.kind === 'success'
    ? `Predicted ${submission.verification.predictedValue} vs. real ${submission.verification.observedValue ?? '(no numeric value)'}: ${submission.verification.message}`
    : submission?.kind === 'error'
      ? `Refused: ${submission.message}`
      : `Right now Genesis can only compare two simulated arms: ${comparisonNote}. Comparing against a real measurement isn't possible without one to compare against.`;

  const evidenceStageNote: ReactNode = submission?.kind === 'success'
    ? `Saved to Scientific Memory (experiment ${submission.savedExperimentId}) and replayed: ${submission.replayStatus}. Replay re-runs the SIMULATED prediction only — the real reading is never re-executed.`
    : evidenceBundleId
      ? `A real Evidence Bundle (${evidenceBundleId}) was recorded for this simulated run — run a Discovery search on the left to produce your own. Genesis already knows how to mark a bundle as real-experimental; it just doesn't have a real measurement yet to mark one with.`
      : 'No Evidence Bundle recorded yet for this session — run a Discovery search on the left to produce one. It will be simulated; a real-experimental bundle needs a real measurement, which does not exist yet.';

  return [
    { key: 'prediction', label: 'Experiment Prediction', status: 'real', note: `${predictionMechanism}. ${predictionRationale}` },
    { key: 'request', label: 'Real Experiment Request', status: prediction ? 'real' : 'not-modelled', note: requestNote },
    {
      key: 'waiting',
      label: 'Waiting for Laboratory',
      status: prediction ? 'real' : 'not-modelled',
      note: prediction
        ? 'No queue for manual entry — the person who took the reading enters it directly below, immediately.'
        : 'No laboratory, instrument, or sensor is connected to Genesis yet, so this step cannot run — nothing is waiting because nothing has been requested.',
    },
    { key: 'data', label: 'Real Experimental Data', status: prediction ? 'real' : 'not-modelled', note: dataNote },
    { key: 'comparison', label: 'Comparison', status: submission?.kind === 'success' ? 'real' : 'approximation', note: comparisonStageNote },
    { key: 'evidence', label: 'Evidence', status: submission?.kind === 'success' ? 'real' : evidenceBundleId ? 'approximation' : 'not-modelled', note: evidenceStageNote },
  ];
}

export function RealExperimentPipeline(props: RealExperimentPipelineProps) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const stages = buildStages(props, submission, setSubmission);
  return (
    <ol className="rex-pipeline" data-testid="real-experiment-pipeline">
      {stages.map((stage) => (
        <li key={stage.key} className="rex-stage" data-testid={`rex-stage-${stage.key}`}>
          <div className="rex-stage-head">
            <span className={`gx-status ${stage.status}`}>{STATUS_LABEL[stage.status]}</span>
            <span className="rex-stage-label">{stage.label}</span>
          </div>
          <div className="gsc-caption">{stage.note}</div>
        </li>
      ))}
    </ol>
  );
}

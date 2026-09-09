/**
 * REAL EXPERIMENT INTERFACE — frontend representation only (C2 Master directive, P1).
 *
 * Target pipeline, per `docs/MASTER_PRIORITY_GENESIS.md`:
 *
 *   Hypothesis -> Prediction -> ExperimentRequest -> Real Experiment -> Raw Data
 *     -> Derived Data -> Evidence -> Falsification/Support -> Memory -> Next Experiment
 *
 * and per this directive's own six-stage framing:
 *
 *   Experiment Prediction -> Real Experiment Request -> Waiting for Laboratory
 *     -> Real Experimental Data -> Comparison -> Evidence
 *
 * NO hardware is integrated here, and none is implied. `docs/GENESIS_NORTH_STAR.md` §4 states the
 * rule this component exists to obey: a `RealExperimentInterface` is a CAPABILITY, admitted or
 * refused exactly like every solver capability already is (`discoveryAdmission.ts`'s
 * `AdmissionStatus`: `'REAL' | 'APPROXIMATION' | 'NOT_MODELLED' | 'BLOCKED'`) — never a stub that
 * silently falls back to relabelling simulated output as real. Confirmed by direct repo search: zero
 * code references to `REAL_EXPERIMENTAL`/`RealExperimentInterface` exist anywhere yet, only in these
 * two docs — so every stage past "Prediction" below is honestly `NOT_MODELLED`, reusing that exact
 * status word rather than inventing a new one.
 *
 * "Comparison" and "Evidence" are each split into what is real TODAY (a real Evidence Bundle for a
 * SIMULATED run, and the real fork-and-compare machinery `worldCounterfactual.ts` already runs
 * between two simulated arms) versus what stays absent (comparing against REAL lab data) — stated
 * as `APPROXIMATION` per the same `AdmissionStatus` vocabulary, not as a fabricated "partial real"
 * status invented for this component.
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
  note: string;
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
}

function buildStages({ predictionMechanism, predictionRationale, comparisonNote, evidenceBundleId }: RealExperimentPipelineProps): Stage[] {
  return [
    {
      key: 'prediction',
      label: 'Experiment Prediction',
      status: 'real',
      note: `${predictionMechanism}. ${predictionRationale}`,
    },
    {
      key: 'request',
      label: 'Real Experiment Request',
      status: 'not-modelled',
      note: 'No RealExperimentInterface is registered in this codebase — Genesis refuses this step rather than fabricating a request. See GENESIS_NORTH_STAR.md §4.',
    },
    {
      key: 'waiting',
      label: 'Waiting for Laboratory',
      status: 'not-modelled',
      note: 'Depends on a Real Experiment Request existing first — not reachable while that stage is refused.',
    },
    {
      key: 'data',
      label: 'Real Experimental Data',
      status: 'not-modelled',
      note: 'No apparatus, sensor, or laboratory connection exists anywhere in this codebase yet.',
    },
    {
      key: 'comparison',
      label: 'Comparison',
      status: 'approximation',
      note: `The fork-and-compare machinery already runs today, simulated arm vs simulated arm: ${comparisonNote}. Comparing against a REAL measurement is not available — there is no real measurement yet to compare against.`,
    },
    {
      key: 'evidence',
      label: 'Evidence',
      status: evidenceBundleId ? 'approximation' : 'not-modelled',
      note: evidenceBundleId
        ? `A real Evidence Bundle (${evidenceBundleId}) was recorded for this simulated run — run a Discovery search on the left to produce your own. A real-experimental Evidence Bundle does not exist yet.`
        : 'No Evidence Bundle recorded yet for this session — run a Discovery search on the left to produce one (simulated only; real-experimental evidence does not exist yet).',
    },
  ];
}

export function RealExperimentPipeline(props: RealExperimentPipelineProps) {
  const stages = buildStages(props);
  return (
    <ol className="rex-pipeline" data-testid="real-experiment-pipeline">
      {stages.map((stage) => (
        <li key={stage.key} className="rex-stage" data-testid={`rex-stage-${stage.key}`}>
          <div className="rex-stage-head">
            <span className={`gx-status ${stage.status}`}>{STATUS_LABEL[stage.status]}</span>
            <span className="rex-stage-label">{stage.label}</span>
          </div>
          <p className="gsc-caption">{stage.note}</p>
        </li>
      ))}
    </ol>
  );
}

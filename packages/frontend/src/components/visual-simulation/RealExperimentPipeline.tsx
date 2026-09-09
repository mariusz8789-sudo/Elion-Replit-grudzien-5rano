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
 * silently falls back to relabelling simulated output as real.
 *
 * **Updated after C1 landed the Real Experiment Contract** (`core/experimentFabric/realExperiment.ts`,
 * `docs/GENESIS_DATA_PROVENANCE_AND_REAL_EXPERIMENT_CONTRACT.md`): the CONTRACT now exists —
 * `createRealExperimentRun()` assembles already-obtained `RawMeasurement`/`DerivedMeasurement`
 * values into a valid `ExperimentRun` tagged `dataProvenance: 'REAL_EXPERIMENTAL'`, which already
 * flows correctly into Evidence/Memory/Replay (verified by that report's own `realExperiment.test.ts`).
 * What still does NOT exist, confirmed by that same report's own "NEXT GAP" list, is (1) any UI
 * surface for a person to enter a real measurement through that contract, (2) an `ExperimentRoute`
 * kind for a physical experiment, and (3) any actual apparatus/sensor/lab connection — so every
 * stage below "Prediction" is still honestly `NOT_MODELLED` from THIS screen's point of view, but the
 * wording now cites the real contract by name instead of claiming nothing exists at all.
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
      note: 'The contract exists (createRealExperimentRun in core/experimentFabric/realExperiment.ts) but only as something a developer calls by hand from already-obtained measurements — no screen lets you submit one from here yet, so Genesis refuses this step rather than fabricating a request.',
    },
    {
      key: 'waiting',
      label: 'Waiting for Laboratory',
      status: 'not-modelled',
      note: 'No ExperimentRoute kind exists for a physical experiment yet, and no apparatus/lab is connected — not reachable while the Request stage above has no UI to populate it.',
    },
    {
      key: 'data',
      label: 'Real Experimental Data',
      status: 'not-modelled',
      note: 'The measurement shape exists (RawMeasurement/DerivedMeasurement) and would flow correctly into Evidence and Memory if entered — but no apparatus, sensor, or laboratory connection exists anywhere in this codebase, and no UI lets a person type in a real reading yet.',
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
        ? `A real Evidence Bundle (${evidenceBundleId}) was recorded for this simulated run — run a Discovery search on the left to produce your own. The provenance field a real-experimental Evidence Bundle would need (dataProvenance: REAL_EXPERIMENTAL) already exists and propagates correctly; only a real measurement to carry it does not exist yet.`
        : 'No Evidence Bundle recorded yet for this session — run a Discovery search on the left to produce one (simulated only; a real-experimental Evidence Bundle needs a real measurement, which does not exist yet).',
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

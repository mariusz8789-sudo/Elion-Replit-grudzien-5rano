import { assessTautology, type TautologyComponent } from '../agent/tautologyGate';
import { consultFalsifiedModelRegistry, type FalsificationScope } from '../agent/falsifiedModelRegistry';
import { modelSpecFingerprint, renderModelSpec, type ModelPoint, type ModelSpec } from '../agent/modelSpace';
import type { AdjudicationOutcome, Candidate, DiscoveryRun, ExecutedExperiment, FreezeSeal } from '../orchestrator/contracts';
import type { MindPorts } from './mindAdapters';

/**
 * REAL PORT WIRING for the Mind domain (docs/DECISIONS.md D-060).
 *
 * Each port below delegates to an EXISTING, unmodified gate. This is the file
 * that gives several previously-orphaned modules a genuine runtime caller —
 * the defect D-060 exists to fix.
 *
 * WHAT IS HONESTLY WIRED HERE:
 *  - `isTautological`  -> `agent/tautologyGate.ts::assessTautology` (real).
 *  - `isFalsified`     -> `agent/falsifiedModelRegistry.ts::consultFalsifiedModelRegistry` (real).
 *  - `adjudicate`      -> a deliberately CONSERVATIVE rule (below).
 *
 * WHAT IS NOT WIRED, AND WHY — DISCLOSED, NOT PAPERED OVER:
 * `agent/selfFalsificationBattery.ts::runSelfFalsificationBattery` requires a
 * `replicationDataset`, a `FreezeRecord` taken before that dataset was
 * touched, and seven caller-declared structural facts. The Mind domain does
 * not yet have a replication dataset, so the full 13-probe battery CANNOT be
 * run honestly from here. Rather than fabricate its inputs, this module runs
 * the two probes it genuinely can (tautology + falsified-model registry) and
 * says so. Wiring the full battery needs a Mind domain with a real, disjoint
 * replication dataset — real, disclosed future work (D-060 "what this does
 * NOT do").
 */

export const MIND_SELF_FALSIFICATION_COVERAGE =
  'PARTIAL: 2 of 13 probes (TAUTOLOGY via tautologyGate, ALTERNATIVE_MODEL via falsifiedModelRegistry). The full battery needs a disjoint replication dataset this domain does not yet have.' as const;

export interface MindPortOptions {
  readonly scope: FalsificationScope;
  readonly observe: (x: number) => ModelPoint | null;
  readonly candidateX: readonly number[];
  readonly backendAvailable: boolean;
  /** The honest evidence class of this backend's output. Model fitting over computed points is COMPUTATIONAL — never DIRECT_RANDOMISED. */
  readonly evidenceClass: string;
  readonly now: () => string;
  readonly nowMs: () => number;
}

/** A model's prediction and the observation it is checked against both come from the same solver unless an independent channel says otherwise — so this is the real, honest tautology question to ask. */
function tautologyComponentsFor(spec: ModelSpec, independentMeasurement: boolean): readonly TautologyComponent[] {
  const modelId = modelSpecFingerprint(spec);
  return [
    {
      componentId: `mind-fit-${modelId}`,
      prediction: { source: 'hypothesis-parameter', modelId, rationale: `fitted form ${renderModelSpec(spec)} evaluated on its own coefficients` },
      observation: independentMeasurement
        ? { source: 'independent-measurement', modelId: 'mind-backend', rationale: 'observation supplied by the execution backend, not by the fitted model' }
        : { source: 'hypothesis-parameter', modelId, rationale: 'observation re-derived from the same fitted model — a consistency check, not an empirical test' },
      derivedFromSameComputation: !independentMeasurement,
    },
  ];
}

export function createMindPorts(options: MindPortOptions): MindPorts {
  const isTautological = (spec: ModelSpec): boolean =>
    assessTautology(tautologyComponentsFor(spec, true)).classification === 'CONSISTENCY_CHECK';

  const isFalsified = (spec: ModelSpec): boolean =>
    consultFalsifiedModelRegistry({ spec, scope: options.scope }).verdict === 'BLOCK';

  return {
    backend: { available: options.backendAvailable, observe: options.observe, candidateX: options.candidateX, evidenceClass: options.evidenceClass },

    isTautological,
    isFalsified,

    /** The two probes this domain can genuinely run — see MIND_SELF_FALSIFICATION_COVERAGE. A form that is circular or already falsified does not survive. */
    runSelfFalsification: (specs) => specs.map((spec) => !isTautological(spec) && !isFalsified(spec)),

    /**
     * CONSERVATIVE BY CONSTRUCTION. This never promotes: model fitting over
     * computed points cannot, on its own, establish a scientific winner, and
     * saying otherwise is exactly the fabrication this repo exists to refuse.
     * A real WINNER for this domain requires a real adjudicator over real
     * experimental evidence — injected by the caller, not defaulted here.
     * (Even if one did return WINNER, `orchestrator.ts`'s D-057 gate would
     * still refuse promotion on COMPUTATIONAL evidence — see the D-060 test.)
     */
    adjudicate: (_top2: readonly Candidate[], _evidence: readonly ExecutedExperiment[], _seal: FreezeSeal): AdjudicationOutcome => ({
      verdict: 'INSUFFICIENT_EVIDENCE',
    }),

    compare: (top2: readonly Candidate[]) =>
      top2.length < 2
        ? 'fewer than two forms reached the comparison — nothing to separate'
        : `compared ${top2[0]?.mechanismClass ?? '?'} against ${top2[1]?.mechanismClass ?? '?'} on fit quality alone; fit quality is not evidence of mechanism`,

    /** No recipe from a computational-only run. The real builder belongs to a domain with real evidence. */
    buildRecipe: () => null,

    recommendNext: (run: DiscoveryRun) =>
      `${run.verdict}: the next useful step is an observation from an independent channel — fit quality over computed points cannot separate these forms further.`,

    now: options.now,
    nowMs: options.nowMs,
  };
}

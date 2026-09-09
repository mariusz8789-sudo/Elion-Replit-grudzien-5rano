import type { ExperimentRun } from './experimentFabric/types';

/**
 * WHERE A NUMBER CAME FROM — a separate axis from every other one already here.
 *
 * ## Why another axis, when several exist
 *
 * Genesis already grades things, and none of them answers this question:
 *
 *   `ConfirmationLevel` (`citation.ts`)      — how well established the SCIENCE is.
 *   `HonestyLevel` (`types.ts`)              — how much a presentation simplifies.
 *   `GroundingLevel` (worldModel `types.ts`) — whether an entity was advanced by a real solver.
 *   `ExperimentProvenance.resultOrigin`      — whether a SOLVER EXECUTED, and which kind.
 *
 * `resultOrigin` is the closest and is still a different question. Its values
 * (`real-engine`, `knowledge-only`, `capability-seam`, …) describe the
 * EXECUTION: did a Genesis engine run, or was the run refused. `real-engine`
 * means a solver really executed — it does NOT mean the number came from the
 * world. `experimentGraph.ts` says so directly where it maps a completed run to
 * `SIMULATION` or `MODEL_ESTIMATE` and never to `OBSERVED`.
 *
 * The axis this module adds is: was this number COMPUTED, LOOKED UP, or
 * MEASURED. That is the distinction that will matter the moment a real
 * laboratory result reaches Genesis, and it must exist before then — retrofitting
 * it after half of Evidence, Memory and Replay have assumed everything is a
 * simulation is the expensive order to do it in.
 *
 * ## The current state, stated rather than implied
 *
 * Every number Genesis produces today is `SIMULATED`. There is no path that can
 * produce `REAL_EXPERIMENTAL`: the one measurement seam
 * (`inquiryLoop.ts::runAt`) returns an `ExperimentRun` from `runExperiment`,
 * which is synchronous and local, and no `resultOrigin` value means "measured".
 * `REFERENCE` is likewise unreachable through this path today, although real
 * external reference data DOES exist elsewhere in the codebase (the AME2020
 * comparison, the dimuon dataset) with its own provenance records that never
 * reach an `ExperimentRun`.
 *
 * Declaring the two unreachable values anyway is deliberate. A one-valued
 * enum would be ceremony; a three-valued one whose other two members are
 * documented as unreachable is a stated boundary that a later real path has to
 * satisfy rather than route around. See `REAL_EXPERIMENT_CONTRACT.md`.
 */

export const MEASUREMENT_PROVENANCE_CONTRACT_VERSION = '1.0.0';

export type MeasurementOrigin =
  /** Output of a Genesis model or solver. Everything today. */
  | 'SIMULATED'
  /** An external reference or literature value, carried in rather than computed. */
  | 'REFERENCE'
  /** A real measurement of a real system by a real instrument. */
  | 'REAL_EXPERIMENTAL';

export interface MeasurementProvenance {
  readonly contractVersion: string;
  readonly origin: MeasurementOrigin;
  /** The exact field or code path this was read from — never a guess. */
  readonly derivedFrom: string;
  /** Why that field implies this origin, in one sentence. */
  readonly why: string;
}

/**
 * The origin of one `ExperimentRun`, derived from its own provenance rather
 * than assumed.
 *
 * Every branch maps to `SIMULATED` today, and that is the finding rather than a
 * placeholder: `resultOrigin` cannot express a measurement, so no reading of it
 * could honestly return anything else. When a real path exists it will carry
 * its own origin and will not come through here.
 */
export function originOfExperimentRun(run: ExperimentRun): MeasurementProvenance {
  const resultOrigin = run.provenance.resultOrigin;
  return {
    contractVersion: MEASUREMENT_PROVENANCE_CONTRACT_VERSION,
    origin: 'SIMULATED',
    derivedFrom: `ExperimentRun.provenance.resultOrigin = '${resultOrigin}'`,
    why:
      resultOrigin === 'real-engine'
        ? 'A Genesis solver executed and produced this number. "real-engine" is a statement about the engine, not about the world: the value is computed, never measured.'
        : `The run did not execute a solver ('${resultOrigin}'), so any number attached to it is a model artefact rather than a measurement.`,
  };
}

/** The origin of a whole investigation, and whether its measurements agreed on one. */
export interface MeasurementProvenanceSummary {
  readonly contractVersion: string;
  /**
   * The single origin every measurement in this run shared. Null when they did
   * NOT share one — a run that mixed a simulation with a real measurement is a
   * real and important state, and collapsing it to one word would be the exact
   * loss this axis exists to prevent.
   */
  readonly origin: MeasurementOrigin | null;
  /** Every distinct origin present, so a mixed run can be inspected rather than only detected. */
  readonly origins: readonly MeasurementOrigin[];
  readonly derivedFrom: string;
  readonly why: string;
}

/** Summarises the origins of the measurements one investigation actually took. */
export function summariseMeasurementOrigins(
  provenances: readonly MeasurementProvenance[],
  derivedFrom: string,
): MeasurementProvenanceSummary {
  const origins = [...new Set(provenances.map((p) => p.origin))];
  return {
    contractVersion: MEASUREMENT_PROVENANCE_CONTRACT_VERSION,
    origin: origins.length === 1 ? origins[0]! : null,
    origins,
    derivedFrom,
    why:
      origins.length === 0
        ? 'This investigation took no measurement, so there is no origin to report.'
        : origins.length === 1
          ? `Every measurement in this investigation was ${origins[0]}.`
          : `This investigation MIXED origins (${origins.join(', ')}). A finding drawn across them is worth what its weakest source is worth, and no single label describes it.`,
  };
}

/**
 * The origin of a WorldGraph investigation.
 *
 * Its numbers do not come from `ExperimentRun`s at all — each arm is a
 * `TemporalEngine` advanced through `SolverRouter`, and the objective is read
 * off that trajectory. So this is derived from the code path rather than from a
 * field, and says which path.
 */
export function worldGraphMeasurementOrigin(): MeasurementProvenanceSummary {
  return {
    contractVersion: MEASUREMENT_PROVENANCE_CONTRACT_VERSION,
    origin: 'SIMULATED',
    origins: ['SIMULATED'],
    derivedFrom: 'TemporalEngine.advance via SolverRouter.routeTick',
    why:
      'Every arm of a WorldGraph investigation is a simulated trajectory: entities are advanced by registered domain solvers, or by the procedural fallback where none is registered. No branch of that path reads an instrument.',
  };
}

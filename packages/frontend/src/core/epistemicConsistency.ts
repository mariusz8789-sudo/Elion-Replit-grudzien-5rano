/**
 * ENTITY-0 — EPISTEMIC CONSISTENCY. One check across the axes Genesis already
 * has; not a new status vocabulary.
 *
 * Three existing axes describe a stored result and must never contradict
 * each other:
 *   - what the record CLAIMS to be (`epistemicStatus`, whichever existing
 *     vocabulary it came from: `SavedExperimentEpistemicStatus`,
 *     `SessionEpistemicStatus`, `BiotechEpistemicStatus`, …);
 *   - where the DATA came from (`dataProvenance.ts::DataProvenance`:
 *     SIMULATED / REFERENCE / REAL_EXPERIMENTAL);
 *   - how the value was produced (`resultOrigin`, and the backend evidence
 *     class REAL_ENGINE_OUTPUT / MODEL_ESTIMATE / REFERENCE_DATA / SIMULATED /
 *     DERIVED, mirrored as `labProcedure.ts::EpistemicLabel`).
 *
 * The rules below only name combinations that would turn a model into a
 * measurement or a model's own words into a fact. Everything else passes,
 * because refusing a combination nobody has shown to be wrong would be a
 * second, invented truth system.
 */

/** Statuses that assert a real measurement made by Genesis or its lab. */
const OWN_MEASUREMENT_CLAIMS: ReadonlySet<string> = new Set(['REAL_EXPERIMENTAL', 'REAL_OBSERVATION', 'REAL_MEASUREMENT', 'MEASURED', 'OBSERVED']);
/** The subset a reference source may never carry: it is somebody else's measurement, not ours. */
const OWN_EXPERIMENT_CLAIMS: ReadonlySet<string> = new Set(['REAL_EXPERIMENTAL', 'REAL_MEASUREMENT', 'MEASURED']);
/** Statuses that assert settled knowledge. */
const FACT_CLAIMS: ReadonlySet<string> = new Set(['FACT', 'ESTABLISHED_SCIENCE', 'VERIFIED_SOURCE', 'SUPPORTED', 'SUPPORTED_WITHIN_PROTOCOL', 'verified']);
const MODEL_CLASSES: ReadonlySet<string> = new Set(['MODEL_ESTIMATE', 'SIMULATED']);

export type EpistemicViolation =
  | 'SIMULATION_AS_MEASUREMENT'
  | 'MODEL_AS_REAL_EXPERIMENTAL'
  | 'REFERENCE_AS_OWN_MEASUREMENT'
  | 'LLM_OUTPUT_AS_FACT';

export interface EpistemicConsistencyInput {
  readonly epistemicStatus?: string;
  readonly dataProvenance?: string;
  readonly resultOrigin?: string;
  readonly evidenceClass?: string;
  /** True when a language model wrote or shaped the claim. */
  readonly llmAssisted?: boolean;
  /** Independent evidence the claim was promoted through. Empty = no promotion path. */
  readonly evidenceRefs?: readonly string[];
}

export interface EpistemicConsistencyResult {
  readonly ok: boolean;
  readonly violations: readonly EpistemicViolation[];
}

export function checkEpistemicConsistency(input: EpistemicConsistencyInput): EpistemicConsistencyResult {
  const status = input.epistemicStatus ?? '';
  const violations: EpistemicViolation[] = [];
  const claimsOwnMeasurement = OWN_MEASUREMENT_CLAIMS.has(status);

  if (claimsOwnMeasurement && (input.dataProvenance === 'SIMULATED' || input.evidenceClass === 'SIMULATED')) {
    violations.push('SIMULATION_AS_MEASUREMENT');
  }
  const assertsRealExperiment = status === 'REAL_EXPERIMENTAL' || input.dataProvenance === 'REAL_EXPERIMENTAL';
  if (assertsRealExperiment && input.evidenceClass !== undefined && MODEL_CLASSES.has(input.evidenceClass)) {
    violations.push('MODEL_AS_REAL_EXPERIMENTAL');
  }
  if (OWN_EXPERIMENT_CLAIMS.has(status) && (input.dataProvenance === 'REFERENCE' || input.evidenceClass === 'REFERENCE_DATA')) {
    violations.push('REFERENCE_AS_OWN_MEASUREMENT');
  }
  if (input.llmAssisted === true && FACT_CLAIMS.has(status) && (input.evidenceRefs ?? []).length === 0) {
    violations.push('LLM_OUTPUT_AS_FACT');
  }
  return { ok: violations.length === 0, violations };
}

export class EpistemicConsistencyError extends Error {
  constructor(public readonly violations: readonly EpistemicViolation[]) {
    super(`EPISTEMIC_INCONSISTENCY: ${violations.join(', ')} — a record may not claim more than its data supports.`);
    this.name = 'EpistemicConsistencyError';
  }
}

/** Throws `EpistemicConsistencyError` instead of storing a record whose axes contradict each other. */
export function assertEpistemicConsistency(input: EpistemicConsistencyInput): void {
  const result = checkEpistemicConsistency(input);
  if (!result.ok) throw new EpistemicConsistencyError(result.violations);
}

import type { MoleculeCandidate } from './types';

/**
 * EXPERIMENTAL RESULT — the ingestion seam for real measured data.
 *
 * NO FAKE LABORATORY DATA IS DEFINED IN THIS MODULE. This is the contract and
 * the ingestion logic only; the values themselves must come from a caller.
 *
 * THE PROVENANCE KIND IS THE WHOLE POINT.
 *
 * A `TEST_FIXTURE` result exists so the closed-loop control flow can be
 * executed and tested before any wet-lab data exists. It must NEVER be able to
 * masquerade as a real measurement, so:
 *
 *  - the kind travels on every record and every derived object;
 *  - `epistemicClassOfResult` returns EXPERIMENTALLY_VERIFIED only for
 *    REAL_MEASUREMENT, and TEST_FIXTURE for a fixture — a fixture cannot reach
 *    the "verified" class through any code path;
 *  - every human-readable line a fixture produces is prefixed with
 *    [TEST_FIXTURE].
 *
 * That is enforced here, in the type and in the functions, rather than left to
 * a caller's discipline.
 */
export const EXPERIMENTAL_RESULT_VERSION = '1.0.0';

/**
 * Where a result came from. There is deliberately no third option: data is
 * either a real measurement or a labelled fixture.
 */
export type ResultProvenanceKind = 'REAL_MEASUREMENT' | 'TEST_FIXTURE';

export interface ExperimentalResultProvenance {
  kind: ResultProvenanceKind;
  /** Lab, publication, DOI/PMID, or — for a fixture — what it is standing in for. */
  source: string;
  /** Pointer to underlying data, when one exists. */
  rawDataReference: string | null;
  recordedAt: string;
}

/**
 * One measured value. Field-for-field the contract the mission specified; a
 * field with no value is `null`, never omitted and never defaulted, so an
 * absent control or replicate count is visible rather than assumed.
 */
export interface ExperimentalResult {
  resultId: string;
  compound: string;
  /** Structure the measurement is about, so it can be bound to a candidate unambiguously. */
  canonicalSmiles: string | null;
  target: string;
  assay: string;
  parameter: string;
  value: number | null;
  unit: string;
  /** Present when the result is a negative/no-effect observation rather than a number. */
  observation: string | null;
  model: string;
  species: string;
  cellLine: string | null;
  concentration: string | null;
  replicates: number | null;
  controls: string | null;
  timepoint: string | null;
  /** SD/SEM/CI as reported. Null when the source gave none — never invented. */
  uncertainty: string | null;
  provenance: ExperimentalResultProvenance;
}

export interface ResultValidation {
  ok: boolean;
  issues: readonly string[];
}

/**
 * Structural validation Genesis can genuinely perform: a result must identify
 * what was measured, on what, and where it came from. A result carrying
 * neither a value nor an observation is rejected — it asserts nothing.
 */
export function validateExperimentalResult(result: ExperimentalResult): ResultValidation {
  const issues: string[] = [];
  if (result.compound.trim().length === 0) issues.push('no compound named');
  if (result.target.trim().length === 0) issues.push('no target named');
  if (result.assay.trim().length === 0) issues.push('no assay named');
  if (result.parameter.trim().length === 0) issues.push('no parameter named');
  if (result.value === null && result.observation === null) {
    issues.push('carries neither a numeric value nor a stated observation — it asserts nothing');
  }
  if (result.value !== null && !Number.isFinite(result.value)) issues.push('value is not a finite number');
  if (result.value !== null && result.unit.trim().length === 0) issues.push('numeric value carries no unit');
  if (result.provenance.source.trim().length === 0) issues.push('no provenance source');
  return { ok: issues.length === 0, issues };
}

/**
 * The epistemic class a result may confer. A fixture can never return
 * `EXPERIMENTALLY_VERIFIED` — this function is the only sanctioned mapping,
 * and it is total.
 */
export function epistemicClassOfResult(result: ExperimentalResult): 'EXPERIMENTALLY_VERIFIED' | 'TEST_FIXTURE' {
  return result.provenance.kind === 'REAL_MEASUREMENT' ? 'EXPERIMENTALLY_VERIFIED' : 'TEST_FIXTURE';
}

/** Every human-readable rendering goes through here, so a fixture is always marked. */
export function describeResult(result: ExperimentalResult): string {
  const prefix = result.provenance.kind === 'TEST_FIXTURE' ? '[TEST_FIXTURE] ' : '';
  const measurement = result.value !== null
    ? `${result.parameter} = ${result.value} ${result.unit}`
    : `${result.parameter}: ${result.observation}`;
  const uncertainty = result.uncertainty === null ? '' : ` (${result.uncertainty})`;
  const replicates = result.replicates === null ? '' : `, n=${result.replicates}`;
  return `${prefix}${result.compound} at ${result.target}: ${measurement}${uncertainty} — ${result.assay}, ${result.model}`
    + `${result.cellLine === null ? '' : `/${result.cellLine}`} (${result.species})${replicates}. Source: ${result.provenance.source}.`;
}

/**
 * A hypothesis a discovery round is actually betting on, and what a
 * measurement would do to it. Written BEFORE the result is known — that is
 * what makes the test a test rather than a post-hoc rationalisation.
 */
export interface TestableHypothesis {
  hypothesisId: string;
  statement: string;
  /**
   * The compound this hypothesis is about, or `null` when it is deliberately
   * compound-agnostic — "at least one candidate in this pool engages target
   * X" (used by the discriminating-experiment engine, which tests a SET of
   * candidates against one target/parameter, not one named compound).
   *
   * When set, this is load-bearing: two compounds sharing a target and
   * parameter (e.g. ketamine and agmatine both reported at "NMDAR"/"IC50")
   * are NOT interchangeable evidence for each other's hypothesis. A real
   * measurement of ketamine must never be read as support for a claim about
   * agmatine just because the target and parameter match.
   */
  compound: string | null;
  target: string;
  parameter: string;
  /** A result meeting this is support. */
  supportedIf: string;
  /** A result meeting this refutes it. Absent falsifiability is itself a defect. */
  falsifiedIf: string;
  /** Numeric threshold separating the two, when the prediction is numeric. */
  threshold: number | null;
  thresholdUnit: string | null;
  /** True when a smaller value supports (e.g. IC50/Ki potency). */
  lowerIsSupport: boolean;
}

export type HypothesisStatus =
  | 'SUPPORTED'
  | 'FALSIFIED'
  | 'UNCHANGED_NO_DISCRIMINATING_RESULT'
  | 'UNTESTED';

export interface HypothesisAssessment {
  hypothesisId: string;
  status: HypothesisStatus;
  /** Results that actually bore on this hypothesis — same target AND parameter. */
  decidingResultIds: readonly string[];
  reasoning: string;
  /** Carried forward so a fixture-driven update can never be read as verified. */
  evidenceKind: ResultProvenanceKind | 'NONE';
}

/**
 * Assesses a hypothesis against ingested results.
 *
 * Only results measuring the SAME target and parameter can decide it —
 * a measurement of something else is not weak evidence, it is no evidence,
 * and is excluded rather than downweighted. When the hypothesis names a
 * specific compound, only results about THAT compound may decide it: a real
 * measurement of one compound is never read as evidence for a claim about a
 * different one, however closely the target and parameter match.
 */
export function assessHypothesis(
  hypothesis: TestableHypothesis,
  results: readonly ExperimentalResult[],
): HypothesisAssessment {
  const deciding = results.filter((r) =>
    r.target.trim().toUpperCase() === hypothesis.target.trim().toUpperCase()
    && r.parameter.trim().toLowerCase() === hypothesis.parameter.trim().toLowerCase()
    && (hypothesis.compound === null || r.compound.trim().toLowerCase() === hypothesis.compound.trim().toLowerCase()));

  if (deciding.length === 0) {
    const compoundClause = hypothesis.compound === null ? '' : ` for ${hypothesis.compound}`;
    return {
      hypothesisId: hypothesis.hypothesisId,
      status: 'UNTESTED',
      decidingResultIds: [],
      reasoning: `No ingested result measures ${hypothesis.parameter} at ${hypothesis.target}${compoundClause}. Results about other targets, parameters, or (when this hypothesis names a compound) other compounds do not bear on this hypothesis and were not counted as weak evidence.`,
      evidenceKind: 'NONE',
    };
  }

  const numeric = deciding.filter((r) => r.value !== null);
  const evidenceKind = deciding.every((r) => r.provenance.kind === 'REAL_MEASUREMENT')
    ? 'REAL_MEASUREMENT'
    : 'TEST_FIXTURE';

  if (hypothesis.threshold === null || numeric.length === 0) {
    return {
      hypothesisId: hypothesis.hypothesisId,
      status: 'UNCHANGED_NO_DISCRIMINATING_RESULT',
      decidingResultIds: deciding.map((r) => r.resultId),
      reasoning: hypothesis.threshold === null
        ? 'The hypothesis declares no numeric threshold, so a numeric result cannot decide it either way.'
        : 'Every result on this target/parameter is a non-numeric observation, which cannot be compared against the declared threshold.',
      evidenceKind,
    };
  }

  const supporting = numeric.filter((r) =>
    hypothesis.lowerIsSupport ? r.value! <= hypothesis.threshold! : r.value! >= hypothesis.threshold!);
  const refuting = numeric.filter((r) =>
    hypothesis.lowerIsSupport ? r.value! > hypothesis.threshold! : r.value! < hypothesis.threshold!);

  const prefix = evidenceKind === 'TEST_FIXTURE' ? '[TEST_FIXTURE] ' : '';
  const comparison = hypothesis.lowerIsSupport ? 'at or below' : 'at or above';

  if (refuting.length > 0 && supporting.length === 0) {
    return {
      hypothesisId: hypothesis.hypothesisId,
      status: 'FALSIFIED',
      decidingResultIds: deciding.map((r) => r.resultId),
      reasoning: `${prefix}${refuting.length} deciding result(s) fall on the refuting side of the declared threshold `
        + `(${hypothesis.threshold} ${hypothesis.thresholdUnit ?? ''}, support = ${comparison}), and none support it. ${hypothesis.falsifiedIf}`,
      evidenceKind,
    };
  }

  if (supporting.length > 0 && refuting.length === 0) {
    return {
      hypothesisId: hypothesis.hypothesisId,
      status: 'SUPPORTED',
      decidingResultIds: deciding.map((r) => r.resultId),
      reasoning: `${prefix}${supporting.length} deciding result(s) fall ${comparison} the declared threshold `
        + `(${hypothesis.threshold} ${hypothesis.thresholdUnit ?? ''}) and none refute it. ${hypothesis.supportedIf} `
        + 'Support is not proof: this is one assay, and it constrains only the parameter it measured.',
      evidenceKind,
    };
  }

  return {
    hypothesisId: hypothesis.hypothesisId,
    status: 'UNCHANGED_NO_DISCRIMINATING_RESULT',
    decidingResultIds: deciding.map((r) => r.resultId),
    reasoning: `${prefix}Deciding results disagree: ${supporting.length} support and ${refuting.length} refute against the same threshold. `
      + 'A conflict is preserved as a conflict — it is not resolved by averaging or by majority.',
    evidenceKind,
  };
}

/**
 * Attaches ingested results to the candidates they were measured on.
 *
 * Binding is by CANONICAL SMILES, never by name: a result naming
 * "candidate 3" would bind to whatever happened to be third, which is exactly
 * the kind of silent mis-association this engine must not permit.
 */
export function bindResultsToCandidates(
  candidates: readonly MoleculeCandidate[],
  results: readonly ExperimentalResult[],
): {
  enriched: readonly MoleculeCandidate[];
  bound: { resultId: string; candidateId: string; kind: ResultProvenanceKind }[];
  unbound: { resultId: string; reason: string }[];
} {
  const bound: { resultId: string; candidateId: string; kind: ResultProvenanceKind }[] = [];
  const unbound: { resultId: string; reason: string }[] = [];
  const bySmiles = new Map<string, MoleculeCandidate>();
  for (const candidate of candidates) {
    if (candidate.structure.canonicalSmiles !== null) bySmiles.set(candidate.structure.canonicalSmiles, candidate);
  }

  const additions = new Map<string, { propertyId: string; value: number | null; unit: string; kind: ResultProvenanceKind; source: string }[]>();

  for (const result of results) {
    if (result.canonicalSmiles === null) {
      unbound.push({ resultId: result.resultId, reason: 'Result carries no canonical SMILES, so it cannot be bound to a candidate without guessing.' });
      continue;
    }
    const candidate = bySmiles.get(result.canonicalSmiles);
    if (candidate === undefined) {
      unbound.push({ resultId: result.resultId, reason: `No candidate in this round has the structure ${result.canonicalSmiles}; the measurement is kept as evidence but changes no ranking.` });
      continue;
    }
    bound.push({ resultId: result.resultId, candidateId: candidate.candidateId, kind: result.provenance.kind });
    // Property id encodes target and parameter so it can never collide with a
    // predicted endpoint or be mistaken for one.
    const propertyId = `measured_${result.target}_${result.parameter}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    additions.set(candidate.candidateId, [
      ...(additions.get(candidate.candidateId) ?? []),
      { propertyId, value: result.value, unit: result.unit, kind: result.provenance.kind, source: result.provenance.source },
    ]);
  }

  const enriched = candidates.map((candidate) => {
    const extra = additions.get(candidate.candidateId);
    if (extra === undefined) return candidate;
    return {
      ...candidate,
      properties: [
        ...candidate.properties,
        ...extra.map((e) => ({
          propertyId: e.propertyId,
          // A fixture is TEST_FIXTURE, a real measurement is ACTUAL_SOURCE.
          // There is no path by which a fixture becomes ACTUAL_SOURCE.
          status: e.kind === 'REAL_MEASUREMENT' ? ('ACTUAL_SOURCE' as const) : ('TEST_FIXTURE' as const),
          value: e.value,
          unit: e.unit,
          engine: e.kind === 'REAL_MEASUREMENT' ? e.source : `TEST_FIXTURE:${e.source}`,
        })),
      ],
    };
  });

  return { enriched, bound, unbound };
}

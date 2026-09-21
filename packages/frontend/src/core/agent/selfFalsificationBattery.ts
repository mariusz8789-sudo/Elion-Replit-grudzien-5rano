import { fnv1a, canonicalJson } from '../events/hash';
import { fitModelSpec, holdoutScore, type ModelPoint, type ModelSpec } from './modelSpace';
import { assessTautology, type TautologyComponent } from './tautologyGate';
import { detectDatasetOverlap, type FreezeRecord, type ReplicationDataset } from './discoveryReplicationEngine';
import { ALL_SELF_FALSIFICATION_PROBES, makeEvidenceRef, type SelfFalsificationProbeResult, type SelfFalsificationReport } from './discoveryContracts';

/**
 * PHASE F, Krok 5 — SELF-FALSIFICATION BATTERY (13 probes).
 *
 * REUSED VERBATIM, not re-derived: `TAUTOLOGY` calls
 * `tautologyGate.ts::assessTautology` directly; `OVERFITTING` calls
 * `modelSpace.ts::holdoutScore`/`fitModelSpec`; `DATASET_CONTAMINATION`
 * calls `discoveryReplicationEngine.ts::detectDatasetOverlap`;
 * `HIDDEN_PREREG` reuses the exact freeze-vs-retrieval timing check AC7
 * already established (Krok 3). No second implementation of any of these
 * four exists here.
 *
 * `ALTERNATIVE_MODEL` and `MULTIPLE_TESTING` are new, but mechanical and
 * numeric — a rival-model RSS comparison and a declared-correction check,
 * respectively.
 *
 * THE REMAINING SIX PROBES (`LEAKAGE`, `SELECTION_BIAS`, `CONFOUNDING`,
 * `MEASUREMENT_ARTIFACT`, `NUMERICAL_ARTIFACT`, `PREPROCESSING_ARTIFACT`,
 * `TEMPORAL_LEAKAGE`) cannot be checked from numbers alone — nothing in
 * this codebase can infer, from a fitted curve, whether the underlying
 * measurement was contaminated or the sampling was representative. Rather
 * than fabricate a statistic that LOOKS like it tests this, they are
 * `STRUCTURAL_REVIEW` probes over fields the caller must EXPLICITLY
 * declare (same discipline as `observationGap.ts::undeclaredFeasibility`:
 * an undeclared field is reported `UNRESOLVED`, never silently assumed
 * clean). `classifyDiscoveryStatus`'s `allPassed` check already treats
 * `UNRESOLVED` the same as `FAIL` for the purpose of reaching `DISCOVERY`
 * (only `PASS` on every probe allows it) — so an undeclared review question
 * blocks a claim exactly as a failed one would, never waves it through.
 */

export const SELF_FALSIFICATION_BATTERY_CONTRACT_VERSION = '1.0.0';

export interface StructuralDeclaration {
  /** Was the data collected/selected in a way that avoids selection bias (random or otherwise representative sampling)? */
  readonly representativeSampling: boolean | null;
  /** Was the pipeline checked for train/test or discovery/replication leakage? */
  readonly leakageChecked: boolean | null;
  /** Any known confounders the caller is aware of and has NOT controlled for — non-empty means a real, disclosed risk. */
  readonly knownUncontrolledConfounders: readonly string[];
  /** Was the measurement instrument/pipeline validated against an independent reference? */
  readonly measurementInstrumentValidated: boolean | null;
  /** Was numerical precision (float error, catastrophic cancellation, etc.) checked for this magnitude of effect? */
  readonly numericalPrecisionChecked: boolean | null;
  /** Are the preprocessing steps applied to the data fully documented and reproducible? */
  readonly preprocessingDocumented: boolean | null;
  /** Does every observation used respect temporal ordering (no future information used to explain a past point)? */
  readonly temporalOrderingRespected: boolean | null;
}

export interface SelfFalsificationInput {
  readonly hypothesisSpec: ModelSpec;
  readonly rivalSpec: ModelSpec;
  readonly points: readonly ModelPoint[];
  readonly tautologyComponents: readonly TautologyComponent[];
  readonly discoveryDataset: Pick<ReplicationDataset, 'datasetId' | 'points'>;
  readonly replicationDataset: Pick<ReplicationDataset, 'datasetId' | 'points'> | null;
  readonly freeze: FreezeRecord | null;
  readonly replicationRetrievedAt: number | null;
  readonly numberOfHypothesesTested: number;
  readonly multipleTestingCorrectionApplied: boolean;
  readonly declared: StructuralDeclaration;
}

function probe(name: SelfFalsificationProbeResult['name'], method: SelfFalsificationProbeResult['method'], result: SelfFalsificationProbeResult['result'], detail: string, evidenceIds: readonly string[] = []): SelfFalsificationProbeResult {
  return {
    name,
    method,
    result,
    evidenceRefs: evidenceIds.map((id) => makeEvidenceRef(id, `probe:${name}`, detail)),
    detail,
  };
}

function structuralProbe(name: SelfFalsificationProbeResult['name'], declaredValue: boolean | null, passDetail: string, failDetail: string): SelfFalsificationProbeResult {
  if (declaredValue === null) {
    return probe(name, 'STRUCTURAL_REVIEW', 'UNRESOLVED', `Not declared by the caller — reported as UNRESOLVED, never assumed clean.`);
  }
  return probe(name, 'STRUCTURAL_REVIEW', declaredValue ? 'PASS' : 'FAIL', declaredValue ? passDetail : failDetail);
}

function tautologyProbe(components: readonly TautologyComponent[]): SelfFalsificationProbeResult {
  const assessment = assessTautology(components);
  const isTautological = assessment.classification === 'CONSISTENCY_CHECK' || assessment.classification === 'UNTESTABLE';
  return probe(
    'TAUTOLOGY',
    'DETERMINISTIC_PROBE',
    isTautological ? 'FAIL' : 'PASS',
    `tautologyGate.ts::assessTautology classified this as ${assessment.classification}.`,
  );
}

function overfittingProbe(spec: ModelSpec, points: readonly ModelPoint[]): SelfFalsificationProbeResult {
  const inSample = fitModelSpec(spec, points);
  if (!inSample.ok) {
    return probe('OVERFITTING', 'STATISTICAL_TEST', 'FAIL', `The hypothesis does not even fit its own discovery data (${inSample.reason}).`);
  }
  const heldOut = holdoutScore(spec, points);
  if (heldOut === null) {
    return probe('OVERFITTING', 'STATISTICAL_TEST', 'UNRESOLVED', 'Too few points for an honest hold-out split — cannot rule out overfitting from this sample.');
  }
  const nPoints = points.length;
  const inSamplePerPoint = inSample.rss / Math.max(nPoints, 1);
  const overfit = heldOut > inSamplePerPoint * 5 + 1e-9;
  return probe(
    'OVERFITTING',
    'STATISTICAL_TEST',
    overfit ? 'FAIL' : 'PASS',
    overfit
      ? `Held-out chi-square per point (${heldOut.toFixed(4)}) is far worse than the in-sample fit (${inSamplePerPoint.toFixed(4)}) — the model does not generalize.`
      : `Held-out chi-square per point (${heldOut.toFixed(4)}) stays close to the in-sample fit (${inSamplePerPoint.toFixed(4)}).`,
  );
}

function alternativeModelProbe(spec: ModelSpec, rivalSpec: ModelSpec, points: readonly ModelPoint[]): SelfFalsificationProbeResult {
  const fit = fitModelSpec(spec, points);
  const rivalFit = fitModelSpec(rivalSpec, points);
  if (!fit.ok) {
    return probe('ALTERNATIVE_MODEL', 'STATISTICAL_TEST', 'FAIL', `The claimed hypothesis itself does not fit (${fit.reason}).`);
  }
  if (!rivalFit.ok) {
    return probe('ALTERNATIVE_MODEL', 'STATISTICAL_TEST', 'PASS', `The declared rival model could not even be fit (${rivalFit.reason}) — the claimed hypothesis is not trivially matched by a simpler alternative.`);
  }
  // A rival within 10% of the claimed model's RSS means the "novel" structure was not needed to explain the data.
  const rivalAlmostAsGood = rivalFit.rss <= fit.rss * 1.1;
  return probe(
    'ALTERNATIVE_MODEL',
    'STATISTICAL_TEST',
    rivalAlmostAsGood ? 'FAIL' : 'PASS',
    rivalAlmostAsGood
      ? `A declared rival model fits almost as well (RSS ${rivalFit.rss.toFixed(6)} vs claimed ${fit.rss.toFixed(6)}) — the claimed structure is not clearly needed.`
      : `The claimed model (RSS ${fit.rss.toFixed(6)}) fits substantially better than the declared rival (RSS ${rivalFit.rss.toFixed(6)}).`,
  );
}

function multipleTestingProbe(numberOfHypothesesTested: number, correctionApplied: boolean): SelfFalsificationProbeResult {
  if (numberOfHypothesesTested <= 1) {
    return probe('MULTIPLE_TESTING', 'DETERMINISTIC_PROBE', 'PASS', 'Exactly one hypothesis was tested — no multiple-comparisons correction is needed.');
  }
  return probe(
    'MULTIPLE_TESTING',
    'DETERMINISTIC_PROBE',
    correctionApplied ? 'PASS' : 'FAIL',
    correctionApplied
      ? `${numberOfHypothesesTested} hypotheses were tested and a correction was declared applied.`
      : `${numberOfHypothesesTested} hypotheses were tested with NO declared correction — the significance of any single one is inflated.`,
  );
}

function datasetContaminationProbe(discovery: Pick<ReplicationDataset, 'datasetId' | 'points'>, replication: Pick<ReplicationDataset, 'datasetId' | 'points'> | null): SelfFalsificationProbeResult {
  if (replication === null) {
    return probe('DATASET_CONTAMINATION', 'DETERMINISTIC_PROBE', 'UNRESOLVED', 'No replication dataset supplied yet — contamination cannot be checked.');
  }
  const overlap = detectDatasetOverlap(discovery.points, replication.points);
  return probe(
    'DATASET_CONTAMINATION',
    'DETERMINISTIC_PROBE',
    overlap.overlapCount === 0 ? 'PASS' : 'FAIL',
    overlap.overlapCount === 0
      ? 'Zero points shared between discovery and replication datasets (discoveryReplicationEngine.ts::detectDatasetOverlap).'
      : `${overlap.overlapCount} point(s) shared between discovery and replication datasets — contaminated.`,
  );
}

function hiddenPreregProbe(freeze: FreezeRecord | null, replicationRetrievedAt: number | null): SelfFalsificationProbeResult {
  if (freeze === null || replicationRetrievedAt === null) {
    return probe('HIDDEN_PREREG', 'DETERMINISTIC_PROBE', 'UNRESOLVED', 'No freeze record or replication retrieval time supplied yet.');
  }
  const hidden = freeze.frozenAt >= replicationRetrievedAt;
  return probe(
    'HIDDEN_PREREG',
    'DETERMINISTIC_PROBE',
    hidden ? 'FAIL' : 'PASS',
    hidden
      ? `Hypothesis frozen at ${freeze.frozenAt}, at or after the replication data was retrieved at ${replicationRetrievedAt} — the freeze is not real.`
      : `Hypothesis frozen at ${freeze.frozenAt}, genuinely before the replication data was retrieved at ${replicationRetrievedAt}.`,
  );
}

/** Runs all 13 probes and assembles the report — always all 13, never a subset. */
export function runSelfFalsificationBattery(input: SelfFalsificationInput): SelfFalsificationReport {
  const results: Record<string, SelfFalsificationProbeResult> = {
    TAUTOLOGY: tautologyProbe(input.tautologyComponents),
    OVERFITTING: overfittingProbe(input.hypothesisSpec, input.points),
    ALTERNATIVE_MODEL: alternativeModelProbe(input.hypothesisSpec, input.rivalSpec, input.points),
    MULTIPLE_TESTING: multipleTestingProbe(input.numberOfHypothesesTested, input.multipleTestingCorrectionApplied),
    DATASET_CONTAMINATION: datasetContaminationProbe(input.discoveryDataset, input.replicationDataset),
    HIDDEN_PREREG: hiddenPreregProbe(input.freeze, input.replicationRetrievedAt),
    SELECTION_BIAS: structuralProbe('SELECTION_BIAS', input.declared.representativeSampling, 'Sampling declared representative.', 'Sampling declared NOT representative — selection bias risk.'),
    LEAKAGE: structuralProbe('LEAKAGE', input.declared.leakageChecked, 'Leakage between discovery and replication was checked.', 'Leakage was declared NOT checked.'),
    CONFOUNDING: probe(
      'CONFOUNDING',
      'STRUCTURAL_REVIEW',
      input.declared.knownUncontrolledConfounders.length === 0 ? 'PASS' : 'FAIL',
      input.declared.knownUncontrolledConfounders.length === 0
        ? 'No known, uncontrolled confounders declared.'
        : `Known, uncontrolled confounder(s) declared: ${input.declared.knownUncontrolledConfounders.join(', ')}.`,
    ),
    MEASUREMENT_ARTIFACT: structuralProbe('MEASUREMENT_ARTIFACT', input.declared.measurementInstrumentValidated, 'Measurement instrument/pipeline declared validated.', 'Measurement instrument/pipeline declared NOT validated.'),
    NUMERICAL_ARTIFACT: structuralProbe('NUMERICAL_ARTIFACT', input.declared.numericalPrecisionChecked, 'Numerical precision declared checked for this effect size.', 'Numerical precision declared NOT checked.'),
    PREPROCESSING_ARTIFACT: structuralProbe('PREPROCESSING_ARTIFACT', input.declared.preprocessingDocumented, 'Preprocessing steps declared documented and reproducible.', 'Preprocessing steps declared NOT documented.'),
    TEMPORAL_LEAKAGE: structuralProbe('TEMPORAL_LEAKAGE', input.declared.temporalOrderingRespected, 'Temporal ordering declared respected.', 'Temporal ordering declared NOT respected — future information may explain a past point.'),
  };

  const probes = ALL_SELF_FALSIFICATION_PROBES.map((name) => results[name]!);
  const allPassed = probes.every((p) => p.result === 'PASS');
  return { probes, allPassed, reportFingerprint: fnv1a(canonicalJson(probes.map((p) => ({ name: p.name, result: p.result })))) };
}

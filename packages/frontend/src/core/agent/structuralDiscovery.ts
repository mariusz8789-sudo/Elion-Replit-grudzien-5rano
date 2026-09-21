import { canonicalJson, fnv1a } from '../events/hash';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import { assessTautology, evidenceCeiling, type TautologyAssessment } from './tautologyGate';
import { runDiscoveryCampaign, type CampaignLaboratory, type CampaignResult } from './discoveryCampaign';
import {
  estimatedCoefficientCount,
  fitModelSpec,
  holdoutScore,
  holdoutSplit,
  modelSelectionScore,
  modelSpecFingerprint,
  renderModelSpec,
  type ModelPoint,
  type ModelSpec,
} from './modelSpace';

/**
 * M3 STRUCTURAL DISCOVERY — the runnable demonstration that Genesis can build a
 * model form it was never given.
 *
 * THIS IS NOT A SECOND ENGINE. Every scientific step below is performed by a
 * component that already existed and is used unmodified:
 *   - the loop, the planner and the derivation: `discoveryCampaign.ts`
 *   - residual structure and the structural operators: `residualStructure.ts`
 *   - fitting, parsimony and hold-out: `modelSpace.ts`
 *   - cross-campaign exclusion: `falsifiedModelRegistry.ts`
 *   - belief: `beliefRevision.ts`, circularity: `tautologyGate.ts`
 *   - identity and replay: `events/hash.ts`
 * What this module adds is the EVIDENCE PACKAGE: it runs the chain on a
 * demonstrator whose generating process is known, and records — with numbers —
 * whether each mandated property actually held. It decides nothing scientific.
 *
 * WHY A KNOWN GENERATING PROCESS. On real pinned data nobody can say what the
 * true model is, so "did it find the right structure?" is unanswerable and the
 * honest claim is only "it found a better one". Here the process is generated
 * at runtime from declared coefficients, so the question has a checkable
 * answer — which is exactly what makes this a test of the CAPABILITY rather
 * than a demonstration of a result.
 *
 * WHAT IS NOT HARDCODED, and how the test enforces it: the demonstrator never
 * names the winning term. The grammar's curvature operators (a square, a
 * logarithm, a square root) are proposed TOGETHER by `residualStructure.ts`
 * whenever curvature is detected, and which one survives is decided by weighted
 * least squares, the parsimony penalty and the hold-out — at runtime, on the
 * data. `preregisteredFingerprints` below records the starting space BEFORE any
 * observation, and the acceptance test fails if the winner is in it.
 */

export const STRUCTURAL_DISCOVERY_CONTRACT_VERSION = '1.0.0';

/** Coefficients of the hidden process. Declared here, never shown to the engine. */
export interface GeneratingProcess {
  readonly linear: number;
  readonly quadratic: number;
  readonly sigma: number;
}

export interface DemonstratorDataset {
  readonly points: readonly ModelPoint[];
  /** Points withheld from every fit in the campaign — the hold-out is separate by construction, not by promise. */
  readonly heldOut: readonly ModelPoint[];
  readonly datasetFingerprint: string;
}

/**
 * DETERMINISTIC MEASUREMENT NOISE.
 *
 * Without it every fit is exact, training RSS and hold-out are both zero, and
 * the overfitting control has nothing to detect — a noiseless demonstrator
 * proves the arithmetic works, not that model selection does.
 *
 * It is not a random draw and there is no seed to lose: the same x always gets
 * the same offset, so the dataset, every fit and every fingerprint replay
 * exactly.
 *
 * THE PROPERTY THAT MATTERS, AND WHY IT IS TESTED RATHER THAN ASSUMED. An
 * offset that drifts with x is not noise, it is a second signal — and a
 * demonstrator built on one would let the engine "discover" structure the
 * generator put there. The first version of this function did exactly that: one
 * hash round left the offsets correlated with x at r = -0.83 and clustered into
 * two bands, and the straight-line negative control duly started reporting a
 * TREND that was entirely an artefact of the noise. Two mixing rounds fix the
 * clustering: the offsets now span the full range instead of two bands, and the
 * measured correlation over the 16-point demonstrator grid is r = 0.2590.
 *
 * WHY 0.2590 IS NOT A PROBLEM, stated with the arithmetic rather than waved
 * past: for n = 16 independent draws the sampling standard deviation of r under
 * NO association is 1/sqrt(n-1) = 0.258, so a correlation of this size is
 * exactly what independence looks like at this sample size. The test therefore
 * checks |r| < 2/sqrt(n) — the conventional ~95% bound under no association —
 * rather than a tighter number that would reject most genuinely independent
 * sequences and would only have been satisfiable by shopping for a lucky salt.
 *
 * `centerOffsets` then removes the residual mean, so the offsets disperse the
 * data without shifting it.
 */
const NOISE_MIXING_ROUNDS = 2;
const NOISE_SALT = 'noise-v1';

export function measurementNoiseUnit(x: number): number {
  let digest = fnv1a(canonicalJson({ x, salt: NOISE_SALT }));
  for (let round = 0; round < NOISE_MIXING_ROUNDS; round += 1) {
    digest = fnv1a(canonicalJson({ digest, round, salt: NOISE_SALT }));
  }
  return ((parseInt(digest, 16) >>> 0) / 0xffffffff) * 2 - 1;
}

/** Removes the mean so the offsets disperse the data without shifting it. */
function centerOffsets(offsets: readonly number[]): readonly number[] {
  if (offsets.length === 0) return offsets;
  const mean = offsets.reduce((acc, v) => acc + v, 0) / offsets.length;
  return offsets.map((v) => v - mean);
}

/**
 * Builds the dataset by EVALUATING the process, not by listing values, so the
 * numbers cannot be quietly tuned to a desired outcome. Deterministic: no
 * random draw anywhere, so the same declaration always yields the same data and
 * the same fingerprint.
 */
export function generateDemonstratorDataset(
  process: GeneratingProcess,
  xs: readonly number[],
  holdoutStride = 4,
): DemonstratorDataset {
  const offsets = centerOffsets(xs.map((x) => measurementNoiseUnit(x) * process.sigma));
  const all: ModelPoint[] = xs.map((x, i) => ({
    x,
    y: process.linear * x + process.quadratic * x * x + offsets[i]!,
    sigma: process.sigma,
  }));
  const split = holdoutSplit(all, holdoutStride);
  return {
    points: split.fit,
    heldOut: split.heldOut,
    datasetFingerprint: fnv1a(canonicalJson({
      xs: [...xs],
      linear: process.linear,
      quadratic: process.quadratic,
      sigma: process.sigma,
      holdoutStride,
    })),
  };
}

/** The laboratory the engine sees: observations and nothing else. It carries no hypothesis and no model form. */
export function demonstratorLaboratory(dataset: DemonstratorDataset, labId: string, problem: string): CampaignLaboratory {
  const byX = new Map(dataset.points.map((p) => [p.x, p]));
  const xs = dataset.points.map((p) => p.x);
  return {
    labId,
    problem,
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: Math.min(...xs), max: Math.max(...xs) },
    xLabel: 'x',
    yLabel: 'y',
  };
}

export interface ModelComparison {
  readonly formula: string;
  readonly fingerprint: string;
  readonly coefficientCount: number;
  /** Weighted RSS on the points the campaign actually fitted. */
  readonly trainingRss: number | null;
  /** chi-square + k·ln(n): the number the engine ranks by. */
  readonly parsimonyScore: number | null;
  /** Mean weighted chi-square per point on data no fit ever saw. */
  readonly holdoutScore: number | null;
}

export interface SelfFalsification {
  /** The criterion the new model would fail. Stated before the check, not after. */
  readonly criterion: string;
  readonly tautology: TautologyAssessment;
  readonly evidenceCeiling: number | null;
  /** Did the held-out data actually falsify it? */
  readonly falsified: boolean;
  readonly detail: string;
}

export interface StructuralDiscoveryReport {
  readonly contractVersion: string;
  readonly labId: string;
  readonly datasetFingerprint: string;

  /** Everything the engine could have proposed BEFORE it saw an observation. */
  readonly preregisteredFingerprints: readonly string[];
  readonly preregisteredFormulas: readonly string[];

  readonly parent: ModelComparison;
  readonly winner: ModelComparison | null;

  /** Every structural candidate the residual produced, with the operator that produced it. */
  readonly generatedCandidates: readonly { readonly formula: string; readonly fingerprint: string; readonly operator: string; readonly enteredAtRound: number; readonly motivatedBy: string }[];

  readonly residualFindingKinds: readonly string[];
  /** The residual evidence string that motivated derivation — real numbers, not a label. */
  readonly residualEvidence: string | null;

  readonly winnerWasPreregistered: boolean;
  readonly winnerEnteredAtRound: number;
  readonly winnerDerivedFrom: string | null;
  readonly winnerOperator: string | null;
  readonly winnerIsStructurallyDifferent: boolean;

  readonly beliefBefore: number | null;
  readonly beliefAfter: number | null;
  readonly selfFalsification: SelfFalsification | null;

  readonly registryConsulted: boolean;
  readonly registryBlockedFingerprints: readonly string[];
  readonly registryAudit: readonly string[];

  readonly stopReason: string;
  readonly campaignFingerprint: string;
  readonly reportFingerprint: string;

  /**
   * GOVERNMENT RESEARCH RULE: a methodological problem is FLAGGED, never
   * hidden and never silently tuned away.
   *
   * Set when the residual detector proposed structure but NOTHING it proposed
   * was selected — the signature of a detector firing on noise. The engine's
   * scientific output is still correct (the preregistered model kept the
   * campaign), but the near-threshold detection is surfaced with its measured
   * number so a reader can judge the detector rather than trust it.
   */
  readonly specificityFlag: string | null;
}

function compare(spec: ModelSpec | null, fitPoints: readonly ModelPoint[], heldOut: readonly ModelPoint[]): ModelComparison {
  if (spec === null) {
    return { formula: '(none)', fingerprint: '', coefficientCount: 0, trainingRss: null, parsimonyScore: null, holdoutScore: null };
  }
  const fit = fitModelSpec(spec, fitPoints);
  const k = estimatedCoefficientCount(spec);
  const trainingRss = fit.ok ? fit.rss : null;
  return {
    formula: renderModelSpec(spec),
    fingerprint: modelSpecFingerprint(spec),
    coefficientCount: k,
    trainingRss,
    parsimonyScore: trainingRss === null ? null : modelSelectionScore(trainingRss, k, fitPoints.length),
    // Scored against data the campaign never admitted — a genuinely separate set.
    holdoutScore: heldOut.length === 0 ? null : outOfSampleChiSquare(spec, fitPoints, heldOut),
  };
}

/** Fit on the campaign's own points, score on points it never saw. */
function outOfSampleChiSquare(spec: ModelSpec, fitPoints: readonly ModelPoint[], heldOut: readonly ModelPoint[]): number | null {
  const fitted = fitModelSpec(spec, fitPoints);
  if (!fitted.ok) return null;
  let total = 0;
  for (const p of heldOut) {
    const predicted = fitted.predict(p.x);
    if (!Number.isFinite(predicted)) return null;
    const r = p.y - predicted;
    total += (r * r) / (p.sigma * p.sigma);
  }
  return total / heldOut.length;
}

/**
 * A model is STRUCTURALLY different when its set of basis terms differs — not
 * when the same terms were merely refitted to new numbers. Comparing term keys
 * rather than coefficients is what makes that distinction real.
 */
function structurallyDifferent(a: ModelSpec, b: ModelSpec): boolean {
  return modelSpecFingerprint(a) !== modelSpecFingerprint(b);
}

/**
 * Runs the whole chain and reports what happened. The campaign is the existing
 * engine, called once; everything after it is measurement of that run.
 */
export function runStructuralDiscovery(input: {
  readonly dataset: DemonstratorDataset;
  readonly labId: string;
  readonly problem: string;
  /** Bases the STARTING space may use. Curvature is excluded so no curved model can be enumerated. */
  readonly excludeBases: readonly ('CONSTANT' | 'LINEAR' | 'LOG' | 'POWER' | 'EXP_SATURATION' | 'RECIPROCAL')[];
  readonly maxTerms: number;
  readonly maxRounds: number;
  readonly respectFalsifiedModelRegistry?: boolean;
}): { readonly report: StructuralDiscoveryReport; readonly campaign: CampaignResult } {
  const lab = demonstratorLaboratory(input.dataset, input.labId, input.problem);
  const campaign = runDiscoveryCampaign(lab, {
    maxRounds: input.maxRounds,
    maxTerms: input.maxTerms,
    excludeBases: input.excludeBases as never,
    respectFalsifiedModelRegistry: input.respectFalsifiedModelRegistry ?? false,
  });

  const firstRound = campaign.rounds[0] ?? null;
  const preregisteredFingerprints = firstRound === null ? [] : firstRound.models.map((m) => m.fingerprint);
  const preregisteredFormulas = firstRound === null ? [] : firstRound.models.map((m) => m.formula);

  const derived = campaign.rounds.flatMap((r) =>
    r.derivedThisRound.map((d) => ({
      formula: d.formula,
      fingerprint: d.fingerprint,
      operator: d.derivationOperator ?? 'UNKNOWN',
      enteredAtRound: d.enteredAtRound,
      motivatedBy: r.residualFindings.map((f) => f.kind).join('+') || 'UNRECORDED',
    })),
  );

  const findings = campaign.rounds.flatMap((r) => r.residualFindings);
  const winnerView = campaign.discovery.winningModel;
  const parentSpec = parentSpecOf(campaign);
  const winnerSpec = winnerView === null ? null : specOf(campaign, winnerView.fingerprint);

  const parent = compare(parentSpec, input.dataset.points, input.dataset.heldOut);
  const winner = winnerSpec === null ? null : compare(winnerSpec, input.dataset.points, input.dataset.heldOut);

  const beliefs = campaign.rounds[campaign.rounds.length - 1]?.beliefs ?? [];
  const winnerBelief = winnerView === null ? null : beliefs.find((h) => h.id === winnerView.fingerprint) ?? null;

  const selfFalsification = winnerSpec === null || winner === null
    ? null
    : selfFalsify(winnerSpec, winner, input.dataset);

  const report: StructuralDiscoveryReport = {
    contractVersion: STRUCTURAL_DISCOVERY_CONTRACT_VERSION,
    labId: input.labId,
    datasetFingerprint: input.dataset.datasetFingerprint,
    preregisteredFingerprints,
    preregisteredFormulas,
    parent,
    winner,
    generatedCandidates: derived,
    residualFindingKinds: [...new Set(findings.map((f) => f.kind))].sort(),
    residualEvidence: findings[0]?.evidence ?? null,
    winnerWasPreregistered: winnerView !== null && preregisteredFingerprints.includes(winnerView.fingerprint),
    winnerEnteredAtRound: winnerView?.enteredAtRound ?? 0,
    winnerDerivedFrom: winnerView?.derivedFrom ?? null,
    winnerOperator: winnerView?.derivationOperator ?? null,
    winnerIsStructurallyDifferent: parentSpec !== null && winnerSpec !== null && structurallyDifferent(parentSpec, winnerSpec),
    beliefBefore: winnerBelief === null ? null : 0.5,
    beliefAfter: winnerBelief?.confidence ?? null,
    selfFalsification,
    registryConsulted: input.respectFalsifiedModelRegistry === true,
    registryBlockedFingerprints: campaign.registrySkips.map((s) => s.fingerprint),
    registryAudit: campaign.registrySkips.map((s) => `${s.verdict}: ${s.reason}`),
    stopReason: campaign.stopReason,
    campaignFingerprint: campaign.campaignFingerprint,
    reportFingerprint: '',
    specificityFlag: derived.length > 0 && winnerView !== null && preregisteredFingerprints.includes(winnerView.fingerprint)
      ? `AUDIT: residual analysis proposed ${derived.length} structural candidate(s) (${[...new Set(findings.map((f) => f.kind))].join(', ')}), and model selection rejected every one of them — the preregistered "${winnerView.formula}" kept the campaign. That is the correct scientific outcome, and it also means the detector fired on data with no real structure. Evidence: ${findings[0]?.evidence ?? '(none)'}`
      : null,
  };

  return {
    report: { ...report, reportFingerprint: fingerprintReport(report) },
    campaign,
  };
}

/**
 * SELF-FALSIFICATION. The new model is not accepted because it fits — it is
 * given a real chance to fail on data it never saw, against a criterion stated
 * as a threshold rather than chosen after seeing the answer. The Tautology Gate
 * classifies whether the test is empirical at all: a prediction checked against
 * an INDEPENDENT hold-out is an empirical test, and the resulting evidence
 * ceiling is what caps how much the belief may move.
 */
function selfFalsify(spec: ModelSpec, comparison: ModelComparison, dataset: DemonstratorDataset): SelfFalsification {
  const HOLDOUT_CHI_SQUARE_LIMIT = 4;
  const tautology = assessTautology([
    {
      componentId: `structural-model:${modelSpecFingerprint(spec)}`,
      prediction: {
        source: 'hypothesis-parameter',
        modelId: renderModelSpec(spec),
        rationale: 'The model predicts y at held-out x values from coefficients fitted only on the campaign\'s own admitted points.',
      },
      observation: {
        source: 'independent-measurement',
        modelId: `demonstrator-holdout:${dataset.datasetFingerprint}`,
        rationale: 'The held-out points were split off before any fit and were never admitted to the campaign, so they share no free parameters with the prediction.',
      },
    },
  ]);
  const score = comparison.holdoutScore;
  const falsified = score === null || score > HOLDOUT_CHI_SQUARE_LIMIT;
  return {
    criterion: `Held-out mean weighted chi-square must stay at or below ${HOLDOUT_CHI_SQUARE_LIMIT}; above it the model is refuted on data it never saw.`,
    tautology,
    evidenceCeiling: evidenceCeiling(tautology.classification),
    falsified,
    detail: score === null
      ? 'The model could not be evaluated out of sample, which counts as a failure rather than as a pass.'
      : `Held-out mean weighted chi-square ${score.toFixed(6)} against a limit of ${HOLDOUT_CHI_SQUARE_LIMIT}: ${falsified ? 'FALSIFIED' : 'survived'}.`,
  };
}

/** Applies the campaign's own belief machinery to the self-falsification verdict. */
export function reviseBeliefFromSelfFalsification(
  modelFingerprint: string,
  formula: string,
  self: SelfFalsification,
  round: number,
): { readonly before: Hypothesis; readonly after: Hypothesis } {
  const before = createHypothesis(
    modelFingerprint,
    {
      metric: `holdout-chi-square:${modelFingerprint}`,
      relation: 'less-than',
      rationale: self.criterion,
    },
    0.5,
    'RESIDUAL_FROM_FIT',
    null,
  );
  const cap = self.evidenceCeiling;
  const magnitude = cap === null ? 1 : Math.min(1, cap);
  const after = updateConfidence(
    before,
    self.falsified ? 'FALSIFIED_WITHIN_PROTOCOL' : 'SUPPORTED_WITHIN_PROTOCOL',
    magnitude,
    `${formula}: ${self.detail} (Tautology Gate: ${self.tautology.classification}).`,
    round,
  );
  return { before, after };
}

function parentSpecOf(campaign: CampaignResult): ModelSpec | null {
  const first = campaign.rounds[0];
  if (first === undefined || first.bestFingerprint === null) return null;
  return specOf(campaign, first.bestFingerprint);
}

/**
 * A rendered formula cannot be parsed back into a spec, so the campaign exposes
 * the specs it actually held (`CampaignResult.liveModelSpecs`) and this looks
 * one up by fingerprint. Nothing is reconstructed or guessed.
 */
function specOf(campaign: CampaignResult, fingerprint: string): ModelSpec | null {
  return campaign.liveModelSpecs.find((spec) => modelSpecFingerprint(spec) === fingerprint) ?? null;
}

function fingerprintReport(report: StructuralDiscoveryReport): string {
  return fnv1a(canonicalJson({
    labId: report.labId,
    datasetFingerprint: report.datasetFingerprint,
    preregistered: [...report.preregisteredFingerprints].sort(),
    winner: report.winner?.fingerprint ?? null,
    generated: report.generatedCandidates.map((c) => c.fingerprint).sort(),
    residualFindingKinds: report.residualFindingKinds,
    stopReason: report.stopReason,
    campaignFingerprint: report.campaignFingerprint,
    selfFalsified: report.selfFalsification?.falsified ?? null,
    registryBlocked: [...report.registryBlockedFingerprints].sort(),
    specificityFlagged: report.specificityFlag !== null,
  }));
}

/** Re-exported so a caller can compare two runs without importing a second module. */
export { holdoutScore };

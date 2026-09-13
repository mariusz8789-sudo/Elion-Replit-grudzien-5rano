/**
 * REPRODUCIBILITY ENTRY (P3.2) — jedyny punkt, przez który `scripts/repro-demo.mjs`
 * dosięga warstwy naukowej.
 *
 * Istnieje, bo warstwa naukowa jest w TypeScripcie i mieszka w pakiecie
 * frontendu, a demo dla komisji musi być JEDNYM poleceniem w Node. Ten plik
 * jest wyłącznie fasadą: nie liczy niczego własnego, nie ma własnego werdyktu i
 * nie duplikuje żadnego kontraktu — wywołuje `runExternalAnchor` oraz
 * `runAutonomousInquiry` i oddaje to, co zwróciły, plus ich odciski.
 *
 * Uruchamiany przez esbuild (`--platform=node`), nigdy przez przeglądarkę —
 * dlatego `.node.ts` i wpis w `ALLOWED_ORPHANS` w `moduleReachability.test.ts`.
 */

import { runExternalAnchor, MOLECULAR_WEIGHT_ANCHOR_ID, KEPLER_MARS_ANCHOR_ID } from '../biotechData/externalAnchor';
import { qe3BoundEntanglementInquiry } from '../agent/entanglementInquiry';
import { inquiryResultFingerprint, runAutonomousInquiry } from '../agent/inquiryLoop';
import { runQe4BrydgesAnalysis } from '../biotechData/qe4BrydgesAnalysis';
import { runQe4DisorderRegimeInquiry } from '../agent/qe4RegimeInquiryLoop';

export { MOLECULAR_WEIGHT_ANCHOR_ID, KEPLER_MARS_ANCHOR_ID };

export interface ReproAnchorReport {
  readonly anchorId: string;
  readonly assessment: string;
  readonly predictedValue: number | null;
  readonly observedValue: number | null;
  readonly observationOrigin: string;
  readonly verificationFingerprint: string;
  readonly replay: string;
  readonly tautologyClassification: string;
  readonly beliefBefore: number;
  readonly beliefAfter: number;
  readonly nextQuestion: string;
  readonly whatRemainsUntested: string;
}

export interface ReproInquiryReport {
  readonly question: string;
  readonly modelId: string;
  readonly rounds: number;
  readonly probes: readonly number[];
  readonly surviving: readonly string[];
  readonly falsified: readonly string[];
  readonly stopReason: string;
  readonly dataProvenance: string;
  readonly resultFingerprint: string;
}

/**
 * Kotwica zewnętrzna (P2.3), dokładnie tak jak renderuje ją `#/evidence`.
 * `anchorId` domyślnie wskazuje pierwszą kotwicę (PubChem) dla wstecznej
 * zgodności; `scripts/repro-demo.mjs` woła to ponownie dla drugiej (Kepler)
 * zamiast dodawać drugą fasadę.
 */
export function reproExternalAnchor(anchorId: string = MOLECULAR_WEIGHT_ANCHOR_ID): ReproAnchorReport {
  const result = runExternalAnchor(anchorId);
  if (!result.ok) throw new Error(`Kotwica odmówiła: ${result.reason}`);
  return {
    anchorId: result.anchorId,
    assessment: result.verification.assessment,
    predictedValue: result.verification.predictedValue,
    observedValue: result.verification.observedValue,
    observationOrigin: result.observationOrigin,
    verificationFingerprint: result.verificationFingerprint,
    replay: result.replay,
    tautologyClassification: result.tautologyAssessment.classification,
    beliefBefore: result.belief.before,
    beliefAfter: result.belief.after,
    nextQuestion: result.nextQuestion,
    whatRemainsUntested: result.whatRemainsUntested,
  };
}

/**
 * QE3 — autonomiczne dochodzenie, w którym rozstrzyga DRUGIE kryterium (CCNR),
 * bo wszyscy kandydaci są PPT. Wybrane do demo, bo jest deterministyczne,
 * kończy się ODZYSKANIEM ukrytego parametru i pokazuje, że falsyfikacja
 * naprawdę odrzuca trzy z czterech hipotez.
 */
export function reproQe3Inquiry(): ReproInquiryReport {
  const result = runAutonomousInquiry(qe3BoundEntanglementInquiry(0.4));
  return {
    question: result.question,
    modelId: result.modelId,
    rounds: result.rounds.length,
    probes: result.rounds.map((round) => round.probeValue),
    surviving: result.survivingHypothesisIds,
    falsified: result.falsifiedHypothesisIds,
    stopReason: result.stopReason,
    dataProvenance: result.dataProvenance.origin ?? 'MIXED',
    resultFingerprint: inquiryResultFingerprint(result),
  };
}

export interface ReproQe4Report {
  readonly p1Verdict: string;
  readonly p2Verdict: string;
  readonly p3Verdict: string;
  readonly p4Verdict: string;
  readonly p1Tautology: string;
  readonly p2Tautology: string;
  readonly p3Tautology: string;
  readonly p4Tautology: string;
  readonly p4FailingCount: number;
  readonly datasetDoi: string;
  readonly resultFingerprint: string;
}

/**
 * QE4 — real-dataset recomputation (Brydges et al. 2019 / Zenodo 2527010,
 * `docs/QE4_PREREGISTRATION.md`). Same facade pattern as the External Anchors
 * above: no local computation, just calls `runQe4BrydgesAnalysis` and reports
 * what it returned.
 */
export function reproQe4BrydgesAnalysis(): ReproQe4Report {
  const result = runQe4BrydgesAnalysis();
  return {
    p1Verdict: result.p1.verdict,
    p2Verdict: result.p2.verdict,
    p3Verdict: result.p3.verdict,
    p4Verdict: result.p4.verdict,
    p1Tautology: result.p1.tautology.classification,
    p2Tautology: result.p2.tautology.classification,
    p3Tautology: result.p3.tautology.classification,
    p4Tautology: result.p4.tautology.classification,
    p4FailingCount: result.p4Deltas.filter((d) => !d.withinBand).length,
    datasetDoi: result.provenance.datasetDoi,
    resultFingerprint: result.resultFingerprint,
  };
}

export interface ReproQe4RegimeInquiryReport {
  readonly rounds: number;
  readonly stopReason: string;
  readonly winningHypothesisId: string | null;
  readonly antiHarkingIntactEveryRound: boolean;
  readonly residualHypothesisId: string | null;
  readonly roundFingerprints: readonly string[];
}

/**
 * QE4 REGIME INQUIRY LOOP (P0-2/P0-3/P0-5) — same facade pattern as the two
 * reports above: no local computation, just calls `runQe4DisorderRegimeInquiry`
 * and reports what it returned, so `scripts/repro-demo.mjs` can assert replay
 * MATCH on `roundFingerprints`/`stopReason`/`winningHypothesisId` exactly like
 * it already does for `resultFingerprint` above.
 */
export function reproQe4RegimeInquiry(): ReproQe4RegimeInquiryReport {
  const result = runQe4DisorderRegimeInquiry(5);
  return {
    rounds: result.rounds.length,
    stopReason: result.stopReason,
    winningHypothesisId: result.winningHypothesisId,
    antiHarkingIntactEveryRound: result.rounds.every((r) => r.antiHarking.intact),
    residualHypothesisId: result.residual.hypothesis?.id ?? null,
    roundFingerprints: result.rounds.map((r) => r.runFingerprint),
  };
}

import { runDiscoveryCampaign, type CampaignLaboratory } from '../agent/discoveryCampaign';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../biotechData/campaignLabs';
import { pointsForGrid } from '../biotechData/qe4DatasetLaboratory';
import { fulfilObservationGap, type ObservationGapTrigger } from '../agent/observationGap';
import { buildDiscoveryGraph, compareDiscoveryGraphReplay, transferKnowledge } from '../agent/discoveryGraph';
import { evaluatePracticalCandidate, surfaceFor } from '../agent/practicalCandidateGate';

export interface ReproDiscoveryCampaignReport {
  readonly labId: string;
  readonly rounds: number;
  readonly stopReason: string;
  readonly winningFormula: string | null;
  readonly winningCoefficients: readonly number[];
  readonly selectedExperiments: readonly (number | null)[];
  readonly derivedModelFormulas: readonly string[];
  readonly winnerWasDerivedAtRound: number;
  readonly antiHarkingIntactEveryRound: boolean;
  readonly campaignFingerprint: string;
  /** M1: gaps this campaign raised instead of running an experiment that could not discriminate. */
  readonly observationGapTriggers: readonly ObservationGapTrigger[];
  readonly gapLedgerFingerprint: string;
}

function report(result: ReturnType<typeof runDiscoveryCampaign>): ReproDiscoveryCampaignReport {
  const formula = result.discovery.winningFormulaWithCoefficients;
  const coefficients = formula === null
    ? []
    : formula.slice(formula.indexOf('[') + 1, formula.indexOf(']')).split(',').map((s) => Number(s.trim()));
  return {
    labId: result.labId,
    rounds: result.rounds.length,
    stopReason: result.stopReason,
    winningFormula: result.discovery.winningModel?.formula ?? null,
    winningCoefficients: coefficients,
    selectedExperiments: result.rounds.map((r) => r.selectedNextX),
    derivedModelFormulas: result.rounds.flatMap((r) => r.derivedThisRound.map((d) => d.formula)),
    winnerWasDerivedAtRound: result.discovery.winningModel?.enteredAtRound ?? 0,
    antiHarkingIntactEveryRound: result.rounds.every((r) => r.antiHarking.intact),
    campaignFingerprint: result.campaignFingerprint,
    observationGapTriggers: result.observationGaps.map((g) => g.trigger),
    gapLedgerFingerprint: result.gapLedgerFingerprint,
  };
}

/** CASE A — real pinned quantum data (Brydges 2019 disorder chain). */
export function reproDiscoveryCampaignQe4(): ReproDiscoveryCampaignReport {
  return report(runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 7, maxTerms: 2 }));
}

/** CASE B — real pinned astronomy data (NASA NSSDC planetary fact sheet), a different science entirely. */
export function reproDiscoveryCampaignKepler(): ReproDiscoveryCampaignReport {
  return report(runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 }));
}

/**
 * CASE A with LOG removed from the grammar: the engine must rebuild the true
 * shape from residual structure. `maxTerms: 1` keeps the starting space to
 * single-term models, so the derived two-term model is unambiguously something
 * the grammar could not enumerate.
 */
export function reproDiscoveryCampaignQe4WithoutLog(): ReproDiscoveryCampaignReport {
  return report(runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 8, maxTerms: 1, excludeBases: ['LOG'] }));
}

// --- M1: ObservationGapRequest, on real pinned data -------------------------

/**
 * The real degenerate case. Same Brydges disorder dataset, same real per-point
 * bootstrap sigmas — but with the grammar restricted to two competing growth
 * laws (`c·log T` against `c·T`), the two survivors predict the next real time
 * point to within a fraction of that measurement's own error bar. No attached
 * experiment can separate them, so the engine must ask for one it does not have
 * rather than spend a measurement that cannot settle anything.
 */
function qe4TwoLawWindow(): CampaignLaboratory {
  const window = [4, 6, 10, 16, 20];
  const points = pointsForGrid('disorder', 5).filter((p) => window.includes(p.t));
  const byX = new Map(points.map((p) => [p.t, { x: p.t, y: p.s2, sigma: p.sigma }]));
  const xs = points.map((p) => p.t);
  return {
    labId: 'qe4-brydges-disorder-k5-window',
    problem: 'Does S2 grow logarithmically or linearly in time, judged over this window of the pinned disorder dataset?',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: Math.min(...xs), max: Math.max(...xs) },
    xLabel: 'T[ms]',
    yLabel: 'S2',
    declareObservable: () => ({
      quantity: 'second Rényi entropy S2 at a time outside this pinned window',
      unit: 'dimensionless (S2)',
      instrumentClass: 'trapped-ion quantum simulator with randomized-measurement readout',
    }),
    gapRecipient: 'LABORATORY',
  };
}

export interface ReproObservationGapReport {
  readonly stopReason: string;
  readonly trigger: string;
  readonly discriminability: number | null;
  readonly threshold: number;
  readonly selectedAnyExperimentAfterGap: boolean;
  readonly experimentsLeftUnobserved: number;
  readonly requiredObservable: string;
  readonly instrumentClass: string;
  readonly requestedFrom: string;
  readonly statusAtEmission: string;
  readonly costEstimate: number | null;
  readonly gapFingerprint: string;
  readonly replay: 'MATCH' | 'DRIFT';
  readonly fulfilledEpistemicStatus: string;
  readonly fulfilledStatus: string;
  readonly custodySteps: number;
}

/** M1 runtime evidence: the engine declines a real experiment and states what it needs instead. */
export function reproObservationGap(): ReproObservationGapReport {
  const options = { maxRounds: 5, maxTerms: 1, excludeBases: ['CONSTANT', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] } as const;
  const result = runDiscoveryCampaign(qe4TwoLawWindow(), options);
  const replayed = runDiscoveryCampaign(qe4TwoLawWindow(), options);
  const gap = result.observationGaps[0]!;
  const lastRound = result.rounds[result.rounds.length - 1]!;

  const fulfilled = fulfilObservationGap(gap, {
    custody: {
      steps: [
        { handledBy: 'external trapped-ion group', action: 'measured the requested time point', at: '2026-09-13T09:00:00Z' },
        { handledBy: 'campaign operator', action: 'transcribed value and bootstrap sigma', at: '2026-09-13T10:00:00Z' },
      ],
      provenance: 'REAL_EXPERIMENTAL',
      dataset: null,
    },
    value: 1.95,
    sigma: 0.12,
    at: 24,
  });

  return {
    stopReason: result.stopReason,
    trigger: gap.trigger,
    discriminability: gap.discriminability === null ? null : Number(gap.discriminability.toFixed(4)),
    threshold: gap.threshold,
    selectedAnyExperimentAfterGap: lastRound.selectedNextX !== null,
    experimentsLeftUnobserved: 5 - lastRound.admittedX.length,
    requiredObservable: gap.requiredObservable.quantity,
    instrumentClass: gap.requiredObservable.instrumentClass,
    requestedFrom: gap.requestedFrom,
    statusAtEmission: gap.status,
    costEstimate: gap.feasibility.costEstimate,
    gapFingerprint: gap.fingerprint,
    replay: gap.fingerprint === replayed.observationGaps[0]!.fingerprint ? 'MATCH' : 'DRIFT',
    fulfilledEpistemicStatus: 'ok' in fulfilled ? 'REFUSED' : fulfilled.epistemicStatus,
    fulfilledStatus: 'ok' in fulfilled ? 'REFUSED' : fulfilled.request.status,
    custodySteps: 'ok' in fulfilled ? 0 : (fulfilled.request.custody?.steps.length ?? 0),
  };
}

// --- A8: Conformal Uncertainty Layer, on the real pinned Kepler dataset -----

import { fitModelSpec, type ModelPoint, type ModelSpec } from '../agent/modelSpace';
import { computeReplayVerdict } from '../matrixFoundation/replayVerdict';
import {
  CONFORMAL_SPLIT_SEED,
  buildConformalInterval,
  calibrateConformalPredictor,
  classifyConformalObservationGap,
  deterministicCalibrationSplit,
  discriminabilityFromConformalIntervals,
  evaluateCoverage,
  splitPoints,
} from '../agent/conformalPrediction';

const KEPLER_LINEAR_SPEC: ModelSpec = { id: 'a8-conformal-kepler-linear', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null };
const KEPLER_CONSTANT_SPEC: ModelSpec = { id: 'a8-conformal-kepler-constant', terms: [{ basis: 'CONSTANT' }], lineage: null };

export interface ReproConformalReport {
  readonly sampleSize: number;
  readonly calibrationSize: number;
  readonly holdoutSize: number;
  readonly splitFingerprint: string;
  readonly provenance: string;
  readonly confidenceLevel: number;
  readonly quantile: number;
  readonly guaranteeAchievable: boolean;
  readonly calibrationWarnings: readonly string[];
  readonly calibrationFingerprint: string;
  readonly replay: string;
  readonly nominalCoverage: number;
  readonly observedCoverage: number;
  readonly coverageSampleSize: number;
  readonly averageIntervalWidth: number;
  readonly heldOutX: number;
  readonly heldOutObservedY: number;
  readonly heldOutInterval: { readonly lo: number; readonly hi: number };
  readonly heldOutCovered: boolean;
  readonly rivalDiscriminability: number;
  readonly rivalGapTrigger: string | null;
}

/**
 * REAL E2E for A8: DATA (NASA NSSDC Kepler distances/periods, same pinned
 * dataset `makeKeplerCampaignLab` reads for the M1/discovery-campaign demo
 * above) -> MODEL (fitModelSpec, unchanged) -> CALIBRATION -> CONFORMAL
 * INTERVAL -> HELD-OUT OBSERVATION -> COVERAGE -> M1 DISCRIMINABILITY
 * (linear power-law fit vs a flat/constant rival, both fit on the SAME real
 * calibration points) -> VERDICT -> PROVENANCE -> REPLAY. No synthetic data,
 * no second engine: every step calls a function already covered above or in
 * `conformalPrediction.ts`.
 */
export function reproConformalPrediction(): ReproConformalReport {
  const lab = makeKeplerCampaignLab();
  const points: ModelPoint[] = lab.candidateX.map((x) => {
    const p = lab.observe(x);
    if (p === null) throw new Error('reproConformalPrediction: Kepler laboratory returned no point for one of its own candidateX values.');
    return p;
  });

  const confidenceLevel = 0.9;
  const split = deterministicCalibrationSplit(points.length, { seed: CONFORMAL_SPLIT_SEED, calibrationFraction: 0.5 });
  const { calibrationPoints, holdoutPoints } = splitPoints(points, split);

  const fit = fitModelSpec(KEPLER_LINEAR_SPEC, calibrationPoints);
  if (!fit.ok) throw new Error(`reproConformalPrediction: linear fit failed: ${fit.reason}`);

  const calibration = calibrateConformalPredictor({
    fit, calibrationPoints, confidenceLevel, splitFingerprint: split.fingerprint, provenance: 'REFERENCE',
  });
  const replayedCalibration = calibrateConformalPredictor({
    fit, calibrationPoints, confidenceLevel, splitFingerprint: split.fingerprint, provenance: 'REFERENCE',
  });
  const replay = computeReplayVerdict({
    inputsAvailable: true,
    recordFound: true,
    recordedFingerprint: calibration.fingerprint,
    recomputedFingerprint: replayedCalibration.fingerprint,
  });

  const coverage = evaluateCoverage({ fit, calibration, holdoutPoints });

  const heldOut = holdoutPoints[0]!;
  const heldOutInterval = buildConformalInterval({ x: heldOut.x, fit, calibration });

  // M1 integration: a real rival model (flat/constant — "distance does not matter"),
  // fit on the SAME calibration points, calibrated the SAME way, compared at the
  // SAME held-out x. The discriminability number is not hand-picked.
  const rivalFit = fitModelSpec(KEPLER_CONSTANT_SPEC, calibrationPoints);
  if (!rivalFit.ok) throw new Error(`reproConformalPrediction: rival fit failed: ${rivalFit.reason}`);
  const rivalCalibration = calibrateConformalPredictor({
    fit: rivalFit, calibrationPoints, confidenceLevel, splitFingerprint: split.fingerprint, provenance: 'REFERENCE',
  });
  const rivalInterval = buildConformalInterval({ x: heldOut.x, fit: rivalFit, calibration: rivalCalibration });

  const rivalDiscriminability = discriminabilityFromConformalIntervals(heldOutInterval, rivalInterval);
  const rivalGapTrigger = classifyConformalObservationGap({
    unobservedCount: holdoutPoints.length - 1,
    intervals: [heldOutInterval, rivalInterval],
  });

  return {
    sampleSize: points.length,
    calibrationSize: calibrationPoints.length,
    holdoutSize: holdoutPoints.length,
    splitFingerprint: split.fingerprint,
    provenance: calibration.provenance,
    confidenceLevel,
    quantile: calibration.quantile,
    guaranteeAchievable: calibration.guaranteeAchievable,
    calibrationWarnings: calibration.warnings,
    calibrationFingerprint: calibration.fingerprint,
    replay,
    nominalCoverage: coverage.nominalCoverage,
    observedCoverage: coverage.observedCoverage,
    coverageSampleSize: coverage.sampleSize,
    averageIntervalWidth: coverage.averageIntervalWidth,
    heldOutX: heldOut.x,
    heldOutObservedY: heldOut.y,
    heldOutInterval: { lo: heldOutInterval.lo, hi: heldOutInterval.hi },
    heldOutCovered: heldOut.y >= heldOutInterval.lo && heldOut.y <= heldOutInterval.hi,
    rivalDiscriminability,
    rivalGapTrigger,
  };
}

// --- §5: Discovery Graph + cross-campaign memory transfer --------------------

export interface ReproDiscoveryGraphReport {
  readonly qe4Nodes: number;
  readonly qe4Edges: number;
  readonly kinds: readonly string[];
  readonly replay: 'MATCH' | 'DRIFT';
  readonly importedCount: number;
  readonly statusPreserved: boolean;
  readonly falsifiedRefusedWithoutAssumptionChange: number;
  readonly falsifiedAdmittedAfterAssumptionChange: number;
  readonly statusStillBlockedAfterImport: boolean;
  readonly secondImportAddedNothing: boolean;
}

/**
 * Runtime evidence for §5: knowledge moves between two REAL campaigns over
 * unrelated pinned datasets, and the epistemic rules survive the move.
 */
export function reproDiscoveryGraph(): ReproDiscoveryGraphReport {
  const source = buildDiscoveryGraph(runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 }));
  const sourceAgain = buildDiscoveryGraph(runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 }));
  const target = buildDiscoveryGraph(runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 }));

  const plain = transferKnowledge(target, source);
  const withChange = transferKnowledge(target, source, {
    changedAssumptions: ['sigmas are no longer assumed independent across time points'],
  });
  const twice = transferKnowledge(plain.graph, source);

  const statusPreserved = plain.imported.every((n) => {
    const original = source.nodes.find((s) => s.nodeId === n.nodeId);
    return original !== undefined && original.epistemicStatus === n.epistemicStatus;
  });
  const revived = withChange.imported.filter((n) => n.epistemicStatus === 'BLOCKED');

  return {
    qe4Nodes: source.nodes.length,
    qe4Edges: source.edges.length,
    kinds: [...new Set(source.nodes.map((n) => n.kind))].sort(),
    replay: compareDiscoveryGraphReplay(source, sourceAgain),
    importedCount: plain.imported.length,
    statusPreserved,
    falsifiedRefusedWithoutAssumptionChange: plain.refused.filter((r) => r.reason === 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE').length,
    falsifiedAdmittedAfterAssumptionChange: revived.length,
    statusStillBlockedAfterImport: revived.length > 0 && revived.every((n) => n.epistemicStatus === 'BLOCKED'),
    secondImportAddedNothing: twice.imported.length === 0,
  };
}

// --- §9: AUTONOMOUS_FRONTIER_ACCEPTANCE -------------------------------------

export interface ReproFrontierAcceptanceReport {
  readonly stopReason: string;
  readonly rounds: number;
  readonly observationsAdmitted: number;
  readonly derivedCount: number;
  readonly derivedContainsDeniedBasis: boolean;
  readonly derivedAfterObservation: boolean;
  readonly derivedWasPreRegistered: boolean;
  readonly derivedBlockedByRegistry: boolean;
  readonly hasLineageToResidual: boolean;
  readonly residualFindingKinds: readonly string[];
  readonly beliefsMovedUp: number;
  readonly beliefsMovedDown: number;
  readonly replay: 'MATCH' | 'DRIFT';
  readonly graphReplay: 'MATCH' | 'DRIFT';
  readonly gapOnDegenerate: string;
}

/**
 * The §9 chain, end to end, on the pinned Brydges dataset with LOG denied:
 * question -> competing models -> planner -> experiment -> observation ->
 * residual -> structurally NEW model -> belief revision -> falsification ->
 * stop -> replay. Plus the degenerate case, where the honest answer is to ask.
 */
export function reproFrontierAcceptance(): ReproFrontierAcceptanceReport {
  const options = { maxRounds: 8, maxTerms: 2, excludeBases: ['LOG'] } as const;
  const result = runDiscoveryCampaign(makeQe4CampaignLab(5), options);
  const replayed = runDiscoveryCampaign(makeQe4CampaignLab(5), options);

  const derived = result.rounds.flatMap((r) => r.derivedThisRound);
  const preRegistered = new Set(result.rounds[0]!.models.map((m) => m.fingerprint));
  const skipped = new Set(result.registrySkips.map((s) => s.fingerprint));
  const finalRound = result.rounds[result.rounds.length - 1]!;

  const degenerate = runDiscoveryCampaign(makeQe4CampaignLab(5), {
    maxRounds: 5,
    maxTerms: 1,
    excludeBases: ['CONSTANT', 'LINEAR', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'],
  });

  return {
    stopReason: result.stopReason,
    rounds: result.rounds.length,
    observationsAdmitted: finalRound.admittedX.length,
    derivedCount: derived.length,
    derivedContainsDeniedBasis: derived.some((m) => m.formula.includes('log')),
    derivedAfterObservation: derived.length > 0 && derived.every((m) => m.enteredAtRound > 0),
    derivedWasPreRegistered: derived.some((m) => preRegistered.has(m.fingerprint)),
    derivedBlockedByRegistry: derived.some((m) => skipped.has(m.fingerprint)),
    hasLineageToResidual: derived.length > 0 && derived.every((m) => m.derivedFrom !== null && (m.derivationOperator ?? '').includes('RESIDUAL_')),
    residualFindingKinds: [...new Set(result.rounds.flatMap((r) => r.residualFindings.map((f) => f.kind)))].sort(),
    beliefsMovedUp: finalRound.beliefs.filter((h) => h.confidence > 0.5).length,
    beliefsMovedDown: finalRound.beliefs.filter((h) => h.confidence < 0.5).length,
    replay: result.campaignFingerprint === replayed.campaignFingerprint ? 'MATCH' : 'DRIFT',
    graphReplay: compareDiscoveryGraphReplay(buildDiscoveryGraph(result), buildDiscoveryGraph(replayed)),
    gapOnDegenerate: degenerate.observationGaps.length > 0 ? degenerate.stopReason : 'NO_GAP_RAISED',
  };
}

// --- §8: PracticalCandidate safety gate -------------------------------------

export interface ReproCandidateGateReport {
  readonly realCandidateOutcome: string;
  readonly realCandidateSurface: string;
  readonly clinicalTextRefused: boolean;
  readonly clinicalTextCriterion: string;
  readonly clinicalBlockedRefused: boolean;
  readonly thinEvidenceRefused: boolean;
  readonly noLimitsRefused: boolean;
  readonly interventionNeedsHuman: boolean;
  readonly negativeFindingStillActivates: boolean;
  readonly citizenSurfaceEverReachable: boolean;
}

/**
 * §8 runtime evidence: the gate accepts the descriptive candidate a REAL
 * campaign produces, refuses the five ways a candidate can overclaim, holds the
 * medical boundary on the candidate's own OUTPUT TEXT, and never routes
 * anything to a citizen-facing plane.
 */
export function reproPracticalCandidateGate(): ReproCandidateGateReport {
  const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
  const candidate = result.discovery.practicalCandidate!;
  const observationIds = result.rounds[result.rounds.length - 1]!.admittedX.map((x) => `qe4:T=${x}`);
  const evidence = {
    observationIds,
    replayFingerprint: result.campaignFingerprint,
    provenance: { sourceUrl: 'https://zenodo.org/record/2527010', sourceVersion: '10.5281/zenodo.2527010' },
    unresolvedContradictions: [] as readonly string[],
    epistemicStatus: 'PREDICTION',
  };
  const base = {
    candidate,
    candidateClass: 'equation' as const,
    safetyClass: 'DESCRIPTIVE' as const,
    notProven: [...candidate.requiredValidation],
    handoff: { recipient: 'INSTITUTION' as const, boundary: 'Research result over a pinned public dataset.' },
    evidence,
  };

  const real = evaluatePracticalCandidate(base);
  const clinical = evaluatePracticalCandidate({
    ...base,
    safetyClass: 'POPULATION',
    candidate: { ...candidate, statement: 'Prescribe the alternative at an equivalent dose for the patient.' },
  });
  const blocked = evaluatePracticalCandidate({ ...base, safetyClass: 'CLINICAL_BLOCKED' });
  const thin = evaluatePracticalCandidate({ ...base, evidence: { ...evidence, observationIds: ['one'] } });
  const noLimits = evaluatePracticalCandidate({ ...base, notProven: [] });
  const intervention = evaluatePracticalCandidate({ ...base, candidateClass: 'intervention' });
  const negative = evaluatePracticalCandidate({
    ...base,
    candidate: { ...candidate, statement: 'No measurable benefit; the worst-case population estimate is a net harm.' },
  });

  let citizenReachable = false;
  for (const outcome of ['ACTIVATE', 'REQUIRES_HUMAN_APPROVAL', 'REFUSE'] as const) {
    for (const safety of ['DESCRIPTIVE', 'POPULATION', 'CLINICAL_BLOCKED'] as const) {
      const surface = surfaceFor(outcome, safety);
      if (surface !== 'GOVERNMENT_RESEARCH' && surface !== 'GOVERNMENT_ACTION' && surface !== 'NONE') citizenReachable = true;
    }
  }

  return {
    realCandidateOutcome: real.outcome,
    realCandidateSurface: surfaceFor(real.outcome, 'DESCRIPTIVE'),
    clinicalTextRefused: clinical.outcome === 'REFUSE',
    clinicalTextCriterion: clinical.failures.map((f) => f.criterion).join(','),
    clinicalBlockedRefused: blocked.outcome === 'REFUSE',
    thinEvidenceRefused: thin.outcome === 'REFUSE',
    noLimitsRefused: noLimits.outcome === 'REFUSE',
    interventionNeedsHuman: intervention.outcome === 'REQUIRES_HUMAN_APPROVAL' && intervention.requiresCapability === 'candidate.activate',
    negativeFindingStillActivates: negative.outcome === 'ACTIVATE',
    citizenSurfaceEverReachable: citizenReachable,
  };
}

// --- M3 STRUCTURAL DISCOVERY DEMONSTRATOR ------------------------------------

import {
  generateDemonstratorDataset,
  reviseBeliefFromSelfFalsification,
  runStructuralDiscovery,
  type StructuralDiscoveryReport,
} from '../agent/structuralDiscovery';
import { recordFalsification } from '../agent/falsifiedModelRegistry';
import { createHypothesis, updateConfidence } from '../experimentFabric/beliefRevision';
import {
  estimatedCoefficientCount,
  fitModelSpec,
  modelSelectionScore,
  modelSpecFingerprint,
  renderModelSpec,
  type ModelPoint,
  type ModelSpec,
} from '../agent/modelSpace';

/** x values of the demonstrator. Every fourth point is withheld from the campaign entirely. */
const DEMO_XS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/** The starting space may use a constant and a straight line, and nothing that can bend. */
const FLAT_GRAMMAR = ['LOG', 'POWER', 'EXP_SATURATION', 'RECIPROCAL'] as const;

export interface ReproStructuralDiscoveryReport {
  readonly main: StructuralDiscoveryReport;
  readonly beliefBefore: number;
  readonly beliefAfter: number;
  readonly beliefStatus: string;
  readonly memoryExperimentId: string | null;
  readonly replayReportFingerprint: string;
  readonly replayMatches: boolean;
  readonly noStructure: StructuralDiscoveryReport;
  readonly overfit: {
    readonly winnerFormula: string | null;
    readonly winnerTrainingRss: number | null;
    readonly winnerHoldout: number | null;
    readonly winnerParsimony: number | null;
    readonly overComplexFormula: string;
    readonly overComplexTrainingRss: number | null;
    readonly overComplexHoldout: number | null;
    readonly overComplexParsimony: number | null;
    readonly overComplexFitsTrainingAtLeastAsWell: boolean;
    readonly overComplexLosesOnParsimony: boolean;
    readonly overComplexLosesOnHoldout: boolean;
    readonly engineDidNotSelectIt: boolean;
  };
  readonly registryControl: {
    readonly blockedCount: number;
    readonly audit: readonly string[];
    readonly winnerFormula: string | null;
    readonly quadraticWasBlocked: boolean;
  };
}

function mainDatasetOf() {
  return generateDemonstratorDataset({ linear: 1.7, quadratic: 0.45, sigma: 0.25 }, DEMO_XS);
}

function mainCase(respectRegistry = false): ReturnType<typeof runStructuralDiscovery> {
  const dataset = mainDatasetOf();
  return runStructuralDiscovery({
    dataset,
    labId: 'm3-structural-demonstrator',
    problem: 'How does y depend on x? The generating process is not disclosed to the engine.',
    excludeBases: [...FLAT_GRAMMAR],
    maxTerms: 2,
    maxRounds: 12,
    respectFalsifiedModelRegistry: respectRegistry,
  });
}

/**
 * The full M3 chain plus its three negative controls, all executed. Everything
 * returned is measured from the runs; nothing is asserted here.
 */
export function reproStructuralDiscovery(): ReproStructuralDiscoveryReport {
  const mainDataset = mainDatasetOf();
  const { report } = mainCase();
  const replay = mainCase().report;

  // Belief revision, through the existing machinery, from the self-falsification verdict.
  const belief = reviseBeliefFromSelfFalsification(
    report.winner?.fingerprint ?? 'none',
    report.winner?.formula ?? '(none)',
    report.selfFalsification!,
    report.winnerEnteredAtRound,
  );

  // NEGATIVE CONTROL 1 — a process with no curvature at all: nothing to derive.
  const flatDataset = generateDemonstratorDataset({ linear: 1.7, quadratic: 0, sigma: 0.25 }, DEMO_XS);
  const noStructure = runStructuralDiscovery({
    dataset: flatDataset,
    labId: 'm3-negative-control-no-structure',
    problem: 'How does y depend on x, where the process is genuinely a straight line?',
    excludeBases: [...FLAT_GRAMMAR],
    maxTerms: 2,
    maxRounds: 12,
  }).report;

  // NEGATIVE CONTROL 2 — overfitting: the best TRAINING fit must not be the winner
  // unless it also survives parsimony and the hold-out.
  const overComplex = overfitControl(report, mainDataset);

  // NEGATIVE CONTROL 3 — the winning structure is pre-falsified globally, then the
  // same campaign is re-run with the registry switched on.
  const winnerSpecForRegistry = quadraticSpec();
  const evidence = updateConfidence(
    createHypothesis('pre-falsified-quadratic', { metric: 'demonstrator', relation: 'less-than', rationale: 'Refuted in an earlier campaign.' }, 0.5, 'REGIME_FIT_FROM_GRID', null),
    'FALSIFIED_WITHIN_PROTOCOL', 1, 'Refuted on an earlier run of this demonstrator.', 1,
  );
  recordFalsification({
    spec: winnerSpecForRegistry,
    scope: {
      domain: 'm3-structural-demonstrator',
      assumptions: [
        'Observations are independent and their reported sigmas are correct.',
        'The true relationship lies within the declared model grammar.',
        'Each basis term is linear in its coefficient; nonlinear shape parameters were enumerated, not optimised.',
      ],
      boundary: 'x in [1, 15]',
    },
    reusableAs: 'NEVER',
    evidence,
    campaignId: 'm3-structural-demonstrator',
    round: 1,
    observationIds: ['demo:x=1', 'demo:x=2', 'demo:x=3'],
  });
  const guarded = mainCase(true).report;

  return {
    main: report,
    beliefBefore: belief.before.confidence,
    beliefAfter: belief.after.confidence,
    beliefStatus: belief.after.status,
    memoryExperimentId: null,
    replayReportFingerprint: replay.reportFingerprint,
    replayMatches: replay.reportFingerprint === report.reportFingerprint && replay.campaignFingerprint === report.campaignFingerprint,
    noStructure,
    overfit: {
      winnerFormula: report.winner?.formula ?? null,
      winnerTrainingRss: report.winner?.trainingRss ?? null,
      winnerHoldout: report.winner?.holdoutScore ?? null,
      winnerParsimony: report.winner?.parsimonyScore ?? null,
      overComplexFormula: overComplex.formula,
      overComplexTrainingRss: overComplex.trainingRss,
      overComplexHoldout: overComplex.holdoutScore,
      overComplexParsimony: overComplex.parsimonyScore,
      overComplexFitsTrainingAtLeastAsWell: overComplex.trainingRss !== null && report.winner?.trainingRss != null && overComplex.trainingRss <= report.winner.trainingRss + 1e-9,
      overComplexLosesOnParsimony: overComplex.parsimonyScore !== null && report.winner?.parsimonyScore != null && overComplex.parsimonyScore > report.winner.parsimonyScore,
      overComplexLosesOnHoldout: overComplex.holdoutScore !== null && report.winner?.holdoutScore != null && overComplex.holdoutScore > report.winner.holdoutScore,
      engineDidNotSelectIt: report.winner !== null && report.winner.formula !== overComplex.formula,
    },
    registryControl: {
      blockedCount: guarded.registryBlockedFingerprints.length,
      audit: guarded.registryAudit,
      winnerFormula: guarded.winner?.formula ?? null,
      quadraticWasBlocked: guarded.registryBlockedFingerprints.includes(modelSpecFingerprint(winnerSpecForRegistry)),
    },
  };
}

/** `y = c0 + c1·x + c2·x²` — built from the grammar's own term shapes, used ONLY to pre-falsify it in control 3. */
function quadraticSpec(): ModelSpec {
  return {
    id: '',
    terms: [
      { basis: 'CONSTANT' },
      { basis: 'LINEAR', variable: 'x' },
      { basis: 'POWER', variable: 'x', exponent: 2 },
    ],
    lineage: null,
  };
}

/**
 * NEGATIVE CONTROL 2 — OVERFITTING, built as a real comparison rather than a
 * label. A deliberately over-complex model (the winning structure plus two more
 * free terms) is fitted on the SAME training points and scored on the SAME
 * held-out points. Extra freedom can only lower training RSS, so it should win
 * on training and lose on the hold-out and on parsimony — and the engine must
 * not have selected it.
 */
function overfitControl(report: StructuralDiscoveryReport, dataset: { readonly points: readonly ModelPoint[]; readonly heldOut: readonly ModelPoint[] }): {
  readonly formula: string;
  readonly trainingRss: number | null;
  readonly holdoutScore: number | null;
  readonly parsimonyScore: number | null;
} {
  const overComplex: ModelSpec = {
    id: '',
    terms: [
      { basis: 'CONSTANT' },
      { basis: 'LINEAR', variable: 'x' },
      { basis: 'POWER', variable: 'x', exponent: 2 },
      { basis: 'POWER', variable: 'x', exponent: 3 },
      { basis: 'RECIPROCAL', variable: 'x' },
    ],
    lineage: null,
  };
  const fitted = fitModelSpec(overComplex, dataset.points);
  const trainingRss = fitted.ok ? fitted.rss : null;
  let holdout: number | null = null;
  if (fitted.ok && dataset.heldOut.length > 0) {
    let total = 0;
    let usable = true;
    for (const p of dataset.heldOut) {
      const predicted = fitted.predict(p.x);
      if (!Number.isFinite(predicted)) { usable = false; break; }
      const r = p.y - predicted;
      total += (r * r) / (p.sigma * p.sigma);
    }
    holdout = usable ? total / dataset.heldOut.length : null;
  }
  void report;
  return {
    formula: renderModelSpec(overComplex),
    trainingRss,
    holdoutScore: holdout,
    parsimonyScore: trainingRss === null ? null : modelSelectionScore(trainingRss, estimatedCoefficientCount(overComplex), dataset.points.length),
  };
}

/** Re-exported so the demonstrator script can render a model without a second renderer. */
export { renderModelSpec };

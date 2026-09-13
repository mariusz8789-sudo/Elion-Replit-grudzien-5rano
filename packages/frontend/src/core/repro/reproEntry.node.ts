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

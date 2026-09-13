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

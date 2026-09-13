import { fnv1a, canonicalJson } from '../events/hash';
import { generateQe4RegimeHypotheses, type Qe4RegimeHypothesisResult } from './qe4RegimeHypotheses';

/**
 * P0-6 (Discovery Engine, `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md`
 * section 4/7) — every round of an autonomous discovery loop must write a
 * fingerprinted, replay-checkable record, mirroring `externalDatasetCase.ts`'s
 * own `caseFingerprint`/`compareExternalDatasetCaseReplay` pattern.
 *
 * Scoped honestly to what P0 has TODAY: hypothesis generation from the grid
 * (P0.1's `DatasetLaboratory` + P0.2's `generateQe4RegimeHypotheses`). This is
 * NOT a full campaign round (no planner selection yet — P0-1, not built; no
 * stopping rule yet — P0-3; no adversarial pass yet — P0-5) and NOT a
 * `DiscoveryState` record (P1, a separate, larger item in the classification).
 * Extending this record to carry a planner's pick, a stop reason, or an
 * adversarial-pass verdict is the natural next step once those exist — this
 * module does not fabricate placeholder fields for work nobody has done yet.
 */

export const QE4_REGIME_ROUND_CONTRACT_VERSION = '1.0.0';

export interface Qe4RegimeRound {
  readonly contractVersion: string;
  readonly dataset: 'clean' | 'disorder';
  readonly k: number;
  readonly hypotheses: readonly Qe4RegimeHypothesisResult[];
  readonly roundFingerprint: string;
}

/**
 * Builds one round's record. Computes nothing about S2 or belief itself --
 * pure delegation to `generateQe4RegimeHypotheses`, exactly like
 * `qe4EvidenceCase.ts` is pure glue over `qe4BrydgesAnalysis.ts`. The
 * fingerprint covers only the DECLARED round inputs and each hypothesis's
 * own already-computed identity (id, verdict, confidence, tautology
 * classification) -- not the full reasons/history arrays, so it stays a
 * compact, stable round identity rather than duplicating what each
 * hypothesis's own fields already carry.
 */
export function buildQe4RegimeRound(dataset: 'clean' | 'disorder', k: number): Qe4RegimeRound {
  const hypotheses = generateQe4RegimeHypotheses(dataset, k);
  const roundFingerprint = fnv1a(
    canonicalJson({
      dataset,
      k,
      hypotheses: hypotheses.map((h) => ({
        id: h.hypothesis.id,
        verdict: h.verdict,
        confidence: h.hypothesis.confidence,
        tautologyClassification: h.tautology.classification,
      })),
    }),
  );
  return { contractVersion: QE4_REGIME_ROUND_CONTRACT_VERSION, dataset, k, hypotheses, roundFingerprint };
}

export type Qe4RegimeRoundReplayStatus = 'MATCH' | 'DRIFT';

/** Same shape as `externalDatasetCase.ts::compareExternalDatasetCaseReplay`: fingerprint equality, nothing else. */
export function compareQe4RegimeRoundReplay(a: Qe4RegimeRound, b: Qe4RegimeRound): Qe4RegimeRoundReplayStatus {
  return a.roundFingerprint === b.roundFingerprint ? 'MATCH' : 'DRIFT';
}

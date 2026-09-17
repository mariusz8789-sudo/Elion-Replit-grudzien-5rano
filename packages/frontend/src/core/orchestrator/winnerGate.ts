import { canonicalJson, fnv1a } from '../events/hash';
import { MINIMUM_OBSERVATIONS } from '../agent/practicalCandidateGate';
import { DEFAULT_EVIDENCE_CLASS_RANK, type EvidenceClass } from '../agent/evidenceProvenance';
import type { Verdict } from './contracts';

/**
 * WINNER PROMOTION GATE (docs/DECISIONS.md D-057, "DOBUDOWANIE RESZTY
 * MASZYNY" pass, item D).
 *
 * NO SECOND EVIDENCE-MINIMUM RULE. `MINIMUM_OBSERVATIONS` is IMPORTED from
 * `core/agent/practicalCandidateGate.ts` — the real, existing gate that
 * already refuses a `PracticalCandidate` fewer than this many real
 * observations behind it. This module does not redeclare that number; if
 * that constant ever changes, this gate changes with it automatically.
 * Likewise "how strong is this evidence" reuses
 * `core/agent/evidenceProvenance.ts::DEFAULT_EVIDENCE_CLASS_RANK` rather
 * than a bundled hand-picked STRONG-class list — "strong" here means
 * ranked at or above `INDIRECT_RANDOMISED`, the same ordering every other
 * evidence-ranking decision in this repo already uses by default.
 *
 * WHERE THIS SITS. `orchestrator.ts::runScientificDiscovery` calls
 * `canPromoteToWinnerRecord` between the adjudicator's `AdjudicationOutcome`
 * (stage `15_ADJUDICATE_D047`, produced by whatever real or test adapter
 * implements `OrchestratorAdapters.adjudicate` — for a production run, the
 * D-047 Genesis Adjudication Protocol) and `A.buildRecipe` (stage
 * `18_RECIPE_OR_LOCK`). A `WINNER` verdict from adjudication is necessary
 * but not sufficient: this gate is the second, independent check that the
 * evidence actually behind that verdict clears the real minimum before a
 * `WinnerRecordRef` is allowed to reach a recipe builder at all. It is not
 * a parallel adjudication engine — it takes an already-decided `Verdict` as
 * input and never overturns it; it only decides whether promotion may
 * proceed.
 */

export interface EvidenceInventoryItem {
  readonly evidenceClass: EvidenceClass;
  readonly observationCount: number;
}

export interface PromotionInput {
  readonly adjudicationVerdict: Verdict;
  readonly inventory: readonly EvidenceInventoryItem[];
  /** Minimum count of at-or-above-INDIRECT_RANDOMISED items required. Defaults to 1 — never overrides `MINIMUM_OBSERVATIONS` itself. */
  readonly minimumStrong?: number;
}

export type PromotionOutcome = 'PROMOTE' | 'NO_PROMOTION';

export interface PromotionResult {
  readonly outcome: PromotionOutcome;
  readonly reasons: readonly string[];
  readonly totalObservations: number;
  readonly strongCount: number;
  readonly minimumObservations: number;
  readonly fingerprint: string;
}

const STRONG_THRESHOLD_RANK = DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED;

/** Maps an arbitrary string field (e.g. `ExecutedExperiment.evidenceClass`) onto the real `EvidenceClass` union, never silently trusting an unrecognized value as strong. */
export function asEvidenceClass(value: string): EvidenceClass {
  return value in DEFAULT_EVIDENCE_CLASS_RANK ? (value as EvidenceClass) : 'UNVERIFIED';
}

export function canPromoteToWinnerRecord(input: PromotionInput): PromotionResult {
  const reasons: string[] = [];
  const minimumStrong = input.minimumStrong ?? 1;

  if (input.adjudicationVerdict !== 'WINNER') {
    reasons.push(`VERDICT_NOT_WINNER: adjudication verdict is "${input.adjudicationVerdict}", not WINNER`);
  }

  const totalObservations = input.inventory.reduce((sum, item) => sum + item.observationCount, 0);
  if (totalObservations < MINIMUM_OBSERVATIONS) {
    reasons.push(`EVIDENCE_SUFFICIENT: ${totalObservations} observation(s) behind this winner; the gate requires at least ${MINIMUM_OBSERVATIONS} (core/agent/practicalCandidateGate.ts::MINIMUM_OBSERVATIONS)`);
  }

  const strongCount = input.inventory.filter((item) => DEFAULT_EVIDENCE_CLASS_RANK[item.evidenceClass] >= STRONG_THRESHOLD_RANK).reduce((sum, item) => sum + item.observationCount, 0);
  if (strongCount < minimumStrong) {
    reasons.push(`EVIDENCE_STRENGTH: ${strongCount} observation(s) at or above INDIRECT_RANDOMISED; the gate requires at least ${minimumStrong}`);
  }

  const outcome: PromotionOutcome = reasons.length === 0 ? 'PROMOTE' : 'NO_PROMOTION';
  return {
    outcome,
    reasons,
    totalObservations,
    strongCount,
    minimumObservations: MINIMUM_OBSERVATIONS,
    fingerprint: fnv1a(canonicalJson({ outcome, reasons, totalObservations, strongCount })),
  };
}

import type { Verdict } from './contracts';
import { type EvidenceInventoryItem, type PromotionInput } from './winnerGate';
import type { DiscoveryRecord, DiscoveryStatus } from '../agent/discoveryContracts';

/**
 * DISCOVERY → PROMOTION BRIDGE (docs/DECISIONS.md, "GAP after D-070" audit).
 *
 * `genuineDiscoveryOrchestrator.ts` (Phase F's capstone: novelty L1-L6 ->
 * replication -> self-falsification -> `DiscoveryStatus`) and D-057's
 * `winnerGate.ts::canPromoteToWinnerRecord` are two real, tested,
 * independently-correct modules that have never spoken to each other —
 * `DiscoveryStatus` and `Verdict` are two disjoint vocabularies for the same
 * underlying question. This module is the translation between them, and
 * NOTHING ELSE: it never recomputes novelty, replication, or
 * self-falsification, and it never decides promotion itself. Both of those
 * real decisions stay exactly where they already are —
 * `classifyDiscoveryStatus` (discoveryContracts.ts) and
 * `canPromoteToWinnerRecord` (winnerGate.ts), called by this module's own
 * caller, not by this file.
 *
 * WHY THE MAPPING IS CONSERVATIVE, NOT A LOOKUP SHORTCUT. `DISCOVERY_CANDIDATE`
 * means, by `classifyDiscoveryStatus`'s own definition, "replication is
 * absent or PARTIAL, or not every self-falsification probe passed" — the
 * literal opposite of a winner. Only `DISCOVERY` (the one status
 * `assertValidDiscoveryStatus` refuses to let through without a REPLICATED
 * result on a disjoint, frozen-before-access dataset AND all 13 probes
 * passing) maps to `WINNER`. Every other status either maps to a real,
 * distinct `Verdict` or, where forcing one would fabricate a promotion
 * question that was never asked (REPRODUCTION/KNOWN_RESULT confirm ALREADY
 * KNOWN science; NO_ACCESS had no real basis to classify anything;
 * EXTENSION/NOVEL_HYPOTHESIS are declared in `DiscoveryStatus` but never
 * produced by the one real producer this bridge reads from), this module
 * refuses outright (`kind: 'NOT_APPLICABLE'`) rather than guess.
 *
 * THE EVIDENCE CLASS IS A DECLARED CONSTANT, NEVER ARGUED UPWARD. This
 * pipeline's evidence is model-fit + replication over pinned datasets
 * (Kepler orbital data, QE4 physics data) plus structural self-falsification
 * probes — real, but never clinical or randomised. `COMPUTATIONAL` is
 * declared once below and used for every `PROMOTION_INPUT` result this
 * module ever produces; nothing in this file computes a stronger class from
 * any record's contents. The practical consequence — disclosed, not hidden:
 * even a full `DISCOVERY` status, mapped honestly to `WINNER`, still clears
 * `canPromoteToWinnerRecord` to `NO_PROMOTION`, because `COMPUTATIONAL`
 * (rank 2) sits below `INDIRECT_RANDOMISED` (rank 9, D-057's strong-evidence
 * floor) AND the real observation count this bridge can honestly report
 * (discovery dataset + replication dataset, never the 13 self-falsification
 * probes counted as observations) tops out at 2, one short of
 * `MINIMUM_OBSERVATIONS` (3). Two independent walls, neither load-bearing
 * alone — this is the same honest structural wall D-062 found for
 * LOWER-HARM, not a defect of this bridge.
 *
 * CALLER OBLIGATION (this module renders no UI): wherever a
 * `DiscoveryPromotionBridgeResult` is displayed, render `PromotionOutcome`
 * (`canPromoteToWinnerRecord`'s own PROMOTE/NO_PROMOTION) alongside
 * `sourceStatus`/`adjudicationVerdict` — a bridged `WINNER` must never be
 * shown without the D-057 outcome next to it, or it reads as a promotion it
 * is not.
 */

export const DISCOVERY_BRIDGE_CONTRACT_VERSION = '1.0.0';

/** Declared once. Never computed from a record's contents, never raised. */
export const DISCOVERY_PIPELINE_EVIDENCE_CLASS = 'COMPUTATIONAL' as const;

const D057_ANNOTATION = 'promotion decided by D-057; pipeline evidence class COMPUTATIONAL declared once, never argued upward';

export interface DiscoveryPromotionBridgeResult {
  /** 'NOT_APPLICABLE': this bridge deliberately refused to construct a PromotionInput for this status. */
  readonly kind: 'PROMOTION_INPUT' | 'NOT_APPLICABLE';
  readonly promotionInput: PromotionInput | null;
  /** Always non-empty. The last entry on a PROMOTION_INPUT result is always D057_ANNOTATION. */
  readonly reasons: readonly string[];
  /** The record's own status, carried through unmodified for audit — this bridge never re-derives it. */
  readonly sourceStatus: DiscoveryStatus;
}

/**
 * The real, non-inflated observation count this bridge can honestly report:
 * the discovery dataset itself (1), plus the replication dataset ONLY when
 * replication genuinely REPLICATED (1 more) — never the 13 self-falsification
 * probes, which are validity checks over the SAME data, not new observations
 * (the exact inflation `baselineComparison.ts`'s own header already refused
 * once for D-059).
 */
function inventoryFor(record: DiscoveryRecord): readonly EvidenceInventoryItem[] {
  const observationCount = 1 + (record.replication?.result === 'REPLICATED' ? 1 : 0);
  return [{ evidenceClass: DISCOVERY_PIPELINE_EVIDENCE_CLASS, observationCount }];
}

function promotionInputResult(record: DiscoveryRecord, verdict: Verdict, reasons: readonly string[]): DiscoveryPromotionBridgeResult {
  return Object.freeze({
    kind: 'PROMOTION_INPUT',
    promotionInput: Object.freeze({ adjudicationVerdict: verdict, inventory: inventoryFor(record) }),
    reasons: Object.freeze([...reasons, D057_ANNOTATION]),
    sourceStatus: record.status,
  });
}

function notApplicableResult(record: DiscoveryRecord, reasons: readonly string[]): DiscoveryPromotionBridgeResult {
  return Object.freeze({ kind: 'NOT_APPLICABLE', promotionInput: null, reasons: Object.freeze(reasons), sourceStatus: record.status });
}

export function bridgeDiscoveryRecordToPromotionInput(record: DiscoveryRecord): DiscoveryPromotionBridgeResult {
  switch (record.status) {
    case 'DISCOVERY':
      // assertValidDiscoveryStatus has ALREADY enforced REPLICATED-on-disjoint-dataset
      // and all 13 self-falsification probes for this status to exist at all
      // (discoveryContracts.ts) -- this branch trusts that guard, never re-checks it.
      return promotionInputResult(record, 'WINNER', [
        'status=DISCOVERY: assertValidDiscoveryStatus already enforced a REPLICATED result on a disjoint, frozen-before-access dataset and all 13/13 self-falsification probes passing -- this bridge only translates the vocabulary, it does not recompute the verdict.',
      ]);

    case 'DISCOVERY_CANDIDATE':
      // By classifyDiscoveryStatus's own definition, this status is reached
      // ONLY when replication is absent/PARTIAL or self-falsification is
      // incomplete -- the literal opposite of a winner. NEVER WINNER.
      return promotionInputResult(record, 'NO_WINNER', [
        'status=DISCOVERY_CANDIDATE: by classifyDiscoveryStatus\'s own definition, replication is absent or PARTIAL, or not every self-falsification probe passed -- this is "not yet", never a winner.',
      ]);

    case 'FAILED_DISCOVERY':
      return promotionInputResult(record, 'NO_WINNER', [
        `status=FAILED_DISCOVERY: independent replication actively FAILED (result=${record.replication?.result ?? 'unknown'}) -- a negative result, not an absence of evidence.`,
      ]);

    case 'CONFLICTING_EVIDENCE':
      return promotionInputResult(record, 'CONFLICTING_EVIDENCE', [
        'status=CONFLICTING_EVIDENCE: classifyDiscoveryStatus set hasConflictingEvidence=true at classification time.',
      ]);

    case 'UNKNOWN':
      // This is unresolved PRIOR-ART, never experimental-evidence weakness --
      // two different causes that must never be conflated. A record could
      // reach UNKNOWN with a flawless replication and a complete
      // self-falsification battery behind it; this verdict says only that
      // novelty itself (L5 external search / L6 post-discovery recheck)
      // could not be established.
      return promotionInputResult(record, 'INSUFFICIENT_EVIDENCE', [
        'status=UNKNOWN: this is UNRESOLVED PRIOR-ART (noveltyEvidence.overall is UNVERIFIABLE or NO_ACCESS -- L5/L6 could not be reached or resolved), NOT a statement about experimental evidence strength. Replication and self-falsification may be flawless behind this record; this verdict says only that novelty itself could not be established.',
      ]);

    case 'REPRODUCTION':
      return notApplicableResult(record, [
        'status=REPRODUCTION: this record confirms ALREADY-PUBLIC, already-known science (matched a declared public anchor, noveltyEvidence.l4DeclaredAnchors=NOT_NEW) -- it answers "is this known", never "did a candidate win". Forcing a Verdict here would fabricate a promotion question that was never asked.',
      ]);

    case 'KNOWN_RESULT':
      return notApplicableResult(record, [
        'status=KNOWN_RESULT: matches Genesis\'s own internal memory or preregistered corpus (noveltyEvidence.overall=KNOWN, no public anchor) -- same reasoning as REPRODUCTION: not a promotion question.',
      ]);

    case 'NO_ACCESS':
      return notApplicableResult(record, [
        'status=NO_ACCESS: accessDeclared was false at classification time -- no real basis to construct any Verdict at all.',
      ]);

    case 'EXTENSION':
    case 'NOVEL_HYPOTHESIS':
      // Declared in DiscoveryStatus but NEVER returned by classifyDiscoveryStatus
      // (verified by reading its full body) -- the one real producer this
      // bridge reads DiscoveryRecord from. Refusing to guess an unverified
      // producer's semantics rather than silently mapping it to something.
      return notApplicableResult(record, [
        `status=${record.status}: classifyDiscoveryStatus (the one real producer this bridge reads from) never returns this value -- refusing to guess an unverified producer's semantics rather than silently mapping it to a Verdict.`,
      ]);
  }
}

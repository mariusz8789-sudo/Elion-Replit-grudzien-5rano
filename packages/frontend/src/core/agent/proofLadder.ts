import type { DiscoveryRecord, DiscoveryStatus } from './discoveryContracts';

/**
 * PHASE G — SCIENTIFIC PROOF LADDER (P0-P10) + TIER A/B/C.
 *
 * ADDITIVE ONLY. This file changes nothing about `discoveryContracts.ts`:
 * `DiscoveryStatus`'s ten values, `classifyDiscoveryStatus`, and
 * `assertValidDiscoveryStatus` are untouched, because they are load-bearing —
 * campaign fingerprints already verified elsewhere in this repo (Kepler
 * `f4804820`, QE4 `44f245c9`, GOV-DRUG-DISCOVERY-CAMPAIGN-01 `5179c99f`) are
 * computed over exactly those types, and editing them would silently change
 * every one of those numbers. This module only WRAPS an existing
 * `DiscoveryRecord` into a P0-P10 position and a Tier, using evidence the
 * record and its caller already have.
 *
 * WHAT THE AUDIT FOUND, AND WHY THE MAPPING BELOW IS NOT ARBITRARY. Genesis's
 * existing `DISCOVERY` status already requires — via `assertValidDiscoveryStatus`
 * — a disjoint-dataset replication frozen before access
 * (`IndependentReplicationRecord.disjointnessProof` +
 * `frozenBeforeReplicationAccess`) plus all 13 self-falsification probes. That
 * is P6-grade evidence (independent dataset confirmation) under this ladder,
 * not merely P1-grade — a fact this file makes visible rather than inventing
 * a shallower mapping. `DISCOVERY_CANDIDATE` (novelty cleared L1-L6, but
 * replication absent/partial or self-falsification incomplete) caps at P4.
 * `FAILED_DISCOVERY` (novelty cleared, replication ran and FAILED) also caps
 * at P4 internally, but is reported with an explicit P6 FAIL rather than a
 * silent absence, because the attempt happened and did not survive it.
 *
 * WHY LEVELS ABOVE P6 ARE SEPARATE INPUTS, NOT DERIVED FROM THE RECORD.
 * Nothing in this codebase yet produces a second, independent implementation
 * of the same claim (P7), an orthogonal method's assumption-overlap
 * declaration (P8), a causal-inference estimate for this specific claim (P9),
 * or an external audit verdict (P10) — building those FOR REAL is Phase G's
 * own remaining work (see DECISIONS.md). Rather than fabricate a signal this
 * file cannot honestly compute, each is a required, separately-evidenced
 * input: `EvidenceSignal` (`'PASS' | 'FAIL' | 'NOT_ATTEMPTED'`), so a caller
 * who has not actually run the check gets `NOT_ATTEMPTED`, never a guessed
 * PASS.
 *
 * WHY "DISCOVERY" NEVER APPEARS ALONE FROM THIS MODULE. `renderTieredStatus`
 * is the ONLY status-rendering function this module exports, and it always
 * appends the tier and max level (e.g. "DISCOVERY_CANDIDATE (Tier A, max
 * P4)"). This does not retrofit the five pre-existing bare emissions of the
 * literal string 'DISCOVERY' found by audit (`noveltyGate.ts`,
 * `campaignOrchestrator.ts`, `discoveryContracts.ts`, `discoveryGraph.ts`,
 * `genuineDiscoveryOrchestrator.ts`) — those are internal status/type values
 * baked into already-verified fingerprints, and rewriting them is out of
 * scope for the same reason `DiscoveryStatus` itself is untouched. Every NEW
 * caller-facing surface (this ladder, GenesisDiscoveryCertificate) is required
 * to go through `renderTieredStatus` instead of reading `record.status`
 * directly for display.
 */

export const PROOF_LADDER_CONTRACT_VERSION = '1.0.0';

export const PROOF_LEVELS = [
  'P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10',
] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number];

export type ProofGateResult = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_ATTEMPTED';

export type ProofTier = 'A_COMPUTATIONAL' | 'B_EMPIRICAL' | 'C_VALIDATED';

/** A caller may only assert PASS/FAIL for a check it actually ran. Not running one is `NOT_ATTEMPTED`, never assumed PASS. */
export type EvidenceSignal = 'PASS' | 'FAIL' | 'NOT_ATTEMPTED';

export interface ProofLadderInput {
  readonly record: DiscoveryRecord;
  /** P0 — from an ACTUAL replay comparison (e.g. `compareCampaignReplay`, `discoveryGraph` replay, or a repro-demo run), never assumed. */
  readonly replay: EvidenceSignal;
  /** P2 — from an ACTUAL held-out prediction check against a conformal/calibrated interval computed BEFORE the held-out value was read. */
  readonly heldoutPrediction: EvidenceSignal;
  /** P5 — from an ACTUAL PredictionRegistry entry for this record's prediction, ordering-checked (see `predictionRegistry.ts`). */
  readonly predictionOrdering: EvidenceSignal;
  /** P7 — from an ACTUAL second, independently-coded implementation's own result. */
  readonly independentImplementation: EvidenceSignal;
  /** P8 — from an ACTUAL orthogonal-method run with a declared assumption-overlap matrix showing >=1 unshared critical assumption. */
  readonly orthogonalMethod: EvidenceSignal;
  /** P9 — from an ACTUAL causal-inference estimate for this specific claim (see `causalInference.ts`) with identification assumptions declared. */
  readonly causalEvidence: EvidenceSignal;
  /** P10 — from an ACTUAL external audit record. Tier C additionally requires `record.externalValidation === 'CONFIRMED'`. */
  readonly externalAudit: EvidenceSignal;
}

export interface ProofLadderResult {
  readonly contractVersion: string;
  readonly recordId: string;
  readonly status: DiscoveryStatus;
  readonly gateResults: Readonly<Record<ProofLevel, ProofGateResult>>;
  readonly maxLevel: ProofLevel;
  readonly tier: ProofTier;
}

function signalToResult(signal: EvidenceSignal): ProofGateResult {
  if (signal === 'PASS') return 'PASS';
  if (signal === 'FAIL') return 'FAIL';
  return 'NOT_ATTEMPTED';
}

/**
 * The internal levels (P1, P3, P4, P6) a `DiscoveryRecord`'s own status
 * already proves, honestly reflecting `classifyDiscoveryStatus`'s actual
 * gates rather than a shallower guess. `null` means "this status never
 * reaches this rung at all" (not FAIL — the claim was never attempted at
 * that depth), except where noted.
 */
function internalGateResults(record: DiscoveryRecord): {
  readonly p1: ProofGateResult;
  readonly p3: ProofGateResult;
  readonly p4: ProofGateResult;
  readonly p6: ProofGateResult;
} {
  const status = record.status;

  if (status === 'NO_ACCESS') return { p1: 'BLOCKED', p3: 'BLOCKED', p4: 'BLOCKED', p6: 'BLOCKED' };
  if (status === 'UNKNOWN') return { p1: 'NOT_ATTEMPTED', p3: 'NOT_ATTEMPTED', p4: 'NOT_ATTEMPTED', p6: 'NOT_ATTEMPTED' };
  if (status === 'CONFLICTING_EVIDENCE') return { p1: 'NOT_ATTEMPTED', p3: 'NOT_ATTEMPTED', p4: 'NOT_ATTEMPTED', p6: 'FAIL' };

  // REPRODUCTION / KNOWN_RESULT: `noveltyEvidence.overall === 'KNOWN'`. This is
  // exactly the P1 rung — a known result, reproduced or merely matched
  // internally — and nothing past it was attempted (there is no "novel
  // hypothesis" to search prior art for, replicate, or falsify).
  if (status === 'REPRODUCTION' || status === 'KNOWN_RESULT') {
    return { p1: 'PASS', p3: 'NOT_ATTEMPTED', p4: 'NOT_ATTEMPTED', p6: 'NOT_ATTEMPTED' };
  }

  // NOVEL_HYPOTHESIS: internal novelty (L1-L4) cleared, mechanism + falsifier
  // declared (novelHypothesisGenerator.ts's own ceiling), but L5/L6 external
  // search never ran for this record.
  if (status === 'NOVEL_HYPOTHESIS') {
    return { p1: 'NOT_ATTEMPTED', p3: 'PASS', p4: 'NOT_ATTEMPTED', p6: 'NOT_ATTEMPTED' };
  }

  // DISCOVERY_CANDIDATE: `overall === 'NO_KNOWN_PRIOR_FOUND'` — L5 AND L6
  // actually ran (assertNoveltyEvidenceHonest requires it) — but replication
  // is absent/PARTIAL, or self-falsification incomplete. P4 reached, P6 not.
  if (status === 'DISCOVERY_CANDIDATE') {
    const partiallyAttempted = record.replication !== null && record.replication.result === 'PARTIAL';
    return { p1: 'NOT_ATTEMPTED', p3: 'PASS', p4: 'PASS', p6: partiallyAttempted ? 'FAIL' : 'NOT_ATTEMPTED' };
  }

  // FAILED_DISCOVERY: novelty cleared to P4, replication attempted and FAILED.
  if (status === 'FAILED_DISCOVERY') {
    return { p1: 'NOT_ATTEMPTED', p3: 'PASS', p4: 'PASS', p6: 'FAIL' };
  }

  // DISCOVERY: the full internal chain — NO_KNOWN_PRIOR_FOUND, replication
  // REPLICATED on a disjoint, frozen-before-access dataset, all 13
  // self-falsification probes passed. That is genuinely P6-grade evidence.
  return { p1: 'NOT_ATTEMPTED', p3: 'PASS', p4: 'PASS', p6: 'PASS' };
}

/**
 * Computes a `DiscoveryRecord`'s position on the ladder. Nothing here is
 * settable directly — this is the ONLY function that produces a
 * `ProofLadderResult`, so "manual override" is not a field a caller can flip,
 * it is a function they would have to call with fabricated inputs, which
 * `EvidenceSignal` makes visible (`NOT_ATTEMPTED` is the honest default, not a
 * silent PASS).
 */
export function computeProofLadder(input: ProofLadderInput): ProofLadderResult {
  const { record } = input;
  const internal = internalGateResults(record);

  const gateResults: Record<ProofLevel, ProofGateResult> = {
    P0: signalToResult(input.replay),
    P1: internal.p1,
    P2: signalToResult(input.heldoutPrediction),
    P3: internal.p3,
    P4: internal.p4,
    P5: signalToResult(input.predictionOrdering),
    P6: internal.p6,
    P7: signalToResult(input.independentImplementation),
    P8: signalToResult(input.orthogonalMethod),
    P9: signalToResult(input.causalEvidence),
    P10: signalToResult(input.externalAudit),
  };

  /**
   * NOT A SINGLE LINEAR STAIRCASE. P1 (reproduction) and P3 (internal
   * novelty) are two DIFFERENT ways a claim can leave P0, not two rungs of
   * the same ladder — a genuinely novel claim was never a reproduction
   * attempt, so `gateResults.P1 === 'NOT_ATTEMPTED'` for it must not block
   * the climb the way an unattempted P2 legitimately would. So:
   *
   *   P0 gates everything.
   *   REPRODUCTION TRACK: P0 -> P1. Ends there — nothing past P1 applies to
   *     a claim that only reproduces something already known.
   *   NOVEL TRACK: P0 -> P3 -> P4 -> (P2 AND P5 must BOTH also PASS, jointly
   *     gating the step past external prior-art into independent-dataset
   *     territory — a prediction that was never checked against held-out
   *     data, or never entered an ordered registry, cannot be independently
   *     confirmed by anyone else in any way that means something) -> P6 ->
   *     P7 -> P8 -> P9 -> P10, each of the last four gating one further step
   *     individually.
   *
   * P2 and P5 are still reported in `gateResults` exactly as computed
   * (PASS/FAIL/NOT_ATTEMPTED) regardless of which track applies or whether
   * they were even reached — a reader always sees the real signal, never a
   * hidden one.
   */
  let maxLevel: ProofLevel = 'P0';
  if (gateResults.P0 === 'PASS') {
    if (gateResults.P1 === 'PASS') {
      maxLevel = 'P1';
    } else if (gateResults.P3 === 'PASS') {
      maxLevel = 'P3';
      if (gateResults.P4 === 'PASS') {
        maxLevel = 'P4';
        if (gateResults.P2 === 'PASS' && gateResults.P5 === 'PASS' && gateResults.P6 === 'PASS') {
          maxLevel = 'P6';
          if (gateResults.P7 === 'PASS') {
            maxLevel = 'P7';
            if (gateResults.P8 === 'PASS') {
              maxLevel = 'P8';
              if (gateResults.P9 === 'PASS') {
                maxLevel = 'P9';
                if (gateResults.P10 === 'PASS') maxLevel = 'P10';
              }
            }
          }
        }
      }
    }
  }

  const maxIndex = PROOF_LEVELS.indexOf(maxLevel);
  const tier: ProofTier = maxIndex >= PROOF_LEVELS.indexOf('P9')
    ? 'C_VALIDATED'
    : maxIndex >= PROOF_LEVELS.indexOf('P6')
      ? 'B_EMPIRICAL'
      : 'A_COMPUTATIONAL';

  if (tier === 'C_VALIDATED' && record.externalValidation !== 'CONFIRMED') {
    // Refuse rather than silently downgrade: a caller who reaches P9/P10 gate
    // results without ALSO setting record.externalValidation is asserting an
    // inconsistent record, not a lesser one.
    throw new Error(
      `proofLadder: gateResults reach ${maxLevel} (Tier C_VALIDATED territory) but record.externalValidation is `
      + `"${record.externalValidation}", not "CONFIRMED". Tier C requires both.`,
    );
  }

  return {
    contractVersion: PROOF_LADDER_CONTRACT_VERSION,
    recordId: record.recordId,
    status: record.status,
    gateResults,
    maxLevel,
    tier,
  };
}

/**
 * The ONLY status string this module ever hands to a caller-facing surface.
 * Always carries the tier and level — never the bare status a reader could
 * mistake for an unqualified claim.
 */
export function renderTieredStatus(result: ProofLadderResult): string {
  return `${result.status} (Tier ${result.tier}, max ${result.maxLevel})`;
}

/**
 * PRESENTATION-LAYER GUARD. The five pre-existing bare emissions of the
 * literal 'DISCOVERY' (in `noveltyGate.ts`, `campaignOrchestrator.ts`,
 * `discoveryContracts.ts`, `discoveryGraph.ts`,
 * `genuineDiscoveryOrchestrator.ts`) are internal status VALUES baked into
 * already-verified fingerprints and are deliberately not rewritten. The
 * boundary is therefore drawn here instead: any text about to be shown to a
 * person must pass this check, so a raw status cannot reach a reader as an
 * unqualified claim.
 *
 * Allows the word inside a longer status name (`DISCOVERY_CANDIDATE`,
 * `FAILED_DISCOVERY`) and inside the fixed product title `GENESIS DISCOVERY
 * CERTIFICATE`, because neither asserts a verdict. Everything else must
 * carry `(Tier ...` immediately after.
 */
export function assertTieredStatusText(text: string, context: string): void {
  const regex = /(?<![A-Z_])DISCOVERY(?![_A-Z])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(Math.max(0, match.index - 8), match.index);
    if (before.endsWith('GENESIS ')) continue;
    const after = text.slice(match.index + 'DISCOVERY'.length, match.index + 'DISCOVERY'.length + 7);
    if (!after.startsWith(' (Tier ')) {
      throw new Error(
        `proofLadder: ${context} emits a bare "DISCOVERY" without a tier label. `
        + 'A status shown to a reader must go through renderTieredStatus() so the claim carries the level of proof actually behind it.',
      );
    }
  }
}

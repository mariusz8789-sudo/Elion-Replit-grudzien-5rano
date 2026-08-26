/**
 * MATRIX FOUNDATION — GENERIC REPLAY VERDICT.
 *
 * `core/hazard/hazardReplay.ts` and `core/discovery/discoveryReplay.ts`
 * each already implement "recompute a fingerprint, compare it to what was
 * recorded, return a verdict" — correctly kept as two independent domain
 * paths (see docs/PHASE0_HAZARD_PROVENANCE_FOUNDATION.md, "why a separate
 * replay path"). NEITHER FILE IS TOUCHED HERE, and this does not replace,
 * wrap, or call into either.
 *
 * What this extracts is only the SHARED SHAPE of that decision — never a
 * false MATCH; a missing record or missing input is NOT_REPRODUCIBLE, not
 * a silent pass — as a small, pure, reusable primitive a future domain
 * (e.g. a Matrix World POC) can build its own replay function on top of,
 * instead of re-deriving the same if/else chain a third time. It performs
 * no fingerprint computation itself.
 */
export type ReplayVerdict = 'MATCH' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE';

export interface ReplayComparisonInput {
  /** Whether every input this replay needs (e.g. rule set, world spec) was actually found. */
  readonly inputsAvailable: boolean;
  /** Whether the run's own persisted record was found. */
  readonly recordFound: boolean;
  /** The fingerprint recorded at run time — null whenever recordFound is false. */
  readonly recordedFingerprint: string | null;
  /** The fingerprint recomputed now from the same recorded input. */
  readonly recomputedFingerprint: string;
  /** A blocking reason (e.g. a capability-fence rejection) that pre-empts fingerprint comparison entirely. */
  readonly blockedReason?: string | null;
}

/**
 * Pure decision, no I/O: given the presence/fingerprint facts a domain's
 * own replay function already gathered, decide the verdict. Mirrors the
 * "never a false MATCH" rule `hazardReplay.ts` already enforces: MATCH is
 * reachable only when both fingerprints are present and equal.
 */
export function computeReplayVerdict(input: ReplayComparisonInput): ReplayVerdict {
  if (input.blockedReason) return 'BLOCKED';
  if (!input.recordFound || !input.inputsAvailable || input.recordedFingerprint === null) {
    return 'NOT_REPRODUCIBLE';
  }
  return input.recordedFingerprint === input.recomputedFingerprint ? 'MATCH' : 'DRIFT';
}

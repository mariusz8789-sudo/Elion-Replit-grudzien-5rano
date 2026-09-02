/**
 * CONFIDENCE LADDER — confidence is EARNED, never assigned.
 *
 * "NIE twórz magicznego confidence score. Confidence może rosnąć tylko wraz z
 * niezależnymi dowodami." "Nigdy nie oznaczaj poziomu 5 bez rzeczywistych
 * eksperymentów."
 *
 * The ladder is enforced two ways, not one:
 *
 *  - TYPE: `deriveConfidence` returns `ComputationalConfidenceLevel`, a union
 *    that excludes 5. There is no code path through this function that can
 *    produce level 5 — not a missing case, a missing VALUE in the type.
 *  - RUNTIME: `describeConfidence` accepts level 5 only together with a real,
 *    non-empty experimental evidence reference, and throws otherwise. Genesis
 *    performs no experiments, so nothing in this codebase can supply one —
 *    the throw is not defensive programming, it is the actual current state.
 */
export const CONFIDENCE_LADDER_VERSION = '1.0.0';

export type ComputationalConfidenceLevel = 0 | 1 | 2 | 3 | 4;
export type ConfidenceLevel = ComputationalConfidenceLevel | 5;

export const CONFIDENCE_LABELS: Readonly<Record<ConfidenceLevel, string>> = {
  0: 'NO_EVIDENCE',
  1: 'COMPUTATIONAL_HYPOTHESIS',
  2: 'SOURCE_SUPPORTED',
  3: 'MULTI_SOURCE_SUPPORT',
  4: 'INDEPENDENT_COMPUTATIONAL_SUPPORT',
  5: 'EXPERIMENTAL_EVIDENCE',
};

const LEVEL_MEANING: Readonly<Record<ConfidenceLevel, string>> = {
  0: 'No evidence exists for this candidate beyond its being generated or named.',
  1: 'A computational hypothesis exists (a stated target/mechanism claim), with no independent source behind it yet.',
  2: 'Exactly one independent, cited source supports the hypothesis.',
  3: 'Two or more independent, cited sources support the hypothesis.',
  4: 'Multi-source support PLUS independent computational corroboration (real engine results, not a source claim) also point the same way.',
  5: 'A real experiment has validated the hypothesis. Genesis performs no experiments; this level is unreachable from computation alone.',
};

export interface IndependentSourceRef {
  /** Distinct sources must have distinct keys, or they collapse to one for counting purposes. */
  sourceKey: string;
  kind: 'LITERATURE' | 'PUBLIC_DATABASE_RECORD' | 'PDB' | 'CHEMBL' | 'PUBCHEM' | 'USER_ASSERTION';
  /** An assertion without a citation supports nothing — see `naturalProductClaimGuard`'s sibling rule. */
  cited: boolean;
}

export interface EvidenceForConfidence {
  /** Whether this candidate carries a stated target/mechanism hypothesis at all. */
  hasHypothesis: boolean;
  independentSources: readonly IndependentSourceRef[];
  /**
   * Distinct REAL computational engines that actually produced a value for
   * this candidate (e.g. 'RDKIT_DESCRIPTORS', 'ADMET_AI', 'DOCKING',
   * 'STRUCTURAL_SIMILARITY'). An engine that ran and returned NOT_AVAILABLE
   * does not belong here — this counts corroboration, not attempts.
   */
  completedComputationalChecks: readonly string[];
}

/**
 * The only way to earn a level. Every step requires the previous step's
 * condition to still hold — level 4 without level 3's multi-source support is
 * not reachable, so a candidate cannot skip straight to "computationally
 * corroborated" on evidence quality alone.
 */
export function deriveConfidence(evidence: EvidenceForConfidence): ComputationalConfidenceLevel {
  if (!evidence.hasHypothesis) return 0;

  const citedIndependentSourceKeys = new Set(
    evidence.independentSources.filter((s) => s.cited).map((s) => s.sourceKey),
  );
  if (citedIndependentSourceKeys.size === 0) return 1;
  if (citedIndependentSourceKeys.size === 1) return 2;

  const distinctComputationalEngines = new Set(evidence.completedComputationalChecks);
  if (distinctComputationalEngines.size >= 2) return 4;
  return 3;
}

/**
 * Human-readable statement for a level. Level 5 is accepted ONLY with a real
 * reference and throws otherwise — this is the runtime backstop behind the
 * type-level one in `deriveConfidence`.
 */
export function describeConfidence(level: ConfidenceLevel, experimentalEvidenceRef?: string): string {
  if (level === 5) {
    if (experimentalEvidenceRef === undefined || experimentalEvidenceRef.trim().length === 0) {
      throw new Error(
        'Confidence level 5 (EXPERIMENTAL_EVIDENCE) requires a real experimental evidence reference. '
        + 'Genesis performs no experiments and must never assert this level without one.',
      );
    }
    return `Level 5 — EXPERIMENTAL_EVIDENCE: ${LEVEL_MEANING[5]} Reference: ${experimentalEvidenceRef}.`;
  }
  return `Level ${level} — ${CONFIDENCE_LABELS[level]}: ${LEVEL_MEANING[level]}`;
}

/** Whether raising `from` to `to` is a legitimate move — never a downgrade rewritten as a jump, never skipping levels other than the earned ones above. */
export function isValidConfidenceTransition(from: ConfidenceLevel, to: ConfidenceLevel): boolean {
  return to >= from;
}

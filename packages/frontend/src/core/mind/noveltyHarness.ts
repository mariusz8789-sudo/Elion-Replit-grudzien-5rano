import type { MindLineage, NoveltyLevelReport } from './contracts';

/**
 * NOVELTY LEVEL HARNESS (docs/DECISIONS.md D-060) — reports what a run
 * ACTUALLY reached, computed from lineage, never asserted.
 *
 * THE FOUR LEVELS, AND WHAT SEPARATES THEM:
 *  L0 FIXED_LIST          — the candidate was already in a supplied list. Retrieval.
 *  L1 INITIAL_SPACE       — a form enumerated by `generateModelSpace` from the
 *                           declared constraints. Template instantiation.
 *  L2 MUTATED             — a form `mutateModelSpec` derived from a parent and
 *                           that is NOT in the initial enumerated space.
 *  L3 SYMBOLIC_COMPOSITION — a form the `ModelBasis` vocabulary cannot express
 *                           at all, reached through the mathExpr bridge.
 *
 * The level is read off each candidate's own lineage, which the adapter
 * derives by comparing real `modelSpecFingerprint` values against the real
 * initial-space and mutation sets — so a claim of L2 or L3 is a fact about
 * where the form came from, not a label anyone chose.
 *
 * PRIOR ART IS A SEPARATE AXIS. This says nothing about whether the finding is
 * new to the world; that is `noveltyGate.ts`/`discoveryContracts.ts`'s job and
 * travels alongside in `priorArtAxis`. A high level here with NOT_NEW there is
 * an entirely coherent — and honest — outcome.
 */
const LEVEL_OF: Readonly<Record<MindLineage, 0 | 1 | 2 | 3>> = {
  FIXED_LIST: 0,
  INITIAL_SPACE: 1,
  MUTATED: 2,
  SYMBOLIC_COMPOSITION: 3,
};

export function computeNoveltyLevel(
  candidates: readonly { readonly candidateId: string; readonly lineage: MindLineage }[],
  priorArtAxis: string,
): NoveltyLevelReport {
  const perCandidate = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    level: LEVEL_OF[candidate.lineage],
    evidence: `lineage=${candidate.lineage} (derived from real modelSpecFingerprint set membership, not asserted)`,
  }));
  const level = perCandidate.reduce<0 | 1 | 2 | 3>((max, entry) => (entry.level > max ? entry.level : max), 0);
  return { level, perCandidate, priorArtAxis };
}

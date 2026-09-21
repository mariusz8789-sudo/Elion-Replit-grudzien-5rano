import type { ChallengeCandidate, LineageClass } from './contracts';

/**
 * D-062 LINEAGE CLASSIFICATION (brief §9/§13). Lineage level and prior-art
 * novelty are ORTHOGONAL axes — this module answers only "where did this
 * candidate come from", never "is it novel". `noveltyLevelFromLineage`
 * exists so a caller can report the mechanical L0-L3 mapping without ever
 * writing "L3 therefore novel".
 */

export function classifyLineage(
  candidateFp: string,
  sets: {
    readonly baseline: string;
    readonly retrieved: ReadonlySet<string>;
    readonly initial: ReadonlySet<string>;
    readonly mutated: ReadonlySet<string>;
    readonly symbolic: ReadonlySet<string>;
  },
): LineageClass {
  if (candidateFp === sets.baseline) return 'A_BASELINE';
  if (sets.retrieved.has(candidateFp)) return 'B_RETRIEVED';
  if (sets.symbolic.has(candidateFp)) return 'F_SYMBOLIC';
  if (sets.mutated.has(candidateFp)) return 'D_MUTATED';
  if (sets.initial.has(candidateFp)) return 'C_INITIAL_SPACE';
  return 'E_NEW_MECHANISM';
}

/** brief §6: "if the best result comes only from the existing list, report NOT A TRUE DISCOVERY RUN". */
export function isTrueDiscoveryBest(best: ChallengeCandidate | null): boolean {
  return best !== null && best.lineage !== 'A_BASELINE' && best.lineage !== 'B_RETRIEVED';
}

export function noveltyLevelFromLineage(l: LineageClass): 0 | 1 | 2 | 3 {
  if (l === 'A_BASELINE' || l === 'B_RETRIEVED') return 0;
  if (l === 'C_INITIAL_SPACE') return 1;
  if (l === 'D_MUTATED') return 2;
  return 3;
}

import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';

/**
 * CYBER TEST PLANNER — a small, adaptive test-selection layer for the
 * existing Cyber Reasoning Kernel (`cyberReasoningKernel.ts`). This is NOT a
 * Mission Engine: it has no evidence graph, memory, replay, or provenance
 * vocabulary of its own. It answers exactly one question — "given the
 * hypotheses I have and their current canonical assessment, which one's
 * test should I run next?" — and reuses `HypothesisAssessment`
 * (`experimentFabric/scientificDiscovery.ts`) directly rather than inventing
 * a parallel status vocabulary (the defect that got the earlier "Mission
 * Engine v2" package declined).
 */

export type CyberTestIdentityKind = 'NEW' | 'REPEAT' | 'INDEPENDENT_REPLICATION';

/**
 * One test the planner could choose to run next. Fields are hand-assigned
 * per hypothesis kind by the caller (see `cyberReasoningKernel.ts`'s
 * `DISCRIMINATION_BY_KIND`/`SAFETY_BY_KIND`/`DOWNSTREAM_BY_KIND`) — never a
 * fabricated confidence value. `priorAttempts` and `identityKind` come from
 * the caller's own execution history, not invented here.
 */
export interface CyberTestCandidate {
  readonly hypothesisId: string;
  /** 0..1 — how strongly this test's result would discriminate the hypothesis. */
  readonly discriminationPower: number;
  readonly safety: 'SAFE' | 'UNSAFE';
  /** 0..1, normalized — higher costs are penalized. */
  readonly cost: number;
  /** 0..1 — how much this hypothesis matters if confirmed (e.g. auth bypass > info disclosure). */
  readonly downstreamValue: number;
  readonly identityKind: CyberTestIdentityKind;
  readonly priorAttempts: number;
}

export interface CyberTestSelection {
  readonly selectedHypothesisId: string | null;
  readonly score: number;
  readonly whySelected: string;
  readonly whyNotAlternative: string;
  readonly targetHypotheses: readonly string[];
  readonly expectedInformationGain: number;
}

/**
 * Explicit, deterministic HEURISTIC weights — NOT a Bayesian or probabilistic
 * model. Chosen to reflect an intuitive priority order (resolve uncertainty
 * first, prefer high-discrimination/high-value tests, prefer safety, penalize
 * cost, strongly penalize accidental repeats) and documented here rather than
 * hidden inside the scoring function.
 */
export const CYBER_PLANNER_WEIGHTS = {
  uncertainty: 0.35,
  discrimination: 0.25,
  downstream: 0.15,
  safety: 0.15,
  cost: -0.20,
  repeatPenalty: -0.6,
} as const;

/**
 * A hypothesis's own canonical assessment IS its uncertainty signal: still
 * `CANDIDATE`/`INCONCLUSIVE` means unresolved (uncertainty=1), a terminal
 * `SUPPORTED_WITHIN_PROTOCOL`/`FALSIFIED_WITHIN_PROTOCOL` means resolved
 * (uncertainty=0). No separate confidence number is fabricated.
 */
export function assessmentUncertainty(assessment: HypothesisAssessment): number {
  return assessment === 'SUPPORTED_WITHIN_PROTOCOL' || assessment === 'FALSIFIED_WITHIN_PROTOCOL' ? 0 : 1;
}

export function scoreCandidate(candidate: CyberTestCandidate, uncertainty: number): number {
  const w = CYBER_PLANNER_WEIGHTS;
  let score = w.uncertainty * uncertainty
    + w.discrimination * candidate.discriminationPower
    + w.downstream * candidate.downstreamValue
    + w.safety * (candidate.safety === 'SAFE' ? 1 : 0)
    + w.cost * candidate.cost;
  if (candidate.identityKind === 'REPEAT') score += w.repeatPenalty;
  return Math.round(score * 1000) / 1000;
}

/**
 * Selects the single highest-value SAFE test to run next. UNSAFE candidates
 * are excluded outright, never merely down-weighted. Returns
 * `selectedHypothesisId: null` when nothing is worth running — either no
 * safe candidates exist, or every remaining candidate is already resolved
 * and none is a deliberate (`INDEPENDENT_REPLICATION`) re-test.
 */
export function selectNextTest(
  candidates: readonly CyberTestCandidate[],
  assessments: ReadonlyMap<string, HypothesisAssessment>,
): CyberTestSelection {
  const safe = candidates.filter((c) => c.safety === 'SAFE');
  if (safe.length === 0) {
    return {
      selectedHypothesisId: null, score: 0,
      whySelected: candidates.length > 0 ? 'wszyscy kandydaci są UNSAFE — wykluczeni z automatycznego wyboru' : 'brak kandydatów',
      whyNotAlternative: 'n/a', targetHypotheses: [], expectedInformationGain: 0,
    };
  }
  const scored = safe
    .map((c) => {
      const uncertainty = assessmentUncertainty(assessments.get(c.hypothesisId) ?? 'CANDIDATE');
      return { c, uncertainty, score: scoreCandidate(c, uncertainty) };
    })
    .sort((a, b) => b.score - a.score || a.c.hypothesisId.localeCompare(b.c.hypothesisId));

  const best = scored[0]!;
  const runner = scored[1];

  // Nothing genuinely uncertain remains, and this isn't a deliberate re-test: stop rather than
  // waste a step re-running a resolved hypothesis's test against an unchanged target.
  if (best.uncertainty === 0 && best.c.identityKind !== 'INDEPENDENT_REPLICATION') {
    return {
      selectedHypothesisId: null, score: 0,
      whySelected: 'wszystkie pozostałe hipotezy mają rozstrzygniętą ocenę i żadna nie jest zaplanowaną replikacją',
      whyNotAlternative: 'n/a', targetHypotheses: [], expectedInformationGain: 0,
    };
  }

  return {
    selectedHypothesisId: best.c.hypothesisId,
    score: best.score,
    whySelected: `score=${best.score}: uncertainty=${best.uncertainty}, discrimination=${best.c.discriminationPower}, downstream=${best.c.downstreamValue}, identity=${best.c.identityKind}${best.c.identityKind === 'REPEAT' ? ' (kara za powtórkę zastosowana)' : ''}`,
    whyNotAlternative: runner ? `${runner.c.hypothesisId} score=${runner.score} (niższy wynik)` : 'brak alternatywnego kandydata',
    targetHypotheses: [best.c.hypothesisId],
    expectedInformationGain: Math.round(best.uncertainty * best.c.discriminationPower * 1000) / 1000,
  };
}

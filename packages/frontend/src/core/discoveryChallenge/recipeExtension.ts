import { canonicalJson, fnv1a } from '../events/hash';
import type { LowerHarmResearchRecipe } from '../biotechData/govLowerHarmRecipe';
import type { BaselineRecord, ChallengeCandidate, FalsificationReport } from './contracts';

/**
 * D-062 RECIPE — FIELD ASSEMBLY ONLY, NOT A SECOND RECIPE ENGINE.
 *
 * `buildLowerHarmRecipe` (biotechData/govLowerHarmRecipe.ts) accepts an
 * `A2CandidateReport` — a whole-molecule shape this challenge's winning
 * candidate (a DOSE STRATUM of one molecule) does not have. Rather than
 * force-fit a stratum into that shape (fabricating fields it does not
 * carry) or edit that builder's signature, this module is a FOURTH instance
 * of the same "domain-scoped Research Recipe projection" convention that
 * file's own header already documents (`physicsRecipe.ts`,
 * `govDrugDiscoveryE2E.ts::generateResearchRecipe`,
 * `govLowerHarmRecipe.ts::buildLowerHarmRecipe` are the first three) — same
 * `LowerHarmResearchRecipe` interface, same non-negotiables (no dose, no
 * patient instruction, no step-level operational detail), a different real
 * candidate shape.
 */

export interface BuildDoseStratifiedRecipeInput {
  readonly discoveryId: string;
  readonly problemFingerprint: string;
  readonly baseline: BaselineRecord;
  readonly baselineArmId: string;
  readonly baselineStudyId: string;
  readonly baselineContentSha256: string;
  readonly winnerRecordRef: string;
  readonly best: ChallengeCandidate;
  /** This round's own experiment/plan labels — no cross-round `RoundRecord[]` dependency, so this recipe can be computed synchronously, within the SAME round `orchestrator.ts` calls `buildRecipe` in (docs/DECISIONS.md D-062). */
  readonly experimentRefs: readonly string[];
  readonly falsification: FalsificationReport;
  readonly researchStateHead: string;
  readonly improvementVsBaseline: Readonly<Record<string, number>>;
}

/**
 * Returns null only when the winning candidate carries no evidence
 * references at all — a recipe with an empty evidence list would be worse
 * than no recipe (mirrors `buildLowerHarmRecipe`'s own null contract).
 */
export function buildDoseStratifiedRecipe(input: BuildDoseStratifiedRecipeInput): LowerHarmResearchRecipe | null {
  if (input.best.evidenceRefs.length === 0) return null;

  const recipe: Omit<LowerHarmResearchRecipe, 'recipeFingerprint'> = {
    mechanism: `${input.best.mechanism} — dose stratum "${input.best.label}", selected under the D-062 frozen better-than-baseline rule (efficacy >= baseline AND harm < baseline).`,
    formulationConcept: `Same molecule as the A2-pinned candidate, administered at the dose stratum this discovery selected; formulation itself is unchanged from the reference product — this record concerns the REGIMEN, not a new formulation.`,
    conceptualSynthesisRoute: 'NOT APPLICABLE: this discovery selects a dose stratum of an existing, already-characterised molecule. No synthesis route is proposed or required.',
    requiredProperties: [
      `Efficacy retained at or above the frozen baseline (${input.baseline.label}): ${input.improvementVsBaseline['efficacyDelta']?.toFixed(4) ?? 'n/a'} delta.`,
      `Harm strictly below the frozen baseline across the evaluated safety categories: ${input.improvementVsBaseline['harmDelta']?.toFixed(4) ?? 'n/a'} delta.`,
      'Independent replication in a disjoint trial population before any institutional action — a single funnel pass is not independent confirmation.',
    ],
    materialClasses: ['dose-stratified regimen'],
    provenance: `Same pinned ChEMBL + ClinicalTrials.gov dataset as the A2/LOWER-HARM candidate space (baseline study ${input.baselineStudyId}, sha256 ${input.baselineContentSha256}).`,
    sources: ['ChEMBL Web Services', 'ClinicalTrials.gov API v2'],
    identifiers: [input.best.candidateId, input.baselineStudyId],
    evidence: [...input.best.evidenceRefs],
    replay: input.winnerRecordRef,
    dualUseGuard: 'ASSERTED',

    discoveryId: input.discoveryId,
    problemFingerprint: input.problemFingerprint,
    baseline: {
      identity: input.baseline.label,
      armId: input.baselineArmId,
      studyId: input.baselineStudyId,
      contentSha256: input.baselineContentSha256,
      outcomeMetrics: input.baseline.knownOutcomeMetrics,
      applicabilityConditions: input.baseline.applicabilityConditions,
    },
    winnerRecordRef: input.winnerRecordRef,
    hypothesisId: input.best.hypothesisRef ?? undefined,
    mechanismModel: input.best.modelFingerprint === null ? undefined : { rendered: input.best.label, fingerprint: input.best.modelFingerprint },
    parameters: { efficacy: input.best.efficacy, harm: input.best.harm, observationCount: input.best.observationCount },
    parameterConstraints: [`applies only to ${input.baseline.applicabilityConditions.join('; ')}`],
    initialConditions: [`baseline arm ${input.baselineArmId} of study ${input.baselineStudyId}`],
    frozenPredictionRefs: [...input.best.predictionRefs],
    experimentRefs: [...input.experimentRefs],
    falsificationResults: [
      { probe: 'G2_DIFFERENTIATING_EXPERIMENT', outcome: input.falsification.survived.every(Boolean) ? 'SURVIVED' : 'MIXED' },
      { probe: 'SELF_FALSIFICATION_BATTERY', outcome: `${input.falsification.executedProbes}/${input.falsification.availableProbes} executed — ${input.falsification.unavailableReason}` },
    ],
    researchStateHead: input.researchStateHead,
    improvementVsBaseline: Object.entries(input.improvementVsBaseline).map(([metric, candidate]) => ({
      metric,
      candidate,
      baseline: input.baseline.knownOutcomeMetrics[metric.replace('Delta', '')] ?? 0,
    })),
    applicabilityConditions: input.baseline.applicabilityConditions,
    limitations: [
      'Single-trial evidence: every dose stratum compared here comes from one randomised trial (SURPASS-2).',
      'No independent replication cohort exists in this sandbox — self-falsification coverage is partial.',
      'Dose interpolation between measured arms carries no real evidence and is never promotable.',
    ],
    reproducibilityInstructions: [
      'Replay via runDiscoveryChallenge with the same baseline/betterRule/ports and identical mode — auditFingerprint must match.',
      'Re-fit the mechanism model from the recorded parameters against the same pinned SURPASS-2 bytes (sha256 recorded above) to reproduce the recorded prediction.',
    ],
  };

  return { ...recipe, recipeFingerprint: fnv1a(canonicalJson(recipe)) };
}

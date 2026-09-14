import { canonicalJson, fnv1a } from '../events/hash';
import type { A2CandidateReport } from './a2OzempicSubstitute';

/**
 * LOWER-HARM RESEARCH RECIPE — the successful-path projection for
 * `runLowerHarmFunnel()`'s own WINNER (docs/DECISIONS.md D-058, Winner
 * Promotion Gate E2E completion, mandate item 11).
 *
 * SAME PATTERN AS THE TWO EXISTING PER-DOMAIN RECIPE BUILDERS, NOT A THIRD
 * ENGINE: `core/physicsWorld/physicsRecipe.ts` (D-052) and
 * `govDrugDiscoveryE2E.ts::generateResearchRecipe` (E2E-01) each already
 * established "a domain-scoped Research Recipe projection with the exact
 * same shape (mechanism/formulationConcept/conceptualSynthesisRoute/
 * requiredProperties/materialClasses/provenance/sources/identifiers) is the
 * convention, not a shared cross-domain recipe engine" — this file is a
 * THIRD instance of that SAME convention, for the LOWER-HARM candidate
 * shape (`A2CandidateReport`), which `generateResearchRecipe`'s own
 * `A3CandidateView` parameter cannot accept without fabricating fields that
 * shape does not carry. Zero new recipe logic: this is field assembly from
 * data the winning candidate's own report already holds.
 *
 * Research-grade and deliberately conceptual, identical posture to both
 * existing builders: a target mechanism, a formulation concept, a route
 * described at the level of chemistry a reviewer can assess — never a dose,
 * never a patient instruction, never step-level operational detail.
 */

export interface LowerHarmResearchRecipe {
  readonly mechanism: string;
  readonly formulationConcept: string;
  readonly conceptualSynthesisRoute: string;
  readonly requiredProperties: readonly string[];
  readonly materialClasses: readonly string[];
  readonly provenance: string;
  readonly sources: readonly string[];
  readonly identifiers: readonly string[];
  readonly evidence: readonly string[];
  readonly replay: string;
  readonly dualUseGuard: 'ASSERTED';
  readonly recipeFingerprint: string;

  // -------------------------------------------------------------------------
  // D-062 EXTENSION — all OPTIONAL, additive only (docs/DECISIONS.md D-062,
  // brief §12.2). `buildLowerHarmRecipe` above never sets these, so its
  // existing callers and its `recipeFingerprint` are byte-unchanged. A
  // second builder for a candidate shape `A2CandidateReport` cannot express
  // (a dose stratum, not a molecule) populates them directly — see
  // `discoveryChallenge/recipeExtension.ts::buildDoseStratifiedRecipe`. This
  // is NOT a second recipe engine: same interface, same field-assembly
  // discipline, a second real candidate shape.
  // -------------------------------------------------------------------------
  readonly discoveryId?: string;
  readonly problemFingerprint?: string;
  readonly baseline?: {
    readonly identity: string;
    readonly armId: string;
    readonly studyId: string;
    readonly contentSha256: string;
    readonly outcomeMetrics: Readonly<Record<string, number>>;
    readonly applicabilityConditions: readonly string[];
  };
  readonly winnerRecordRef?: string;
  readonly hypothesisId?: string;
  readonly mechanismModel?: { readonly rendered: string; readonly fingerprint: string };
  readonly parameters?: Readonly<Record<string, number>>;
  readonly parameterConstraints?: readonly string[];
  readonly initialConditions?: readonly string[];
  readonly frozenPredictionRefs?: readonly string[];
  readonly experimentRefs?: readonly string[];
  readonly falsificationResults?: readonly { readonly probe: string; readonly outcome: string }[];
  readonly researchStateHead?: string;
  readonly improvementVsBaseline?: readonly { readonly metric: string; readonly candidate: number; readonly baseline: number }[];
  readonly applicabilityConditions?: readonly string[];
  readonly limitations?: readonly string[];
  readonly reproducibilityInstructions?: readonly string[];
}

/**
 * Builds the recipe for a winning candidate's real report. Returns null if
 * the report carries no usable mechanism target at all — a recipe with an
 * empty mechanism description would be worse than no recipe.
 */
export function buildLowerHarmRecipe(winner: A2CandidateReport, replayFingerprint: string): LowerHarmResearchRecipe | null {
  const s = winner.summary;
  const targets: string[] = [];
  if (s.medianPotencyNMByTarget.glp1r !== null) targets.push(`GLP-1R (median ${s.medianPotencyNMByTarget.glp1r} nM)`);
  if (s.medianPotencyNMByTarget.gipr !== null) targets.push(`GIPR (median ${s.medianPotencyNMByTarget.gipr} nM)`);
  if (s.medianPotencyNMByTarget.gcgr !== null) targets.push(`GCGR (median ${s.medianPotencyNMByTarget.gcgr} nM)`);
  if (targets.length === 0) return null;

  const recipe: Omit<LowerHarmResearchRecipe, 'recipeFingerprint'> = {
    mechanism: `Incretin/glucagon-axis engagement at ${targets.join(', ')}, established from real ChEMBL binding/functional data — selected under the LOWER-HARM safety-dominant ranking rule, not the efficacy-first A2 rule.`,
    formulationConcept: `${s.moleculeType} class agent intended for population-level metabolic control at the lowest achievable burden of harm; formulation strategy must be selected by a qualified team from the required properties below, not inferred from this record.`,
    conceptualSynthesisRoute: 'CONCEPTUAL ONLY: route selection is left to a qualified synthetic chemistry team working under institutional oversight. This record intentionally contains no step-level procedure, no reagent quantities, and no operational parameters.',
    requiredProperties: [
      `Retained potency at the mechanism targets above (reference: the pinned ChEMBL medians for ${s.moleculeChemblId}).`,
      'Adverse-event profile at or below the reference across every preregistered LOWER-HARM safety category.',
      'Exposure characteristics compatible with the dosing interval studied in the contributing trials.',
      'Manufacturability at national-programme scale — UNVERIFIED in this run.',
    ],
    materialClasses: [s.moleculeType],
    provenance: 'ChEMBL Web Services (mechanism, potency, development stage) + ClinicalTrials.gov API v2 (efficacy, adverse events). Per-file URLs and hashes in the pinned a2-ozempic-substitute/meta.json.',
    sources: ['ChEMBL Web Services', 'ClinicalTrials.gov API v2'],
    identifiers: [s.moleculeChemblId, ...winner.efficacy.map((e) => e.nctId)],
    evidence: winner.efficacy.map((e) => `${e.nctId} (${e.comparisonType}): delta=${e.deltaVsSemaglutidePp?.toFixed(2) ?? 'n/a'}pp vs reference`),
    replay: replayFingerprint,
    dualUseGuard: 'ASSERTED',
  };

  return { ...recipe, recipeFingerprint: fnv1a(canonicalJson(recipe)) };
}

/**
 * D-081 — the molecular domain's WinnerRecord -> ResearchRecipe path, with the
 * recipe LOCK enforced by the type system rather than by a convention.
 *
 * ==================== WHY THIS LIVES HERE, IN TYPESCRIPT ==================
 *
 * The canonical Winner Promotion Gate is `orchestrator/winnerGate.ts`
 * (D-057), and `MINIMUM_OBSERVATIONS` lives in
 * `agent/practicalCandidateGate.ts`. The directive is explicit: USE the
 * existing canonical gate, do not build a second one. A `.mjs` backend module
 * cannot import those without duplicating the number, and a duplicated
 * minimum IS a second gate — so this module sits on the TypeScript side and
 * imports the real thing. The backend (chemistry, QSAR, DAG) hands over a
 * plain JSON artifact; nothing about the promotion rule is re-decided here.
 *
 * ======================= THE LOCK IS STRUCTURAL ===========================
 *
 * `buildMounjaroResearchRecipe` returns a DISCRIMINATED UNION. On the locked
 * branch there is no `recipe` property to read at all — a caller cannot
 * "forget to check a flag" and print a recipe that was never issued, because
 * the field does not exist on that branch. This is the code-enforced lock the
 * directive requires ("Jeżeli nie ma WinnerRecord: RECIPE MUST BE LOCKED. To
 * musi być wymuszone kodem").
 *
 * ===================== THE STRUCTURAL DOUBLE WALL =========================
 *
 * Two independent walls stand between this pipeline and a recipe, and today
 * BOTH of them hold:
 *   1. VERDICT. The molecular mission's own `decide()` ceiling is
 *      COMPUTATIONAL_CANDIDATE; it has no branch returning WINNER. Anything
 *      other than WINNER fails the canonical gate immediately.
 *   2. EVIDENCE CLASS. Every experiment this pipeline can run is
 *      COMPUTATIONAL, which ranks 2 in `DEFAULT_EVIDENCE_CLASS_RANK`, far
 *      below the INDIRECT_RANDOMISED (9) threshold the canonical gate
 *      requires. So even a hypothetical WINNER verdict backed by a thousand
 *      in-silico runs still cannot promote. In-silico work cannot become
 *      clinical evidence by accumulating — that is the intended behaviour,
 *      not a limitation to engineer around.
 */

import { canPromoteToWinnerRecord, asEvidenceClass, type EvidenceInventoryItem, type PromotionResult } from '../../orchestrator/winnerGate';
import type { Verdict } from '../../orchestrator/contracts';
import { canonicalJson, fnv1a } from '../../events/hash';

/** What the backend chemistry/QSAR/DAG side hands over. Plain data — no behaviour crosses the boundary. */
export interface MolecularDiscoveryArtifact {
  readonly missionId: string;
  readonly objectiveFingerprint: string;
  readonly adjudicationVerdict: Verdict;
  readonly candidateId: string | null;
  readonly canonicalStructure: string | null;
  readonly parentage: readonly { readonly parentSmiles: string | null; readonly transformation: string | null }[];
  readonly targetHypotheses: readonly string[];
  readonly glp1r: { readonly available: boolean; readonly code: string; readonly reasons: readonly string[]; readonly modelFingerprint: string | null };
  readonly gipr: { readonly available: boolean; readonly code: string; readonly reasons: readonly string[]; readonly modelFingerprint: string | null };
  readonly dualTarget: { readonly outcome: string; readonly blockers: readonly { readonly code: string; readonly detail: string }[]; readonly fingerprint: string };
  readonly modelVersions: Readonly<Record<string, string | null>>;
  readonly datasetFingerprints: Readonly<Record<string, string | null>>;
  readonly evidence: readonly { readonly evidenceClass: string; readonly observationCount: number; readonly sourceId: string }[];
  readonly experimentGraph: { readonly runId: string; readonly graphFingerprint: string; readonly nodes: readonly { readonly nodeId: string; readonly status: string; readonly code: string }[] };
  readonly falsification: readonly { readonly probe: string; readonly result: string; readonly detail: string }[];
  readonly failedAlternatives: readonly { readonly candidateId: string; readonly rejectedReason: string }[];
  readonly knownUnknowns: readonly string[];
  readonly reproducibility: { readonly deterministic: boolean; readonly replayVerdict: string };
}

export interface MounjaroResearchRecipe {
  readonly recipeId: string;
  readonly missionId: string;
  readonly candidateId: string;
  readonly canonicalStructure: string;
  readonly parentage: MolecularDiscoveryArtifact['parentage'];
  readonly targetHypotheses: readonly string[];
  readonly glp1rResults: MolecularDiscoveryArtifact['glp1r'];
  readonly giprResults: MolecularDiscoveryArtifact['gipr'];
  readonly modelVersions: Readonly<Record<string, string | null>>;
  readonly datasetFingerprints: Readonly<Record<string, string | null>>;
  readonly evidenceReferences: readonly string[];
  readonly experimentGraph: MolecularDiscoveryArtifact['experimentGraph'];
  readonly falsificationHistory: MolecularDiscoveryArtifact['falsification'];
  readonly failedAlternatives: MolecularDiscoveryArtifact['failedAlternatives'];
  readonly winnerAdjudication: PromotionResult;
  readonly evidenceLevel: string;
  readonly knownUnknowns: readonly string[];
  readonly reproducibility: MolecularDiscoveryArtifact['reproducibility'];
  readonly executionRecipe: readonly string[];
  readonly researchNextSteps: readonly string[];
  readonly nonClinicalDisclaimer: string;
  readonly fingerprint: string;
}

export type MounjaroRecipeOutcome =
  | { readonly status: 'RECIPE_ISSUED'; readonly recipe: MounjaroResearchRecipe; readonly promotion: PromotionResult }
  | { readonly status: 'RECIPE_LOCKED'; readonly reasons: readonly string[]; readonly promotion: PromotionResult; readonly lockFingerprint: string };

export const NON_CLINICAL_DISCLAIMER =
  'COMPUTATIONAL RESEARCH ARTIFACT. This is not a prescription, not a human dose, not a clinical instruction and not an approved medicine. Nothing in it establishes efficacy or safety in any organism. It records what was computed, under which frozen rules, from which pinned data, so that another laboratory can reproduce the computation and decide for itself what to test in the wet lab.';

/**
 * Maps the artifact's declared evidence into the canonical inventory shape.
 * `asEvidenceClass` (canonical) refuses to read an unrecognized string as
 * strong: anything it does not know becomes UNVERIFIED (rank 1), so a typo or
 * an invented class name can never buy strength.
 */
export function evidenceInventoryFor(artifact: MolecularDiscoveryArtifact): readonly EvidenceInventoryItem[] {
  return artifact.evidence.map((e) => ({ evidenceClass: asEvidenceClass(e.evidenceClass), observationCount: Math.max(0, Math.trunc(e.observationCount)) }));
}

export function buildMounjaroResearchRecipe(artifact: MolecularDiscoveryArtifact): MounjaroRecipeOutcome {
  const inventory = evidenceInventoryFor(artifact);
  // THE canonical gate. Not re-implemented, not parameterised into leniency.
  const promotion = canPromoteToWinnerRecord({ adjudicationVerdict: artifact.adjudicationVerdict, inventory });

  if (promotion.outcome !== 'PROMOTE') {
    const reasons = [...promotion.reasons];
    // The dual-target blockers are added so the lock explains the SCIENCE, not
    // only the gate arithmetic — a reader should see why the mechanism was
    // incomplete, not just that a count was too low.
    for (const b of artifact.dualTarget.blockers) reasons.push(`${b.code}: ${b.detail}`);
    return {
      status: 'RECIPE_LOCKED',
      reasons,
      promotion,
      lockFingerprint: fnv1a(canonicalJson({ verdict: artifact.adjudicationVerdict, reasons, objective: artifact.objectiveFingerprint })),
    };
  }

  if (!artifact.candidateId || !artifact.canonicalStructure) {
    // Defensive and deliberately not silent: a PROMOTE with no structure would
    // be a recipe for nothing.
    return {
      status: 'RECIPE_LOCKED',
      reasons: ['PROMOTE was returned but the artifact carries no candidate structure — refusing to issue a recipe with no subject'],
      promotion,
      lockFingerprint: fnv1a(canonicalJson({ missing: 'candidateStructure' })),
    };
  }

  const body = {
    missionId: artifact.missionId,
    candidateId: artifact.candidateId,
    canonicalStructure: artifact.canonicalStructure,
    parentage: artifact.parentage,
    targetHypotheses: artifact.targetHypotheses,
    glp1rResults: artifact.glp1r,
    giprResults: artifact.gipr,
    modelVersions: artifact.modelVersions,
    datasetFingerprints: artifact.datasetFingerprints,
    evidenceReferences: artifact.evidence.map((e) => e.sourceId),
    experimentGraph: artifact.experimentGraph,
    falsificationHistory: artifact.falsification,
    failedAlternatives: artifact.failedAlternatives,
    winnerAdjudication: promotion,
    evidenceLevel: `${promotion.strongCount} observation(s) at or above INDIRECT_RANDOMISED out of ${promotion.totalObservations} total`,
    knownUnknowns: artifact.knownUnknowns,
    reproducibility: artifact.reproducibility,
    executionRecipe: [
      `re-run the experiment DAG at runId ${artifact.experimentGraph.runId}`,
      `verify graphFingerprint ${artifact.experimentGraph.graphFingerprint}`,
      `verify dataset fingerprints ${canonicalJson(artifact.datasetFingerprints)}`,
      `verify objective fingerprint ${artifact.objectiveFingerprint}`,
    ],
    researchNextSteps: artifact.knownUnknowns.map((u) => `resolve before any wet-lab claim: ${u}`),
    nonClinicalDisclaimer: NON_CLINICAL_DISCLAIMER,
  };

  return {
    status: 'RECIPE_ISSUED',
    promotion,
    recipe: { recipeId: `recipe:${artifact.missionId}:${artifact.candidateId}`, ...body, fingerprint: fnv1a(canonicalJson(body)) },
  };
}

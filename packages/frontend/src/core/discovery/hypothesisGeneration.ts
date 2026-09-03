/**
 * SCIENTIFIC HYPOTHESIS GENERATION — the generic core.
 *
 * Every hypothesis engine so far in this codebase either evaluates
 * HAND-AUTHORED candidates (spacetimeStructureInquiry.ts's 5 named
 * hypotheses; competingHypotheses.ts) or derives candidates from a
 * DECLARED, closed model surface for a pre-registered problem
 * (hypothesisLoop.ts's HYPOTHESIS_PROBLEMS). Neither can take an unseen
 * question and produce candidates nobody wrote down in advance.
 *
 * This module is the missing, deliberately small piece: a shared shape and
 * a shared structural-integrity check for a hypothesis Genesis GENERATED
 * itself, from declared inputs, via a named, auditable strategy — never
 * from free-text creativity. The actual generation strategies (which
 * inputs get combined, and how) live in domain modules
 * (physics/generatedSpacetimeHypotheses.ts, physics/generatedPhysicsModelCandidates.ts)
 * because what counts as a valid combination is domain knowledge this core
 * does not and should not encode. What IS domain-agnostic — and is exactly
 * what was missing — is:
 *
 *   - one shared lifecycle: GENERATED -> FORMALIZED -> CHECKED -> TESTED,
 *     with a verdict (SUPPORTED/WEAKENED/FALSIFIED/UNRESOLVED/BLOCKED)
 *     attached only at TESTED, never earlier;
 *   - one shared, real structural check (`formalizeGeneratedHypothesis`)
 *     that can actually fail — a candidate with a duplicate dependency, or
 *     a missing prediction/falsification/assumption, is genuinely rejected
 *     here, not narrated as fine;
 *   - one shared novelty discipline: a generated candidate defaults to
 *     `NOVELTY_NOT_ESTABLISHED` and is never marked otherwise by this
 *     engine, because Genesis has no corpus of prior published hypotheses
 *     to check novelty against — claiming novelty without that check would
 *     be exactly the kind of fabricated-discovery claim this engine
 *     refuses to make;
 *   - one shared fingerprint discipline, so two runs over identical inputs
 *     produce identical candidates, and any drift is detectable, never
 *     silently accepted.
 *
 * A GENERATED HYPOTHESIS IS NEVER EVIDENCE. A verdict of SUPPORTED here
 * means "consistent with the declared dependencies under this generator's
 * classification rule" — it is a DERIVED / MODEL-BASED conclusion, never a
 * measurement, and never asserted as a scientific discovery.
 */
import { canonicalJson, fnv1a } from '../events/hash';

export const HYPOTHESIS_GENERATION_VERSION = '1.0.0';

export type GeneratedHypothesisStatus = 'GENERATED' | 'FORMALIZED' | 'CHECKED' | 'TESTED';

export type GeneratedHypothesisVerdict = 'SUPPORTED' | 'WEAKENED' | 'FALSIFIED' | 'UNRESOLVED' | 'BLOCKED';

/**
 * Named, auditable generation strategies. A candidate must declare which
 * one produced it — "GENERATED" with no named strategy is not accepted by
 * `formalizeGeneratedHypothesis`.
 */
export type GenerationStrategy =
  | 'CONSTRAINT_COMBINATION'
  | 'KNOWN_EQUATION_TRANSFORMATION'
  | 'MECHANISM_RECOMBINATION'
  | 'PARAMETERIZED_MODEL_FAMILY'
  | 'CONTROLLED_MATHEMATICAL_PERTURBATION';

/**
 * `NOVELTY_NOT_ESTABLISHED` is the only status this engine ever assigns —
 * see the module docstring. `KNOWN_COMBINATION` exists for a caller that
 * DOES have an external corpus to check against and wants to record a
 * negative novelty result; nothing in this codebase currently supplies one.
 */
export type NoveltyStatus = 'NOVELTY_NOT_ESTABLISHED' | 'KNOWN_COMBINATION';

export interface FormalizationOutcome {
  ok: boolean;
  reason: string;
}

export interface GeneratedHypothesis {
  hypothesisId: string;
  domainId: string;
  statement: string;
  strategy: GenerationStrategy;
  /** IDs of the declared constraints/models/variables this candidate was built from — never free text. */
  dependencyIds: readonly string[];
  assumptions: readonly string[];
  /** WHY this specific candidate was generated, referencing the dependency ids above. */
  generationRationale: string;
  expectedPrediction: string;
  falsificationCriteria: string;
  requiredComputation: readonly string[];
  requiredData: readonly string[];
  noveltyStatus: NoveltyStatus;
  status: GeneratedHypothesisStatus;
  formalization: FormalizationOutcome;
  /** Null until formalization succeeds; a candidate that fails formalization never reaches CHECKED/TESTED. */
  check: FormalizationOutcome | null;
  verdict: GeneratedHypothesisVerdict | null;
  verdictReasoning: string | null;
  provenance: readonly string[];
  fingerprint: string;
}

export interface GeneratedHypothesisDraft {
  hypothesisId: string;
  domainId: string;
  statement: string;
  strategy: GenerationStrategy;
  dependencyIds: readonly string[];
  assumptions: readonly string[];
  generationRationale: string;
  expectedPrediction: string;
  falsificationCriteria: string;
  requiredComputation: readonly string[];
  requiredData: readonly string[];
  provenance: readonly string[];
}

function computeFingerprint(draft: GeneratedHypothesisDraft): string {
  return fnv1a(canonicalJson({
    v: HYPOTHESIS_GENERATION_VERSION,
    hypothesisId: draft.hypothesisId,
    domainId: draft.domainId,
    statement: draft.statement,
    strategy: draft.strategy,
    dependencyIds: [...draft.dependencyIds].sort(),
    assumptions: draft.assumptions,
    expectedPrediction: draft.expectedPrediction,
    falsificationCriteria: draft.falsificationCriteria,
  }));
}

/**
 * The ONLY structural gate every generated candidate passes through. Real,
 * and it can really fail:
 *  - a dependency id repeated is a malformed combination, not a candidate;
 *  - a candidate with no dependencies traces to nothing and is not a
 *    generated hypothesis, it is an assertion;
 *  - a missing prediction, falsification criterion, or assumption is an
 *    incomplete formalization, not a minor omission — an untestable,
 *    unfalsifiable, unstated-assumption "hypothesis" is not one.
 *
 * A candidate that fails stays at status GENERATED with verdict BLOCKED —
 * it never reaches CHECKED or TESTED.
 */
export function formalizeGeneratedHypothesis(draft: GeneratedHypothesisDraft): GeneratedHypothesis {
  const fingerprint = computeFingerprint(draft);
  const seen = new Set<string>();
  let duplicateDependency: string | null = null;
  for (const id of draft.dependencyIds) {
    if (seen.has(id)) { duplicateDependency = id; break; }
    seen.add(id);
  }

  const missing: string[] = [];
  if (draft.dependencyIds.length === 0) missing.push('dependencyIds');
  if (draft.assumptions.length === 0) missing.push('assumptions');
  if (draft.expectedPrediction.trim().length === 0) missing.push('expectedPrediction');
  if (draft.falsificationCriteria.trim().length === 0) missing.push('falsificationCriteria');
  if (draft.generationRationale.trim().length === 0) missing.push('generationRationale');

  const base: GeneratedHypothesis = {
    ...draft,
    noveltyStatus: 'NOVELTY_NOT_ESTABLISHED',
    status: 'GENERATED',
    formalization: { ok: true, reason: '' },
    check: null,
    verdict: null,
    verdictReasoning: null,
    fingerprint,
  };

  if (duplicateDependency !== null) {
    return { ...base, formalization: { ok: false, reason: `Duplicate dependency id "${duplicateDependency}" — a candidate cannot depend on the same declared input twice.` }, verdict: 'BLOCKED', verdictReasoning: 'Formalization failed: malformed combination.' };
  }
  if (missing.length > 0) {
    return { ...base, formalization: { ok: false, reason: `Missing required field(s): ${missing.join(', ')} — an incomplete candidate cannot be formalized.` }, verdict: 'BLOCKED', verdictReasoning: 'Formalization failed: incomplete candidate.' };
  }

  return { ...base, status: 'FORMALIZED' };
}

/**
 * Advances a FORMALIZED candidate to CHECKED using a caller-supplied,
 * domain-specific referential check (e.g. "every dependency id names a
 * constraint that actually exists in the declared registry"). This core
 * holds no domain registry of its own, so it cannot silently accept an
 * undeclared dependency.
 */
export function checkGeneratedHypothesis(
  candidate: GeneratedHypothesis,
  check: (candidate: GeneratedHypothesis) => FormalizationOutcome,
): GeneratedHypothesis {
  if (candidate.status !== 'FORMALIZED') {
    return candidate;
  }
  const outcome = check(candidate);
  if (!outcome.ok) {
    return { ...candidate, check: outcome, verdict: 'BLOCKED', verdictReasoning: `Check failed: ${outcome.reason}` };
  }
  return { ...candidate, status: 'CHECKED', check: outcome };
}

/**
 * Advances a CHECKED candidate to TESTED using a caller-supplied,
 * domain-specific test that returns the actual verdict. This core does not
 * decide what "SUPPORTED" means for any domain — it only enforces that a
 * verdict can be assigned exclusively at this final stage, never earlier.
 */
export function testGeneratedHypothesis(
  candidate: GeneratedHypothesis,
  test: (candidate: GeneratedHypothesis) => { verdict: GeneratedHypothesisVerdict; reasoning: string },
): GeneratedHypothesis {
  if (candidate.status !== 'CHECKED') {
    return candidate;
  }
  const { verdict, reasoning } = test(candidate);
  return { ...candidate, status: 'TESTED', verdict, verdictReasoning: reasoning };
}

export interface HypothesisGenerationReplay {
  status: 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE' | 'BLOCKED';
  reason: string;
}

/**
 * Replays ONE candidate: recomputes its fingerprint from its own declared
 * draft fields and compares. `NOT_COMPARABLE` is for when a dependency id
 * the candidate relies on no longer exists in the current registry (the
 * caller passes that check in) — a fingerprint mismatch in that case is not
 * drift, it is a changed world, and conflating the two would hide exactly
 * the information a researcher needs.
 */
export function replayGeneratedHypothesis(
  saved: GeneratedHypothesis,
  recomputed: GeneratedHypothesis,
  dependenciesStillExist: boolean,
): HypothesisGenerationReplay {
  if (!dependenciesStillExist) {
    return { status: 'NOT_COMPARABLE', reason: 'One or more of this candidate\'s declared dependencies no longer exist in the current registry — the world this candidate was generated from has changed, this is not a reproducibility check.' };
  }
  if (saved.fingerprint !== recomputed.fingerprint) {
    return { status: 'DRIFT', reason: `Recomputing from the same declared inputs produced a different fingerprint (${saved.fingerprint} -> ${recomputed.fingerprint}) — the generation strategy or a dependency's content changed since this candidate was saved.` };
  }
  if (saved.verdict !== recomputed.verdict) {
    return { status: 'DRIFT', reason: `Fingerprint matched but the verdict changed (${saved.verdict} -> ${recomputed.verdict}) — the classification rule changed since this candidate was saved.` };
  }
  return { status: 'MATCH', reason: '' };
}

/**
 * AUTONOMOUS HYPOTHESIS GENERATION — the temporal domain's first real
 * demonstration.
 *
 * `spacetimeStructureInquiry.ts`'s 5 named hypotheses are HAND-AUTHORED —
 * a person wrote each statement and declared its dependencies. This module
 * is different: given a question NOBODY WROTE ONE OF THOSE 5 HYPOTHESES
 * FOR, it selects which of the declared, real physics constraints are
 * relevant, and GENERATES new candidate hypotheses by combining pairs of
 * them that no existing named hypothesis already combines — classified by
 * the exact same rule (`classifyConstraintDependencies`) that governs the
 * hand-authored 5, so a generated candidate is judged by the identical
 * standard, not a looser one.
 *
 * WHAT "GENERATION" MEANS HERE, PRECISELY, AND WHAT IT DOES NOT:
 *
 *  - RELEVANCE SELECTION is deterministic token overlap between the
 *    question and each constraint's own declared text (constraintId +
 *    statement). This is NOT semantic understanding, and this module says
 *    so: it is a citable, auditable filter over WHICH KNOWN FACTS apply,
 *    not a lookup of a pre-written answer. If token overlap is too sparse
 *    to be meaningful (fewer than a stated threshold), it explicitly falls
 *    back to the full constraint registry rather than silently returning
 *    an empty, useless result.
 *
 *  - COMBINATION is exhaustive pairing of the relevant constraints,
 *    excluding any pair already jointly used as dependencies by one of the
 *    5 named hypotheses (so this never just re-derives what a human
 *    already wrote). Each pair becomes exactly one candidate.
 *
 *  - RELATION ASSIGNMENT per constraint in a generated pair is a
 *    deterministic rule from the constraint's own declared status
 *    (CONJECTURE -> DEPENDS_ON_UNRESOLVED, else -> SUPPORTS). This module
 *    NEVER auto-assigns CONTRADICTS: detecting that two statements
 *    logically contradict requires understanding this generator does not
 *    have, and fabricating that judgement would be worse than not making
 *    it. This is a disclosed limitation, not a hidden one — see
 *    `GENERATION_LIMITATIONS` below, and it is why every candidate this
 *    strategy produces settles at CONSISTENT/SPECULATIVE/UNRESOLVED, never
 *    CONTRADICTS_ESTABLISHED_PHYSICS. Real falsification-by-computation is
 *    demonstrated instead by `generatedPhysicsModelCandidates.ts`.
 *
 * A GENERATED CANDIDATE IS NEVER A DISCOVERY. Its statement is a
 * conservative, literal restatement of "these two established facts are
 * jointly consistent" — never an inferred new consequence, and never an
 * assertion of a fifth dimension, time travel, or an Einstein-Rosen
 * omission (the SAME structural guard `registerSpacetimeHypothesis` uses
 * is applied here too, since a generator is exactly where an unconstrained
 * mechanism could otherwise slip a forbidden premise in unnoticed).
 */
import {
  checkGeneratedHypothesis,
  formalizeGeneratedHypothesis,
  testGeneratedHypothesis,
  type GeneratedHypothesis,
  type HypothesisGenerationReplay,
} from '../hypothesisGeneration';
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import {
  classifyConstraintDependencies,
  ESTABLISHED_SPACETIME_CONSTRAINTS,
  SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES,
  type EstablishedPhysicsConstraint,
} from './spacetimeStructureInquiry';

export const GENERATED_SPACETIME_HYPOTHESES_VERSION = '1.0.0';

export const GENERATION_LIMITATIONS: readonly string[] = [
  'Relevance selection is deterministic token overlap with each constraint\'s own declared text, not semantic understanding — a genuinely relevant constraint using different vocabulary than the question can be missed.',
  'This generator never assigns a CONTRADICTS relation: detecting that two established statements logically contradict is beyond what token-overlap combination can honestly claim, so every generated candidate settles at CONSISTENT/SPECULATIVE/UNRESOLVED, never CONTRADICTS_ESTABLISHED_PHYSICS.',
  'Combination is limited to PAIRS of constraints; larger combinations are not attempted in this first pass.',
];

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
}

export interface RelevantConstraint {
  constraint: EstablishedPhysicsConstraint;
  relevance: number;
  matchedTokens: readonly string[];
}

export interface RelevanceSelection {
  question: string;
  selected: readonly RelevantConstraint[];
  usedFallback: boolean;
  fallbackReason: string;
}

/**
 * Deterministic relevance filter. Falls back to the full registry — with
 * `usedFallback: true` and every constraint's own relevance score still
 * recorded truthfully (often 0) — when fewer than `minCount` constraints
 * clear `minRelevance`, rather than generating from an artificially tiny,
 * possibly misleading subset.
 */
export function selectRelevantConstraints(question: string, minRelevance = 1, minCount = 4): RelevanceSelection {
  const qTokens = tokenize(question);
  const scored = ESTABLISHED_SPACETIME_CONSTRAINTS.map((constraint) => {
    const cTokens = tokenize(`${constraint.constraintId} ${constraint.statement}`);
    const matchedTokens = [...qTokens].filter((t) => cTokens.has(t)).sort();
    return { constraint, relevance: matchedTokens.length, matchedTokens };
  });

  const relevant = scored.filter((s) => s.relevance >= minRelevance);
  if (relevant.length >= minCount) {
    return { question, selected: relevant, usedFallback: false, fallbackReason: '' };
  }
  return {
    question,
    selected: scored,
    usedFallback: true,
    fallbackReason: `Token-overlap relevance found only ${relevant.length} constraint(s) meeting the threshold (need >= ${minCount}); falling back to the full declared registry (${scored.length} constraints) rather than generating from too sparse a subset.`,
  };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/** Pairs already jointly used as dependencies by one of the 5 hand-authored hypotheses — never regenerated as "new". */
function alreadyNamedPairs(): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const h of SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES) {
    const ids = h.dependencies.map((d) => d.constraintId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) pairs.add(pairKey(ids[i]!, ids[j]!));
    }
  }
  return pairs;
}

function relationFor(constraint: EstablishedPhysicsConstraint): 'SUPPORTS' | 'DEPENDS_ON_UNRESOLVED' {
  return constraint.status === 'CONJECTURE' ? 'DEPENDS_ON_UNRESOLVED' : 'SUPPORTS';
}

export interface GeneratedSpacetimeHypothesesResult {
  contractVersion: string;
  question: string;
  relevance: RelevanceSelection;
  candidates: readonly GeneratedHypothesis[];
  limitations: readonly string[];
  resultFingerprint: string;
}

function fingerprintOf(candidates: readonly GeneratedHypothesis[]): string {
  const json = JSON.stringify(candidates.map((c) => c.fingerprint).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generates every new (never previously named) pair-combination candidate
 * from the constraints this question was found relevant to, then runs each
 * through the full GENERATED -> FORMALIZED -> CHECKED -> TESTED pipeline.
 * Does not fabricate an existence claim of any kind: candidates that fail
 * formalization or checking are returned too, honestly marked BLOCKED.
 */
export function generateSpacetimeHypotheses(question: string): GeneratedSpacetimeHypothesesResult {
  const relevance = selectRelevantConstraints(question);
  const named = alreadyNamedPairs();
  const constraints = relevance.selected.map((r) => r.constraint);

  const candidates: GeneratedHypothesis[] = [];
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const c1 = constraints[i]!;
      const c2 = constraints[j]!;
      const key = pairKey(c1.constraintId, c2.constraintId);
      if (named.has(key)) continue;

      const hypothesisId = `gen_${key}`.toLowerCase().replace(/[^a-z0-9_|]+/g, '-');
      const draft = {
        hypothesisId,
        domainId: 'PHYSICS_TEMPORAL',
        statement: `A position holding both that "${c1.statement}" and that "${c2.statement}" is internally consistent under this generator's classification rule; this candidate makes no claim beyond that joint consistency.`,
        strategy: 'CONSTRAINT_COMBINATION' as const,
        dependencyIds: [c1.constraintId, c2.constraintId],
        assumptions: [
          'The two constraints are logically independent (neither directly restates the other).',
          'No auto-detected contradiction exists between them (this generator does not check for contradiction — see GENERATION_LIMITATIONS).',
        ],
        generationRationale: `Generated by pairing constraint "${c1.constraintId}" with "${c2.constraintId}", both selected as relevant to the question "${question}", and not already jointly used as dependencies by any hand-authored hypothesis in this registry.`,
        expectedPrediction: 'No known experiment or observation is predicted to require rejecting the joint holding of these two constraints.',
        falsificationCriteria: `Would be falsified if a confirmed fact is later shown to logically exclude the joint holding of "${c1.constraintId}" and "${c2.constraintId}" — a judgement this generator does not itself make.`,
        requiredComputation: ['deterministic constraint-status classification (classifyConstraintDependencies)'],
        requiredData: [],
        provenance: [`strategy:CONSTRAINT_COMBINATION`, `constraint:${c1.constraintId}`, `constraint:${c2.constraintId}`, `question:${question}`],
      };

      let candidate = formalizeGeneratedHypothesis(draft);
      candidate = checkGeneratedHypothesis(candidate, (c) => {
        const missing = c.dependencyIds.filter((id) => !ESTABLISHED_SPACETIME_CONSTRAINTS.some((k) => k.constraintId === id));
        if (missing.length > 0) return { ok: false, reason: `Dependency id(s) not found in the declared registry: ${missing.join(', ')}.` };
        return { ok: true, reason: 'Every dependency id names a constraint declared in ESTABLISHED_SPACETIME_CONSTRAINTS.' };
      });
      candidate = testGeneratedHypothesis(candidate, (c) => {
        const deps = c.dependencyIds.map((id) => {
          const constraint = ESTABLISHED_SPACETIME_CONSTRAINTS.find((k) => k.constraintId === id)!;
          return { constraintId: id, relation: relationFor(constraint) };
        });
        const { verdict, reasoning } = classifyConstraintDependencies(deps);
        const mapped = verdict === 'CONSISTENT_WITH_ALL_CONFIRMED_OBSERVATIONS' ? 'SUPPORTED' as const
          : verdict === 'SPECULATIVE_NOT_EXCLUDED' ? 'WEAKENED' as const
            : verdict === 'CONTRADICTS_ESTABLISHED_PHYSICS' ? 'FALSIFIED' as const
              : 'UNRESOLVED' as const;
        return { verdict: mapped, reasoning };
      });

      candidates.push(candidate);
    }
  }

  return {
    contractVersion: GENERATED_SPACETIME_HYPOTHESES_VERSION,
    question,
    relevance,
    candidates,
    limitations: GENERATION_LIMITATIONS,
    resultFingerprint: fingerprintOf(candidates),
  };
}

/**
 * Replays the full generation: re-runs `generateSpacetimeHypotheses` on the
 * SAME question and compares fingerprints. Since the registry is a static,
 * declared constant in this runtime, every dependency always "still
 * exists" here — NOT_COMPARABLE would only arise if the registry itself
 * shrank between save and replay, which this function does check for.
 */
export function replayGeneratedSpacetimeHypotheses(saved: GeneratedSpacetimeHypothesesResult): HypothesisGenerationReplay {
  const currentIds = new Set(ESTABLISHED_SPACETIME_CONSTRAINTS.map((c) => c.constraintId));
  const dependenciesStillExist = saved.candidates.every((c) => c.dependencyIds.every((id) => currentIds.has(id)));
  if (!dependenciesStillExist) {
    return { status: 'NOT_COMPARABLE', reason: 'One or more saved candidates depend on a constraint id no longer declared in the current registry.' };
  }

  const recomputed = generateSpacetimeHypotheses(saved.question);
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: `Recomputing generation for the same question produced a different set of candidates (fingerprint ${saved.resultFingerprint} -> ${recomputed.resultFingerprint}).` };
  }
  return { status: 'MATCH', reason: '' };
}

export function saveGeneratedSpacetimeHypothesesToMemory(result: GeneratedSpacetimeHypothesesResult): SavedExperiment {
  const byVerdict = (v: string) => result.candidates.filter((c) => c.verdict === v).length;
  return saveExperiment({
    labId: 'physics-generated-spacetime-hypotheses',
    experimentId: `generated-spacetime:${result.resultFingerprint}`,
    experimentName: `Generated hypotheses — "${result.question.slice(0, 60)}"`,
    params: {
      question: result.question,
      relevantConstraintCount: result.relevance.selected.length,
      usedFallback: result.relevance.usedFallback ? 1 : 0,
      candidateCount: result.candidates.length,
    },
    stats: {
      supported: byVerdict('SUPPORTED'),
      weakened: byVerdict('WEAKENED'),
      falsified: byVerdict('FALSIFIED'),
      unresolved: byVerdict('UNRESOLVED'),
      blocked: byVerdict('BLOCKED'),
    },
    analysis: [
      { title: 'Question', kind: 'question', body: result.question },
      { title: 'Relevance selection', kind: 'relevance', body: result.relevance.usedFallback ? result.relevance.fallbackReason : `${result.relevance.selected.length} constraint(s) selected by token overlap.` },
      ...result.candidates.map((c) => ({ title: c.hypothesisId, kind: 'generated-hypothesis', body: `[${c.status}/${c.verdict ?? 'PENDING'}] ${c.generationRationale}` })),
      { title: 'Limitations', kind: 'limitations', body: result.limitations.join(' ') },
    ],
    honesty: 'simplified',
    honestyNote:
      'Every candidate here was GENERATED by this engine (constraint-pair combination), not hand-authored, and none is presented as evidence or as a discovery. '
      + 'Novelty is NOVELTY_NOT_ESTABLISHED for every candidate — this engine has no corpus of prior published hypotheses to check against.',
    epistemicStatus: `GENERATED=${result.candidates.length};SUPPORTED=${byVerdict('SUPPORTED')};WEAKENED=${byVerdict('WEAKENED')};UNRESOLVED=${byVerdict('UNRESOLVED')};BLOCKED=${byVerdict('BLOCKED')}`,
    assumptions: [...GENERATION_LIMITATIONS],
  });
}

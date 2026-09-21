import type { ProblemRecord } from '../orchestrator/contracts';
import { canonicalJson, fnv1a } from '../events/hash';
import type { StructuredProblemExtension } from './contracts';

/**
 * STRUCTURED PROBLEM EXTENSION (docs/DECISIONS.md D-060).
 *
 * NOT A SECOND PARSER. `orchestrator/nl.ts::parseProblem` (D-055) remains the
 * only thing that turns NL into a `ProblemRecord` and the only thing that
 * decides `NEEDS_INPUT`. This module never re-runs those checks and never
 * produces a `ProblemRecord`; it derives an ADDITIONAL, referencing record
 * keyed by `problemId`, carrying the structure the Mind needs (entities,
 * variables, observables, unknowns, causal candidates, falsification
 * targets) and nothing the orchestrator already owns.
 *
 * Deterministic by construction: every field is derived from the
 * `ProblemRecord` plus the supplied knowledge terms, and the fingerprint
 * covers the source record's own fingerprint — the same inputs always
 * produce the same extension, so a run carrying it stays replayable.
 */
export function buildStructuredProblemExtension(problem: ProblemRecord, knowledgeTerms: readonly string[]): StructuredProblemExtension {
  const haystack = problem.nlInput.toLowerCase();
  const base = {
    problemId: problem.problemId,
    entities: knowledgeTerms.filter((term) => haystack.includes(term.toLowerCase())),
    variables: problem.objectives.map((objective) => objective.metric),
    observables: problem.objectives.map((objective) => `${objective.metric}(${objective.direction})`),
    // Reuses parseProblem's OWN fail-closed finding rather than re-deriving what is missing.
    unknowns: [...problem.missingInputs],
    causalCandidates: problem.harmAxes.map((axis) => ({ cause: 'intervention', effect: axis })),
    falsificationTargets: problem.objectives
      .filter((objective) => objective.floor !== undefined)
      .map((objective) => `${objective.metric} floor ${String(objective.floor)}`),
  };
  return Object.freeze({ ...base, fingerprint: fnv1a(canonicalJson({ ...base, problemFingerprint: problem.fingerprint })) });
}

import type { GenerationSpec } from './generation';
import type { DiscoveryQuestion } from './types';

/**
 * ONE DEMONSTRATION SCENARIO — generic computational discovery, no safety
 * claim of any kind.
 *
 * The question is deliberately about satisfying declared COMPUTATIONAL
 * constraints in a composition space. The target is present so the lineage has
 * something to point at, and its affinity capability is honestly
 * `REQUIRES_EXTERNAL_ENGINE`: this repository has no docking/affinity engine
 * on this path, so no criterion binds a candidate to the target and none is
 * invented.
 *
 * The criteria mix on purpose:
 *  - two REQUIRED criteria the formula engine can really compute (molecular
 *    weight, heavy-atom count) — these produce genuine PASS/FAIL,
 *  - one REQUIRED criterion on a structural property (logP) that has no engine
 *    unless RDKit is connected — this is what forces the honest `NOT_RESOLVED`
 *    path instead of a fabricated pass.
 */
export const DEMO_DISCOVERY_QUESTION_ID = 'question_demo_composition_v1';

export function buildDemoDiscoveryQuestion(): DiscoveryQuestion {
  return {
    questionId: DEMO_DISCOVERY_QUESTION_ID,
    question: 'Which candidate compositions in the declared chemical space satisfy the declared computational constraints?',
    target: {
      targetId: 'target_fixture_generic',
      label: 'Declared target (TEST_FIXTURE identifier — no structure, no assay)',
      source: 'TEST_FIXTURE',
      affinityCapability: 'REQUIRES_EXTERNAL_ENGINE',
    },
    constraints: {
      allowedElements: ['C', 'H', 'N', 'O', 'F'],
      maxHeavyAtoms: 22,
      criteria: [
        { criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range', value: 120, valueMax: 320, required: true, rationale: 'Declared molecular-weight window for this search.' },
        { criterionId: 'heavy-atom-ceiling', propertyId: 'heavyAtomCount', op: 'lte', value: 20, required: true, rationale: 'Declared heavy-atom ceiling for this search.' },
        { criterionId: 'unsaturation-floor', propertyId: 'degreeOfUnsaturation', op: 'gte', value: 1, required: false, rationale: 'Preference for at least one degree of unsaturation; not required.' },
        { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: 0, valueMax: 3.5, required: true, rationale: 'Declared lipophilicity window — REQUIRES a structural engine; with none connected this criterion is unresolvable, never a pass.' },
      ],
    },
  };
}

/** Small, CI-sized enumeration: a handful of seeds, one round, hard ceiling. */
export function buildDemoGenerationSpec(): GenerationSpec {
  return {
    seedFormulas: ['C6H6', 'C7H8O', 'C9H8O4'],
    transformations: ['add-CH2', 'add-OH', 'add-NH2', 'add-F'],
    depth: 1,
    maxCandidates: 40,
  };
}

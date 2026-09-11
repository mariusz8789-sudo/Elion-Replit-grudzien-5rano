import type { SavedExperiment } from '../core/scienceMemory';

/**
 * MATRIX KINDS — the classification vocabulary, relocated here VERBATIM from
 * `GenesisMatrixHub.tsx` so that the graph projection can use it without
 * importing a React component (which would create a cycle:
 * Hub -> MatrixGraph -> projection -> Hub).
 *
 * This is a MOVE, not a redefinition. `kindsOf` below is character-for-character
 * the implementation that already existed, and `GenesisMatrixHub.tsx` re-exports
 * all four symbols, so every existing import path — including
 * `MatrixDataStream.tsx`, `GenesisDashboard.tsx` and the tests that import
 * `kindsOf` from `../components/GenesisMatrixHub` — keeps resolving to exactly
 * this one implementation. There is no second classifier anywhere.
 */

export type MatrixKind =
  | 'HYPOTHESIS' | 'WORLD' | 'MODEL' | 'SCENARIO' | 'EVIDENCE'
  | 'CYBER' | 'DECIPHERMENT' | 'RESEARCH_CHAIN' | 'REPLAY' | 'EXPERIMENT';

export const KIND_LABEL: Record<MatrixKind, string> = {
  HYPOTHESIS: 'Hypotheses', WORLD: 'Worlds', MODEL: 'Models', SCENARIO: 'Scenarios',
  EVIDENCE: 'Evidence', CYBER: 'Cyber', DECIPHERMENT: 'Decipherment', RESEARCH_CHAIN: 'Research Chain',
  REPLAY: 'Replay', EXPERIMENT: 'Experiment',
};

export const KIND_ICON: Record<MatrixKind, string> = {
  HYPOTHESIS: '◆', WORLD: '◇', MODEL: '▣', SCENARIO: '⑂', EVIDENCE: '✓',
  CYBER: '◈', DECIPHERMENT: '📜', RESEARCH_CHAIN: '⛓', REPLAY: '↺', EXPERIMENT: '●',
};

/** Every kind this record honestly carries — never a single forced category. */
export function kindsOf(record: SavedExperiment): MatrixKind[] {
  const kinds: MatrixKind[] = [];
  if (record.discoveryLoop || record.hypothesisLoop || record.parameterInquiry) kinds.push('HYPOTHESIS');
  if (record.worldDiscovery) kinds.push('WORLD');
  if (record.mechanismComposition) kinds.push('MODEL');
  if (record.scenario || record.counterfactual) kinds.push('SCENARIO');
  if (record.biotech || record.realExperimentVerification || record.substitutionInvestigation || record.evidencePackId || record.evidenceChainId) kinds.push('EVIDENCE');
  if (record.cyberInvestigation) kinds.push('CYBER');
  if (record.deciphermentCase) kinds.push('DECIPHERMENT');
  if (record.researchChain) kinds.push('RESEARCH_CHAIN');
  if (record.replayIdentity) kinds.push('REPLAY');
  if (kinds.length === 0) kinds.push('EXPERIMENT');
  return kinds;
}

/** Deterministic display order, shared by the rail filter and the graph legend. */
export const ALL_MATRIX_KINDS: readonly MatrixKind[] = [
  'HYPOTHESIS', 'WORLD', 'MODEL', 'SCENARIO', 'EVIDENCE',
  'CYBER', 'DECIPHERMENT', 'RESEARCH_CHAIN', 'REPLAY', 'EXPERIMENT',
];

/**
 * The one kind a node is DRAWN as when a record honestly carries several.
 *
 * This is a RENDERER-ONLY choice and never overwrites Genesis classification:
 * `kindsOf()` stays the truth, the inspector shows every kind the record has,
 * and this function only decides which colour a circle gets. The order is the
 * display order above, so the choice is deterministic rather than "whichever
 * happened to be first in the array".
 */
export function primaryKindOf(kinds: readonly MatrixKind[]): MatrixKind {
  for (const kind of ALL_MATRIX_KINDS) if (kinds.includes(kind)) return kind;
  return 'EXPERIMENT';
}

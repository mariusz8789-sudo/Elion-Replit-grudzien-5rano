/**
 * EPISTEMIC ENGINE — the required physics E2E demonstration.
 *
 * Builds a small, real epistemic graph for the question "what explains the
 * observed relationship between orbital conditions and relativistic time
 * dilation?", then applies REAL, already-computed verdicts from
 * `generatedPhysicsModelCandidates.ts` (unchanged) and one small additional
 * real check (a Newtonian, zero-correction hypothesis, tested the same way)
 * — and proves DEPENDENCY PROPAGATION: a claim that depends on the
 * Newtonian hypothesis becomes BLOCKED automatically once that hypothesis
 * is genuinely falsified, without being told to.
 *
 * NOTHING HERE RECOMPUTES PHYSICS. Every verdict applied to the graph comes
 * from a function this engine already had before this task
 * (`generatePhysicsModelCandidates`, `runRelativisticTimeDilationCase`) —
 * this module only builds the NETWORK and applies the ALREADY-REAL results
 * to it.
 */
import {
  applyEpistemicUpdates,
  buildEpistemicEdge,
  buildEpistemicGraph,
  buildEpistemicNode,
  replayEpistemicUpdates,
  saveEpistemicGraphToMemory,
  type EpistemicChange,
  type EpistemicGraph,
  type EpistemicReplay,
  type StatusUpdate,
} from '../epistemicEngine';
import { COMPOSITION_TOLERANCE, generatePhysicsModelCandidates } from './generatedPhysicsModelCandidates';
import { runRelativisticTimeDilationCase } from './relativisticTimeDilation';
import type { GeneratedHypothesisVerdict } from '../hypothesisGeneration';
import type { SavedExperiment } from '../../scienceMemory';

export const EPISTEMIC_TIME_DILATION_DEMO_VERSION = '1.0.0';

const GRAPH_ID = 'time-dilation-epistemic-demo';

/**
 * The BEFORE state: three competing hypotheses (Einstein-consistent
 * composition, an alternative composition, and a Newtonian zero-correction
 * hypothesis) — all UNRESOLVED, none pre-judged — plus a dependent claim,
 * an experiment node describing the real test about to run, two
 * established facts, and one honest UNKNOWN.
 */
export function buildInitialTimeDilationEpistemicGraph(): EpistemicGraph {
  // Reused only for its own real, already-declared nextExperiment text — never re-derived here.
  const reference = runRelativisticTimeDilationCase();

  const factSr = buildEpistemicNode({
    nodeId: 'fact-sr', kind: 'FACT', domainId: 'PHYSICS',
    statement: 'Special-relativistic time dilation (a moving clock runs slow relative to a stationary observer) is independently, experimentally confirmed.',
    status: 'ESTABLISHED', statusReason: 'Cited, established physics; not re-derived by this engine.',
    provenance: ['relativisticTimeDilation.ts:fact[0]'],
  });
  const factGr = buildEpistemicNode({
    nodeId: 'fact-gr', kind: 'FACT', domainId: 'PHYSICS',
    statement: 'General-relativistic gravitational time dilation (a clock deeper in a gravitational potential runs slow) is independently, experimentally confirmed.',
    status: 'ESTABLISHED', statusReason: 'Cited, established physics; not re-derived by this engine.',
    provenance: ['relativisticTimeDilation.ts:fact[1]'],
  });

  const hypEinstein = buildEpistemicNode({
    nodeId: 'hyp-einstein-combined', kind: 'HYPOTHESIS', domainId: 'PHYSICS',
    statement: 'The net GPS orbital clock-rate effect equals the signed difference of the real SR and GR component models (Einstein-consistent composition).',
    status: 'UNRESOLVED', statusReason: 'Not yet tested against a real computed reference.',
    provenance: ['generatedPhysicsModelCandidates.ts:LINEAR_DIFFERENCE'],
  });
  const hypAlternative = buildEpistemicNode({
    nodeId: 'hyp-alternative-quadrature', kind: 'HYPOTHESIS', domainId: 'PHYSICS',
    statement: 'The net GPS orbital clock-rate effect equals the quadrature sum of the real SR and GR component models (an alternative composition).',
    status: 'UNRESOLVED', statusReason: 'Not yet tested against a real computed reference.',
    provenance: ['generatedPhysicsModelCandidates.ts:QUADRATURE_SUM'],
  });
  const hypNewtonian = buildEpistemicNode({
    nodeId: 'hyp-newtonian', kind: 'HYPOTHESIS', domainId: 'PHYSICS',
    statement: 'No relativistic correction is needed for GPS orbital clocks (the net effect is zero).',
    status: 'UNRESOLVED', statusReason: 'Not yet tested against a real computed reference.',
    provenance: ['epistemicTimeDilationDemo.ts:newtonian-zero-check'],
  });

  const experiment = buildEpistemicNode({
    nodeId: 'experiment-gps-composition-test', kind: 'EXPERIMENT', domainId: 'PHYSICS',
    statement: 'Compute the real GPS net fractional clock-rate reference value and compare each hypothesis\'s prediction against it.',
    status: 'UNRESOLVED', statusReason: 'Not yet executed.',
    provenance: ['relativisticTimeDilation.ts:runRelativisticTimeDilationCase', 'generatedPhysicsModelCandidates.ts:generatePhysicsModelCandidates'],
  });

  const claim = buildEpistemicNode({
    nodeId: 'claim-gps-no-relativistic-correction-needed', kind: 'DERIVED', domainId: 'PHYSICS',
    statement: 'GPS navigation systems do not need any relativistic clock correction.',
    status: 'UNRESOLVED', statusReason: 'Depends entirely on the Newtonian hypothesis, which has not yet been tested.',
    provenance: ['epistemicTimeDilationDemo.ts:dependent-claim'],
  });

  const unknown = buildEpistemicNode({
    nodeId: 'unknown-independent-gps-measurement', kind: 'UNKNOWN', domainId: 'PHYSICS',
    statement: 'The real, independently measured (not derived) GPS on-orbit clock comparison value.',
    status: 'UNKNOWN', statusReason: 'No external retrieval or independent verification has been performed in this runtime.',
    provenance: ['relativisticTimeDilation.ts:nextExperiment'],
    unknownDetail: {
      whatIsUnknown: 'The real, independently measured GPS on-orbit clock comparison value (as opposed to Genesis\'s own derived prediction).',
      whyUnknown: 'Genesis has not retrieved or independently verified a real measured comparison in this runtime.',
      missingEvidence: ['an independently retrieved, published GPS on-orbit clock comparison measurement'],
      competingHypothesisIds: ['hyp-einstein-combined', 'hyp-alternative-quadrature', 'hyp-newtonian'],
      potentialResolution: reference.nextExperiment,
    },
  });

  const edges = [
    buildEpistemicEdge({ edgeId: 'e-einstein-from-sr', from: 'hyp-einstein-combined', to: 'fact-sr', relation: 'DERIVED_FROM', rationale: 'Uses the established SR fractional-deficit model as one component.' }),
    buildEpistemicEdge({ edgeId: 'e-einstein-from-gr', from: 'hyp-einstein-combined', to: 'fact-gr', relation: 'DERIVED_FROM', rationale: 'Uses the established GR fractional-excess model as one component.' }),
    buildEpistemicEdge({ edgeId: 'e-alternative-from-sr', from: 'hyp-alternative-quadrature', to: 'fact-sr', relation: 'DERIVED_FROM', rationale: 'Uses the same SR component, combined differently.' }),
    buildEpistemicEdge({ edgeId: 'e-alternative-from-gr', from: 'hyp-alternative-quadrature', to: 'fact-gr', relation: 'DERIVED_FROM', rationale: 'Uses the same GR component, combined differently.' }),
    buildEpistemicEdge({ edgeId: 'e-tests-einstein', from: 'experiment-gps-composition-test', to: 'hyp-einstein-combined', relation: 'TESTS', rationale: 'The real composition test evaluates this hypothesis\'s prediction.' }),
    buildEpistemicEdge({ edgeId: 'e-tests-alternative', from: 'experiment-gps-composition-test', to: 'hyp-alternative-quadrature', relation: 'TESTS', rationale: 'The real composition test evaluates this hypothesis\'s prediction.' }),
    buildEpistemicEdge({ edgeId: 'e-tests-newtonian', from: 'experiment-gps-composition-test', to: 'hyp-newtonian', relation: 'TESTS', rationale: 'The real composition test evaluates this hypothesis\'s prediction.' }),
    buildEpistemicEdge({ edgeId: 'e-distinguishes', from: 'experiment-gps-composition-test', to: 'hyp-alternative-quadrature', relation: 'DISTINGUISHES', rationale: 'The same test result that supports the Einstein-consistent composition distinguishes it from the alternative.' }),
    buildEpistemicEdge({ edgeId: 'e-claim-depends-on-newtonian', from: 'claim-gps-no-relativistic-correction-needed', to: 'hyp-newtonian', relation: 'DEPENDS_ON', rationale: 'The claim is true only if the Newtonian (zero-correction) hypothesis holds.' }),
  ];

  return buildEpistemicGraph(GRAPH_ID, [factSr, factGr, hypEinstein, hypAlternative, hypNewtonian, experiment, claim, unknown], edges);
}

export interface TimeDilationEpistemicRunResult {
  before: EpistemicGraph;
  after: EpistemicGraph;
  updates: readonly StatusUpdate[];
  changes: readonly EpistemicChange[];
}

/**
 * Runs the REAL computation (unchanged existing functions) and applies its
 * REAL verdicts to the BEFORE graph. The Newtonian check is the one new
 * piece of arithmetic in this file: comparing a predicted value of exactly
 * 0 against the same real reference the other two candidates are already
 * tested against, using the same declared tolerance.
 */
export function runTimeDilationEpistemicDemo(): TimeDilationEpistemicRunResult {
  const before = buildInitialTimeDilationEpistemicGraph();

  const generated = generatePhysicsModelCandidates();
  const reference = runRelativisticTimeDilationCase();

  const einstein = generated.candidates.find((c) => c.hypothesisId.includes('linear_difference'));
  const alternative = generated.candidates.find((c) => c.hypothesisId.includes('quadrature_sum'));
  if (!einstein || !alternative) {
    throw new Error('generatePhysicsModelCandidates() did not produce the expected linear-difference/quadrature-sum candidates — cannot honestly apply verdicts that were not actually computed.');
  }
  if (einstein.verdict === null || alternative.verdict === null) {
    throw new Error('generatePhysicsModelCandidates() produced a candidate that never reached a verdict — cannot honestly apply a status that was not actually computed.');
  }

  const newtonianResidual = Math.abs(0 - reference.netFractionalRate);
  const newtonianVerdict: GeneratedHypothesisVerdict = newtonianResidual <= COMPOSITION_TOLERANCE ? 'SUPPORTED' : 'FALSIFIED';
  const newtonianReasoning = `Predicted 0 (no relativistic correction) vs. the real reference net fractional rate ${reference.netFractionalRate.toExponential(6)}; residual ${newtonianResidual.toExponential(3)} ${newtonianVerdict === 'SUPPORTED' ? '<=' : '>'} tolerance ${COMPOSITION_TOLERANCE}.`;

  const updates: StatusUpdate[] = [
    { nodeId: 'experiment-gps-composition-test', newStatus: 'ESTABLISHED', reason: 'The real GPS composition test was executed.', provenance: [`generated:${generated.resultFingerprint}`, `reference:${reference.resultFingerprint}`] },
    { nodeId: 'hyp-einstein-combined', newStatus: einstein.verdict, reason: einstein.verdictReasoning ?? 'No reasoning was recorded by the real test.', provenance: [`candidate:${einstein.fingerprint}`] },
    { nodeId: 'hyp-alternative-quadrature', newStatus: alternative.verdict, reason: alternative.verdictReasoning ?? 'No reasoning was recorded by the real test.', provenance: [`candidate:${alternative.fingerprint}`] },
    { nodeId: 'hyp-newtonian', newStatus: newtonianVerdict, reason: newtonianReasoning, provenance: [`reference:${reference.resultFingerprint}`] },
  ];

  const result = applyEpistemicUpdates(before, updates);
  return { before, after: result.graph, updates, changes: result.changes };
}

export function replayTimeDilationEpistemicDemo(run: TimeDilationEpistemicRunResult): EpistemicReplay {
  return replayEpistemicUpdates(run.before, run.updates, run.after);
}

export function saveTimeDilationEpistemicDemoToMemory(run: TimeDilationEpistemicRunResult): SavedExperiment {
  return saveEpistemicGraphToMemory(run.after, run.changes);
}

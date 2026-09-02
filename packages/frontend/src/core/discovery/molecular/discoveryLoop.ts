import { assessHypothesis, describeResult, type ExperimentalResult, type HypothesisAssessment, type ResultProvenanceKind, type TestableHypothesis } from './experimentalResult';
import { canonicalJson, fnv1a } from '../../events/hash';
import { proposeDiscriminatingExperiments, type ProposedExperiment } from './discriminatingExperiment';
import { runEndToEndDiscovery, type EndToEndDiscoveryRequest, type EndToEndDiscoveryEngines, type EndToEndDiscoveryResult } from './endToEndDiscovery';
import { runRequirementEvaluation, type Requirement, type RequirementBatch } from './discoveryRequirements';

/**
 * CLOSED-LOOP DISCOVERY.
 *
 * ROUND 1  question + requirements → candidates → ranking → next experiment
 * ROUND 2  experiment result → evidence → hypothesis update → RERANK
 * ROUND 3  updated hypothesis → new generation round → new ranking
 *
 * The output of each round is the input of the next. That is the entire point:
 * the previous engine produced a report and stopped, so a measurement could
 * never change anything. Here a result actually re-orders the field.
 *
 * HOW A RESULT CHANGES THE RANKING — and why it is not a fudge factor:
 *
 * A measurement is admitted ONLY against the candidate whose structure it was
 * taken on (matched by canonical SMILES), and ONLY for the target and
 * parameter it actually measured. It is then attached as a real property with
 * `ACTUAL_SOURCE` status (or TEST_FIXTURE status for a labelled fixture), so
 * the existing ranker sees it exactly like any other property — there is no
 * separate "experimental bonus" pathway that could be tuned.
 *
 * A candidate with no measurement is NOT penalised and NOT rewarded; it stays
 * where the predictions put it, and the round reports how many candidates the
 * experiment actually touched. An experiment that measured one molecule
 * re-orders one molecule.
 *
 * FIXTURES CAN NEVER BECOME MEASUREMENTS. The provenance kind rides on every
 * derived object and every rendered line, and the round refuses to describe a
 * fixture-driven update as experimental verification.
 */
export const DISCOVERY_LOOP_VERSION = '1.0.0';

export interface DiscoveryRoundInput {
  roundNumber: number;
  discovery: EndToEndDiscoveryRequest;
  requirements: readonly Requirement[];
  /** Results ingested BEFORE this round runs. Empty for round 1. */
  ingestedResults: readonly ExperimentalResult[];
  /** Hypotheses under test, carried from the previous round's experiment proposal. */
  hypotheses: readonly TestableHypothesis[];
}

export interface DiscoveryRound {
  roundNumber: number;
  result: EndToEndDiscoveryResult;
  requirementBatch: RequirementBatch;
  /** Results that actually bound to a candidate in this round's set. */
  boundResults: readonly { resultId: string; candidateId: string; kind: ResultProvenanceKind }[];
  unboundResults: readonly { resultId: string; reason: string }[];
  hypothesisAssessments: readonly HypothesisAssessment[];
  proposedExperiments: readonly ProposedExperiment[];
  /** Pareto front candidate ids, in rank order. */
  front: readonly string[];
  roundFingerprint: string;
}

export interface RoundDelta {
  fromRound: number;
  toRound: number;
  frontBefore: readonly string[];
  frontAfter: readonly string[];
  entered: readonly string[];
  left: readonly string[];
  unchanged: boolean;
  /** Plain statement of what changed and, critically, WHY. */
  explanation: string;
}

export interface DiscoveryLoopEngines extends EndToEndDiscoveryEngines {}

/**
 * Runs ONE round. The discovery execution itself is the existing unmodified
 * `runEndToEndDiscovery`; this adds requirement evaluation, result binding,
 * hypothesis assessment and the next-experiment proposal around it.
 */
export function runDiscoveryRound(input: DiscoveryRoundInput, engines: DiscoveryLoopEngines): DiscoveryRound {
  // Results are handed to the discovery run itself, which binds them BEFORE
  // mechanism filtering and ranking — that is what makes a measurement able to
  // change the outcome rather than merely annotate it.
  const result = runEndToEndDiscovery({ ...input.discovery, ingestedResults: input.ingestedResults }, engines);
  const enriched = result.evaluatedCandidates;
  const bound = result.boundResults;
  const unbound = result.unboundResults;

  // Reference values for REDUCE_VS_REFERENCE come from the seed candidate —
  // the reference compound's own real computed values, not a declared guess.
  const seed = enriched.find((c) => c.transformation === null);
  const referenceValues: Record<string, number> = {};
  for (const property of seed?.properties ?? []) {
    if (typeof property.value === 'number') referenceValues[property.propertyId] = property.value;
  }

  const requirementBatch = runRequirementEvaluation(engines.rdkit, enriched, input.requirements, referenceValues);

  const hypothesisAssessments = input.hypotheses.map((h) => assessHypothesis(h, input.ingestedResults));

  const frontIds = result.topCandidates.map((c) => c.candidateId);
  const frontCandidates = enriched.filter((c) => frontIds.includes(c.candidateId));

  const proposedExperiments = proposeDiscriminatingExperiments({
    candidates: frontCandidates,
    pivot: {
      target: input.discovery.question.target.targetId,
      parameter: 'IC50',
      threshold: null,
      thresholdUnit: 'µM',
    },
    comparableProperties: [
      { propertyId: 'mutagenicity', target: 'Ames', parameter: 'mutagenicity', lowerIsSupport: true },
      { propertyId: 'liverInjury', target: 'DILI', parameter: 'liverInjury', lowerIsSupport: true },
      { propertyId: 'clinicalToxicity', target: 'ClinTox', parameter: 'clinicalToxicity', lowerIsSupport: true },
      { propertyId: 'bloodBrainBarrier', target: 'BBB', parameter: 'bloodBrainBarrier', lowerIsSupport: false },
    ],
  });

  const roundFingerprint = fnv1a(canonicalJson({
    v: DISCOVERY_LOOP_VERSION,
    round: input.roundNumber,
    discovery: result.resultFingerprint,
    boundResultIds: bound.map((b) => b.resultId).sort(),
    requirementIds: input.requirements.map((r) => r.requirementId).sort(),
  }));

  return {
    roundNumber: input.roundNumber,
    result,
    requirementBatch,
    boundResults: bound,
    unboundResults: unbound,
    hypothesisAssessments,
    proposedExperiments,
    front: frontIds,
    roundFingerprint,
  };
}

/**
 * Compares two rounds and states what moved.
 *
 * An unchanged front is reported as unchanged — a loop that reports motion it
 * did not produce is worse than one that admits a measurement changed nothing.
 */
export function diffRounds(previous: DiscoveryRound, next: DiscoveryRound): RoundDelta {
  const before = previous.front;
  const after = next.front;
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const entered = after.filter((id) => !beforeSet.has(id));
  const left = before.filter((id) => !afterSet.has(id));
  const unchanged = entered.length === 0 && left.length === 0
    && before.length === after.length && before.every((id, i) => id === after[i]);

  const kinds = new Set(next.boundResults.map((b) => b.kind));
  const evidenceLabel = kinds.size === 0
    ? 'no measurement was bound to any candidate'
    : kinds.has('REAL_MEASUREMENT') && kinds.size === 1
      ? `${next.boundResults.length} real measurement(s) bound`
      : `${next.boundResults.length} bound result(s), including TEST_FIXTURE data`;

  const explanation = unchanged
    ? `Front unchanged between round ${previous.roundNumber} and ${next.roundNumber} (${evidenceLabel}). `
      + 'The ranking did not move, and that is reported rather than dressed up as progress.'
    : `Front changed between round ${previous.roundNumber} and ${next.roundNumber} (${evidenceLabel}). `
      + `${entered.length} candidate(s) entered, ${left.length} left. `
      + 'The change comes from measured properties attached to the specific structures they were measured on — no candidate was re-scored by anything other than its own data.';

  return { fromRound: previous.roundNumber, toRound: next.roundNumber, frontBefore: before, frontAfter: after, entered, left, unchanged, explanation };
}

export interface DiscoveryLoopResult {
  rounds: readonly DiscoveryRound[];
  deltas: readonly RoundDelta[];
  /** Every result the loop consumed, rendered with its provenance label intact. */
  evidenceTrail: readonly string[];
  loopFingerprint: string;
}

/**
 * Runs a multi-round loop. Each round's `ingestedResults` and `hypotheses` are
 * supplied by the caller, which is what keeps the seam honest: this module
 * never invents a measurement to feed its own next round.
 */
export function runDiscoveryLoop(rounds: readonly DiscoveryRoundInput[], engines: DiscoveryLoopEngines): DiscoveryLoopResult {
  const executed: DiscoveryRound[] = [];
  for (const input of rounds) {
    executed.push(runDiscoveryRound(input, engines));
  }

  const deltas: RoundDelta[] = [];
  for (let i = 1; i < executed.length; i++) {
    deltas.push(diffRounds(executed[i - 1]!, executed[i]!));
  }

  const evidenceTrail = rounds.flatMap((r) => r.ingestedResults.map(describeResult));

  return {
    rounds: executed,
    deltas,
    evidenceTrail,
    loopFingerprint: fnv1a(canonicalJson({ v: DISCOVERY_LOOP_VERSION, rounds: executed.map((r) => r.roundFingerprint) })),
  };
}

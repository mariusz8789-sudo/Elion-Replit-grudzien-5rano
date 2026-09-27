import { buildExperimentGraph, type ExperimentGraph } from '../../experimentFabric/experimentGraph';
import { explainScientificEvidence, type WhyNextExperimentAdvice } from '../../experimentFabric/whyNextExperiment';
import { buildDiscoveryEvidenceChain, buildDiscoveryExperimentRun } from './evidence';
import type { DiscoveryResult } from './types';

/**
 * NEXT EXPERIMENT.
 *
 * `buildExperimentGraph()` and `explainScientificEvidence()` are reused
 * UNCHANGED for the question → hypothesis → experiment → result → evidence
 * lineage and the "why" narrative.
 *
 * Their proposal vocabulary is not reused for "acquire a missing capability":
 * `proposeNext()`'s `UncertaintyKind` set describes gaps in a model's own
 * execution coverage (untried seeds, unswept parameters). It has no way to
 * express "connect a target-affinity engine" or "this needs a wet-lab
 * measurement", and inventing one would mean editing that shared engine. So
 * the scan below is separate, small, explicitly labelled, and — critically —
 * never fabricates a run: a step Genesis cannot execute is returned as
 * `REQUIRES_EXTERNAL_ENGINE` or `REQUIRES_EXTERNAL_EXPERIMENT`, not as a
 * result.
 */
export const DISCOVERY_NEXT_STEP_VERSION = '1.0.0';

export function buildDiscoveryExperimentGraph(result: DiscoveryResult): ExperimentGraph {
  return buildExperimentGraph({
    question: result.question.question,
    runs: [buildDiscoveryExperimentRun(result)],
    evidenceChains: [buildDiscoveryEvidenceChain(result)],
  });
}

export function explainDiscoveryEvidence(result: DiscoveryResult): WhyNextExperimentAdvice {
  return explainScientificEvidence(buildDiscoveryEvidenceChain(result));
}

export type NextDiscoveryStepKind =
  | 'RUNNABLE_IN_GENESIS'
  | 'REQUIRES_EXTERNAL_ENGINE'
  | 'REQUIRES_EXTERNAL_EXPERIMENT';

export interface NextDiscoveryStep {
  kind: NextDiscoveryStepKind;
  action: string;
  reason: string;
  /** Property or capability this step would resolve. */
  resolves: string;
}

/**
 * Deterministic scan of one result's own gaps into concrete next steps. Only
 * steps supported by information the run actually produced are proposed.
 */
export function proposeNextDiscoverySteps(result: DiscoveryResult): readonly NextDiscoveryStep[] {
  const steps: NextDiscoveryStep[] = [];
  const covered = new Set<string>();

  const addCapabilityStep = (propertyId: string, status: string, detail: string) => {
    if (covered.has(propertyId)) return;
    covered.add(propertyId);
    steps.push({
      kind: status === 'REQUIRES_EXPERIMENT' ? 'REQUIRES_EXTERNAL_EXPERIMENT' : 'REQUIRES_EXTERNAL_ENGINE',
      action: status === 'REQUIRES_EXPERIMENT'
        ? `Obtain an experimental measurement for "${propertyId}" — Genesis cannot run a wet-lab experiment.`
        : `Connect an engine that computes "${propertyId}" (e.g. RDKit for structural descriptors, a validated QSAR/ADMET model for predicted endpoints).`,
      reason: detail,
      resolves: propertyId,
    });
  };

  // Gaps that actually blocked a declared criterion come first — they are the
  // ones preventing this question from resolving.
  for (const gap of result.capabilityGaps) addCapabilityStep(gap.propertyId, gap.status, gap.detail);

  // Then every other property the candidates carry with no obtainable value.
  // These do not block the current question, but they are exactly the missing
  // ADMET/safety/target evidence a caller would need next — surfacing them is
  // honest; silently dropping them would make the report look more complete
  // than the science is.
  for (const property of result.batch.candidates[0]?.properties ?? []) {
    if (property.status !== 'REQUIRES_EXTERNAL_ENGINE' && property.status !== 'REQUIRES_EXPERIMENT' && property.status !== 'NOT_AVAILABLE') continue;
    addCapabilityStep(property.propertyId, property.status, `Property "${property.propertyId}" is ${property.status} for every candidate in this batch; no criterion in the current question depends on it.`);
  }

  // The target itself is named separately from the generic `targetAffinity`
  // property scan above, because a target-specific step is more actionable —
  // but only when that scan has not already claimed the same gap.
  if (!covered.has('targetAffinity')) {
    covered.add('targetAffinity');
    steps.push({
      kind: result.question.target.affinityCapability === 'REQUIRES_EXPERIMENT' ? 'REQUIRES_EXTERNAL_EXPERIMENT' : 'REQUIRES_EXTERNAL_ENGINE',
      action: `Obtain target-specific evidence for "${result.question.target.label}".`,
      reason: `The declared target has no affinity capability on this path (${result.question.target.affinityCapability}); no criterion could bind a candidate to the target.`,
      resolves: 'targetAffinity',
    });
  }

  if (result.decision.verdict === 'FALSIFIED_WITHIN_PROTOCOL') {
    steps.push({
      kind: 'RUNNABLE_IN_GENESIS',
      action: 'Re-run the enumeration from different seed compositions or with a wider declared transformation set.',
      reason: `Every enumerated candidate violated a required criterion on real computed values (${result.decision.rejectedCount} rejected). The current chemical region is exhausted under these constraints.`,
      resolves: 'candidateSpace',
    });
  } else if (result.decision.retainedCount > 0) {
    steps.push({
      kind: 'RUNNABLE_IN_GENESIS',
      action: `Enumerate one more round outward from the ${result.decision.retainedCount} retained composition(s).`,
      reason: 'Retained candidates satisfy every evaluable required criterion; deepening the enumeration around them is executable now.',
      resolves: 'candidateSpace',
    });
  }

  return steps;
}

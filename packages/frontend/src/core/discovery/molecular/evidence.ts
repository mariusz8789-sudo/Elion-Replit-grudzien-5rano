import { canonicalJson, fnv1a } from '../../events/hash';
import { createScientificEvidencePack, type ScientificEvidencePack } from '../../experimentFabric/evidencePack';
import type {
  ExperimentArmEvidence,
  FalsificationCriterion,
  HypothesisAssessment,
  HypothesisAssessmentEvidence,
  ScientificEvidenceChain,
  ScientificExperimentDesign,
  ScientificHypothesis,
} from '../../experimentFabric/scientificDiscovery';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentRun } from '../../experimentFabric/types';
import type { DiscoveryResult } from './types';

/**
 * MOLECULAR DISCOVERY → EXISTING EXPERIMENT FABRIC.
 *
 * Reuses `ExperimentRun` / `ScientificEvidenceChain` /
 * `createScientificEvidencePack` exactly as declared — no second evidence
 * system, no second run contract. `resultOrigin: 'real-engine'` is honest and
 * narrow: the enumeration, the composition chemistry and the screening
 * arithmetic really ran. It says nothing about properties the run could not
 * obtain — those keep their own `REQUIRES_EXTERNAL_ENGINE` /
 * `REQUIRES_EXPERIMENT` status inside the result and are restated in the run's
 * warnings.
 */
export const DISCOVERY_EVIDENCE_VERSION = '1.0.0';
const DISCOVERY_ENGINE_ID = 'genesis-molecular-discovery@1.0.0';

const DISCOVERY_FALSIFICATION: FalsificationCriterion = {
  metric: 'retainedCandidateCount',
  relation: 'greater-than',
  expectedValue: 0,
  rationale: 'Hypothesis under test: at least one enumerated candidate satisfies every REQUIRED computational criterion. A candidate that violates a required bound on real computed values falsifies it for that candidate; a criterion whose property is unavailable can never satisfy it and can never falsify it — that path is NOT_RESOLVED.',
};

function hypothesisAssessmentFor(result: DiscoveryResult): HypothesisAssessment {
  if (result.decision.verdict === 'SUPPORTED_WITHIN_PROTOCOL') return 'SUPPORTED_WITHIN_PROTOCOL';
  if (result.decision.verdict === 'FALSIFIED_WITHIN_PROTOCOL') return 'FALSIFIED_WITHIN_PROTOCOL';
  return 'INCONCLUSIVE';
}

export function buildDiscoveryExperimentRun(result: DiscoveryResult): ExperimentRun {
  const parameters = {
    questionId: result.question.questionId,
    targetId: result.question.target.targetId,
    seedCount: result.batch.seedFormulas.length,
    transformationCount: result.batch.transformations.length,
    candidateCount: result.batch.candidates.length,
    decision: result.decision.verdict,
  };
  const runFingerprint = result.resultFingerprint;
  const requestFingerprint = fnv1a(canonicalJson({ v: DISCOVERY_EVIDENCE_VERSION, parameters }));
  const sourceText = `Molecular discovery run for question ${result.question.questionId}.`;
  const request = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText,
    domainId: 'molecular-discovery' as const, operation: 'compute' as const,
    modelId: DISCOVERY_ENGINE_ID, parameters,
  };
  const intent = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, request,
    capability: 'REAL_ENGINE' as const, confidence: 'high' as const,
    rationale: 'Composition enumeration, formula chemistry and criterion screening are deterministic computations over declared inputs.',
    requiredSolver: DISCOVERY_ENGINE_ID, knowledgeSources: [], supplementalKnowledgeIds: [],
  };

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: `discovery_run_${runFingerprint}`,
    request,
    intent,
    plan: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      planId: `discovery_plan_${requestFingerprint}`,
      intent,
      engine: DISCOVERY_ENGINE_ID,
      modelVersion: DISCOVERY_EVIDENCE_VERSION,
      parameterSchema: [],
      runnable: true,
      route: { kind: 'none' },
    },
    result: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      status: 'completed',
      summary: `${result.batch.candidates.length} candidate(s) enumerated; ${result.decision.retainedCount} retained, ${result.decision.rejectedCount} rejected, ${result.decision.notResolvedCount} not resolved. Verdict: ${result.decision.verdict}.`,
      outputs: {
        candidateCount: result.batch.candidates.length,
        retainedCount: result.decision.retainedCount,
        rejectedCount: result.decision.rejectedCount,
        notResolvedCount: result.decision.notResolvedCount,
        discardedCount: result.batch.discarded.length,
      },
      units: { candidateCount: 'count', retainedCount: 'count', rejectedCount: 'count', notResolvedCount: 'count', discardedCount: 'count' },
      warnings: result.capabilityGaps.map((gap) => `Property "${gap.propertyId}" is ${gap.status} — no criterion on it was scored.`),
      assumptions: [
        'Candidates are molecular FORMULAS produced by a deterministic composition enumerator, not a generative model, and not structures.',
        'No target-affinity, ADMET, toxicity or safety engine is connected on this path; those properties are REQUIRES_EXTERNAL_ENGINE or REQUIRES_EXPERIMENT and were never estimated.',
        'A retained candidate satisfies the computational criteria that could be evaluated — it is not a discovery, a synthesis claim, or a safety claim.',
      ],
      visualization: [],
      route: { kind: 'none' },
    },
    provenance: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      requestFingerprint,
      runFingerprint,
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
      domainId: 'molecular-discovery',
      modelId: DISCOVERY_ENGINE_ID,
      modelVersion: DISCOVERY_EVIDENCE_VERSION,
      engine: DISCOVERY_ENGINE_ID,
      parameterSnapshot: parameters,
      deterministic: true,
      resultOrigin: 'real-engine',
    },
  };
}

export function buildDiscoveryEvidenceChain(result: DiscoveryResult): ScientificEvidenceChain {
  const run = buildDiscoveryExperimentRun(result);
  const assessment = hypothesisAssessmentFor(result);

  const hypothesis: ScientificHypothesis = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    hypothesisId: `discovery_hyp_${run.provenance.runFingerprint}`,
    statement: `At least one candidate enumerated from the declared seeds satisfies every required computational criterion for ${result.question.target.label}.`,
    modelId: DISCOVERY_ENGINE_ID,
    domainId: 'molecular-discovery',
    assessment,
    knowledgeSources: [],
    declaredAssumptions: run.result.assumptions,
    falsification: DISCOVERY_FALSIFICATION,
    disclaimer: 'Computational screening within a declared protocol. Not a discovery, not a bioactivity claim, not a safety claim, and not a synthesis route.',
  };

  const armId = 'arm:enumerated-batch';
  const design: ScientificExperimentDesign = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    designId: `discovery_design_${run.provenance.runFingerprint}`,
    hypothesis,
    primaryMetric: 'retainedCandidateCount',
    arms: [{ armId, label: 'Enumerated candidate batch', kind: 'baseline', request: run.request, expectedRole: 'Deterministically enumerated composition batch screened against the declared criteria.' }],
    repetitionsPerArm: 1,
    protocolAssumptions: hypothesis.declaredAssumptions,
    protocolFingerprint: fnv1a(canonicalJson({ v: DISCOVERY_EVIDENCE_VERSION, hypothesisId: hypothesis.hypothesisId, criteria: result.question.constraints.criteria })),
  };

  const armEvidence: ExperimentArmEvidence = {
    armId, kind: 'baseline', runIds: [run.runId], runFingerprints: [run.provenance.runFingerprint],
    outputValues: [result.decision.retainedCount], outputObservations: [result.decision.retainedCount],
    units: 'count', reproduction: 'MATCH',
    anomalyFlags: result.capabilityGaps.map((gap) => `${gap.propertyId}:${gap.status}`),
  };

  const assessmentEvidence: HypothesisAssessmentEvidence = {
    assessment,
    message: result.decision.reason,
    criterion: DISCOVERY_FALSIFICATION,
    referenceRunIds: [run.runId],
  };

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    evidenceId: `discovery_evidence_${run.provenance.runFingerprint}`,
    design,
    arms: [armEvidence],
    assessment: assessmentEvidence,
    allRuns: [run],
    provenanceFingerprint: fnv1a(canonicalJson({ v: DISCOVERY_EVIDENCE_VERSION, runFingerprint: run.provenance.runFingerprint })),
    createdFromRealRunsOnly: true,
  };
}

/** Thin call-through to the EXISTING, unmodified Evidence Pack constructor. */
export function buildDiscoveryEvidencePack(result: DiscoveryResult): ScientificEvidencePack {
  return createScientificEvidencePack(buildDiscoveryEvidenceChain(result));
}

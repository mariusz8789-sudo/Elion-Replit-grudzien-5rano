import { canonicalJson, fnv1a } from '../events/hash';
import { EXPERIMENT_FABRIC_VERSION, type ExperimentRun } from '../experimentFabric/types';
import { createScientificEvidencePack, type ScientificEvidencePack } from '../experimentFabric/evidencePack';
import type {
  ExperimentArmEvidence,
  FalsificationCriterion,
  HypothesisAssessmentEvidence,
  ScientificEvidenceChain,
  ScientificExperimentDesign,
  ScientificHypothesis,
} from '../experimentFabric/scientificDiscovery';
import type { AutomotiveAuditResult } from './types';

/**
 * AUTOMOTIVE → EXPERIMENT FABRIC BRIDGE.
 *
 * Reuses `ExperimentRun` / `ScientificEvidenceChain` / `createScientificEvidencePack`
 * EXACTLY as declared — no new evidence system, no new run contract. The
 * "hypothesis" here is the audit question this session asked
 * ("does the insurer estimate appear potentially incomplete?"), not a
 * scientific claim about the physical world; the disclaimer on the produced
 * pack says so explicitly. `resultOrigin: 'real-engine'` is honest: the
 * COST CALCULATION and GAP ANALYSIS that produced `AutomotiveAuditResult`
 * are real, deterministic arithmetic over whatever inputs were supplied —
 * it says nothing about whether those inputs themselves came from a real
 * external source (that is exactly what each field's own `SourceStatus`
 * already records, unchanged, inside the run's outputs).
 */
export const AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION = '1.0.0';
const AUTOMOTIVE_ENGINE_ID = 'genesis-automotive-audit-engine@1.0.0';

function auditResultFingerprint(result: AutomotiveAuditResult): string {
  return fnv1a(canonicalJson(result));
}

/**
 * Wraps one computed `AutomotiveAuditResult` as a single, real `ExperimentRun`.
 * No visualization, no biological fields, no router lookup — this assessment
 * is structured input, not free text, so it is never routed through
 * `router.ts`/`buildStructuredRequestFromModel`; it is constructed directly,
 * the same way several existing non-parsed adapters in this codebase do.
 */
export function buildAutomotiveExperimentRun(result: AutomotiveAuditResult): ExperimentRun {
  const parameters = {
    assessmentId: result.assessmentId,
    vehicleStatus: result.vehicleStatus,
    costStatus: result.costStatus,
    laborStatus: result.laborStatus,
    insurerEstimateStatus: result.insurerEstimateStatus,
    overall: result.overall,
  };
  const runFingerprint = auditResultFingerprint(result);
  const requestFingerprint = fnv1a(canonicalJson({ v: AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION, parameters }));

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: `automotive_run_${runFingerprint}`,
    request: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      sourceText: `Automotive claims audit for assessment ${result.assessmentId}.`,
      domainId: 'automotive-claims',
      operation: 'compute',
      modelId: AUTOMOTIVE_ENGINE_ID,
      parameters,
    },
    intent: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      request: {
        contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: `Automotive claims audit for assessment ${result.assessmentId}.`,
        domainId: 'automotive-claims', operation: 'compute', modelId: AUTOMOTIVE_ENGINE_ID, parameters,
      },
      capability: 'REAL_ENGINE',
      confidence: 'high',
      rationale: 'Cost calculation and gap analysis are deterministic arithmetic over structured input, not a parsed free-text request.',
      requiredSolver: AUTOMOTIVE_ENGINE_ID,
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
    },
    plan: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      planId: `automotive_plan_${requestFingerprint}`,
      intent: {
        contractVersion: EXPERIMENT_FABRIC_VERSION,
        request: {
          contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: `Automotive claims audit for assessment ${result.assessmentId}.`,
          domainId: 'automotive-claims', operation: 'compute', modelId: AUTOMOTIVE_ENGINE_ID, parameters,
        },
        capability: 'REAL_ENGINE', confidence: 'high',
        rationale: 'Cost calculation and gap analysis are deterministic arithmetic over structured input, not a parsed free-text request.',
        requiredSolver: AUTOMOTIVE_ENGINE_ID, knowledgeSources: [], supplementalKnowledgeIds: [],
      },
      engine: AUTOMOTIVE_ENGINE_ID,
      modelVersion: AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION,
      parameterSchema: [],
      runnable: true,
      route: { kind: 'none' },
    },
    result: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      status: 'completed',
      summary: `Overall: ${result.overall}. Gaps found: ${result.gaps.length}.`,
      outputs: {
        referenceTotal: result.referenceTotal.value ?? Number.NaN,
        insurerTotal: result.insurerTotal.value ?? Number.NaN,
        difference: result.difference.value ?? Number.NaN,
        gapCount: result.gaps.length,
      },
      units: { referenceTotal: result.referenceLineItems[0]?.currency ?? '', insurerTotal: result.referenceLineItems[0]?.currency ?? '', difference: '', gapCount: 'count' },
      warnings: [
        ...(result.referenceTotal.status === 'NOT_AVAILABLE' ? ['Reference total is NOT_AVAILABLE — one or more reference line items are uncosted.'] : []),
        ...(result.insurerEstimateStatus === 'NOT_AVAILABLE' ? ['No insurer estimate supplied — comparison could not run.'] : []),
      ],
      assumptions: [
        'This is an audit workflow using Genesis evidence machinery, not a scientific finding about the physical world.',
        'No real vision, VIN, OEM/aftermarket, pricing, or labor-rate provider is connected in this spike; every such field is USER_SUPPLIED, TEST_FIXTURE, or NOT_AVAILABLE.',
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
      domainId: 'automotive-claims',
      modelId: AUTOMOTIVE_ENGINE_ID,
      modelVersion: AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION,
      engine: AUTOMOTIVE_ENGINE_ID,
      parameterSnapshot: parameters,
      deterministic: true,
      resultOrigin: 'real-engine',
    },
  };
}

const AUDIT_FALSIFICATION: FalsificationCriterion = {
  metric: 'materialGapCount',
  relation: 'equal-within-tolerance',
  expectedValue: 0,
  tolerance: 0,
  rationale: 'Hypothesis under test: the insurer estimate is not materially incomplete relative to the Genesis reference assessment. A material gap (POTENTIAL_UNDERESTIMATION or POTENTIAL_OMISSION) falsifies it within this protocol — this is an audit label, not an accusation of fraud or error.',
};

function materialGapCount(result: AutomotiveAuditResult): number {
  return result.gaps.filter((g) => g.label === 'POTENTIAL_UNDERESTIMATION' || g.label === 'POTENTIAL_OMISSION').length;
}

/**
 * Builds a real `ScientificEvidenceChain` for one audit result — a single
 * `'baseline'` arm (the Genesis reference calculation; there is no
 * counterfactual variant here, this is not an A/B protocol). Reuses the
 * chain/hypothesis/arm CONTRACT unchanged; only the content is automotive.
 */
export function buildAutomotiveEvidenceChain(result: AutomotiveAuditResult): ScientificEvidenceChain {
  const run = buildAutomotiveExperimentRun(result);
  const gapCount = materialGapCount(result);

  const hypothesis: ScientificHypothesis = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    hypothesisId: `automotive_hyp_${run.provenance.runFingerprint}`,
    statement: 'The insurer estimate is not materially incomplete relative to the Genesis reference assessment.',
    modelId: AUTOMOTIVE_ENGINE_ID,
    domainId: 'automotive-claims',
    assessment: gapCount === 0 ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
    knowledgeSources: [],
    declaredAssumptions: [
      'Comparison is limited to the line items and sources actually supplied to this assessment.',
      'This is an audit workflow, not a scientific measurement; NOT_AVAILABLE fields are never treated as zero or as evidence of absence.',
    ],
    falsification: AUDIT_FALSIFICATION,
    disclaimer: 'This assessment does not constitute a certified damage appraisal, legal conclusion, or fraud determination.',
  };

  const armId = 'arm:genesis-reference';
  const design: ScientificExperimentDesign = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    designId: `automotive_design_${run.provenance.runFingerprint}`,
    hypothesis,
    primaryMetric: 'materialGapCount',
    arms: [{ armId, label: 'Genesis reference assessment', kind: 'baseline', request: run.request, expectedRole: 'Reference calculation compared against the supplied insurer estimate.' }],
    repetitionsPerArm: 1,
    protocolAssumptions: hypothesis.declaredAssumptions,
    protocolFingerprint: fnv1a(canonicalJson({ v: AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION, hypothesisId: hypothesis.hypothesisId, armId })),
  };

  const armEvidence: ExperimentArmEvidence = {
    armId, kind: 'baseline', runIds: [run.runId], runFingerprints: [run.provenance.runFingerprint],
    outputValues: [gapCount], outputObservations: [gapCount], units: 'count', reproduction: 'MATCH', anomalyFlags: [],
  };

  const assessmentEvidence: HypothesisAssessmentEvidence = {
    assessment: hypothesis.assessment,
    message: gapCount === 0
      ? 'No material gap (POTENTIAL_UNDERESTIMATION/POTENTIAL_OMISSION) was found within this protocol.'
      : `${gapCount} material gap(s) found — hypothesis falsified within this protocol.`,
    criterion: AUDIT_FALSIFICATION,
    referenceRunIds: [run.runId],
  };

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    evidenceId: `automotive_evidence_${run.provenance.runFingerprint}`,
    design,
    arms: [armEvidence],
    assessment: assessmentEvidence,
    allRuns: [run],
    provenanceFingerprint: fnv1a(canonicalJson({ v: AUTOMOTIVE_EVIDENCE_BRIDGE_VERSION, runFingerprint: run.provenance.runFingerprint })),
    createdFromRealRunsOnly: true,
  };
}

/** Thin call-through to the EXISTING, unmodified Evidence Pack constructor. */
export function buildAutomotiveEvidencePack(result: AutomotiveAuditResult): ScientificEvidencePack {
  return createScientificEvidencePack(buildAutomotiveEvidenceChain(result));
}

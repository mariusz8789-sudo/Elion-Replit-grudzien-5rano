import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
import type { TwinSyncResult } from './digitalTwinSynchronizer';
import type { ModelValidationResult } from './modelValidationEngine';
export interface ClosedLoopIterationInput { readonly hypothesisId: string; readonly experimentId: string; readonly twinSync: TwinSyncResult; readonly validation: ModelValidationResult }
export interface ClosedLoopIterationResult { readonly status: 'ITERATION_COMPLETE'; readonly nextExperimentProposal: string; readonly requiresHumanApprovalForLiveActuation: true; readonly deterministicFingerprint: string }
export class ClosedLoopExperimentEngine {
  constructor(private readonly runtime: LabRuntime) {}
  completeIteration(input: ClosedLoopIterationInput): ClosedLoopIterationResult {
    const nextExperimentProposal = input.validation.classification === 'CONTRADICTED' || input.twinSync.syncStatus === 'OUT_OF_MODEL'
      ? 'Design a bounded follow-up experiment focused on the largest residual and model-domain assumptions.'
      : input.twinSync.syncStatus === 'DRIFTING'
        ? 'Repeat the experiment with calibration verification and denser measurements around the drift region.'
        : 'Replicate the experiment under one controlled perturbation to test robustness.';
    const base = { status: 'ITERATION_COMPLETE' as const, nextExperimentProposal, requiresHumanApprovalForLiveActuation: true as const };
    const result = { ...base, deterministicFingerprint: this.runtime.deterministic.fingerprint({ input, base }) };
    emitLabEvidence(this.runtime, { type: 'CLOSED_LOOP_ITERATION_COMPLETED', modelId: 'D140_CLOSED_LOOP', solverId: 'closed-loop-v1', input, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', limitations: ['Next-experiment proposals do not authorize live actuation.'] });
    return result;
  }
}

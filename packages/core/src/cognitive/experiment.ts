import { ExperimentProposal, Hypothesis } from './types.js';
import { stableHash } from './hash.js';

export class ExperimentPlanner {
  proposeFor(hypothesis: Hypothesis): ExperimentProposal {
    const id = `exp-${stableHash({ hypothesisId: hypothesis.id, predictions: hypothesis.predictions })}`;
    return {
      id,
      hypothesisId: hypothesis.id,
      objective: `Test: ${hypothesis.statement}`,
      intervention: { variable: hypothesis.variables[0] ?? "unspecified", mode: "CONTROLLED_CHANGE" },
      controls: { replicate: true, baseline: true },
      observations: hypothesis.predictions,
      stoppingRules: ["STOP_ON_SAFETY_VIOLATION", "STOP_ON_INSUFFICIENT_DATA", "STOP_ON_PROTOCOL_DRIFT"],
      safetyRequirements: ["REQUIRED_PERMISSIONS", "VALIDATED_INSTRUMENT", "TRACEABLE_SPECIMEN"],
      requiresHumanApproval: true,
    };
  }
}

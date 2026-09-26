import { CognitiveProposal, Goal, Hypothesis } from './types.js';

export class ProposalGate {
  goal(candidate: CognitiveProposal): Goal | null {
    if (candidate.kind !== "GOAL" || typeof candidate.payload !== "object" || candidate.payload === null) return null;
    const value = candidate.payload as Record<string, unknown>;
    if (typeof value.description !== "string") return null;
    return {
      id: typeof value.id === "string" ? value.id : `goal-${Date.now()}`,
      description: value.description,
      priority: value.priority === "CRITICAL" || value.priority === "HIGH" || value.priority === "MEDIUM" ? value.priority : "LOW",
      targetEntityIds: Array.isArray(value.targetEntityIds) ? value.targetEntityIds.filter((x): x is string => typeof x === "string") : [],
      preconditions: [],
      successCriteria: [],
      createdAt: Date.now(),
    };
  }

  hypothesis(candidate: CognitiveProposal): Hypothesis | null {
    if (candidate.kind !== "HYPOTHESIS" || typeof candidate.payload !== "object" || candidate.payload === null) return null;
    const value = candidate.payload as Record<string, unknown>;
    if (typeof value.statement !== "string") return null;
    return {
      id: typeof value.id === "string" ? value.id : `hyp-${Date.now()}`,
      statement: value.statement,
      variables: Array.isArray(value.variables) ? value.variables.filter((x): x is string => typeof x === "string") : [],
      predictions: Array.isArray(value.predictions) ? value.predictions.filter((x): x is string => typeof x === "string") : [],
      falsifiers: Array.isArray(value.falsifiers) ? value.falsifiers.filter((x): x is string => typeof x === "string") : [],
      priorConfidence: typeof value.priorConfidence === "number" ? Math.max(0, Math.min(1, value.priorConfidence)) : 0.2,
      epistemicStatus: "HYPOTHESIS",
      evidenceRefs: Array.isArray(value.evidenceRefs) ? value.evidenceRefs.filter((x): x is string => typeof x === "string") : [],
      createdAt: Date.now(),
    };
  }
}

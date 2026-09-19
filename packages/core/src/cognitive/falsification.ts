import { Hypothesis, Observation } from './types.js';

export interface FalsificationAssessment {
  falsified: boolean;
  confidence: number;
  matchedFalsifier?: string;
  rationale: string;
}

export class FalsificationEngine {
  assess(hypothesis: Hypothesis, observations: Observation[]): FalsificationAssessment {
    for (const falsifier of hypothesis.falsifiers) {
      const normalized = falsifier.toLowerCase();
      const matching = observations.filter((observation) => normalized.includes(observation.predicate.toLowerCase()));
      if (matching.length >= 2) {
        return {
          falsified: true,
          confidence: Math.min(0.95, 0.45 + matching.length * 0.15),
          matchedFalsifier: falsifier,
          rationale: "Repeated linked observations match a declared falsification condition.",
        };
      }
    }
    return { falsified: false, confidence: 0.18, rationale: "No declared falsification condition is currently met by the observed evidence." };
  }
}

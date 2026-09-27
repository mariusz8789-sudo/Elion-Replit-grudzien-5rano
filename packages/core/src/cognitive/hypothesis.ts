import { Hypothesis, Observation } from './types.js';
import { stableHash } from './hash.js';

export class HypothesisEngine {
  propose(observations: Observation[], objective: string, now = Date.now()): Hypothesis[] {
    const candidates: Hypothesis[] = [];
    for (const observation of observations.slice(-8)) {
      const statement = `${observation.predicate} may be associated with ${String(observation.value)} for ${observation.subject} in the context of ${objective}.`;
      const id = `hyp-${stableHash({ statement, observation: observation.id })}`;
      candidates.push({
        id,
        statement,
        variables: [observation.subject, observation.predicate],
        predictions: [`A controlled change in ${observation.predicate} should alter the measured value.`],
        falsifiers: [`A controlled change leaves the measured value unchanged beyond the predefined tolerance.`],
        priorConfidence: Math.min(0.7, 0.25 + observation.evidenceRefs.length * 0.08),
        epistemicStatus: "HYPOTHESIS",
        evidenceRefs: [...observation.evidenceRefs],
        createdAt: now,
      });
    }
    return candidates;
  }
}

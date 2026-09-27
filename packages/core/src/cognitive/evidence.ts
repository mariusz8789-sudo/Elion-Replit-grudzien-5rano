import { EvidenceRelation, EvidenceRef, Hypothesis, Observation } from './types.js';

export interface EvidenceAssessment {
  relation: EvidenceRelation;
  score: number;
  rationale: string;
  evidenceIds: string[];
}

export class EvidenceReasoner {
  assess(hypothesis: Hypothesis, observations: Observation[], evidence: EvidenceRef[]): EvidenceAssessment {
    const related = observations.filter((observation) =>
      hypothesis.variables.some((variable) => variable === observation.subject || variable === observation.predicate),
    );
    const usableEvidence = evidence.filter((item) => hypothesis.evidenceRefs.includes(item.id));
    const support = usableEvidence.reduce((sum, item) => sum + Math.max(0, Math.min(1, item.strength)), 0);
    if (related.length === 0 && usableEvidence.length === 0) {
      return { relation: "INCONCLUSIVE", score: 0, rationale: "No sufficiently linked observations or evidence were found.", evidenceIds: [] };
    }
    if (support >= 0.8) {
      return { relation: "SUPPORTS", score: Math.min(1, support / Math.max(1, usableEvidence.length)), rationale: "Linked evidence provides support, but the result remains hypothesis-level until independently replicated.", evidenceIds: usableEvidence.map((item) => item.id) };
    }
    return { relation: "INCONCLUSIVE", score: Math.min(0.6, 0.2 + related.length * 0.08), rationale: "Linked observations exist, but evidence strength is insufficient for a stronger epistemic update.", evidenceIds: usableEvidence.map((item) => item.id) };
  }
}

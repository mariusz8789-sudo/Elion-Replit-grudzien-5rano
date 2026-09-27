import type { EvidenceLedgerEngine } from "../evidenceReplay/ledger.js";
import type { MetaClaim, Contradiction, KnowledgeGap } from "./types.js";

function sameAxis(a: MetaClaim, b: MetaClaim): boolean {
  return a.subject === b.subject && a.predicate === b.predicate;
}

export class MetaCognitionEngine {
  constructor(private readonly ledger: EvidenceLedgerEngine) {}

  findContradictions(claims: readonly MetaClaim[]): Contradiction[] {
    const out: Contradiction[] = [];
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i]!, b = claims[j]!;
        if (!sameAxis(a,b)) continue;
        if (a.value === b.value) continue;
        if (a.status === "UNKNOWN" || b.status === "UNKNOWN") continue;
        const severity = Math.min(1, (a.confidence + b.confidence) / 2);
        const c: Contradiction = {
          id: `contradiction:${a.id}:${b.id}`,
          claimA: a.id,
          claimB: b.id,
          reason: `${a.subject}.${a.predicate} has incompatible values`,
          severity
        };
        out.push(c);
        this.ledger.append({
          streamId: "meta",
          type: "META_CONTRADICTION_DETECTED",
          epistemicStatus: "SUPPORTED",
          payload: c
        });
      }
    }
    return out;
  }

  deriveStatus(claim: MetaClaim, contradictions: readonly Contradiction[]): MetaClaim {
    const contradicted = contradictions.some((c) => c.claimA === claim.id || c.claimB === claim.id);
    return contradicted ? { ...claim, status: "CONTRADICTED" } : claim;
  }

  surprise(predicted: number, observed: number, scale = 1): number {
    const d = Math.abs(observed - predicted);
    return Math.min(1, d / Math.max(scale, 1e-9));
  }

  prioritizeGaps(gaps: readonly KnowledgeGap[]): KnowledgeGap[] {
    return [...gaps].sort((a,b) => {
      const sa = a.expectedInformationGain / Math.max(a.estimatedCost, 1e-9);
      const sb = b.expectedInformationGain / Math.max(b.estimatedCost, 1e-9);
      return sb - sa;
    });
  }

  recordObservation(payload: unknown): void {
    this.ledger.append({
      streamId: "meta",
      type: "META_OBSERVATION_RECORDED",
      epistemicStatus: "SUPPORTED",
      payload
    });
  }
}

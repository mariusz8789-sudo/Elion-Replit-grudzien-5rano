import type { EpistemicStatus } from "../common/types.js";

export interface MetaClaim {
  id: string;
  subject: string;
  predicate: string;
  value: string | number | boolean | null;
  status: EpistemicStatus;
  confidence: number;
  evidenceRefs: string[];
  rationale: string;
}

export interface Contradiction {
  id: string;
  claimA: string;
  claimB: string;
  reason: string;
  severity: number;
}

export interface KnowledgeGap {
  id: string;
  question: string;
  expectedInformationGain: number;
  estimatedCost: number;
}

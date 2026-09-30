import type { Contradiction } from '@genesis/core/knowledge/contradictionHunter.js';
import type { ObservationGapRequest } from '../agent/observationGap';
import type { KnowledgeGap } from '../metaCognition/scientificMetrics';
import type { MindKnowledgeItem } from './contracts';

/**
 * ENTITY-2 — one mapping from the three existing "we do not know this" shapes, and from the
 * contradiction hunter, into the input of the persistent registry (backend `knowledgeRegistry.mjs`).
 *
 * The detectors stay where they are and are not copied: `observationGap.ts` names the missing
 * measurement, `scientificMetrics.ts::KnowledgeGap` names two hypotheses left unseparated, the Mind's
 * `OPEN_QUESTION` items name open questions, `contradictionHunter` names disagreeing sources. This
 * adapter only translates. It never sets a status: a gap is opened OPEN and a contradiction is recorded
 * UNRESOLVED by the registry itself, and only evidence the backend can find closes either.
 */

export type KnowledgeGapSourceKind = 'OBSERVATION_GAP' | 'KNOWLEDGE_GAP' | 'OPEN_QUESTION' | 'SELF_MODEL';

export interface KnowledgeGapInput {
  readonly question: string;
  readonly source: { readonly kind: KnowledgeGapSourceKind; readonly ref: string | null };
  readonly relatedHypotheses: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly requiredCapability: string | null;
  readonly createdEvidenceRefs: readonly string[];
}

export interface ContradictionInput {
  readonly contradictionId: string;
  readonly type: 'NUMERIC_DISAGREEMENT' | 'POLARITY_CONFLICT' | 'STATUS_CONFLICT' | 'MODEL_OBSERVATION_DISAGREEMENT';
  readonly claimA: { readonly recordId: string; readonly source: string | null };
  readonly claimB: { readonly recordId: string; readonly source: string | null };
  readonly evidenceRefs: readonly string[];
  readonly reason: string;
}

export function gapFromObservationGap(request: ObservationGapRequest): KnowledgeGapInput {
  const { quantity, unit, instrumentClass } = request.requiredObservable;
  return {
    question: request.rationale,
    source: { kind: 'OBSERVATION_GAP', ref: request.id },
    relatedHypotheses: request.liveHypothesisIds,
    missingEvidence: [`${quantity} [${unit}] (instrument: ${instrumentClass})`],
    requiredCapability: null,
    createdEvidenceRefs: [],
  };
}

/** `ref` names where the pair was scored (a session or campaign id); the metric itself carries none. */
export function gapFromKnowledgeGap(gap: KnowledgeGap, ref: string): KnowledgeGapInput {
  return {
    question: gap.reason,
    source: { kind: 'KNOWLEDGE_GAP', ref: `${ref}#pair-${gap.hypothesisPairIndex}` },
    relatedHypotheses: [gap.hypothesisA, gap.hypothesisB],
    missingEvidence: [`An observation that separates "${gap.hypothesisA}" and "${gap.hypothesisB}" by at least 1σ (now ${gap.sigmaSeparation.toFixed(3)}σ).`],
    requiredCapability: null,
    createdEvidenceRefs: [],
  };
}

export function gapFromOpenQuestion(item: MindKnowledgeItem): KnowledgeGapInput {
  if (item.status !== 'OPEN_QUESTION') throw new Error(`gapFromOpenQuestion: item ${item.itemId} is ${item.status}, not OPEN_QUESTION`);
  return {
    question: item.claim,
    source: { kind: 'OPEN_QUESTION', ref: item.itemId },
    relatedHypotheses: [],
    missingEvidence: [],
    requiredCapability: null,
    createdEvidenceRefs: item.provenanceRefs,
  };
}

export function contradictionInput(contradiction: Contradiction): ContradictionInput {
  return {
    contradictionId: contradiction.contradictionId,
    type: contradiction.kind,
    claimA: { recordId: contradiction.recordIds[0], source: contradiction.sources[0] },
    claimB: { recordId: contradiction.recordIds[1], source: contradiction.sources[1] },
    evidenceRefs: [],
    reason: contradiction.reason,
  };
}

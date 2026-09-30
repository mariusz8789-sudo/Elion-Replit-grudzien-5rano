import { describe, expect, it } from 'vitest';
import type { Contradiction } from '@genesis/core/knowledge/contradictionHunter.js';
import type { ObservationGapRequest } from '../core/agent/observationGap';
import type { MindKnowledgeItem } from '../core/mind/contracts';
import { contradictionInput, gapFromKnowledgeGap, gapFromObservationGap, gapFromOpenQuestion } from '../core/mind/knowledgeRegistryAdapter';

/** ENTITY-2: the adapter translates existing gap and contradiction shapes; it never sets a status. */
describe('knowledge registry adapter', () => {
  it('maps an observation gap to a registry gap with its missing measurement', () => {
    const request = {
      id: 'ogap-1', rationale: 'No attached experiment separates H1 and H2.', liveHypothesisIds: ['H1', 'H2'],
      requiredObservable: { quantity: 'period', unit: 'd', instrumentClass: 'UNDECLARED' },
    } as unknown as ObservationGapRequest;
    const gap = gapFromObservationGap(request);
    expect(gap).toEqual({
      question: 'No attached experiment separates H1 and H2.', source: { kind: 'OBSERVATION_GAP', ref: 'ogap-1' },
      relatedHypotheses: ['H1', 'H2'], missingEvidence: ['period [d] (instrument: UNDECLARED)'], requiredCapability: null, createdEvidenceRefs: [],
    });
    expect(gap).not.toHaveProperty('status');
  });

  it('maps an unseparated hypothesis pair and an OPEN_QUESTION, and refuses anything that is not open', () => {
    const pair = gapFromKnowledgeGap({ hypothesisPairIndex: 0, hypothesisA: 'H1', hypothesisB: 'H2', sigmaSeparation: 0.4, reason: 'below 1σ' }, 'session-7');
    expect(pair.source).toEqual({ kind: 'KNOWLEDGE_GAP', ref: 'session-7#pair-0' });
    const item = { itemId: 'q1', status: 'OPEN_QUESTION', claim: 'Is the exponent universal?', provenanceRefs: ['ev-1'] } as unknown as MindKnowledgeItem;
    expect(gapFromOpenQuestion(item)).toMatchObject({ question: 'Is the exponent universal?', source: { kind: 'OPEN_QUESTION', ref: 'q1' }, createdEvidenceRefs: ['ev-1'] });
    expect(() => gapFromOpenQuestion({ ...item, status: 'SUPPORTED' } as unknown as MindKnowledgeItem)).toThrow(/not OPEN_QUESTION/);
  });

  it('carries both sides of a hunted contradiction without choosing one', () => {
    const c: Contradiction = {
      contradictionId: 'ctr-abc', kind: 'NUMERIC_DISAGREEMENT', recordIds: ['rec-a', 'rec-b'], sources: ['nasa.gov', 'wikipedia.org'],
      key: 'period', values: [1, 2], severity: 'HIGH', reason: 'period reported as 1 and 2', unresolved: true,
    };
    expect(contradictionInput(c)).toEqual({
      contradictionId: 'ctr-abc', type: 'NUMERIC_DISAGREEMENT', claimA: { recordId: 'rec-a', source: 'nasa.gov' }, claimB: { recordId: 'rec-b', source: 'wikipedia.org' },
      evidenceRefs: [], reason: 'period reported as 1 and 2',
    });
  });
});

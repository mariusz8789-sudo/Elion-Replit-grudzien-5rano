import { describe, expect, it } from 'vitest';
import {
  replayTemporalDiscoveryFlow,
  runTemporalDiscoveryFlow,
  saveTemporalDiscoveryFlowToMemory,
} from '../core/discovery/physics/temporalDiscoveryFlow';

const MISSION_QUESTION = 'Do the known equations of physics require or permit an additional degree of freedom / dimension that would coherently link the past, present, and future?';

describe('temporal discovery flow — the generic loop closed for spacetime research', () => {
  it('parses the mission question honestly: PHYSICS domain FOUND, pharmacology-specific fields UNKNOWN', () => {
    const result = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(result.structuredRequest.domain.status).toBe('FOUND');
    expect(result.structuredRequest.domain.values).toContain('PHYSICS');
    expect(result.structuredRequest.targets.status).toBe('UNKNOWN');
    expect(result.structuredRequest.mechanisms.status).toBe('UNKNOWN');
  });

  it('closes the loop: 5 hypotheses evaluated, 5 next actions produced, none fabricated', () => {
    const result = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(result.inquiry.evaluations).toHaveLength(5);
    expect(result.nextActions).toHaveLength(5);
    for (const action of result.nextActions) {
      expect(action.availability).not.toBe('RUNNABLE_IN_GENESIS');
    }
  });

  it('the epistemic summary names every required category from the mission (ESTABLISHED/DERIVED/SPECULATIVE/UNRESOLVED)', () => {
    const result = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(result.epistemicSummary).toMatch(/ESTABLISHED=/);
    expect(result.epistemicSummary).toMatch(/DERIVED=/);
    expect(result.epistemicSummary).toMatch(/SPECULATIVE=/);
    expect(result.epistemicSummary).toMatch(/UNRESOLVED=/);
    expect(result.epistemicSummary).toMatch(/CONTRADICTED=/);
  });

  it('never claims a fifth dimension or time travel exists, even at the flow level', () => {
    const result = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(result.inquiry.overallConclusion).toMatch(/asserts neither that a fifth dimension exists nor that time travel is possible/);
  });

  it('is deterministic: two runs of the same question produce the same inquiry fingerprint', () => {
    const a = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    const b = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(a.inquiry.resultFingerprint).toBe(b.inquiry.resultFingerprint);
  });
});

describe('temporal discovery flow — replay and memory', () => {
  it('replays MATCH against its own freshly recomputed result', () => {
    const saved = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    expect(replayTemporalDiscoveryFlow(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved structured request\'s DERIVED extraction has been tampered with', () => {
    // requestId is caller-supplied identity, not derived content, so tampering
    // it alone reproduces identically on replay — that is correct, not a bug.
    // What must trigger DRIFT is tampering with something parsing actually
    // derives from the raw text, e.g. the extracted domain.
    const saved = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    const tampered = { ...saved, structuredRequest: { ...saved.structuredRequest, domain: { ...saved.structuredRequest.domain, values: ['EPIDEMIOLOGY' as const] } } };
    expect(replayTemporalDiscoveryFlow(tampered).status).toBe('DRIFT');
  });

  it('replays DRIFT when the saved inquiry fingerprint has been tampered with', () => {
    const saved = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    const tampered = { ...saved, inquiry: { ...saved.inquiry, resultFingerprint: `${saved.inquiry.resultFingerprint}0` } };
    expect(replayTemporalDiscoveryFlow(tampered).status).toBe('DRIFT');
  });

  it('saves to memory keyed on requestId + inquiry fingerprint, distinct from the inquiry-level memory entry', () => {
    const result = runTemporalDiscoveryFlow(MISSION_QUESTION, 'req-temporal-1');
    const saved = saveTemporalDiscoveryFlowToMemory(result);
    expect(saved.experimentId).toContain('req-temporal-1');
    expect(saved.experimentId).toContain(result.inquiry.resultFingerprint);
    expect(saved.honestyNote).toMatch(/not a second discovery engine/);
  });
});
